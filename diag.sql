SELECT "waContactName", "providerId", "lastMessage", "lastMessageAt", "sessionId"
FROM conversations
WHERE "lastMessageAt" > NOW() - INTERVAL '3 hours'
ORDER BY "lastMessageAt" DESC
LIMIT 20;
