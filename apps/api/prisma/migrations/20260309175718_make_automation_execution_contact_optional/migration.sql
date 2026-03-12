-- DropForeignKey
ALTER TABLE "automation_executions" DROP CONSTRAINT "automation_executions_contact_id_fkey";

-- AlterTable
ALTER TABLE "automation_executions" ALTER COLUMN "contact_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
