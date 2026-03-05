-- Run this once in DBeaver to add the 6 date columns to your existing table
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS dib_last_received TEXT;
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS dib_last_issue     TEXT;
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS jor_last_received  TEXT;
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS jor_last_issue     TEXT;
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS dim_last_received  TEXT;
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS dim_last_issue     TEXT;

-- Remove old merged columns if they exist
ALTER TABLE tgp_parts DROP COLUMN IF EXISTS last_received_date;
ALTER TABLE tgp_parts DROP COLUMN IF EXISTS last_issue_date;
