import makeWASocket, { DisconnectReason, Browsers } from '@itsukichan/baileys';
import { Boom } from '@hapi/boom';
import { wrapSocket } from 'baileys-antiban';
import { usePrismaAuthState, deleteSessionAuthData, flushAllPendingCreds } from './auth.adapter';
import { createLogger } from '../../core/logger';
import { alertSessionDrop } from '../../core/alert';
import { EventEmitter } from 'events';
import { prisma } from '../../prisma/client';
import { ANTIBAN_CONFIG, loadWarmUpState, registerWrappedSocket, persistWarmUpState, removeAntiBan, getAntibanStats } from '../../core/antiban';
import { notificationService } from '../../core/notification.service';
import { WhatsAppAccountRepository } from '../../core/database/repositories/WhatsAppAccountRepository';

const log = createLogger({ module: 'whatsapp-manager' });

/**
 * Singleton manager for multiple Baileys sockets.
 * Sockets are keyed by sessionId (WhatsAppAccount.sessionId),
 * allowing multiple phones to be online simultaneously per workspace.
 */
class WhatsAppManager extends EventEmitter {
    // Map<sessionId, raw socket> — for internal Baileys event wiring
    private sockets: Map<string, ReturnType<typeof makeWASocket>> = new Map();
    // Map<sessionId, wrapped safe socket> — for all outbound sendMessage() calls
    private safeSockets: Map<string, ReturnType<typeof wrapSocket>> = new Map();
    // Map<sessionId, qrString>
    private qrCodes: Map<string, string> = new Map();
    // Map<sessionId, Map<lid, { jid: string; name: string }>> — LID to real phone JID mapping
    private contactsStore: Map<string, Map<string, { jid: string; name: string }>> = new Map();
    // Map<sessionId, reconnectAttempts> — tracks consecutive failures for exponential backoff
    private reconnectAttempts: Map<string, number> = new Map();

    constructor() {
        super();
    }

    /**
     * Boot all sessions for a workspace that are in the database.
     * Uses repository to enforce deletedAt: null — soft-deleted accounts are NEVER reconnected.
     */
    async restoreWorkspaceSessions(workspaceId: string): Promise<void> {
        const accounts = await WhatsAppAccountRepository.getWorkspaceSessionsForBoot(workspaceId);
        for (const account of accounts) {
            if (!this.sockets.has(account.sessionId)) {
                log.info({ sessionId: account.sessionId, name: account.name }, 'Restoring session...');
                this.connect(account.sessionId, workspaceId).catch(() => {/*ignore*/ });
            }
        }
    }

    /**
     * Boot ALL active sessions globally on server startup.
     * Uses repository to enforce deletedAt: null — soft-deleted accounts are NEVER reconnected.
     */
    async restoreAllSessions(): Promise<void> {
        const accounts = await WhatsAppAccountRepository.getActiveSessionsForBoot();
        for (const account of accounts) {
            if (!this.sockets.has(account.sessionId)) {
                log.info({ sessionId: account.sessionId, name: account.name }, 'Restoring global session...');
                this.connect(account.sessionId, account.workspaceId).catch((err) => {
                    log.error({ err, sessionId: account.sessionId }, 'Failed to restore global session');
                });
            }
        }
    }

