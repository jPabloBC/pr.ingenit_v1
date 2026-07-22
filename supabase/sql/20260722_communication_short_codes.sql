BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.pr_communication_forms
  ADD COLUMN IF NOT EXISTS short_code text;

ALTER TABLE public.pr_communication_form_invitations
  ADD COLUMN IF NOT EXISTS short_code text;

CREATE OR REPLACE FUNCTION public.pr_generate_form_short_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := 'F_' || translate(
      rtrim(encode(gen_random_bytes(6), 'base64'), '='),
      '+/',
      '-_'
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.pr_communication_forms
      WHERE short_code = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.pr_generate_invitation_short_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := 'I_' || translate(
      rtrim(encode(gen_random_bytes(9), 'base64'), '='),
      '+/',
      '-_'
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.pr_communication_form_invitations
      WHERE short_code = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

DO $$
DECLARE
  target_id uuid;
BEGIN
  FOR target_id IN
    SELECT id
    FROM public.pr_communication_forms
    WHERE short_code IS NULL
  LOOP
    UPDATE public.pr_communication_forms
    SET short_code = public.pr_generate_form_short_code()
    WHERE id = target_id;
  END LOOP;

  FOR target_id IN
    SELECT id
    FROM public.pr_communication_form_invitations
    WHERE short_code IS NULL
  LOOP
    UPDATE public.pr_communication_form_invitations
    SET short_code = public.pr_generate_invitation_short_code()
    WHERE id = target_id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS pr_communication_forms_short_code_idx
  ON public.pr_communication_forms (short_code);

CREATE UNIQUE INDEX IF NOT EXISTS pr_communication_form_invitations_short_code_idx
  ON public.pr_communication_form_invitations (short_code);

ALTER TABLE public.pr_communication_forms
  ALTER COLUMN short_code
  SET DEFAULT public.pr_generate_form_short_code();

ALTER TABLE public.pr_communication_form_invitations
  ALTER COLUMN short_code
  SET DEFAULT public.pr_generate_invitation_short_code();

ALTER TABLE public.pr_communication_forms
  ALTER COLUMN short_code SET NOT NULL;

ALTER TABLE public.pr_communication_form_invitations
  ALTER COLUMN short_code SET NOT NULL;

ALTER TABLE public.pr_communication_forms
  DROP CONSTRAINT IF EXISTS pr_communication_forms_short_code_chk;

ALTER TABLE public.pr_communication_forms
  ADD CONSTRAINT pr_communication_forms_short_code_chk
  CHECK (short_code ~ '^F_[A-Za-z0-9_-]{8}$');

ALTER TABLE public.pr_communication_form_invitations
  DROP CONSTRAINT IF EXISTS pr_communication_form_invitations_short_code_chk;

ALTER TABLE public.pr_communication_form_invitations
  ADD CONSTRAINT pr_communication_form_invitations_short_code_chk
  CHECK (short_code ~ '^I_[A-Za-z0-9_-]{12}$');

COMMENT ON COLUMN public.pr_communication_forms.short_code
  IS 'Código público corto del formulario; no reemplaza su UUID interno.';

COMMENT ON COLUMN public.pr_communication_form_invitations.short_code
  IS 'Código público corto de la invitación individual; no reemplaza su access_token.';

COMMIT;
