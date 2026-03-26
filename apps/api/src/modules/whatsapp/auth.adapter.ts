import {
    initAuthCreds,
    BufferJSON,
    AuthenticationState,
    SignalDataTypeMap,
} from '@itsukichan/baileys';
import { prisma } from '../../prisma/client';
import { Prisma } from '@prisma/client';

/**
 * A custom Baileys authentication state adapter backed by Prisma.
 * Each session (WhatsApp account) is isolated by its own `sessionId`,
 * allowing multiple accounts to be connected per workspace simultaneously.
 */
export async function usePrismaAuthState(
    sessionId: string,
    workspaceId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {

    // 1. Storage Helpers — keyed by sessionId + category

    const writeData = async (data: any, id: string) => {
        const jsonString = JSON.stringify(data, BufferJSON.replacer);
        const jsonObj = JSON.parse(jsonString);

        await prisma.whatsAppSession.upsert({
            where: {
                sessionId_category: {
                    sessionId,
                    category: id,
                },
            },
            create: {
                workspaceId,
                sessionId,
                category: id,
                data: jsonObj as Prisma.InputJsonValue,
            },
            update: {
                data: jsonObj as Prisma.InputJsonValue,
            },
        });
    };

    const readData = async (id: string) => {
        try {
            const session = await prisma.whatsAppSession.findUnique({
                where: {
                    sessionId_category: {
                        sessionId,
                        category: id,
                    },
                },
            });

            if (session && session.data) {
                return JSON.parse(JSON.stringify(session.data), BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error(`[Baileys Auth] Read Error (${id}):`, error);
            return null;
        }
    };

    const removeData = async (id: string) => {
        try {
            await prisma.whatsAppSession.delete({
                where: {
                    sessionId_category: {
                        sessionId,
                        category: id,
                    },
                },
            });
        } catch (error) {
            // Ignore if it doesn't exist
        }
    };

    // 2. Load or Initialize Credentials (creds)
    const credsData = await readData('creds');
    let creds = credsData || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
                    const data: { [id: string]: SignalDataTypeMap[T] } = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            const categoryId = `${String(type)}-${id}`;
                            let value = await readData(categoryId);
                            if (type === 'app-state-sync-key' && value) {
                                value = require('@itsukichan/baileys').proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data: any) => {
                    const tasks: Promise<void>[] = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const categoryId = `${String(category)}-${id}`;
                            if (value) {
                                tasks.push(writeData(value, categoryId));
                            } else {
                                tasks.push(removeData(categoryId));
                            }
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        },
    };
}

/**
 * Deletes all auth key rows for a given sessionId from the database.
 * Called when an account is deleted or logged out.
 */
export async function deleteSessionAuthData(sessionId: string): Promise<void> {
    await prisma.whatsAppSession.deleteMany({ where: { sessionId } });
}

/**
 * Partial auth reset for history re-sync after a flush.
 *
 * STRATEGY: Delete all Baileys signal/app-state/prekey rows, keeping only the
 * core `creds` row (the device identity keypair + registration info).
 * Also reset the history sync cursors inside the creds themselves.
 *
 * Result: WhatsApp treats the reconnect as a fresh device coming online and
 * re-delivers full chat history via messaging-history.set — without requiring
 * a new QR code scan, because the registered device identity is preserved.
 *
 * Call this BEFORE waManager.connect() when local DB history has been cleared.
 */
export async function resetSessionKeysForResync(sessionId: string): Promise<void> {
    // 1. Delete all signal/app-state/prekey rows for this session
    //    (everything except the 'creds' row which holds the device identity)
    await prisma.whatsAppSession.deleteMany({
        where: {
            sessionId,
            category: { not: 'creds' },
        },
    });

    // 2. Also reset the sync cursors inside the creds object itself
    const session = await prisma.whatsAppSession.findUnique({
        where: { sessionId_category: { sessionId, category: 'creds' } },
    });
    if (!session?.data) return;

    const creds = JSON.parse(JSON.stringify(session.data), BufferJSON.reviver) as any;

    // Reset all history-sync related fields to their "fresh device" defaults
    creds.lastAccountSyncTimestamp = 0;
    creds.myAppStateKeyId = null;
    creds.accountSyncCounter = 0;
    creds.processedHistoryMessages = [];
    creds.nextPreKeyId = 1;
    creds.firstUnuploadedPreKeyId = 1;

    const jsonString = JSON.stringify(creds, BufferJSON.replacer);
    const jsonObj = JSON.parse(jsonString);

    await prisma.whatsAppSession.update({
        where: { sessionId_category: { sessionId, category: 'creds' } },
        data: { data: jsonObj },
    });
}
