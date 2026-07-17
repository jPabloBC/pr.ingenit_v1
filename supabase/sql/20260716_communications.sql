CREATE TABLE IF NOT EXISTS pr_communication_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES pr_companies(id) ON DELETE CASCADE,
  project_id uuid NULL,
  title text NOT NULL,
  message text NOT NULL,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipient_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachment_r2_key text NULL,
  attachment_name text NULL,
  attachment_content_type text NULL,
  attachment_size_bytes bigint NULL,
  attachment_access_token uuid NOT NULL DEFAULT gen_random_uuid(),
  attachment_expires_at timestamptz NULL,
  created_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_communication_campaigns_title_chk CHECK (length(trim(title)) > 0),
  CONSTRAINT pr_communication_campaigns_message_chk CHECK (length(trim(message)) > 0),
  CONSTRAINT pr_communication_campaigns_attachment_size_chk CHECK (attachment_size_bytes IS NULL OR attachment_size_bytes > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS pr_communication_campaigns_attachment_token_idx
  ON pr_communication_campaigns (attachment_access_token);

CREATE INDEX IF NOT EXISTS pr_communication_campaigns_company_project_created_idx
  ON pr_communication_campaigns (company_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pr_communication_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES pr_communication_campaigns(id) ON DELETE CASCADE,
  collaborator_id uuid NOT NULL REFERENCES pr_collaborators(id) ON DELETE RESTRICT,
  channel text NOT NULL,
  recipient_name text NOT NULL,
  recipient_email text NULL,
  recipient_phone text NULL,
  status text NOT NULL DEFAULT 'prepared',
  provider_message_id text NULL,
  error_message text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_communication_deliveries_channel_chk CHECK (channel IN ('email', 'whatsapp')),
  CONSTRAINT pr_communication_deliveries_status_chk CHECK (status IN ('prepared', 'sent', 'failed')),
  CONSTRAINT pr_communication_deliveries_unique_recipient_channel UNIQUE (campaign_id, collaborator_id, channel)
);

CREATE INDEX IF NOT EXISTS pr_communication_deliveries_campaign_idx
  ON pr_communication_deliveries (campaign_id, channel, status);
