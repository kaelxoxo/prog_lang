import assert from 'node:assert/strict';
import test from 'node:test';

import { bantayMoodFor } from '../../src/features/assistant/useAssistantMascotState';
import type { DoseOccurrence, DoseStatus } from '../../src/features/today/types';

const NOW = Date.parse('2026-09-12T10:00:00+08:00');

function dose(id: string, dueAt: string, status: DoseStatus, snoozedUntil: string | null = null): DoseOccurrence {
  return {
    id,
    localDate: '2026-09-12',
    medicationId: 'med-1',
    medicationVersionId: 'ver-1',
    medicationName: 'Losartan',
    strengthValue: 50,
    strengthUnit: 'mg',
    doseQuantity: 1,
    doseUnit: 'tablet',
    medicineForm: 'tablet',
    route: 'oral',
    scheduledFor: dueAt,
    dueAt,
    status,
    eventId: null,
    recordedAt: null,
    recordedByName: null,
    snoozedUntil,
    reason: null,
  };
}

test('Bantay celebrates only once every dose of the day is recorded', () => {
  assert.equal(
    bantayMoodFor([dose('a', '2026-09-12T08:00:00+08:00', 'taken'), dose('b', '2026-09-12T20:00:00+08:00', 'skipped')], NOW),
    'celebration',
  );
  assert.notEqual(
    bantayMoodFor([dose('a', '2026-09-12T08:00:00+08:00', 'taken'), dose('b', '2026-09-12T20:00:00+08:00', 'not_recorded')], NOW),
    'celebration',
    'one recorded dose is not a celebration while another is still open',
  );
});

test('Bantay asks for attention while a dose is Not Recorded', () => {
  assert.equal(bantayMoodFor([dose('a', '2026-09-12T08:00:00+08:00', 'not_recorded')], NOW), 'attention');
  assert.equal(
    bantayMoodFor([dose('a', '2026-09-12T08:00:00+08:00', 'snoozed', '2026-09-12T09:30:00+08:00')], NOW),
    'attention',
    'a snooze that has run out is Not Recorded again',
  );
});

test('Bantay stays idle when nothing needs recording yet', () => {
  assert.equal(bantayMoodFor([], NOW), 'idle', 'a day without doses is not a celebration');
  assert.equal(bantayMoodFor(null, NOW), 'idle');
  assert.equal(bantayMoodFor([dose('a', '2026-09-12T20:00:00+08:00', 'not_recorded')], NOW), 'idle', 'Later Today doses are not Not Recorded');
  assert.equal(
    bantayMoodFor([dose('a', '2026-09-12T08:00:00+08:00', 'snoozed', '2026-09-12T11:00:00+08:00')], NOW),
    'idle',
    'a dose snoozed into the future is waiting, not Not Recorded',
  );
});
