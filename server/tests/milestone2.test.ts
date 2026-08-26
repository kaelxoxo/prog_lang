import { createHash } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createAppServer } from '../src/app';
import { serverConfig, setupConfig } from '../src/config';
import { databasePool } from '../src/database';

const { Client } = pg;
const server = createAppServer(databasePool);
let baseUrl = '';

type ApiResult<T> = {
  status: number;
  body: T;
};

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

  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await databasePool.end();
});

test('Milestone 2 authentication, patient ownership, RLS, grants, and revocation', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ownerEmail = `owner-${suffix}@example.test`;
  const caregiverEmail = `caregiver-${suffix}@example.test`;
  const password = 'local-test-password';
  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Test Owner', email: ownerEmail, password },
  });
  const caregiver = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Test Caregiver', email: caregiverEmail, password },
  });

  assert.equal(owner.status, 201);
  assert.equal(caregiver.status, 201);

  const restoredSession = await api<{ account: AuthResult['account'] }>('/auth/session', {
    token: owner.body.token,
  });
  assert.equal(restoredSession.status, 200);
  assert.equal(restoredSession.body.account.id, owner.body.account.id);

  const ownerInitially = await api<{ patients: unknown[] }>('/patients', {
    token: owner.body.token,
  });
  assert.equal(ownerInitially.status, 200);
  assert.deepEqual(ownerInitially.body.patients, []);

  const created = await api<{
    patient: { id: string; displayName: string; role: string };
  }>('/patients', {
    method: 'POST',
    token: owner.body.token,
    body: { displayName: 'Synthetic Patient' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.patient.role, 'owner');

  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();

  try {
    const membershipCount = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM public.patient_members
       WHERE patient_id = $1 AND account_id = $2 AND role = 'owner' AND revoked_at IS NULL`,
      [created.body.patient.id, owner.body.account.id],
    );
    assert.equal(membershipCount.rows[0]?.count, '1');

    const caregiverCannotGuess = await api<{ patients: unknown[] }>('/patients', {
      token: caregiver.body.token,
    });
    assert.equal(caregiverCannotGuess.status, 200);
    assert.deepEqual(caregiverCannotGuess.body.patients, []);

    await assert.rejects(
      databasePool.query(
        `INSERT INTO public.patient_members (patient_id, account_id, role, granted_by)
         VALUES ($1, $2, 'owner', $2)`,
        [created.body.patient.id, caregiver.body.account.id],
      ),
      (error: unknown) => (error as { code?: string }).code === '42501',
    );

    await assert.rejects(
      databasePool.query(
        'UPDATE public.patient_members SET role = \'owner\' WHERE patient_id = $1',
        [created.body.patient.id],
      ),
      (error: unknown) => (error as { code?: string }).code === '42501',
    );

    await admin.query(
      `INSERT INTO public.patient_members (patient_id, account_id, role, granted_by)
       VALUES ($1, $2, 'caregiver', $3)`,
      [created.body.patient.id, caregiver.body.account.id, owner.body.account.id],
    );

    const caregiverAfterGrant = await api<{ patients: Array<{ id: string }> }>('/patients', {
      token: caregiver.body.token,
    });
    assert.equal(caregiverAfterGrant.body.patients[0]?.id, created.body.patient.id);

    const ownerTokenHash = createHash('sha256').update(owner.body.token).digest('hex');
    const ownerClient = await databasePool.connect();
    try {
      await ownerClient.query('BEGIN');
      await ownerClient.query("SELECT set_config('alaga.session_token_hash', $1, true)", [ownerTokenHash]);
      await ownerClient.query('SELECT app_api.revoke_patient_membership($1, $2)', [
        created.body.patient.id,
        caregiver.body.account.id,
      ]);
      await ownerClient.query('COMMIT');
    } catch (error) {
      await ownerClient.query('ROLLBACK');
      throw error;
    } finally {
      ownerClient.release();
    }

    const caregiverAfterRevocation = await api<{ patients: unknown[] }>('/patients', {
      token: caregiver.body.token,
    });
    assert.deepEqual(caregiverAfterRevocation.body.patients, []);

    const loggedOut = await api<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      token: owner.body.token,
    });
    assert.equal(loggedOut.status, 200);

    const revokedSession = await api<{ error: string }>('/auth/session', {
      token: owner.body.token,
    });
    assert.equal(revokedSession.status, 401);
  } finally {
    await admin.query('DELETE FROM public.patient_members WHERE account_id = ANY($1::uuid[])', [
      [owner.body.account.id, caregiver.body.account.id],
    ]);
    await admin.query('DELETE FROM public.patients WHERE created_by = $1', [owner.body.account.id]);
    await admin.query('DELETE FROM alaga_private.auth_sessions WHERE account_id = ANY($1::uuid[])', [
      [owner.body.account.id, caregiver.body.account.id],
    ]);
    await admin.query('DELETE FROM alaga_private.accounts WHERE id = ANY($1::uuid[])', [
      [owner.body.account.id, caregiver.body.account.id],
    ]);
    await admin.end();
  }
});
