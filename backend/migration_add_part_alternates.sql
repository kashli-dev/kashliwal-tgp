-- Creates the part_alternates table for normalised bidirectional alternate relationships.
-- Run ONCE on the Neon database BEFORE deploying the updated backend.
-- After running this, execute tgp_refresh.py to populate it.

CREATE TABLE IF NOT EXISTS part_alternates (
    part_number     TEXT NOT NULL REFERENCES tgp_parts(part_number) ON DELETE CASCADE,
    alt_part_number TEXT NOT NULL,
    PRIMARY KEY (part_number, alt_part_number)
);

CREATE INDEX IF NOT EXISTS idx_part_alternates_part    ON part_alternates (part_number);
CREATE INDEX IF NOT EXISTS idx_part_alternates_alt     ON part_alternates (alt_part_number);
