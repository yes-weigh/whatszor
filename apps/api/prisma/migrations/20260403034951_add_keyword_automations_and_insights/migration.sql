-- =============================================================
-- Fully idempotent migration for keyword automation tables
-- Safe to re-run even if partially applied in a previous attempt
-- =============================================================

-- 1. keyword_automations
CREATE TABLE IF NOT EXISTS "keyword_automations" (
    "id"            TEXT NOT NULL,
    "workspace_id"  TEXT NOT NULL,
    "keyword"       TEXT NOT NULL,
    "match_type"    TEXT NOT NULL DEFAULT 'contains',
    "reply_text"    TEXT NOT NULL,
    "media_id"      TEXT,
    "intent"        TEXT,
    "is_active"     BOOLEAN NOT NULL DEFAULT true,
    "cooldown_sec"  INTEGER NOT NULL DEFAULT 30,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "keyword_automations_pkey" PRIMARY KEY ("id")
);

-- 2. automation_logs
CREATE TABLE IF NOT EXISTS "automation_logs" (
    "id"             TEXT NOT NULL,
    "workspace_id"   TEXT NOT NULL,
    "automation_id"  TEXT NOT NULL,
    "keyword"        TEXT NOT NULL,
    "contact_id"     TEXT,
    "message_id"     TEXT,
    "match_type"     TEXT NOT NULL,
    "triggered_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

-- 3. automation_insights
CREATE TABLE IF NOT EXISTS "automation_insights" (
    "id"               TEXT NOT NULL,
    "workspace_id"     TEXT NOT NULL,
    "keyword"          TEXT NOT NULL,
    "intent"           TEXT NOT NULL,
    "frequency"        INTEGER NOT NULL,
    "suggested_reply"  TEXT NOT NULL,
    "example_messages" JSONB NOT NULL DEFAULT '[]',
    "status"           TEXT NOT NULL DEFAULT 'pending',
    "scanned_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at"      TIMESTAMP(3),
    CONSTRAINT "automation_insights_pkey" PRIMARY KEY ("id")
);

-- 4. All foreign keys and indexes — wrapped in DO blocks for idempotency

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'keyword_automations_workspace_id_fkey') THEN
    ALTER TABLE "keyword_automations"
      ADD CONSTRAINT "keyword_automations_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'keyword_automations_media_id_fkey') THEN
    ALTER TABLE "keyword_automations"
      ADD CONSTRAINT "keyword_automations_media_id_fkey"
      FOREIGN KEY ("media_id") REFERENCES "media_gallery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_logs_workspace_id_fkey') THEN
    ALTER TABLE "automation_logs"
      ADD CONSTRAINT "automation_logs_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_logs_automation_id_fkey') THEN
    ALTER TABLE "automation_logs"
      ADD CONSTRAINT "automation_logs_automation_id_fkey"
      FOREIGN KEY ("automation_id") REFERENCES "keyword_automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_insights_workspace_id_fkey') THEN
    ALTER TABLE "automation_insights"
      ADD CONSTRAINT "automation_insights_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Unique index
CREATE UNIQUE INDEX IF NOT EXISTS "automation_insights_workspace_id_keyword_status_key"
  ON "automation_insights"("workspace_id", "keyword", "status");

-- Regular indexes
CREATE INDEX IF NOT EXISTS "keyword_automations_workspace_id_is_active_idx"
  ON "keyword_automations"("workspace_id", "is_active");

CREATE INDEX IF NOT EXISTS "keyword_automations_workspace_id_keyword_idx"
  ON "keyword_automations"("workspace_id", "keyword");

CREATE INDEX IF NOT EXISTS "automation_logs_workspace_id_triggered_at_idx"
  ON "automation_logs"("workspace_id", "triggered_at");

CREATE INDEX IF NOT EXISTS "automation_logs_automation_id_idx"
  ON "automation_logs"("automation_id");

CREATE INDEX IF NOT EXISTS "automation_insights_workspace_id_status_idx"
  ON "automation_insights"("workspace_id", "status");

CREATE INDEX IF NOT EXISTS "automation_insights_workspace_id_scanned_at_idx"
  ON "automation_insights"("workspace_id", "scanned_at");

-- 5. campaigns: add columns only if not already present
ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "message_text"        TEXT,
  ADD COLUMN IF NOT EXISTS "send_mode"           TEXT NOT NULL DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS "expected_reply_rate" DOUBLE PRECISION;
