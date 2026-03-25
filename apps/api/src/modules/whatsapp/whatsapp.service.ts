import makeWASocket, { DisconnectReason, Browsers } from '@itsukichan/baileys';
import { Boom } from '@hapi/boom';
import { wrapSocket } from 'baileys-antiban';
import { usePrismaAuthState, deleteSessionAuthData } from './auth.adapter';
import { logger } from '../../core/logger';
import { EventEmitter } from 'events';
import { prisma } from '../../prisma/client';
import { ANTIBAN_CONFIG, loadWarmUpState, registerWrappedSocket, persistWarmUpState, removeAntiBan } from '../../core/antiban';

const log = logger.child({ module: 'whatsapp-manager' });

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

    constructor() {
        super();
    }

    /**
     * Boot all sessions for a workspace that are in the database.
     */
    async restoreWorkspaceSessions(workspaceId: string): Promise<void> {
        const accounts = await prisma.whatsAppAccount.findMany({
            where: { workspaceId },
        });
        for (const account of accounts) {
            if (!this.sockets.has(account.sessionId)) {
                log.info({ sessionId: account.sessionId, name: account.name }, 'Restoring session...');
                this.connect(account.sessionId, workspaceId).catch(() => {/*ignore*/ });
            }
        }
    }

    /**
     * Boot ALL sessions globally that were previously created.
     * Starts all accounts except those explicitly DISCONNECTED.
     */
    async restoreAllSessions(): Promise<void> {
        const accounts = await prisma.whatsAppAccount.findMany({
            where: { status: { not: 'DISCONNECTED' } },
        });
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
                    log.warn({ sessionId, error }, 'Connection closed — reconnecting in 5s');
                    await prisma.whatsAppAccount.updateMany({
                        where: { sessionId },
                        data: { status: 'DISCONNECTED' },
                    });
                    setTimeout(() => this.connect(sessionId, workspaceId), 5000);
                } else {
                    log.warn({ sessionId }, 'Session logged out.');
                    await prisma.whatsAppAccount.updateMany({
                        where: { sessionId },
                        data: { status: 'DISCONNECTED', phoneNumber: null },
                    });
                    this.emit('loggedOut', { sessionId, workspaceId });
                }
            } else if (connection === 'open') {
                log.info({ sessionId }, 'Connection opened successfully!');
                this.qrCodes.delete(sessionId);

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
            const name: string = contact.notify || contact.name || '';
            if (!jid || jid.endsWith('@g.us')) continue;
            // Store the real JID → name
            if (name) store.set(jid, { jid, name });
            // If this real JID has a LID, also store LID → real JID mapping
            if (lid && jid.endsWith('@s.whatsapp.net')) {
                store.set(lid, { jid, name });
            }
        }
    }

    getQrCode(sessionId: string): string | undefined {
        return this.qrCodes.get(sessionId);
    }

    /**
     * Returns all accounts for a workspace with live socket status merged in.
     */
    async getSessions(workspaceId: string): Promise<Array<{
        id: string;
        sessionId: string;
        name: string;
        phoneNumber: string | null;
        status: string;
        qrCode?: string;
        isKnowledgeBot: boolean;
    }>> {
        const accounts = await prisma.whatsAppAccount.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'asc' },
        });

        return accounts.map(account => {
            const isSocketAlive = this.sockets.has(account.sessionId);
            const qrCode = this.qrCodes.get(account.sessionId);

            let liveStatus = account.status;
            if (isSocketAlive && qrCode) liveStatus = 'NEEDS_SCAN';
            else if (isSocketAlive && account.status === 'CONNECTED') liveStatus = 'CONNECTED';
            else if (isSocketAlive) liveStatus = 'CONNECTING';

            return {
                id: account.id,
                sessionId: account.sessionId,
                name: account.name,
                phoneNumber: account.phoneNumber,
                status: liveStatus,
                qrCode: qrCode || undefined,
                isKnowledgeBot: account.isKnowledgeBot,
            };
        });
    }

    /**
     * Get global connection statistics
     */
    getGlobalStats() {
        return {
            totalSockets: this.sockets.size,
            totalSafeSockets: this.safeSockets.size,
            qrCodesPending: this.qrCodes.size,
        };
    }
}

export const waManager = new WhatsAppManager();
