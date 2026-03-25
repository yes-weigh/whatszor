DO $$ 
BEGIN
    -- Drop constraint if exists (which drops the index)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'allowed_numbers_workspace_id_phone_number_key' 
        AND table_name = 'allowed_numbers'
    ) THEN
        ALTER TABLE "allowed_numbers" DROP CONSTRAINT "allowed_numbers_workspace_id_phone_number_key";
    END IF;

    -- Alter column updated_at
    ALTER TABLE "product_knowledge" ALTER COLUMN "updated_at" DROP DEFAULT;

    -- Handle product_knowledge_sources columns
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_knowledge_sources' AND column_name = 'extracted_data'
    ) THEN
        ALTER TABLE "product_knowledge_sources" 
        DROP COLUMN "extracted_data",
        DROP COLUMN "field_confidence";
    END IF;
    
    -- We can't use ADD COLUMN IF NOT EXISTS inside DO block if we want to support older Postgres easily, but PG15 supports it inside DO. 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_knowledge_sources' AND column_name = 'extractedData'
    ) THEN
        ALTER TABLE "product_knowledge_sources" ADD COLUMN "extractedData" JSONB;
        ALTER TABLE "product_knowledge_sources" ADD COLUMN "fieldConfidence" JSONB;
    END IF;

    -- Quick replies media_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_replies' AND column_name = 'media_id'
    ) THEN
        ALTER TABLE "quick_replies" ADD COLUMN "media_id" TEXT;
    END IF;

    -- Foreign key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'quick_replies_media_id_fkey'
    ) THEN
        ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_gallery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Rename index if exists
    IF EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'product_knowledge_missing_fields_last_outreach_idx'
    ) THEN
        ALTER INDEX "product_knowledge_missing_fields_last_outreach_idx" RENAME TO "product_knowledge_missing_fields_count_last_outreach_at_idx";
    END IF;

END $$;
