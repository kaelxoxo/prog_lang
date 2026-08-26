CREATE OR REPLACE FUNCTION alaga_private.clear_unrecorded_future_dose_occurrences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, alaga_private
AS $$
BEGIN
  IF NEW.version_number <= 1 THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.dose_occurrences AS occurrence
  WHERE occurrence.medication_id = NEW.medication_id
    AND occurrence.local_date > (now() AT TIME ZONE 'Asia/Manila')::date
    AND NOT EXISTS (
      SELECT 1
      FROM public.dose_events AS event
      WHERE event.occurrence_id = occurrence.id
    );

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION alaga_private.clear_unrecorded_future_dose_occurrences() FROM PUBLIC;

CREATE TRIGGER medication_version_refreshes_future_doses
AFTER INSERT ON public.medication_versions
FOR EACH ROW
EXECUTE FUNCTION alaga_private.clear_unrecorded_future_dose_occurrences();
