export type DoseStatus = 'not_recorded' | 'taken' | 'skipped' | 'snoozed';

export type DoseOccurrence = {
  id: string;
  localDate: string;
  medicationId: string;
  medicationVersionId: string;
  medicationName: string;
  strengthValue: number | null;
  strengthUnit: string | null;
  doseQuantity: number;
  doseUnit: string;
  medicineForm: string | null;
  route: string | null;
  scheduledFor: string;
  dueAt: string;
  status: DoseStatus;
  eventId: string | null;
  recordedAt: string | null;
  recordedByName: string | null;
  snoozedUntil: string | null;
  reason: string | null;
};

export type TimelineResponse = {
  date: string;
  timeline: DoseOccurrence[];
};

export function manilaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
