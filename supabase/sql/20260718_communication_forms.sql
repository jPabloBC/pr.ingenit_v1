CREATE TABLE IF NOT EXISTS pr_communication_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES pr_companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES pr_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'published',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_communication_forms_title_chk CHECK (length(trim(title)) > 0),
  CONSTRAINT pr_communication_forms_status_chk CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT pr_communication_forms_questions_array_chk CHECK (jsonb_typeof(questions) = 'array'),
  CONSTRAINT pr_communication_forms_results_array_chk CHECK (jsonb_typeof(results) = 'array')
);

CREATE INDEX IF NOT EXISTS pr_communication_forms_company_project_created_idx
  ON pr_communication_forms (company_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pr_communication_form_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES pr_communication_forms(id) ON DELETE CASCADE,
  collaborator_id uuid NULL REFERENCES pr_collaborators(id) ON DELETE SET NULL,
  access_token uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_name text NOT NULL,
  recipient_email text NULL,
  recipient_phone text NULL,
  status text NOT NULL DEFAULT 'pending',
  answers jsonb NULL,
  result_id text NULL,
  opened_at timestamptz NULL,
  submitted_at timestamptz NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_communication_form_invitations_status_chk CHECK (status IN ('pending', 'opened', 'completed', 'revoked')),
  CONSTRAINT pr_communication_form_invitations_answers_object_chk CHECK (answers IS NULL OR jsonb_typeof(answers) = 'object'),
  CONSTRAINT pr_communication_form_invitations_unique_recipient UNIQUE (form_id, collaborator_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pr_communication_form_invitations_token_idx
  ON pr_communication_form_invitations (access_token);

CREATE INDEX IF NOT EXISTS pr_communication_form_invitations_form_status_idx
  ON pr_communication_form_invitations (form_id, status);
