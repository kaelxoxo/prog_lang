CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE SCHEMA IF NOT EXISTS alaga_private;
CREATE SCHEMA IF NOT EXISTS app_api;

REVOKE ALL ON SCHEMA alaga_private FROM PUBLIC;
REVOKE ALL ON SCHEMA app_api FROM PUBLIC;

CREATE TABLE alaga_private.accounts (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_email_normalized CHECK (email = lower(btrim(email))),
  CONSTRAINT accounts_email_length CHECK (char_length(email) BETWEEN 3 AND 320),
  CONSTRAINT accounts_display_name_length CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80)
);

CREATE TABLE alaga_private.auth_sessions (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES alaga_private.accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT auth_sessions_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_expiry CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_active_token_idx
  ON alaga_private.auth_sessions (token_hash)
  WHERE revoked_at IS NULL;

CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  archived_at timestamptz,
  CONSTRAINT patients_display_name_length CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80)
);

CREATE TABLE public.patient_members (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  account_id uuid NOT NULL REFERENCES alaga_private.accounts(id),
  role text NOT NULL,
  granted_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES alaga_private.accounts(id),
  CONSTRAINT patient_members_role CHECK (role IN ('owner', 'caregiver')),
  CONSTRAINT patient_members_revocation_pair CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX patient_members_one_active_membership
  ON public.patient_members (patient_id, account_id)
  WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION alaga_private.current_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, alaga_private
SET row_security = off
AS $$
  SELECT account_id
  FROM alaga_private.auth_sessions
  WHERE token_hash = nullif(current_setting('alaga.session_token_hash', true), '')
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION alaga_private.is_active_patient_member(target_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patient_members
    WHERE patient_id = target_patient_id
      AND account_id = alaga_private.current_account_id()
      AND revoked_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION alaga_private.is_active_patient_owner(target_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patient_members
    WHERE patient_id = target_patient_id
      AND account_id = alaga_private.current_account_id()
      AND role = 'owner'
      AND revoked_at IS NULL
  )
$$;

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.patient_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_members FORCE ROW LEVEL SECURITY;

CREATE POLICY patients_select_for_active_members
  ON public.patients
  FOR SELECT
  USING (alaga_private.is_active_patient_member(id));

CREATE POLICY patient_members_select_for_active_members
  ON public.patient_members
  FOR SELECT
  USING (alaga_private.is_active_patient_member(patient_id));

CREATE OR REPLACE FUNCTION app_api.register_account(
  requested_email text,
  requested_display_name text,
  requested_password text,
  requested_token_hash text,
  requested_expires_at timestamptz
)
RETURNS TABLE (id uuid, email text, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  new_account alaga_private.accounts%ROWTYPE;
BEGIN
  IF char_length(requested_password) < 12 OR char_length(requested_password) > 128 THEN
    RAISE EXCEPTION 'Password must contain 12 to 128 characters.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO alaga_private.accounts (email, display_name, password_hash)
  VALUES (
    lower(btrim(requested_email)),
    btrim(requested_display_name),
    public.crypt(requested_password, public.gen_salt('bf', 12))
  )
  RETURNING * INTO new_account;

  INSERT INTO alaga_private.auth_sessions (account_id, token_hash, expires_at)
  VALUES (new_account.id, requested_token_hash, requested_expires_at);

  RETURN QUERY SELECT new_account.id, new_account.email, new_account.display_name;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'An account with this email already exists.' USING ERRCODE = '23505';
END
$$;

CREATE OR REPLACE FUNCTION app_api.log_in(
  requested_email text,
  requested_password text,
  requested_token_hash text,
  requested_expires_at timestamptz
)
RETURNS TABLE (id uuid, email text, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  matched_account alaga_private.accounts%ROWTYPE;
BEGIN
  SELECT * INTO matched_account
  FROM alaga_private.accounts AS account
  WHERE account.email = lower(btrim(requested_email))
    AND account.password_hash = public.crypt(requested_password, account.password_hash);

  IF matched_account.id IS NULL THEN
    RAISE EXCEPTION 'The email or password is incorrect.' USING ERRCODE = '28000';
  END IF;

  INSERT INTO alaga_private.auth_sessions (account_id, token_hash, expires_at)
  VALUES (matched_account.id, requested_token_hash, requested_expires_at);

  RETURN QUERY SELECT matched_account.id, matched_account.email, matched_account.display_name;
END
$$;

CREATE OR REPLACE FUNCTION app_api.resolve_session(requested_token_hash text)
RETURNS TABLE (id uuid, email text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, alaga_private
AS $$
  SELECT account.id, account.email, account.display_name
  FROM alaga_private.auth_sessions AS session
  JOIN alaga_private.accounts AS account ON account.id = session.account_id
  WHERE session.token_hash = requested_token_hash
    AND session.revoked_at IS NULL
    AND session.expires_at > now()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app_api.log_out(requested_token_hash text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, alaga_private
AS $$
  UPDATE alaga_private.auth_sessions
  SET revoked_at = coalesce(revoked_at, now())
  WHERE token_hash = requested_token_hash
$$;

CREATE OR REPLACE FUNCTION app_api.create_patient_profile(requested_display_name text)
RETURNS TABLE (id uuid, display_name text, role text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  account_id uuid := alaga_private.current_account_id();
  new_patient public.patients%ROWTYPE;
BEGIN
  IF account_id IS NULL THEN
    RAISE EXCEPTION 'A valid session is required.' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.patients (display_name, created_by)
  VALUES (btrim(requested_display_name), account_id)
  RETURNING * INTO new_patient;

  INSERT INTO public.patient_members (patient_id, account_id, role, granted_by)
  VALUES (new_patient.id, account_id, 'owner', account_id);

  RETURN QUERY
    SELECT new_patient.id, new_patient.display_name, 'owner'::text, new_patient.created_at;
END
$$;

CREATE OR REPLACE FUNCTION app_api.revoke_patient_membership(
  target_patient_id uuid,
  target_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  caller_id uuid := alaga_private.current_account_id();
  target_role text;
  active_owner_count integer;
BEGIN
  IF caller_id IS NULL OR NOT alaga_private.is_active_patient_owner(target_patient_id) THEN
    RAISE EXCEPTION 'Only an active owner can revoke membership.' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO target_role
  FROM public.patient_members
  WHERE patient_id = target_patient_id
    AND account_id = target_account_id
    AND revoked_at IS NULL;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Active membership not found.' USING ERRCODE = 'P0002';
  END IF;

  IF target_role = 'owner' THEN
    SELECT count(*) INTO active_owner_count
    FROM public.patient_members
    WHERE patient_id = target_patient_id
      AND role = 'owner'
      AND revoked_at IS NULL;

    IF active_owner_count <= 1 THEN
      RAISE EXCEPTION 'The final owner cannot be revoked.' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.patient_members
  SET revoked_at = now(), revoked_by = caller_id
  WHERE patient_id = target_patient_id
    AND account_id = target_account_id
    AND revoked_at IS NULL;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA alaga_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_api FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA alaga_private FROM PUBLIC;

GRANT USAGE ON SCHEMA public, app_api, alaga_private TO alaga_api;
GRANT SELECT ON public.patients, public.patient_members TO alaga_api;
GRANT EXECUTE ON FUNCTION
  app_api.register_account(text, text, text, text, timestamptz),
  app_api.log_in(text, text, text, timestamptz),
  app_api.resolve_session(text),
  app_api.log_out(text),
  app_api.create_patient_profile(text),
  app_api.revoke_patient_membership(uuid, uuid)
TO alaga_api;

GRANT EXECUTE ON FUNCTION
  alaga_private.current_account_id(),
  alaga_private.is_active_patient_member(uuid),
  alaga_private.is_active_patient_owner(uuid)
TO alaga_api;
