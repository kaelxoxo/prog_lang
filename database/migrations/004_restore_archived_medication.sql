CREATE OR REPLACE FUNCTION app_api.restore_medication(
  target_patient_id uuid,
  target_medication_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  account_id uuid := alaga_private.current_account_id();
BEGIN
  IF account_id IS NULL OR NOT alaga_private.can_manage_patient_medications(target_patient_id) THEN
    RAISE EXCEPTION 'Medication manager permission is required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.medications
  SET archived_at = NULL, archived_by = NULL
  WHERE id = target_medication_id
    AND patient_id = target_patient_id
    AND archived_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archived medication not found.' USING ERRCODE = 'P0002';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION app_api.restore_medication(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_api.restore_medication(uuid, uuid) TO alaga_api;
