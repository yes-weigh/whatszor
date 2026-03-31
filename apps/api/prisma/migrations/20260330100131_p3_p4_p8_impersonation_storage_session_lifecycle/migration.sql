/*
  Warnings:

  - You are about to drop the column `is_knowledge_bot` on the `whatsapp_accounts` table. All the data in the column will be lost.
  - The `status` column on the `whatsapp_accounts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[client_message_id,workspace_id]` on the table `messages` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `workspace_id` to the `messages` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CONNECTING', 'QR_PENDING', 'CONNECTED', 'DISCONNECTED', 'ERROR', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "BotMode" AS ENUM ('INTERNAL', 'EXTERNAL', 'HYBRID');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "assigned_team_id" TEXT,
ADD COLUMN     "assigned_to_user_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_logs" ADD COLUMN     "actor_user_id" TEXT,
ADD COLUMN     "target_id" TEXT,
ADD COLUMN     "trace_id" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "client_message_id" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "media_id" TEXT,
ADD COLUMN     "sequence_number" SERIAL NOT NULL,
ADD COLUMN     "workspace_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "whatsapp_accounts" DROP COLUMN "is_knowledge_bot",
ADD COLUMN     "bot_mode" "BotMode",
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "label" TEXT,
ADD COLUMN     "last_active_at" TIMESTAMP(3),
ADD COLUMN     "previous_owner_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reauth_required_at" TIMESTAMP(3),
ADD COLUMN     "user_id" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "SessionStatus" NOT NULL DEFAULT 'CONNECTING';

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "storage_limit_bytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "storage_used_bytes" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "impersonation_logs" (
    "id" TEXT NOT NULL,
    "global_user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL DEFAULT 'OWNER',
    "token_jti" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "impersonation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "impersonation_logs_token_jti_key" ON "impersonation_logs"("token_jti");

-- CreateIndex
CREATE INDEX "impersonation_logs_global_user_id_idx" ON "impersonation_logs"("global_user_id");

-- CreateIndex
CREATE INDEX "impersonation_logs_workspace_id_idx" ON "impersonation_logs"("workspace_id");

-- CreateIndex
CREATE INDEX "impersonation_logs_token_jti_idx" ON "impersonation_logs"("token_jti");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_assigned_to_user_id_idx" ON "conversations"("workspace_id", "assigned_to_user_id");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_assigned_team_id_idx" ON "conversations"("workspace_id", "assigned_team_id");

-- CreateIndex
CREATE INDEX "event_logs_trace_id_idx" ON "event_logs"("trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_client_message_id_workspace_id_key" ON "messages"("client_message_id", "workspace_id");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_workspace_id_user_id_status_idx" ON "whatsapp_accounts"("workspace_id", "user_id", "status");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "whatsapp_accounts"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
