CREATE TABLE IF NOT EXISTS pr_management_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES pr_companies(id) ON DELETE CASCADE,
  identity_key text NOT NULL,
  equipment_kind text NOT NULL CHECK (equipment_kind IN ('MAYOR', 'MENOR')),
  equipment_name text NOT NULL,
  patent text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, identity_key)
);

CREATE TABLE IF NOT EXISTS pr_management_equipment_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES pr_management_equipment(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  exit_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NULL,
  updated_by text NULL,
  CHECK (exit_date IS NULL OR entry_date <= exit_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS pr_management_equipment_periods_one_open_idx
  ON pr_management_equipment_periods (equipment_id)
  WHERE exit_date IS NULL;

CREATE INDEX IF NOT EXISTS pr_management_equipment_periods_equipment_dates_idx
  ON pr_management_equipment_periods (equipment_id, entry_date DESC);

ALTER TABLE pr_management_equipment_daily
  ADD COLUMN IF NOT EXISTS equipment_id uuid NULL REFERENCES pr_management_equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pr_management_equipment_daily_equipment_id_idx
  ON pr_management_equipment_daily (equipment_id);
