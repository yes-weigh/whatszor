/*
  Warnings:

  - A unique constraint covering the columns `[session_id,category]` on the table `whatsapp_sessions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `session_id` to the `whatsapp_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "whatsapp_sessions_workspace_id_category_key";

-- AlterTable
ALTER TABLE "automation_executions" ADD COLUMN     "current_node_id" TEXT,
ADD COLUMN     "trigger_event" JSONB,
ADD COLUMN     "workspace_id" TEXT;

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "event_type" TEXT,
ADD COLUMN     "flow_definition" JSONB,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "whatsapp_sessions" ADD COLUMN     "session_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_execution_logs" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER NOT NULL,

    CONSTRAINT "node_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "flow_definition" JSONB NOT NULL,
    "required_variables" JSONB NOT NULL DEFAULT '[]',
    "is_built_in" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "source_module" TEXT NOT NULL,
    "payload_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_session_id_key" ON "whatsapp_accounts"("session_id");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_workspace_id_idx" ON "whatsapp_accounts"("workspace_id");

-- CreateIndex
CREATE INDEX "node_execution_logs_execution_id_idx" ON "node_execution_logs"("execution_id");

-- CreateIndex
CREATE INDEX "automation_templates_category_idx" ON "automation_templates"("category");

-- CreateIndex
CREATE INDEX "event_logs_workspace_id_created_at_idx" ON "event_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "event_logs_workspace_id_event_type_idx" ON "event_logs"("workspace_id", "event_type");

-- CreateIndex
CREATE INDEX "whatsapp_sessions_session_id_idx" ON "whatsapp_sessions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_session_id_category_key" ON "whatsapp_sessions"("session_id", "category");

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_execution_logs" ADD CONSTRAINT "node_execution_logs_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
