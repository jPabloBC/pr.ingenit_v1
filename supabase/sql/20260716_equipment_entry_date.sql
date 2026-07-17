ALTER TABLE pr_management_equipment_daily
  ADD COLUMN IF NOT EXISTS entry_date date;

ALTER TABLE pr_management_equipment_daily
  DROP CONSTRAINT IF EXISTS pr_management_equipment_daily_entry_before_return_check;

ALTER TABLE pr_management_equipment_daily
  ADD CONSTRAINT pr_management_equipment_daily_entry_before_return_check
  CHECK (entry_date IS NULL OR return_date IS NULL OR entry_date <= return_date);
