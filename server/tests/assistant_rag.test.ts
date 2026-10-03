import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  queryGeminiAssistant,
  type AssistantQueryParams,
} from '../src/gemini-assistant';
import {
  computeDeterministicEmbedding,
  cosineSimilarity,
  computeLexicalScore,
  FORMULARY_MONOGRAPHS,
  retrieveEntityScopedFormularyGuidance,
  detectMedicationMention,
  matchActivePrescribedMedication,
} from '../src/formulary-knowledge';
import { evaluateLocalQuery } from '../../src/features/assistant/rulesEngine';

const lolaRosaPatient = {
  id: 'patient-lola-rosa-uuid',
  displayName: 'Lola Rosa',
  canManageMedications: true,
};

const caregiverMaya = {
  id: 'caregiver-maya-uuid',
  displayName: 'Maya Santos',
};

const lolaRosaActiveMedications: AssistantQueryParams['medications'] = [
  {
    id: 'med-amlodipine-1',
    displayName: 'Amlodipine (Synthetic)',
    genericName: 'Amlodipine',
    brandName: 'Norvasc',
    strengthValue: 5,
    strengthUnit: 'mg',
    doseQuantity: 1,
    doseUnit: 'tablet',
    route: 'by mouth',
    originalInstructions: 'Take 1 tablet daily in the morning',
    notes: 'Hypertension management',
    schedules: [
      {
        kind: 'exact',
        timeOfDay: '08:00',
        intervalHours: null,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        mealName: null,
        mealRelation: null,
      },
    ],
  },
  {
    id: 'med-metformin-2',
    displayName: 'Metformin 500mg',
    genericName: 'Metformin',
    brandName: 'Glucophage',
    strengthValue: 500,
    strengthUnit: 'mg',
    doseQuantity: 1,
    doseUnit: 'tablet',
    route: 'by mouth',
    originalInstructions: 'Take 1 tablet with breakfast and dinner',
    notes: 'Type 2 diabetes',
    schedules: [
      {
        kind: 'meal',
        timeOfDay: '08:00',
        intervalHours: null,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        mealName: 'breakfast',
        mealRelation: 'after',
      },
      {
        kind: 'meal',
        timeOfDay: '18:00',
        intervalHours: null,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        mealName: 'dinner',
        mealRelation: 'after',
      },
    ],
  },
];

// ============================================================================
// 1. Vector Math & Deterministic Embedding Unit Tests
// ============================================================================

test('Formulary RAG: deterministic vector embedding produces 64-dimensional unit vector', () => {
  const text = 'Amlodipine 5mg tablet take once daily with or without food';
  const embedding = computeDeterministicEmbedding(text);

  assert.equal(embedding.length, 64);
  // Verify L2 norm is 1.0 (unit vector)
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  assert.ok(Math.abs(norm - 1.0) < 0.001, `Expected norm ~1.0, got ${norm}`);

  // Determinism check: repeated computation produces identical values
  const repeat = computeDeterministicEmbedding(text);
  assert.deepEqual(embedding, repeat);
});

test('Formulary RAG: cosine similarity is 1.0 for identical vectors and bounded [-1, 1]', () => {
  const vecA = computeDeterministicEmbedding('Metformin must be taken with meals to avoid stomach upset');
  const vecB = computeDeterministicEmbedding('Metformin must be taken with meals to avoid stomach upset');
  const sim = cosineSimilarity(vecA, vecB);
  assert.ok(Math.abs(sim - 1.0) < 0.0001, `Expected sim 1.0, got ${sim}`);

  const vecC = computeDeterministicEmbedding('Completely unrelated astronomy astrophysics planetary telescope');
  const crossSim = cosineSimilarity(vecA, vecC);
  assert.ok(crossSim >= -1 && crossSim <= 1, 'Cosine similarity must be bounded [-1, 1]');
  assert.ok(crossSim < 0.5, 'Unrelated content should have low similarity');
});

