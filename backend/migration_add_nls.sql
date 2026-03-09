-- Adds NLS (No Longer Serviced) flag to parts table
ALTER TABLE tgp_parts ADD COLUMN IF NOT EXISTS is_nls BOOLEAN DEFAULT FALSE;
