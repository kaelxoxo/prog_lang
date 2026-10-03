ALTER TABLE alaga_private.accounts
  ADD COLUMN care_setup text CONSTRAINT accounts_care_setup_valid
  CHECK (care_setup IN ('self', 'family', 'professional'));

ALTER TABLE public.patients
  ADD COLUMN self_account_id uuid REFERENCES alaga_private.accounts(id);

CREATE UNIQUE INDEX patients_one_active_self_profile
  ON public.patients (self_account_id)
  WHERE self_account_id IS NOT NULL AND archived_at IS NULL;

-- PostgreSQL cannot replace a function when its returned row shape changes.
DROP FUNCTION app_api.register_account(text, text, text, text, timestamptz);
DROP FUNCTION app_api.log_in(text, text, text, timestamptz);
DROP FUNCTION app_api.resolve_session(text);
DROP FUNCTION app_api.create_patient_profile(text);

CREATE FUNCTION app_api.register_account(
  requested_email text,
  requested_display_name text,
  requested_password text,
  requested_token_hash text,
  requested_expires_at timestamptz
)
RETURNS TABLE (id uuid, email text, display_name text, care_setup text)
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

  RETURN QUERY SELECT new_account.id, new_account.email, new_account.display_name, new_account.care_setup;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'An account with this email already exists.' USING ERRCODE = '23505';
END
$$;

CREATE FUNCTION app_api.log_in(
  requested_email text,
  requested_password text,
  requested_token_hash text,
  requested_expires_at timestamptz
)
RETURNS TABLE (id uuid, email text, display_name text, care_setup text)
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

  RETURN QUERY SELECT matched_account.id, matched_account.email, matched_account.display_name, matched_account.care_setup;
END
$$;

CREATE FUNCTION app_api.resolve_session(requested_token_hash text)
RETURNS TABLE (id uuid, email text, display_name text, care_setup text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, alaga_private
AS $$
  SELECT account.id, account.email, account.display_name, account.care_setup
  FROM alaga_private.auth_sessions AS session
  JOIN alaga_private.accounts AS account ON account.id = session.account_id
  WHERE session.token_hash = requested_token_hash
    AND session.revoked_at IS NULL
    AND session.expires_at > now()
  LIMIT 1
$$;

CREATE FUNCTION app_api.set_account_care_setup(requested_care_setup text)
RETURNS TABLE (id uuid, email text, display_name text, care_setup text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, alaga_private
AS $$
DECLARE
  saved_account alaga_private.accounts%ROWTYPE;
BEGIN
  IF alaga_private.current_account_id() IS NULL THEN
    RAISE EXCEPTION 'A valid session is required.' USING ERRCODE = '28000';
  END IF;

  IF requested_care_setup IS NULL OR requested_care_setup NOT IN ('self', 'family', 'professional') THEN
    RAISE EXCEPTION 'Choose a valid Care Setup.' USING ERRCODE = '22023';
  END IF;

  UPDATE alaga_private.accounts AS account
  SET care_setup = requested_care_setup
  WHERE account.id = alaga_private.current_account_id()
  RETURNING * INTO saved_account;

  RETURN QUERY SELECT saved_account.id, saved_account.email, saved_account.display_name, saved_account.care_setup;
END
$$;

CREATE FUNCTION app_api.create_patient_profile(requested_display_name text, requested_is_self boolean)
RETURNS TABLE (id uuid, display_name text, role text, created_at timestamptz, is_self boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  account_id uuid := alaga_private.current_account_id();
  new_patient public.patients%ROWTYPE;
  violated_constraint text;
BEGIN
  IF account_id IS NULL THEN
    RAISE EXCEPTION 'A valid session is required.' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.patients (display_name, created_by, self_account_id)
  VALUES (btrim(requested_display_name), account_id,
          CASE WHEN requested_is_self THEN account_id ELSE NULL END)
  RETURNING * INTO new_patient;

  INSERT INTO public.patient_members (patient_id, account_id, role, granted_by)
  VALUES (new_patient.id, account_id, 'owner', account_id);

  RETURN QUERY
    SELECT new_patient.id, new_patient.display_name, 'owner'::text, new_patient.created_at,
           new_patient.self_account_id IS NOT DISTINCT FROM account_id;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
    IF violated_constraint = 'patients_one_active_self_profile' THEN
      RAISE EXCEPTION 'A Self Profile already exists.' USING ERRCODE = '23505';
    END IF;
    RAISE;
END
$$;

REVOKE ALL ON FUNCTION app_api.register_account(text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.log_in(text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.resolve_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.set_account_care_setup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.create_patient_profile(text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  app_api.register_account(text, text, text, text, timestamptz),
  app_api.log_in(text, text, text, timestamptz),
  app_api.resolve_session(text),
  app_api.set_account_care_setup(text),
  app_api.create_patient_profile(text, boolean)
TO alaga_api;
