-- Migration: add bin location columns
-- Run once in DBeaver against the Render PostgreSQL database

ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS dib_bins TEXT;
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS jor_bins TEXT;
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS dim_bins TEXT;
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS irs_bins TEXT;
