/*
  Warnings:

  - You are about to drop the column `extracted_data` on the `product_knowledge_sources` table. All the data in the column will be lost.
  - You are about to drop the column `field_confidence` on the `product_knowledge_sources` table. All the data in the column will be lost.

*/
-- DropIndex
ALTER TABLE "allowed_numbers" DROP CONSTRAINT "allowed_numbers_workspace_id_phone_number_key";

-- AlterTable
ALTER TABLE "product_knowledge" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "product_knowledge_sources" DROP COLUMN "extracted_data",
DROP COLUMN "field_confidence",
ADD COLUMN     "extractedData" JSONB,
ADD COLUMN     "fieldConfidence" JSONB;

-- AlterTable
ALTER TABLE "quick_replies" ADD COLUMN     "media_id" TEXT;

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_gallery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "product_knowledge_missing_fields_last_outreach_idx" RENAME TO "product_knowledge_missing_fields_count_last_outreach_at_idx";
