-- AlterTable
ALTER TABLE "campaign_members" ADD COLUMN     "template_version_id" TEXT;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "template_version_id" TEXT;

-- CreateTable
CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_gallery" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mime_type" TEXT,
    "size" INTEGER,
    "thumbnail_url" TEXT,
    "category" TEXT,
    "language" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "language" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_versions" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "message_text" TEXT NOT NULL,
    "footer_text" TEXT,
    "header_media_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_buttons" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "payload" TEXT,

    CONSTRAINT "template_buttons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_replies_workspace_id_idx" ON "quick_replies"("workspace_id");

-- CreateIndex
CREATE INDEX "media_gallery_workspace_id_type_idx" ON "media_gallery"("workspace_id", "type");

-- CreateIndex
CREATE INDEX "media_gallery_workspace_id_category_idx" ON "media_gallery"("workspace_id", "category");

-- CreateIndex
CREATE INDEX "templates_workspace_id_idx" ON "templates"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_versions_template_id_version_key" ON "template_versions"("template_id", "version");

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_gallery" ADD CONSTRAINT "media_gallery_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_header_media_id_fkey" FOREIGN KEY ("header_media_id") REFERENCES "media_gallery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_buttons" ADD CONSTRAINT "template_buttons_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
