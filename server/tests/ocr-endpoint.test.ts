import { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createAppServer } from '../src/app';
import { setupConfig } from '../src/config';
import { databasePool } from '../src/database';

const { Client } = pg;
let recognitions = 0;
const server = createAppServer(databasePool, {
  recognizeImage: async (_image, sourceKind) => {
    recognitions += 1;
    return {
      confidence: 90,
      displayName: 'Synthetic OCR medicine',
      doseQuantity: 1,
      doseUnit: 'tablet',
      exactTimes: ['08:00'],
      medicineForm: 'tablet',
      originalInstructions: 'Synthetic OCR medicine 5 mg. Take 1 tablet at 8:00 AM.',
      rawText: 'Synthetic OCR medicine 5 mg. Take 1 tablet at 8:00 AM.',
      route: '',
      sourceKind,
      strengthUnit: 'mg',
      strengthValue: 5,
      warnings: ['Review every field.'],
    };
  },
});
let baseUrl = '';

type AuthResult = { token: string; account: { id: string } };

function adminDatabaseUrl() {
  const url = new URL(setupConfig.adminUrl);
  url.pathname = `/${setupConfig.databaseName}`;
  return url.toString();
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

test('synthetic OCR requires medicine-manager permission and returns a reviewable draft', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'local-test-password';
  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'OCR Owner', email: `ocr-owner-${suffix}@example.test`, password },
  });
  const caregiver = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'OCR Caregiver', email: `ocr-caregiver-${suffix}@example.test`, password },
  });
  const patient = await api<{ patient: { id: string } }>('/patients', {
    method: 'POST',
    token: owner.body.token,
    body: { displayName: 'OCR Synthetic Patient' },
  });
  const patientId = patient.body.patient.id;
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();

  try {
    await admin.query(
      `INSERT INTO public.patient_members (
         patient_id, account_id, role, granted_by, can_manage_medications
       ) VALUES ($1, $2, 'caregiver', $3, false)`,
      [patientId, caregiver.body.account.id, owner.body.account.id],
    );
    const imageBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const requestBody = { imageBase64, mimeType: 'image/jpeg', sourceKind: 'label_photo' };

    const denied = await api<{ error: string }>(`/patients/${patientId}/imports/ocr`, {
      method: 'POST',
      token: caregiver.body.token,
      body: requestBody,
    });
    assert.equal(denied.status, 403);
    assert.equal(recognitions, 0);

    const imported = await api<{ draft: { displayName: string; sourceKind: string; exactTimes: string[] } }>(
      `/patients/${patientId}/imports/ocr`,
      { method: 'POST', token: owner.body.token, body: requestBody },
    );
    assert.equal(imported.status, 200);
    assert.equal(imported.body.draft.displayName, 'Synthetic OCR medicine');
    assert.equal(imported.body.draft.sourceKind, 'label_photo');
    assert.deepEqual(imported.body.draft.exactTimes, ['08:00']);
    assert.equal(recognitions, 1);
  } finally {
    await admin.query('DELETE FROM public.patient_members WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.patients WHERE id = $1', [patientId]);
    const accountIds = [owner.body.account.id, caregiver.body.account.id];
    await admin.query('DELETE FROM alaga_private.auth_sessions WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await admin.query('DELETE FROM alaga_private.accounts WHERE id = ANY($1::uuid[])', [accountIds]);
    await admin.end();
  }
});
