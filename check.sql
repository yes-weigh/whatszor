SELECT COUNT(*) AS total_conversations FROM conversations;
SELECT COUNT(*) AS null_session_convs FROM conversations WHERE "sessionId" IS NULL;
SELECT DISTINCT "sessionId" AS conv_session_id FROM conversations LIMIT 3;
SELECT "sessionId" AS acct_session_id, status FROM whatsapp_accounts;