    /**
     * Initialize a Baileys socket for a specific sessionId.
     */
    async connect(sessionId: string, workspaceId: string): Promise<void> {
        if (this.sockets.has(sessionId)) {
            log.info({ sessionId }, 'Socket already connected or connecting.');
            return;
        }

        log.info({ sessionId }, 'Initializing Baileys connection...');

        // Update DB status to CONNECTING
        await prisma.whatsAppAccount.updateMany({
            where: { sessionId },
            data: { status: 'CONNECTING' },
        });

        const { state, saveCreds } = await usePrismaAuthState(sessionId, workspaceId);

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.macOS('Desktop'),
            // Silence Baileys' internal logger — it floods the console with
            // trace/debug noise. Only real errors should surface.
            logger: log.child({ socket: sessionId }, { level: 'silent' }) as any,
            // Required to trigger messaging-history.set and process history chunks
            syncFullHistory: true,
            // getMessage is called by Baileys during history processing to check
            // if a quoted/replied-to message exists. Return undefined is fine.
            getMessage: async () => undefined,
            // Don't mark the device as online — avoids notifying all contacts
            markOnlineOnConnect: false,
        });

        this.sockets.set(sessionId, sock);

        // Wrap the raw socket with anti-ban middleware.
        // wrapSocket() creates its own AntiBan instance internally using the config + warm-up state.
        // All sendMessage() calls through safeSock will automatically apply:
        //   • Gaussian jitter delay (1.5–5s)
        //   • Per-minute / per-hour / per-day rate limiting
        //   • Typing simulation (proportional to message length)
        //   • New-chat penalty (extra delay for first-ever message to a recipient)
        //   • Health monitoring (disconnects, failed sends → risk score)
        const savedWarmUpState = await loadWarmUpState(sessionId);
        const safeSock = wrapSocket(sock as any, ANTIBAN_CONFIG, savedWarmUpState);
        
        // --- PATCH FOR baileys-antiban CONCURRENCY & WARM-UP BUG ---
        const warmUp = (safeSock.antiban as any)?.warmUp as any;
        if (warmUp) {
            // Fix 1: Ensure `startedAt` accurately tracks active days rather than idle connection time.
            // If they haven't sent any messages yet, we keep `startedAt` rolling to NOW so the day stays 0.
            const originalGetCurrentDay = warmUp.getCurrentDay.bind(warmUp);
            warmUp.getCurrentDay = function() {
                if (this.state.dailyCounts.length === 0) {
                    this.state.startedAt = Date.now();
                    return 0;
                }
                return originalGetCurrentDay();
            };

            // Fix 2: Prevent concurrent bypass of limits.
            // canSend() in AntiBan evaluates synchronously for all concurrent queue jobs BEFORE
            // the delayed rate-limiting block, causing N concurrent requests to easily bypass the daily limit.
            // We optimistically increment `dailyCounts` immediately to reserve the slot!
            const originalCanSend = warmUp.canSend.bind(warmUp);
            warmUp.canSend = function() {
                const allowed = originalCanSend();
                if (allowed) {
                    if (this.state.graduated) {
                        return true;
                    }

                    const day = this.getCurrentDay();
                    while (this.state.dailyCounts.length <= day) {
                        this.state.dailyCounts.push(0);
                    }
                    this.state.dailyCounts[day]++; // Optimistically reserve!

                    // Check graduation (transferred from original record method)
                    if (day >= this.config.warmUpDays) {
                        this.state.graduated = true;
                    }
                }
                return allowed;
            };

            // Fix 3: Since we optimistically reserve the count above, we shouldn't double-increment in record()
            warmUp.record = function() {
                this.state.lastActiveAt = Date.now();
            };
        }
        // -------------------------------------------------------------

        this.safeSockets.set(sessionId, safeSock);
        registerWrappedSocket(sessionId, safeSock);
        log.info({ sessionId, hasWarmUpState: !!savedWarmUpState }, 'AntiBan safe socket created');

        sock.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.qrCodes.set(sessionId, qr);
                // Don't print the QR — frontend shows it via polling
                this.emit('qr', { sessionId, workspaceId, qr });
            }

            if (connection === 'close') {
                const error = (lastDisconnect?.error as Boom)?.output?.statusCode;

                // Guard against stale close events from replaced sockets.
                // Sequence during resync: disconnect() removes old sock from map →
                // connect() stores new sock → old sock's async close event fires here.
                // Without this guard, the old sock's close event deletes the new sock!
                if (this.sockets.get(sessionId) !== sock) {
                    log.warn({ sessionId, error }, 'Stale close event for replaced socket — ignoring.');
                    return;
                }

                log.warn({ sessionId, error }, 'Connection closed');

                // Notify AntiBan health monitor about the disconnect
                const antibanInstance = this.safeSockets.get(sessionId)?.antiban;
                if (antibanInstance) {
                    antibanInstance.onDisconnect(error);
                }

                // Persist warm-up progress before removing the socket
                await persistWarmUpState(sessionId);

                this.sockets.delete(sessionId);
                this.safeSockets.delete(sessionId);
                this.qrCodes.delete(sessionId);

                const shouldReconnect = error !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    await prisma.whatsAppAccount.updateMany({
                        where: { sessionId },
                        data: { status: 'DISCONNECTED' },
                    });

                    // Exponential backoff: 5s → 10s → 20s → 40s … capped at 5 minutes.
                    // 405 errors indicate WhatsApp is actively rejecting us (IP block /
                    // rate-limit / outdated client). Back off harder in that case.
                    const attempts = (this.reconnectAttempts.get(sessionId) ?? 0) + 1;
                    this.reconnectAttempts.set(sessionId, attempts);

                    const baseDelay = error === 405 ? 30_000 : 5_000; // 30s base for 405
                    const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), 300_000); // cap 5 min

                    log.warn(
                        { sessionId, error, attempt: attempts, delayMs: delay },
                        `Connection closed — reconnecting in ${Math.round(delay / 1000)}s`
                    );

                    setTimeout(() => this.connect(sessionId, workspaceId).catch(err => {
                        log.error({ sessionId, err }, 'Reconnect attempt failed');
                    }), delay);
                } else {
                    log.warn({ sessionId }, 'Session logged out.');
                    // CRITICAL: Notify about primary account logout
                    await Promise.all([
                        notificationService.notify({
                            event: 'WHATSAPP_SESSION_LOGOUT',
                            priority: 'CRITICAL',
                            message: `WhatsApp session logged out: ${sessionId}`,
                            metadata: { sessionId, workspaceId },
                            timestamp: new Date().toISOString(),
                        }),
                        alertSessionDrop(sessionId, workspaceId),
                    ]);
                    
                    await prisma.whatsAppAccount.updateMany({
                        where: { sessionId },
                        data: { status: 'DISCONNECTED', phoneNumber: null },
                    });
                    this.emit('loggedOut', { sessionId, workspaceId });
                }

            } else if (connection === 'open') {
                log.info({ sessionId }, 'Connection opened successfully!');
                this.qrCodes.delete(sessionId);
                // Reset backoff counter on successful connection
                this.reconnectAttempts.delete(sessionId);

                // Extract phone number from creds
                const creds = (sock.authState as any)?.creds?.me;
                const phoneBase = creds?.id?.split('@')[0]?.split(':')[0];
                const phoneNumber = phoneBase?.replace(/[^0-9]/g, '') || null;
                const name = creds?.name || null;

                await prisma.whatsAppAccount.updateMany({
                    where: { sessionId },
                    data: {
                        status: 'CONNECTED',
                        phoneNumber: phoneNumber ? `+${phoneNumber}` : null,
                        reauthRequiredAt: null, // Clear reauth flag — session is live again
                        ...(name ? {} : {}), // name is set by user during creation
                    },
                });

                this.emit('connected', { sessionId, workspaceId });

                // Notify AntiBan health monitor about successful reconnect
                const antibanOnOpen = this.safeSockets.get(sessionId)?.antiban;
                if (antibanOnOpen) {
                    antibanOnOpen.onReconnect();
                }

                // After 120s, request a contact-name refresh (contacts.upsert fires early,
                // but history sync may create new conversations after it; this catches stragglers)
                setTimeout(() => {
                    this.emit('refresh-contacts', { sessionId, workspaceId, sock });
                }, 120_000);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m: any) => {
            log.debug({ sessionId, count: m.messages.length }, 'Received message batch');
            


            this.emit('messages', { sessionId, workspaceId, messages: m.messages });
        });

        // Receipts: tracks when outbound messages are DELIVERED, READ, or PLAYED
        sock.ev.on('message-receipt.update', async (updates: any[]) => {
            log.debug({ sessionId, count: updates.length }, 'Receipts received');
            this.emit('receipt', { sessionId, workspaceId, updates });
        });

        // History sync: WhatsApp pushes all past chats/messages when session connects
        sock.ev.on('messaging-history.set', async (history: any) => {
            const { chats = [], messages = [], contacts = [] } = history;
            log.debug({ sessionId, chats: chats.length, messages: messages.length }, 'History chunk received');
            


            // Store contacts in our LID→JID map
            if (contacts.length > 0) this.storeContacts(sessionId, contacts);
            this.emit('history', { sessionId, workspaceId, chats, messages, contacts });
        });

        // Contacts sync: updates WhatsApp contact names from the device's address book
        sock.ev.on('contacts.upsert', async (contacts: any[]) => {
            if (contacts.length > 0) {
                log.debug({ sessionId, count: contacts.length }, 'Contacts upserted');
                


                // Store in our LID→JID map for the refresh-contacts endpoint
                this.storeContacts(sessionId, contacts);
                this.emit('contacts', { sessionId, workspaceId, contacts });
            }
        });

        // Contacts update: incremental updates pushed by WhatsApp, including when an
        // unsaved number messages you and WhatsApp resolves their LID asynchronously.
        sock.ev.on('contacts.update', async (updates: any[]) => {
            if (updates.length > 0) {
                log.debug({ sessionId, count: updates.length }, 'Contacts updated');
                


                this.storeContacts(sessionId, updates);
                // Also re-emit so the contacts-sync worker can backfill waContactName
                this.emit('contacts', { sessionId, workspaceId, contacts: updates });
            }
        });
    }

    /**
     * Disconnect and remove a session's socket.
     */
    async disconnect(sessionId: string, logout: boolean = true): Promise<void> {
        const sock = this.sockets.get(sessionId);
        if (sock) {
            if (logout) {
                sock.logout('User intentional disconnect');
            } else {
                sock.end(undefined);
            }
            this.sockets.delete(sessionId);
        }
        await persistWarmUpState(sessionId);
        this.safeSockets.delete(sessionId);
        this.qrCodes.delete(sessionId);
        await prisma.whatsAppAccount.updateMany({
            where: { sessionId },
            data: { status: 'DISCONNECTED' },
        });
    }

    /**
     * Fully delete an account — disconnect, wipe auth keys, delete DB record.
     */
    async deleteAccount(sessionId: string): Promise<void> {
        await this.disconnect(sessionId);
        removeAntiBan(sessionId);
        await deleteSessionAuthData(sessionId);
        await prisma.whatsAppAccount.deleteMany({ where: { sessionId } });
    }

    /**
     * Graceful shutdown of all connections.
     */
    async closeAll() {
        await flushAllPendingCreds();
        
        for (const sessionId of this.sockets.keys()) {
            await persistWarmUpState(sessionId);
        }
        for (const [sessionId, sock] of this.sockets.entries()) {
            sock.end(undefined);
            this.sockets.delete(sessionId);
        }
        this.safeSockets.clear();
    }

    /** Returns the raw Baileys socket (for internal event wiring only). */
    getSocket(sessionId: string): any {
        return this.sockets.get(sessionId);
    }

    /**
     * Request a full history re-sync from WhatsApp for an already-connected session.
     *
     * Calls sock.resyncAppState() which signals to WhatsApp that the local app-state
     * is out of sync. WA responds by re-delivering the full chat list + history
     * via messaging-history.set events — no QR scan or reconnect needed.
     *
     * Returns true if the resync request was sent, false if session is not connected.
     */
    async requestHistorySync(sessionId: string): Promise<boolean> {
        const sock = this.sockets.get(sessionId) as any;
        if (!sock) return false;

        try {
            // resyncAppState triggers WhatsApp to re-deliver the full chat list + history
            await sock.resyncAppState(['critical_block', 'critical_unblock_to_primary'], true);
            log.info({ sessionId }, 'History resync requested via resyncAppState');
            return true;
        } catch (err) {
            log.warn({ sessionId, err }, 'resyncAppState failed — trying cleanDirtyBits fallback');
            try {
                await sock.cleanDirtyBits('account_sync', 0);
                log.info({ sessionId }, 'cleanDirtyBits(account_sync) called as fallback');
                return true;
            } catch (err2) {
                log.error({ sessionId, err: err2 }, 'History resync failed');
                return false;
            }
        }
    }

    /**
     * Returns the anti-ban wrapped safe socket for sending messages.
     * All outbound sendMessage() calls MUST use this instead of getSocket().
     */
    getSafeSocket(sessionId: string): any {
        return this.safeSockets.get(sessionId);
    }

    /** Returns the LID → real JID mapping for a session */
    getContactsStore(sessionId: string): Map<string, { jid: string; name: string }> {
        return this.contactsStore.get(sessionId) ?? new Map();
    }

    /** Store contacts from a contacts.upsert or history sync event */
    storeContacts(sessionId: string, contacts: any[]): void {
        let store = this.contactsStore.get(sessionId);
        if (!store) {
            store = new Map();
            this.contactsStore.set(sessionId, store);
        }
        for (const contact of contacts) {
            const jid: string = contact.id;
            const lid: string | undefined = contact.lid;
            const phoneNumber: string | undefined = contact.phoneNumber;
            // Baileys also exposes remoteJidAlt in some contact events — same phone but alt addressing
            const remoteJidAlt: string | undefined = contact.remoteJidAlt ?? (contact.key as any)?.remoteJidAlt;
            const name: string = contact.notify || contact.name || '';
            if (!jid || jid.endsWith('@g.us')) continue;
            // Store the real JID → name
            if (name) store.set(jid, { jid, name });
            // If this real JID has a LID, also store LID → real JID mapping
            if (lid && jid.endsWith('@s.whatsapp.net')) {
                store.set(lid, { jid, name });
            }
            // If there's a remoteJidAlt (WA Business hidden-number accounts), store that mapping too
            if (remoteJidAlt && remoteJidAlt.endsWith('@s.whatsapp.net')) {
                // The lid (or jid) itself keys to the alt real JID
                if (jid.endsWith('@lid')) store.set(jid, { jid: remoteJidAlt, name });
                if (lid) store.set(lid, { jid: remoteJidAlt, name });
            }
            // If there's a phoneNumber property mapping the LID to a phone number
            if (phoneNumber && phoneNumber.endsWith('@s.whatsapp.net')) {
                if (jid.endsWith('@lid')) store.set(jid, { jid: phoneNumber, name });
                if (lid) store.set(lid, { jid: phoneNumber, name });
            }
        }
    }

    getQrCode(sessionId: string): string | undefined {
        return this.qrCodes.get(sessionId);
    }

    /**
     * Returns all accounts for a workspace with live socket status merged in.
     */
    async getSessions(ctx: import('../../core/database/types').UserContext): Promise<Array<{
        id: string;
        sessionId: string;
        name: string;
        phoneNumber: string | null;
        status: string;
        qrCode?: string;
        isKnowledgeBot: boolean;
        userId: string | null;
        assignedUser: { name: string; email: string } | null;
    }>> {
        // Include the assigned user relation so we can show assignment in the UI
        const accounts = await prisma.whatsAppAccount.findMany({
            where: {
                workspaceId: ctx.workspaceId,
                deletedAt: null,
                // MEMBERs only see their own sessions
                ...(ctx.role === 'MEMBER' ? { userId: ctx.userId } : {}),
            },
            include: {
                user: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return accounts.map(account => {
            const isSocketAlive = this.sockets.has(account.sessionId);
            const qrCode = this.qrCodes.get(account.sessionId);

            let liveStatus = account.status;
            if (isSocketAlive && qrCode) liveStatus = 'QR_PENDING';
            else if (isSocketAlive && account.status === 'CONNECTED') liveStatus = 'CONNECTED';
            else if (isSocketAlive) liveStatus = 'CONNECTING';

            return {
                id: account.id,
                sessionId: account.sessionId,
                name: account.name,
                phoneNumber: account.phoneNumber,
                status: liveStatus,
                qrCode: qrCode || undefined,
                isKnowledgeBot: !!account.botMode,
                userId: account.userId ?? null,
                assignedUser: (account as any).user ?? null,
                antibanStats: isSocketAlive ? getAntibanStats(account.sessionId) : null,
            };
        });
    }

    /**
     * Get global connection statistics
     */
    /**
     * Helper for load tests to inject a dummy socket that "succeeds" instantly.
     * Prevents "Baileys socket not connected" errors without needing a real QR scan.
     */
    setupMockSession(sessionId: string) {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('setupMockSession allowed only in test environment');
        }
        
        const mockSafeSock = {
            sendMessage: async (jid: string, _content: any, _options?: any) => {
                // Simulate success
                return { key: { id: 'mock-' + Date.now(), remoteJid: jid, fromMe: true } };
            },
            logout: async () => {},
            end: (_err: any) => {},
            ev: { on: () => {}, off: () => {}, emit: () => {} },
            authState: { creds: { me: { id: '12345' } } },
            // Add a barebones antiban instance cast to any
            antiban: {
                onDisconnect: () => {},
                onReconnect: () => {},
                rateLimiter: {} as any,
                warmUp: {} as any,
                health: {} as any,
                logging: {} as any,
            } as any
        };

        this.safeSockets.set(sessionId, mockSafeSock as any);
        log.info({ sessionId }, '[MOCK] Safe socket injected for load testing');
    }
}

export const waManager = new WhatsAppManager();
