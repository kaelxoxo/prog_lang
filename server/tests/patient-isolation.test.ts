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

type Dose = {
  id: string;
  medicationId: string;
  medicationVersionId: string;
  medicationName: string;
  status: string;
  doseQuantity: number;
  reason: string | null;
};

type Medication = {
  id: string;
  displayName: string;
  versionNumber: number;
  status: string;
  schedules: Array<{ kind: string; timeOfDay: string }>;
};

type HistoryDay = { date: string; timeline: Dose[] };

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

test('Patient switching and strict cross-patient isolation with zero data leakage', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'local-test-password-123';
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();

  const careDate = manilaDate();

  // Register two distinct accounts: owner Alice and outsider Charlie
  const alice = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Alice Owner', email: `alice-${suffix}@example.test`, password },
  });
  const charlie = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Charlie Outsider', email: `charlie-${suffix}@example.test`, password },
  });
  assert.equal(alice.status, 201);
  assert.equal(charlie.status, 201);

  // Alice creates two patients: Alpha and Beta
  const patientAlpha = await api<{ patient: { id: string; displayName: string } }>('/patients', {
    method: 'POST',
    token: alice.body.token,
    body: { displayName: 'Patient Alpha' },
  });
  const patientBeta = await api<{ patient: { id: string; displayName: string } }>('/patients', {
    method: 'POST',
    token: alice.body.token,
    body: { displayName: 'Patient Beta' },
  });
  assert.equal(patientAlpha.status, 201);
  assert.equal(patientBeta.status, 201);
  const alphaId = patientAlpha.body.patient.id;
  const betaId = patientBeta.body.patient.id;

  // Charlie creates Charlie Patient
  const patientCharlie = await api<{ patient: { id: string } }>('/patients', {
    method: 'POST',
    token: charlie.body.token,
    body: { displayName: 'Patient Charlie' },
  });
  assert.equal(patientCharlie.status, 201);
  const charliePatientId = patientCharlie.body.patient.id;

  try {
    // Alice's patient list contains exactly Alpha and Beta, but zero of Charlie's patient
    const alicePatients = await api<{ patients: Array<{ id: string; displayName: string }> }>('/patients', {
      token: alice.body.token,
    });
    assert.equal(alicePatients.status, 200);
    assert.equal(alicePatients.body.patients.length, 2);
    const alicePatientIds = alicePatients.body.patients.map((p) => p.id);
    assert.ok(alicePatientIds.includes(alphaId));
    assert.ok(alicePatientIds.includes(betaId));
    assert.ok(!alicePatientIds.includes(charliePatientId));

    // Charlie's patient list contains only Charlie's patient
    const charliePatients = await api<{ patients: Array<{ id: string }> }>('/patients', {
      token: charlie.body.token,
    });
    assert.equal(charliePatients.status, 200);
    assert.equal(charliePatients.body.patients.length, 1);
    assert.equal(charliePatients.body.patients[0]?.id, charliePatientId);

    // Create Medication for Patient Alpha: Alpha-Med @ 08:00
    const alphaMed = await api<{ medicationId: string; versionId: string }>(
      `/patients/${alphaId}/medications`,
      {
        method: 'POST',
        token: alice.body.token,
        body: {
          displayName: 'Alpha-Medication',
          genericName: 'alphamycine',
          brandName: 'AlphaBrand',
          strengthValue: 10,
          strengthUnit: 'mg',
          doseQuantity: 1,
          doseUnit: 'tablet',
          medicineForm: 'tablet',
          route: 'by mouth',
          prescriber: 'Dr. Alpha',
          reason: 'Alpha care only',
          originalInstructions: 'Take 1 tablet every morning.',
          notes: 'Alpha specific notes',
          sourceKind: 'manual',
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
      },
    );
    assert.equal(alphaMed.status, 201);
    const alphaMedId = alphaMed.body.medicationId;

    // Create Medication for Patient Beta: Beta-Med @ 14:00
    const betaMed = await api<{ medicationId: string; versionId: string }>(
      `/patients/${betaId}/medications`,
      {
        method: 'POST',
        token: alice.body.token,
        body: {
          displayName: 'Beta-Medication',
          genericName: 'betacillin',
          brandName: 'BetaBrand',
          strengthValue: 20,
          strengthUnit: 'capsule',
          doseQuantity: 2,
          doseUnit: 'capsules',
          medicineForm: 'capsule',
          route: 'by mouth',
          prescriber: 'Dr. Beta',
          reason: 'Beta care only',
          originalInstructions: 'Take 2 capsules at lunch.',
          notes: 'Beta specific notes',
          sourceKind: 'manual',
          schedules: [
            {
              kind: 'exact',
              timeOfDay: '14:00',
              weekdays: [0, 1, 2, 3, 4, 5, 6],
              startOn: careDate,
              endOn: '',
              timeZone: 'Asia/Manila',
            },
          ],
        },
      },
    );
    assert.equal(betaMed.status, 201);
    const betaMedId = betaMed.body.medicationId;

    // 1. Verify Medication list isolation across patient switching
    const alphaMedsList = await api<{ medications: Medication[] }>(
      `/patients/${alphaId}/medications`,
      { token: alice.body.token },
    );
    assert.equal(alphaMedsList.status, 200);
    assert.equal(alphaMedsList.body.medications.length, 1);
    assert.equal(alphaMedsList.body.medications[0]?.displayName, 'Alpha-Medication');
    assert.equal(alphaMedsList.body.medications[0]?.id, alphaMedId);

    const betaMedsList = await api<{ medications: Medication[] }>(
      `/patients/${betaId}/medications`,
      { token: alice.body.token },
    );
    assert.equal(betaMedsList.status, 200);
    assert.equal(betaMedsList.body.medications.length, 1);
    assert.equal(betaMedsList.body.medications[0]?.displayName, 'Beta-Medication');
    assert.equal(betaMedsList.body.medications[0]?.id, betaMedId);

    // 2. Verify Today timeline isolation across patient switching
    const alphaTimeline = await api<{ timeline: Dose[] }>(
      `/patients/${alphaId}/today?date=${careDate}`,
      { token: alice.body.token },
    );
    assert.equal(alphaTimeline.status, 200);
    assert.equal(alphaTimeline.body.timeline.length, 1);
    assert.equal(alphaTimeline.body.timeline[0]?.medicationName, 'Alpha-Medication');
    assert.equal(alphaTimeline.body.timeline[0]?.doseQuantity, 1);
    const alphaOccurrenceId = alphaTimeline.body.timeline[0]?.id;

    const betaTimeline = await api<{ timeline: Dose[] }>(
      `/patients/${betaId}/today?date=${careDate}`,
      { token: alice.body.token },
    );
    assert.equal(betaTimeline.status, 200);
    assert.equal(betaTimeline.body.timeline.length, 1);
    assert.equal(betaTimeline.body.timeline[0]?.medicationName, 'Beta-Medication');
    assert.equal(betaTimeline.body.timeline[0]?.doseQuantity, 2);
    const betaOccurrenceId = betaTimeline.body.timeline[0]?.id;

    // Zero cross-patient occurrence bleed
    assert.notEqual(alphaOccurrenceId, betaOccurrenceId);

    // 3. Record distinct dose events for each patient
    // Patient Alpha: marked 'taken'
    const alphaTaken = await api<{ event: { id: string; kind: string } }>(
      `/patients/${alphaId}/doses/${alphaOccurrenceId}/events`,
      {
        method: 'POST',
        token: alice.body.token,
        body: { kind: 'taken', clientActionId: randomUUID() },
      },
    );
    assert.equal(alphaTaken.status, 201);
    assert.equal(alphaTaken.body.event.kind, 'taken');

    // Patient Beta: marked 'skipped' with reason
    const betaSkipped = await api<{ event: { id: string; kind: string } }>(
      `/patients/${betaId}/doses/${betaOccurrenceId}/events`,
      {
        method: 'POST',
        token: alice.body.token,
        body: { kind: 'skipped', reason: 'Patient reported nausea', clientActionId: randomUUID() },
      },
    );
    assert.equal(betaSkipped.status, 201);
    assert.equal(betaSkipped.body.event.kind, 'skipped');

    // 4. Verify History isolation across patient switching
    const alphaHistory = await api<{ history: HistoryDay[] }>(
      `/patients/${alphaId}/history?through=${careDate}&days=7`,
      { token: alice.body.token },
    );
    assert.equal(alphaHistory.status, 200);
    const alphaCareDay = alphaHistory.body.history.find((d) => d.date === careDate);
    assert.equal(alphaCareDay?.timeline.length, 1);
    assert.equal(alphaCareDay?.timeline[0]?.medicationName, 'Alpha-Medication');
    assert.equal(alphaCareDay?.timeline[0]?.status, 'taken');
    assert.equal(alphaCareDay?.timeline[0]?.reason, null);

    const betaHistory = await api<{ history: HistoryDay[] }>(
      `/patients/${betaId}/history?through=${careDate}&days=7`,
      { token: alice.body.token },
    );
    assert.equal(betaHistory.status, 200);
    const betaCareDay = betaHistory.body.history.find((d) => d.date === careDate);
    assert.equal(betaCareDay?.timeline.length, 1);
    assert.equal(betaCareDay?.timeline[0]?.medicationName, 'Beta-Medication');
    assert.equal(betaCareDay?.timeline[0]?.status, 'skipped');
    assert.equal(betaCareDay?.timeline[0]?.reason, 'Patient reported nausea');

    // 5. Verify Reminders isolation
    const alphaReminders = await api<{ timeline: Dose[] }>(
      `/patients/${alphaId}/reminders?from=${careDate}&days=2`,
      { token: alice.body.token },
    );
    assert.equal(alphaReminders.status, 200);
    assert.ok(alphaReminders.body.timeline.every((d) => d.medicationName === 'Alpha-Medication'));

    const betaReminders = await api<{ timeline: Dose[] }>(
      `/patients/${betaId}/reminders?from=${careDate}&days=2`,
      { token: alice.body.token },
    );
    assert.equal(betaReminders.status, 200);
    assert.ok(betaReminders.body.timeline.every((d) => d.medicationName === 'Beta-Medication'));

    // 6. Cross-patient tampering attempts must be rejected:
    // a) Attempt to record dose event for Beta occurrence on Alpha patient endpoint
    const crossDoseAlphaEndpoint = await api<{ error: string }>(
      `/patients/${alphaId}/doses/${betaOccurrenceId}/events`,
      {
        method: 'POST',
        token: alice.body.token,
        body: { kind: 'taken', clientActionId: randomUUID() },
      },
    );
    assert.equal(crossDoseAlphaEndpoint.status, 404);
    assert.equal(crossDoseAlphaEndpoint.body.error, 'Dose occurrence not found.');

    // b) Attempt to record dose event for Alpha occurrence on Beta patient endpoint
    const crossDoseBetaEndpoint = await api<{ error: string }>(
      `/patients/${betaId}/doses/${alphaOccurrenceId}/events`,
      {
        method: 'POST',
        token: alice.body.token,
        body: { kind: 'taken', clientActionId: randomUUID() },
      },
    );
    assert.equal(crossDoseBetaEndpoint.status, 404);
    assert.equal(crossDoseBetaEndpoint.body.error, 'Dose occurrence not found.');

    // c) Attempt to revise Beta medication through Alpha patient endpoint
    const crossRevise = await api<{ error: string }>(
      `/patients/${alphaId}/medications/${betaMedId}/revisions`,
      {
        method: 'POST',
        token: alice.body.token,
        body: {
          displayName: 'Cross Tamper',
          doseQuantity: 5,
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
      },
    );
    assert.equal(crossRevise.status, 404);
    assert.equal(crossRevise.body.error, 'Active medication not found.');

    // d) Attempt to archive Beta medication through Alpha patient endpoint
    const crossArchive = await api<{ error: string }>(
      `/patients/${alphaId}/medications/${betaMedId}/archive`,
      {
        method: 'POST',
        token: alice.body.token,
      },
    );
    assert.equal(crossArchive.status, 404);
    assert.equal(crossArchive.body.error, 'Active medication not found.');

    // 7. Outsider access isolation:
    // Charlie has no membership for Patient Alpha or Beta
    const outsiderToday = await api<{ error: string }>(`/patients/${alphaId}/today?date=${careDate}`, {
      token: charlie.body.token,
    });
    assert.equal(outsiderToday.status, 403);

    const outsiderMeds = await api<{ error: string }>(`/patients/${alphaId}/medications`, {
      token: charlie.body.token,
    });
    assert.equal(outsiderMeds.status, 403);

    const outsiderHistory = await api<{ error: string }>(`/patients/${alphaId}/history?through=${careDate}&days=7`, {
      token: charlie.body.token,
    });
    assert.equal(outsiderHistory.status, 403);

    const outsiderReminders = await api<{ error: string }>(`/patients/${alphaId}/reminders?from=${careDate}&days=2`, {
      token: charlie.body.token,
    });
    assert.equal(outsiderReminders.status, 403);

    const outsiderCircle = await api<{ error: string }>(`/patients/${alphaId}/care-circle`, {
      token: charlie.body.token,
    });
    assert.equal(outsiderCircle.status, 403);

    const outsiderPostMed = await api<{ error: string }>(`/patients/${alphaId}/medications`, {
      method: 'POST',
      token: charlie.body.token,
      body: {
        displayName: 'Outsider Med',
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
    assert.equal(outsiderPostMed.status, 403);

    // Alice cannot access Charlie's patient
    const aliceCrossCharlie = await api<{ error: string }>(`/patients/${charliePatientId}/today?date=${careDate}`, {
      token: alice.body.token,
    });
    assert.equal(aliceCrossCharlie.status, 403);
  } finally {
    const patientIds = [alphaId, betaId, charliePatientId];
    await admin.query('DELETE FROM public.dose_events WHERE patient_id = ANY($1::uuid[])', [patientIds]);
    await admin.query('DELETE FROM public.dose_occurrences WHERE patient_id = ANY($1::uuid[])', [patientIds]);
    await admin.query('DELETE FROM public.medication_schedules WHERE patient_id = ANY($1::uuid[])', [patientIds]);
    await admin.query('DELETE FROM public.medication_versions WHERE patient_id = ANY($1::uuid[])', [patientIds]);
    await admin.query('DELETE FROM public.medications WHERE patient_id = ANY($1::uuid[])', [patientIds]);
    await admin.query('DELETE FROM public.patient_members WHERE patient_id = ANY($1::uuid[])', [patientIds]);
    await admin.query('DELETE FROM public.patients WHERE id = ANY($1::uuid[])', [patientIds]);
    const accountIds = [alice.body.account.id, charlie.body.account.id];
    await admin.query('DELETE FROM alaga_private.auth_sessions WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await admin.query('DELETE FROM alaga_private.accounts WHERE id = ANY($1::uuid[])', [accountIds]);
    await admin.end();
  }
});
