import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planReminderSync } from '../../src/features/reminders/planner';

test('Milestone 5 reminder planning keeps one exact reminder and replaces duplicates or stale times', () => {
  const desired = [
    { occurrenceId: 'dose-a', patientId: 'patient-a', dueAt: '2026-08-25T00:00:00.000Z' },
    { occurrenceId: 'dose-b', patientId: 'patient-a', dueAt: '2026-08-25T12:00:00.000Z' },
  ];
  const plan = planReminderSync([
    { ...desired[0], identifier: 'keep-a' },
    { ...desired[0], identifier: 'duplicate-a' },
    { occurrenceId: 'dose-b', patientId: 'patient-a', dueAt: '2026-08-25T11:00:00.000Z', identifier: 'stale-b' },
    { occurrenceId: 'removed-dose', patientId: 'patient-a', dueAt: '2026-08-25T13:00:00.000Z', identifier: 'removed' },
  ], desired);

  assert.deepEqual(plan.cancel.sort(), ['duplicate-a', 'removed', 'stale-b']);
  assert.deepEqual(plan.schedule, [desired[1]]);
});
