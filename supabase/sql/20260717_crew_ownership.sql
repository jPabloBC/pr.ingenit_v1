-- Canonical ownership for crews. This migration is additive and does not alter RLS.
ALTER TABLE public.pr_crews
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_email text;

COMMENT ON COLUMN public.pr_crews.created_by_user_id IS
  'pr_users.id of the user who created the crew.';

COMMENT ON COLUMN public.pr_crews.created_by_email IS
  'Creator email retained as a readable audit fallback.';

CREATE INDEX IF NOT EXISTS pr_crews_company_created_by_user_idx
  ON public.pr_crews (company_id, created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pr_crews_company_created_by_email_idx
  ON public.pr_crews (company_id, lower(created_by_email))
  WHERE created_by_email IS NOT NULL;

-- Backfill only when the historical create logs identify one unambiguous actor.
WITH audit_candidates AS (
  SELECT
    company_id,
    resource_id,
    count(DISTINCT actor_user_id) FILTER (WHERE actor_user_id IS NOT NULL) AS user_count,
    count(DISTINCT lower(actor_email)) FILTER (
      WHERE nullif(trim(actor_email), '') IS NOT NULL
    ) AS email_count,
    (array_agg(DISTINCT actor_user_id) FILTER (WHERE actor_user_id IS NOT NULL))[1] AS actor_user_id,
    max(lower(trim(actor_email))) FILTER (
      WHERE nullif(trim(actor_email), '') IS NOT NULL
    ) AS actor_email
  FROM public.pr_platform_audit_logs
  WHERE resource_type = 'crew'
    AND action = 'create'
    AND resource_id IS NOT NULL
  GROUP BY company_id, resource_id
), resolved_creators AS (
  SELECT company_id, resource_id, actor_user_id, actor_email
  FROM audit_candidates
  WHERE user_count <= 1
    AND email_count <= 1
    AND (user_count = 1 OR email_count = 1)
)
UPDATE public.pr_crews AS crew
SET
  created_by_user_id = COALESCE(crew.created_by_user_id, creator.actor_user_id),
  created_by_email = COALESCE(crew.created_by_email, creator.actor_email)
FROM resolved_creators AS creator
WHERE crew.company_id = creator.company_id
  AND crew.id::text = creator.resource_id
  AND (crew.created_by_user_id IS NULL OR crew.created_by_email IS NULL);
