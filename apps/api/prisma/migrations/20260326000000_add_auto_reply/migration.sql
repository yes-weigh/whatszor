-- AlterTable
ALTER TABLE "quick_replies" ADD COLUMN "isAutoReply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quick_replies" ADD COLUMN "keyword" TEXT;
