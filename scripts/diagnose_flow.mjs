import pg from 'pg';
import crypto from 'crypto';
import { setupConfig, serverConfig } from '../server/src/config.js';

const { Client } = pg;

async function run() {
  const adminUrl = new URL(setupConfig.adminUrl);
  adminUrl.pathname = `/${setupConfig.databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  console.log('Connected to admin');

  // Truncate tables like clearAppData
  await admin.query(`
    TRUNCATE TABLE
      alaga_private.patient_invitations,
      public.medication_inventory_events,
      public.medication_inventory,
      public.dose_events,
      public.dose_occurrences,
      public.medication_schedules,
      public.medication_versions,
      public.medications,
      public.patient_members,
      public.patients,
      alaga_private.auth_sessions,
      alaga_private.accounts
    RESTART IDENTITY
  `);
  console.log('Truncated successfully');

  // Now connect as alaga_api
  const apiUser = new Client({ connectionString: serverConfig.databaseUrl });
  await apiUser.connect();
  console.log('Connected as alaga_api');

  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const reg = await apiUser.query(
    'SELECT * FROM app_api.register_account($1, $2, $3, $4, $5)',
    ['maya@example.test', 'Maya Santos', 'AlagaDemoPassword123!', hash, expiresAt]
  );
  console.log('Registered account:', reg.rows[0]);

  // Now resolve_session
  await apiUser.query("SELECT set_config('alaga.session_token_hash', $1, true)", [hash]);
  const res = await apiUser.query('SELECT * FROM app_api.resolve_session($1)', [hash]);
  console.log('Resolved session:', res.rows);

  await admin.end();
  await apiUser.end();
}

run().catch(console.error);
