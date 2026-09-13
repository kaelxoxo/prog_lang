export interface AssistantActionableDose {
  occurrenceId: string;
  medicationName: string;
  doseQuantity: number;
  doseUnit: string;
  strengthValue: number | null;
  strengthUnit: string | null;
  scheduledFor: string;
  dueAt: string;
  status: 'not_recorded' | 'taken' | 'skipped' | 'snoozed';
}

export interface AssistantQueryParams {
  query: string;
  locale: 'en' | 'fil';
  currentLocalTime?: string;
  todayDate?: string;
  patient: {
    id: string;
    displayName: string;
    role?: string;
  };
  caregiver: {
    id: string;
    displayName: string;
    email?: string;
  };
  medications: Array<{
    id: string;
    displayName: string;
    genericName: string | null;
    brandName: string | null;
    strengthValue: number | null;
    strengthUnit: string | null;
    doseQuantity: number;
    doseUnit: string;
    route: string | null;
    originalInstructions: string | null;
    notes: string | null;
    schedules: Array<{
      kind: string;
      timeOfDay: string;
      intervalHours: number | null;
      weekdays: number[];
      mealName: string | null;
      mealRelation: string | null;
    }>;
  }>;
  timeline: Array<{
    id: string;
    medicationName: string;
    doseQuantity: number;
    doseUnit: string;
    strengthValue: number | null;
    strengthUnit: string | null;
    scheduledFor: string | Date;
    dueAt: string | Date;
    status: 'not_recorded' | 'taken' | 'skipped' | 'snoozed';
    recordedByName: string | null;
    recordedAt: string | Date | null;
    snoozedUntil: string | Date | null;
    reason: string | null;
  }>;
  apiKey?: string;
  fetchFn?: typeof fetch;
}

export interface AssistantQueryResponse {
  answer: string;
  source: 'local_rules' | 'gemini' | 'fallback';
  model: string;
  actionableDose?: AssistantActionableDose | null;
  suggestedQuickReplies: string[];
}

const DIAGNOSIS_PATTERNS = [
  /\b(diagnos|symptom|chest pain|dizzy|dizziness|nausea|fever|vomit|vomiting|shortness of breath|rash|bleeding)\b/i,
  /\b(sakit sa dibdib|nahihilo|lagnat|nagsusuka|masakit ang ulo|anong sakit|masakit ang tyan|hirap huminga)\b/i,
];

const DOSAGE_MODIFICATION_PATTERNS = [
  /\b(increase|decrease|double|triple|reduce|stop|discontinue|skip|change|adjust)\b.*?\b(dose|dosage|medicine|medication|tablet|pill|prescription)\b/i,
  /\b(dose|dosage|medicine|medication|tablet|pill)\b.*?\b(increase|decrease|double|triple|reduce|stop|discontinue|skip|change|adjust)\b/i,
  /\bcan i (increase|decrease|double|stop|skip|change|adjust|take|give|drink)\b/i,
  /\bshould i (increase|decrease|double|stop|skip|change|adjust|take|give|drink)\b/i,
  /\b(dagdagan|bawasan|itigil|ihinto|laktawan|palitan)\b.*?\b(dose|dosage|gamot|inumin|reseta)\b/i,
  /\bpwede bang (dagdagan|bawasan|itigil|doblehin|dalawa|kalahati)\b/i,
  /\b(doblehin|doble|kalahati)\s+(ang\s+)?(dose|dosage|gamot|inumin)\b/i,
];

export function checkMedicalSafetyInvariants(query: string, patientName: string, locale: 'en' | 'fil'): string | null {
  const trimmed = query.trim();
  const isDiagnosisQuery = DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(trimmed));
  const isDosageQuery = DOSAGE_MODIFICATION_PATTERNS.some((pattern) => pattern.test(trimmed));

  if (isDiagnosisQuery || isDosageQuery) {
    return locale === 'fil'
      ? `Para sa anumang pagbabago sa gamot, dosage, o medikal na kalagayan, mangyaring sumangguni agad sa doktor o healthcare provider ni ${patientName}. Hindi po ako maaaring magbigay ng diagnosis o magbago ng niresetang gamot.`
      : `For any adjustments to medicines, dosage changes, or health concerns, please consult ${patientName}'s doctor or healthcare provider directly. I cannot diagnose conditions or modify prescribed doses.`;
  }

  return null;
}

