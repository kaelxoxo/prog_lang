ALTER TABLE public.medication_schedules
  ADD CONSTRAINT medication_schedules_identity
  UNIQUE (id, medication_version_id, patient_id);

CREATE TABLE public.dose_occurrences (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  patient_id uuid NOT NULL,
  medication_id uuid NOT NULL,
  medication_version_id uuid NOT NULL,
  medication_schedule_id uuid NOT NULL,
  local_date date NOT NULL,
  scheduled_time time NOT NULL,
  scheduled_for timestamptz NOT NULL,
  materialized_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dose_occurrences_medication_fk
    FOREIGN KEY (medication_id, patient_id)
    REFERENCES public.medications(id, patient_id),
  CONSTRAINT dose_occurrences_version_fk
    FOREIGN KEY (medication_version_id, patient_id)
    REFERENCES public.medication_versions(id, patient_id),
  CONSTRAINT dose_occurrences_schedule_fk
    FOREIGN KEY (medication_schedule_id, medication_version_id, patient_id)
    REFERENCES public.medication_schedules(id, medication_version_id, patient_id),
  UNIQUE (medication_schedule_id, local_date, scheduled_time),
  UNIQUE (id, patient_id)
);

CREATE INDEX dose_occurrences_patient_day_idx
  ON public.dose_occurrences (patient_id, local_date, scheduled_for, id);

