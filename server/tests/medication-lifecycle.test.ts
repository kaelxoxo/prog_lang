import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createAppServer } from '../src/app';
import { setupConfig } from '../src/config';
import { databasePool } from '../src/database';

const { Client } = pg;
const server = createAppServer(databasePool);
let baseUrl = '';

type ApiResult<T> = { status: number; body: T };
type AuthResult = {
  token: string;
  account: { id: string; email: string; displayName: string };
};

type Medication = {
  id: string;
  versionId: string;
  versionNumber: number;
  displayName: string;
  doseQuantity: number;
  status: string;
  archivedAt: string | null;
  schedules: Array<{ kind: string; timeOfDay: string }>;
};

type Dose = {
  id: string;
  medicationId: string;
  medicationVersionId: string;
  medicationName: string;
  doseQuantity: number;
  status: string;
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

test('Medication edit/version/archive behavior and rejection of invalid schedule input', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'local-test-password-123';
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();

  const careDate = manilaDate();

  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Med Lifecycle Owner', email: `med-lifecycle-${suffix}@example.test`, password },
  });
  assert.equal(owner.status, 201);
  const token = owner.body.token;

  const patient = await api<{ patient: { id: string } }>('/patients', {
    method: 'POST',
    token,
    body: { displayName: 'Lifecycle Patient' },
  });
  assert.equal(patient.status, 201);
  const patientId = patient.body.patient.id;

  const baseSchedule = {
    kind: 'exact',
    timeOfDay: '08:00',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startOn: careDate,
    endOn: '',
    timeZone: 'Asia/Manila',
  };

  const validMedication = {
    displayName: 'Metformin',
    genericName: 'metformin hydrochloride',
    brandName: 'Glucophage',
    strengthValue: 500,
    strengthUnit: 'mg',
    doseQuantity: 1,
    doseUnit: 'tablet',
    medicineForm: 'tablet',
    route: 'by mouth',
    prescriber: 'Dr. Endo',
    reason: 'Glycemic control',
    originalInstructions: 'Take 1 tablet once daily with food.',
    notes: 'Do not crush.',
    sourceKind: 'manual',
    schedules: [baseSchedule],
  };

  try {
    // 1. Immutable version creation on update
    const created = await api<{ medicationId: string; versionId: string }>(
      `/patients/${patientId}/medications`,
      { method: 'POST', token, body: validMedication },
    );
    assert.equal(created.status, 201);
    const medId = created.body.medicationId;
    const v1Id = created.body.versionId;

    // Materialize today's dose occurrence for version 1
    const todayBefore = await api<{ timeline: Dose[] }>(
      `/patients/${patientId}/today?date=${careDate}`,
      { token },
    );
    assert.equal(todayBefore.status, 200);
    assert.equal(todayBefore.body.timeline.length, 1);
    const occurrenceV1 = todayBefore.body.timeline[0];
    assert.equal(occurrenceV1?.medicationVersionId, v1Id);
    assert.equal(occurrenceV1?.doseQuantity, 1);
    assert.equal(occurrenceV1?.medicationName, 'Metformin');

    // Revise medication to Version 2: change dose quantity to 2 tablets, displayName to Metformin XR
    const revised = await api<{ medicationId: string; versionId: string }>(
      `/patients/${patientId}/medications/${medId}/revisions`,
      {
        method: 'POST',
        token,
        body: {
          ...validMedication,
          displayName: 'Metformin XR',
          doseQuantity: 2,
          schedules: [{ ...baseSchedule, timeOfDay: '09:00' }],
        },
      },
    );
    assert.equal(revised.status, 200);
    const v2Id = revised.body.versionId;
    assert.notEqual(v1Id, v2Id);

    // Verify DB retains immutable Version 1 row alongside Version 2
    const versionRows = await admin.query<{
      id: string;
      version_number: number;
      display_name: string;
      dose_quantity: string;
    }>(
      `SELECT id, version_number, display_name, dose_quantity::text
       FROM public.medication_versions
       WHERE medication_id = $1
       ORDER BY version_number ASC`,
      [medId],
    );
    assert.equal(versionRows.rows.length, 2);
    assert.equal(versionRows.rows[0]?.version_number, 1);
    assert.equal(versionRows.rows[0]?.display_name, 'Metformin');
    assert.equal(versionRows.rows[0]?.dose_quantity, '1.0000');
    assert.equal(versionRows.rows[1]?.version_number, 2);
    assert.equal(versionRows.rows[1]?.display_name, 'Metformin XR');
    assert.equal(versionRows.rows[1]?.dose_quantity, '2.0000');

    // Verify historical occurrence retains link to Version 1 with original dose quantity
    const historicalTimeline = await api<{ timeline: Dose[] }>(
      `/patients/${patientId}/today?date=${careDate}`,
      { token },
    );
    const retainedV1Occurrence = historicalTimeline.body.timeline.find((d) => d.id === occurrenceV1.id);
    assert.equal(retainedV1Occurrence?.medicationVersionId, v1Id);
    assert.equal(retainedV1Occurrence?.doseQuantity, 1);

    // 2. History retention on archive
    // Record the dose as 'taken'
    const recordDose = await api<{ event: { id: string } }>(
      `/patients/${patientId}/doses/${occurrenceV1.id}/events`,
      {
        method: 'POST',
        token,
        body: { kind: 'taken', clientActionId: randomUUID() },
      },
    );
    assert.equal(recordDose.status, 201);

    // Archive the medication
    const archiveResult = await api<{ ok: boolean }>(
      `/patients/${patientId}/medications/${medId}/archive`,
      { method: 'POST', token },
    );
    assert.equal(archiveResult.status, 200);

    // Active list returns empty
    const activeList = await api<{ medications: Medication[] }>(
      `/patients/${patientId}/medications`,
      { token },
    );
    assert.equal(activeList.status, 200);
    assert.deepEqual(activeList.body.medications, []);

    // Archived list returns the medication with retained version history
    const archivedList = await api<{ medications: Medication[] }>(
      `/patients/${patientId}/medications?status=archived`,
      { token },
    );
    assert.equal(archivedList.status, 200);
    assert.equal(archivedList.body.medications.length, 1);
    assert.equal(archivedList.body.medications[0]?.id, medId);
    assert.equal(archivedList.body.medications[0]?.versionNumber, 2);
    assert.ok(archivedList.body.medications[0]?.archivedAt);

    // Attempting to revise an archived medication is rejected (404 Active medication not found)
    const reviseArchived = await api<{ error: string }>(
      `/patients/${patientId}/medications/${medId}/revisions`,
      {
        method: 'POST',
        token,
        body: validMedication,
      },
    );
    assert.equal(reviseArchived.status, 404);
    assert.equal(reviseArchived.body.error, 'Active medication not found.');

    // Attempting to archive an already archived medication is rejected (404)
    const reArchive = await api<{ error: string }>(
      `/patients/${patientId}/medications/${medId}/archive`,
      { method: 'POST', token },
    );
    assert.equal(reArchive.status, 404);

    // Verify history still retains the recorded dose for this archived medication
    const historyAfterArchive = await api<{ history: Array<{ date: string; timeline: Dose[] }> }>(
      `/patients/${patientId}/history?through=${careDate}&days=7`,
      { token },
    );
    const dayRecord = historyAfterArchive.body.history.find((d) => d.date === careDate);
    assert.equal(dayRecord?.timeline.length, 1);
    assert.equal(dayRecord?.timeline[0]?.status, 'taken');
    assert.equal(dayRecord?.timeline[0]?.medicationName, 'Metformin');

    // Restore the medication
    const restoreResult = await api<{ ok: boolean }>(
      `/patients/${patientId}/medications/${medId}/restore`,
      { method: 'POST', token },
    );
    assert.equal(restoreResult.status, 200);

    // Active list now contains the restored medication
    const restoredList = await api<{ medications: Medication[] }>(
      `/patients/${patientId}/medications`,
      { token },
    );
    assert.equal(restoredList.status, 200);
    assert.equal(restoredList.body.medications.length, 1);
    assert.equal(restoredList.body.medications[0]?.id, medId);
    assert.equal(restoredList.body.medications[0]?.versionNumber, 2);

    // Attempting to restore an already active medication is rejected (404)
    const reRestore = await api<{ error: string }>(
      `/patients/${patientId}/medications/${medId}/restore`,
      { method: 'POST', token },
    );
    assert.equal(reRestore.status, 404);

    // 3. Rejection of invalid schedule combinations and medication input:

    // a) Empty schedules array
    const emptySchedules = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, schedules: [] },
    });
    assert.equal(emptySchedules.status, 400);
    assert.match(emptySchedules.body.error, /between 1 and 21 schedule times/i);

    // b) More than 21 schedules
    const tooManySchedules = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, schedules: Array(22).fill(baseSchedule) },
    });
    assert.equal(tooManySchedules.status, 400);
    assert.match(tooManySchedules.body.error, /between 1 and 21 schedule times/i);

    // c) Invalid schedule kind
    const invalidKind = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, schedules: [{ ...baseSchedule, kind: 'weekly' }] },
    });
    assert.equal(invalidKind.status, 400);
    assert.match(invalidKind.body.error, /invalid type/i);

    // d) Invalid weekdays: empty array
    const emptyWeekdays = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, schedules: [{ ...baseSchedule, weekdays: [] }] },
    });
    assert.equal(emptyWeekdays.status, 400);
    assert.match(emptyWeekdays.body.error, /weekday/i);

    // e) Invalid weekdays: out of range (> 6 or negative)
    const outOfRangeWeekday = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, schedules: [{ ...baseSchedule, weekdays: [7] }] },
    });
    assert.equal(outOfRangeWeekday.status, 400);
    assert.match(outOfRangeWeekday.body.error, /invalid weekdays/i);

    // f) Invalid calendar dates: impossible date (e.g. Feb 30)
    const impossibleDate = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, schedules: [{ ...baseSchedule, startOn: '2026-02-30' }] },
    });
    assert.equal(impossibleDate.status, 400);
    assert.match(impossibleDate.body.error, /real calendar date/i);

    // g) Invalid calendar dates: malformed format
    const malformedDate = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, schedules: [{ ...baseSchedule, startOn: 'tomorrow' }] },
    });
    assert.equal(malformedDate.status, 400);
    assert.match(malformedDate.body.error, /YYYY-MM-DD/i);

    // h) endOn date before startOn date
    const endBeforeStart = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: {
        ...validMedication,
        schedules: [{ ...baseSchedule, startOn: '2026-09-02', endOn: '2026-09-01' }],
      },
    });
    assert.equal(endBeforeStart.status, 400);
    assert.match(endBeforeStart.body.error, /cannot be before its start date/i);

    // i) Invalid time of day: out of range (25:00)
    const invalidHour = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, schedules: [{ ...baseSchedule, timeOfDay: '25:00' }] },
    });
    assert.equal(invalidHour.status, 400);
    assert.match(invalidHour.body.error, /24-hour HH:mm time/i);

    // j) Invalid time of day: missing leading zero (8:00)
    const missingLeadingZero = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, schedules: [{ ...baseSchedule, timeOfDay: '8:00' }] },
    });
    assert.equal(missingLeadingZero.status, 400);
    assert.match(missingLeadingZero.body.error, /24-hour HH:mm time/i);

    // k) Interval schedule with invalid intervalHours (0, >24, fractional)
    const intervalZero = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: {
        ...validMedication,
        schedules: [{ ...baseSchedule, kind: 'interval', intervalHours: 0 }],
      },
    });
    assert.equal(intervalZero.status, 400);

    const intervalTooLarge = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: {
        ...validMedication,
        schedules: [{ ...baseSchedule, kind: 'interval', intervalHours: 25 }],
      },
    });
    assert.equal(intervalTooLarge.status, 400);
    assert.match(intervalTooLarge.body.error, /1 to 24 hours/i);

    const intervalFractional = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: {
        ...validMedication,
        schedules: [{ ...baseSchedule, kind: 'interval', intervalHours: 3.5 }],
      },
    });
    assert.equal(intervalFractional.status, 400);
    assert.match(intervalFractional.body.error, /1 to 24 hours/i);

    // l) Meal schedule with invalid mealName
    const invalidMealName = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: {
        ...validMedication,
        schedules: [
          {
            ...baseSchedule,
            kind: 'meal',
            mealName: 'midnight_snack',
            mealRelation: 'after',
            windowStart: '08:00',
            windowEnd: '09:00',
          },
        ],
      },
    });
    assert.equal(invalidMealName.status, 400);
    assert.match(invalidMealName.body.error, /valid meal/i);

    // m) Meal schedule with invalid mealRelation
    const invalidMealRelation = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: {
        ...validMedication,
        schedules: [
          {
            ...baseSchedule,
            kind: 'meal',
            mealName: 'breakfast',
            mealRelation: 'during',
            windowStart: '08:00',
            windowEnd: '09:00',
          },
        ],
      },
    });
    assert.equal(invalidMealRelation.status, 400);
    assert.match(invalidMealRelation.body.error, /before or after meal/i);

    // n) Meal schedule with windowEnd <= windowStart
    const invertedMealWindow = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: {
        ...validMedication,
        schedules: [
          {
            ...baseSchedule,
            kind: 'meal',
            mealName: 'breakfast',
            mealRelation: 'after',
            windowStart: '09:00',
            windowEnd: '08:00',
          },
        ],
      },
    });
    assert.equal(invertedMealWindow.status, 400);
    assert.match(invertedMealWindow.body.error, /window end must be after its start/i);

    const equalMealWindow = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: {
        ...validMedication,
        schedules: [
          {
            ...baseSchedule,
            kind: 'meal',
            mealName: 'breakfast',
            mealRelation: 'after',
            windowStart: '08:00',
            windowEnd: '08:00',
          },
        ],
      },
    });
    assert.equal(equalMealWindow.status, 400);
    assert.match(equalMealWindow.body.error, /window end must be after its start/i);

    // o) Strength value provided without unit
    const strengthWithoutUnit = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, strengthValue: 500, strengthUnit: '' },
    });
    assert.equal(strengthWithoutUnit.status, 400);
    assert.match(strengthWithoutUnit.body.error, /Strength value and unit must be provided together/i);

    // p) Strength unit provided without value
    const unitWithoutStrength = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, strengthValue: null, strengthUnit: 'mg' },
    });
    assert.equal(unitWithoutStrength.status, 400);
    assert.match(unitWithoutStrength.body.error, /Strength value and unit must be provided together/i);

    // q) Dose quantity zero or negative
    const zeroDose = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, doseQuantity: 0 },
    });
    assert.equal(zeroDose.status, 400);
    assert.match(zeroDose.body.error, /positive number/i);

    const negativeDose = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, doseQuantity: -2 },
    });
    assert.equal(negativeDose.status, 400);
    assert.match(negativeDose.body.error, /positive number/i);

    // r) Empty or whitespace medicine displayName
    const emptyDisplayName = await api<{ error: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: { ...validMedication, displayName: '   ' },
    });
    assert.equal(emptyDisplayName.status, 400);
    assert.match(emptyDisplayName.body.error, /Medicine name must contain 1 to 120 characters/i);
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
