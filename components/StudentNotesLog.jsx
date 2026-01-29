-- ============================================================
-- GradTrack: Structured Student Notes Migration
-- Run this in Supabase SQL Editor
-- Created: January 28, 2026
-- ============================================================

-- Step 1: Add new columns to student_notes table
-- ============================================================

ALTER TABLE student_notes
ADD COLUMN IF NOT EXISTS note_type TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS follow_up_date DATE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Add check constraint for valid note types
-- ============================================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_notes_note_type_check'
  ) THEN
    ALTER TABLE student_notes
    ADD CONSTRAINT student_notes_note_type_check
    CHECK (note_type IN (
      'meeting',
      'phone_call', 
      'email',
      'parent_contact',
      'intervention',
      'follow_up',
      'general'
    ));
  END IF;
END $$;

-- Step 3: Add check constraint for valid status values
-- ============================================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_notes_status_check'
  ) THEN
    ALTER TABLE student_notes
    ADD CONSTRAINT student_notes_status_check
    CHECK (status IN ('open', 'completed'));
  END IF;
END $$;

-- Step 4: Create index for faster queries on follow-up dates
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_student_notes_follow_up 
ON student_notes (counselor_id, follow_up_date) 
WHERE follow_up_date IS NOT NULL AND status = 'open';

-- Step 5: Create index for filtering by note type
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_student_notes_type 
ON student_notes (student_id, note_type, created_at DESC);

-- Step 6: Add trigger to auto-update updated_at timestamp
-- ============================================================

CREATE OR REPLACE FUNCTION update_student_notes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS student_notes_updated_at ON student_notes;

CREATE TRIGGER student_notes_updated_at
  BEFORE UPDATE ON student_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_student_notes_timestamp();

-- Step 7: Update existing notes to have default values
-- ============================================================

UPDATE student_notes
SET 
  note_type = 'general',
  status = 'completed',
  updated_at = created_at
WHERE note_type IS NULL;

-- ============================================================
-- Verification: Check the updated table structure
-- ============================================================

-- Run this to verify the migration:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'student_notes'
-- ORDER BY ordinal_position;

-- ============================================================
-- ROLLBACK (if needed):
-- ============================================================
-- ALTER TABLE student_notes DROP COLUMN IF EXISTS note_type;
-- ALTER TABLE student_notes DROP COLUMN IF EXISTS follow_up_date;
-- ALTER TABLE student_notes DROP COLUMN IF EXISTS status;
-- ALTER TABLE student_notes DROP COLUMN IF EXISTS updated_at;
-- DROP INDEX IF EXISTS idx_student_notes_follow_up;
-- DROP INDEX IF EXISTS idx_student_notes_type;
-- DROP TRIGGER IF EXISTS student_notes_updated_at ON student_notes;
-- DROP FUNCTION IF EXISTS update_student_notes_timestamp();
