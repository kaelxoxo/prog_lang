CREATE OR REPLACE FUNCTION app_api.save_confirmed_medication(
  target_patient_id uuid,
  target_medication_id uuid,
  requested_display_name text,
  requested_generic_name text,
  requested_brand_name text,
  requested_strength_value numeric,
  requested_strength_unit text,
  requested_dose_quantity numeric,
  requested_dose_unit text,
  requested_medicine_form text,
  requested_route text,
  requested_prescriber text,
  requested_reason text,
  requested_original_instructions text,
  requested_notes text,
  requested_source_kind text,
  requested_schedules jsonb
)
RETURNS TABLE (medication_id uuid, version_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  account_id uuid := alaga_private.current_account_id();
  saved_medication_id uuid;
  saved_version_id uuid;
  next_version integer;
  schedule_item jsonb;
BEGIN
  IF account_id IS NULL OR NOT alaga_private.can_manage_patient_medications(target_patient_id) THEN
    RAISE EXCEPTION 'Medication manager permission is required.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(requested_schedules) <> 'array' OR jsonb_array_length(requested_schedules) = 0 THEN
    RAISE EXCEPTION 'At least one confirmed schedule is required.' USING ERRCODE = '22023';
  END IF;

  IF target_medication_id IS NULL THEN
    INSERT INTO public.medications (patient_id, created_by)
    VALUES (target_patient_id, account_id)
    RETURNING id INTO saved_medication_id;
    next_version := 1;
  ELSE
    SELECT id INTO saved_medication_id
    FROM public.medications
    WHERE id = target_medication_id
      AND patient_id = target_patient_id
      AND archived_at IS NULL;

    IF saved_medication_id IS NULL THEN
      RAISE EXCEPTION 'Active medication not found.' USING ERRCODE = 'P0002';
    END IF;

    SELECT coalesce(max(version.version_number), 0) + 1 INTO next_version
    FROM public.medication_versions AS version
    WHERE version.medication_id = saved_medication_id;
  END IF;

  INSERT INTO public.medication_versions (
    medication_id,
    patient_id,
    version_number,
    display_name,
    generic_name,
    brand_name,
    strength_value,
    strength_unit,
    dose_quantity,
    dose_unit,
    medicine_form,
    route,
    prescriber,
    reason,
    original_instructions,
    notes,
    source_kind,
    created_by,
    confirmed_by
  )
  VALUES (
    saved_medication_id,
    target_patient_id,
    next_version,
    btrim(requested_display_name),
    nullif(btrim(requested_generic_name), ''),
    nullif(btrim(requested_brand_name), ''),
    requested_strength_value,
    nullif(btrim(requested_strength_unit), ''),
    requested_dose_quantity,
    btrim(requested_dose_unit),
    nullif(btrim(requested_medicine_form), ''),
    nullif(btrim(requested_route), ''),
    nullif(btrim(requested_prescriber), ''),
    nullif(btrim(requested_reason), ''),
    nullif(btrim(requested_original_instructions), ''),
    nullif(btrim(requested_notes), ''),
    requested_source_kind,
    account_id,
    account_id
  )
  RETURNING id INTO saved_version_id;

  FOR schedule_item IN SELECT value FROM jsonb_array_elements(requested_schedules)
  LOOP
    INSERT INTO public.medication_schedules (
      medication_version_id,
      patient_id,
      schedule_kind,
      time_of_day,
      interval_hours,
      weekdays,
      meal_name,
      meal_relation,
      window_start,
      window_end,
      start_on,
      end_on,
      time_zone
    )
    VALUES (
      saved_version_id,
      target_patient_id,
      schedule_item->>'kind',
      nullif(schedule_item->>'timeOfDay', '')::time,
      nullif(schedule_item->>'intervalHours', '')::smallint,
      ARRAY(
        SELECT weekday::smallint
        FROM jsonb_array_elements_text(schedule_item->'weekdays') AS weekday
      ),
      nullif(schedule_item->>'mealName', ''),
      nullif(schedule_item->>'mealRelation', ''),
      nullif(schedule_item->>'windowStart', '')::time,
      nullif(schedule_item->>'windowEnd', '')::time,
      (schedule_item->>'startOn')::date,
      nullif(schedule_item->>'endOn', '')::date,
      coalesce(nullif(schedule_item->>'timeZone', ''), 'Asia/Manila')
    );
  END LOOP;

  RETURN QUERY SELECT saved_medication_id, saved_version_id;
END
$$;

REVOKE ALL ON FUNCTION app_api.save_confirmed_medication(
  uuid, uuid, text, text, text, numeric, text, numeric, text, text, text,
  text, text, text, text, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_api.save_confirmed_medication(
  uuid, uuid, text, text, text, numeric, text, numeric, text, text, text,
  text, text, text, text, text, jsonb
) TO alaga_api;
