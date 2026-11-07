import { actionableAt, type DoseOccurrence } from './types';

/** A dose becomes Due Now this long before its (snoozed or scheduled) time. */
export const DUE_NOW_LEAD_MS = 2 * 60 * 60 * 1000;

/** Taken or skipped: a caregiver has recorded what happened. */
export function isRecorded(dose: Pick<DoseOccurrence, 'status'>) {
  return dose.status === 'taken' || dose.status === 'skipped';
}

/** Not recorded and its time has passed (the glossary's Not Recorded status, as shown on screen). */
export function isNotRecorded(dose: DoseOccurrence, now: number) {
  return !isRecorded(dose) && new Date(actionableAt(dose)).getTime() <= now;
}

/** Not recorded, and either passed or within the next two hours. */
export function isDueNow(dose: DoseOccurrence, now: number) {
  return !isRecorded(dose) && new Date(actionableAt(dose)).getTime() - now <= DUE_NOW_LEAD_MS;
}

/** Not recorded and more than two hours away. Recording one is an early recording. */
export function isLaterToday(dose: DoseOccurrence, now: number) {
  return !isRecorded(dose) && !isDueNow(dose, now);
}

export type TimeSlot = {
  /** ISO time shared by every dose in the slot. */
  at: string;
  doses: DoseOccurrence[];
};

/** Groups doses that share one actionable time, in time order. */
export function groupByTimeSlot(doses: DoseOccurrence[]): TimeSlot[] {
  const slots = new Map<string, DoseOccurrence[]>();
  for (const dose of doses) {
    const at = actionableAt(dose);
    const slot = slots.get(at);
    if (slot) slot.push(dose);
    else slots.set(at, [dose]);
  }
  return [...slots.entries()]
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([at, slotDoses]) => ({ at, doses: slotDoses }));
}

export type PartOfDay = 'morning' | 'afternoon' | 'evening';

/** Morning before 12:00, afternoon before 17:00, evening after, in Asia/Manila time. */
export function partOfDay(iso: string): PartOfDay {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Manila' }).format(new Date(iso)),
  );
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
