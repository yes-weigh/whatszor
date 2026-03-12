SELECT id, "providerId", "lastMessage", "lastMessageAt", "waContactName"
FROM conversations 
WHERE "providerId" LIKE '%917907853171%' OR "providerId" LIKE '%918089059824%';
