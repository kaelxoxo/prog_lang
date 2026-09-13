import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createAppServer } from '../src/app';
import { setupConfig } from '../src/config';
import { databasePool } from '../src/database';
import {
  buildAssistantContext,
  buildSystemInstruction,
  checkMedicalSafetyInvariants,
  findActionableDose,
  queryGeminiAssistant,
  type AssistantQueryParams,
} from '../src/gemini-assistant';
import { evaluateLocalQuery } from '../../src/features/assistant/rulesEngine';
import type { LocalEvaluationContext } from '../../src/features/assistant/types';

const { Client } = pg;

let assistantInvocations = 0;
const server = createAppServer(databasePool, {
  queryAssistant: async (params) => {
    assistantInvocations += 1;
    // Default mock response in HTTP tests to verify route wiring
    return {
      answer: `Mocked response for ${params.query}`,
      source: 'gemini',
      model: 'gemini-2.5-flash',
      actionableDose: params.timeline.length > 0 ? {
        occurrenceId: params.timeline[0].id,
        medicationName: params.timeline[0].medicationName,
        doseQuantity: params.timeline[0].doseQuantity,
        doseUnit: params.timeline[0].doseUnit,
        strengthValue: params.timeline[0].strengthValue,
        strengthUnit: params.timeline[0].strengthUnit,
        scheduledFor: typeof params.timeline[0].scheduledFor === 'string' ? params.timeline[0].scheduledFor : params.timeline[0].scheduledFor.toISOString(),
        dueAt: typeof params.timeline[0].dueAt === 'string' ? params.timeline[0].dueAt : params.timeline[0].dueAt.toISOString(),
        status: params.timeline[0].status,
      } : null,
      suggestedQuickReplies: ["What's due next?", "Today's summary"],
    };
  },
});

let baseUrl = '';

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

// ============================================================================
// 1. TIER 1 INSTANT LOCAL RULES ENGINE TESTS
// ============================================================================

test('Tier 1 Local Rules: canonical "What\'s due next?" returns next scheduled dose with actionableDose', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: "What's due next?",
    locale: 'en',
    patient: { id: 'p1', displayName: 'Lola Rosa' },
    medications: [],
    timeline: [
      {
        id: 'occ-1',
        medicationName: 'Amlodipine',
        doseQuantity: 1,
        doseUnit: 'tablet',
        strengthValue: 5,
        strengthUnit: 'mg',
        scheduledFor: '2026-09-12T08:00:00+08:00',
        dueAt: '2026-09-12T08:00:00+08:00',
        status: 'not_recorded',
      },
    ],
    now,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.equal(result.source, 'local_rules');
  assert.match(result.answer || '', /Lola Rosa's next scheduled dose is Amlodipine/);
  assert.equal(result.actionableDose?.occurrenceId, 'occ-1');
  assert.equal(result.actionableDose?.medicationName, 'Amlodipine');
});

test('Tier 1 Local Rules: canonical "Ano ang susunod na gamot?" in Filipino returns Tagalog response', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: 'Ano ang susunod na gamot?',
    locale: 'fil',
    patient: { id: 'p1', displayName: 'Lola Rosa' },
    medications: [],
    timeline: [
      {
        id: 'occ-1',
        medicationName: 'Amlodipine',
        doseQuantity: 1,
        doseUnit: 'tablet',
        strengthValue: 5,
        strengthUnit: 'mg',
        scheduledFor: '2026-09-12T08:00:00+08:00',
        dueAt: '2026-09-12T08:00:00+08:00',
        status: 'not_recorded',
      },
    ],
    now,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.equal(result.source, 'local_rules');
  assert.match(result.answer || '', /Ang susunod na gamot ni Lola Rosa ay Amlodipine/);
  assert.equal(result.actionableDose?.occurrenceId, 'occ-1');
});

