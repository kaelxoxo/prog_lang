import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { Pool, PoolClient } from 'pg';

import { serverConfig } from './config';
import { databasePool } from './database';
import { historyForRange, timelineForDate, timelineForRange, validatedLocalDate } from './doses';
import {
  queryGeminiAssistant,
  type AssistantQueryParams,
  type AssistantQueryResponse,
} from './gemini-assistant';
import { recognizeMedicationImage, type MedicationOcrDraft, type PhotoSourceKind } from './ocr';

const SESSION_LENGTH_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BODY_BYTES = 6 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AccountRow = {
  id: string;
  email: string;
  display_name: string;
};

type PatientRow = {
  id: string;
  display_name: string;
  role: 'owner' | 'caregiver';
  can_manage_medications: boolean;
  primary_care_manager_name?: string | null;
  created_at: Date;
};

type MedicationRow = {
  id: string;
  archived_at: Date | null;
  version_id: string;
  version_number: number;
  display_name: string;
  generic_name: string | null;
  brand_name: string | null;
  strength_value: string | null;
  strength_unit: string | null;
  dose_quantity: string;
  dose_unit: string;
  medicine_form: string | null;
  route: string | null;
  prescriber: string | null;
  reason: string | null;
  original_instructions: string | null;
  notes: string | null;
  source_kind: 'manual' | 'label_photo' | 'timetable_photo';
  confirmed_at: Date;
};

type ScheduleRow = {
  id: string;
  medication_version_id: string;
  kind: 'exact' | 'interval' | 'meal';
  time_of_day: string;
  interval_hours: number | null;
  weekdays: number[];
  meal_name: 'breakfast' | 'lunch' | 'dinner' | null;
  meal_relation: 'before' | 'after' | null;
  window_start: string | null;
  window_end: string | null;
  start_on: string;
  end_on: string | null;
  time_zone: 'Asia/Manila';
};

type CareCircleMemberRow = {
  account_id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'caregiver';
  can_manage_medications: boolean;
  joined_at: Date;
};

type PatientInvitationRow = {
  id: string;
  invited_email: string;
  can_manage_medications: boolean;
  status: 'pending';
  created_at: Date;
  expires_at: Date;
};

type IncomingInvitationRow = {
  id: string;
  patient_id: string;
  patient_name: string;
  invited_by_name: string;
  can_manage_medications: boolean;
  created_at: Date;
  expires_at: Date;
};

type AuthBody = {
  email?: unknown;
  displayName?: unknown;
  password?: unknown;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function newSession() {
  const token = randomBytes(32).toString('base64url');

  return {
    token,
    hash: tokenHash(token),
    expiresAt: new Date(Date.now() + SESSION_LENGTH_MS),
  };
}

function responseHeaders() {
  return {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': serverConfig.corsOrigin,
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, responseHeaders());
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage, maximumBytes = MAX_BODY_BYTES) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;

    if (size > maximumBytes) {
      throw new HttpError(413, 'The request body is too large.');
    }

    chunks.push(buffer);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'The request body must be valid JSON.');
  }
}

function textField(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${label} is required.`);
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maxLength) {
    throw new HttpError(400, `${label} must contain 1 to ${maxLength} characters.`);
  }

  return normalized;
}

function optionalTextField(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, `${label} must be text.`);
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw new HttpError(400, `${label} must contain at most ${maxLength} characters.`);
  }

  return normalized;
}

function booleanField(value: unknown, label: string, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${label} must be true or false.`);
  }

  return value;
}

function positiveNumber(value: unknown, label: string) {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) {
    throw new HttpError(400, `${label} must be a positive number.`);
  }

  return parsed;
}

function optionalPositiveNumber(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return positiveNumber(value, label);
}

function timeField(value: unknown, label: string) {
  const normalized = textField(value, label, 5);

  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    throw new HttpError(400, `${label} must use 24-hour HH:mm time.`);
  }

  return normalized;
}

function dateField(value: unknown, label: string) {
  const normalized = textField(value, label, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpError(400, `${label} must use YYYY-MM-DD.`);
  }

  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new HttpError(400, `${label} must be a real calendar date.`);
  }

  return normalized;
}

