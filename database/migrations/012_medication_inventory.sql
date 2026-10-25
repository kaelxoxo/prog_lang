CREATE TABLE public.medication_inventory (
  medication_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  on_hand_quantity numeric(12, 4) NOT NULL,
  unit text NOT NULL,
  last_counted_at timestamptz NOT NULL,
  updated_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (medication_id, patient_id),
  CONSTRAINT medication_inventory_medication_fk
    FOREIGN KEY (medication_id, patient_id)
    REFERENCES public.medications(id, patient_id),
  CONSTRAINT medication_inventory_supported_unit
    CHECK (lower(btrim(unit)) IN ('tablet', 'tablets', 'capsule', 'capsules'))
);

CREATE TABLE public.medication_inventory_events (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  medication_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  event_kind text NOT NULL,
  quantity_delta numeric(12, 4),
  quantity_after numeric(12, 4) NOT NULL,
  unit text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES alaga_private.accounts(id),
  client_action_id uuid,
  source_dose_event_id uuid REFERENCES public.dose_events(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medication_inventory_events_medication_fk
    FOREIGN KEY (medication_id, patient_id)
    REFERENCES public.medications(id, patient_id),
  CONSTRAINT medication_inventory_events_kind
    CHECK (event_kind IN ('count', 'refill', 'dose', 'dose_reversal')),
  CONSTRAINT medication_inventory_events_shape CHECK (
    (event_kind = 'count' AND quantity_delta IS NULL AND client_action_id IS NOT NULL AND source_dose_event_id IS NULL)
    OR (event_kind = 'refill' AND quantity_delta > 0 AND client_action_id IS NOT NULL AND source_dose_event_id IS NULL)
    OR (event_kind = 'dose' AND quantity_delta < 0 AND client_action_id IS NULL AND source_dose_event_id IS NOT NULL)
    OR (event_kind = 'dose_reversal' AND quantity_delta > 0 AND client_action_id IS NULL AND source_dose_event_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX medication_inventory_events_client_action_idx
  ON public.medication_inventory_events (client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE UNIQUE INDEX medication_inventory_events_dose_effect_idx
  ON public.medication_inventory_events (source_dose_event_id, event_kind)
  WHERE source_dose_event_id IS NOT NULL;

CREATE INDEX medication_inventory_events_history_idx
  ON public.medication_inventory_events (medication_id, patient_id, recorded_at DESC, id DESC);

ALTER TABLE public.medication_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE public.medication_inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_inventory_events FORCE ROW LEVEL SECURITY;

CREATE POLICY medication_inventory_select_for_active_members
  ON public.medication_inventory
  FOR SELECT
  USING (alaga_private.is_active_patient_member(patient_id));

CREATE POLICY medication_inventory_events_select_for_active_members
  ON public.medication_inventory_events
  FOR SELECT
  USING (alaga_private.is_active_patient_member(patient_id));

CREATE FUNCTION app_api.record_medication_inventory_change(
  target_patient_id uuid,
  target_medication_id uuid,
  requested_kind text,
  requested_quantity numeric,
  requested_client_action_id uuid
)
RETURNS TABLE (
  event_id uuid,
  event_kind text,
  on_hand_quantity numeric,
  unit text,
  last_counted_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private, app_api
SET row_security = off
AS $$
DECLARE
  account_id uuid := alaga_private.current_account_id();
  current_event public.medication_inventory_events%ROWTYPE;
  inventory_row public.medication_inventory%ROWTYPE;
  current_unit text;
  next_quantity numeric(12, 4);
  saved_event_id uuid;
BEGIN
  IF account_id IS NULL OR NOT alaga_private.can_manage_patient_medications(target_patient_id) THEN
    RAISE EXCEPTION 'Medicine-manager permission is required.' USING ERRCODE = '42501';
  END IF;

  IF requested_kind NOT IN ('count', 'refill') THEN
    RAISE EXCEPTION 'Inventory action must be a count or refill.' USING ERRCODE = '22023';
  END IF;

  IF requested_quantity IS NULL OR requested_quantity < 0 OR requested_quantity > 999999
     OR (requested_kind = 'refill' AND requested_quantity = 0) THEN
    RAISE EXCEPTION 'Enter a valid medicine quantity.' USING ERRCODE = '22023';
  END IF;

  IF requested_client_action_id IS NULL THEN
    RAISE EXCEPTION 'Client action ID is required.' USING ERRCODE = '22023';
  END IF;

  SELECT event.* INTO current_event
  FROM public.medication_inventory_events AS event
  WHERE event.client_action_id = requested_client_action_id;

  IF current_event.id IS NOT NULL THEN
    IF current_event.medication_id <> target_medication_id
       OR current_event.patient_id <> target_patient_id
       OR current_event.event_kind <> requested_kind
       OR (requested_kind = 'count' AND current_event.quantity_after <> requested_quantity)
       OR (requested_kind = 'refill' AND current_event.quantity_delta <> requested_quantity) THEN
      RAISE EXCEPTION 'Client action ID was already used for another inventory change.' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY
      SELECT current_event.id, current_event.event_kind, inventory.on_hand_quantity,
             inventory.unit, inventory.last_counted_at, inventory.updated_at
      FROM public.medication_inventory AS inventory
      WHERE inventory.medication_id = target_medication_id
        AND inventory.patient_id = target_patient_id;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.medications AS medication
  WHERE medication.id = target_medication_id
    AND medication.patient_id = target_patient_id
    AND medication.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active medicine not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT version.dose_unit INTO current_unit
  FROM public.medication_versions AS version
  WHERE version.medication_id = target_medication_id
    AND version.patient_id = target_patient_id
  ORDER BY version.version_number DESC
  LIMIT 1;

  IF lower(btrim(current_unit)) NOT IN ('tablet', 'tablets', 'capsule', 'capsules') THEN
    RAISE EXCEPTION 'Stock tracking is available for tablets and capsules.' USING ERRCODE = '22023';
  END IF;

  SELECT inventory.* INTO inventory_row
  FROM public.medication_inventory AS inventory
  WHERE inventory.medication_id = target_medication_id
    AND inventory.patient_id = target_patient_id
  FOR UPDATE;

  IF requested_kind = 'refill' THEN
    IF inventory_row.medication_id IS NULL THEN
      RAISE EXCEPTION 'Record the current stock count before logging a refill.' USING ERRCODE = '22023';
    END IF;
    IF (CASE lower(btrim(inventory_row.unit))
         WHEN 'tablets' THEN 'tablet' WHEN 'capsules' THEN 'capsule' ELSE lower(btrim(inventory_row.unit))
       END) <> (CASE lower(btrim(current_unit))
         WHEN 'tablets' THEN 'tablet' WHEN 'capsules' THEN 'capsule' ELSE lower(btrim(current_unit))
       END) THEN
      RAISE EXCEPTION 'Record a new stock count after changing the dose unit.' USING ERRCODE = '22023';
    END IF;
    next_quantity := inventory_row.on_hand_quantity + requested_quantity;
  ELSE
    next_quantity := requested_quantity;
  END IF;

  INSERT INTO public.medication_inventory_events (
    medication_id, patient_id, event_kind, quantity_delta, quantity_after, unit,
    recorded_by, client_action_id
  ) VALUES (
    target_medication_id,
    target_patient_id,
    requested_kind,
    CASE WHEN requested_kind = 'refill' THEN requested_quantity ELSE NULL END,
    next_quantity,
    current_unit,
    account_id,
    requested_client_action_id
  )
  RETURNING id INTO saved_event_id;

  INSERT INTO public.medication_inventory AS inventory (
    medication_id, patient_id, on_hand_quantity, unit, last_counted_at, updated_by, updated_at
  ) VALUES (
    target_medication_id, target_patient_id, next_quantity, current_unit, now(), account_id, now()
  )
  ON CONFLICT (medication_id, patient_id) DO UPDATE SET
    on_hand_quantity = EXCLUDED.on_hand_quantity,
    unit = EXCLUDED.unit,
    last_counted_at = CASE WHEN requested_kind = 'count' THEN now() ELSE inventory.last_counted_at END,
    updated_by = account_id,
    updated_at = now();

  RETURN QUERY
    SELECT saved_event_id, requested_kind, inventory.on_hand_quantity,
           inventory.unit, inventory.last_counted_at, inventory.updated_at
    FROM public.medication_inventory AS inventory
    WHERE inventory.medication_id = target_medication_id
      AND inventory.patient_id = target_patient_id;
END
$$;

CREATE FUNCTION app_api.apply_medication_inventory_delta(
  target_patient_id uuid,
  target_medication_id uuid,
  target_dose_event_id uuid,
  requested_kind text,
  requested_delta numeric,
  requested_unit text,
  requested_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private, app_api
SET row_security = off
AS $$
DECLARE
  inventory_row public.medication_inventory%ROWTYPE;
  saved_event_id uuid;
BEGIN
  SELECT inventory.* INTO inventory_row
  FROM public.medication_inventory AS inventory
  WHERE inventory.medication_id = target_medication_id
    AND inventory.patient_id = target_patient_id
  FOR UPDATE;

  IF inventory_row.medication_id IS NULL
     OR (CASE lower(btrim(inventory_row.unit))
          WHEN 'tablets' THEN 'tablet' WHEN 'capsules' THEN 'capsule' ELSE lower(btrim(inventory_row.unit))
        END) <> (CASE lower(btrim(requested_unit))
          WHEN 'tablets' THEN 'tablet' WHEN 'capsules' THEN 'capsule' ELSE lower(btrim(requested_unit))
        END) THEN
    RETURN;
  END IF;

  INSERT INTO public.medication_inventory_events (
    medication_id, patient_id, event_kind, quantity_delta, quantity_after, unit,
    recorded_by, source_dose_event_id
  ) VALUES (
    target_medication_id,
    target_patient_id,
    requested_kind,
    requested_delta,
    inventory_row.on_hand_quantity + requested_delta,
    inventory_row.unit,
    requested_actor_id,
    target_dose_event_id
  )
  ON CONFLICT (source_dose_event_id, event_kind) WHERE source_dose_event_id IS NOT NULL DO NOTHING
  RETURNING id INTO saved_event_id;

  IF saved_event_id IS NOT NULL THEN
    UPDATE public.medication_inventory
    SET on_hand_quantity = on_hand_quantity + requested_delta,
        updated_by = requested_actor_id,
        updated_at = now()
    WHERE medication_id = target_medication_id
      AND patient_id = target_patient_id;
  END IF;
END
$$;

CREATE FUNCTION app_api.apply_inventory_to_dose_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private, app_api
SET row_security = off
AS $$
DECLARE
  previous_event public.dose_events%ROWTYPE;
  occurrence_row public.dose_occurrences%ROWTYPE;
  medication_version public.medication_versions%ROWTYPE;
BEGIN
  IF NEW.corrects_event_id IS NOT NULL THEN
    SELECT event.* INTO previous_event
    FROM public.dose_events AS event
    WHERE event.id = NEW.corrects_event_id;

    IF previous_event.id IS NOT NULL AND previous_event.event_kind = 'taken' THEN
      SELECT occurrence.* INTO occurrence_row
      FROM public.dose_occurrences AS occurrence
      WHERE occurrence.id = previous_event.occurrence_id;
      SELECT version.* INTO medication_version
      FROM public.medication_versions AS version
      WHERE version.id = occurrence_row.medication_version_id;

      PERFORM app_api.apply_medication_inventory_delta(
        previous_event.patient_id,
        occurrence_row.medication_id,
        NEW.id,
        'dose_reversal',
        medication_version.dose_quantity,
        medication_version.dose_unit,
        NEW.recorded_by
      );
    END IF;
  END IF;

  IF NEW.event_kind = 'taken' THEN
    SELECT occurrence.* INTO occurrence_row
    FROM public.dose_occurrences AS occurrence
    WHERE occurrence.id = NEW.occurrence_id;
    SELECT version.* INTO medication_version
    FROM public.medication_versions AS version
    WHERE version.id = occurrence_row.medication_version_id;

    PERFORM app_api.apply_medication_inventory_delta(
      NEW.patient_id,
      occurrence_row.medication_id,
      NEW.id,
      'dose',
      -medication_version.dose_quantity,
      medication_version.dose_unit,
      NEW.recorded_by
    );
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER dose_event_updates_medication_inventory
  AFTER INSERT ON public.dose_events
  FOR EACH ROW EXECUTE FUNCTION app_api.apply_inventory_to_dose_event();

REVOKE ALL ON public.medication_inventory, public.medication_inventory_events FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.record_medication_inventory_change(uuid, uuid, text, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.apply_medication_inventory_delta(uuid, uuid, uuid, text, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.apply_inventory_to_dose_event() FROM PUBLIC;

GRANT SELECT ON public.medication_inventory, public.medication_inventory_events TO alaga_api;
GRANT EXECUTE ON FUNCTION app_api.record_medication_inventory_change(uuid, uuid, text, numeric, uuid) TO alaga_api;
