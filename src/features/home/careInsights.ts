import type { Medication } from '../medications/types';
import type { DoseOccurrence } from '../today/types';

export type HistoryDay = { date: string; timeline: Pick<DoseOccurrence, 'status'>[] };

export type PlanHorizon = {
  medication: Medication;
  endOn: string;
  /** Calendar days left in the schedule, counting today (the last day reads as 1). */
  daysRemaining: number;
};

function isRecorded(dose: Pick<DoseOccurrence, 'status'>) {
  return dose.status === 'taken' || dose.status === 'skipped';
}

function dayNumber(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Shifts a YYYY-MM-DD calendar date by whole days. */
export function addLocalDays(localDate: string, days: number) {
  return new Date((dayNumber(localDate) + days) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Consecutive days, ending today, on which every scheduled dose was recorded
 * (taken or skipped). Days with no scheduled doses neither extend nor break the
 * streak. An unfinished today does not break it either, because its unrecorded
 * doses are "not recorded yet", never assumed missed.
 */
export function computeCareStreak(history: HistoryDay[], today: string) {
  const days = [...history].filter((day) => day.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;

  for (const day of days) {
    if (day.timeline.length === 0) continue;
    if (day.timeline.every(isRecorded)) {
      streak += 1;
      continue;
    }
    if (day.date === today) continue;
    break;
  }

  return streak;
}

/**
 * The active medication whose schedule ends soonest. A medication with any
 * open-ended schedule is ongoing and never has a horizon.
 */
export function findPlanHorizon(medications: Medication[], today: string): PlanHorizon | null {
  let soonest: PlanHorizon | null = null;

  for (const medication of medications) {
    if (medication.archivedAt || medication.schedules.length === 0) continue;
    if (medication.schedules.some((schedule) => !schedule.endOn)) continue;

    const endOn = medication.schedules
      .map((schedule) => schedule.endOn as string)
      .sort()
      .at(-1) as string;
    if (endOn < today) continue;

    const daysRemaining = dayNumber(endOn) - dayNumber(today) + 1;
    if (!soonest || daysRemaining < soonest.daysRemaining) {
      soonest = { medication, endOn, daysRemaining };
    }
  }

  return soonest;
}
