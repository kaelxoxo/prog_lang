-- Migration 010: Patient primary care manager resolution for active care circle members
-- Allows any active patient member to securely resolve the primary care manager's display name
-- for care coordination and permission attribution without compromising account boundary.

CREATE OR REPLACE FUNCTION app_api.patient_primary_care_manager(target_patient_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
  SELECT account.display_name
  FROM public.patient_members AS membership
  JOIN alaga_private.accounts AS account ON account.id = membership.account_id
  WHERE membership.patient_id = target_patient_id
    AND membership.role = 'owner'
    AND membership.revoked_at IS NULL
    AND alaga_private.is_active_patient_member(target_patient_id)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app_api.patient_primary_care_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_api.patient_primary_care_manager(uuid) TO alaga_api;
