export type DesiredReminder = {
  dueAt: string;
  occurrenceId: string;
  patientId: string;
};

export type ExistingReminder = DesiredReminder & { identifier: string };

export function planReminderSync(existing: ExistingReminder[], desired: DesiredReminder[]) {
  const desiredByOccurrence = new Map(desired.map((item) => [item.occurrenceId, item]));
  const kept = new Set<string>();
  const cancel: string[] = [];

  for (const item of existing) {
    const target = desiredByOccurrence.get(item.occurrenceId);
    const isExact = target?.patientId === item.patientId && target.dueAt === item.dueAt;
    if (!isExact || kept.has(item.occurrenceId)) {
      cancel.push(item.identifier);
    } else {
      kept.add(item.occurrenceId);
    }
  }

  return {
    cancel,
    schedule: desired.filter((item) => !kept.has(item.occurrenceId)),
  };
}