test('Tier 1 Local Rules: celebration state triggers when all doses for today are recorded', () => {
  const now = new Date('2026-09-12T21:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: "What's due next?",
    locale: 'en',
    patient: { id: 'p1', displayName: 'Lola Rosa' },
    medications: [],
    timeline: [
      {
        id: 'occ-1',
        medicationName: 'Amlodipine',
        scheduledFor: '2026-09-12T08:00:00+08:00',
        dueAt: '2026-09-12T08:00:00+08:00',
        status: 'taken',
        recordedByName: 'Maya Santos',
      },
    ],
    now,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.equal(result.expression, 'celebration');
  assert.match(result.answer || '', /All doses for today have already been recorded/);
  assert.equal(result.actionableDose, null);
});

test('Tier 1 Local Rules: "Today\'s summary" calculates counts correctly in EN and FIL', () => {
  const now = new Date('2026-09-12T12:00:00+08:00');
  const timeline: LocalEvaluationContext['timeline'] = [
    {
      id: 'occ-1',
      medicationName: 'Amlodipine',
      scheduledFor: '2026-09-12T08:00:00+08:00',
      dueAt: '2026-09-12T08:00:00+08:00',
      status: 'taken',
      recordedByName: 'Maya Santos',
    },
    {
      id: 'occ-2',
      medicationName: 'Calcium',
      scheduledFor: '2026-09-12T08:30:00+08:00',
      dueAt: '2026-09-12T08:30:00+08:00',
      status: 'skipped',
      reason: 'Patient felt full',
      recordedByName: 'Maya Santos',
    },
    {
      id: 'occ-3',
      medicationName: 'Amlodipine',
      scheduledFor: '2026-09-12T20:00:00+08:00',
      dueAt: '2026-09-12T20:00:00+08:00',
      status: 'not_recorded',
    },
  ];

  const enRes = evaluateLocalQuery({
    query: "Today's summary",
    locale: 'en',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline,
    now,
  });
  assert.equal(enRes.handled, true);
  assert.match(enRes.answer || '', /1 of 3 doses recorded as taken, 1 skipped, and 1 pending review/);

  const filRes = evaluateLocalQuery({
    query: 'Buod ng araw na ito',
    locale: 'fil',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline,
    now,
  });
  assert.equal(filRes.handled, true);
  assert.match(filRes.answer || '', /1 sa 3 na inumin ang naitalang nainom, 1 ang nilaktawan, at 1 ang naghihintay ng tala/);
});

test('Tier 1 Local Rules: Caregiver attribution check returns who recorded the dose and when', () => {
  const now = new Date('2026-09-12T12:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: 'Did someone record Amlodipine?',
    locale: 'en',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline: [
      {
        id: 'occ-1',
        medicationName: 'Amlodipine',
        scheduledFor: '2026-09-12T08:00:00+08:00',
        dueAt: '2026-09-12T08:00:00+08:00',
        status: 'taken',
        recordedByName: 'Paolo Santos',
        recordedAt: '2026-09-12T08:15:00+08:00',
      },
    ],
    now,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.match(result.answer || '', /recorded as taken by Paolo Santos/);

  const filContext: LocalEvaluationContext = {
    ...context,
    query: 'Sino ang nagtala ng Amlodipine?',
    locale: 'fil',
  };
  const filResult = evaluateLocalQuery(filContext);
  assert.equal(filResult.handled, true);
  assert.match(filResult.answer || '', /naitala na ang Amlodipine bilang nainom ni Paolo Santos/);
});

test('Tier 1 Local Rules: Prescription help directs user to Medicines tab', () => {
  const context: LocalEvaluationContext = {
    query: 'Help with prescription',
    locale: 'en',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline: [],
    now: new Date(),
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.match(result.answer || '', /Medicines tab/);

  const filResult = evaluateLocalQuery({ ...context, query: 'Tulong sa reseta', locale: 'fil' });
  assert.equal(filResult.handled, true);
  assert.match(filResult.answer || '', /Medicines tab/);
});

test('Tier 1 Local Rules: Medical safety invariant rejects dosage modification and directs to doctor', () => {
  const context: LocalEvaluationContext = {
    query: 'Can I increase Lola Rosa dose to two tablets?',
    locale: 'en',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline: [],
    now: new Date(),
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.match(result.answer || '', /please consult Lola Rosa's doctor or healthcare provider directly/);

  const filResult = evaluateLocalQuery({
    ...context,
    query: 'Pwede bang dagdagan ang dose ng gamot?',
    locale: 'fil',
  });
  assert.equal(filResult.handled, true);
  assert.match(filResult.answer || '', /sumangguni agad sa doktor o healthcare provider ni Lola Rosa/);
});

test('Tier 1 Local Rules: Conversational query returns handled: false for Tier 2 fallback', () => {
  const context: LocalEvaluationContext = {
    query: 'Does Lola Rosa like drinking warm water before her morning pills?',
    locale: 'en',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline: [],
    now: new Date(),
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, false);
});

// ============================================================================
// 2. TIER 2 GEMINI ASSISTANT ADAPTER TESTS
// ============================================================================

test('Gemini Assistant: safety invariants reject diagnosis and dosage change pre-check', () => {
  const decline1 = checkMedicalSafetyInvariants('Can I double the dose of Amlodipine?', 'Lola Rosa', 'en');
  assert.ok(decline1);
  assert.match(decline1, /consult Lola Rosa's doctor/);

  const decline2 = checkMedicalSafetyInvariants('She has chest pain and nausea, what is this?', 'Lola Rosa', 'en');
  assert.ok(decline2);
  assert.match(decline2, /cannot diagnose conditions/);

  const declineFil = checkMedicalSafetyInvariants('Masakit ang dibdib at nahihilo si Lola, ano ang sakit niya?', 'Lola Rosa', 'fil');
  assert.ok(declineFil);
  assert.match(declineFil, /sumangguni agad sa doktor/);
});

test('Gemini Assistant: context building serializes active meds, schedules, and history', () => {
  const params: AssistantQueryParams = {
    query: 'Hello Bantay',
    locale: 'en',
    patient: { id: 'p1', displayName: 'Lola Rosa' },
    caregiver: { id: 'c1', displayName: 'Maya Santos' },
    medications: [
      {
        id: 'm1',
        displayName: 'Amlodipine (Synthetic)',
        genericName: 'amlodipine',
        brandName: 'Norvasc',
        strengthValue: 5,
        strengthUnit: 'mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        route: 'by mouth',
        originalInstructions: 'Take 1 tablet daily',
        notes: null,
        schedules: [{ kind: 'exact', timeOfDay: '08:00', intervalHours: null, weekdays: [0, 1, 2, 3, 4, 5, 6], mealName: null, mealRelation: null }],
      },
    ],
    timeline: [
      {
        id: 'occ-1',
        medicationName: 'Amlodipine (Synthetic)',
        doseQuantity: 1,
        doseUnit: 'tablet',
        strengthValue: 5,
        strengthUnit: 'mg',
        scheduledFor: '2026-09-12T08:00:00+08:00',
        dueAt: '2026-09-12T08:00:00+08:00',
        status: 'taken',
        recordedByName: 'Paolo Santos',
        recordedAt: '2026-09-12T08:15:00+08:00',
        snoozedUntil: null,
        reason: null,
      },
    ],
  };

  const context = buildAssistantContext(params);
  assert.equal(context.patient.displayName, 'Lola Rosa');
  assert.equal(context.caregiver.displayName, 'Maya Santos');
  assert.equal(context.activeMedications.length, 1);
  assert.equal(context.activeMedications[0].displayName, 'Amlodipine (Synthetic)');
  assert.equal(context.todayTimeline.length, 1);
  assert.equal(context.todayTimeline[0].recordedByName, 'Paolo Santos');
});

test('Gemini Assistant: system prompt enforces invariants and companion tone', () => {
  const prompt = buildSystemInstruction('Maya Santos', 'Lola Rosa');
  assert.match(prompt, /Bantay/);
  assert.match(prompt, /Lola Rosa/);
  assert.match(prompt, /Maya Santos/);
  assert.match(prompt, /NO DIAGNOSIS OR CLINICAL ADVICE/);
  assert.match(prompt, /DECLINE PRESCRIPTION ALTERATIONS/);
  assert.match(prompt, /GROUNDED IN RECORDS ONLY/);
});

test('Gemini Assistant: missing API key returns reassuring fallback response', async () => {
  const params: AssistantQueryParams = {
    query: 'What time should I prepare lunch for Lola Rosa?',
    locale: 'en',
    patient: { id: 'p1', displayName: 'Lola Rosa' },
    caregiver: { id: 'c1', displayName: 'Maya Santos' },
    medications: [],
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);
  assert.equal(response.source, 'fallback');
  assert.equal(response.model, 'fallback');
  assert.match(response.answer, /trouble connecting to my AI care service/);
});

test('Gemini Assistant: simulated API failure returns fallback gracefully', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 });
  };

  const params: AssistantQueryParams = {
    query: 'Tell me about Lola Rosa medication schedule',
    locale: 'en',
    patient: { id: 'p1', displayName: 'Lola Rosa' },
    caregiver: { id: 'c1', displayName: 'Maya Santos' },
    medications: [],
    timeline: [],
    apiKey: 'mock-key',
    fetchFn: mockFetch,
  };

  const response = await queryGeminiAssistant(params);
  assert.equal(response.source, 'fallback');
  assert.match(response.answer, /trouble connecting to my AI care service/);
});

test('Gemini Assistant: valid API response parses candidates and attaches actionable dose', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: 'Lola Rosa has Amlodipine scheduled for tonight at 8:00 PM.' }],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const params: AssistantQueryParams = {
    query: 'What is scheduled for tonight?',
    locale: 'en',
    patient: { id: 'p1', displayName: 'Lola Rosa' },
    caregiver: { id: 'c1', displayName: 'Maya Santos' },
    medications: [],
    timeline: [
      {
        id: 'occ-evening',
        medicationName: 'Amlodipine',
        doseQuantity: 1,
        doseUnit: 'tablet',
        strengthValue: 5,
        strengthUnit: 'mg',
        scheduledFor: '2026-09-12T20:00:00+08:00',
        dueAt: '2026-09-12T20:00:00+08:00',
        status: 'not_recorded',
        recordedByName: null,
        recordedAt: null,
        snoozedUntil: null,
        reason: null,
      },
    ],
    apiKey: 'mock-key',
    fetchFn: mockFetch,
  };

  const response = await queryGeminiAssistant(params);
  assert.equal(response.source, 'gemini');
  assert.equal(response.model, 'gemini-2.5-flash');
  assert.match(response.answer, /Amlodipine scheduled for tonight/);
  assert.equal(response.actionableDose?.occurrenceId, 'occ-evening');
});

