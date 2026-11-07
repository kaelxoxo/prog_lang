import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addLocalDays,
  computeCareStreak,
  findRefillAlerts,
  heroCopy,
  heroState,
  sortHomeDoses,
  type HomeHero,
} from '../../src/features/home/careInsights';
import type { Medication } from '../../src/features/medications/types';
import { translate } from '../../src/features/settings/translations';
import type { DoseOccurrence } from '../../src/features/today/types';

const taken = { status: 'taken' as const };
const skipped = { status: 'skipped' as const };
const unrecorded = { status: 'not_recorded' as const };

/** One tablet a day, every day, with `onHand` tablets counted (null: never counted). */
function medication(displayName: string, onHand: number | null, archivedAt: string | null = null): Medication {
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
    inventory:
      onHand === null
        ? null
        : { onHandQuantity: onHand, unit: 'tablet', lastCountedAt: '2026-09-25T00:00:00.000Z', updatedAt: '2026-09-25T00:00:00.000Z' },
    schedules: [
      {
        id: `s-${displayName}`,
        kind: 'exact',
        timeOfDay: '08:00',
        intervalHours: null,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        mealName: null,
        mealRelation: null,
        windowStart: null,
        windowEnd: null,
        startOn: '2026-09-01',
        endOn: null,
        timeZone: 'Asia/Manila',
      },
    ],
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

function dose(id: string, manilaTime: string, status: DoseOccurrence['status'] = 'not_recorded'): DoseOccurrence {
  const dueAt = new Date(`2026-09-26T${manilaTime}:00+08:00`).toISOString();
  return {
    id,
    localDate: '2026-09-26',
    medicationId: id,
    medicationVersionId: 'v1',
    medicationName: id,
    strengthValue: null,
    strengthUnit: null,
    doseQuantity: 1,
    doseUnit: 'tablet',
    medicineForm: null,
    route: null,
    scheduledFor: dueAt,
    dueAt,
    status,
    eventId: null,
    recordedAt: null,
    recordedByName: null,
    snoozedUntil: null,
    reason: null,
  };
}

describe('sortHomeDoses', () => {
  const noon = new Date('2026-09-26T12:00:00+08:00').getTime();
  const timeline = [
    ...['a', 'b', 'c', 'd', 'e'].map((id) => dose(`08-${id}`, '08:00')),
    dose('0830', '08:30'),
    ...['a', 'b', 'c'].map((id) => dose(`12-${id}`, '12:00')),
    ...['a', 'b', 'c'].map((id) => dose(`18-${id}`, '18:00')),
    ...['a', 'b'].map((id) => dose(`20-${id}`, '20:00')),
  ];

  it('puts passed doses in Time Slots under Due now and keeps evening doses in Later today', () => {
    const sections = sortHomeDoses(timeline, noon);
    assert.deepEqual(
      sections.notRecordedSlots.map((slot) => [slot.at, slot.doses.length]),
      [
        ['2026-09-26T00:00:00.000Z', 5],
        ['2026-09-26T00:30:00.000Z', 1],
        ['2026-09-26T04:00:00.000Z', 3],
      ],
    );
    assert.equal(sections.dueSoon.length, 0);
    assert.deepEqual(sections.laterToday.map((item) => item.id), ['18-a', '18-b', '18-c', '20-a', '20-b']);
  });

  it('lists doses within the next two hours individually and recorded doses separately', () => {
    const sections = sortHomeDoses(
      [dose('soon', '13:30'), dose('edge', '14:00'), dose('later', '14:01'), dose('done', '08:00', 'skipped')],
      noon,
    );
    assert.deepEqual(sections.dueSoon.map((item) => item.id), ['soon', 'edge']);
    assert.deepEqual(sections.laterToday.map((item) => item.id), ['later']);
    assert.deepEqual(sections.recorded.map((item) => item.id), ['done']);
    assert.equal(sections.notRecordedSlots.length, 0);
  });
});

describe('heroState', () => {
  const at = (manilaTime: string) => new Date(`2026-09-26T${manilaTime}:00+08:00`).getTime();
  const demoDay = [
    ...['a', 'b', 'c', 'd', 'e'].map((id) => dose(`08-${id}`, '08:00')),
    dose('0830', '08:30', 'taken'),
    ...['a', 'b', 'c'].map((id) => dose(`12-${id}`, '12:00')),
    dose('Biogesic', '18:00'),
    dose('Losartan', '18:00'),
    dose('Metformin', '18:00'),
    ...['a', 'b'].map((id) => dose(`20-${id}`, '20:00')),
  ];
  const copyFor = (hero: HomeHero, isSelf = false) =>
    heroCopy(hero, {
      t: translate,
      formatTime: (iso) =>
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(iso)),
      patient: 'Lola Rosa',
      isSelf,
    });

  it('counts Not Recorded doses ahead of the next upcoming one', () => {
    const hero = heroState(demoDay, at('14:30'), 4);
    assert.equal(hero.kind, 'notRecorded');
    assert.equal(hero.expression, 'attention');
    const copy = copyFor(hero);
    assert.equal(copy.title, '8 not recorded');
    assert.equal(copy.emphasis, '8');
    assert.equal(copy.detail, "Lola Rosa's 8:00 AM and 12:00 PM doses need a record");
    assert.equal(copy.progress, '1 of 14 recorded · 4-day streak');
    assert.equal(copy.ask, "Ask Bantay about Lola Rosa's medicines…");
  });

  it('names one Time Slot, or the span when three or more need a record, with Self Profile phrasing', () => {
    const oneSlot = heroState([dose('a', '08:00'), dose('b', '08:00'), dose('c', '20:00')], at('09:00'), 0);
    assert.equal(copyFor(oneSlot, true).detail, 'Your 8:00 AM doses need a record');
    assert.equal(copyFor(oneSlot, true).ask, 'Ask Bantay about your medicines…');
    const threeSlots = heroState([dose('a', '08:00'), dose('b', '08:30'), dose('c', '12:00')], at('13:00'), 0);
    assert.equal(copyFor(threeSlots).detail, "Lola Rosa's doses from 8:00 AM to 12:00 PM need a record");
  });

  it('shows the next Time Slot once nothing is Not Recorded', () => {
    const recordedMorning = demoDay.map((item) =>
      new Date(item.dueAt).getTime() < at('14:30') ? { ...item, status: 'taken' as const } : item,
    );
    const hero = heroState(recordedMorning, at('14:30'), 1);
    assert.equal(hero.kind, 'next');
    assert.equal(hero.expression, 'idle');
    const copy = copyFor(hero);
    assert.equal(copy.title, '6:00 PM next');
    assert.equal(copy.emphasis, '6:00 PM');
    assert.equal(copy.detail, "Lola Rosa's Biogesic and 2 others");
    assert.equal(copy.progress, '9 of 14 recorded');
  });

  it('celebrates a fully recorded day and mentions the Care Streak only from two days', () => {
    const allTaken = demoDay.map((item) => ({ ...item, status: 'taken' as const }));
    const hero = heroState(allTaken, at('21:00'), 3);
    assert.equal(hero.kind, 'allRecorded');
    assert.equal(hero.expression, 'celebration');
    const copy = copyFor(hero);
    assert.equal(copy.title, 'All 14 recorded');
    assert.equal(copy.emphasis, 'All 14');
    assert.equal(copy.detail, "Lola Rosa is all set for today. That's 3 days in a row.");
    assert.equal(copy.progress, null);
    assert.equal(copyFor(heroState(allTaken, at('21:00'), 1)).detail, 'Lola Rosa is all set for today.');
  });

  it('treats a day with nothing scheduled as no doses, not all recorded', () => {
    const hero = heroState([], at('09:00'), 5);
    assert.equal(hero.kind, 'noDoses');
    assert.equal(hero.expression, 'idle');
    assert.equal(copyFor(hero).title, 'No doses today');
    assert.equal(copyFor(hero).detail, "Add a medicine to start Lola Rosa's schedule");
    assert.equal(copyFor(hero, true).detail, 'Add a medicine to start your schedule');
  });
});

describe('findRefillAlerts', () => {
  it('lists only active medicines with at most seven days of stock, soonest first', () => {
    const alerts = findRefillAlerts(
      [
        medication('Plenty', 30),
        medication('Week', 7),
        medication('Low', 2),
        medication('Uncounted', null),
        medication('Archived', 1, '2026-09-20T00:00:00.000Z'),
      ],
      '2026-09-26',
    );
    assert.deepEqual(
      alerts.map((alert) => [alert.medication.displayName, alert.daysLeft]),
      [
        ['Low', 2],
        ['Week', 7],
      ],
    );
  });
});
