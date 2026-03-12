/**
 * realtime.route.ts — SSE endpoint for real-time inbox updates
 *
 * GET /api/v1/realtime/events
 *
 * Authenticated, workspace-scoped. Opens a long-lived SSE connection.
 * Events are pushed from queue workers via `emit()` in core/realtime.ts.
 *
 * SSE event format:
 *   data: {"type":"message.new","payload":{...}}\n\n
 *
 * Heartbeat (every 25s):
 *   :\n\n
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';
import { registerClient, unregisterClient } from '../../core/realtime';
import { logger } from '../../core/logger';

const log = logger.child({ module: 'realtime-route' });

export async function realtimeRoutes(fastify: FastifyInstance) {
    fastify.get(
        '/events',
        {
            config: { rateLimit: false },  // exempt from per-request rate limiting
            preHandler: [
                // EventSource API doesn't support custom headers — accept token via ?token= query param.
                // We move it to the Authorization header so the standard authenticate middleware works.
                async (request, _reply) => {
                    const qs = request.query as Record<string, string>;
                    if (qs.token && !request.headers.authorization) {
                        request.headers.authorization = `Bearer ${qs.token}`;
                    }
                },
                authenticate,
            ],
        },
        async (request, reply) => {
            const { workspaceId, sub: userId } = request.user;

            log.info({ workspaceId, userId }, 'SSE client connected');

            // ── SSE handshake ──────────────────────────────────────────────
            const currentHeaders = reply.getHeaders();
            reply.raw.writeHead(200, {
                ...(currentHeaders as any),
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',   // Disable nginx buffering
            });

            // Immediately flush an initial connected event so the client
            // knows the stream is live and can start listening.
            reply.raw.write(`data: ${JSON.stringify({ type: 'connected', payload: { workspaceId } })}\n\n`);

            // ── Register client ────────────────────────────────────────────
            registerClient(workspaceId, reply);

            // ── Heartbeat — every 25s to keep proxies / load balancers alive ──
            const heartbeatInterval = setInterval(() => {
                try {
                    reply.raw.write(':\n\n');
                } catch {
                    clearInterval(heartbeatInterval);
                }
            }, 25_000);

            // ── Cleanup on disconnect ──────────────────────────────────────
            request.raw.on('close', () => {
                clearInterval(heartbeatInterval);
                unregisterClient(workspaceId, reply);
                log.info({ workspaceId, userId }, 'SSE client disconnected');
            });

            // Prevent Fastify from auto-closing the response
            await new Promise<void>((resolve) => {
                request.raw.on('close', resolve);
            });
        }
    );
}
