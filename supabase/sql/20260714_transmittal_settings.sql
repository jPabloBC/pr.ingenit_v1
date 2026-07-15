CREATE TABLE IF NOT EXISTS pr_transmittal_settings (
  company_id uuid PRIMARY KEY REFERENCES pr_companies(id) ON DELETE CASCADE,
  project_name text NOT NULL DEFAULT '',
  contract_number text NOT NULL DEFAULT '',
  next_register_number integer NOT NULL DEFAULT 1 CHECK (next_register_number > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pr_transmittal_settings
  ADD COLUMN IF NOT EXISTS next_register_number integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS pr_transmittal_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES pr_companies(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  register_number integer NOT NULL CHECK (register_number > 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, report_date),
  UNIQUE (company_id, register_number)
);

CREATE OR REPLACE FUNCTION pr_issue_transmittal_register(
  p_company_id uuid,
  p_report_date date
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  issued_number integer;
  first_register boolean;
  report_number integer;
BEGIN
  SELECT register_number
  INTO issued_number
  FROM pr_transmittal_registers
  WHERE company_id = p_company_id
    AND report_date = p_report_date;

  IF issued_number IS NOT NULL THEN
    RETURN issued_number;
  END IF;

  INSERT INTO pr_transmittal_settings (company_id)
  VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  SELECT NOT EXISTS (
    SELECT 1 FROM pr_transmittal_registers WHERE company_id = p_company_id
  ) INTO first_register;

  SELECT next_register_number
  INTO issued_number
  FROM pr_transmittal_settings
  WHERE company_id = p_company_id
  FOR UPDATE;

  -- The first real transmittal keeps the existing report-number relationship:
  -- daily report 097 is transmittal 100. Subsequent dates use the stored sequence.
  IF first_register THEN
    SELECT MAX(report_no) + 3
    INTO report_number
    FROM pr_daily_reports
    WHERE company_id = p_company_id
      AND report_date = p_report_date;
    IF report_number IS NOT NULL THEN
      issued_number := report_number;
    END IF;
  END IF;

  INSERT INTO pr_transmittal_registers (company_id, report_date, register_number)
  VALUES (p_company_id, p_report_date, issued_number);

  UPDATE pr_transmittal_settings
  SET next_register_number = GREATEST(next_register_number, issued_number + 1),
      updated_at = now()
  WHERE company_id = p_company_id;

  RETURN issued_number;
END;
$$;
