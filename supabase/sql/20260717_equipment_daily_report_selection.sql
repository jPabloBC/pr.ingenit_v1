ALTER TABLE pr_management_equipment_daily
  ADD COLUMN IF NOT EXISTS include_in_daily_report boolean NOT NULL DEFAULT true;