test('Formulary RAG: lexical keyword scoring matches intent phrases accurately', () => {
  const keywords = ['food', 'meal', 'stomach', 'breakfast', 'pagkain', 'kumain'];
  const content = 'Metformin should be taken with or immediately after meals to prevent stomach upset.';

  const scoreFood = computeLexicalScore('Should Lola Rosa take Metformin with meals or breakfast?', keywords, content);
  const scoreMissed = computeLexicalScore('What if she missed her dose earlier today?', keywords, content);

  assert.ok(scoreFood > 0.4, `Expected high lexical score for food query, got ${scoreFood}`);
  assert.ok(scoreMissed < scoreFood, `Expected food score to exceed missed score (${scoreFood} vs ${scoreMissed})`);
});

// ============================================================================
// 2. Entity Scoping & Cross-Drug Isolation Tests
// ============================================================================

test('Formulary RAG: detects canonical generic and brand medication mentions', () => {
  const genericMatch = detectMedicationMention('Can Lola Rosa take Amlodipine before breakfast?');
  assert.ok(genericMatch);
  assert.equal(genericMatch?.canonicalGeneric, 'Amlodipine');
  assert.equal(genericMatch?.isBrand, false);

  const brandMatch = detectMedicationMention('Did someone give her Norvasc this morning?');
  assert.ok(brandMatch);
  assert.equal(brandMatch?.canonicalGeneric, 'Amlodipine');
  assert.equal(brandMatch?.isBrand, true);
  assert.equal(brandMatch?.detectedName, 'Norvasc');

  const metforminMatch = detectMedicationMention('What is Glucophage used for?');
  assert.ok(metforminMatch);
  assert.equal(metforminMatch?.canonicalGeneric, 'Metformin');
});

test('Formulary RAG: intersects mentioned drug with active medications correctly', () => {
  const matchedActive = matchActivePrescribedMedication('Amlodipine', lolaRosaActiveMedications);
  assert.ok(matchedActive);
  assert.equal(matchedActive?.genericName, 'Amlodipine');

  const matchedBrand = matchActivePrescribedMedication('Norvasc', lolaRosaActiveMedications);
  assert.ok(matchedBrand);
  assert.equal(matchedBrand?.genericName, 'Amlodipine');

  const unprescribed = matchActivePrescribedMedication('Losartan', lolaRosaActiveMedications);
  assert.equal(unprescribed, null, 'Losartan is not prescribed to Lola Rosa and must return null');
});

