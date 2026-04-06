-- Physical dimension fields for device templates
ALTER TABLE templates ADD COLUMN height_mm REAL;
ALTER TABLE templates ADD COLUMN width_mm REAL;
ALTER TABLE templates ADD COLUMN depth_mm REAL;
ALTER TABLE templates ADD COLUMN weight_kg REAL;
