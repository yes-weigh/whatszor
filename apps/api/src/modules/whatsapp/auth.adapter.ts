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
