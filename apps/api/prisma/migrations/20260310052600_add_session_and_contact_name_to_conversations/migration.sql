-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "session_id" TEXT,
ADD COLUMN     "wa_contact_name" TEXT;

-- CreateIndex
CREATE INDEX "conversations_workspace_id_session_id_idx" ON "conversations"("workspace_id", "session_id");
