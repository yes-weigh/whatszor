-- CreateEnum
CREATE TYPE "LeadListStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('RAW', 'CONVERTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "lead_lists" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "name" TEXT,
    "status" "LeadListStatus" NOT NULL DEFAULT 'PENDING',
    "total_found" INTEGER NOT NULL DEFAULT 0,
    "with_phone" INTEGER NOT NULL DEFAULT 0,
    "converted" INTEGER NOT NULL DEFAULT 0,
    "job_id" TEXT,
    "processing_started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'google_places',
    "error_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "lead_list_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "has_phone" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "website" TEXT,
    "google_place_id" TEXT,
    "raw_data" JSONB,
    "status" "LeadStatus" NOT NULL DEFAULT 'RAW',
    "contact_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_lists_workspace_id_status_idx" ON "lead_lists"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "lead_lists_workspace_id_created_at_idx" ON "lead_lists"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_lead_list_id_google_place_id_key" ON "leads"("lead_list_id", "google_place_id");

-- CreateIndex
CREATE INDEX "leads_lead_list_id_status_idx" ON "leads"("lead_list_id", "status");

-- CreateIndex
CREATE INDEX "leads_lead_list_id_has_phone_idx" ON "leads"("lead_list_id", "has_phone");

-- CreateIndex
CREATE INDEX "leads_workspace_id_status_idx" ON "leads"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_lead_list_id_fkey" FOREIGN KEY ("lead_list_id") REFERENCES "lead_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
