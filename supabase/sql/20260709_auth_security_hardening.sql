CREATE TABLE IF NOT EXISTS pr_auth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  email_hash text,
  ip_hash text,
  success boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pr_auth_attempts_action_created_at_idx
  ON pr_auth_attempts (action, created_at DESC);

CREATE INDEX IF NOT EXISTS pr_auth_attempts_email_action_created_at_idx
  ON pr_auth_attempts (email_hash, action, created_at DESC)
  WHERE email_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS pr_auth_attempts_ip_action_created_at_idx
  ON pr_auth_attempts (ip_hash, action, created_at DESC)
  WHERE ip_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pr_users_auth_id_unique_idx
  ON pr_users (auth_id)
  WHERE auth_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pr_password_resets_user_active_idx
  ON pr_password_resets (user_id, expires_at DESC)
  WHERE used = false;
