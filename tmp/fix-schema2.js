const fs = require('fs');

let c = fs.readFileSync('d:/whatszor/apps/api/prisma/schema.prisma', 'utf8');

c = c.replace(/model KeywordAutomation \{[\s\S]*?@@map\("keyword_automations"\)\r?\n\}\r?\n/, `model KeywordAutomation {
  id          String   @id @default(cuid())
  workspaceId String   @map("workspace_id")

  keyword     String
  matchType   MatchType @default(CONTAINS) @map("match_type")
  priority    Int       @default(0)
  replyText   String?   @map("reply_text")
  mediaId     String?   @map("media_id")
  templateId  String?   @map("template_id")
  intent      String?

  isActive    Boolean  @default(true) @map("is_active")
  cooldownSec Int      @default(30) @map("cooldown_sec")
  legacyId    String?  @unique @map("legacy_id")

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  media     Media?    @relation(fields: [mediaId], references: [id], onDelete: SetNull)
  template  Template? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  logs      AutomationLog[]

  @@index([workspaceId, isActive, priority])
  @@index([workspaceId, keyword])
  @@map("keyword_automations")
}
`);

c = c.replace(/model AutomationLog \{[\s\S]*?@@map\("automation_logs"\)\r?\n\}\r?\n/, `model AutomationLog {
  id           String   @id @default(cuid())
  workspaceId  String   @map("workspace_id")
  automationId String   @map("automation_id")

  keyword      String
  contactId    String?  @map("contact_id")
  messageId    String?  @map("message_id")
  matchType    String   @map("match_type")
  replyType    String?  @map("reply_type")
  priority     Int?     @default(0)
  executionTimeMs Int?  @map("execution_time_ms")

  triggeredAt  DateTime @default(now()) @map("triggered_at")

  workspace  Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  automation KeywordAutomation @relation(fields: [automationId], references: [id], onDelete: Cascade)

  @@index([workspaceId, triggeredAt])
  @@index([automationId])
  @@map("automation_logs")
}
`);

fs.writeFileSync('d:/whatszor/apps/api/prisma/schema.prisma', c);