// ============================================================================
// 3. HTTP SERVER ENDPOINT INTEGRATION TESTS
// ============================================================================

test('HTTP Route: POST /patients/:patientId/assistant/query enforces authentication', async () => {
  const result = await api('/patients/00000000-0000-0000-0000-000000000000/assistant/query', {
    method: 'POST',
    body: { query: 'Hello' },
  });
  assert.equal(result.status, 401);
});

test('HTTP Route: POST /patients/:patientId/assistant/query enforces patient isolation', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'test-password-123';
  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Assistant Owner', email: `asst-owner-${suffix}@example.test`, password },
  });
  assert.equal(owner.status, 201);
  const token = owner.body.token;

  // Querying a random valid UUID patient not belonging to owner
  const nonExistentPatientId = randomUUID();
  const result = await api(`/patients/${nonExistentPatientId}/assistant/query`, {
    method: 'POST',
    token,
    body: { query: 'Hello' },
  });
  assert.equal(result.status, 404);
});

test('HTTP Route: POST /patients/:patientId/assistant/query executes successfully for authenticated member', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'test-password-123';
  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Assistant Member', email: `asst-member-${suffix}@example.test`, password },
  });
  assert.equal(owner.status, 201);
  const token = owner.body.token;

  const patient = await api<{ patient: { id: string } }>('/patients', {
    method: 'POST',
    token,
    body: { displayName: 'Assistant Test Patient' },
  });
  assert.equal(patient.status, 201);
  const patientId = patient.body.patient.id;

  const initialInvocations = assistantInvocations;
  const result = await api<{ answer: string; source: string; model: string }>(
    `/patients/${patientId}/assistant/query`,
    {
      method: 'POST',
      token,
      body: { query: "What's due next?", locale: 'en' },
    },
  );

  assert.equal(result.status, 200);
  assert.equal(assistantInvocations, initialInvocations + 1);
  assert.equal(result.body.source, 'gemini');
  assert.match(result.body.answer, /Mocked response for What's due next\?/);
});

test('HTTP Route: POST /api/assistant/query alias works with patientId in body', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'test-password-123';
  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Alias Member', email: `alias-member-${suffix}@example.test`, password },
  });
  assert.equal(owner.status, 201);
  const token = owner.body.token;

  const patient = await api<{ patient: { id: string } }>('/patients', {
    method: 'POST',
    token,
    body: { displayName: 'Alias Patient' },
  });
  assert.equal(patient.status, 201);
  const patientId = patient.body.patient.id;

  const result = await api<{ answer: string; source: string }>(
    '/api/assistant/query',
    {
      method: 'POST',
      token,
      body: { query: 'Kamusta si Lola?', locale: 'fil', patientId },
    },
  );

  assert.equal(result.status, 200);
  assert.match(result.body.answer, /Mocked response for Kamusta si Lola\?/);
});
