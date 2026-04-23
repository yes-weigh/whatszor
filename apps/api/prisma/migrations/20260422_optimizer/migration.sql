-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "types" TEXT[];

-- CreateTable
CREATE TABLE "lead_query_plans" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "plan_batch_id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "micro_area" TEXT,
    "micro_area_lat" DOUBLE PRECISION,
    "micro_area_lng" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pre_overlap_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_leads" INTEGER NOT NULL DEFAULT 0,
    "actual_leads" INTEGER NOT NULL DEFAULT 0,
    "actual_dupes" INTEGER NOT NULL DEFAULT 0,
    "kill_switch_fired" BOOLEAN NOT NULL DEFAULT false,
    "lead_list_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_query_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_performance_metrics" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "yield_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "query_performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_query_plans_workspace_id_plan_batch_id_idx" ON "lead_query_plans"("workspace_id", "plan_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "query_performance_metrics_workspace_id_city_keyword_key" ON "query_performance_metrics"("workspace_id", "city", "keyword");

-- CreateIndex
CREATE INDEX "leads_workspace_id_name_idx" ON "leads"("workspace_id", "name");

-- CreateIndex PostGIS Geo
CREATE INDEX IF NOT EXISTS "lead_geo_idx" ON "leads" USING GIST ((ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography));

-- AddForeignKey
ALTER TABLE "lead_query_plans" ADD CONSTRAINT "lead_query_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_performance_metrics" ADD CONSTRAINT "query_performance_metrics_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
