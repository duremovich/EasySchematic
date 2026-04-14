-- Add source column to submissions so moderators can distinguish manual
-- single-device submissions from bulk imports (JSON/CSV). Null = legacy
-- or unspecified. Known values: 'manual', 'bulk-json', 'bulk-csv'.
ALTER TABLE submissions ADD COLUMN source TEXT;
