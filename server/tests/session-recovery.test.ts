import { createHash } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createAppServer } from '../src/app';
import { setupConfig } from '../src/config';
import { databasePool } from '../src/database';

const { Client } = pg;
let server = createAppServer(databasePool);
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
  options: { body?: unknown; method?: 'GET' | 'POST'; token?: string; authHeader?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.authHeader !== undefined) {
    headers.Authorization = options.authHeader;
  } else if (options.token !== undefined) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  return { status: response.status, body: (await response.json()) as T };
}

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server.listening) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await databasePool.end();
});

test('Session restore, expiration, sign-out, and recovery after API downtime', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `session-user-${suffix}@example.test`;
  const password = 'local-test-password-123';
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();

  let accountId = '';

  try {
    // 1. Register and verify token authentication
    const registered = await api<AuthResult>('/auth/register', {
      method: 'POST',
      body: { displayName: 'Session User', email, password },
    });
    assert.equal(registered.status, 201);
    const token1 = registered.body.token;
    accountId = registered.body.account.id;

    const restoredSession1 = await api<{ account: AuthResult['account'] }>('/auth/session', {
      token: token1,
    });
    assert.equal(restoredSession1.status, 200);
    assert.equal(restoredSession1.body.account.id, accountId);
    assert.equal(restoredSession1.body.account.email, email);
    assert.equal(restoredSession1.body.account.displayName, 'Session User');

    // 2. Multi-session support: logging in from a second device creates token2
    const login2 = await api<AuthResult>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(login2.status, 200);
    const token2 = login2.body.token;
    assert.notEqual(token1, token2);

    const restoredSession2 = await api<{ account: AuthResult['account'] }>('/auth/session', {
      token: token2,
    });
    assert.equal(restoredSession2.status, 200);
    assert.equal(restoredSession2.body.account.id, accountId);

    // 3. Sign out of device 1 (token1): revokes token1 only, token2 remains valid
    const loggedOut1 = await api<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      token: token1,
    });
    assert.equal(loggedOut1.status, 200);

    const checkToken1AfterLogout = await api<{ error: string }>('/auth/session', {
      token: token1,
    });
    assert.equal(checkToken1AfterLogout.status, 401);
    assert.equal(checkToken1AfterLogout.body.error, 'Your session has expired. Sign in again.');

    const checkToken2AfterLogout1 = await api<{ account: AuthResult['account'] }>('/auth/session', {
      token: token2,
    });
    assert.equal(checkToken2AfterLogout1.status, 200);
    assert.equal(checkToken2AfterLogout1.body.account.id, accountId);

    // 4. Invalid token rejection:
    // a) Missing Authorization header
    const missingAuth = await api<{ error: string }>('/auth/session', {});
    assert.equal(missingAuth.status, 401);
    assert.equal(missingAuth.body.error, 'A valid session is required.');

    // b) Malformed scheme (e.g. Basic instead of Bearer)
    const malformedScheme = await api<{ error: string }>('/auth/session', {
      authHeader: 'Basic dXNlcjpwYXNz',
    });
    assert.equal(malformedScheme.status, 401);
    assert.equal(malformedScheme.body.error, 'A valid session is required.');

    // c) Empty Bearer token
    const emptyBearer = await api<{ error: string }>('/auth/session', {
      authHeader: 'Bearer ',
    });
    assert.equal(emptyBearer.status, 401);
    assert.equal(emptyBearer.body.error, 'A valid session is required.');

    // d) Random fabricated token
    const fabricatedToken = await api<{ error: string }>('/auth/session', {
      token: 'nonexistent-session-token-random-value-12345',
    });
    assert.equal(fabricatedToken.status, 401);
    assert.equal(fabricatedToken.body.error, 'Your session has expired. Sign in again.');

    // 5. Expired session rejection:
    // Update token2 session in DB to be expired (expires_at in the past)
    const token2Hash = createHash('sha256').update(token2).digest('hex');
    await admin.query(
      `UPDATE alaga_private.auth_sessions
       SET created_at = now() - interval '2 days',
           expires_at = now() - interval '1 day'
       WHERE token_hash = $1`,
      [token2Hash],
    );

    const expiredCheck = await api<{ error: string }>('/auth/session', {
      token: token2,
    });
    assert.equal(expiredCheck.status, 401);
    assert.equal(expiredCheck.body.error, 'Your session has expired. Sign in again.');

    // 6. Recovery after API downtime:
    // Create a fresh third session (token3)
    const login3 = await api<AuthResult>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(login3.status, 200);
    const token3 = login3.body.token;

    // Verify token3 works before downtime
    const beforeDowntime = await api<{ account: AuthResult['account'] }>('/auth/session', {
      token: token3,
    });
    assert.equal(beforeDowntime.status, 200);

    // Simulate API downtime by closing the server
    const currentPort = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Verify requests fail during downtime (connection error, not 401)
    let downtimeFailed = false;
    try {
      await fetch(`${baseUrl}/auth/session`, {
        headers: { Authorization: `Bearer ${token3}` },
      });
    } catch {
      downtimeFailed = true;
    }
    assert.equal(downtimeFailed, true, 'Request must fail when server is down');

    // Restore server on the same port (simulating service recovery)
    server = createAppServer(databasePool);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(currentPort, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${currentPort}`;

    // Verify that after API recovers, token3 is immediately restored from PostgreSQL
    const afterRecovery = await api<{ account: AuthResult['account'] }>('/auth/session', {
      token: token3,
    });
    assert.equal(afterRecovery.status, 200);
    assert.equal(afterRecovery.body.account.id, accountId);
    assert.equal(afterRecovery.body.account.email, email);

    // Verify health endpoint is also active
    const health = await api<{ ok: boolean }>('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
  } finally {
    if (accountId) {
      await admin.query('DELETE FROM alaga_private.auth_sessions WHERE account_id = $1', [accountId]);
      await admin.query('DELETE FROM alaga_private.accounts WHERE id = $1', [accountId]);
    }
    await admin.end();
  }
});
