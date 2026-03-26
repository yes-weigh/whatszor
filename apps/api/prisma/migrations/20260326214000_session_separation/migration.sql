-- DropIndex
DROP INDEX "conversations_workspace_id_provider_provider_id_key";

-- DropIndex
DROP INDEX "allowed_numbers_workspace_id_phone_number_idx";

-- CreateIndex
CREATE UNIQUE INDEX "conversations_workspace_id_provider_provider_id_session_id_key" ON "conversations"("workspace_id", "provider", "provider_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "allowed_numbers_workspace_id_phone_number_key" ON "allowed_numbers"("workspace_id", "phone_number");

