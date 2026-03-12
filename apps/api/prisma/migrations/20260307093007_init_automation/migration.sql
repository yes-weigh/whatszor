-- CreateEnum
CREATE TYPE "AutomationRuleStatus" AS ENUM ('ACTIVE', 'DRAFT', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger" JSONB NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "context" JSONB DEFAULT '{}',
    "resume_at" TIMESTAMP(3),
    "error_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_rules_workspace_id_status_idx" ON "automation_rules"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "automation_executions_rule_id_contact_id_status_idx" ON "automation_executions"("rule_id", "contact_id", "status");

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