function scheduleList(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 21) {
    throw new HttpError(400, 'Add between 1 and 21 schedule times.');
  }

  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new HttpError(400, `Schedule ${index + 1} is invalid.`);
    }

    const schedule = candidate as Record<string, unknown>;
    const kind = schedule.kind;

    if (kind !== 'exact' && kind !== 'interval' && kind !== 'meal') {
      throw new HttpError(400, `Schedule ${index + 1} has an invalid type.`);
    }

    if (!Array.isArray(schedule.weekdays)) {
      throw new HttpError(400, `Schedule ${index + 1} needs at least one weekday.`);
    }

    const weekdays = [...new Set(schedule.weekdays.map(Number))].sort((left, right) => left - right);

    if (
      weekdays.length < 1
      || weekdays.length > 7
      || weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    ) {
      throw new HttpError(400, `Schedule ${index + 1} has invalid weekdays.`);
    }

    const startOn = dateField(schedule.startOn, `Schedule ${index + 1} start date`);
    const endOn = schedule.endOn
      ? dateField(schedule.endOn, `Schedule ${index + 1} end date`)
      : '';

    if (endOn && endOn < startOn) {
      throw new HttpError(400, `Schedule ${index + 1} end date cannot be before its start date.`);
    }

    const base = {
      kind,
      timeOfDay: timeField(schedule.timeOfDay, `Schedule ${index + 1} time`),
      weekdays,
      startOn,
      endOn,
      timeZone: 'Asia/Manila',
    };

    if (kind === 'interval') {
      const intervalHours = positiveNumber(
        schedule.intervalHours,
        `Schedule ${index + 1} interval`,
      );

      if (!Number.isInteger(intervalHours) || intervalHours > 24) {
        throw new HttpError(400, `Schedule ${index + 1} interval must be 1 to 24 hours.`);
      }

      return { ...base, intervalHours };
    }

    if (kind === 'meal') {
      if (!['breakfast', 'lunch', 'dinner'].includes(String(schedule.mealName))) {
        throw new HttpError(400, `Schedule ${index + 1} needs a valid meal.`);
      }

      if (schedule.mealRelation !== 'before' && schedule.mealRelation !== 'after') {
        throw new HttpError(400, `Schedule ${index + 1} needs before or after meal.`);
      }

      const windowStart = timeField(schedule.windowStart, `Schedule ${index + 1} window start`);
      const windowEnd = timeField(schedule.windowEnd, `Schedule ${index + 1} window end`);

      if (windowEnd <= windowStart) {
        throw new HttpError(400, `Schedule ${index + 1} window end must be after its start.`);
      }

      return {
        ...base,
        mealName: schedule.mealName,
        mealRelation: schedule.mealRelation,
        windowStart,
        windowEnd,
      };
    }

    return base;
  });
}

function medicationInput(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Medication details are required.');
  }

  const values = body as Record<string, unknown>;
  const strengthValue = optionalPositiveNumber(values.strengthValue, 'Strength');
  const strengthUnit = optionalTextField(values.strengthUnit, 'Strength unit', 40);

  if ((strengthValue === null) !== (strengthUnit === '')) {
    throw new HttpError(400, 'Strength value and unit must be provided together.');
  }

  const sourceKind = values.sourceKind ?? 'manual';

  if (sourceKind !== 'manual' && sourceKind !== 'label_photo' && sourceKind !== 'timetable_photo') {
    throw new HttpError(400, 'Medication source is invalid.');
  }

  return {
    displayName: textField(values.displayName, 'Medicine name', 120),
    genericName: optionalTextField(values.genericName, 'Generic name', 120),
    brandName: optionalTextField(values.brandName, 'Brand name', 120),
    strengthValue,
    strengthUnit,
    doseQuantity: positiveNumber(values.doseQuantity, 'Dose quantity'),
    doseUnit: textField(values.doseUnit, 'Dose unit', 40),
    medicineForm: optionalTextField(values.medicineForm, 'Medicine form', 60),
    route: optionalTextField(values.route, 'Route', 60),
    prescriber: optionalTextField(values.prescriber, 'Prescriber', 120),
    reason: optionalTextField(values.reason, 'Reason', 240),
    originalInstructions: optionalTextField(values.originalInstructions, 'Original instructions', 1000),
    notes: optionalTextField(values.notes, 'Notes', 1000),
    sourceKind,
    schedules: scheduleList(values.schedules),
  };
}

function credentialsFrom(body: unknown, includeDisplayName: boolean) {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Credentials are required.');
  }

  const values = body as AuthBody;
  const email = textField(values.email, 'Email', 320).toLowerCase();
  const password = textField(values.password, 'Password', 128);

  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }

  if (password.length < 12) {
    throw new HttpError(400, 'Password must contain at least 12 characters.');
  }

  return {
    email,
    password,
    displayName: includeDisplayName
      ? textField(values.displayName, 'Display name', 80)
      : undefined,
  };
}

function bearerToken(request: IncomingMessage) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError(401, 'A valid session is required.');
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    throw new HttpError(401, 'A valid session is required.');
  }

  return token;
}