test('Formulary RAG: Cross-Drug Isolation strictly refuses non-prescribed medication queries', () => {
  // Lola Rosa only has Amlodipine and Metformin prescribed. Query asks about Losartan.
  const result = retrieveEntityScopedFormularyGuidance({
    query: 'Can Lola Rosa take Losartan with food?',
    patientName: 'Lola Rosa',
    locale: 'en',
    activeMedications: lolaRosaActiveMedications,
  });

  assert.equal(result.matched, true);
  assert.equal(result.status, 'unprescribed_drug');
  assert.equal(result.citation, null, 'No citation must be returned for unprescribed drug');
  assert.match(result.groundedAnswer!.en, /Losartan is not listed in Lola Rosa's active prescribed medications/i);
  assert.match(result.groundedAnswer!.en, /consult her doctor or pharmacist/i);
});

test('Formulary RAG: Cross-Drug Isolation strictly refuses unprescribed Warfarin', () => {
  const result = retrieveEntityScopedFormularyGuidance({
    query: 'Should Lola Rosa take Warfarin with food?',
    patientName: 'Lola Rosa',
    locale: 'fil',
    activeMedications: lolaRosaActiveMedications,
  });

  assert.equal(result.matched, true);
  assert.equal(result.status, 'unprescribed_drug');
  assert.equal(result.citation, null);
  assert.match(result.groundedAnswer!.fil, /wala sa listahan ng mga aktibong gamot ni Lola Rosa/i);
});

// ============================================================================
// 3. Positive Leaflet Recall & Citation Metadata Tests
// ============================================================================

test('Formulary RAG Positive Recall: Metformin food & meal timing guidance with citation', async () => {
  const params: AssistantQueryParams = {
    query: 'Should Lola Rosa take Metformin with meals or on an empty stomach?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '', // Offline deterministic mode
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'gemini');
  assert.equal(response.model, 'formulary_rag');
  assert.ok(response.leafletCitation, 'Leaflet citation must be present');
  assert.equal(response.leafletCitation?.sourceTitle, 'Philippine National Drug Formulary (PNDF) Patient Leaflet');
  assert.equal(response.leafletCitation?.section, 'Food & Meal Timing');
  assert.match(response.answer, /with meals or immediately after eating/i);
  assert.match(response.answer, /stomach upset/i);
  assert.match(response.answer, /Lola Rosa/);
  assert.match(response.answer, /Metformin/);
});

test('Formulary RAG Positive Recall: Amlodipine missed dose rules with citation', async () => {
  const params: AssistantQueryParams = {
    query: 'What should I do if Lola Rosa missed her Amlodipine dose today?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'gemini');
  assert.ok(response.leafletCitation);
  assert.equal(response.leafletCitation?.sourceTitle, 'Philippine National Drug Formulary (PNDF) Patient Leaflet');
  assert.equal(response.leafletCitation?.section, 'Missed Dose Rules');
  assert.match(response.answer, /as soon as you remember/i);
  assert.match(response.answer, /never double/i);
  assert.match(response.answer, /Lola Rosa/);
});

test('Formulary RAG Positive Recall: Amlodipine drug purpose & indication with citation', async () => {
  const params: AssistantQueryParams = {
    query: 'What is Amlodipine for?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'gemini');
  assert.ok(response.leafletCitation);
  assert.equal(response.leafletCitation?.section, 'General Purpose & Indication');
  assert.match(response.answer, /high blood pressure|hypertension/i);
  assert.match(response.answer, /relaxing blood vessels/i);
});

test('Formulary RAG Positive Recall: Metformin administration instructions (do not crush)', async () => {
  const params: AssistantQueryParams = {
    query: 'How to take Metformin? Can I crush the tablet for Lola Rosa?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'gemini');
  assert.ok(response.leafletCitation);
  assert.equal(response.leafletCitation?.section, 'Administration Instructions');
  assert.match(response.answer, /swallow/i);
  assert.match(response.answer, /do not crush or chew/i);
});

// ============================================================================
// 4. Closed-World Invariant & Out-of-Scope Refusal Tests
// ============================================================================

test('Formulary RAG Closed-World: Refuses ungrounded medical claims not in the leaflet', async () => {
  const params: AssistantQueryParams = {
    query: 'Can Amlodipine cure diabetes and improve eye vision?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'gemini');
  assert.equal(response.leafletCitation, null, 'Ungrounded claim must NOT receive a leaflet citation');
  assert.match(response.answer, /not in the verified Philippine National Drug Formulary leaflet/i);
  assert.match(response.answer, /consult Lola Rosa's doctor or pharmacist/i);
});

test('Formulary RAG Closed-World: Filipino refusal for ungrounded claims with po/opo', async () => {
  const params: AssistantQueryParams = {
    query: 'Gamot ba ang Amlodipine sa ubo at sipon?',
    locale: 'fil',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'gemini');
  assert.equal(response.leafletCitation, null);
  assert.match(response.answer, /Wala po sa opisyal na Philippine National Drug Formulary leaflet/i);
  assert.match(response.answer, /doktor o pharmacist ni Lola Rosa/i);
});

// ============================================================================
// 5. Medical Safety Invariant Precedence Tests
// ============================================================================

test('Formulary RAG Safety Precedence: Explicit dosage doubling is strictly declined', async () => {
  const params: AssistantQueryParams = {
    query: 'Can I double the dose of Amlodipine because her blood pressure is high?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'local_rules');
  assert.equal(response.model, 'safety_guardrail');
  assert.equal(response.leafletCitation, null);
  assert.match(response.answer, /cannot diagnose conditions or modify prescribed doses/i);
  assert.match(response.answer, /consult Lola Rosa's doctor or healthcare provider/i);
});

test('Formulary RAG Safety Precedence: Acute symptoms / emergency diagnosis is strictly declined', async () => {
  const params: AssistantQueryParams = {
    query: 'Lola Rosa has severe chest pain, shortness of breath, and dizziness, what is this?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'local_rules');
  assert.equal(response.model, 'safety_guardrail');
  assert.equal(response.leafletCitation, null);
  assert.match(response.answer, /cannot diagnose conditions/i);
});

test('Formulary RAG Safety Precedence: Tagalog dosage alteration request is strictly declined', async () => {
  const params: AssistantQueryParams = {
    query: 'Pwede bang doblehin ang gamot na Metformin ni Lola Rosa?',
    locale: 'fil',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'local_rules');
  assert.equal(response.model, 'safety_guardrail');
  assert.match(response.answer, /Hindi po ako maaaring magbigay ng diagnosis o magbago ng niresetang gamot/i);
});

// ============================================================================
// 6. Bilingual Native Synthesis Tests (Tagalog with "po/opo" & English)
// ============================================================================

test('Formulary RAG Bilingual: Filipino food timing synthesis includes cultural warmth "po/opo"', async () => {
  const params: AssistantQueryParams = {
    query: 'Dapat bang inumin ni Lola Rosa ang Metformin kasabay ng pagkain?',
    locale: 'fil',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'gemini');
  assert.ok(response.leafletCitation);
  assert.match(response.answer, /\bpo\b/i, 'Filipino synthesis must include cultural warmth "po"');
  assert.match(response.answer, /Lola Rosa/);
  assert.match(response.answer, /Metformin/);
  assert.match(response.answer, /kasabay o kaagad pagkatapos kumain/i);
  assert.match(response.answer, /tiyan/i);
});

test('Formulary RAG Bilingual: Filipino missed dose guidance with respectful Tagalog', async () => {
  const params: AssistantQueryParams = {
    query: 'Nakalimutang uminom ng Amlodipine si Lola Rosa kanina, ano ang dapat gawin?',
    locale: 'fil',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'gemini');
  assert.ok(response.leafletCitation);
  assert.equal(response.leafletCitation?.section, 'Missed Dose Rules');
  assert.match(response.answer, /\bpo\b/i);
  assert.match(response.answer, /huwag kailanman magdoble/i);
});

// ============================================================================
// 7. Grounded Gemini API Execution with Injected Leaflet Context
// ============================================================================

test('Formulary RAG Gemini API: Injects verified leaflet into Gemini prompt with closed-world rules', async () => {
  let capturedRequestBody: Record<string, unknown> | null = null;

  const mockFetch: typeof fetch = async (_url, options) => {
    capturedRequestBody = JSON.parse(String(options?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Amlodipine can be taken with or without food. Lola Rosa should take it with a full glass of water at the same time each day.',
                },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );
  };

  const params: AssistantQueryParams = {
    query: 'Should Lola Rosa take Amlodipine with food?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: 'test-gemini-key',
    fetchFn: mockFetch,
  };

  const response = await queryGeminiAssistant(params);

  assert.equal(response.source, 'gemini');
  assert.ok(response.leafletCitation);
  assert.equal(response.leafletCitation?.medicationName, 'Amlodipine (Synthetic)');
  assert.equal(response.leafletCitation?.section, 'Food & Meal Timing');
  assert.equal(
    response.answer,
    'Amlodipine can be taken with or without food. Lola Rosa should take it with a full glass of water at the same time each day.',
  );

  // Inspect the captured payload to ensure strict closed-world prompt grounding was transmitted to Gemini
  assert.ok(capturedRequestBody, 'Gemini request body must have been captured');
  const payload = capturedRequestBody as Record<string, unknown>;
  const systemText = JSON.stringify(payload.systemInstruction);
  assert.match(systemText, /STRICT CLOSED-WORLD GROUNDING/);
  assert.match(systemText, /Philippine National Drug Formulary/);

  const contentsText = JSON.stringify(payload.contents);
  assert.match(contentsText, /OFFICIAL PHILIPPINE NATIONAL DRUG FORMULARY/);
  assert.match(contentsText, /Amlodipine can be taken with or without food/);
});

test('Formulary RAG Gemini API: Gracefully recovers with deterministic grounded synthesis on network error', async () => {
  const failingFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: 'Service Unavailable' }), { status: 503 });
  };

  const params: AssistantQueryParams = {
    query: 'Should Lola Rosa take Metformin with meals?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: 'test-gemini-key',
    fetchFn: failingFetch,
  };

  const response = await queryGeminiAssistant(params);

  // Gracefully falls back to deterministic grounded synthesis with citation intact!
  assert.equal(response.source, 'gemini');
  assert.equal(response.model, 'formulary_rag');
  assert.ok(response.leafletCitation);
  assert.equal(response.leafletCitation?.section, 'Food & Meal Timing');
  assert.match(response.answer, /with meals or immediately after eating/i);
});

// ============================================================================
// 8. Critical Bug Fix & Edge Case Verification Tests
// ============================================================================

test('Formulary RAG & Tier 1 Rules: "Paano inumin ang Amlodipine?" is NOT hijacked by dose status check when scheduled today', async () => {
  const timeline: AssistantQueryParams['timeline'] = [
    {
      id: 'dose-amlodipine-today',
      medicationName: 'Amlodipine (Synthetic)',
      doseQuantity: 1,
      doseUnit: 'tablet',
      strengthValue: 5,
      strengthUnit: 'mg',
      scheduledFor: '2026-09-18T08:00:00.000Z',
      dueAt: '2026-09-18T08:00:00.000Z',
      status: 'not_recorded',
      recordedByName: null,
      recordedAt: null,
      snoozedUntil: null,
      reason: null,
    },
  ];

  // 1. Client-side Tier 1 check: must return handled: false so it falls through to server RAG
  const localResult = evaluateLocalQuery({
    query: 'Paano inumin ang Amlodipine?',
    locale: 'fil',
    patient: lolaRosaPatient,
    medications: lolaRosaActiveMedications,
    timeline,
    now: new Date('2026-09-18T10:00:00.000Z'),
  });

  assert.equal(localResult.handled, false, 'Administration question must not be hijacked by local dose status rule');

  // 2. Server RAG response: must return administration instructions with verified citation
  const response = await queryGeminiAssistant({
    query: 'Paano inumin ang Amlodipine?',
    locale: 'fil',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline,
    apiKey: '',
  });

  assert.equal(response.source, 'gemini');
  assert.ok(response.leafletCitation);
  assert.equal(response.leafletCitation?.section, 'Administration Instructions');
  assert.match(response.answer, /Lunukin po nang buo/i);
  assert.match(response.answer, /\bpo\b/i);
});

test('Formulary RAG Safety: Normal administration inquiry "Can I take Amlodipine with water?" passes safety invariants', async () => {
  const params: AssistantQueryParams = {
    query: 'Can I take Amlodipine with water?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  };

  const response = await queryGeminiAssistant(params);

  // Must NOT trigger safety guardrail decline; must retrieve verified leaflet guidance
  assert.notEqual(response.model, 'safety_guardrail');
  assert.ok(response.leafletCitation);
  assert.match(response.answer, /water/i);
  assert.match(response.answer, /Amlodipine/);
});

test('Formulary RAG Timing: "When should Lola Rosa take Atorvastatin?" and "Kailan dapat inumin ang Atorvastatin?" retrieves evening timing', async () => {
  const extendedMeds: AssistantQueryParams['medications'] = [
    ...lolaRosaActiveMedications,
    {
      id: 'med-atorvastatin-3',
      displayName: 'Atorvastatin 20mg',
      genericName: 'Atorvastatin',
      brandName: 'Lipitor',
      strengthValue: 20,
      strengthUnit: 'mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      route: 'by mouth',
      originalInstructions: 'Take 1 tablet at bedtime',
      notes: 'Cholesterol management',
      schedules: [],
    },
  ];

  // English timing query
  const resEn = await queryGeminiAssistant({
    query: 'When should Lola Rosa take Atorvastatin?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: extendedMeds,
    timeline: [],
    apiKey: '',
  });

  assert.ok(resEn.leafletCitation);
  assert.equal(resEn.leafletCitation?.section, 'Food & Meal Timing');
  assert.match(resEn.answer, /evening or at bedtime/i);
  assert.match(resEn.answer, /cholesterol/i);

  // Tagalog timing query
  const resFil = await queryGeminiAssistant({
    query: 'Kailan dapat inumin ang Atorvastatin?',
    locale: 'fil',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: extendedMeds,
    timeline: [],
    apiKey: '',
  });

  assert.ok(resFil.leafletCitation);
  assert.equal(resFil.leafletCitation?.section, 'Food & Meal Timing');
  assert.match(resFil.answer, /sa gabi o bago matulog/i);
  assert.match(resFil.answer, /\bpo\b/i);
});

test('Formulary RAG: Metoprolol missed dose strictly adheres to 4-hour rule (not 12-hour default)', async () => {
  const extendedMeds: AssistantQueryParams['medications'] = [
    ...lolaRosaActiveMedications,
    {
      id: 'med-metoprolol-4',
      displayName: 'Metoprolol 50mg',
      genericName: 'Metoprolol',
      brandName: 'Betaloc',
      strengthValue: 50,
      strengthUnit: 'mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      route: 'by mouth',
      originalInstructions: 'Take 1 tablet with meals',
      notes: 'Heart rate management',
      schedules: [],
    },
  ];

  const response = await queryGeminiAssistant({
    query: 'What if Lola Rosa missed a dose of Metoprolol today?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: extendedMeds,
    timeline: [],
    apiKey: '',
  });

  assert.ok(response.leafletCitation);
  assert.equal(response.leafletCitation?.section, 'Missed Dose Rules');
  assert.match(response.answer, /within 4 hours/i, 'Metoprolol missed dose must specify the 4-hour window per leaflet');
  assert.doesNotMatch(response.answer, /12 hours/i, 'Metoprolol must not state incorrect 12-hour rule');
});

test('Formulary RAG: Atorvastatin purpose details cholesterol and stroke reduction', async () => {
  const extendedMeds: AssistantQueryParams['medications'] = [
    ...lolaRosaActiveMedications,
    {
      id: 'med-atorvastatin-3',
      displayName: 'Atorvastatin 20mg',
      genericName: 'Atorvastatin',
      brandName: 'Lipitor',
      strengthValue: 20,
      strengthUnit: 'mg',
      doseQuantity: 1,
      doseUnit: 'tablet',
      route: 'by mouth',
      originalInstructions: 'Take 1 tablet at bedtime',
      notes: 'Cholesterol',
      schedules: [],
    },
  ];

  const response = await queryGeminiAssistant({
    query: 'What is Atorvastatin for?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: extendedMeds,
    timeline: [],
    apiKey: '',
  });

  assert.ok(response.leafletCitation);
  assert.equal(response.leafletCitation?.section, 'General Purpose & Indication');
  assert.match(response.answer, /statin/i);
  assert.match(response.answer, /cholesterol/i);
});

test('Formulary RAG: Multi-drug combination inquiry declines clinical interaction advice per closed-world invariant', async () => {
  const response = await queryGeminiAssistant({
    query: 'Can Lola Rosa take Amlodipine and Metformin together at the same time?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  });

  assert.equal(response.source, 'gemini');
  assert.equal(response.leafletCitation, null, 'Multi-drug interaction must not attribute single leaflet citation');
  assert.match(response.answer, /individual administration guidelines/i);
  assert.match(response.answer, /consult Lola Rosa's doctor or pharmacist/i);
});

test('Formulary RAG: Cross-drug isolation rejects unprescribed drug even when paired with active prescribed drug', async () => {
  const response = await queryGeminiAssistant({
    query: 'Can Lola Rosa take Amlodipine with Warfarin?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: '',
  });

  assert.equal(response.source, 'gemini');
  assert.equal(response.model, 'formulary_rag_cross_drug_isolation');
  assert.equal(response.leafletCitation, null);
  assert.match(response.answer, /Warfarin is not listed in Lola Rosa's active prescribed medications/i);
});

test('Formulary RAG: Active medication without PNDF monograph (Omeprazole) cleanly explains missing leaflet', async () => {
  const extendedMeds: AssistantQueryParams['medications'] = [
    ...lolaRosaActiveMedications,
    {
      id: 'med-omeprazole-5',
      displayName: 'Omeprazole 20mg',
      genericName: 'Omeprazole',
      brandName: 'Losec',
      strengthValue: 20,
      strengthUnit: 'mg',
      doseQuantity: 1,
      doseUnit: 'capsule',
      route: 'by mouth',
      originalInstructions: 'Take 1 capsule before breakfast',
      notes: 'Acid reflux',
      schedules: [],
    },
  ];

  const response = await queryGeminiAssistant({
    query: 'Should Lola Rosa take Omeprazole with food?',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: extendedMeds,
    timeline: [],
    apiKey: '',
  });

  assert.equal(response.source, 'gemini');
  assert.equal(response.model, 'formulary_rag_closed_world');
  assert.equal(response.leafletCitation, null);
  assert.match(response.answer, /no verified patient leaflet available in the Philippine National Drug Formulary for Omeprazole/i);
  assert.doesNotMatch(response.answer, /Which of Lola Rosa's active medicines are you asking about/i);
});

test('High Availability: Open-ended query falls back to gemini-3.5-flash when primary model returns 503', async () => {
  const attemptedModels: string[] = [];

  const mockFetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('gemini-3.6-flash')) {
      attemptedModels.push('gemini-3.6-flash');
      return new Response(JSON.stringify({ error: { code: 503, message: 'High demand' } }), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('gemini-3.5-flash')) {
      attemptedModels.push('gemini-3.5-flash');
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'I understand you are having trouble with your medications. Can you tell me more about what is making it difficult, such as side effects or schedule confusion?',
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response('Not Found', { status: 404 });
  };

  const response = await queryGeminiAssistant({
    query: 'I am having trouble with my medications',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: 'test-key',
    fetchFn: mockFetch as typeof fetch,
  });

  assert.deepEqual(attemptedModels, ['gemini-3.6-flash', 'gemini-3.5-flash']);
  assert.equal(response.source, 'gemini');
  assert.equal(response.model, 'gemini-3.5-flash');
  assert.match(response.answer, /trouble with your medications/i);
});

test('High Availability: All candidate models failing cleanly drops to offline fallback without crashing', async () => {
  const failingFetch = async () => {
    return new Response(JSON.stringify({ error: 'All models busy' }), { status: 503 });
  };

  const response = await queryGeminiAssistant({
    query: 'I am having trouble with my medications',
    locale: 'en',
    patient: lolaRosaPatient,
    caregiver: caregiverMaya,
    medications: lolaRosaActiveMedications,
    timeline: [],
    apiKey: 'test-key',
    fetchFn: failingFetch as unknown as typeof fetch,
  });

  assert.equal(response.source, 'fallback');
  assert.equal(response.model, 'fallback');
  assert.match(response.answer, /trouble connecting to my AI care service/i);
});

