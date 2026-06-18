ALTER TABLE pr_field_staffing_sessions
  ADD COLUMN IF NOT EXISTS supervisor_id uuid NULL REFERENCES pr_collaborators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS foreman_id uuid NULL REFERENCES pr_collaborators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS closed_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_notes text NULL;

ALTER TABLE pr_field_staffing_sessions
  DROP CONSTRAINT IF EXISTS pr_field_staffing_sessions_status_chk;

ALTER TABLE pr_field_staffing_sessions
  ADD CONSTRAINT pr_field_staffing_sessions_status_chk
  CHECK (status IN ('draft', 'closed', 'submitted', 'synced', 'reopened', 'cancelled', 'sync_failed'));

CREATE INDEX IF NOT EXISTS pr_field_staffing_sessions_supervisor_date_idx
  ON pr_field_staffing_sessions (company_id, supervisor_id, work_date);

CREATE INDEX IF NOT EXISTS pr_field_staffing_sessions_foreman_date_idx
  ON pr_field_staffing_sessions (company_id, foreman_id, work_date);

ALTER TABLE pr_field_activity_logs
  ADD COLUMN IF NOT EXISTS activity_start_time time NULL,
  ADD COLUMN IF NOT EXISTS activity_end_time time NULL,
  ADD COLUMN IF NOT EXISTS activity_observations text NULL,
  ADD COLUMN IF NOT EXISTS restrictions text NULL;

CREATE INDEX IF NOT EXISTS pr_field_activity_logs_session_time_idx
  ON pr_field_activity_logs (session_id, activity_start_time, activity_end_time);
