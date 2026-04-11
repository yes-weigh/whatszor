-- CreateEnum
CREATE TYPE "ContactProductSource" AS ENUM ('AI', 'MANUAL');

-- AlterTable
ALTER TABLE "contact_products" ADD COLUMN "source" "ContactProductSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "contact_products" ADD COLUMN "added_by_ai_at" TIMESTAMP(3);
