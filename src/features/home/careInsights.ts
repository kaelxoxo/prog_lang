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
  | { kind: 'notRecorded'; count: number; slotTimes: string[] }
  | { kind: 'next'; at: string; medicines: string[] }
  | { kind: 'allRecorded' }
  | { kind: 'noDoses' }
) & {
  expression: MascotExpression;
  recorded: number;
  total: number;
  careStreak: number;
};

/**
 * The day's most urgent fact for the Home hero. Not Recorded doses win over the next upcoming one;
 * a day with nothing scheduled is "no doses", never "all recorded".
 */
export function heroState(timeline: DoseOccurrence[], now: number, careStreak: number): HomeHero {
  const total = timeline.length;
  const recorded = timeline.filter(isRecorded).length;
  const common = { recorded, total, careStreak };
  if (total === 0) return { kind: 'noDoses', expression: 'idle', ...common };

  const unrecorded = [...timeline]
    .filter((dose) => !isRecorded(dose))
    .sort((left, right) => new Date(actionableAt(left)).getTime() - new Date(actionableAt(right)).getTime());
  const notRecorded = unrecorded.filter((dose) => isNotRecorded(dose, now));
  if (notRecorded.length > 0) {
    return {
      kind: 'notRecorded',
      count: notRecorded.length,
      slotTimes: groupByTimeSlot(notRecorded).map((slot) => slot.at),
      expression: 'attention',
      ...common,
    };
  }

  const [nextSlot] = groupByTimeSlot(unrecorded);
  if (nextSlot) {
    return {
      kind: 'next',
      at: nextSlot.at,
      medicines: [...new Set(nextSlot.doses.map((dose) => dose.medicationName))],
      expression: 'idle',
      ...common,
    };
  }

  return { kind: 'allRecorded', expression: 'celebration', ...common };
}

/** A Care Streak is worth mentioning from two days on. */
export const MIN_STREAK_SHOWN = 2;

export type HeroCopy = {
  /** The big line, e.g. "8 not recorded". */
  title: string;
  /** The part of `title` drawn in narra, e.g. "8". */
  emphasis: string;
  /** Names the Patient, e.g. "Lola Rosa's 8:00 AM and 12:00 PM doses need a record". */
  detail: string;
  /** "6 of 14 recorded · 3-day streak" while doses remain; null otherwise. */
  progress: string | null;
  /** Placeholder of the chat box. */
  ask: string;
};

type CopyContext = {
  t: (key: CopyKey, values?: Record<string, string | number>) => string;
  formatTime: (iso: string) => string;
  /** The Patient's display name; ignored for a Self Profile. */
  patient: string;
  isSelf: boolean;
};

/** The hero's words for a state. Self Profile phrasing uses "your" instead of the name. */
export function heroCopy(hero: HomeHero, { t, formatTime, patient, isSelf }: CopyContext): HeroCopy {
  const whose = isSelf ? t('shell.your') : t('home.heroWhose', { patient });
  const ask = isSelf ? t('home.heroAskSelf') : t('home.heroAsk', { patient });
  const streak = hero.careStreak >= MIN_STREAK_SHOWN ? hero.careStreak : null;
  const progress = [
    t('home.recordedCount', { handled: hero.recorded, total: hero.total }),
    streak ? t('home.streak', { count: streak }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  switch (hero.kind) {
    case 'notRecorded': {
      const times = hero.slotTimes.map(formatTime);
      const detail =
        times.length === 1
          ? t(hero.count === 1 ? 'home.heroSlotOne' : 'home.heroSlotMany', { whose, time: times[0] })
          : times.length === 2
            ? t('home.heroSlotsTwo', { whose, first: times[0], second: times[1] })
            : t('home.heroSlotsRange', { whose, first: times[0], last: times[times.length - 1] });
      const emphasis = String(hero.count);
      return { title: t('home.heroNotRecorded', { count: emphasis }), emphasis, detail, progress, ask };
    }
    case 'next': {
      const [medicine] = hero.medicines;
      const others = hero.medicines.length - 1;
      const detail = t(
        others === 0 ? 'home.heroNextOne' : others === 1 ? 'home.heroNextOneOther' : 'home.heroNextOthers',
        { whose, medicine, count: others },
      );
      const emphasis = formatTime(hero.at);
      return { title: t('home.heroNext', { time: emphasis }), emphasis, detail, progress, ask };
    }
    case 'allRecorded': {
      const emphasis = t('home.heroAllCount', { count: hero.total });
      const detail = [
        isSelf ? t('home.heroAllSetSelf') : t('home.heroAllSet', { patient }),
        streak ? t('home.heroStreak', { count: streak }) : null,
      ]
        .filter(Boolean)
        .join(' ');
      return { title: t('home.heroAllRecorded', { all: emphasis }), emphasis, detail, progress: null, ask };
    }
    case 'noDoses': {
      const emphasis = t('home.heroNoDosesEmphasis');
      return {
        title: t('home.heroNoDoses', { none: emphasis }),
        emphasis,
        detail: isSelf ? t('home.heroAddFirstSelf') : t('home.heroAddFirst', { patient }),
        progress: null,
        ask,
      };
    }
  }
}
