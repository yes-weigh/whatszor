-- CreateTable
CREATE TABLE "allowed_numbers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowed_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "allowed_numbers_workspace_id_phone_number_idx" ON "allowed_numbers"("workspace_id", "phone_number");

-- AddForeignKey
ALTER TABLE "allowed_numbers" ADD CONSTRAINT "allowed_numbers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint
ALTER TABLE "allowed_numbers" ADD CONSTRAINT "allowed_numbers_workspace_id_phone_number_key" UNIQUE ("workspace_id", "phone_number");