export function buildAssistantContext(params: AssistantQueryParams) {
  return {
    patient: {
      displayName: params.patient.displayName,
    },
    caregiver: {
      displayName: params.caregiver.displayName,
    },
    todayDate: params.todayDate || new Date().toISOString().slice(0, 10),
    currentLocalTime: params.currentLocalTime || 'Asia/Manila',
    activeMedications: params.medications.map((m) => ({
      displayName: m.displayName,
      genericName: m.genericName,
      brandName: m.brandName,
      strength: m.strengthValue && m.strengthUnit ? `${m.strengthValue} ${m.strengthUnit}` : null,
      dose: `${m.doseQuantity} ${m.doseUnit}`,
      route: m.route,
      instructions: m.originalInstructions,
      notes: m.notes,
      schedules: m.schedules.map((s) => ({
        kind: s.kind,
        timeOfDay: s.timeOfDay,
        mealName: s.mealName,
        mealRelation: s.mealRelation,
      })),
    })),
    todayTimeline: params.timeline.map((d) => ({
      occurrenceId: d.id,
      medicationName: d.medicationName,
      scheduledFor: typeof d.scheduledFor === 'string' ? d.scheduledFor : d.scheduledFor.toISOString(),
      status: d.status,
      recordedByName: d.recordedByName,
      recordedAt: d.recordedAt ? (typeof d.recordedAt === 'string' ? d.recordedAt : d.recordedAt.toISOString()) : null,
      reason: d.reason,
    })),
  };
}

export function buildSystemInstruction(caregiverName: string, patientName: string): string {
  return `You are Bantay, the warm, faithful, and protective eldercare companion mascot of the Alaga application in the Philippines. You are conversing with caregiver ${caregiverName} regarding ${patientName}.

COMMUNICATION TONE & STYLE:
- Keep answers warm, reassuring, respectful, and concise (maximum 2-3 short sentences for mobile screens).
- When replying in Filipino (locale === 'fil'), use respectful Tagalog with cultural warmth ("po" / "opo") and refer respectfully to the elder as ${patientName}.
- When replying in English (locale === 'en'), use gentle, clear care-companion English.

CRITICAL MEDICAL SAFETY RULES:
1. GROUNDED IN RECORDS ONLY: Answer questions strictly based on the confirmed medications and recorded dose history provided in the context. Never assume or invent unrecorded intake.
2. NO DIAGNOSIS OR CLINICAL ADVICE: Explicitly DECLINE all requests to diagnose medical conditions, evaluate acute symptoms, assess drug-drug interactions beyond recorded instructions, or suggest new treatments.
3. DECLINE PRESCRIPTION ALTERATIONS: If the user asks to increase, decrease, skip, or discontinue a medication, decline politely and firmly:
   - EN: "For any adjustments to medicines, dosage changes, or health concerns, please consult ${patientName}'s doctor or healthcare provider directly."
   - FIL: "Para sa anumang pagbabago sa gamot, dosage, o medikal na kalagayan, mangyaring sumangguni agad sa doktor o healthcare provider ni ${patientName}."
4. PRESERVE PHARMACEUTICAL & PATIENT NAMES: Never translate or modify pharmaceutical brand names, generic active ingredients, dosage strengths, or patient names.
5. ACTIONABLE DOSE IDENTIFICATION: If the user query is about an unrecorded dose scheduled for today, mention the medication and time clearly so the app can present an attributable recording card.`;
}

