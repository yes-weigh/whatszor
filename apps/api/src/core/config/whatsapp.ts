export const WhatsAppConfig = {
  limits: {
    maxSentPerSessionPerMinute: Number(process.env.WA_MAX_SENT_PER_SESSION_MIN || 50),
    maxSentPerUserPerMinute: Number(process.env.WA_MAX_SENT_PER_USER_MIN || 200),
  },
  queue: {
    maxRetries: Number(process.env.WA_QA_MAX_RETRIES || 3),
    backoffStrategy: 'exponential' as const,
    backoffBaseMs: Number(process.env.WA_QA_BACKOFF_BASE_MS || 1000),
  }
};
