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
import {
  evaluateLocalQuery,
  extractExactTimes,
  extractMedicineName,
  extractScheduleDetails,
  extractStrengthAndDose,
} from '../../src/features/assistant/rulesEngine';
import type { LocalEvaluationContext } from '../../src/features/assistant/types';

const { Client } = pg;

let assistantInvocations = 0;
let lastAssistantQueryParams: AssistantQueryParams | null = null;
const server = createAppServer(databasePool, {
  queryAssistant: async (params) => {
    assistantInvocations += 1;
    lastAssistantQueryParams = params;
    // Default mock response in HTTP tests to verify route wiring
    return {
      answer: `Mocked response for ${params.query}`,
      source: 'gemini',
      model: 'gemini-3.6-flash',
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

test('Tier 1 Local Rules: Tagalog "Ano ang susunod na gamot?" gets the next dose in English', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: 'Ano ang susunod na gamot?',
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
});

test('Tier 1 Local Rules: celebration state triggers when all doses for today are recorded', () => {
  const now = new Date('2026-09-12T21:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: "What's due next?",
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

test('Tier 1 Local Rules: "Today\'s summary" calculates counts correctly for English and Tagalog queries', () => {
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
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline,
    now,
  });
  assert.equal(enRes.handled, true);
  assert.match(enRes.answer || '', /1 of 3 doses recorded as taken, 1 skipped, 0 not recorded, and 1 still to come\./);

  const tagalogRes = evaluateLocalQuery({
    query: 'Buod ng araw na ito',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline,
    now,
  });
  assert.equal(tagalogRes.handled, true);
  assert.match(tagalogRes.answer || '', /1 of 3 doses recorded as taken, 1 skipped, 0 not recorded, and 1 still to come\./);

  const evening = evaluateLocalQuery({
    query: "Today's summary",
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline,
    now: new Date('2026-09-12T21:00:00+08:00'),
  });
  assert.match(evening.answer || '', /1 of 3 doses recorded as taken, 1 skipped, and 1 not recorded\./);
});

test('Tier 1 Local Rules: Caregiver attribution check returns who recorded the dose and when', () => {
  const now = new Date('2026-09-12T12:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: 'Did someone record Amlodipine?',
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

  const tagalogContext: LocalEvaluationContext = {
    ...context,
    query: 'Sino ang nagtala ng Amlodipine?',
  };
  const tagalogResult = evaluateLocalQuery(tagalogContext);
  assert.equal(tagalogResult.handled, true);
  assert.match(tagalogResult.answer || '', /recorded as taken by Paolo Santos/);
});

test('Tier 1 Local Rules: Prescription help directs user to Medicines tab', () => {
  const context: LocalEvaluationContext = {
    query: 'Help with prescription',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline: [],
    now: new Date(),
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.match(result.answer || '', /Medicines tab/);

  const tagalogResult = evaluateLocalQuery({ ...context, query: 'Tulong sa reseta' });
  assert.equal(tagalogResult.handled, true);
  assert.match(tagalogResult.answer || '', /Medicines tab/);
});

test('Tier 1 Local Rules: Medical safety invariant rejects dosage modification and directs to doctor', () => {
  const context: LocalEvaluationContext = {
    query: 'Can I increase Lola Rosa dose to two tablets?',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline: [],
    now: new Date(),
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.match(result.answer || '', /please consult Lola Rosa's doctor or healthcare provider directly/);

  const tagalogResult = evaluateLocalQuery({
    ...context,
    query: 'Pwede bang dagdagan ang dose ng gamot?',
  });
  assert.equal(tagalogResult.handled, true);
  assert.match(tagalogResult.answer || '', /please consult Lola Rosa's doctor or healthcare provider directly/);
});

test('Tier 1 Local Rules: Conversational query returns handled: false for Tier 2 fallback', () => {
  const context: LocalEvaluationContext = {
    query: 'Does Lola Rosa like drinking warm water before her morning pills?',
    patient: { displayName: 'Lola Rosa' },
    medications: [],
    timeline: [],
    now: new Date(),
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, false);
});

test('Tier 1 Local Rules: parses "Add Metformin 500mg once daily at 8:00 AM" into complete draft', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: 'Add Metformin 500mg once daily at 8:00 AM',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.equal(result.source, 'local_rules');
  assert.ok(result.medicationDraft);
  assert.equal(result.medicationDraft.displayName, 'Metformin');
  assert.equal(result.medicationDraft.strengthValue, 500);
  assert.equal(result.medicationDraft.strengthUnit, 'mg');
  assert.equal(result.medicationDraft.doseQuantity, 1);
  assert.equal(result.medicationDraft.doseUnit, 'tablet');
  assert.deepEqual(result.medicationDraft.times, ['08:00']);
  assert.match(result.answer || '', /Here is the draft for Metformin/);
});

test('Tier 1 Local Rules: parses "Dagdag ng Paracetamol 500mg bawat 6 na oras" into interval draft', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: 'Dagdag ng Paracetamol 500mg bawat 6 na oras',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.equal(result.source, 'local_rules');
  assert.ok(result.medicationDraft);
  assert.equal(result.medicationDraft.displayName, 'Paracetamol');
  assert.equal(result.medicationDraft.strengthValue, 500);
  assert.equal(result.medicationDraft.strengthUnit, 'mg');
  assert.equal(result.medicationDraft.scheduleKind, 'interval');
  assert.equal(result.medicationDraft.intervalHours, 6);
  assert.match(result.answer || '', /Here is the draft for Paracetamol/);
});

test('Tier 1 Local Rules: parses "Lola needs to take Losartan 50mg every night at 9pm"', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: 'Lola needs to take Losartan 50mg every night at 9pm',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.equal(result.source, 'local_rules');
  assert.ok(result.medicationDraft);
  assert.equal(result.medicationDraft.displayName, 'Losartan');
  assert.equal(result.medicationDraft.strengthValue, 50);
  assert.equal(result.medicationDraft.strengthUnit, 'mg');
  assert.deepEqual(result.medicationDraft.times, ['21:00']);
});

test('Tier 1 Local Rules: parses direct statement without "add" keyword "Metformin 500mg daily at 8:00 AM"', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: 'Metformin 500mg daily at 8:00 AM',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.equal(result.source, 'local_rules');
  assert.ok(result.medicationDraft);
  assert.equal(result.medicationDraft.displayName, 'Metformin');
  assert.equal(result.medicationDraft.strengthValue, 500);
  assert.equal(result.medicationDraft.strengthUnit, 'mg');
  assert.deepEqual(result.medicationDraft.times, ['08:00']);
  assert.match(result.answer || '', /Here is the draft for Metformin/);
});

test('Tier 1 Local Rules: "+ Add medicine" chip initializes pending draft, followed by direct input', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  // Turn 1: user taps "+ Add medicine" chip
  const turn1 = evaluateLocalQuery({
    query: '+ Add medicine',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
  });

  assert.equal(turn1.handled, true);
  assert.equal(turn1.medicationDraft, null);
  assert.ok(turn1.pendingDraft);
  assert.match(turn1.answer || '', /What medicine would you like to add for Lola Rosa/);

  // Turn 2: user responds with medicine details
  const turn2 = evaluateLocalQuery({
    query: 'Metformin 500mg daily at 8:00 AM',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
    pendingDraftState: turn1.pendingDraft,
  });

  assert.equal(turn2.handled, true);
  assert.ok(turn2.medicationDraft);
  assert.equal(turn2.medicationDraft.displayName, 'Metformin');
  assert.equal(turn2.medicationDraft.strengthValue, 500);
  assert.deepEqual(turn2.medicationDraft.times, ['08:00']);
});

test('Tier 1 Local Rules: multi-turn flow asks for missing time, then completes draft with time response', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  // Turn 1: user provides med and strength but no time
  const turn1Context: LocalEvaluationContext = {
    query: 'Add Metformin 500mg',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
  };

  const turn1 = evaluateLocalQuery(turn1Context);
  assert.equal(turn1.handled, true);
  assert.equal(turn1.medicationDraft, null);
  assert.ok(turn1.pendingDraft);
  assert.equal(turn1.pendingDraft.displayName, 'Metformin');
  assert.equal(turn1.pendingDraft.strengthValue, 500);
  assert.match(turn1.answer || '', /What time should Lola Rosa take Metformin 500mg\?/);

  // Turn 2: user replies with the time
  const turn2Context: LocalEvaluationContext = {
    query: 'at 8:00 AM',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
    pendingDraftState: turn1.pendingDraft,
  };

  const turn2 = evaluateLocalQuery(turn2Context);
  assert.equal(turn2.handled, true);
  assert.ok(turn2.medicationDraft);
  assert.equal(turn2.medicationDraft.displayName, 'Metformin');
  assert.equal(turn2.medicationDraft.strengthValue, 500);
  assert.deepEqual(turn2.medicationDraft.times, ['08:00']);
  assert.equal(turn2.pendingDraft, null);
});

test('Tier 1 Local Rules: multi-turn flow asks for missing dose, then completes draft with dose response', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  // Turn 1: user provides med and time but no dose
  const turn1Context: LocalEvaluationContext = {
    query: 'Add Metformin at 8:00 AM',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
  };

  const turn1 = evaluateLocalQuery(turn1Context);
  assert.equal(turn1.handled, true);
  assert.equal(turn1.medicationDraft, null);
  assert.ok(turn1.pendingDraft);
  assert.equal(turn1.pendingDraft.displayName, 'Metformin');
  assert.deepEqual(turn1.pendingDraft.times, ['08:00']);
  assert.match(turn1.answer || '', /What is the dosage or strength for Metformin/);

  // Turn 2: user replies with dose
  const turn2Context: LocalEvaluationContext = {
    query: '500mg',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
    pendingDraftState: turn1.pendingDraft,
  };

  const turn2 = evaluateLocalQuery(turn2Context);
  assert.equal(turn2.handled, true);
  assert.ok(turn2.medicationDraft);
  assert.equal(turn2.medicationDraft.displayName, 'Metformin');
  assert.equal(turn2.medicationDraft.strengthValue, 500);
  assert.equal(turn2.medicationDraft.strengthUnit, 'mg');
  assert.deepEqual(turn2.medicationDraft.times, ['08:00']);
});

test('Tier 1 Local Rules: rejects non-managers with care manager attribution for English and Tagalog requests', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const enContext: LocalEvaluationContext = {
    query: 'Add Metformin 500mg at 8:00 AM',
    patient: {
      id: 'p1',
      displayName: 'Lola Rosa',
      canManageMedications: false,
      primaryCareManagerName: 'Maya Santos',
    },
    medications: [],
    timeline: [],
    now,
  };

  const enResult = evaluateLocalQuery(enContext);
  assert.equal(enResult.handled, true);
  assert.equal(enResult.medicationDraft, null);
  assert.equal(enResult.pendingDraft, null);
  assert.match(
    enResult.answer || '',
    /Only primary care managers can add new medicines for Lola Rosa\. Please coordinate with Maya Santos\./,
  );

  const tagalogContext: LocalEvaluationContext = {
    ...enContext,
    query: 'Magdagdag ng Metformin 500mg sa 8am',
  };

  const tagalogResult = evaluateLocalQuery(tagalogContext);
  assert.equal(tagalogResult.handled, true);
  assert.equal(tagalogResult.medicationDraft, null);
  assert.match(
    tagalogResult.answer || '',
    /Only primary care managers can add new medicines for Lola Rosa\. Please coordinate with Maya Santos\./,
  );
});

test('Tier 1 Local Rules: flags duplicate medication against active patient medicines', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const context: LocalEvaluationContext = {
    query: 'Add Metformin 500mg at 8:00 AM',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [
      {
        id: 'med-existing',
        displayName: 'Metformin',
        genericName: 'Metformin Hydrochloride',
        brandName: 'Glucophage',
        strengthValue: 500,
        strengthUnit: 'mg',
        doseQuantity: 1,
        doseUnit: 'tablet',
        medicineForm: 'tablet',
        schedules: [],
      } as any,
    ],
    timeline: [],
    now,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.ok(result.medicationDraft);
  assert.equal(result.medicationDraft.isDuplicate, true);
  assert.equal(result.medicationDraft.duplicateMedicationName, 'Metformin');
  assert.match(result.answer || '', /already in Lola Rosa's active medicines/);
});

test('Tier 1 Local Rules: cancels pending draft on English and Tagalog cancel keywords', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const pending = {
    id: 'draft-1',
    displayName: 'Metformin',
    strengthValue: 500,
    strengthUnit: 'mg',
    doseQuantity: 1,
    doseUnit: 'tablet',
    medicineForm: 'tablet',
    scheduleKind: 'exact' as const,
    times: [],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  };

  const enContext: LocalEvaluationContext = {
    query: 'cancel',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
    pendingDraftState: pending,
  };

  const enResult = evaluateLocalQuery(enContext);
  assert.equal(enResult.handled, true);
  assert.equal(enResult.pendingDraft, null);
  assert.equal(enResult.medicationDraft, null);
  assert.match(enResult.answer || '', /cancelled adding the medicine/i);

  const tagalogContext: LocalEvaluationContext = {
    ...enContext,
    query: 'wag na lang',
  };

  const tagalogResult = evaluateLocalQuery(tagalogContext);
  assert.equal(tagalogResult.handled, true);
  assert.equal(tagalogResult.pendingDraft, null);
  assert.equal(tagalogResult.medicationDraft, null);
  assert.match(tagalogResult.answer || '', /cancelled adding the medicine/i);
});

test('Tier 1 Local Rules: switches to a new medicine cleanly when a draft is already pending', () => {
  const now = new Date('2026-09-12T07:00:00+08:00');
  const pendingMetformin = {
    id: 'draft-metformin',
    displayName: 'Metformin',
    strengthValue: 500,
    strengthUnit: 'mg',
    doseQuantity: 1,
    doseUnit: 'tablet',
    medicineForm: 'tablet',
    scheduleKind: 'exact' as const,
    times: [],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  };

  const context: LocalEvaluationContext = {
    query: 'Add Losartan 50mg at 8:00 AM',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    medications: [],
    timeline: [],
    now,
    pendingDraftState: pendingMetformin,
  };

  const result = evaluateLocalQuery(context);
  assert.equal(result.handled, true);
  assert.ok(result.medicationDraft);
  assert.equal(result.medicationDraft.displayName, 'Losartan');
  assert.equal(result.medicationDraft.strengthValue, 50);
  assert.deepEqual(result.medicationDraft.times, ['08:00']);
});

test('Tier 1 Local Rules: parses dose-first phrasing correctly', () => {
  assert.equal(extractMedicineName('Add 500mg Paracetamol once daily at 8:00 AM'), 'Paracetamol');
  assert.equal(extractMedicineName('Dagdag ng 500mg na Paracetamol sa 8am'), 'Paracetamol');
  assert.equal(extractMedicineName('Add 1 tablet of Aspirin at 8:00 AM'), 'Aspirin');
  assert.equal(extractMedicineName('Lola needs to take 50mg Losartan at night'), 'Losartan');
  assert.equal(extractMedicineName('Dagdag ng dalawang tableta ng Paracetamol sa 8am'), 'Paracetamol');
  assert.equal(extractMedicineName('Dagdag ng isang tableta ng Aspirin sa 8am'), 'Aspirin');

  const parsedDose = extractStrengthAndDose('Add 500mg Paracetamol once daily at 8:00 AM');
  assert.equal(parsedDose.strengthValue, 500);
  assert.equal(parsedDose.strengthUnit, 'mg');

  const parsedLigatureDose = extractStrengthAndDose('Dagdag ng dalawang tableta ng Paracetamol sa 8am');
  assert.equal(parsedLigatureDose.doseQuantity, 2);
  assert.equal(parsedLigatureDose.doseUnit, 'tablet');

  const parsedLigatureDose1 = extractStrengthAndDose('Dagdag ng isang tableta ng Aspirin sa 8am');
  assert.equal(parsedLigatureDose1.doseQuantity, 1);
  assert.equal(parsedLigatureDose1.doseUnit, 'tablet');
});

test('Tier 1 Local Rules: extracts explicit interval start times', () => {
  const scheduleWithStart = extractScheduleDetails('Add Paracetamol 500mg every 6 hours starting at 9:00 AM');
  assert.equal(scheduleWithStart?.kind, 'interval');
  assert.equal(scheduleWithStart?.intervalHours, 6);
  assert.deepEqual(scheduleWithStart?.times, ['09:00']);

  const scheduleWithoutStart = extractScheduleDetails('Dagdag ng Paracetamol 500mg bawat 6 na oras');
  assert.equal(scheduleWithoutStart?.kind, 'interval');
  assert.equal(scheduleWithoutStart?.intervalHours, 6);
  assert.deepEqual(scheduleWithoutStart?.times, ['08:00']);
});

test('Tier 1 Local Rules: supports broader dosage forms and units (inhaler, spray, patch, sachet)', () => {
  const inhaler = extractStrengthAndDose('2 puffs of Salbutamol inhaler');
  assert.equal(inhaler.doseQuantity, 2);
  assert.equal(inhaler.doseUnit, 'puffs');
  assert.equal(inhaler.medicineForm, 'inhaler');

  const spray = extractStrengthAndDose('1 spray of Fluticasone');
  assert.equal(spray.doseQuantity, 1);
  assert.equal(spray.doseUnit, 'sprays');
  assert.equal(spray.medicineForm, 'spray');

  const patch = extractStrengthAndDose('1 patch of Fentanyl');
  assert.equal(patch.doseQuantity, 1);
  assert.equal(patch.doseUnit, 'patch');
  assert.equal(patch.medicineForm, 'patch');
});


// ============================================================================
// 2. TIER 2 GEMINI ASSISTANT ADAPTER TESTS
// ============================================================================

test('Gemini Assistant: safety invariants reject diagnosis and dosage change pre-check', () => {
  const decline1 = checkMedicalSafetyInvariants('Can I double the dose of Amlodipine?', 'Lola Rosa');
  assert.ok(decline1);
  assert.match(decline1, /consult Lola Rosa's doctor/);

  const decline2 = checkMedicalSafetyInvariants('She has chest pain and nausea, what is this?', 'Lola Rosa');
  assert.ok(decline2);
  assert.match(decline2, /cannot diagnose conditions/);

  const declineTagalog = checkMedicalSafetyInvariants('Masakit ang dibdib at nahihilo si Lola, ano ang sakit niya?', 'Lola Rosa');
  assert.ok(declineTagalog);
  assert.match(declineTagalog, /consult Lola Rosa's doctor/);
});

test('Gemini Assistant: context building serializes active meds, schedules, and history', () => {
  const params: AssistantQueryParams = {
    query: 'Hello Bantay',
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
  assert.equal(response.model, 'gemini-3.6-flash');
  assert.match(response.answer, /Amlodipine scheduled for tonight/);
  assert.equal(response.actionableDose?.occurrenceId, 'occ-evening');
});

test('Gemini Assistant: tool call propose_medication_draft builds structured AssistantMedicationDraft', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'propose_medication_draft',
                    args: {
                      displayName: 'Aspirin',
                      genericName: 'Acetylsalicylic Acid',
                      brandName: 'Bayer',
                      strengthValue: 81,
                      strengthUnit: 'mg',
                      doseQuantity: 1,
                      doseUnit: 'tablet',
                      medicineForm: 'tablet',
                      scheduleKind: 'exact',
                      exactTimes: ['08:00'],
                      weekdays: [0, 1, 2, 3, 4, 5, 6],
                    },
                  },
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const params: AssistantQueryParams = {
    query: 'Please add Aspirin 81mg every morning at 8am',
    patient: { id: 'p1', displayName: 'Lola Rosa', canManageMedications: true },
    caregiver: { id: 'c1', displayName: 'Maya Santos' },
    medications: [],
    timeline: [],
    apiKey: 'mock-key',
    fetchFn: mockFetch,
  };

  const response = await queryGeminiAssistant(params);
  assert.equal(response.source, 'gemini');
  assert.ok(response.medicationDraft);
  assert.equal(response.medicationDraft.displayName, 'Aspirin');
  assert.equal(response.medicationDraft.strengthValue, 81);
  assert.equal(response.medicationDraft.strengthUnit, 'mg');
  assert.deepEqual(response.medicationDraft.times, ['08:00']);
});

test('Gemini Assistant: permission pre-check rejects non-managers for add medicine intent', async () => {
  const params: AssistantQueryParams = {
    query: 'Add Metformin 500mg at 8:00 AM',
    patient: {
      id: 'p1',
      displayName: 'Lola Rosa',
      canManageMedications: false,
      primaryCareManagerName: 'Maya Santos',
    },
    caregiver: { id: 'c2', displayName: 'Caregiver Carlo' },
    medications: [],
    timeline: [],
    apiKey: 'mock-key',
  };

  const response = await queryGeminiAssistant(params);
  assert.equal(response.source, 'local_rules');
  assert.equal(response.model, 'permission_guardrail');
  assert.equal(response.medicationDraft, null);
  assert.match(response.answer, /Only primary care managers can add new medicines for Lola Rosa/);
  assert.match(response.answer, /Maya Santos/);
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
      body: { query: "What's due next?" },
    },
  );

  assert.equal(result.status, 200);
  assert.equal(assistantInvocations, initialInvocations + 1);
  assert.equal(result.body.source, 'gemini');
  assert.match(result.body.answer, /Mocked response for What's due next\?/);
  assert.equal(lastAssistantQueryParams?.patient.canManageMedications, true);
  assert.equal(lastAssistantQueryParams?.patient.primaryCareManagerName, 'Assistant Member');

  const patientsList = await api<{ patients: Array<{ id: string; primaryCareManagerName?: string; canManageMedications: boolean }> }>('/patients', {
    method: 'GET',
    token,
  });
  assert.equal(patientsList.status, 200);
  const matched = patientsList.body.patients.find((p) => p.id === patientId);
  assert.equal(matched?.primaryCareManagerName, 'Assistant Member');
  assert.equal(matched?.canManageMedications, true);
});

test('HTTP Route: POST /api/assistant/query alias works with patientId in body and ignores a legacy locale field', async () => {
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

test('HTTP Route: non-manager caregiver receives primary care manager name from database and permission attribution', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'test-password-123';

  // 1. Owner registers and creates patient Lola Rosa
  const owner = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Maya Santos', email: `owner-maya-${suffix}@example.test`, password },
  });
  assert.equal(owner.status, 201);

  const patient = await api<{ patient: { id: string; displayName: string } }>('/patients', {
    method: 'POST',
    token: owner.body.token,
    body: { displayName: 'Lola Rosa' },
  });
  assert.equal(patient.status, 201);
  const patientId = patient.body.patient.id;

  // 2. Caregiver registers
  const caregiverEmail = `caregiver-carlo-${suffix}@example.test`;
  const caregiver = await api<AuthResult>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Carlo Gomez', email: caregiverEmail, password },
  });
  assert.equal(caregiver.status, 201);

  // 3. Owner invites caregiver with canManageMedications: false
  const invite = await api<{ invitation: { id: string } }>(`/patients/${patientId}/invitations`, {
    method: 'POST',
    token: owner.body.token,
    body: { email: caregiverEmail, canManageMedications: false },
  });
  assert.equal(invite.status, 201);

  // 4. Caregiver accepts invitation
  const inbox = await api<{ invitations: Array<{ id: string; patientId: string }> }>('/invitations', {
    token: caregiver.body.token,
  });
  assert.equal(inbox.status, 200);
  const invitationId = inbox.body.invitations[0].id;

  const accept = await api<{ status: string }>(`/invitations/${invitationId}/accept`, {
    method: 'POST',
    token: caregiver.body.token,
  });
  assert.equal(accept.status, 200);

  // 5. Caregiver fetches GET /patients: must resolve primaryCareManagerName = "Maya Santos"
  const caregiverPatients = await api<{
    patients: Array<{ id: string; displayName: string; role: string; canManageMedications: boolean; primaryCareManagerName?: string }>;
  }>('/patients', {
    method: 'GET',
    token: caregiver.body.token,
  });
  assert.equal(caregiverPatients.status, 200);
  const matched = caregiverPatients.body.patients.find((p) => p.id === patientId);
  assert.ok(matched);
  assert.equal(matched.role, 'caregiver');
  assert.equal(matched.canManageMedications, false);
  assert.equal(matched.primaryCareManagerName, 'Maya Santos');

  // 6. Caregiver calls POST /patients/:patientId/assistant/query to add medicine
  const queryResult = await api<{ answer: string; source: string }>(
    `/patients/${patientId}/assistant/query`,
    {
      method: 'POST',
      token: caregiver.body.token,
      body: { query: 'Add Metformin 500mg at 8:00 AM' },
    },
  );
  assert.equal(queryResult.status, 200);

  // Verify parameters passed to queryAssistant carried the resolved care manager and permissions
  assert.ok(lastAssistantQueryParams);
  assert.equal(lastAssistantQueryParams.patient.id, patientId);
  assert.equal(lastAssistantQueryParams.patient.displayName, 'Lola Rosa');
  assert.equal(lastAssistantQueryParams.patient.canManageMedications, false);
  assert.equal(lastAssistantQueryParams.patient.primaryCareManagerName, 'Maya Santos');
  assert.equal(lastAssistantQueryParams.caregiver.displayName, 'Carlo Gomez');

  // 7. Test guardrail response directly with the parameters resolved from the database
  const enGuardrailResponse = await queryGeminiAssistant(lastAssistantQueryParams);
  assert.equal(enGuardrailResponse.source, 'local_rules');
  assert.equal(enGuardrailResponse.model, 'permission_guardrail');
  assert.equal(enGuardrailResponse.medicationDraft, null);
  assert.equal(
    enGuardrailResponse.answer,
    'Only primary care managers can add new medicines for Lola Rosa. Please coordinate with Maya Santos.',
  );

  const tagalogGuardrailResponse = await queryGeminiAssistant({
    ...lastAssistantQueryParams,
    query: 'Magdagdag ng Metformin 500mg sa 8am',
  });
  assert.equal(tagalogGuardrailResponse.source, 'local_rules');
  assert.equal(tagalogGuardrailResponse.model, 'permission_guardrail');
  assert.equal(tagalogGuardrailResponse.medicationDraft, null);
  assert.equal(
    tagalogGuardrailResponse.answer,
    'Only primary care managers can add new medicines for Lola Rosa. Please coordinate with Maya Santos.',
  );
});
