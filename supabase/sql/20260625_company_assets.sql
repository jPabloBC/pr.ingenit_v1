CREATE TABLE IF NOT EXISTS pr_company_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES pr_companies(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  usage_context text NULL,
  name text NOT NULL,
  description text NULL,
  provider text NOT NULL DEFAULT 'r2',
  bucket text NULL,
  r2_key text NOT NULL,
  public_url text NULL,
  content_type text NULL,
  file_size_bytes bigint NULL,
  width_px integer NULL,
  height_px integer NULL,
  checksum text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES pr_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_company_assets_asset_type_chk
    CHECK (asset_type = lower(asset_type) AND asset_type ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  CONSTRAINT pr_company_assets_usage_context_chk
    CHECK (
      usage_context IS NULL OR
      (usage_context = lower(usage_context) AND usage_context ~ '^[a-z0-9][a-z0-9_-]{0,79}$')
    ),
  CONSTRAINT pr_company_assets_provider_chk
    CHECK (provider IN ('r2', 'supabase_storage', 'external_url')),
  CONSTRAINT pr_company_assets_file_size_chk
    CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
  CONSTRAINT pr_company_assets_dimensions_chk
    CHECK (
      (width_px IS NULL OR width_px > 0) AND
      (height_px IS NULL OR height_px > 0)
    )
);

CREATE INDEX IF NOT EXISTS pr_company_assets_company_type_idx
  ON pr_company_assets (company_id, asset_type, usage_context, is_active, sort_order);

CREATE INDEX IF NOT EXISTS pr_company_assets_company_default_idx
  ON pr_company_assets (company_id, asset_type, usage_context)
  WHERE is_default = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS pr_company_assets_r2_key_unique_idx
  ON pr_company_assets (r2_key);

CREATE UNIQUE INDEX IF NOT EXISTS pr_company_assets_one_default_per_context_idx
  ON pr_company_assets (company_id, asset_type, coalesce(usage_context, ''))
  WHERE is_default = true AND is_active = true;
