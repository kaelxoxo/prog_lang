import { execFile } from 'node:child_process';
import { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';

import pg from 'pg';

import { createAppServer } from '../src/app';
import { setupConfig } from '../src/config';
import { databasePool } from '../src/database';

const { Client } = pg;
const execFileAsync = promisify(execFile);
const server = createAppServer(databasePool);
let baseUrl = '';

function adminDatabaseUrl() {
  const url = new URL(setupConfig.adminUrl);
  url.pathname = `/${setupConfig.databaseName}`;
  return url.toString();
}

async function runReset(confirmFlag: boolean) {
  const args = [
    '--env-file-if-exists=.env.server.local',
    '--import',
    'tsx',
    'server/src/resetSyntheticDatabase.ts',
  ];
  if (confirmFlag) {
    args.push('--confirm-synthetic-reset');
  }

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
    });
    return { code: 0, stdout, stderr };
  } catch (error: unknown) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
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

test('Deterministic synthetic reset validates guard flag, seeds complete scenario, and is idempotent', async () => {
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();

  try {
    // 1. Safety guard: executing without --confirm-synthetic-reset must be rejected
    const unconfirmed = await runReset(false);
    assert.equal(unconfirmed.code, 1);
    assert.match(
      unconfirmed.stderr + unconfirmed.stdout,
      /--confirm-synthetic-reset/i,
      'Reset without confirmation must mention the confirmation flag',
    );

    // 2. Confirmed reset: first execution
    const firstReset = await runReset(true);
    assert.equal(firstReset.code, 0);
    assert.match(firstReset.stdout, /Synthetic Alaga data is ready/i);
    assert.match(firstReset.stdout, /maya@example\.test/i);
    assert.match(firstReset.stdout, /paolo@example\.test/i);
    assert.match(firstReset.stdout, /Lola Rosa \(Synthetic\)/i);

    // Query DB to verify deterministic entities and counts
    const accounts1 = await admin.query<{ email: string; display_name: string }>(
      'SELECT email, display_name FROM alaga_private.accounts ORDER BY email ASC',
    );
    assert.equal(accounts1.rows.length, 2);
    assert.equal(accounts1.rows[0]?.email, 'maya@example.test');
    assert.equal(accounts1.rows[0]?.display_name, 'Maya Santos');
    assert.equal(accounts1.rows[1]?.email, 'paolo@example.test');
    assert.equal(accounts1.rows[1]?.display_name, 'Paolo Santos');

    const patients1 = await admin.query<{ display_name: string }>(
      'SELECT display_name FROM public.patients WHERE archived_at IS NULL',
    );
    assert.equal(patients1.rows.length, 1);
    assert.equal(patients1.rows[0]?.display_name, 'Lola Rosa (Synthetic)');

    const members1 = await admin.query<{ role: string; can_manage_medications: boolean }>(
      'SELECT role, can_manage_medications FROM public.patient_members WHERE revoked_at IS NULL ORDER BY role DESC',
    );
    assert.equal(members1.rows.length, 2);
    assert.equal(members1.rows[0]?.role, 'owner');
    assert.equal(members1.rows[0]?.can_manage_medications, false);
    assert.equal(members1.rows[1]?.role, 'caregiver');
    assert.equal(members1.rows[1]?.can_manage_medications, false);

    const medications1 = await admin.query<{ display_name: string }>(
      `SELECT version.display_name
       FROM public.medications AS medication
       JOIN public.medication_versions AS version ON version.medication_id = medication.id
       WHERE medication.archived_at IS NULL
       ORDER BY version.display_name ASC`,
    );
    assert.equal(medications1.rows.length, 2);
    assert.equal(medications1.rows[0]?.display_name, 'Amlodipine (Synthetic)');
    assert.equal(medications1.rows[1]?.display_name, 'Calcium supplement (Synthetic)');

    const schedules1 = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.medication_schedules',
    );
    assert.equal(schedules1.rows[0]?.count, '3');

    const doseEvents1 = await admin.query<{ event_kind: string; reason: string | null }>(
      'SELECT event_kind, reason FROM public.dose_events ORDER BY recorded_at ASC',
    );
    assert.equal(doseEvents1.rows.length, 5);
    const takenEvents = doseEvents1.rows.filter((e) => e.event_kind === 'taken');
    const skippedEvents = doseEvents1.rows.filter((e) => e.event_kind === 'skipped');
    assert.equal(takenEvents.length, 4);
    assert.equal(skippedEvents.length, 1);
    assert.equal(skippedEvents[0]?.reason, 'Synthetic history example.');

    // 3. Repeatability: second execution must succeed and produce identical state
    const secondReset = await runReset(true);
    assert.equal(secondReset.code, 0);

    const accounts2 = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM alaga_private.accounts',
    );
    assert.equal(accounts2.rows[0]?.count, '2');

    const patients2 = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.patients',
    );
    assert.equal(patients2.rows[0]?.count, '1');

    const medications2 = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.medications',
    );
    assert.equal(medications2.rows[0]?.count, '2');

    const doseEvents2 = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.dose_events',
    );
    assert.equal(doseEvents2.rows[0]?.count, '5');

    // 4. Verify authentication with seeded demo credentials via API
    const mayaLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'maya@example.test', password: 'alaga-synthetic-only' }),
    });
    assert.equal(mayaLogin.status, 200);
    const mayaAuth = (await mayaLogin.json()) as { token: string; account: { displayName: string } };
    assert.equal(mayaAuth.account.displayName, 'Maya Santos');

    const paoloLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'paolo@example.test', password: 'alaga-synthetic-only' }),
    });
    assert.equal(paoloLogin.status, 200);
    const paoloAuth = (await paoloLogin.json()) as { token: string; account: { displayName: string } };
    assert.equal(paoloAuth.account.displayName, 'Paolo Santos');

    // Verify Maya's patient list has Lola Rosa
    const mayaPatients = await fetch(`${baseUrl}/patients`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
    });
    assert.equal(mayaPatients.status, 200);
    const patientsList = (await mayaPatients.json()) as {
      patients: Array<{ id: string; displayName: string; role: string; canManageMedications: boolean }>;
    };
    assert.equal(patientsList.patients.length, 1);
    assert.equal(patientsList.patients[0]?.displayName, 'Lola Rosa (Synthetic)');
    assert.equal(patientsList.patients[0]?.role, 'owner');
    assert.equal(patientsList.patients[0]?.canManageMedications, true);
  } finally {
    await admin.end();
  }
});
