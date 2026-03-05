-- Run this once to set up the database schema on Render PostgreSQL

CREATE TABLE IF NOT EXISTS tgp_parts (
    part_number             TEXT PRIMARY KEY,
    description             TEXT,
    mrp                     NUMERIC(12,2),
    discount_code           TEXT,
    dibrugarh               TEXT,
    jorhat                  TEXT,
    dimapur                 TEXT,
    alternate_parts         TEXT,
    dimapur_irs             TEXT,
    is_irs                  TEXT,
    alt_availability        TEXT,
    tr_dibrugarh            TEXT,
    tr_jorhat               TEXT,
    tr_dimapur              TEXT,
    dib_last_received       TEXT,
    dib_last_issue          TEXT,
    jor_last_received       TEXT,
    jor_last_issue          TEXT,
    dim_last_received       TEXT,
    dim_last_issue          TEXT
);

CREATE TABLE IF NOT EXISTS tgp_meta (
    id              SERIAL PRIMARY KEY,
    refreshed_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tgp_parts_number ON tgp_parts (part_number);
CREATE INDEX IF NOT EXISTS idx_tgp_parts_desc ON tgp_parts USING gin(to_tsvector('english', coalesce(description,'')));
