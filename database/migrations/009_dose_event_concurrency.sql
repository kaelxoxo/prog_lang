CREATE OR REPLACE FUNCTION app_api.record_dose_event(
  target_patient_id uuid,
  target_occurrence_id uuid,
  requested_event_kind text,
  requested_snooze_minutes integer,
  requested_reason text,
  requested_client_action_id uuid,
  requested_corrects_event_id uuid
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
    IF saved_event.occurrence_id <> target_occurrence_id OR saved_event.patient_id <> target_patient_id THEN
      RAISE EXCEPTION 'Client action ID was already used for another dose.' USING ERRCODE = '23505';
    END IF;
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

  -- Re-check saved_event under occurrence row lock in case a concurrent request with the same client_action_id committed while waiting for lock
  SELECT event.* INTO saved_event
  FROM public.dose_events AS event
  WHERE event.client_action_id = requested_client_action_id;

  IF saved_event.id IS NOT NULL THEN
    IF saved_event.occurrence_id <> target_occurrence_id OR saved_event.patient_id <> target_patient_id THEN
      RAISE EXCEPTION 'Client action ID was already used for another dose.' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT saved_event.id, saved_event.event_kind, saved_event.recorded_at, saved_event.snoozed_until;
    RETURN;
  END IF;

  SELECT event.* INTO existing_terminal
  FROM public.dose_events AS event
  WHERE event.occurrence_id = target_occurrence_id
    AND event.event_kind IN ('taken', 'skipped')
  ORDER BY event.recorded_at DESC, event.id DESC
  LIMIT 1;

  IF requested_event_kind NOT IN ('taken', 'skipped', 'snoozed') THEN
    RAISE EXCEPTION 'Dose event kind is invalid.' USING ERRCODE = '22023';
  END IF;

  IF requested_event_kind = 'snoozed'
     AND (requested_snooze_minutes IS NULL OR requested_snooze_minutes NOT IN (15, 30, 60)) THEN
    RAISE EXCEPTION 'Choose a 15, 30, or 60 minute snooze.' USING ERRCODE = '22023';
  END IF;

  IF existing_terminal.id IS NULL AND requested_corrects_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'There is no recorded dose to correct.' USING ERRCODE = '23514';
  END IF;

  IF existing_terminal.id IS NOT NULL THEN
    IF requested_corrects_event_id IS NULL THEN
      RAISE EXCEPTION 'This dose was already recorded.' USING ERRCODE = '23505';
    END IF;
    IF requested_corrects_event_id <> existing_terminal.id THEN
      RAISE EXCEPTION 'This care record changed. Review it before correcting.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF requested_corrects_event_id IS NOT NULL
     AND (requested_event_kind = 'snoozed' OR nullif(btrim(requested_reason), '') IS NULL) THEN
    RAISE EXCEPTION 'A correction needs a taken or skipped status and a reason.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dose_events (
    occurrence_id,
    patient_id,
    event_kind,
    snoozed_until,
    reason,
    recorded_by,
    client_action_id,
    corrects_event_id
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
    requested_client_action_id,
    requested_corrects_event_id
  )
  RETURNING * INTO saved_event;

  RETURN QUERY SELECT saved_event.id, saved_event.event_kind, saved_event.recorded_at, saved_event.snoozed_until;
END
$$;

REVOKE ALL ON FUNCTION app_api.record_dose_event(uuid, uuid, text, integer, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_api.record_dose_event(uuid, uuid, text, integer, text, uuid, uuid) TO alaga_api;
