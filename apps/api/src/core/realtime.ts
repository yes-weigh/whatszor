/**
 * realtime.ts — Server-Sent Events registry
 *
 * Provides a singleton SSE connection map keyed by workspaceId and an
 * `emit()` helper that writes events to all connected clients for a workspace.
 *
 * Architecture:
 *   - In-process Map — works for single-process deployments (the current setup).
 *   - If horizontal scaling is ever needed, swap the Map for a Redis pub/sub
 *     subscriber that fan-outs to local connections.
 *
 * Usage:
 *   // Fastify SSE route
 *   registerClient(workspaceId, reply);
 *   req.socket.on('close', () => unregisterClient(workspaceId, reply));
 *
 *   // From any worker / service
 *   emit(workspaceId, 'message.new', { conversationId, message });
 */

import type { FastifyReply } from 'fastify';
import { logger } from './logger';

const log = logger.child({ module: 'realtime' });

// Map<workspaceId, Set<reply>> — all open SSE connections for each workspace
const connections = new Map<string, Set<FastifyReply>>();

/** Register a new SSE client connection. */
export function registerClient(workspaceId: string, reply: FastifyReply): void {
    if (!connections.has(workspaceId)) {
        connections.set(workspaceId, new Set());
    }
    connections.get(workspaceId)!.add(reply);
    log.debug({ workspaceId, total: connections.get(workspaceId)!.size }, 'SSE client registered');
}

/** Remove an SSE client connection (call on socket close). */
export function unregisterClient(workspaceId: string, reply: FastifyReply): void {
    const set = connections.get(workspaceId);
    if (!set) return;
    set.delete(reply);
    if (set.size === 0) connections.delete(workspaceId);
    log.debug({ workspaceId, remaining: set.size }, 'SSE client unregistered');
}

/** Emit an SSE event to all connected clients of a workspace. */
export function emit(workspaceId: string, type: string, payload: Record<string, unknown>): void {
    const clients = connections.get(workspaceId);
    if (!clients || clients.size === 0) return;

    const frame = `data: ${JSON.stringify({ type, payload })}\n\n`;

    for (const reply of clients) {
        try {
            reply.raw.write(frame);
        } catch (err) {
            // Client disconnected without triggering close — clean up
            log.warn({ workspaceId, err }, 'SSE write failed — removing stale client');
            clients.delete(reply);
        }
    }

    log.debug({ workspaceId, type, clients: clients.size }, 'SSE event emitted');
}

/** Send a heartbeat comment frame to all clients of a workspace (keeps proxies alive). */
export function heartbeat(workspaceId: string): void {
    const clients = connections.get(workspaceId);
    if (!clients || clients.size === 0) return;
    for (const reply of clients) {
        try {
            reply.raw.write(':\n\n');
        } catch {
            clients.delete(reply);
        }
    }
}

/** Broadcast a heartbeat to ALL connected workspaces (called by global interval). */
export function broadcastHeartbeat(): void {
    for (const workspaceId of connections.keys()) {
        heartbeat(workspaceId);
    }
}

/** Return total number of active SSE connections (for observability). */
export function getConnectionCount(): number {
    let total = 0;
    for (const set of connections.values()) total += set.size;
    return total;
}
