CREATE TABLE IF NOT EXISTS pr_notification_email_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NULL,
  notification_type text NOT NULL,
  email text NOT NULL,
  label text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_notification_email_recipients_email_lower_chk CHECK (email = lower(email)),
  CONSTRAINT pr_notification_email_recipients_email_format_chk CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS pr_notification_email_recipients_unique_active_email
  ON pr_notification_email_recipients (company_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), notification_type, email);

CREATE INDEX IF NOT EXISTS pr_notification_email_recipients_company_type_idx
  ON pr_notification_email_recipients (company_id, notification_type);

CREATE INDEX IF NOT EXISTS pr_notification_email_recipients_project_idx
  ON pr_notification_email_recipients (project_id);
