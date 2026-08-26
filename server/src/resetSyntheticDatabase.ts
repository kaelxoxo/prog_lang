import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';

import pg from 'pg';

import { createAppServer } from './app';
import { setupConfig } from './config';
import { databasePool } from './database';

const { Client } = pg;
const confirmationFlag = '--confirm-synthetic-reset';
const demoPassword = 'alaga-synthetic-only';

type ApiOptions = {
  body?: unknown;
  method?: 'GET' | 'POST';
  token?: string;
};

type AuthResult = {
  token: string;
  account: { id: string; email: string; displayName: string };
};

function databaseUrl() {
  const url = new URL(setupConfig.adminUrl);
  url.pathname = `/${setupConfig.databaseName}`;
  return url.toString();
}

function assertSafeResetTarget() {
  if (!/(?:^|_)(?:dev|test)$/i.test(setupConfig.databaseName)) {
    throw new Error(
      `Refusing to reset ${setupConfig.databaseName}. The database name must end in _dev or _test.`,
    );
  }

  if (!process.argv.includes(confirmationFlag)) {
    throw new Error(
      `Synthetic reset deletes local app data. Run again with: npm run db:reset:synthetic -- ${confirmationFlag}`,
    );
  }
}

function manilaDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Manila',
    year: 'numeric',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';

  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

async function clearAppData() {
  const admin = new Client({ connectionString: databaseUrl() });
  await admin.connect();

  try {
    await admin.query(`
      TRUNCATE TABLE
        alaga_private.patient_invitations,
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
  } finally {
    await admin.end();
  }
}

async function main() {
  assertSafeResetTarget();
  await clearAppData();

  const server = createAppServer(databasePool);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const api = async <T>(path: string, options: ApiOptions = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const result = await response.json() as T & { error?: string };

    if (!response.ok) {
      throw new Error(result.error || `Synthetic setup failed at ${path}.`);
    }

    return result;
  };

  try {
    const owner = await api<AuthResult>('/auth/register', {
      method: 'POST',
      body: {
        displayName: 'Maya Santos',
        email: 'maya@example.test',
        password: demoPassword,
      },
    });
    const caregiver = await api<AuthResult>('/auth/register', {
      method: 'POST',
      body: {
        displayName: 'Paolo Santos',
        email: 'paolo@example.test',
        password: demoPassword,
      },
    });
    const patient = await api<{ patient: { id: string } }>('/patients', {
      method: 'POST',
      token: owner.token,
      body: { displayName: 'Lola Rosa (Synthetic)' },
    });
    const today = manilaDate();
    const startOn = addDays(today, -6);
    const patientId = patient.patient.id;
    const commonMedication = {
      brandName: '',
      endOn: '',
      notes: 'Synthetic portfolio data. Not medical guidance.',
      prescriber: 'Dr. Demo',
      sourceKind: 'manual',
    };

    await api(`/patients/${patientId}/medications`, {
      method: 'POST',
      token: owner.token,
      body: {
        ...commonMedication,
        displayName: 'Amlodipine (Synthetic)',
        genericName: 'amlodipine',
        strengthValue: 5,
        strengthUnit: 'mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        medicineForm: 'tablet',
        route: 'by mouth',
        reason: 'Synthetic example only',
        originalInstructions: 'Synthetic label: take one tablet twice daily.',
        schedules: ['08:00', '20:00'].map((timeOfDay) => ({
          kind: 'exact',
          timeOfDay,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          startOn,
          endOn: '',
          timeZone: 'Asia/Manila',
        })),
      },
    });

    await api(`/patients/${patientId}/medications`, {
      method: 'POST',
      token: owner.token,
      body: {
        ...commonMedication,
        displayName: 'Calcium supplement (Synthetic)',
        genericName: '',
        strengthValue: null,
        strengthUnit: '',
        doseQuantity: 1,
        doseUnit: 'tablet',
        medicineForm: 'tablet',
        route: 'by mouth',
        reason: 'Synthetic example only',
        originalInstructions: 'Synthetic timetable: take one tablet after breakfast.',
        schedules: [{
          kind: 'meal',
          timeOfDay: '08:30',
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          mealName: 'breakfast',
          mealRelation: 'after',
          windowStart: '07:30',
          windowEnd: '09:30',
          startOn,
          endOn: '',
          timeZone: 'Asia/Manila',
        }],
      },
    });

    const invitation = await api<{ invitation: { id: string } }>(
      `/patients/${patientId}/invitations`,
      {
        method: 'POST',
        token: owner.token,
        body: { email: caregiver.account.email, canManageMedications: false },
      },
    );
    await api(`/invitations/${invitation.invitation.id}/accept`, {
      method: 'POST',
      token: caregiver.token,
    });

    for (const [daysAgo, recordSecondDose] of [[3, true], [2, false], [1, true]] as const) {
      const careDate = addDays(today, -daysAgo);
      const day = await api<{ timeline: Array<{ id: string }> }>(
        `/patients/${patientId}/today?date=${careDate}`,
        { token: owner.token },
      );
      const firstDose = day.timeline[0];
      if (firstDose) {
        await api(`/patients/${patientId}/doses/${firstDose.id}/events`, {
          method: 'POST',
          token: caregiver.token,
          body: { kind: 'taken', clientActionId: randomUUID() },
        });
      }
      const secondDose = day.timeline[1];
      if (recordSecondDose && secondDose) {
        await api(`/patients/${patientId}/doses/${secondDose.id}/events`, {
          method: 'POST',
          token: owner.token,
          body: {
            kind: daysAgo === 1 ? 'skipped' : 'taken',
            reason: daysAgo === 1 ? 'Synthetic history example.' : undefined,
            clientActionId: randomUUID(),
          },
        });
      }
    }

    process.stdout.write([
      'Synthetic Alaga data is ready.',
      `Owner: maya@example.test / ${demoPassword}`,
      `Caregiver: paolo@example.test / ${demoPassword}`,
      'Patient: Lola Rosa (Synthetic)',
    ].join('\n') + '\n');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await databasePool.end();
  }
}

void main().catch(async (error: unknown) => {
  console.error(error);
  await databasePool.end().catch(() => undefined);
  process.exitCode = 1;
});
