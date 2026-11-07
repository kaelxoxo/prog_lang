import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildActivity, memberRole } from '../../src/features/family/familyActivity';
import type { DoseOccurrence } from '../../src/features/today/types';

const today = '2026-11-07';

function dose(id: string, overrides: Partial<DoseOccurrence>): DoseOccurrence {
  return {
    id,
    localDate: today,
    medicationId: 'm1',
    medicationVersionId: 'v1',
    medicationName: 'Amlodipine',
    strengthValue: 5,
    strengthUnit: 'mg',
    doseQuantity: 1,
    doseUnit: 'tablet',
    medicineForm: null,
    route: null,
    scheduledFor: '2026-11-07T00:00:00.000Z',
    dueAt: '2026-11-07T00:00:00.000Z',
    status: 'taken',
    eventId: `event-${id}`,
    recordedAt: '2026-11-07T00:10:00.000Z',
    recordedByName: 'Paolo Santos',
    snoozedUntil: null,
    reason: null,
    ...overrides,
  };
}

describe('buildActivity', () => {
  it('lists taken and skipped records newest first, leaving out snoozes and unrecorded doses', () => {
    const activity = buildActivity([
      dose('early', { recordedAt: '2026-11-07T00:10:00.000Z' }),
      dose('snoozed', { status: 'snoozed', recordedAt: '2026-11-07T01:00:00.000Z', snoozedUntil: '2026-11-07T01:30:00.000Z' }),
      dose('open', { status: 'not_recorded', recordedAt: null, recordedByName: null }),
      dose('late', { status: 'skipped', recordedAt: '2026-11-07T02:00:00.000Z' }),
    ], { today });

    assert.deepEqual(activity.days.map((day) => day.entries.map((entry) => [entry.id, entry.status])), [
      [['late', 'skipped'], ['early', 'taken']],
    ]);
    assert.equal(activity.hidden, 0);
  });

  it('groups by the Manila day the record was made, labelling today and yesterday', () => {
    const activity = buildActivity([
      // 00:30 on Nov 7 in Manila, still Nov 6 in UTC.
      dose('after-midnight', { recordedAt: '2026-11-06T16:30:00.000Z' }),
      // 23:59 on Nov 6 in Manila.
      dose('before-midnight', { recordedAt: '2026-11-06T15:59:00.000Z' }),
      dose('thursday', { recordedAt: '2026-11-05T01:00:00.000Z' }),
      // Nov 1 is the oldest of the seven days; Oct 31 falls outside.
      dose('first-day', { recordedAt: '2026-11-01T01:00:00.000Z' }),
      dose('too-old', { recordedAt: '2026-10-31T01:00:00.000Z' }),
    ], { today });

    assert.deepEqual(
      activity.days.map((day) => [day.date, day.relative, day.entries.map((entry) => entry.id)]),
      [
        ['2026-11-07', 'today', ['after-midnight']],
        ['2026-11-06', 'yesterday', ['before-midnight']],
        ['2026-11-05', null, ['thursday']],
        ['2026-11-01', null, ['first-day']],
      ],
    );
  });

  it('marks the viewer\'s own records as You and keeps other recorders by name', () => {
    const activity = buildActivity([
      dose('mine', { recordedByName: 'Maya Santos', recordedAt: '2026-11-07T03:00:00.000Z' }),
      dose('theirs', { recordedByName: 'Paolo Santos', recordedAt: '2026-11-07T02:00:00.000Z' }),
      dose('unknown', { recordedByName: null, recordedAt: '2026-11-07T01:00:00.000Z' }),
    ], { today, viewerName: ' Maya Santos ' });

    assert.deepEqual(activity.days[0].entries.map((entry) => entry.actor), [
      { kind: 'you' },
      { kind: 'member', name: 'Paolo Santos' },
      null,
    ]);
  });

  it('marks records that carry a correction reason as corrections', () => {
    const activity = buildActivity([
      dose('corrected', { status: 'skipped', reason: 'Recorded by mistake', recordedAt: '2026-11-07T03:00:00.000Z' }),
      dose('plain', { recordedAt: '2026-11-07T02:00:00.000Z' }),
    ], { today });

    assert.deepEqual(activity.days[0].entries.map((entry) => [entry.id, entry.status, entry.corrected]), [
      ['corrected', 'skipped', true],
      ['plain', 'taken', false],
    ]);
  });

  it('shows the newest records up to the limit and counts the rest of the week', () => {
    const doses = Array.from({ length: 12 }, (_, index) =>
      dose(`d${index}`, { recordedAt: new Date(Date.UTC(2026, 10, 7 - Math.floor(index / 3), 3, 60 - index)).toISOString() }));

    const preview = buildActivity(doses, { today, limit: 10 });
    assert.equal(preview.days.flatMap((day) => day.entries).length, 10);
    assert.equal(preview.hidden, 2);
    assert.deepEqual(preview.days.flatMap((day) => day.entries).map((entry) => entry.id), doses.slice(0, 10).map((item) => item.id));

    const all = buildActivity(doses, { today });
    assert.equal(all.days.flatMap((day) => day.entries).length, 12);
    assert.equal(all.hidden, 0);
  });

  it('lists a dose once when the today and history responses both carry it', () => {
    const activity = buildActivity([dose('same', {}), dose('same', {})], { today });
    assert.equal(activity.days[0].entries.length, 1);
  });
});

describe('memberRole', () => {
  it('names the owner Primary care manager, medicine managers, and caregivers', () => {
    assert.equal(memberRole({ role: 'owner', canManageMedications: true }), 'owner');
    assert.equal(memberRole({ role: 'caregiver', canManageMedications: true }), 'medicineManager');
    assert.equal(memberRole({ role: 'caregiver', canManageMedications: false }), 'caregiver');
  });
});
