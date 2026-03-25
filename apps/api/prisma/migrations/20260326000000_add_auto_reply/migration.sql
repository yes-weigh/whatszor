-- AlterTable
ALTER TABLE "QuickReply" ADD COLUMN "isAutoReply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuickReply" ADD COLUMN "keyword" TEXT;
