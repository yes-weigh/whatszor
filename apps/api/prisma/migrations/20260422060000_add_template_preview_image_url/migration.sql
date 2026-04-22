-- AlterTable: Add preview_image_url to templates table
-- This column was added to the Prisma schema but the migration was missing,
-- causing 500 errors on all template GET/POST endpoints in production.
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "preview_image_url" TEXT;
