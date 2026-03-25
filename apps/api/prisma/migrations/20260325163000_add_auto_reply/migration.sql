-- AddColumn
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "is_auto_reply" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn
ALTER TABLE "quick_replies" ADD COLUMN IF NOT EXISTS "keyword" TEXT;
