/*
  Warnings:

  - You are about to drop the column `audience_id` on the `campaigns` table. All the data in the column will be lost.
  - You are about to drop the `audience_members` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `audiences` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "audience_members" DROP CONSTRAINT "audience_members_audience_id_fkey";

-- DropForeignKey
ALTER TABLE "audience_members" DROP CONSTRAINT "audience_members_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "audiences" DROP CONSTRAINT "audiences_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_audience_id_fkey";

-- DropIndex
DROP INDEX "campaign_members_contact_id_idx";

-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "audience_id";

-- DropTable
DROP TABLE "audience_members";

-- DropTable
DROP TABLE "audiences";
