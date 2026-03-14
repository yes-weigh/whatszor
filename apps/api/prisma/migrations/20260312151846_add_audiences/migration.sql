-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "audience_id" TEXT;

-- CreateTable
CREATE TABLE "audiences" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contact_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_members" (
    "id" TEXT NOT NULL,
    "audience_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audience_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audiences_workspace_id_idx" ON "audiences"("workspace_id");

-- CreateIndex
CREATE INDEX "audience_members_contact_id_idx" ON "audience_members"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "audience_members_audience_id_contact_id_key" ON "audience_members"("audience_id", "contact_id");

-- CreateIndex
CREATE INDEX "campaign_members_contact_id_idx" ON "campaign_members"("contact_id");

-- AddForeignKey
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_members" ADD CONSTRAINT "audience_members_audience_id_fkey" FOREIGN KEY ("audience_id") REFERENCES "audiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_members" ADD CONSTRAINT "audience_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_audience_id_fkey" FOREIGN KEY ("audience_id") REFERENCES "audiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
