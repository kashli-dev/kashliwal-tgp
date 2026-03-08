-- Migration: add trigram index for fast part number search
-- Run once in DBeaver / psql against your PostgreSQL database

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_tgp_parts_number_trgm ON tgp_parts USING gin(part_number gin_trgm_ops);
