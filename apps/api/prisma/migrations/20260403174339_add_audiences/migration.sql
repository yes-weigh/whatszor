/*
  Warnings:

  - You are about to drop the column `send_mode` on the `campaigns` table. All the data in the column will be lost.
  - The `match_type` column on the `keyword_automations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[legacy_id]` on the table `keyword_automations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('EXACT', 'CONTAINS', 'REGEX', 'AI_INTENT');

-- DropIndex
DROP INDEX "keyword_automations_workspace_id_is_active_idx";

-- AlterTable
ALTER TABLE "automation_logs" ADD COLUMN     "execution_time_ms" INTEGER,
ADD COLUMN     "priority" INTEGER DEFAULT 0,
ADD COLUMN     "reply_type" TEXT;

-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "send_mode",
ADD COLUMN     "audience_id" TEXT;

-- AlterTable
ALTER TABLE "keyword_automations" ADD COLUMN     "legacy_id" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "template_id" TEXT,
ALTER COLUMN "match_type" TYPE "MatchType" USING UPPER("match_type"::text)::"MatchType",
ALTER COLUMN "match_type" SET DEFAULT 'CONTAINS',
ALTER COLUMN "reply_text" DROP NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "audiences" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "lead_list_id" TEXT,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_members" (
    "id" TEXT NOT NULL,
    "audience_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audience_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audiences_workspace_id_idx" ON "audiences"("workspace_id");

-- CreateIndex
CREATE INDEX "audiences_workspace_id_source_type_idx" ON "audiences"("workspace_id", "source_type");

-- CreateIndex
CREATE INDEX "audience_members_audience_id_idx" ON "audience_members"("audience_id");

-- CreateIndex
CREATE INDEX "audience_members_contact_id_idx" ON "audience_members"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "audience_members_audience_id_contact_id_key" ON "audience_members"("audience_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_automations_legacy_id_key" ON "keyword_automations"("legacy_id");

-- CreateIndex
CREATE INDEX "keyword_automations_workspace_id_is_active_priority_idx" ON "keyword_automations"("workspace_id", "is_active", "priority");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_audience_id_fkey" FOREIGN KEY ("audience_id") REFERENCES "audiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_automations" ADD CONSTRAINT "keyword_automations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_lead_list_id_fkey" FOREIGN KEY ("lead_list_id") REFERENCES "lead_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_members" ADD CONSTRAINT "audience_members_audience_id_fkey" FOREIGN KEY ("audience_id") REFERENCES "audiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_members" ADD CONSTRAINT "audience_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
