CREATE TABLE alaga_private.patient_invitations (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  invited_email text NOT NULL,
  invited_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  can_manage_medications boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES alaga_private.accounts(id),
  CONSTRAINT patient_invitations_email_normalized CHECK (
    invited_email = lower(btrim(invited_email))
    AND char_length(invited_email) BETWEEN 3 AND 320
  ),
  CONSTRAINT patient_invitations_status CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')
  ),
  CONSTRAINT patient_invitations_expiry CHECK (expires_at > created_at),
  CONSTRAINT patient_invitations_resolution CHECK (
    (status = 'pending' AND resolved_at IS NULL AND resolved_by IS NULL)
    OR (status IN ('accepted', 'declined', 'cancelled') AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    OR (status = 'expired' AND resolved_at IS NOT NULL AND resolved_by IS NULL)
  )
);

CREATE UNIQUE INDEX patient_invitations_one_pending_email
  ON alaga_private.patient_invitations (patient_id, invited_email)
  WHERE status = 'pending';

CREATE INDEX patient_invitations_recipient_pending
  ON alaga_private.patient_invitations (invited_email, created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION app_api.create_patient_invitation(
  target_patient_id uuid,
  requested_email text,
  requested_can_manage_medications boolean
)
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
DECLARE
  caller_id uuid := alaga_private.current_account_id();
  normalized_email text := lower(btrim(requested_email));
  invited_account_id uuid;
BEGIN
  IF caller_id IS NULL OR NOT alaga_private.is_active_patient_owner(target_patient_id) THEN
    RAISE EXCEPTION 'Only an active owner can invite a caregiver.' USING ERRCODE = '42501';
  END IF;

  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(normalized_email) > 320 THEN
    RAISE EXCEPTION 'Enter a valid caregiver email address.' USING ERRCODE = '22023';
  END IF;

  UPDATE alaga_private.patient_invitations AS invitation
  SET status = 'expired', resolved_at = now()
  WHERE invitation.patient_id = target_patient_id
    AND invitation.status = 'pending'
    AND invitation.expires_at <= now();

  SELECT account.id INTO invited_account_id
  FROM alaga_private.accounts AS account
  WHERE account.email = normalized_email;

  IF invited_account_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.patient_members AS membership
    WHERE membership.patient_id = target_patient_id
      AND membership.account_id = invited_account_id
      AND membership.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This account is already in the care circle.' USING ERRCODE = '23505';
  END IF;

  RETURN QUERY
  INSERT INTO alaga_private.patient_invitations (
    patient_id,
    invited_email,
    invited_by,
    can_manage_medications
  )
  VALUES (
    target_patient_id,
    normalized_email,
    caller_id,
    requested_can_manage_medications
  )
  RETURNING
    patient_invitations.id,
    patient_invitations.invited_email,
    patient_invitations.can_manage_medications,
    patient_invitations.status,
    patient_invitations.created_at,
    patient_invitations.expires_at;
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
    OR NOT alaga_private.is_active_patient_owner(target_patient_id) THEN
    RAISE EXCEPTION 'Only an active owner can view pending invitations.' USING ERRCODE = '42501';
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
BEGIN
  IF alaga_private.current_account_id() IS NULL
    OR NOT alaga_private.is_active_patient_owner(target_patient_id) THEN
    RAISE EXCEPTION 'Only an active owner can view the care circle.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    account.id,
    account.email,
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

CREATE OR REPLACE FUNCTION app_api.my_pending_patient_invitations()
RETURNS TABLE (
  id uuid,
  patient_id uuid,
  patient_name text,
  invited_by_name text,
  can_manage_medications boolean,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  caller_id uuid := alaga_private.current_account_id();
  caller_email text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'A valid session is required.' USING ERRCODE = '28000';
  END IF;

  SELECT account.email INTO caller_email
  FROM alaga_private.accounts AS account
  WHERE account.id = caller_id;

  UPDATE alaga_private.patient_invitations AS invitation
  SET status = 'expired', resolved_at = now()
  WHERE invitation.invited_email = caller_email
    AND invitation.status = 'pending'
    AND invitation.expires_at <= now();

  RETURN QUERY
  SELECT
    invitation.id,
    patient.id,
    patient.display_name,
    inviter.display_name,
    invitation.can_manage_medications,
    invitation.created_at,
    invitation.expires_at
  FROM alaga_private.patient_invitations AS invitation
  JOIN public.patients AS patient ON patient.id = invitation.patient_id
  JOIN alaga_private.accounts AS inviter ON inviter.id = invitation.invited_by
  WHERE invitation.invited_email = caller_email
    AND invitation.status = 'pending'
    AND patient.archived_at IS NULL
  ORDER BY invitation.created_at, invitation.id;
END
$$;

CREATE OR REPLACE FUNCTION app_api.respond_to_patient_invitation(
  target_invitation_id uuid,
  requested_response text
)
RETURNS TABLE (invitation_id uuid, patient_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  caller_id uuid := alaga_private.current_account_id();
  caller_email text;
  invitation alaga_private.patient_invitations%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'A valid session is required.' USING ERRCODE = '28000';
  END IF;

  IF requested_response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invitation response must be accepted or declined.' USING ERRCODE = '22023';
  END IF;

  SELECT account.email INTO caller_email
  FROM alaga_private.accounts AS account
  WHERE account.id = caller_id;

  SELECT * INTO invitation
  FROM alaga_private.patient_invitations
  WHERE id = target_invitation_id
  FOR UPDATE;

  IF invitation.id IS NULL OR invitation.invited_email <> caller_email THEN
    RAISE EXCEPTION 'Invitation not found.' USING ERRCODE = 'P0002';
  END IF;

  IF invitation.status = requested_response AND invitation.resolved_by = caller_id THEN
    RETURN QUERY SELECT invitation.id, invitation.patient_id, invitation.status;
    RETURN;
  END IF;

  IF invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation is no longer pending.' USING ERRCODE = '23514';
  END IF;

  IF invitation.expires_at <= now() THEN
    UPDATE alaga_private.patient_invitations
    SET status = 'expired', resolved_at = now()
    WHERE id = invitation.id;
    RAISE EXCEPTION 'This invitation has expired.' USING ERRCODE = '23514';
  END IF;

  IF requested_response = 'accepted' THEN
    IF EXISTS (
      SELECT 1
      FROM public.patient_members AS membership
      WHERE membership.patient_id = invitation.patient_id
        AND membership.account_id = caller_id
        AND membership.revoked_at IS NULL
    ) THEN
      RAISE EXCEPTION 'This account is already in the care circle.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.patient_members (
      patient_id,
      account_id,
      role,
      granted_by,
      can_manage_medications
    )
    VALUES (
      invitation.patient_id,
      caller_id,
      'caregiver',
      invitation.invited_by,
      invitation.can_manage_medications
    );
  END IF;

  UPDATE alaga_private.patient_invitations
  SET status = requested_response, resolved_at = now(), resolved_by = caller_id
  WHERE id = invitation.id;

  RETURN QUERY SELECT invitation.id, invitation.patient_id, requested_response;
END
$$;

CREATE OR REPLACE FUNCTION app_api.cancel_patient_invitation(
  target_patient_id uuid,
  target_invitation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  caller_id uuid := alaga_private.current_account_id();
  invitation_status text;
BEGIN
  IF caller_id IS NULL OR NOT alaga_private.is_active_patient_owner(target_patient_id) THEN
    RAISE EXCEPTION 'Only an active owner can cancel an invitation.' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO invitation_status
  FROM alaga_private.patient_invitations
  WHERE id = target_invitation_id
    AND patient_id = target_patient_id
  FOR UPDATE;

  IF invitation_status IS NULL THEN
    RAISE EXCEPTION 'Invitation not found.' USING ERRCODE = 'P0002';
  END IF;

  IF invitation_status = 'cancelled' THEN
    RETURN;
  END IF;

  IF invitation_status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending invitation can be cancelled.' USING ERRCODE = '23514';
  END IF;

  UPDATE alaga_private.patient_invitations
  SET status = 'cancelled', resolved_at = now(), resolved_by = caller_id
  WHERE id = target_invitation_id;
END
$$;

REVOKE ALL ON TABLE alaga_private.patient_invitations FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_api FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  app_api.create_patient_invitation(uuid, text, boolean),
  app_api.patient_pending_invitations(uuid),
  app_api.patient_care_circle(uuid),
  app_api.my_pending_patient_invitations(),
  app_api.respond_to_patient_invitation(uuid, text),
  app_api.cancel_patient_invitation(uuid, uuid)
TO alaga_api;
