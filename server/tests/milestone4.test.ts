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

type AuthResult = { token: string; account: { id: string; displayName: string } };
type Dose = {
  id: string;
  medicationVersionId: string;
  medicationName: string;
  doseQuantity: number;
  status: 'not_recorded' | 'taken' | 'skipped' | 'snoozed';
  recordedByName: string | null;
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

function followingDate(localDate: string) {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function api<T>(path: string, options: { body?: unknown; method?: 'GET' | 'POST'; token?: string } = {}) {
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

test('Milestone 4 materializes a version-pinned care log with attributable idempotent events', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'local-test-password';
  const owner = await api<AuthResult>('/auth/register', { method: 'POST', body: { displayName: 'Dose Owner', email: `dose-owner-${suffix}@example.test`, password } });
  const caregiver = await api<AuthResult>('/auth/register', { method: 'POST', body: { displayName: 'Dose Caregiver', email: `dose-caregiver-${suffix}@example.test`, password } });
  const outsider = await api<AuthResult>('/auth/register', { method: 'POST', body: { displayName: 'Dose Outsider', email: `dose-outsider-${suffix}@example.test`, password } });
  const patient = await api<{ patient: { id: string } }>('/patients', { method: 'POST', token: owner.body.token, body: { displayName: 'Dose Test Patient' } });
  const patientId = patient.body.patient.id;
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  const careDate = manilaDate();
  const nextDate = followingDate(careDate);
  await admin.connect();

  const medicine = {
    displayName: 'Synthetic daily medicine', genericName: '', brandName: '', strengthValue: 5,
    strengthUnit: 'mg', doseQuantity: 1, doseUnit: 'tablet', medicineForm: 'tablet', route: 'by mouth',
    prescriber: '', reason: 'Synthetic test only', originalInstructions: 'Take twice daily.', notes: '', sourceKind: 'manual',
    schedules: [
      { kind: 'exact', timeOfDay: '08:00', weekdays: [0, 1, 2, 3, 4, 5, 6], startOn: careDate, endOn: '', timeZone: 'Asia/Manila' },
      { kind: 'exact', timeOfDay: '20:00', weekdays: [0, 1, 2, 3, 4, 5, 6], startOn: careDate, endOn: '', timeZone: 'Asia/Manila' },
    ],
  };

  try {
    const created = await api<{ medicationId: string; versionId: string }>(`/patients/${patientId}/medications`, { method: 'POST', token: owner.body.token, body: medicine });
    assert.equal(created.status, 201);

    const firstTimeline = await api<{ timeline: Dose[] }>(`/patients/${patientId}/today?date=${careDate}`, { token: owner.body.token });
    assert.equal(firstTimeline.status, 200);
    assert.equal(firstTimeline.body.timeline.length, 2);
    assert.deepEqual(firstTimeline.body.timeline.map((dose) => dose.status), ['not_recorded', 'not_recorded']);
    assert.ok(firstTimeline.body.timeline.every((dose) => dose.medicationVersionId === created.body.versionId));

    const prefetchedReminders = await api<{ timeline: Dose[] }>(
      `/patients/${patientId}/reminders?from=${careDate}&days=2`,
      { token: owner.body.token },
    );
    assert.equal(prefetchedReminders.status, 200);
    assert.equal(prefetchedReminders.body.timeline.filter((dose) => dose.medicationVersionId === created.body.versionId).length, 4);

    await admin.query(
      `INSERT INTO public.patient_members (patient_id, account_id, role, granted_by, can_manage_medications)
       VALUES ($1, $2, 'caregiver', $3, false)`,
      [patientId, caregiver.body.account.id, owner.body.account.id],
    );

    const occurrence = firstTimeline.body.timeline[0];
    const snoozed = await api<{ event: { kind: string } }>(`/patients/${patientId}/doses/${occurrence.id}/events`, {
      method: 'POST', token: caregiver.body.token,
      body: { kind: 'snoozed', snoozeMinutes: 15, clientActionId: randomUUID() },
    });
    assert.equal(snoozed.status, 201);
    assert.equal(snoozed.body.event.kind, 'snoozed');

    const takenActionId = randomUUID();
    const taken = await api<{ event: { id: string; kind: string } }>(`/patients/${patientId}/doses/${occurrence.id}/events`, {
      method: 'POST', token: caregiver.body.token,
      body: { kind: 'taken', clientActionId: takenActionId },
    });
    assert.equal(taken.status, 201);
    const retry = await api<{ event: { id: string } }>(`/patients/${patientId}/doses/${occurrence.id}/events`, {
      method: 'POST', token: caregiver.body.token,
      body: { kind: 'taken', clientActionId: takenActionId },
    });
    assert.equal(retry.status, 201);
    assert.equal(retry.body.event.id, taken.body.event.id);

    const duplicateTerminal = await api<{ error: string }>(`/patients/${patientId}/doses/${occurrence.id}/events`, {
      method: 'POST', token: owner.body.token,
      body: { kind: 'skipped', clientActionId: randomUUID() },
    });
    assert.equal(duplicateTerminal.status, 409);

    const attributed = await api<{ timeline: Dose[] }>(`/patients/${patientId}/today?date=${careDate}`, { token: owner.body.token });
    assert.equal(attributed.body.timeline[0]?.status, 'taken');
    assert.equal(attributed.body.timeline[0]?.recordedByName, 'Dose Caregiver');

    const corrected = await api<{ event: { id: string; kind: string } }>(`/patients/${patientId}/doses/${occurrence.id}/events`, {
      method: 'POST', token: owner.body.token,
      body: { kind: 'skipped', reason: 'The original entry was made for the wrong dose.', correctsEventId: taken.body.event.id, clientActionId: randomUUID() },
    });
    assert.equal(corrected.status, 201);
    assert.equal(corrected.body.event.kind, 'skipped');
    const correctedTimeline = await api<{ timeline: Dose[] }>(`/patients/${patientId}/today?date=${careDate}`, { token: owner.body.token });
    assert.equal(correctedTimeline.body.timeline[0]?.status, 'skipped');
    assert.equal(correctedTimeline.body.timeline[0]?.recordedByName, 'Dose Owner');

    const staleCorrection = await api<{ error: string }>(`/patients/${patientId}/doses/${occurrence.id}/events`, {
      method: 'POST', token: owner.body.token,
      body: { kind: 'taken', reason: 'Stale correction attempt.', correctsEventId: taken.body.event.id, clientActionId: randomUUID() },
    });
    assert.equal(staleCorrection.status, 409);

    const revised = await api<{ versionId: string }>(`/patients/${patientId}/medications/${created.body.medicationId}/revisions`, {
      method: 'POST', token: owner.body.token,
      body: { ...medicine, doseQuantity: 2, schedules: [medicine.schedules[0]] },
    });
    assert.equal(revised.status, 200);
    const pinned = await api<{ timeline: Dose[] }>(`/patients/${patientId}/today?date=${careDate}`, { token: owner.body.token });
    assert.ok(pinned.body.timeline.every((dose) => dose.medicationVersionId === created.body.versionId && dose.doseQuantity === 1));
    const tomorrow = await api<{ timeline: Dose[] }>(`/patients/${patientId}/today?date=${nextDate}`, { token: owner.body.token });
    assert.equal(tomorrow.body.timeline.length, 1);
    assert.equal(tomorrow.body.timeline[0]?.medicationVersionId, revised.body.versionId);
    assert.equal(tomorrow.body.timeline[0]?.doseQuantity, 2);

    const denied = await api<{ error: string }>(`/patients/${patientId}/today?date=${careDate}`, { token: outsider.body.token });
    assert.equal(denied.status, 403);

    const archived = await api<{ ok: boolean }>(
      `/patients/${patientId}/medications/${created.body.medicationId}/archive`,
      { method: 'POST', token: owner.body.token },
    );
    assert.equal(archived.status, 200);
    const activeMedicines = await api<{ medications: Array<{ id: string }> }>(
      `/patients/${patientId}/medications`,
      { token: owner.body.token },
    );
    assert.deepEqual(activeMedicines.body.medications, []);
    const archivedMedicines = await api<{ medications: Array<{ id: string; archivedAt: string | null }> }>(
      `/patients/${patientId}/medications?status=archived`,
      { token: owner.body.token },
    );
    assert.equal(archivedMedicines.body.medications[0]?.id, created.body.medicationId);
    assert.ok(archivedMedicines.body.medications[0]?.archivedAt);

    const history = await api<{ history: HistoryDay[] }>(
      `/patients/${patientId}/history?through=${careDate}&days=7`,
      { token: owner.body.token },
    );
    assert.equal(history.status, 200);
    assert.equal(history.body.history.length, 7);
    const recordedDay = history.body.history.find((day) => day.date === careDate);
    assert.equal(recordedDay?.timeline[0]?.status, 'skipped');
    assert.equal(recordedDay?.timeline[0]?.recordedByName, 'Dose Owner');

    const deniedHistory = await api<{ error: string }>(
      `/patients/${patientId}/history?through=${careDate}&days=7`,
      { token: outsider.body.token },
    );
    assert.equal(deniedHistory.status, 403);

    const restored = await api<{ ok: boolean }>(
      `/patients/${patientId}/medications/${created.body.medicationId}/restore`,
      { method: 'POST', token: owner.body.token },
    );
    assert.equal(restored.status, 200);
    await assert.rejects(
      databasePool.query(
        `INSERT INTO public.dose_events (occurrence_id, patient_id, event_kind, recorded_by, client_action_id)
         VALUES ($1, $2, 'taken', $3, $4)`,
        [occurrence.id, patientId, outsider.body.account.id, randomUUID()],
      ),
      (error: unknown) => (error as { code?: string }).code === '42501',
    );
  } finally {
    await admin.query('DELETE FROM public.dose_events WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.dose_occurrences WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.medication_schedules WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.medication_versions WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.medications WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.patient_members WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.patients WHERE id = $1', [patientId]);
    const accountIds = [owner.body.account.id, caregiver.body.account.id, outsider.body.account.id];
    await admin.query('DELETE FROM alaga_private.auth_sessions WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await admin.query('DELETE FROM alaga_private.accounts WHERE id = ANY($1::uuid[])', [accountIds]);
    await admin.end();
  }
});
