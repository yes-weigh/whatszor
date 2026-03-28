-- Add template_id column to quick_replies table
-- If an auto-reply has a templateId set, the worker sends that template instead of text/media

ALTER TABLE "quick_replies" ADD COLUMN "template_id" TEXT;

ALTER TABLE "quick_replies"
  ADD CONSTRAINT "quick_replies_template_id_fkey"
  FOREIGN KEY ("template_id")
  REFERENCES "templates"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
