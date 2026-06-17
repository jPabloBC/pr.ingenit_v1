CREATE TABLE IF NOT EXISTS pr_field_staffing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES pr_companies(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES pr_projects(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  work_front_id uuid NULL REFERENCES pr_report_fronts(id) ON DELETE SET NULL,
  work_front_name text NULL,
  crew_name text NULL,
  specialty text NULL,
  field_boss_id uuid NULL REFERENCES pr_collaborators(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  generated_crew_id uuid NULL,
  sync_error jsonb NULL,
  submitted_at timestamptz NULL,
  synced_at timestamptz NULL,
  created_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT pr_field_staffing_sessions_status_chk
    CHECK (status IN ('draft', 'submitted', 'synced', 'reopened', 'cancelled', 'sync_failed'))
);

CREATE TABLE IF NOT EXISTS pr_field_staffing_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES pr_field_staffing_sessions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES pr_companies(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES pr_projects(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  collaborator_id uuid NOT NULL REFERENCES pr_collaborators(id) ON DELETE CASCADE,
  role text NULL,
  is_override boolean NOT NULL DEFAULT false,
  override_reason text NULL,
  created_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT pr_field_staffing_workers_unique_collaborator
    UNIQUE (session_id, collaborator_id)
);

CREATE TABLE IF NOT EXISTS pr_field_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES pr_field_staffing_sessions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES pr_companies(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES pr_projects(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  program_activity_id uuid NULL REFERENCES pr_program(id) ON DELETE SET NULL,
  crew_activity_id uuid NULL,
  activity text NOT NULL,
  area text NULL,
  unit text NULL,
  quantity numeric NULL,
  user_detail text NULL,
  display_order integer NULL,
  created_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pr_field_staffing_sessions_company_date_idx
  ON pr_field_staffing_sessions (company_id, work_date);

CREATE INDEX IF NOT EXISTS pr_field_staffing_sessions_project_date_idx
  ON pr_field_staffing_sessions (project_id, work_date);

CREATE INDEX IF NOT EXISTS pr_field_staffing_sessions_status_idx
  ON pr_field_staffing_sessions (company_id, status);

CREATE INDEX IF NOT EXISTS pr_field_staffing_sessions_generated_crew_idx
  ON pr_field_staffing_sessions (generated_crew_id);

CREATE INDEX IF NOT EXISTS pr_field_staffing_workers_session_idx
  ON pr_field_staffing_workers (session_id);

CREATE INDEX IF NOT EXISTS pr_field_staffing_workers_company_date_collaborator_idx
  ON pr_field_staffing_workers (company_id, work_date, collaborator_id);

CREATE INDEX IF NOT EXISTS pr_field_activity_logs_session_order_idx
  ON pr_field_activity_logs (session_id, display_order);

CREATE INDEX IF NOT EXISTS pr_field_activity_logs_company_date_idx
  ON pr_field_activity_logs (company_id, work_date);