async function resolveAccount(client: PoolClient, request: IncomingMessage) {
  const hash = tokenHash(bearerToken(request));
  await client.query("SELECT set_config('alaga.session_token_hash', $1, true)", [hash]);
  const result = await client.query<AccountRow>('SELECT * FROM app_api.resolve_session($1)', [hash]);
  const account = result.rows[0];

  if (!account) {
    throw new HttpError(401, 'Your session has expired. Sign in again.');
  }

  return { account, hash };
}

async function inAuthenticatedTransaction<T>(
  pool: Pool,
  request: IncomingMessage,
  operation: (client: PoolClient, account: AccountRow, hash: string) => Promise<T>,
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { account, hash } = await resolveAccount(client, request);
    const result = await operation(client, account, hash);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function accountJson(account: AccountRow) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.display_name,
  };
}

function patientJson(patient: PatientRow, account?: AccountRow) {
  const primaryCareManagerName = patient.primary_care_manager_name
    ?? (patient.role === 'owner' && account ? account.display_name : undefined);
  return {
    id: patient.id,
    displayName: patient.display_name,
    role: patient.role,
    canManageMedications: patient.role === 'owner' || patient.can_manage_medications,
    relationshipLabel: patient.role === 'owner' ? 'Primary care manager' : 'Care circle member',
    primaryCareManagerName,
    todayMessage: 'Review confirmed medicines and keep their schedules up to date.',
    createdAt: patient.created_at,
  };
}

function careCircleMemberJson(member: CareCircleMemberRow) {
  return {
    accountId: member.account_id,
    email: member.email,
    displayName: member.display_name,
    role: member.role,
    canManageMedications: member.role === 'owner' || member.can_manage_medications,
    joinedAt: member.joined_at,
  };
}

function patientInvitationJson(invitation: PatientInvitationRow) {
  return {
    id: invitation.id,
    email: invitation.invited_email,
    canManageMedications: invitation.can_manage_medications,
    status: invitation.status,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
  };
}

function incomingInvitationJson(invitation: IncomingInvitationRow) {
  return {
    id: invitation.id,
    patientId: invitation.patient_id,
    patientName: invitation.patient_name,
    invitedByName: invitation.invited_by_name,
    canManageMedications: invitation.can_manage_medications,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
  };
}

function scheduleJson(schedule: ScheduleRow) {
  return {
    id: schedule.id,
    kind: schedule.kind,
    timeOfDay: schedule.time_of_day.slice(0, 5),
    intervalHours: schedule.interval_hours,
    weekdays: schedule.weekdays,
    mealName: schedule.meal_name,
    mealRelation: schedule.meal_relation,
    windowStart: schedule.window_start?.slice(0, 5) ?? null,
    windowEnd: schedule.window_end?.slice(0, 5) ?? null,
    startOn: schedule.start_on,
    endOn: schedule.end_on,
    timeZone: schedule.time_zone,
  };
}

async function medicationsFor(client: PoolClient, patientId: string, archived = false) {
  const membership = await client.query<{ allowed: boolean }>(
    'SELECT alaga_private.is_active_patient_member($1) AS allowed',
    [patientId],
  );

  if (!membership.rows[0]?.allowed) {
    throw new HttpError(403, 'Active patient membership is required.');
  }

  const medicationResult = await client.query<MedicationRow>(
    `SELECT
       medication.id,
       medication.archived_at,
       version.id AS version_id,
       version.version_number,
       version.display_name,
       version.generic_name,
       version.brand_name,
       version.strength_value::text,
       version.strength_unit,
       version.dose_quantity::text,
       version.dose_unit,
       version.medicine_form,
       version.route,
       version.prescriber,
       version.reason,
       version.original_instructions,
       version.notes,
       version.source_kind,
       version.confirmed_at
     FROM public.medications AS medication
     JOIN LATERAL (
       SELECT *
       FROM public.medication_versions
       WHERE medication_id = medication.id
       ORDER BY version_number DESC
       LIMIT 1
     ) AS version ON true
      WHERE medication.patient_id = $1
        AND ($2::boolean = (medication.archived_at IS NOT NULL))
      ORDER BY lower(version.display_name), medication.id`,
    [patientId, archived],
  );

  const versionIds = medicationResult.rows.map((medication) => medication.version_id);
  const scheduleResult = versionIds.length
    ? await client.query<ScheduleRow>(
      `SELECT
         id,
         medication_version_id,
         schedule_kind AS kind,
         time_of_day::text,
         interval_hours,
         weekdays,
         meal_name,
         meal_relation,
         window_start::text,
         window_end::text,
         start_on::text,
         end_on::text,
         time_zone
       FROM public.medication_schedules
       WHERE medication_version_id = ANY($1::uuid[])
       ORDER BY start_on, time_of_day, id`,
      [versionIds],
    )
    : { rows: [] as ScheduleRow[] };

  return medicationResult.rows.map((medication) => ({
    id: medication.id,
    archivedAt: medication.archived_at,
    versionId: medication.version_id,
    versionNumber: medication.version_number,
    displayName: medication.display_name,
    genericName: medication.generic_name,
    brandName: medication.brand_name,
    strengthValue: medication.strength_value === null ? null : Number(medication.strength_value),
    strengthUnit: medication.strength_unit,
    doseQuantity: Number(medication.dose_quantity),
    doseUnit: medication.dose_unit,
    medicineForm: medication.medicine_form,
    route: medication.route,
    prescriber: medication.prescriber,
    reason: medication.reason,
    originalInstructions: medication.original_instructions,
    notes: medication.notes,
    sourceKind: medication.source_kind,
    status: 'confirmed' as const,
    confirmedAt: medication.confirmed_at,
    schedules: scheduleResult.rows
      .filter((schedule) => schedule.medication_version_id === medication.version_id)
      .map(scheduleJson),
  }));
}

