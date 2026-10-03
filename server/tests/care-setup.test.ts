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

type Account = {
  id: string;
  email: string;
  displayName: string;
  careSetup: 'self' | 'family' | 'professional' | null;
};
type AuthResult = { token: string; account: Account };
type Patient = { id: string; displayName: string; isSelf: boolean };

function adminDatabaseUrl() {
  const url = new URL(setupConfig.adminUrl);
  url.pathname = `/${setupConfig.databaseName}`;
  return url.toString();
}

async function api<T>(
  path: string,
  options: { body?: unknown; method?: 'GET' | 'POST' | 'PUT'; token?: string } = {},
) {
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

test('Care Setup persists independently of Self Profile and membership', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'local-test-password';
  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Owner', email: `owner-${suffix}@example.test`, password },
  });
  const caregiver = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Caregiver', email: `caregiver-${suffix}@example.test`, password },
  });
  assert.equal(owner.status, 201);
  assert.equal(owner.body.account.careSetup, null);
  assert.equal(caregiver.status, 201);
  assert.equal(caregiver.body.account.careSetup, null);
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();
  const accountIds = [owner.body.account.id, caregiver.body.account.id];

  try {
    const invalid = await api<{ error: string }>('/account/care-setup', {
      method: 'PUT', token: owner.body.token, body: { careSetup: 'owner' },
    });
    assert.equal(invalid.status, 400);
    const unset = await api<{ account: Account }>('/auth/session', { token: owner.body.token });
    assert.equal(unset.body.account.careSetup, null);

    const chosen = await api<{ account: Account }>('/account/care-setup', {
      method: 'PUT', token: owner.body.token, body: { careSetup: 'self' },
    });
    assert.equal(chosen.status, 200);
    assert.equal(chosen.body.account.careSetup, 'self');
    const restored = await api<{ account: Account }>('/auth/session', { token: owner.body.token });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.account.careSetup, 'self');
    const loggedIn = await api<AuthResult>('/auth/login', {
      method: 'POST', body: { email: owner.body.account.email, password },
    });
    assert.equal(loggedIn.body.account.careSetup, 'self');

    const another = await api<{ patient: Patient }>('/patients', {
      method: 'POST', token: owner.body.token, body: { displayName: 'Family Patient' },
    });
    assert.equal(another.status, 201);
    assert.equal(another.body.patient.isSelf, false);
    const self = await api<{ patient: Patient }>('/patients', {
      method: 'POST', token: owner.body.token, body: { displayName: 'Owner Profile', isSelf: true },
    });
    assert.equal(self.status, 201);
    assert.equal(self.body.patient.isSelf, true);
    const duplicate = await api<{ error: string }>('/patients', {
      method: 'POST', token: owner.body.token, body: { displayName: 'Another Self', isSelf: true },
    });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.error, /Self Profile/i);

    const ownerPatients = await api<{ patients: Patient[] }>('/patients', { token: owner.body.token });
    assert.deepEqual(ownerPatients.body.patients.map(({ id, isSelf }) => ({ id, isSelf })), [
      { id: self.body.patient.id, isSelf: true },
      { id: another.body.patient.id, isSelf: false },
    ]);
    const invitation = await api<{ invitation: { id: string } }>(
      `/patients/${self.body.patient.id}/invitations`,
      { method: 'POST', token: owner.body.token, body: {
        email: caregiver.body.account.email, canManageMedications: false,
      } },
    );
    assert.equal(invitation.status, 201);
    const duplicateInvite = await api<{ error: string }>(`/patients/${self.body.patient.id}/invitations`, {
      method: 'POST', token: owner.body.token,
      body: { email: caregiver.body.account.email.toUpperCase(), canManageMedications: false },
    });
    assert.equal(duplicateInvite.status, 409);
    assert.equal(duplicateInvite.body.error, 'This email already has a pending invitation.');
    const accepted = await api<{ status: string }>(`/invitations/${invitation.body.invitation.id}/accept`, {
      method: 'POST', token: caregiver.body.token,
    });
    assert.equal(accepted.status, 200);
    const caregiverPatients = await api<{ patients: Patient[] }>('/patients', {
      token: caregiver.body.token,
    });
    assert.deepEqual(caregiverPatients.body.patients.map(({ id, isSelf }) => ({ id, isSelf })), [
      { id: self.body.patient.id, isSelf: false },
    ]);
    const caregiverSession = await api<{ account: Account }>('/auth/session', {
      token: caregiver.body.token,
    });
    assert.equal(caregiverSession.body.account.careSetup, null);
  } finally {
    await admin.query(
      'DELETE FROM alaga_private.patient_invitations WHERE invited_by = ANY($1::uuid[])',
      [accountIds],
    );
    await admin.query('DELETE FROM public.patient_members WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await admin.query('DELETE FROM public.patients WHERE created_by = ANY($1::uuid[])', [accountIds]);
    await admin.query('DELETE FROM alaga_private.auth_sessions WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await admin.query('DELETE FROM alaga_private.accounts WHERE id = ANY($1::uuid[])', [accountIds]);
    await admin.end();
  }
});
