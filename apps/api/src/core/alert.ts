/**
 * core/alert.ts — Centralized alerting utility
 *
 * Logs critical events at `fatal` level and optionally sends a webhook
 * payload if ALERT_WEBHOOK_URL is configured.
 *
 * Design:
 *  - Zero vendor lock-in (standard HTTP POST, generic JSON payload)
 *  - Never throws — alert failure must never crash the calling code
 *  - Works with Discord, Slack (via incoming webhooks), or generic HTTP endpoints
 */
import { createLogger } from './logger';
import { env } from '../env';
import crypto from 'node:crypto';

export type AlertLevel = 'info' | 'warn' | 'error' | 'fatal';

export interface AlertPayload {
    title: string;
    message: string;
    level: AlertLevel;
    context?: Record<string, unknown>;
}

const log = createLogger({ module: 'alert', action: 'dispatch' });

/**
 * Sends a structured alert.
 * Always logs at `fatal` severity. Sends a webhook only if ALERT_WEBHOOK_URL is set.
 */
export async function sendAlert(payload: AlertPayload): Promise<void> {
    const { title, message, level, context } = payload;
    const alertId = crypto.randomBytes(4).toString('hex');
    const timestamp = new Date().toISOString();

    // Always log with full structure
    log.fatal({ alertId, level, title, context, timestamp }, `ALERT: ${message}`);

    // Only send webhook if configured
    const webhookUrl = env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
        const body = JSON.stringify({
            alertId,
            level,
            title,
            message,
            timestamp,
            context,
            service: env.SERVICE_NAME,
            environment: env.NODE_ENV,
        });

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        if (!response.ok) {
            log.warn({ status: response.status, alertId }, 'Webhook response was not OK');
        } else {
            log.info({ alertId, webhookUrl: webhookUrl.substring(0, 40) + '...' }, 'Alert webhook dispatched');
        }
    } catch (err: any) {
        // Never let webhook failure propagate — log silently
        log.warn({ err: err.message, alertId }, 'Failed to dispatch alert webhook');
    }
}

/** Convenience: alert on Redis disconnection */
export async function alertRedisDisconnect(err?: unknown): Promise<void> {
    return sendAlert({
        title: 'Redis Disconnected',
        message: 'The Redis connection has been lost. Queue processing is halted.',
        level: 'fatal',
        context: { err: err instanceof Error ? err.message : String(err) },
    });
}

/** Convenience: alert on Worker crash */
export async function alertWorkerCrash(err: unknown): Promise<void> {
    return sendAlert({
        title: 'Worker Process Crash',
        message: 'An unhandled exception was caught in the Worker process.',
        level: 'fatal',
        context: { err: err instanceof Error ? err.message : String(err) },
    });
}

/** Convenience: alert on unexpected WhatsApp session drop */
export async function alertSessionDrop(sessionId: string, workspaceId: string): Promise<void> {
    return sendAlert({
        title: 'WhatsApp Session Dropped',
        message: `Session ${sessionId} disconnected unexpectedly and could not reconnect.`,
        level: 'error',
        context: { sessionId, workspaceId },
    });
}

/** Convenience: alert when a queue backlog crosses warning threshold */
export async function alertQueueBacklog(queueName: string, waitingCount: number): Promise<void> {
    return sendAlert({
        title: 'Queue Backlog Alert',
        message: `Queue "${queueName}" has ${waitingCount} waiting jobs — exceeding threshold.`,
        level: 'warn',
        context: { queueName, waitingCount },
    });
}
