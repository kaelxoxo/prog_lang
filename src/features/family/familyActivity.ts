import { addLocalDays } from '../home/careInsights';
import type { CareCircleMember } from '../invitations/types';
import { manilaDate, type DoseOccurrence } from '../today/types';

/** Recent activity covers today and the six days before it. */
export const ACTIVITY_DAYS = 7;
/** Rows shown before "Show earlier". */
export const ACTIVITY_PREVIEW = 10;

export type ActivityEntry = {
  id: string;
  /** Who recorded it; null when the record carries no name. */
  actor: { kind: 'you' } | { kind: 'member'; name: string } | null;
  medicationName: string;
  status: 'taken' | 'skipped';
  /** A record changed after the fact (it carries a reason). */
  corrected: boolean;
  recordedAt: string;
};

export type ActivityDay = {
  /** Manila calendar day the entries were recorded on (YYYY-MM-DD). */
  date: string;
  relative: 'today' | 'yesterday' | null;
  entries: ActivityEntry[];
};

export type Activity = {
  days: ActivityDay[];
  /** Entries in the week left out by `limit`. */
  hidden: number;
};

type Options = {
  /** Manila calendar day of "now" (YYYY-MM-DD). */
  today: string;
  /**
   * The signed-in account's display name. Doses expose only the recorder's name, so "You" is decided by name.
   */
  viewerName?: string | null;
  limit?: number;
};

/**
 * Taken and skipped records from the last ACTIVITY_DAYS Manila days, newest first and grouped by the day they were
 * recorded. Snoozes and doses nobody recorded are left out.
 */
export function buildActivity(doses: DoseOccurrence[], { today, viewerName, limit = Infinity }: Options): Activity {
  const oldest = addLocalDays(today, -(ACTIVITY_DAYS - 1));
  const viewer = viewerName?.trim();
  const seen = new Set<string>();
  const recorded: { entry: ActivityEntry; date: string; time: number }[] = [];

  for (const dose of doses) {
    if ((dose.status !== 'taken' && dose.status !== 'skipped') || !dose.recordedAt || seen.has(dose.id)) continue;
    const date = manilaDate(new Date(dose.recordedAt));
    if (date < oldest || date > today) continue;
    seen.add(dose.id);
    const name = dose.recordedByName?.trim();
    recorded.push({
      entry: {
        id: dose.id,
        actor: !name ? null : viewer && name === viewer ? { kind: 'you' } : { kind: 'member', name },
        medicationName: dose.medicationName,
        status: dose.status,
        corrected: Boolean(dose.reason),
        recordedAt: dose.recordedAt,
      },
      date,
      time: new Date(dose.recordedAt).getTime(),
    });
  }

  recorded.sort((left, right) => right.time - left.time);
  const shown = recorded.slice(0, limit);
  const yesterday = addLocalDays(today, -1);
  const days: ActivityDay[] = [];
  for (const { date, entry } of shown) {
    const current = days[days.length - 1];
    if (current?.date === date) {
      current.entries.push(entry);
    } else {
      days.push({ date, relative: date === today ? 'today' : date === yesterday ? 'yesterday' : null, entries: [entry] });
    }
  }
  return { days, hidden: recorded.length - shown.length };
}

export type MemberRole = 'owner' | 'medicineManager' | 'caregiver';

/** Primary care manager, Medicine manager, or Caregiver. */
export function memberRole(member: Pick<CareCircleMember, 'role' | 'canManageMedications'>): MemberRole {
  if (member.role === 'owner') return 'owner';
  return member.canManageMedications ? 'medicineManager' : 'caregiver';
}
