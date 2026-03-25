-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ProductStatus" AS ENUM ('INCOMPLETE', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "KnowledgeDataType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'PDF', 'AUDIO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "KnowledgeSourceStatus" AS ENUM ('APPLIED', 'DISCARDED', 'CONFLICT', 'FAILED_VALIDATION', 'ORPHANED', 'BLOCKED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_knowledge" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "category" TEXT,
    "specifications" JSONB DEFAULT '{}',
    "media_urls" TEXT[],
    "status" "ProductStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "missing_fields_count" INTEGER NOT NULL DEFAULT 0,
    "last_outreach_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_knowledge_sources" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "sender_user_id" TEXT,
    "message_id" TEXT,
    "data_type" "KnowledgeDataType" NOT NULL,
    "raw_content_url" TEXT,
    "raw_text" TEXT,
    "extracted_data" JSONB,
    "field_confidence" JSONB,
    "global_confidence" INTEGER,
    "status" "KnowledgeSourceStatus" NOT NULL DEFAULT 'CONFLICT',
    "is_trusted_source" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_knowledge_workspace_id_status_idx" ON "product_knowledge"("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "product_knowledge_missing_fields_last_outreach_idx" ON "product_knowledge"("missing_fields_count", "last_outreach_at");
CREATE UNIQUE INDEX IF NOT EXISTS "product_knowledge_sources_message_id_key" ON "product_knowledge_sources"("message_id");
CREATE INDEX IF NOT EXISTS "product_knowledge_sources_product_id_idx" ON "product_knowledge_sources"("product_id");

-- AddForeignKey
ALTER TABLE "product_knowledge" DROP CONSTRAINT IF EXISTS "product_knowledge_workspace_id_fkey";
ALTER TABLE "product_knowledge" ADD CONSTRAINT "product_knowledge_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_knowledge_sources" DROP CONSTRAINT IF EXISTS "product_knowledge_sources_product_id_fkey";
ALTER TABLE "product_knowledge_sources" ADD CONSTRAINT "product_knowledge_sources_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "product_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