CREATE TABLE public.dose_events (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  occurrence_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  event_kind text NOT NULL,
  snoozed_until timestamptz,
  reason text,
  recorded_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  client_action_id uuid NOT NULL UNIQUE,
  CONSTRAINT dose_events_occurrence_fk
    FOREIGN KEY (occurrence_id, patient_id)
    REFERENCES public.dose_occurrences(id, patient_id),
  CONSTRAINT dose_events_kind CHECK (event_kind IN ('taken', 'skipped', 'snoozed')),
  CONSTRAINT dose_events_shape CHECK (
    (event_kind = 'snoozed' AND snoozed_until IS NOT NULL)
    OR (event_kind IN ('taken', 'skipped') AND snoozed_until IS NULL)
  ),
  CONSTRAINT dose_events_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE UNIQUE INDEX dose_events_one_terminal_event
  ON public.dose_events (occurrence_id)
  WHERE event_kind IN ('taken', 'skipped');

CREATE INDEX dose_events_occurrence_history_idx
  ON public.dose_events (occurrence_id, recorded_at DESC, id DESC);

ALTER TABLE public.dose_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dose_occurrences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dose_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dose_events FORCE ROW LEVEL SECURITY;

CREATE POLICY dose_occurrences_select_for_active_members
  ON public.dose_occurrences
  FOR SELECT
  USING (alaga_private.is_active_patient_member(patient_id));

CREATE POLICY dose_events_select_for_active_members
  ON public.dose_events
  FOR SELECT
  USING (alaga_private.is_active_patient_member(patient_id));

CREATE OR REPLACE FUNCTION app_api.ensure_dose_occurrence(
  target_patient_id uuid,
  target_medication_id uuid,
  target_version_id uuid,
  target_schedule_id uuid,
  target_local_date date,
  target_scheduled_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  account_id uuid := alaga_private.current_account_id();
  schedule_row public.medication_schedules%ROWTYPE;
  existing_version_id uuid;
  saved_occurrence_id uuid;
  weekday smallint;
  interval_minutes integer;
  requested_minutes integer;
  anchor_minutes integer;
BEGIN
  IF account_id IS NULL OR NOT alaga_private.is_active_patient_member(target_patient_id) THEN
    RAISE EXCEPTION 'Active patient membership is required.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.medications
  WHERE id = target_medication_id AND patient_id = target_patient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Medication not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT schedule.* INTO schedule_row
  FROM public.medication_schedules AS schedule
  JOIN public.medication_versions AS version
    ON version.id = schedule.medication_version_id
   AND version.patient_id = schedule.patient_id
  WHERE schedule.id = target_schedule_id
    AND schedule.medication_version_id = target_version_id
    AND schedule.patient_id = target_patient_id
    AND version.medication_id = target_medication_id;

  IF schedule_row.id IS NULL THEN
    RAISE EXCEPTION 'Confirmed medication schedule not found.' USING ERRCODE = 'P0002';
  END IF;

  weekday := extract(dow FROM target_local_date)::smallint;
  IF target_local_date < schedule_row.start_on
     OR (schedule_row.end_on IS NOT NULL AND target_local_date > schedule_row.end_on)
     OR NOT weekday = ANY(schedule_row.weekdays) THEN
    RAISE EXCEPTION 'The schedule is not active on that date.' USING ERRCODE = '22023';
  END IF;

  IF schedule_row.schedule_kind IN ('exact', 'meal')
     AND target_scheduled_time <> schedule_row.time_of_day THEN
    RAISE EXCEPTION 'The requested time does not match the confirmed schedule.' USING ERRCODE = '22023';
  END IF;

  IF schedule_row.schedule_kind = 'interval' THEN
    interval_minutes := schedule_row.interval_hours * 60;
    requested_minutes := extract(hour FROM target_scheduled_time)::integer * 60
      + extract(minute FROM target_scheduled_time)::integer;
    anchor_minutes := extract(hour FROM schedule_row.time_of_day)::integer * 60
      + extract(minute FROM schedule_row.time_of_day)::integer;
    IF requested_minutes < anchor_minutes
       OR mod(requested_minutes - anchor_minutes, interval_minutes) <> 0 THEN
      RAISE EXCEPTION 'The requested time does not match the confirmed interval.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT occurrence.medication_version_id INTO existing_version_id
  FROM public.dose_occurrences AS occurrence
  WHERE occurrence.medication_id = target_medication_id
    AND occurrence.local_date = target_local_date
  LIMIT 1;

  IF existing_version_id IS NOT NULL AND existing_version_id <> target_version_id THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.dose_occurrences (
    patient_id,
    medication_id,
    medication_version_id,
    medication_schedule_id,
    local_date,
    scheduled_time,
    scheduled_for,
    materialized_by
  )
  VALUES (
    target_patient_id,
    target_medication_id,
    target_version_id,
    target_schedule_id,
    target_local_date,
    target_scheduled_time,
    (target_local_date + target_scheduled_time) AT TIME ZONE schedule_row.time_zone,
    account_id
  )
  ON CONFLICT (medication_schedule_id, local_date, scheduled_time) DO NOTHING
  RETURNING id INTO saved_occurrence_id;

  IF saved_occurrence_id IS NULL THEN
    SELECT occurrence.id INTO saved_occurrence_id
    FROM public.dose_occurrences AS occurrence
    WHERE occurrence.medication_schedule_id = target_schedule_id
      AND occurrence.local_date = target_local_date
      AND occurrence.scheduled_time = target_scheduled_time;
  END IF;

  RETURN saved_occurrence_id;
END
$$;

CREATE OR REPLACE FUNCTION app_api.record_dose_event(
  target_patient_id uuid,
  target_occurrence_id uuid,
  requested_event_kind text,
  requested_snooze_minutes integer,
  requested_reason text,
  requested_client_action_id uuid
)
RETURNS TABLE (
  event_id uuid,
  event_kind text,
  recorded_at timestamptz,
  snoozed_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
DECLARE
  account_id uuid := alaga_private.current_account_id();
  saved_event public.dose_events%ROWTYPE;
  existing_terminal public.dose_events%ROWTYPE;
BEGIN
  IF account_id IS NULL OR NOT alaga_private.is_active_patient_member(target_patient_id) THEN
    RAISE EXCEPTION 'Active patient membership is required.' USING ERRCODE = '42501';
  END IF;

  SELECT event.* INTO saved_event
  FROM public.dose_events AS event
  WHERE event.client_action_id = requested_client_action_id;

  IF saved_event.id IS NOT NULL THEN
    RETURN QUERY SELECT saved_event.id, saved_event.event_kind, saved_event.recorded_at, saved_event.snoozed_until;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.dose_occurrences
  WHERE id = target_occurrence_id AND patient_id = target_patient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dose occurrence not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT event.* INTO existing_terminal
  FROM public.dose_events AS event
  WHERE event.occurrence_id = target_occurrence_id
    AND event.event_kind IN ('taken', 'skipped')
  LIMIT 1;

  IF existing_terminal.id IS NOT NULL THEN
    RAISE EXCEPTION 'This dose was already recorded.' USING ERRCODE = '23505';
  END IF;

  IF requested_event_kind NOT IN ('taken', 'skipped', 'snoozed') THEN
    RAISE EXCEPTION 'Dose event kind is invalid.' USING ERRCODE = '22023';
  END IF;

  IF requested_event_kind = 'snoozed'
     AND (requested_snooze_minutes IS NULL OR requested_snooze_minutes NOT IN (15, 30, 60)) THEN
    RAISE EXCEPTION 'Choose a 15, 30, or 60 minute snooze.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dose_events (
    occurrence_id,
    patient_id,
    event_kind,
    snoozed_until,
    reason,
    recorded_by,
    client_action_id
  )
  VALUES (
    target_occurrence_id,
    target_patient_id,
    requested_event_kind,
    CASE WHEN requested_event_kind = 'snoozed'
      THEN now() + make_interval(mins => requested_snooze_minutes)
      ELSE NULL
    END,
    nullif(btrim(requested_reason), ''),
    account_id,
    requested_client_action_id
  )
  RETURNING * INTO saved_event;

  RETURN QUERY SELECT saved_event.id, saved_event.event_kind, saved_event.recorded_at, saved_event.snoozed_until;
END
$$;

CREATE OR REPLACE FUNCTION app_api.patient_dose_timeline(
  target_patient_id uuid,
  target_local_date date
)
RETURNS TABLE (
  occurrence_id uuid,
  medication_id uuid,
  medication_version_id uuid,
  medication_name text,
  strength_value numeric,
  strength_unit text,
  dose_quantity numeric,
  dose_unit text,
  medicine_form text,
  route text,
  scheduled_for timestamptz,
  due_at timestamptz,
  record_status text,
  event_id uuid,
  recorded_at timestamptz,
  recorded_by_name text,
  snoozed_until timestamptz,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
BEGIN
  IF NOT alaga_private.is_active_patient_member(target_patient_id) THEN
    RAISE EXCEPTION 'Active patient membership is required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      occurrence.id,
      occurrence.medication_id,
      occurrence.medication_version_id,
      version.display_name,
      version.strength_value,
      version.strength_unit,
      version.dose_quantity,
      version.dose_unit,
      version.medicine_form,
      version.route,
      occurrence.scheduled_for,
      coalesce(latest_event.snoozed_until, occurrence.scheduled_for),
      coalesce(latest_event.event_kind, 'not_recorded'::text),
      latest_event.id,
      latest_event.recorded_at,
      actor.display_name,
      latest_event.snoozed_until,
      latest_event.reason
    FROM public.dose_occurrences AS occurrence
    JOIN public.medications AS medication ON medication.id = occurrence.medication_id
    JOIN public.medication_versions AS version ON version.id = occurrence.medication_version_id
    LEFT JOIN LATERAL (
      SELECT event.*
      FROM public.dose_events AS event
      WHERE event.occurrence_id = occurrence.id
      ORDER BY event.recorded_at DESC, event.id DESC
      LIMIT 1
    ) AS latest_event ON true
    LEFT JOIN alaga_private.accounts AS actor ON actor.id = latest_event.recorded_by
    WHERE occurrence.patient_id = target_patient_id
      AND occurrence.local_date = target_local_date
      AND (medication.archived_at IS NULL OR latest_event.event_kind IN ('taken', 'skipped'))
    ORDER BY coalesce(latest_event.snoozed_until, occurrence.scheduled_for), occurrence.id;
END
$$;

REVOKE ALL ON public.dose_occurrences, public.dose_events FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.ensure_dose_occurrence(uuid, uuid, uuid, uuid, date, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.record_dose_event(uuid, uuid, text, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.patient_dose_timeline(uuid, date) FROM PUBLIC;

GRANT SELECT ON public.dose_occurrences, public.dose_events TO alaga_api;
GRANT EXECUTE ON FUNCTION app_api.ensure_dose_occurrence(uuid, uuid, uuid, uuid, date, time) TO alaga_api;
GRANT EXECUTE ON FUNCTION app_api.record_dose_event(uuid, uuid, text, integer, text, uuid) TO alaga_api;
GRANT EXECUTE ON FUNCTION app_api.patient_dose_timeline(uuid, date) TO alaga_api;
