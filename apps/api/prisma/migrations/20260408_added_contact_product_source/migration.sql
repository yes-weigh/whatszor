-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "ContactProductSource" AS ENUM ('AI', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable contact_products (full definition, idempotent)
CREATE TABLE IF NOT EXISTS "contact_products" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'INTERESTED',
    "source" "ContactProductSource" NOT NULL DEFAULT 'MANUAL',
    "added_by_ai_at" TIMESTAMP(3),
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_products_pkey" PRIMARY KEY ("id")
);

-- AddColumns if table already existed without them (idempotent)
DO $$ BEGIN
  ALTER TABLE "contact_products" ADD COLUMN "source" "ContactProductSource" NOT NULL DEFAULT 'MANUAL';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "contact_products" ADD COLUMN "added_by_ai_at" TIMESTAMP(3);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contact_products_workspace_id_contact_id_product_id_relatio_key" ON "contact_products"("workspace_id", "contact_id", "product_id", "relationType");
CREATE INDEX IF NOT EXISTS "contact_products_workspace_id_contact_id_idx" ON "contact_products"("workspace_id", "contact_id");
CREATE INDEX IF NOT EXISTS "contact_products_product_id_idx" ON "contact_products"("product_id");

-- AddForeignKey
ALTER TABLE "contact_products" DROP CONSTRAINT IF EXISTS "contact_products_workspace_id_fkey";
ALTER TABLE "contact_products" ADD CONSTRAINT "contact_products_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_products" DROP CONSTRAINT IF EXISTS "contact_products_contact_id_fkey";
ALTER TABLE "contact_products" ADD CONSTRAINT "contact_products_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_products" DROP CONSTRAINT IF EXISTS "contact_products_product_id_fkey";
ALTER TABLE "contact_products" ADD CONSTRAINT "contact_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