function databaseError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as { code?: string; message?: string };

  if (candidate.code === '23505') {
    return new HttpError(409, candidate.message || 'That record already exists.');
  }

  if (candidate.code === '22001' || candidate.code === '22023') {
    return new HttpError(400, candidate.message || 'Invalid input.');
  }

  if (candidate.code === '28000') {
    return new HttpError(401, candidate.message || 'Authentication failed.');
  }

  if (candidate.code === '23514') {
    return new HttpError(409, candidate.message || 'That change is not allowed.');
  }

  if (candidate.code === '42501') {
    return new HttpError(403, candidate.message || 'You do not have permission for that change.');
  }

  if (candidate.code === 'P0002') {
    return new HttpError(404, candidate.message || 'That record was not found.');
  }

  return null;
}

export function createAppServer(
  pool: Pool = databasePool,
  dependencies: {
    recognizeImage?: (
      image: Buffer,
      sourceKind: PhotoSourceKind,
    ) => Promise<MedicationOcrDraft | { drafts: MedicationOcrDraft[] } | MedicationOcrDraft[]>;
    queryAssistant?: (
      params: AssistantQueryParams,
    ) => Promise<AssistantQueryResponse>;
  } = {},
) {
  const recognizeImage = dependencies.recognizeImage || recognizeMedicationImage;
  const queryAssistant = dependencies.queryAssistant || queryGeminiAssistant;
  return createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, responseHeaders());
      response.end();
      return;
    }

    const url = new URL(request.url || '/', 'http://localhost');

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        await pool.query('SELECT 1');
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/auth/register') {
        const credentials = credentialsFrom(await readJson(request), true);
        const session = newSession();
        const result = await pool.query<AccountRow>(
          'SELECT * FROM app_api.register_account($1, $2, $3, $4, $5)',
          [
            credentials.email,
            credentials.displayName,
            credentials.password,
            session.hash,
            session.expiresAt,
          ],
        );

        sendJson(response, 201, { token: session.token, account: accountJson(result.rows[0]) });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/auth/login') {
        const credentials = credentialsFrom(await readJson(request), false);
        const session = newSession();
        const result = await pool.query<AccountRow>(
          'SELECT * FROM app_api.log_in($1, $2, $3, $4)',
          [credentials.email, credentials.password, session.hash, session.expiresAt],
        );

        sendJson(response, 200, { token: session.token, account: accountJson(result.rows[0]) });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/auth/session') {
        const result = await inAuthenticatedTransaction(pool, request, async (_client, account) =>
          accountJson(account),
        );
        sendJson(response, 200, { account: result });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/auth/logout') {
        await inAuthenticatedTransaction(pool, request, async (client, _account, hash) => {
          await client.query('SELECT app_api.log_out($1)', [hash]);
        });
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/patients') {
        const patients = await inAuthenticatedTransaction(pool, request, async (client, account) => {
          const result = await client.query<PatientRow>(
            `SELECT patient.id, patient.display_name, membership.role,
                    membership.can_manage_medications, patient.created_at,
                    app_api.patient_primary_care_manager(patient.id) AS primary_care_manager_name
             FROM public.patients AS patient
             JOIN public.patient_members AS membership
               ON membership.patient_id = patient.id
              AND membership.account_id = $1
              AND membership.revoked_at IS NULL
             WHERE patient.archived_at IS NULL
             ORDER BY patient.created_at, patient.id`,
            [account.id],
          );
          return result.rows.map((row) => patientJson(row, account));
        });
        sendJson(response, 200, { patients });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/patients') {
        const body = await readJson(request);
        const displayName = textField(
          body && typeof body === 'object' ? (body as { displayName?: unknown }).displayName : null,
          'Patient name',
          80,
        );
        const patient = await inAuthenticatedTransaction(pool, request, async (client, account) => {
          const result = await client.query<PatientRow>(
            'SELECT * FROM app_api.create_patient_profile($1)',
            [displayName],
          );
          return patientJson(result.rows[0], account);
        });
        sendJson(response, 201, { patient });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/invitations') {
        const invitations = await inAuthenticatedTransaction(pool, request, async (client) => {
          const result = await client.query<IncomingInvitationRow>(
            'SELECT * FROM app_api.my_pending_patient_invitations()',
          );
          return result.rows.map(incomingInvitationJson);
        });
        sendJson(response, 200, { invitations });
        return;
      }

      const invitationResponsePath = url.pathname.match(
        /^\/invitations\/([0-9a-f-]{36})\/(accept|decline)$/i,
      );

      if (request.method === 'POST' && invitationResponsePath) {
        const [, invitationId, action] = invitationResponsePath;
        const result = await inAuthenticatedTransaction(pool, request, async (client) => {
          const invitation = await client.query<{
            invitation_id: string;
            patient_id: string;
            status: 'accepted' | 'declined';
          }>(
            'SELECT * FROM app_api.respond_to_patient_invitation($1, $2)',
            [invitationId, action === 'accept' ? 'accepted' : 'declined'],
          );
          return invitation.rows[0];
        });
        sendJson(response, 200, {
          invitationId: result.invitation_id,
          patientId: result.patient_id,
          status: result.status,
        });
        return;
      }

      const careCirclePath = url.pathname.match(
        /^\/patients\/([0-9a-f-]{36})\/care-circle$/i,
      );

      if (request.method === 'GET' && careCirclePath) {
        const patientId = careCirclePath[1];
        const careCircle = await inAuthenticatedTransaction(pool, request, async (client) => {
          const members = await client.query<CareCircleMemberRow>(
            'SELECT * FROM app_api.patient_care_circle($1)',
            [patientId],
          );
          const invitations = await client.query<PatientInvitationRow>(
            'SELECT * FROM app_api.patient_pending_invitations($1)',
            [patientId],
          );
          return {
            members: members.rows.map(careCircleMemberJson),
            invitations: invitations.rows.map(patientInvitationJson),
          };
        });
        sendJson(response, 200, careCircle);
        return;
      }

      const patientInvitationsPath = url.pathname.match(
        /^\/patients\/([0-9a-f-]{36})\/invitations$/i,
      );

      if (request.method === 'POST' && patientInvitationsPath) {
        const body = await readJson(request);
        const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const email = textField(input.email, 'Caregiver email', 320).toLowerCase();
        if (!EMAIL_PATTERN.test(email)) {
          throw new HttpError(400, 'Enter a valid caregiver email address.');
        }
        const canManageMedications = booleanField(
          input.canManageMedications,
          'Medicine manager permission',
        );
        const invitation = await inAuthenticatedTransaction(pool, request, async (client) => {
          const result = await client.query<PatientInvitationRow>(
            'SELECT * FROM app_api.create_patient_invitation($1, $2, $3)',
            [patientInvitationsPath[1], email, canManageMedications],
          );
          return patientInvitationJson(result.rows[0]);
        });
        sendJson(response, 201, { invitation });
        return;
      }

      const cancelInvitationPath = url.pathname.match(
        /^\/patients\/([0-9a-f-]{36})\/invitations\/([0-9a-f-]{36})\/cancel$/i,
      );

      if (request.method === 'POST' && cancelInvitationPath) {
        const [, patientId, invitationId] = cancelInvitationPath;
        await inAuthenticatedTransaction(pool, request, async (client) => {
          await client.query('SELECT app_api.cancel_patient_invitation($1, $2)', [patientId, invitationId]);
        });
        sendJson(response, 200, { ok: true });
        return;
      }

      const revokeMemberPath = url.pathname.match(
        /^\/patients\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})\/revoke$/i,
      );

      if (request.method === 'POST' && revokeMemberPath) {
        const [, patientId, accountId] = revokeMemberPath;
        await inAuthenticatedTransaction(pool, request, async (client) => {
          await client.query('SELECT app_api.revoke_patient_membership($1, $2)', [patientId, accountId]);
        });
        sendJson(response, 200, { ok: true });
        return;
      }

      const todayPath = url.pathname.match(/^\/patients\/([0-9a-f-]{36})\/today$/i);

      const historyPath = url.pathname.match(/^\/patients\/([0-9a-f-]{36})\/history$/i);

      if (request.method === 'GET' && historyPath) {
        let through: string;
        try {
          through = validatedLocalDate(url.searchParams.get('through'), 'Last date');
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : 'Last date is invalid.');
        }
        const days = Number(url.searchParams.get('days') || 7);
        if (!Number.isInteger(days) || days < 1 || days > 7) {
          throw new HttpError(400, 'History range must contain 1 to 7 days.');
        }
        const history = await inAuthenticatedTransaction(pool, request, (client) =>
          historyForRange(client, historyPath[1], through, days),
        );
        sendJson(response, 200, { through, days, history });
        return;
      }

      if (request.method === 'GET' && todayPath) {
        let localDate: string;
        try {
          localDate = validatedLocalDate(url.searchParams.get('date'));
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : 'Date is invalid.');
        }
        const timeline = await inAuthenticatedTransaction(pool, request, (client) =>
          timelineForDate(client, todayPath[1], localDate),
        );
        sendJson(response, 200, { date: localDate, timeline });
        return;
      }

      const remindersPath = url.pathname.match(/^\/patients\/([0-9a-f-]{36})\/reminders$/i);

      if (request.method === 'GET' && remindersPath) {
        let firstDate: string;
        try {
          firstDate = validatedLocalDate(url.searchParams.get('from'), 'First date');
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : 'First date is invalid.');
        }
        const days = Number(url.searchParams.get('days') || 7);
        if (!Number.isInteger(days) || days < 1 || days > 7) {
          throw new HttpError(400, 'Reminder range must contain 1 to 7 days.');
        }
        const timeline = await inAuthenticatedTransaction(pool, request, (client) =>
          timelineForRange(client, remindersPath[1], firstDate, days),
        );
        sendJson(response, 200, { from: firstDate, days, timeline });
        return;
      }

      const doseEventPath = url.pathname.match(
        /^\/patients\/([0-9a-f-]{36})\/doses\/([0-9a-f-]{36})\/events$/i,
      );

      if (request.method === 'POST' && doseEventPath) {
        const [, patientId, occurrenceId] = doseEventPath;
        const body = await readJson(request);
        const input = body && typeof body === 'object'
          ? body as Record<string, unknown>
          : {};
        const kind = input.kind;
        if (kind !== 'taken' && kind !== 'skipped' && kind !== 'snoozed') {
          throw new HttpError(400, 'Dose action must be taken, skipped, or snoozed.');
        }
        const clientActionId = input.clientActionId;
        if (typeof clientActionId !== 'string' || !UUID_PATTERN.test(clientActionId)) {
          throw new HttpError(400, 'Client action ID must be a UUID.');
        }
        const snoozeMinutes = input.snoozeMinutes === undefined ? null : Number(input.snoozeMinutes);
        if (kind === 'snoozed' && ![15, 30, 60].includes(snoozeMinutes || 0)) {
          throw new HttpError(400, 'Snooze must be 15, 30, or 60 minutes.');
        }
        if (kind !== 'snoozed' && snoozeMinutes !== null) {
          throw new HttpError(400, 'Only a snoozed dose can include snooze minutes.');
        }
        const reason = optionalTextField(input.reason, 'Reason', 240) || null;
        const correctsEventId = input.correctsEventId ?? null;
        if (correctsEventId !== null && (typeof correctsEventId !== 'string' || !UUID_PATTERN.test(correctsEventId))) {
          throw new HttpError(400, 'Corrected event ID must be a UUID.');
        }
        const event = await inAuthenticatedTransaction(pool, request, async (client) => {
          const result = await client.query<{
            event_id: string;
            event_kind: 'taken' | 'skipped' | 'snoozed';
            recorded_at: Date;
            snoozed_until: Date | null;
          }>(
            'SELECT * FROM app_api.record_dose_event($1, $2, $3, $4, $5, $6, $7)',
            [patientId, occurrenceId, kind, snoozeMinutes, reason, clientActionId, correctsEventId],
          );
          return {
            id: result.rows[0].event_id,
            kind: result.rows[0].event_kind,
            recordedAt: result.rows[0].recorded_at,
            snoozedUntil: result.rows[0].snoozed_until,
          };
        });
        sendJson(response, 201, { event });
        return;
      }

      const medicationsPath = url.pathname.match(/^\/patients\/([0-9a-f-]{36})\/medications$/i);

      const ocrPath = url.pathname.match(/^\/patients\/([0-9a-f-]{36})\/imports\/ocr$/i);

      if (request.method === 'POST' && ocrPath) {
        await inAuthenticatedTransaction(pool, request, async (client) => {
          const permission = await client.query<{ allowed: boolean }>(
            'SELECT alaga_private.can_manage_patient_medications($1) AS allowed',
            [ocrPath[1]],
          );
          if (!permission.rows[0]?.allowed) {
            throw new HttpError(403, 'Medicine-manager permission is required for photo import.');
          }
        });

        const body = await readJson(request, MAX_IMAGE_BODY_BYTES);
        const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const sourceKind = input.sourceKind;
        if (sourceKind !== 'label_photo' && sourceKind !== 'timetable_photo') {
          throw new HttpError(400, 'Photo source must be a medicine label or printed timetable.');
        }
        if (input.mimeType !== 'image/jpeg' && input.mimeType !== 'image/png') {
          throw new HttpError(400, 'Choose a JPEG or PNG image.');
        }
        if (typeof input.imageBase64 !== 'string' || !input.imageBase64.length) {
          throw new HttpError(400, 'The selected image is empty.');
        }
        const image = Buffer.from(input.imageBase64, 'base64');
        if (!image.length || image.length > MAX_IMAGE_BYTES) {
          throw new HttpError(413, 'Choose an image smaller than 4 MB.');
        }
        const isJpeg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
        const isPng = image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        if ((input.mimeType === 'image/jpeg' && !isJpeg) || (input.mimeType === 'image/png' && !isPng)) {
          throw new HttpError(400, 'The image contents do not match its file type.');
        }

        const ocrResult = await recognizeImage(image, sourceKind as PhotoSourceKind);
        const drafts = (ocrResult && typeof ocrResult === 'object' && 'drafts' in ocrResult && Array.isArray((ocrResult as { drafts: unknown }).drafts))
          ? (ocrResult as { drafts: unknown[] }).drafts
          : Array.isArray(ocrResult)
            ? ocrResult
            : [ocrResult];
        const draft = drafts[0] || ocrResult;

        sendJson(response, 200, { draft, drafts });
        return;
      }

      if (request.method === 'GET' && medicationsPath) {
        const patientId = medicationsPath[1];
        const status = url.searchParams.get('status') || 'active';
        if (status !== 'active' && status !== 'archived') {
          throw new HttpError(400, 'Medicine status must be active or archived.');
        }
        const medications = await inAuthenticatedTransaction(pool, request, (client) =>
          medicationsFor(client, patientId, status === 'archived'),
        );
        sendJson(response, 200, { medications });
        return;
      }

      if (request.method === 'POST' && medicationsPath) {
        const patientId = medicationsPath[1];
        const input = medicationInput(await readJson(request));
        const saved = await inAuthenticatedTransaction(pool, request, async (client) => {
          const result = await client.query<{ medication_id: string; version_id: string }>(
            `SELECT * FROM app_api.save_confirmed_medication(
              $1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
            )`,
            [
              patientId,
              input.displayName,
              input.genericName,
              input.brandName,
              input.strengthValue,
              input.strengthUnit,
              input.doseQuantity,
              input.doseUnit,
              input.medicineForm,
              input.route,
              input.prescriber,
              input.reason,
              input.originalInstructions,
              input.notes,
              input.sourceKind,
              JSON.stringify(input.schedules),
            ],
          );
          return result.rows[0];
        });
        sendJson(response, 201, { medicationId: saved.medication_id, versionId: saved.version_id });
        return;
      }

      const revisionPath = url.pathname.match(
        /^\/patients\/([0-9a-f-]{36})\/medications\/([0-9a-f-]{36})\/revisions$/i,
      );

      if (request.method === 'POST' && revisionPath) {
        const [, patientId, medicationId] = revisionPath;
        const input = medicationInput(await readJson(request));
        const saved = await inAuthenticatedTransaction(pool, request, async (client) => {
          const result = await client.query<{ medication_id: string; version_id: string }>(
            `SELECT * FROM app_api.save_confirmed_medication(
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
            )`,
            [
              patientId,
              medicationId,
              input.displayName,
              input.genericName,
              input.brandName,
              input.strengthValue,
              input.strengthUnit,
              input.doseQuantity,
              input.doseUnit,
              input.medicineForm,
              input.route,
              input.prescriber,
              input.reason,
              input.originalInstructions,
              input.notes,
              input.sourceKind,
              JSON.stringify(input.schedules),
            ],
          );
          return result.rows[0];
        });
        sendJson(response, 200, { medicationId: saved.medication_id, versionId: saved.version_id });
        return;
      }

      const archivePath = url.pathname.match(
        /^\/patients\/([0-9a-f-]{36})\/medications\/([0-9a-f-]{36})\/archive$/i,
      );

      if (request.method === 'POST' && archivePath) {
        const [, patientId, medicationId] = archivePath;
        await inAuthenticatedTransaction(pool, request, async (client) => {
          await client.query('SELECT app_api.archive_medication($1, $2)', [patientId, medicationId]);
        });
        sendJson(response, 200, { ok: true });
        return;
      }

      const restorePath = url.pathname.match(
        /^\/patients\/([0-9a-f-]{36})\/medications\/([0-9a-f-]{36})\/restore$/i,
      );

      if (request.method === 'POST' && restorePath) {
        const [, patientId, medicationId] = restorePath;
        await inAuthenticatedTransaction(pool, request, async (client) => {
          await client.query('SELECT app_api.restore_medication($1, $2)', [patientId, medicationId]);
        });
        sendJson(response, 200, { ok: true });
        return;
      }

      const assistantQueryPath = url.pathname.match(
        /^\/patients\/([0-9a-f-]{36})\/assistant\/query$/i,
      );
      const isApiAssistantQuery = url.pathname === '/api/assistant/query';

      if (request.method === 'POST' && (assistantQueryPath || isApiAssistantQuery)) {
        const body = await readJson(request);
        const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
        const queryText = textField(input.query, 'Assistant query', 500);
        const rawLocale = input.locale;
        const locale = rawLocale === 'fil' ? 'fil' : 'en';
        const currentLocalTime = typeof input.currentLocalTime === 'string' ? input.currentLocalTime : undefined;
        let todayDate = typeof input.todayDate === 'string' && input.todayDate ? validatedLocalDate(input.todayDate) : undefined;

        let targetPatientId = assistantQueryPath
          ? assistantQueryPath[1]
          : (typeof input.patientId === 'string' && input.patientId ? input.patientId : null);

        const responsePayload = await inAuthenticatedTransaction(pool, request, async (client, account) => {
          if (!targetPatientId) {
            const queryParamPatientId = url.searchParams.get('patientId');
            if (queryParamPatientId && UUID_PATTERN.test(queryParamPatientId)) {
              targetPatientId = queryParamPatientId;
            } else {
              const patientList = await client.query<{ id: string }>(
                `SELECT patient_id AS id
                 FROM public.patient_members
                 WHERE account_id = $1 AND revoked_at IS NULL
                 LIMIT 2`,
                [account.id],
              );
              if (patientList.rows.length === 1) {
                targetPatientId = patientList.rows[0].id;
              } else {
                throw new HttpError(400, 'Patient ID is required.');
              }
            }
          }

          if (!UUID_PATTERN.test(targetPatientId)) {
            throw new HttpError(400, 'Patient ID is invalid.');
          }

          const patientResult = await client.query<PatientRow>(
            `SELECT patient.id, patient.display_name, membership.role,
                    membership.can_manage_medications, patient.created_at,
                    app_api.patient_primary_care_manager(patient.id) AS primary_care_manager_name
             FROM public.patients AS patient
             JOIN public.patient_members AS membership
               ON membership.patient_id = patient.id
              AND membership.account_id = $1
              AND membership.revoked_at IS NULL
             WHERE patient.id = $2
               AND patient.archived_at IS NULL`,
            [account.id, targetPatientId],
          );

          const patient = patientResult.rows[0];
          if (!patient) {
            throw new HttpError(404, 'Patient was not found or access is denied.');
          }

          if (!todayDate) {
            const manilaNow = new Date();
            const parts = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Manila',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).formatToParts(manilaNow);
            const dateObj = Object.fromEntries(parts.map((p) => [p.type, p.value]));
            todayDate = `${dateObj.year}-${dateObj.month}-${dateObj.day}`;
          }

          const medications = await medicationsFor(client, targetPatientId, false);
          const timeline = await timelineForDate(client, targetPatientId, todayDate);

          return queryAssistant({
            query: queryText,
            locale,
            currentLocalTime,
            todayDate,
            patient: {
              id: patient.id,
              displayName: patient.display_name,
              role: patient.role,
              canManageMedications: patient.role === 'owner' || patient.can_manage_medications,
              primaryCareManagerName: patient.primary_care_manager_name || (patient.role === 'owner' ? account.display_name : undefined),
            },
            caregiver: {
              id: account.id,
              displayName: account.display_name,
              email: account.email,
            },
            medications,
            timeline,
          });
        });

        sendJson(response, 200, responsePayload);
        return;
      }

      throw new HttpError(404, 'Endpoint not found.');
    } catch (error) {
      const handledError = error instanceof HttpError ? error : databaseError(error);

      if (handledError) {
        sendJson(response, handledError.status, { error: handledError.message });
        return;
      }

      console.error(error);
      sendJson(response, 500, { error: 'Alaga could not complete that request. Try again.' });
    }
  });
}
