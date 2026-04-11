import {
    initAuthCreds,
    BufferJSON,
    AuthenticationState,
    SignalDataTypeMap,
} from '@itsukichan/baileys';
import { prisma } from '../../prisma/client';
import { Prisma } from '@prisma/client';
import { createLogger } from '../../core/logger';

// ── saveCreds debounce ────────────────────────────────────────────────────────
// Baileys fires creds.update on every heartbeat, handshake, and key exchange.
// Without debouncing, this creates 500–1,000+ upserts/min at 100 sessions.
// A 2-second window collapses those bursts into a single write per session.

const SAVE_CREDS_DEBOUNCE_MS = 2_000;
const pendingCredsSave = new Map<string, { timer: NodeJS.Timeout; saveFn: () => Promise<void> }>();
let isShuttingDownCreds = false;

export function setCredsShuttingDown(): void {
    isShuttingDownCreds = true;
}

export async function flushAllPendingCreds(): Promise<void> {
    setCredsShuttingDown();
    const tasks: Promise<void>[] = [];
    for (const [sessionId, { timer, saveFn }] of pendingCredsSave.entries()) {
        clearTimeout(timer);
        tasks.push(saveFn().catch(err => {
            createLogger({ module: 'whatsapp', action: 'auth-flush' })
                .error({ err, sessionId }, 'Debounced saveCreds flush failed');
        }));
    }
    pendingCredsSave.clear();
    await Promise.all(tasks);
}

function debouncedSaveCreds(sessionId: string, saveFn: () => Promise<void>): void {
    if (isShuttingDownCreds) {
        saveFn().catch(err => {
            createLogger({ module: 'whatsapp', action: 'auth-save-shutdown' })
                .error({ err, sessionId }, 'Synchronous saveCreds during shutdown failed');
        });
        return;
    }

    const existing = pendingCredsSave.get(sessionId);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
        pendingCredsSave.delete(sessionId);
        saveFn().catch(err => {
            createLogger({ module: 'whatsapp', action: 'auth-save' })
                .error({ err, sessionId }, 'Debounced saveCreds failed');
        });
    }, SAVE_CREDS_DEBOUNCE_MS);

    pendingCredsSave.set(sessionId, { timer, saveFn });
}
// ──────────────────────────────────────────────────────────────────────────────

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
            createLogger({ module: 'whatsapp', action: 'auth-read' }).error({ err: error }, `[Baileys Auth] Read Error (${id})`);
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
            // Debounced — collapses burst updates into a single DB write per 2s window.
            debouncedSaveCreds(sessionId, () => writeData(creds, 'creds'));
            return Promise.resolve();
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
 * Reset Baileys history-sync cursors in creds before a reconnect.
 *
 * Only touches the sync-timestamp fields inside the creds record —
 * signal keys, prekeys, and app-state keys are intentionally left intact
 * because deleting them breaks WhatsApp's encrypted session.
 *
 * The stale-socket guard in whatsapp.service.ts ensures the new socket
 * stays alive long enough to receive the messaging-history.set event.
 */
export async function resetSessionKeysForResync(sessionId: string): Promise<void> {
    const session = await prisma.whatsAppSession.findUnique({
        where: { sessionId_category: { sessionId, category: 'creds' } },
    });
    if (!session?.data) return;

    const creds = JSON.parse(JSON.stringify(session.data), BufferJSON.reviver) as any;

    // Reset sync cursors to "fresh device" values
    // WhatsApp reads these to decide how far back to send history
    creds.lastAccountSyncTimestamp = 0;
    creds.myAppStateKeyId = null;
    creds.accountSyncCounter = 0;

    const jsonString = JSON.stringify(creds, BufferJSON.replacer);
    const jsonObj = JSON.parse(jsonString);

    await prisma.whatsAppSession.update({
        where: { sessionId_category: { sessionId, category: 'creds' } },
        data: { data: jsonObj },
    });
}

