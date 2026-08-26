ALTER TABLE public.patient_members
  ADD COLUMN can_manage_medications boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION alaga_private.can_manage_patient_medications(target_patient_id uuid)
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
      AND (role = 'owner' OR can_manage_medications)
  )
$$;

CREATE TABLE public.medications (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  created_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES alaga_private.accounts(id),
  CONSTRAINT medications_archive_pair CHECK (
    (archived_at IS NULL AND archived_by IS NULL)
    OR (archived_at IS NOT NULL AND archived_by IS NOT NULL)
  ),
  UNIQUE (id, patient_id)
);

CREATE TABLE public.medication_versions (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  medication_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  version_number integer NOT NULL,
  display_name text NOT NULL,
  generic_name text,
  brand_name text,
  strength_value numeric(12, 4),
  strength_unit text,
  dose_quantity numeric(12, 4) NOT NULL,
  dose_unit text NOT NULL,
  medicine_form text,
  route text,
  prescriber text,
  reason text,
  original_instructions text,
  notes text,
  source_kind text NOT NULL DEFAULT 'manual',
  created_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medication_versions_medication_fk
    FOREIGN KEY (medication_id, patient_id)
    REFERENCES public.medications(id, patient_id),
  CONSTRAINT medication_versions_name_length
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT medication_versions_strength_pair CHECK (
    (strength_value IS NULL AND strength_unit IS NULL)
    OR (strength_value IS NOT NULL AND strength_value > 0 AND strength_unit IS NOT NULL)
  ),
  CONSTRAINT medication_versions_positive_dose CHECK (dose_quantity > 0),
  CONSTRAINT medication_versions_dose_unit_length
    CHECK (char_length(btrim(dose_unit)) BETWEEN 1 AND 40),
  CONSTRAINT medication_versions_source_kind
    CHECK (source_kind IN ('manual', 'label_photo', 'timetable_photo')),
  UNIQUE (medication_id, version_number),
  UNIQUE (id, patient_id)
);

CREATE TABLE public.medication_schedules (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  medication_version_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  schedule_kind text NOT NULL,
  time_of_day time,
  interval_hours smallint,
  weekdays smallint[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[],
  meal_name text,
  meal_relation text,
  window_start time,
  window_end time,
  start_on date NOT NULL,
  end_on date,
  time_zone text NOT NULL DEFAULT 'Asia/Manila',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medication_schedules_version_fk
    FOREIGN KEY (medication_version_id, patient_id)
    REFERENCES public.medication_versions(id, patient_id),
  CONSTRAINT medication_schedules_kind
    CHECK (schedule_kind IN ('exact', 'interval', 'meal')),
  CONSTRAINT medication_schedules_weekdays CHECK (
    cardinality(weekdays) BETWEEN 1 AND 7
    AND weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  CONSTRAINT medication_schedules_date_range CHECK (end_on IS NULL OR end_on >= start_on),
  CONSTRAINT medication_schedules_time_zone CHECK (time_zone = 'Asia/Manila'),
  CONSTRAINT medication_schedules_shape CHECK (
    (
      schedule_kind = 'exact'
      AND time_of_day IS NOT NULL
      AND interval_hours IS NULL
      AND meal_name IS NULL
      AND meal_relation IS NULL
      AND window_start IS NULL
      AND window_end IS NULL
    )
    OR (
      schedule_kind = 'interval'
      AND time_of_day IS NOT NULL
      AND interval_hours BETWEEN 1 AND 24
      AND meal_name IS NULL
      AND meal_relation IS NULL
      AND window_start IS NULL
      AND window_end IS NULL
    )
    OR (
      schedule_kind = 'meal'
      AND time_of_day IS NOT NULL
      AND interval_hours IS NULL
      AND meal_name IN ('breakfast', 'lunch', 'dinner')
      AND meal_relation IN ('before', 'after')
      AND window_start IS NOT NULL
      AND window_end IS NOT NULL
      AND window_start < window_end
    )
  )
);

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.medication_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY medications_select_for_active_members
  ON public.medications
  FOR SELECT
  USING (alaga_private.is_active_patient_member(patient_id));

CREATE POLICY medication_versions_select_for_active_members
  ON public.medication_versions
  FOR SELECT
  USING (alaga_private.is_active_patient_member(patient_id));

CREATE POLICY medication_schedules_select_for_active_members
  ON public.medication_schedules
  FOR SELECT
  USING (alaga_private.is_active_patient_member(patient_id));

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

CREATE OR REPLACE FUNCTION app_api.archive_medication(
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
  SET archived_at = now(), archived_by = account_id
  WHERE id = target_medication_id
    AND patient_id = target_patient_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active medication not found.' USING ERRCODE = 'P0002';
  END IF;
END
$$;

REVOKE ALL ON public.medications, public.medication_versions, public.medication_schedules FROM PUBLIC;
REVOKE ALL ON FUNCTION alaga_private.can_manage_patient_medications(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.save_confirmed_medication(
  uuid, uuid, text, text, text, numeric, text, numeric, text, text, text,
  text, text, text, text, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.archive_medication(uuid, uuid) FROM PUBLIC;

GRANT SELECT ON public.medications, public.medication_versions, public.medication_schedules TO alaga_api;
GRANT EXECUTE ON FUNCTION alaga_private.can_manage_patient_medications(uuid) TO alaga_api;
GRANT EXECUTE ON FUNCTION app_api.save_confirmed_medication(
  uuid, uuid, text, text, text, numeric, text, numeric, text, text, text,
  text, text, text, text, text, jsonb
) TO alaga_api;
GRANT EXECUTE ON FUNCTION app_api.archive_medication(uuid, uuid) TO alaga_api;
