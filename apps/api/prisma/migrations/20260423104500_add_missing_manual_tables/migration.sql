-- CreateEnum
CREATE TYPE "ContactProductSource" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "DlqStatus" AS ENUM ('PENDING_REVIEW', 'REPLAYED', 'DISCARDED');

-- CreateTable
CREATE TABLE "contact_products" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'INTERESTED',
    "source" "ContactProductSource" NOT NULL DEFAULT 'MANUAL',
    "added_by_ai_at" TIMESTAMP(3),
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_access" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "job_id" TEXT NOT NULL,
    "queue_name" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fail_reason" TEXT NOT NULL,
    "stack_trace" TEXT,
    "failed_at" TIMESTAMP(3) NOT NULL,
    "attempts_made" INTEGER NOT NULL,
    "status" "DlqStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "replayed_at" TIMESTAMP(3),
    "replayed_job_id" TEXT,
    "replayed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_products_workspace_id_contact_id_idx" ON "contact_products"("workspace_id", "contact_id");

-- CreateIndex
CREATE INDEX "contact_products_product_id_idx" ON "contact_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_products_workspace_id_contact_id_product_id_relatio_key" ON "contact_products"("workspace_id", "contact_id", "product_id", "relationType");

-- CreateIndex
CREATE INDEX "account_access_user_id_idx" ON "account_access"("user_id");

-- CreateIndex
CREATE INDEX "account_access_workspace_id_user_id_idx" ON "account_access"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_access_session_id_user_id_key" ON "account_access"("session_id", "user_id");

-- CreateIndex
CREATE INDEX "dead_letter_jobs_workspace_id_status_idx" ON "dead_letter_jobs"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "dead_letter_jobs_queue_name_status_idx" ON "dead_letter_jobs"("queue_name", "status");

-- CreateIndex
CREATE INDEX "dead_letter_jobs_failed_at_idx" ON "dead_letter_jobs"("failed_at");

-- AddForeignKey
ALTER TABLE "contact_products" ADD CONSTRAINT "contact_products_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_products" ADD CONSTRAINT "contact_products_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_products" ADD CONSTRAINT "contact_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_access" ADD CONSTRAINT "account_access_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_access" ADD CONSTRAINT "account_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_access" ADD CONSTRAINT "account_access_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "whatsapp_accounts"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_jobs" ADD CONSTRAINT "dead_letter_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

