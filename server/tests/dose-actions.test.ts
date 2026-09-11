import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createAppServer } from '../src/app';
import { setupConfig } from '../src/config';
import { databasePool } from '../src/database';
import { planReminderSync } from '../../src/features/reminders/planner';
import { actionableAt } from '../../src/features/today/types';

const { Client } = pg;
const server = createAppServer(databasePool);
let baseUrl = '';

type ApiResult<T> = { status: number; body: T };
type AuthResult = {
  token: string;
  account: { id: string; email: string; displayName: string };
};

type Dose = {
  id: string;
  medicationId: string;
  medicationVersionId: string;
  medicationName: string;
  doseQuantity: number;
  status: 'not_recorded' | 'taken' | 'skipped' | 'snoozed';
  dueAt: string;
  snoozedUntil: string | null;
  recordedByName: string | null;
  reason: string | null;
};

function adminDatabaseUrl() {
  const url = new URL(setupConfig.adminUrl);
  url.pathname = `/${setupConfig.databaseName}`;
  return url.toString();
}

function manilaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function api<T>(
  path: string,
  options: { body?: unknown; method?: 'GET' | 'POST'; token?: string } = {},
): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  return { status: response.status, body: (await response.json()) as T };
}

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await databasePool.end();
});

test('Duplicate dose actions, correction history, snooze timing, and reminder de-duplication', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'local-test-password-123';
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();

  const careDate = manilaDate();

  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Dose Actions Owner', email: `dose-owner-${suffix}@example.test`, password },
  });
  assert.equal(owner.status, 201);
  const token = owner.body.token;

  const patient = await api<{ patient: { id: string } }>('/patients', {
    method: 'POST',
    token,
    body: { displayName: 'Dose Actions Patient' },
  });
  assert.equal(patient.status, 201);
  const patientId = patient.body.patient.id;

  // Create two medicines to have multiple occurrences
  const med1 = await api<{ medicationId: string }>(`/patients/${patientId}/medications`, {
    method: 'POST',
    token,
    body: {
      displayName: 'Aspirin',
      strengthValue: 81,
      strengthUnit: 'mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      schedules: [
        {
          kind: 'exact',
          timeOfDay: '08:00',
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          startOn: careDate,
          endOn: '',
          timeZone: 'Asia/Manila',
        },
      ],
    },
  });
  assert.equal(med1.status, 201);

  const med2 = await api<{ medicationId: string }>(`/patients/${patientId}/medications`, {
    method: 'POST',
    token,
    body: {
      displayName: 'Simvastatin',
      strengthValue: 20,
      strengthUnit: 'mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      schedules: [
        {
          kind: 'exact',
          timeOfDay: '20:00',
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          startOn: careDate,
          endOn: '',
          timeZone: 'Asia/Manila',
        },
      ],
    },
  });
  assert.equal(med2.status, 201);

  try {
    const today = await api<{ timeline: Dose[] }>(
      `/patients/${patientId}/today?date=${careDate}`,
      { token },
    );
    assert.equal(today.status, 200);
    assert.equal(today.body.timeline.length, 2);
    const occurrenceAspirin = today.body.timeline.find((d) => d.medicationName === 'Aspirin')!;
    const occurrenceSimvastatin = today.body.timeline.find((d) => d.medicationName === 'Simvastatin')!;

    // 1. Idempotency of dose recording
    const clientActionId1 = randomUUID();
    const takeDose = await api<{ event: { id: string; kind: string; recordedAt: string } }>(
      `/patients/${patientId}/doses/${occurrenceAspirin.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'taken', clientActionId: clientActionId1 },
      },
    );
    assert.equal(takeDose.status, 201);
    assert.equal(takeDose.body.event.kind, 'taken');
    const event1Id = takeDose.body.event.id;

    // Re-send the exact same clientActionId (network retry simulation)
    const retryDose = await api<{ event: { id: string; kind: string; recordedAt: string } }>(
      `/patients/${patientId}/doses/${occurrenceAspirin.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'taken', clientActionId: clientActionId1 },
      },
    );
    assert.equal(retryDose.status, 201);
    assert.equal(retryDose.body.event.id, event1Id);
    assert.equal(retryDose.body.event.recordedAt, takeDose.body.event.recordedAt);

    // Verify DB has exactly 1 row with clientActionId1
    const eventCount = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.dose_events WHERE client_action_id = $1',
      [clientActionId1],
    );
    assert.equal(eventCount.rows[0]?.count, '1');

    // Attempting to reuse clientActionId1 on a different occurrence returns 409
    const crossOccurrenceReuse = await api<{ error: string }>(
      `/patients/${patientId}/doses/${occurrenceSimvastatin.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'taken', clientActionId: clientActionId1 },
      },
    );
    assert.equal(crossOccurrenceReuse.status, 409);
    assert.match(crossOccurrenceReuse.body.error, /already used for another dose/i);

    // Attempting a conflicting terminal event without correctsEventId returns 409
    const conflictSkip = await api<{ error: string }>(
      `/patients/${patientId}/doses/${occurrenceAspirin.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'skipped', clientActionId: randomUUID() },
      },
    );
    assert.equal(conflictSkip.status, 409);
    assert.match(conflictSkip.body.error, /already recorded/i);

    // Attempting another taken event with different clientActionId returns 409
    const duplicateTake = await api<{ error: string }>(
      `/patients/${patientId}/doses/${occurrenceAspirin.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'taken', clientActionId: randomUUID() },
      },
    );
    assert.equal(duplicateTake.status, 409);
    assert.match(duplicateTake.body.error, /already recorded/i);

    // 2. Correction history & immutable audit logging
    // Attempt correction without reason is rejected
    const correctionNoReason = await api<{ error: string }>(
      `/patients/${patientId}/doses/${occurrenceAspirin.id}/events`,
      {
        method: 'POST',
        token,
        body: {
          kind: 'skipped',
          correctsEventId: event1Id,
          reason: '   ',
          clientActionId: randomUUID(),
        },
      },
    );
    assert.equal(correctionNoReason.status, 400);

    // Attempt correction with 'snoozed' kind is rejected
    const correctionSnooze = await api<{ error: string }>(
      `/patients/${patientId}/doses/${occurrenceAspirin.id}/events`,
      {
        method: 'POST',
        token,
        body: {
          kind: 'snoozed',
          snoozeMinutes: 15,
          correctsEventId: event1Id,
          reason: 'Correction reason',
          clientActionId: randomUUID(),
        },
      },
    );
    assert.equal(correctionSnooze.status, 400);

    // Valid correction with reason and correctsEventId
    const correctionActionId = randomUUID();
    const correctDose = await api<{ event: { id: string; kind: string } }>(
      `/patients/${patientId}/doses/${occurrenceAspirin.id}/events`,
      {
        method: 'POST',
        token,
        body: {
          kind: 'skipped',
          correctsEventId: event1Id,
          reason: 'Wrong dose quantity taken initially',
          clientActionId: correctionActionId,
        },
      },
    );
    assert.equal(correctDose.status, 201);
    assert.equal(correctDose.body.event.kind, 'skipped');
    const event2Id = correctDose.body.event.id;
    assert.notEqual(event1Id, event2Id);

    // Verify DB audit log retains BOTH original event and correction event
    const auditRows = await admin.query<{
      id: string;
      event_kind: string;
      reason: string | null;
      corrects_event_id: string | null;
    }>(
      `SELECT id, event_kind, reason, corrects_event_id
       FROM public.dose_events
       WHERE occurrence_id = $1
       ORDER BY recorded_at ASC`,
      [occurrenceAspirin.id],
    );
    assert.equal(auditRows.rows.length, 2);
    assert.equal(auditRows.rows[0]?.id, event1Id);
    assert.equal(auditRows.rows[0]?.event_kind, 'taken');
    assert.equal(auditRows.rows[0]?.corrects_event_id, null);
    assert.equal(auditRows.rows[1]?.id, event2Id);
    assert.equal(auditRows.rows[1]?.event_kind, 'skipped');
    assert.equal(auditRows.rows[1]?.reason, 'Wrong dose quantity taken initially');
    assert.equal(auditRows.rows[1]?.corrects_event_id, event1Id);

    // Verify timeline reflects corrected status and reason
    const timelineAfterCorrection = await api<{ timeline: Dose[] }>(
      `/patients/${patientId}/today?date=${careDate}`,
      { token },
    );
    const correctedItem = timelineAfterCorrection.body.timeline.find((d) => d.id === occurrenceAspirin.id)!;
    assert.equal(correctedItem.status, 'skipped');
    assert.equal(correctedItem.reason, 'Wrong dose quantity taken initially');
    assert.equal(correctedItem.recordedByName, 'Dose Actions Owner');

    // Stale correction attempt: trying to correct event1Id again fails with 409
    const staleCorrection = await api<{ error: string }>(
      `/patients/${patientId}/doses/${occurrenceAspirin.id}/events`,
      {
        method: 'POST',
        token,
        body: {
          kind: 'taken',
          correctsEventId: event1Id,
          reason: 'Stale attempt',
          clientActionId: randomUUID(),
        },
      },
    );
    assert.equal(staleCorrection.status, 409);
    assert.match(staleCorrection.body.error, /care record changed/i);

    // Attempting correction on an unrecorded dose occurrence fails with 409
    const correctionUnrecorded = await api<{ error: string }>(
      `/patients/${patientId}/doses/${occurrenceSimvastatin.id}/events`,
      {
        method: 'POST',
        token,
        body: {
          kind: 'skipped',
          correctsEventId: randomUUID(),
          reason: 'Premature correction',
          clientActionId: randomUUID(),
        },
      },
    );
    assert.equal(correctionUnrecorded.status, 409);
    assert.match(correctionUnrecorded.body.error, /no recorded dose to correct/i);

    // 3. Snooze timing
    // Invalid snooze minutes: 20 minutes (must be 15, 30, or 60)
    const invalidSnoozeMinutes = await api<{ error: string }>(
      `/patients/${patientId}/doses/${occurrenceSimvastatin.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'snoozed', snoozeMinutes: 20, clientActionId: randomUUID() },
      },
    );
    assert.equal(invalidSnoozeMinutes.status, 400);
    assert.match(invalidSnoozeMinutes.body.error, /15, 30, or 60/i);

    // Non-snoozed dose with snoozeMinutes
    const takenWithSnooze = await api<{ error: string }>(
      `/patients/${patientId}/doses/${occurrenceSimvastatin.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'taken', snoozeMinutes: 15, clientActionId: randomUUID() },
      },
    );
    assert.equal(takenWithSnooze.status, 400);
    assert.match(takenWithSnooze.body.error, /only a snoozed dose can include snooze minutes/i);

    // Concurrent dose recording: simultaneous requests with identical clientActionId
    const concurrentActionId = randomUUID();
    const [concurrent1, concurrent2] = await Promise.all([
      api<{ event: { id: string; kind: string; snoozedUntil: string } }>(
        `/patients/${patientId}/doses/${occurrenceSimvastatin.id}/events`,
        {
          method: 'POST',
          token,
          body: { kind: 'snoozed', snoozeMinutes: 15, clientActionId: concurrentActionId },
        },
      ),
      api<{ event: { id: string; kind: string; snoozedUntil: string } }>(
        `/patients/${patientId}/doses/${occurrenceSimvastatin.id}/events`,
        {
          method: 'POST',
          token,
          body: { kind: 'snoozed', snoozeMinutes: 15, clientActionId: concurrentActionId },
        },
      ),
    ]);
    assert.equal(concurrent1.status, 201);
    assert.equal(concurrent2.status, 201);
    assert.equal(concurrent1.body.event.id, concurrent2.body.event.id);
    assert.equal(concurrent1.body.event.snoozedUntil, concurrent2.body.event.snoozedUntil);
    const snooze15 = concurrent1;

    // Verify DB has exactly 1 row with concurrentActionId
    const concurrentDbCount = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.dose_events WHERE client_action_id = $1',
      [concurrentActionId],
    );
    assert.equal(concurrentDbCount.rows[0]?.count, '1');

    // Verify timeline shows snoozed status and dueAt equals snoozedUntil
    const timelineAfterSnooze = await api<{ timeline: Dose[] }>(
      `/patients/${patientId}/today?date=${careDate}`,
      { token },
    );
    const snoozedItem = timelineAfterSnooze.body.timeline.find((d) => d.id === occurrenceSimvastatin.id)!;
    assert.equal(snoozedItem.status, 'snoozed');
    assert.equal(snoozedItem.snoozedUntil, snooze15.body.event.snoozedUntil);
    assert.equal(snoozedItem.dueAt, snooze15.body.event.snoozedUntil);

    // Pure logic test for actionableAt
    assert.equal(
      actionableAt({
        dueAt: '2026-08-27T08:00:00.000Z',
        snoozedUntil: snooze15.body.event.snoozedUntil,
        status: 'snoozed',
      }),
      snooze15.body.event.snoozedUntil,
    );

    // Snooze again for 30 minutes
    const snooze30 = await api<{ event: { kind: string; snoozedUntil: string } }>(
      `/patients/${patientId}/doses/${occurrenceSimvastatin.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'snoozed', snoozeMinutes: 30, clientActionId: randomUUID() },
      },
    );
    assert.equal(snooze30.status, 201);
    assert.ok(new Date(snooze30.body.event.snoozedUntil) > new Date(snooze15.body.event.snoozedUntil));

    // Finally mark the snoozed dose as taken
    const takeSimvastatin = await api<{ event: { kind: string; snoozedUntil: string | null } }>(
      `/patients/${patientId}/doses/${occurrenceSimvastatin.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'taken', clientActionId: randomUUID() },
      },
    );
    assert.equal(takeSimvastatin.status, 201);
    assert.equal(takeSimvastatin.body.event.kind, 'taken');
    assert.equal(takeSimvastatin.body.event.snoozedUntil, null);

    // 4. Reminder de-duplication pure logic tests
    const desiredDoses = [
      { occurrenceId: 'occ-1', patientId, dueAt: '2026-08-27T08:00:00.000Z' },
      { occurrenceId: 'occ-2', patientId, dueAt: '2026-08-27T12:00:00.000Z' },
      { occurrenceId: 'occ-3', patientId, dueAt: '2026-08-27T20:00:00.000Z' },
    ];

    // Scenario A: Exact matches + duplicates + stale times + removed reminders
    const existingNotifications = [
      { occurrenceId: 'occ-1', patientId, dueAt: '2026-08-27T08:00:00.000Z', identifier: 'notif-1-keep' },
      { occurrenceId: 'occ-1', patientId, dueAt: '2026-08-27T08:00:00.000Z', identifier: 'notif-1-dup' },
      { occurrenceId: 'occ-2', patientId, dueAt: '2026-08-27T11:30:00.000Z', identifier: 'notif-2-stale' },
      { occurrenceId: 'occ-old', patientId, dueAt: '2026-08-27T06:00:00.000Z', identifier: 'notif-old' },
    ];

    const plan = planReminderSync(existingNotifications, desiredDoses);
    assert.deepEqual(plan.cancel.sort(), ['notif-1-dup', 'notif-2-stale', 'notif-old'].sort());
    assert.deepEqual(
      plan.schedule.sort((a, b) => a.occurrenceId.localeCompare(b.occurrenceId)),
      [desiredDoses[1], desiredDoses[2]].sort((a, b) => a.occurrenceId.localeCompare(b.occurrenceId)),
    );

    // Scenario B: Empty existing notifications -> schedule all desired
    const planEmptyExisting = planReminderSync([], desiredDoses);
    assert.deepEqual(planEmptyExisting.cancel, []);
    assert.equal(planEmptyExisting.schedule.length, 3);

    // Scenario C: Empty desired notifications -> cancel all existing
    const planEmptyDesired = planReminderSync(existingNotifications, []);
    assert.equal(planEmptyDesired.schedule.length, 0);
    assert.equal(planEmptyDesired.cancel.length, 4);

    // Scenario D: Exact parity -> zero cancels, zero schedules
    const perfectExisting = desiredDoses.map((d, i) => ({ ...d, identifier: `perfect-${i}` }));
    const planParity = planReminderSync(perfectExisting, desiredDoses);
    assert.deepEqual(planParity.cancel, []);
    assert.deepEqual(planParity.schedule, []);
  } finally {
    await admin.query('DELETE FROM public.dose_events WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.dose_occurrences WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.medication_schedules WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.medication_versions WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.medications WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.patient_members WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.patients WHERE id = $1', [patientId]);
    await admin.query('DELETE FROM alaga_private.auth_sessions WHERE account_id = $1', [owner.body.account.id]);
    await admin.query('DELETE FROM alaga_private.accounts WHERE id = $1', [owner.body.account.id]);
    await admin.end();
  }
});
