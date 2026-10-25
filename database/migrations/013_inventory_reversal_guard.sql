-- A correction only restores stock that the original taken dose actually removed.
-- Doses recorded before stock tracking began, or before the latest physical count,
-- are already reflected in the counted quantity and must not be credited back.
CREATE OR REPLACE FUNCTION app_api.apply_inventory_to_dose_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private, app_api
SET row_security = off
AS $$
DECLARE
  deduction public.medication_inventory_events%ROWTYPE;
  occurrence_row public.dose_occurrences%ROWTYPE;
  medication_version public.medication_versions%ROWTYPE;
BEGIN
  IF NEW.corrects_event_id IS NOT NULL THEN
    SELECT event.* INTO deduction
    FROM public.medication_inventory_events AS event
    JOIN public.medication_inventory AS inventory
      ON inventory.medication_id = event.medication_id
     AND inventory.patient_id = event.patient_id
    WHERE event.source_dose_event_id = NEW.corrects_event_id
      AND event.event_kind = 'dose'
      AND event.recorded_at >= inventory.last_counted_at
    FOR UPDATE OF inventory;

    IF deduction.id IS NOT NULL THEN
      PERFORM app_api.apply_medication_inventory_delta(
        deduction.patient_id,
        deduction.medication_id,
        NEW.id,
        'dose_reversal',
        -deduction.quantity_delta,
        deduction.unit,
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

REVOKE ALL ON FUNCTION app_api.apply_inventory_to_dose_event() FROM PUBLIC;
