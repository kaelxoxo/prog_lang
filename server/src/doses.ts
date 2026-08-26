import type { PoolClient } from 'pg';

type ScheduleRow = {
  medication_id: string;
  medication_version_id: string;
  schedule_id: string;
  schedule_kind: 'exact' | 'interval' | 'meal';
  time_of_day: string;
  interval_hours: number | null;
};

type TimelineRow = {
  occurrence_id: string;
  medication_id: string;
  medication_version_id: string;
  medication_name: string;
  strength_value: string | null;
  strength_unit: string | null;
  dose_quantity: string;
  dose_unit: string;
  medicine_form: string | null;
  route: string | null;
  scheduled_for: Date;
  due_at: Date;
  record_status: 'not_recorded' | 'taken' | 'skipped' | 'snoozed';
  event_id: string | null;
  recorded_at: Date | null;
  recorded_by_name: string | null;
  snoozed_until: Date | null;
  reason: string | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validatedLocalDate(value: unknown, label = 'Date') {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a real calendar date.`);
  }
  return value;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function intervalTimes(anchor: string, intervalHours: number) {
  const [hours, minutes] = anchor.slice(0, 5).split(':').map(Number);
  const times: string[] = [];
  for (let current = hours * 60 + minutes; current < 24 * 60; current += intervalHours * 60) {
    times.push(`${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`);
  }
  return times;
}

async function activeSchedules(client: PoolClient, patientId: string, localDate: string) {
  const result = await client.query<ScheduleRow>(
    `SELECT
       medication.id AS medication_id,
       version.id AS medication_version_id,
       schedule.id AS schedule_id,
       schedule.schedule_kind,
       schedule.time_of_day::text,
       schedule.interval_hours
     FROM public.medications AS medication
     JOIN LATERAL (
       SELECT candidate.*
       FROM public.medication_versions AS candidate
       WHERE candidate.medication_id = medication.id
       ORDER BY candidate.version_number DESC
       LIMIT 1
     ) AS version ON true
     JOIN public.medication_schedules AS schedule
       ON schedule.medication_version_id = version.id
      AND schedule.patient_id = medication.patient_id
     WHERE medication.patient_id = $1
       AND medication.archived_at IS NULL
       AND $2::date >= schedule.start_on
       AND (schedule.end_on IS NULL OR $2::date <= schedule.end_on)
       AND extract(dow FROM $2::date)::smallint = ANY(schedule.weekdays)
     ORDER BY medication.id, schedule.time_of_day, schedule.id`,
    [patientId, localDate],
  );
  return result.rows;
}

async function materializeDate(client: PoolClient, patientId: string, localDate: string) {
  const schedules = await activeSchedules(client, patientId, localDate);

  for (const schedule of schedules) {
    const times = schedule.schedule_kind === 'interval'
      ? intervalTimes(schedule.time_of_day, schedule.interval_hours || 1)
      : [schedule.time_of_day.slice(0, 5)];

    for (const time of times) {
      await client.query(
        'SELECT app_api.ensure_dose_occurrence($1, $2, $3, $4, $5, $6)',
        [
          patientId,
          schedule.medication_id,
          schedule.medication_version_id,
          schedule.schedule_id,
          localDate,
          time,
        ],
      );
    }
  }
}

function timelineJson(row: TimelineRow, localDate: string) {
  return {
    id: row.occurrence_id,
    localDate,
    medicationId: row.medication_id,
    medicationVersionId: row.medication_version_id,
    medicationName: row.medication_name,
    strengthValue: row.strength_value === null ? null : Number(row.strength_value),
    strengthUnit: row.strength_unit,
    doseQuantity: Number(row.dose_quantity),
    doseUnit: row.dose_unit,
    medicineForm: row.medicine_form,
    route: row.route,
    scheduledFor: row.scheduled_for,
    dueAt: row.due_at,
    status: row.record_status,
    eventId: row.event_id,
    recordedAt: row.recorded_at,
    recordedByName: row.recorded_by_name,
    snoozedUntil: row.snoozed_until,
    reason: row.reason,
  };
}

type TimelineJson = ReturnType<typeof timelineJson>;

export async function timelineForDate(client: PoolClient, patientId: string, localDate: string) {
  await materializeDate(client, patientId, localDate);
  const result = await client.query<TimelineRow>(
    'SELECT * FROM app_api.patient_dose_timeline($1, $2)',
    [patientId, localDate],
  );
  return result.rows.map((row) => timelineJson(row, localDate));
}

export async function timelineForRange(
  client: PoolClient,
  patientId: string,
  firstDate: string,
  days: number,
) {
  const timeline: TimelineJson[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    timeline.push(...await timelineForDate(client, patientId, addDays(firstDate, offset)));
  }
  return timeline;
}
