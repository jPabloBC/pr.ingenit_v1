CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NULL,
  actor_user_id uuid NULL,
  actor_email text NULL,
  actor_role text NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NULL,
  before_data jsonb NULL,
  after_data jsonb NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_audit_logs_company_id_idx
  ON platform_audit_logs (company_id);

CREATE INDEX IF NOT EXISTS platform_audit_logs_project_id_idx
  ON platform_audit_logs (project_id);

CREATE INDEX IF NOT EXISTS platform_audit_logs_actor_user_id_idx
  ON platform_audit_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS platform_audit_logs_action_idx
  ON platform_audit_logs (action);

CREATE INDEX IF NOT EXISTS platform_audit_logs_resource_type_resource_id_idx
  ON platform_audit_logs (resource_type, resource_id);

CREATE INDEX IF NOT EXISTS platform_audit_logs_created_at_idx
  ON platform_audit_logs (created_at);
