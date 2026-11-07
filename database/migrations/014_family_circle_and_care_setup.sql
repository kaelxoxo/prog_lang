-- Migration 014: Care Setup is only "self" or "family", and every active member
-- of a patient's Care Circle can see who else is in it (shown in the app as Family).
-- Emails and pending invitations stay visible to the active owner only.

UPDATE alaga_private.accounts
SET care_setup = 'family'
WHERE care_setup = 'professional';

ALTER TABLE alaga_private.accounts
  DROP CONSTRAINT IF EXISTS accounts_care_setup_valid;
ALTER TABLE alaga_private.accounts
  ADD CONSTRAINT accounts_care_setup_valid CHECK (care_setup IN ('self', 'family'));

CREATE OR REPLACE FUNCTION app_api.set_account_care_setup(requested_care_setup text)
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

  IF requested_care_setup IS NULL OR requested_care_setup NOT IN ('self', 'family') THEN
    RAISE EXCEPTION 'Choose a valid Care Setup.' USING ERRCODE = '22023';
  END IF;

  UPDATE alaga_private.accounts AS account
  SET care_setup = requested_care_setup
  WHERE account.id = alaga_private.current_account_id()
  RETURNING * INTO saved_account;

  RETURN QUERY SELECT saved_account.id, saved_account.email, saved_account.display_name, saved_account.care_setup;
END
$$;

CREATE OR REPLACE FUNCTION app_api.patient_care_circle(target_patient_id uuid)
RETURNS TABLE (
  account_id uuid,
  email text,
  display_name text,
  role text,
  can_manage_medications boolean,
  joined_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  caller_is_owner boolean;
BEGIN
  IF alaga_private.current_account_id() IS NULL
    OR NOT alaga_private.is_active_patient_member(target_patient_id) THEN
    RAISE EXCEPTION 'Only an active member can view the care circle.' USING ERRCODE = '42501';
  END IF;

  caller_is_owner := alaga_private.is_active_patient_owner(target_patient_id);

  RETURN QUERY
  SELECT
    account.id,
    CASE WHEN caller_is_owner THEN account.email ELSE NULL END,
    account.display_name,
    membership.role,
    membership.can_manage_medications,
    membership.created_at
  FROM public.patient_members AS membership
  JOIN alaga_private.accounts AS account ON account.id = membership.account_id
  WHERE membership.patient_id = target_patient_id
    AND membership.revoked_at IS NULL
  ORDER BY
    CASE membership.role WHEN 'owner' THEN 0 ELSE 1 END,
    lower(account.display_name),
    account.id;
END
$$;

CREATE OR REPLACE FUNCTION app_api.patient_pending_invitations(target_patient_id uuid)
RETURNS TABLE (
  id uuid,
  invited_email text,
  can_manage_medications boolean,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
BEGIN
  IF alaga_private.current_account_id() IS NULL
    OR NOT alaga_private.is_active_patient_member(target_patient_id) THEN
    RAISE EXCEPTION 'Only an active member can view pending invitations.' USING ERRCODE = '42501';
  END IF;

  IF NOT alaga_private.is_active_patient_owner(target_patient_id) THEN
    RETURN;
  END IF;

  UPDATE alaga_private.patient_invitations AS invitation
  SET status = 'expired', resolved_at = now()
  WHERE invitation.patient_id = target_patient_id
    AND invitation.status = 'pending'
    AND invitation.expires_at <= now();

  RETURN QUERY
  SELECT
    invitation.id,
    invitation.invited_email,
    invitation.can_manage_medications,
    invitation.status,
    invitation.created_at,
    invitation.expires_at
  FROM alaga_private.patient_invitations AS invitation
  WHERE invitation.patient_id = target_patient_id
    AND invitation.status = 'pending'
  ORDER BY invitation.created_at, invitation.id;
END
$$;

REVOKE ALL ON FUNCTION app_api.set_account_care_setup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.patient_care_circle(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.patient_pending_invitations(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  app_api.set_account_care_setup(text),
  app_api.patient_care_circle(uuid),
  app_api.patient_pending_invitations(uuid)
TO alaga_api;
