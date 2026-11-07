import type { MascotExpression } from '../assistant/AssistantMascot';
import { estimateInventoryDaysRemaining } from '../medications/inventory';
import type { Medication } from '../medications/types';
import type { CopyKey } from '../settings/translations';
import { groupByTimeSlot, isDueNow, isLaterToday, isNotRecorded, isRecorded, type TimeSlot } from '../today/doseWindows';
import { actionableAt, type DoseOccurrence } from '../today/types';

export type HistoryDay = { date: string; timeline: Pick<DoseOccurrence, 'status'>[] };

/** Home lists a medicine under Refill Horizon once its stock covers this many days or fewer. */
export const REFILL_HORIZON_DAYS = 7;

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

export type HomeDoses = {
  /** Time passed without a record, grouped by Time Slot. */
  notRecordedSlots: TimeSlot[];
  /** Due within the next two hours and not passed yet. */
  dueSoon: DoseOccurrence[];
  /** Taken or skipped today. */
  recorded: DoseOccurrence[];
  /** More than two hours away. */
  laterToday: DoseOccurrence[];
};

/** Splits today's Dose Occurrences into the sections Home shows, each in time order. */
export function sortHomeDoses(timeline: DoseOccurrence[], now: number): HomeDoses {
  const doses = [...timeline].sort(
    (left, right) => new Date(actionableAt(left)).getTime() - new Date(actionableAt(right)).getTime(),
  );
  return {
    notRecordedSlots: groupByTimeSlot(doses.filter((dose) => isNotRecorded(dose, now))),
    dueSoon: doses.filter((dose) => isDueNow(dose, now) && !isNotRecorded(dose, now)),
    recorded: doses.filter(isRecorded),
    laterToday: doses.filter((dose) => isLaterToday(dose, now)),
  };
}

export type RefillAlert = { medication: Medication; daysLeft: number };

/** Active medicines whose recorded stock lasts REFILL_HORIZON_DAYS or fewer, soonest first. */
export function findRefillAlerts(medications: Medication[], today: string): RefillAlert[] {
  const alerts: RefillAlert[] = [];
  for (const medication of medications) {
    if (medication.archivedAt) continue;
    const daysLeft = estimateInventoryDaysRemaining(medication, today);
    if (daysLeft !== null && daysLeft <= REFILL_HORIZON_DAYS) alerts.push({ medication, daysLeft });
  }
  return alerts.sort((left, right) => left.daysLeft - right.daysLeft);
}

export type HomeHero = (
  | { kind: 'notRecorded'; count: number }
  | { kind: 'next'; at: string }
  | { kind: 'allRecorded' }
  | { kind: 'noDoses' }
) & {
  expression: MascotExpression;
  careStreak: number;
};

/**
 * The day's most urgent fact for the Home hero. Not Recorded doses win over the next upcoming one;
 * a day with nothing scheduled is "no doses", never "all recorded".
 */
export function heroState(timeline: DoseOccurrence[], now: number, careStreak: number): HomeHero {
  const total = timeline.length;
  const common = { careStreak };
  if (total === 0) return { kind: 'noDoses', expression: 'idle', ...common };

  const unrecorded = [...timeline]
    .filter((dose) => !isRecorded(dose))
    .sort((left, right) => new Date(actionableAt(left)).getTime() - new Date(actionableAt(right)).getTime());
  const notRecorded = unrecorded.filter((dose) => isNotRecorded(dose, now));
  if (notRecorded.length > 0) {
    return { kind: 'notRecorded', count: notRecorded.length, expression: 'attention', ...common };
  }

  const [nextSlot] = groupByTimeSlot(unrecorded);
  if (nextSlot) return { kind: 'next', at: nextSlot.at, expression: 'idle', ...common };

  return { kind: 'allRecorded', expression: 'celebration', ...common };
}

/** A Care Streak is worth mentioning from two days on. */
export const MIN_STREAK_SHOWN = 2;

/** What Bantay says after his greeting: one short line. `emphasis` is the part drawn in narra, when there is one. */
export type HeroCopy = {
  line: string;
  emphasis: string | null;
};

type CopyContext = {
  t: (key: CopyKey, values?: Record<string, string | number>) => string;
  formatTime: (iso: string) => string;
  /** The Patient's display name; ignored for a Self Profile. */
  patient: string;
  isSelf: boolean;
};

/** Bantay's one line for a state. Self Profile phrasing speaks to "you". */
export function heroCopy(hero: HomeHero, { t, formatTime, patient, isSelf }: CopyContext): HeroCopy {
  switch (hero.kind) {
    case 'notRecorded': {
      const count = String(hero.count);
      const key = isSelf
        ? hero.count === 1 ? 'home.heroToRecordSelfOne' : 'home.heroToRecordSelfMany'
        : hero.count === 1 ? 'home.heroToRecordOne' : 'home.heroToRecordMany';
      return { line: t(key, { patient, count }), emphasis: count };
    }
    case 'next': {
      const time = formatTime(hero.at);
      return { line: t(isSelf ? 'home.heroNextSelf' : 'home.heroNext', { patient, time }), emphasis: time };
    }
    case 'allRecorded': {
      const done = isSelf ? t('home.heroAllSetSelf') : t('home.heroAllSet', { patient });
      const streak = hero.careStreak >= MIN_STREAK_SHOWN ? t('home.heroStreak', { count: hero.careStreak }) : null;
      return { line: streak ? `${done} ${streak}` : done, emphasis: null };
    }
    case 'noDoses':
      return { line: isSelf ? t('home.heroNoDosesSelf') : t('home.heroNoDoses', { patient }), emphasis: null };
  }
}
