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

function adminDatabaseUrl() {
  const url = new URL(setupConfig.adminUrl);
  url.pathname = `/${setupConfig.databaseName}`;
  return url.toString();
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

test('Milestone 3 confirmed medications, version history, permissions, and archive', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'local-test-password';
  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Medicine Owner', email: `med-owner-${suffix}@example.test`, password },
  });
  const caregiver = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Medicine Caregiver', email: `med-caregiver-${suffix}@example.test`, password },
  });
  assert.equal(owner.status, 201);
  assert.equal(caregiver.status, 201);

  const patient = await api<{ patient: { id: string; canManageMedications: boolean } }>('/patients', {
    method: 'POST',
    token: owner.body.token,
    body: { displayName: 'Medication Test Patient' },
  });
  assert.equal(patient.status, 201);
  assert.equal(patient.body.patient.canManageMedications, true);
  const patientId = patient.body.patient.id;
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();

  const baseMedication = {
    displayName: 'Amlodipine',
    genericName: 'amlodipine',
    brandName: '',
    strengthValue: 5,
    strengthUnit: 'mg',
    doseQuantity: 1,
    doseUnit: 'tablet',
    medicineForm: 'tablet',
    route: 'by mouth',
    prescriber: 'Dr. Test',
    reason: 'Synthetic test only',
    originalInstructions: 'Take one tablet twice daily.',
    notes: '',
    sourceKind: 'manual',
    schedules: [
      {
        kind: 'exact',
        timeOfDay: '08:00',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        startOn: '2026-08-25',
        endOn: '',
        timeZone: 'Asia/Manila',
      },
      {
        kind: 'exact',
        timeOfDay: '20:00',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        startOn: '2026-08-25',
        endOn: '',
        timeZone: 'Asia/Manila',
      },
    ],
  };

  try {
    const created = await api<{ medicationId: string; versionId: string }>(
      `/patients/${patientId}/medications`,
      { method: 'POST', token: owner.body.token, body: baseMedication },
    );
    assert.equal(created.status, 201);

    const listed = await api<{
      medications: Array<{
        id: string;
        displayName: string;
        versionNumber: number;
        status: string;
        schedules: Array<{ kind: string; timeOfDay: string }>;
      }>;
    }>(`/patients/${patientId}/medications`, { token: owner.body.token });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.medications.length, 1);
    assert.equal(listed.body.medications[0]?.displayName, 'Amlodipine');
    assert.equal(listed.body.medications[0]?.versionNumber, 1);
    assert.equal(listed.body.medications[0]?.status, 'confirmed');
    assert.deepEqual(listed.body.medications[0]?.schedules.map((schedule) => schedule.timeOfDay), [
      '08:00',
      '20:00',
    ]);

    const intervalCreated = await api<{ medicationId: string }>(
      `/patients/${patientId}/medications`,
      {
        method: 'POST',
        token: owner.body.token,
        body: {
          ...baseMedication,
          displayName: 'Synthetic interval medicine',
          schedules: [
            {
              kind: 'interval',
              timeOfDay: '06:00',
              intervalHours: 8,
              weekdays: [0, 1, 2, 3, 4, 5, 6],
              startOn: '2026-08-25',
              endOn: '',
              timeZone: 'Asia/Manila',
            },
          ],
        },
      },
    );
    assert.equal(intervalCreated.status, 201);

    const withInterval = await api<{
      medications: Array<{ id: string; schedules: Array<{ kind: string; intervalHours: number }> }>;
    }>(`/patients/${patientId}/medications`, { token: owner.body.token });
    const intervalMedication = withInterval.body.medications.find(
      (medication) => medication.id === intervalCreated.body.medicationId,
    );
    assert.equal(intervalMedication?.schedules[0]?.kind, 'interval');
    assert.equal(intervalMedication?.schedules[0]?.intervalHours, 8);

    const intervalArchived = await api<{ ok: boolean }>(
      `/patients/${patientId}/medications/${intervalCreated.body.medicationId}/archive`,
      { method: 'POST', token: owner.body.token },
    );
    assert.equal(intervalArchived.status, 200);

    await assert.rejects(
      databasePool.query(
        'INSERT INTO public.medications (patient_id, created_by) VALUES ($1, $2)',
        [patientId, caregiver.body.account.id],
      ),
      (error: unknown) => (error as { code?: string }).code === '42501',
    );

    await admin.query(
      `INSERT INTO public.patient_members (
         patient_id, account_id, role, granted_by, can_manage_medications
       ) VALUES ($1, $2, 'caregiver', $3, false)`,
      [patientId, caregiver.body.account.id, owner.body.account.id],
    );

    const deniedRevision = await api<{ error: string }>(
      `/patients/${patientId}/medications/${created.body.medicationId}/revisions`,
      {
        method: 'POST',
        token: caregiver.body.token,
        body: { ...baseMedication, doseQuantity: 2 },
      },
    );
    assert.equal(deniedRevision.status, 403);

    await admin.query(
      `UPDATE public.patient_members
       SET can_manage_medications = true
       WHERE patient_id = $1 AND account_id = $2 AND revoked_at IS NULL`,
      [patientId, caregiver.body.account.id],
    );

    const caregiverPatients = await api<{
      patients: Array<{ id: string; canManageMedications: boolean }>;
    }>('/patients', { token: caregiver.body.token });
    assert.equal(caregiverPatients.body.patients[0]?.canManageMedications, true);

    const revised = await api<{ medicationId: string; versionId: string }>(
      `/patients/${patientId}/medications/${created.body.medicationId}/revisions`,
      {
        method: 'POST',
        token: caregiver.body.token,
        body: {
          ...baseMedication,
          doseQuantity: 2,
          schedules: [
            {
              kind: 'meal',
              timeOfDay: '08:00',
              weekdays: [0, 1, 2, 3, 4, 5, 6],
              mealName: 'breakfast',
              mealRelation: 'after',
              windowStart: '07:00',
              windowEnd: '09:00',
              startOn: '2026-08-25',
              endOn: '',
              timeZone: 'Asia/Manila',
            },
          ],
        },
      },
    );
    assert.equal(revised.status, 200);
    assert.notEqual(revised.body.versionId, created.body.versionId);

    const current = await api<{
      medications: Array<{
        doseQuantity: number;
        versionNumber: number;
        schedules: Array<{ kind: string; mealRelation: string }>;
      }>;
    }>(`/patients/${patientId}/medications`, { token: caregiver.body.token });
    assert.equal(current.body.medications[0]?.versionNumber, 2);
    assert.equal(current.body.medications[0]?.doseQuantity, 2);
    assert.equal(current.body.medications[0]?.schedules[0]?.kind, 'meal');
    assert.equal(current.body.medications[0]?.schedules[0]?.mealRelation, 'after');

    const history = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.medication_versions WHERE medication_id = $1',
      [created.body.medicationId],
    );
    assert.equal(history.rows[0]?.count, '2');

    const archived = await api<{ ok: boolean }>(
      `/patients/${patientId}/medications/${created.body.medicationId}/archive`,
      { method: 'POST', token: owner.body.token },
    );
    assert.equal(archived.status, 200);

    const afterArchive = await api<{ medications: unknown[] }>(
      `/patients/${patientId}/medications`,
      { token: owner.body.token },
    );
    assert.deepEqual(afterArchive.body.medications, []);

    const restoredMedication = await api<{ ok: boolean }>(
      `/patients/${patientId}/medications/${created.body.medicationId}/restore`,
      { method: 'POST', token: owner.body.token },
    );
    assert.equal(restoredMedication.status, 200);

    const afterRestore = await api<{ medications: Array<{ id: string; versionNumber: number }> }>(
      `/patients/${patientId}/medications`,
      { token: owner.body.token },
    );
    assert.equal(afterRestore.body.medications[0]?.id, created.body.medicationId);
    assert.equal(afterRestore.body.medications[0]?.versionNumber, 2);

    const archivedAgain = await api<{ ok: boolean }>(
      `/patients/${patientId}/medications/${created.body.medicationId}/archive`,
      { method: 'POST', token: owner.body.token },
    );
    assert.equal(archivedAgain.status, 200);

    const retained = await admin.query<{ archived: boolean; version_count: string }>(
      `SELECT medication.archived_at IS NOT NULL AS archived,
              count(version.id)::text AS version_count
       FROM public.medications AS medication
       JOIN public.medication_versions AS version ON version.medication_id = medication.id
       WHERE medication.id = $1
       GROUP BY medication.archived_at`,
      [created.body.medicationId],
    );
    assert.equal(retained.rows[0]?.archived, true);
    assert.equal(retained.rows[0]?.version_count, '2');
  } finally {
    await admin.query('DELETE FROM public.medication_schedules WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.medication_versions WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.medications WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.patient_members WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.patients WHERE id = $1', [patientId]);
    await admin.query('DELETE FROM alaga_private.auth_sessions WHERE account_id = ANY($1::uuid[])', [
      [owner.body.account.id, caregiver.body.account.id],
    ]);
    await admin.query('DELETE FROM alaga_private.accounts WHERE id = ANY($1::uuid[])', [
      [owner.body.account.id, caregiver.body.account.id],
    ]);
    await admin.end();
  }
});
