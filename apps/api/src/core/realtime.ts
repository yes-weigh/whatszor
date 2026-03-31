/**
 * realtime.ts — Server-Sent Events registry with per-user filtering
 *
 * Architecture:
 *   connections = Map<workspaceId, Map<userId, Set<FastifyReply>>>
 *
 * - emitToWorkspace(workspaceId, ...)  → broadcasts to ALL users in a workspace.
 * - emitToUser(workspaceId, userId, ...) → sends ONLY to the target user (e.g. QR relay).
 *
 * The nested Map ensures all filtering is done server-side
 * without relying on the frontend to discard irrelevant events.
 */

import type { FastifyReply } from 'fastify';
import { createLogger } from './logger';

const log = createLogger({ module: 'realtime' });

// Map<workspaceId, Map<userId, Set<reply>>>
const connections = new Map<string, Map<string, Set<FastifyReply>>>();

/** Register a new SSE client connection. */
export function registerClient(workspaceId: string, userId: string, reply: FastifyReply): void {
    if (!connections.has(workspaceId)) {
        connections.set(workspaceId, new Map());
    }
    const byUser = connections.get(workspaceId)!;
    if (!byUser.has(userId)) {
        byUser.set(userId, new Set());
    }
    byUser.get(userId)!.add(reply);
    log.debug({ workspaceId, userId, total: byUser.get(userId)!.size }, 'SSE client registered');
}

/** Remove an SSE client connection (call on socket close). */
export function unregisterClient(workspaceId: string, userId: string, reply: FastifyReply): void {
    const byUser = connections.get(workspaceId);
    if (!byUser) return;
    const set = byUser.get(userId);
    if (!set) return;
    set.delete(reply);
    if (set.size === 0) byUser.delete(userId);
    if (byUser.size === 0) connections.delete(workspaceId);
    log.debug({ workspaceId, userId }, 'SSE client unregistered');
}

/**
 * Broadcast an event to ALL connected users in a workspace.
 * Use for events that are relevant workspace-wide (e.g. message.new, contact.updated).
 */
export function emitToWorkspace(workspaceId: string, type: string, payload: Record<string, unknown>): void {
    const byUser = connections.get(workspaceId);
    if (!byUser || byUser.size === 0) return;

    const frame = `data: ${JSON.stringify({ type, payload })}\n\n`;
    for (const [userId, replies] of byUser) {
        for (const reply of replies) {
            try {
                reply.raw.write(frame);
            } catch (err) {
                log.warn({ workspaceId, userId, err }, 'SSE write failed — removing stale client');
                replies.delete(reply);
            }
        }
    }

    log.debug({ workspaceId, type, users: byUser.size }, 'SSE workspace broadcast emitted');
}

/**
 * Send an event to a SPECIFIC user within a workspace.
 * Use for directed events like QR relay (only the session owner should receive the QR).
 */
export function emitToUser(
    workspaceId: string,
    userId: string,
    type: string,
    payload: Record<string, unknown>,
): void {
    const byUser = connections.get(workspaceId);
    if (!byUser) return;
    const replies = byUser.get(userId);
    if (!replies || replies.size === 0) return;

    const frame = `data: ${JSON.stringify({ type, payload })}\n\n`;
    for (const reply of replies) {
        try {
            reply.raw.write(frame);
        } catch (err) {
            log.warn({ workspaceId, userId, err }, 'SSE write to user failed — removing stale client');
            replies.delete(reply);
        }
    }

    log.debug({ workspaceId, userId, type }, 'SSE user-directed event emitted');
}

/**
 * @deprecated Use emitToWorkspace for workspace-broadcast events.
 * Kept for backwards compatibility with existing callers that use emit().
 */
export function emit(workspaceId: string, type: string, payload: Record<string, unknown>): void {
    return emitToWorkspace(workspaceId, type, payload);
}

/** Send a heartbeat comment frame to all clients of a workspace. */
export function heartbeat(workspaceId: string): void {
    const byUser = connections.get(workspaceId);
    if (!byUser) return;
    for (const [, replies] of byUser) {
        for (const reply of replies) {
            try {
                reply.raw.write(':\n\n');
            } catch {
                replies.delete(reply);
            }
        }
    }
}

/** Broadcast a heartbeat to ALL connected workspaces. */
export function broadcastHeartbeat(): void {
    for (const workspaceId of connections.keys()) {
        heartbeat(workspaceId);
    }
}

/** Return total number of active SSE connections across all workspaces. */
export function getConnectionCount(): number {
    let total = 0;
    for (const byUser of connections.values()) {
        for (const replies of byUser.values()) {
            total += replies.size;
        }
    }
    return total;
}
