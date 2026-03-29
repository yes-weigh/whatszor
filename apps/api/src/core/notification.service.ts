import { env } from '../env';
import { logger } from './logger';

const log = logger.child({ module: 'notification-service' });

export type AlertPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AlertContext {
    event: string;
    priority: AlertPriority;
    message: string;
    metadata?: Record<string, any>;
    timestamp: string;
}

class NotificationService {
    /**
     * Dispatches a critical system alert.
     * Always logs as FATAL.
     * Respects ALERT_WEBHOOK_URL if configured.
     */
    async notify(context: AlertContext): Promise<void> {
        const { event, priority, message, metadata, timestamp } = context;

        // 1. Mandatory Structured Log
        const logMethod = priority === 'CRITICAL' || priority === 'HIGH' ? 'fatal' : 'error';
        logger[logMethod]({
            alert: true,
            event,
            priority,
            metadata,
            timestamp,
        }, message);

        // 2. Optional Webhook (Discord/Slack/Generic)
        if (env.ALERT_WEBHOOK_URL) {
            try {
                const response = await fetch(env.ALERT_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: `Whatszor Alert [${env.NODE_ENV}]`,
                        content: `**[${priority}] ${event}**\n${message}\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\``,
                        embeds: [
                            {
                                title: event,
                                description: message,
                                color: this.getPriorityColor(priority),
                                fields: Object.entries(metadata || {}).map(([key, value]) => ({
                                    name: key,
                                    value: String(value),
                                    inline: true,
                                })),
                                footer: { text: `Service: ${env.SERVICE_NAME} | ${timestamp}` },
                            },
                        ],
                    }),
                });

                if (!response.ok) {
                    log.error({ status: response.status, statusText: response.statusText }, 'Failed to send alert webhook');
                }
            } catch (err) {
                log.error({ err }, 'Error sending alert webhook');
            }
        }
    }

    async notifyFatal(event: string, metadata?: Record<string, any>): Promise<void> {
        await this.notify({
            event,
            priority: 'CRITICAL',
            message: `FATAL ERROR: ${event}`,
            metadata,
            timestamp: new Date().toISOString(),
        });
    }

    private getPriorityColor(priority: AlertPriority): number {
        switch (priority) {
            case 'CRITICAL': return 0xFF0000; // Red
            case 'HIGH': return 0xFFA500;     // Orange
            case 'MEDIUM': return 0xFFFF00;   // Yellow
            case 'LOW': return 0x00FF00;      // Green
            default: return 0x808080;         // Gray
        }
    }
}

export const notificationService = new NotificationService();
