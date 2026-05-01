-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "exclude_existing_chats" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "exclude_recent_chats" BOOLEAN NOT NULL DEFAULT false;