export function findActionableDose(
  timeline: AssistantQueryParams['timeline'],
  query: string,
  answer: string,
): AssistantActionableDose | null {
  const unrecorded = timeline.filter((d) => d.status === 'not_recorded' || d.status === 'snoozed');
  if (unrecorded.length === 0) return null;

  const combined = `${query} ${answer}`.toLowerCase();
  const matched = unrecorded.find((d) => {
    const medLower = d.medicationName.toLowerCase();
    return combined.includes(medLower) || medLower.split(/\s+/).some((w) => w.length >= 4 && combined.includes(w));
  });

  const target = matched || (unrecorded.length === 1 ? unrecorded[0] : null);
  if (!target) return null;

  return {
    occurrenceId: target.id,
    medicationName: target.medicationName,
    doseQuantity: target.doseQuantity,
    doseUnit: target.doseUnit,
    strengthValue: target.strengthValue,
    strengthUnit: target.strengthUnit,
    scheduledFor: typeof target.scheduledFor === 'string' ? target.scheduledFor : target.scheduledFor.toISOString(),
    dueAt: typeof target.dueAt === 'string' ? target.dueAt : target.dueAt.toISOString(),
    status: target.status,
  };
}

export function suggestedRepliesFor(locale: 'en' | 'fil'): string[] {
  return locale === 'fil'
    ? ['Ano ang susunod na gamot?', 'Buod ng araw na ito', 'Tulong sa reseta']
    : ["What's due next?", "Today's summary", 'Help with prescription'];
}

export async function queryGeminiAssistant(params: AssistantQueryParams): Promise<AssistantQueryResponse> {
  const patientName = params.patient.displayName;
  const caregiverName = params.caregiver.displayName;
  const locale = params.locale;
  const suggestedQuickReplies = suggestedRepliesFor(locale);

  // 1. Safety Guardrail Pre-Check (Defense in depth)
  const safetyDecline = checkMedicalSafetyInvariants(params.query, patientName, locale);
  if (safetyDecline) {
    return {
      answer: safetyDecline,
      source: 'local_rules',
      model: 'safety_guardrail',
      actionableDose: null,
      suggestedQuickReplies,
    };
  }

  const apiKey = params.apiKey || process.env.GEMINI_API_KEY || '';
  const fetchImpl = params.fetchFn || globalThis.fetch;

  // 2. Deterministic Fallback if API key missing
  if (!apiKey) {
    const fallbackAnswer = locale === 'fil'
      ? `Kasalukuyang hindi maabot ang aking serbisyo, ngunit maaari mong suriin at itala ang mga nakaiskedyul na gamot ni ${patientName} sa Today tab.`
      : `I'm having trouble connecting to my AI care service right now, but you can always review and record ${patientName}'s scheduled medicines in the Today tab.`;

    return {
      answer: fallbackAnswer,
      source: 'fallback',
      model: 'fallback',
      actionableDose: findActionableDose(params.timeline, params.query, fallbackAnswer),
      suggestedQuickReplies,
    };
  }

  // 3. Construct Gemini REST payload
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const context = buildAssistantContext(params);
  const systemInstructionText = buildSystemInstruction(caregiverName, patientName);
  const userPrompt = `Locale: ${locale}\nContext:\n${JSON.stringify(context, null, 2)}\n\nCaregiver Question: ${params.query}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstructionText }],
    },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 300,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const textPayload = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!textPayload) {
      throw new Error('Gemini API returned empty candidate text');
    }

    return {
      answer: textPayload,
      source: 'gemini',
      model: 'gemini-2.5-flash',
      actionableDose: findActionableDose(params.timeline, params.query, textPayload),
      suggestedQuickReplies,
    };
  } catch (_err) {
    const fallbackAnswer = locale === 'fil'
      ? `Kasalukuyang hindi maabot ang aking serbisyo, ngunit maaari mong suriin at itala ang mga nakaiskedyul na gamot ni ${patientName} sa Today tab.`
      : `I'm having trouble connecting to my AI care service right now, but you can always review and record ${patientName}'s scheduled medicines in the Today tab.`;

    return {
      answer: fallbackAnswer,
      source: 'fallback',
      model: 'fallback',
      actionableDose: findActionableDose(params.timeline, params.query, fallbackAnswer),
      suggestedQuickReplies,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
