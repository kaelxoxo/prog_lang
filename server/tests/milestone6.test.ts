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

type AuthResult = {
  token: string;
  account: { id: string; email: string; displayName: string };
};

type Invitation = {
  id: string;
  patientId: string;
  patientName: string;
  invitedByName: string;
  canManageMedications: boolean;
};

function adminDatabaseUrl() {
  const url = new URL(setupConfig.adminUrl);
  url.pathname = `/${setupConfig.databaseName}`;
  return url.toString();
}

async function api<T>(
  path: string,
  options: { body?: unknown; method?: 'GET' | 'POST'; token?: string } = {},
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

test('Milestone 6 invitation acceptance, care-circle authorization, and revocation', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'local-test-password';
  const caregiverEmail = `caregiver-${suffix}@example.test`;
  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Invitation Owner', email: `owner-${suffix}@example.test`, password },
  });
  const caregiver = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Invitation Caregiver', email: caregiverEmail, password },
  });
  const outsider = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Invitation Outsider', email: `outsider-${suffix}@example.test`, password },
  });
  const patient = await api<{ patient: { id: string } }>('/patients', {
    method: 'POST',
    token: owner.body.token,
    body: { displayName: 'Shared Synthetic Patient' },
  });
  const patientId = patient.body.patient.id;
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();

  try {
    const unauthorizedInvite = await api<{ error: string }>(`/patients/${patientId}/invitations`, {
      method: 'POST',
      token: outsider.body.token,
      body: { email: caregiverEmail, canManageMedications: true },
    });
    assert.equal(unauthorizedInvite.status, 403);

    const created = await api<{ invitation: { id: string; email: string; canManageMedications: boolean } }>(
      `/patients/${patientId}/invitations`,
      {
        method: 'POST',
        token: owner.body.token,
        body: { email: caregiverEmail.toUpperCase(), canManageMedications: true },
      },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.invitation.email, caregiverEmail);
    assert.equal(created.body.invitation.canManageMedications, true);

    const duplicate = await api<{ error: string }>(`/patients/${patientId}/invitations`, {
      method: 'POST',
      token: owner.body.token,
      body: { email: caregiverEmail, canManageMedications: false },
    });
    assert.equal(duplicate.status, 409);

    const outsiderInbox = await api<{ invitations: Invitation[] }>('/invitations', {
      token: outsider.body.token,
    });
    assert.deepEqual(outsiderInbox.body.invitations, []);
    const outsiderAcceptance = await api<{ error: string }>(
      `/invitations/${created.body.invitation.id}/accept`,
      { method: 'POST', token: outsider.body.token },
    );
    assert.equal(outsiderAcceptance.status, 404);

    const inbox = await api<{ invitations: Invitation[] }>('/invitations', {
      token: caregiver.body.token,
    });
    assert.equal(inbox.status, 200);
    assert.equal(inbox.body.invitations[0]?.patientId, patientId);
    assert.equal(inbox.body.invitations[0]?.patientName, 'Shared Synthetic Patient');
    assert.equal(inbox.body.invitations[0]?.invitedByName, 'Invitation Owner');

    const accepted = await api<{ status: string }>(
      `/invitations/${created.body.invitation.id}/accept`,
      { method: 'POST', token: caregiver.body.token },
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, 'accepted');

    const acceptedRetry = await api<{ status: string }>(
      `/invitations/${created.body.invitation.id}/accept`,
      { method: 'POST', token: caregiver.body.token },
    );
    assert.equal(acceptedRetry.status, 200);

    const caregiverPatients = await api<{
      patients: Array<{ id: string; role: string; canManageMedications: boolean }>;
    }>('/patients', { token: caregiver.body.token });
    assert.equal(caregiverPatients.body.patients[0]?.id, patientId);
    assert.equal(caregiverPatients.body.patients[0]?.role, 'caregiver');
    assert.equal(caregiverPatients.body.patients[0]?.canManageMedications, true);

    const careCircle = await api<{
      members: Array<{ accountId: string; email: string; role: string }>;
      invitations: unknown[];
    }>(`/patients/${patientId}/care-circle`, { token: owner.body.token });
    assert.equal(careCircle.status, 200);
    assert.equal(careCircle.body.members.length, 2);
    assert.equal(careCircle.body.members[1]?.email, caregiverEmail);
    assert.deepEqual(careCircle.body.invitations, []);

    const hiddenCircle = await api<{ error: string }>(`/patients/${patientId}/care-circle`, {
      token: caregiver.body.token,
    });
    assert.equal(hiddenCircle.status, 403);

    const caregiverCannotInvite = await api<{ error: string }>(`/patients/${patientId}/invitations`, {
      method: 'POST',
      token: caregiver.body.token,
      body: { email: outsider.body.account.email, canManageMedications: false },
    });
    assert.equal(caregiverCannotInvite.status, 403);

    const revoked = await api<{ ok: boolean }>(
      `/patients/${patientId}/members/${caregiver.body.account.id}/revoke`,
      { method: 'POST', token: owner.body.token },
    );
    assert.equal(revoked.status, 200);
    const caregiverAfterRevocation = await api<{ patients: unknown[] }>('/patients', {
      token: caregiver.body.token,
    });
    assert.deepEqual(caregiverAfterRevocation.body.patients, []);

    const declinedInvite = await api<{ invitation: { id: string } }>(
      `/patients/${patientId}/invitations`,
      {
        method: 'POST',
        token: owner.body.token,
        body: { email: outsider.body.account.email, canManageMedications: false },
      },
    );
    const declined = await api<{ status: string }>(
      `/invitations/${declinedInvite.body.invitation.id}/decline`,
      { method: 'POST', token: outsider.body.token },
    );
    assert.equal(declined.status, 200);
    assert.equal(declined.body.status, 'declined');
    const outsiderPatients = await api<{ patients: unknown[] }>('/patients', {
      token: outsider.body.token,
    });
    assert.deepEqual(outsiderPatients.body.patients, []);

    const cancelledInvite = await api<{ invitation: { id: string } }>(
      `/patients/${patientId}/invitations`,
      {
        method: 'POST',
        token: owner.body.token,
        body: { email: `later-${suffix}@example.test`, canManageMedications: false },
      },
    );
    const cancelled = await api<{ ok: boolean }>(
      `/patients/${patientId}/invitations/${cancelledInvite.body.invitation.id}/cancel`,
      { method: 'POST', token: owner.body.token },
    );
    assert.equal(cancelled.status, 200);

    await assert.rejects(
      databasePool.query('SELECT * FROM alaga_private.patient_invitations'),
      (error: unknown) => (error as { code?: string }).code === '42501',
    );
  } finally {
    await admin.query('DELETE FROM alaga_private.patient_invitations WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.patient_members WHERE patient_id = $1', [patientId]);
    await admin.query('DELETE FROM public.patients WHERE id = $1', [patientId]);
    const accountIds = [owner.body.account.id, caregiver.body.account.id, outsider.body.account.id];
    await admin.query('DELETE FROM alaga_private.auth_sessions WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await admin.query('DELETE FROM alaga_private.accounts WHERE id = ANY($1::uuid[])', [accountIds]);
    await admin.end();
  }
});
