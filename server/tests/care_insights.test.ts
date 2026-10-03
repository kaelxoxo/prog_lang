import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addLocalDays, computeCareStreak, findPlanHorizon } from '../../src/features/home/careInsights';
import type { Medication, MedicationSchedule } from '../../src/features/medications/types';

const taken = { status: 'taken' as const };
const skipped = { status: 'skipped' as const };
const unrecorded = { status: 'not_recorded' as const };

function schedule(endOn: string | null): MedicationSchedule {
  return {
    id: `s-${endOn}`,
    kind: 'exact',
    timeOfDay: '08:00',
    intervalHours: null,
    weekdays: [],
    mealName: null,
    mealRelation: null,
    windowStart: null,
    windowEnd: null,
    startOn: '2026-09-01',
    endOn,
    timeZone: 'Asia/Manila',
  };
}

function medication(displayName: string, endDates: Array<string | null>, archivedAt: string | null = null): Medication {
  return {
    id: displayName,
    archivedAt,
    versionId: 'v1',
    versionNumber: 1,
    displayName,
    genericName: null,
    brandName: null,
    strengthValue: null,
    strengthUnit: null,
    doseQuantity: 1,
    doseUnit: 'tablet',
    medicineForm: null,
    route: null,
    prescriber: null,
    reason: null,
    originalInstructions: null,
    notes: null,
    sourceKind: 'manual',
    status: 'confirmed',
    confirmedAt: '2026-09-01T00:00:00.000Z',
    schedules: endDates.map(schedule),
  };
}

describe('computeCareStreak', () => {
  it('counts consecutive fully recorded days ending today, treating skipped as recorded', () => {
    const history = [
      { date: '2026-09-24', timeline: [taken, skipped] },
      { date: '2026-09-25', timeline: [taken] },
      { date: '2026-09-26', timeline: [taken, taken] },
    ];
    assert.equal(computeCareStreak(history, '2026-09-26'), 3);
  });

  it('does not break the streak for an unfinished today', () => {
    const history = [
      { date: '2026-09-25', timeline: [taken] },
      { date: '2026-09-26', timeline: [taken, unrecorded] },
    ];
    assert.equal(computeCareStreak(history, '2026-09-26'), 1);
  });

  it('stops at the first earlier day with an unrecorded dose', () => {
    const history = [
      { date: '2026-09-23', timeline: [taken] },
      { date: '2026-09-24', timeline: [unrecorded] },
      { date: '2026-09-25', timeline: [taken] },
    ];
    assert.equal(computeCareStreak(history, '2026-09-26'), 1);
  });

  it('skips days with nothing scheduled and ignores future dates', () => {
    const history = [
      { date: '2026-09-24', timeline: [taken] },
      { date: '2026-09-25', timeline: [] },
      { date: '2026-09-27', timeline: [taken] },
    ];
    assert.equal(computeCareStreak(history, '2026-09-26'), 1);
    assert.equal(computeCareStreak([], '2026-09-26'), 0);
  });
});

describe('addLocalDays', () => {
  it('crosses month and year boundaries', () => {
    assert.equal(addLocalDays('2026-10-01', -1), '2026-09-30');
    assert.equal(addLocalDays('2026-12-31', 1), '2027-01-01');
  });
});

describe('findPlanHorizon', () => {
  it('returns the medication whose schedule ends soonest, counting today', () => {
    const horizon = findPlanHorizon(
      [medication('Later', ['2026-10-10']), medication('Sooner', ['2026-09-28', '2026-09-27'])],
      '2026-09-26',
    );
    assert.equal(horizon?.medication.displayName, 'Sooner');
    assert.equal(horizon?.endOn, '2026-09-28');
    assert.equal(horizon?.daysRemaining, 3);
  });

  it('reports the last scheduled day as 1 day left', () => {
    assert.equal(findPlanHorizon([medication('Last', ['2026-09-26'])], '2026-09-26')?.daysRemaining, 1);
  });

  it('ignores open-ended, archived, ended, and schedule-less medications', () => {
    const horizon = findPlanHorizon(
      [
        medication('Ongoing', ['2026-09-27', null]),
        medication('Archived', ['2026-09-27'], '2026-09-20T00:00:00.000Z'),
        medication('Ended', ['2026-09-25']),
        medication('Empty', []),
      ],
      '2026-09-26',
    );
    assert.equal(horizon, null);
  });
});
