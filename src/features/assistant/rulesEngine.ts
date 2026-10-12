import {
  type AssistantActionableDose,
  type AssistantDoseContext,
  type AssistantLocale,
  type AssistantMedicationDraft,
  type LocalEvaluationContext,
  type LocalEvaluationResult,
  toActionableDose,
} from './types';
import { detectOffTopicRequest, offTopicDecline } from './topicGuardrail';

function formatFriendlyTime(value: string | Date, locale: AssistantLocale): string {
  try {
    const date = typeof value === 'string' ? new Date(value) : value;
    return new Intl.DateTimeFormat(locale === 'fil' ? 'fil-PH' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Manila',
    }).format(date);
  } catch {
    return typeof value === 'string' ? value : value.toISOString();
  }
}

function formatDoseLine(dose: AssistantDoseContext): string {
  const quantity = dose.doseQuantity ?? 1;
  const unit = dose.doseUnit || 'dose';
  const strength = dose.strengthValue && dose.strengthUnit ? ` · ${dose.strengthValue} ${dose.strengthUnit}` : '';
  return `${quantity} ${unit}${strength}`;
}

function getDoseEffectiveTime(dose: AssistantDoseContext): number {
  const target = dose.status === 'snoozed' && dose.snoozedUntil ? dose.snoozedUntil : dose.dueAt;
  return new Date(target).getTime();
}

function defaultQuickReplies(locale: AssistantLocale): string[] {
  return locale === 'fil'
    ? ['+ Magdagdag ng gamot', 'Ano ang susunod na gamot?', 'Buod ng araw na ito']
    : ['+ Add medicine', "What's due next?", "Today's summary"];
}

function generateDraftId(): string {
  return 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

export function parseTimeTo24h(hour: number, minute: number, meridiemOrPeriod?: string): string {
  let h = hour;
  const m = minute;
  const period = meridiemOrPeriod ? meridiemOrPeriod.toLowerCase().trim() : '';

  if (period === 'pm' || period === 'gabi' || period === 'hapon') {
    if (h < 12) h += 12;
  } else if (period === 'am' || period === 'umaga' || period === 'madaling araw') {
    if (h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function extractExactTimes(text: string): string[] {
  const times: string[] = [];

  // Match Filipino 'alas 8 ng umaga', 'alas-8 ng gabi', 'alas 9'
  const tagalogTimeRegex = /\balas[- ]?(\d{1,2})(?::(\d{2}))?\s*(?:ng\s+(umaga|hapon|gabi|madaling\s*araw))?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = tagalogTimeRegex.exec(text)) !== null) {
    const h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    const period = match[3] || (h <= 6 || h === 12 ? 'hapon' : h >= 7 && h <= 11 ? 'umaga' : undefined);
    times.push(parseTimeTo24h(h, m, period));
  }

  // Match 'every night at 9pm', 'night at 9', 'at 9pm'
  const nightMatch = text.match(/(?:every\s+night|gabi)\s+(?:at\s+|nang\s+)?(\d{1,2})(?::(\d{2}))?\s*(pm|am)?/i);
  if (nightMatch && times.length === 0) {
    const h = parseInt(nightMatch[1], 10);
    const m = nightMatch[2] ? parseInt(nightMatch[2], 10) : 0;
    times.push(parseTimeTo24h(h, m, 'pm'));
  }

  // Standard AM/PM: e.g. '8:00 AM', '8am', '9pm'
  const standardTimeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
  while ((match = standardTimeRegex.exec(text)) !== null) {
    const h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    const t = parseTimeTo24h(h, m, match[3]);
    if (!times.includes(t)) times.push(t);
  }

  // 24h format: e.g. 08:00, 20:00, 21:00
  const militaryTimeRegex = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
  while ((match = militaryTimeRegex.exec(text)) !== null) {
    const t = `${String(parseInt(match[1], 10)).padStart(2, '0')}:${match[2]}`;
    if (!times.includes(t)) times.push(t);
  }

  times.sort();
  return times;
}

export function extractScheduleDetails(text: string): {
  kind: 'exact' | 'interval' | 'meal';
  times: string[];
  intervalHours?: number;
  mealName?: 'breakfast' | 'lunch' | 'dinner';
  mealRelation?: 'before' | 'after';
} | null {
  // 1. Interval patterns (e.g. bawat 6 na oras, every 8 hours, kada 8 oras, q6h)
  const intervalMatch =
    text.match(/(?:every|bawat|kada|tuwing)\s*(\d+)\s*(?:na\s+)?(?:hours?|oras|hrs?|h)\b/i) ||
    text.match(/\bq(\d+)h\b/i);
  if (intervalMatch) {
    const hours = parseInt(intervalMatch[1], 10);
    if (hours > 0 && hours <= 24) {
      let startTime = '08:00';
      const exactTimes = extractExactTimes(text);
      if (exactTimes.length > 0) {
        startTime = exactTimes[0];
      }
      return {
        kind: 'interval',
        times: [startTime],
        intervalHours: hours,
      };
    }
  }

  // 2. Meal patterns
  const mealMatch = text.match(
    /(?:before|bago\s+mag[- ]?|bago\s+)(breakfast|almusal)|(?:after|pagkatapos\s+ng\s+|with|kasabay\s+ng\s+)(breakfast|almusal)|(?:before|bago\s+mag[- ]?|bago\s+)(lunch|tanghalian)|(?:after|pagkatapos\s+ng\s+|with|kasabay\s+ng\s+)(lunch|tanghalian)|(?:before|bago\s+mag[- ]?|bago\s+)(dinner|hapunan)|(?:after|pagkatapos\s+ng\s+|with|kasabay\s+ng\s+)(dinner|hapunan)/i,
  );
  if (mealMatch) {
    const lower = mealMatch[0].toLowerCase();
    const isBefore = lower.includes('before') || lower.includes('bago');
    const meal =
      lower.includes('breakfast') || lower.includes('almusal')
        ? 'breakfast'
        : lower.includes('lunch') || lower.includes('tanghalian')
        ? 'lunch'
        : 'dinner';
    const time = meal === 'breakfast' ? '08:00' : meal === 'lunch' ? '12:00' : '18:00';
    return {
      kind: 'meal',
      times: [time],
      mealName: meal,
      mealRelation: isBefore ? 'before' : 'after',
    };
  }

  // 3. Exact times
  const times = extractExactTimes(text);
  if (times.length > 0) {
    return {
      kind: 'exact',
      times,
    };
  }

  return null;
}

export function extractStrengthAndDose(text: string): {
  strengthValue: number | null;
  strengthUnit: string | null;
  doseQuantity: number;
  doseUnit: string;
  medicineForm: string;
} {
  // 1. Strength (e.g. 500mg, 50 mg, 10mg, 5ml)
  let strengthValue: number | null = null;
  let strengthUnit: string | null = null;
  const strengthMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|meq)\b/i);
  if (strengthMatch) {
    strengthValue = parseFloat(strengthMatch[1]);
    strengthUnit = strengthMatch[2].toLowerCase();
  }

  // 2. Quantity & unit (e.g. 1 tablet, 2 capsules, isang tableta, 1 tab, 1 cap, 5ml, 2 drops, 2 puffs, 1 spray, 1 patch, 1 sachet)
  let doseQuantity = 1;
  let doseUnit = 'tablet';
  let medicineForm = 'tablet';

  const doseMatch = text.match(
    /\b(\d+(?:\.\d+)?|\bisa\b|\bisang\b|\bdalawa\b|\bdalawang\b|\btatlo\b|\btatlong\b|\bapat\b|\bapat\s+na\b|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bhalf\b|\bkalahati\b)\s*(tablet|tableta|tab|capsule|kapsula|cap|drop|patak|puff|spray|patch|sachet|vial|ampoule|ml)s?\b/i,
  );
  if (doseMatch) {
    const rawQty = doseMatch[1].toLowerCase().trim();
    if (rawQty === 'isa' || rawQty === 'isang' || rawQty === 'one') doseQuantity = 1;
    else if (rawQty === 'dalawa' || rawQty === 'dalawang' || rawQty === 'two') doseQuantity = 2;
    else if (rawQty === 'tatlo' || rawQty === 'tatlong' || rawQty === 'three') doseQuantity = 3;
    else if (rawQty === 'apat' || rawQty === 'apat na' || rawQty === 'four') doseQuantity = 4;
    else if (rawQty === 'half' || rawQty === 'kalahati') doseQuantity = 0.5;
    else doseQuantity = parseFloat(rawQty) || 1;

    const rawUnit = doseMatch[2].toLowerCase();
    if (rawUnit === 'tab' || rawUnit === 'tableta' || rawUnit === 'tablet') {
      doseUnit = 'tablet';
      medicineForm = 'tablet';
    } else if (rawUnit === 'cap' || rawUnit === 'kapsula' || rawUnit === 'capsule') {
      doseUnit = 'capsule';
      medicineForm = 'capsule';
    } else if (rawUnit === 'drop' || rawUnit === 'patak') {
      doseUnit = 'drops';
      medicineForm = 'drops';
    } else if (rawUnit === 'puff') {
      doseUnit = 'puffs';
      medicineForm = 'inhaler';
    } else if (rawUnit === 'spray') {
      doseUnit = 'sprays';
      medicineForm = 'spray';
    } else if (rawUnit === 'patch') {
      doseUnit = 'patch';
      medicineForm = 'patch';
    } else if (rawUnit === 'sachet') {
      doseUnit = 'sachet';
      medicineForm = 'powder';
    } else if (rawUnit === 'vial' || rawUnit === 'ampoule') {
      doseUnit = rawUnit;
      medicineForm = 'injection';
    } else if (rawUnit === 'ml') {
      doseUnit = 'ml';
      medicineForm = 'syrup';
    } else {
      doseUnit = rawUnit;
      medicineForm = rawUnit;
    }
  } else {
    // Check for form mention (e.g. tablet, capsule, syrup, drops, inhaler, spray, patch)
    const formMatch = text.match(/\b(tablet|tableta|capsule|kapsula|syrup|sirup|drops|patak|inhaler|puff|spray|patch|suspension)\b/i);
    if (formMatch) {
      const form = formMatch[1].toLowerCase();
      if (form === 'capsule' || form === 'kapsula') {
        medicineForm = 'capsule';
        doseUnit = 'capsule';
      } else if (form === 'syrup' || form === 'sirup' || form === 'suspension') {
        medicineForm = 'syrup';
        doseUnit = 'ml';
      } else if (form === 'drops' || form === 'patak') {
        medicineForm = 'drops';
        doseUnit = 'drops';
      } else if (form === 'inhaler' || form === 'puff') {
        medicineForm = 'inhaler';
        doseUnit = 'puffs';
      } else if (form === 'spray') {
        medicineForm = 'spray';
        doseUnit = 'sprays';
      } else if (form === 'patch') {
        medicineForm = 'patch';
        doseUnit = 'patch';
      } else {
        medicineForm = 'tablet';
        doseUnit = 'tablet';
      }
    }
  }

  return {
    strengthValue,
    strengthUnit,
    doseQuantity,
    doseUnit,
    medicineForm,
  };
}

export function extractMedicineName(text: string): string | null {
  const trimmed = text.trim();

  // Strip leading triggers/prefixes
  let stripped = trimmed
    .replace(
      /^(?:\+?\s*(?:add|dagdag(?:\s+ng)?|idagdag|magdagdag(?:\s+ng)?)|(?:lola|lolo|nanay|tatay|patient)?\s*(?:needs\s+to\s+take|kailangang?\s+uminom(?:\s+ng)?|should\s+take|must\s+take|has\s+to\s+take|painumin\s+ng|ipainom\s+ang|mag-?take\s+ng|inumin\s+ang|take))\s*/i,
      '',
    )
    .trim();

  if (!stripped) return null;

  // If stripped starts with dose/quantity (e.g. "500mg of", "500 mg na", "1 tablet of", "1 tab ng", "2 capsules of")
  const leadingDoseMatch = stripped.match(
    /^(?:(?:\d+(?:\.\d+)?|\b(?:isa|isang|dalawa|dalawang|tatlo|tatlong|apat|apat\s+na|one|two|three|four)\b)\s*(?:mg|mcg|g|ml|iu|meq|tablet|capsule|tableta|kapsula|tab|cap|drop|patak|puff|spray|sachet|patch)s?)\s*(?:of|na|ng)?\s+/i,
  );
  if (leadingDoseMatch) {
    stripped = stripped.slice(leadingDoseMatch[0].length).trim();
  }

  // Find boundaries where dosage, frequency, or schedule starts
  const boundaryMatch = stripped.match(
    /(?:^|\s+)(?:(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|meq|tablet|capsule|tableta|kapsula|tab|cap|drop|patak|puff|spray|sachet|patch)s?)|(?:once|twice|thrice|\d+\s*times)\s+(?:daily|a\s+day|sa\s+isang\s+araw)|(?:every|bawat|kada|tuwing)|(?:at\s+(?:\d|night|bedtime|noon))|alas[- ]?\d|sa\s+(?:ganap\s+na\s+)?\d|nang\s+\d|sa\s+(?:gabi|umaga|tanghali|hapon)|in\s+(?:the\s+)?(?:morning|evening|afternoon|night)|(?:before|after|bago|pagkatapos)|(?:night|gabi|morning|umaga|bedtime)\b)/i,
  );

  let rawName = stripped;
  if (boundaryMatch && boundaryMatch.index !== undefined) {
    rawName = stripped.slice(0, boundaryMatch.index).trim();
  }

  rawName = rawName.replace(/\b(?:at|sa|in|ng|na|on|for)\s*$/i, '').trim();
  rawName = rawName.replace(/^[,.\s]+|[,.\s]+$/g, '');

  if (/^(?:a\s+)?(?:new\s+)?(?:medicine|medication|gamot|reseta)$/i.test(rawName)) {
    return null;
  }

  if (!rawName) return null;

  return rawName.charAt(0).toUpperCase() + rawName.slice(1);
}

export function isAddMedicineIntent(text: string): boolean {
  const trimmed = text.trim();
  if (/^\+?\s*(add\s+(a\s+)?(new\s+)?medicine|magdagdag\s+(ng\s+)?gamot|dagdag\s+(ng\s+)?gamot)$/i.test(trimmed)) {
    return true;
  }
  if (/\b(how\s+to|paano|pa'no)\b/i.test(trimmed)) {
    return false;
  }
  if (
    /\b(add|dagdag(?:\s+ng)?|idagdag|magdagdag(?:\s+ng)?)\b/i.test(trimmed) ||
    /\b(needs\s+to\s+take|kailangang?\s+uminom|should\s+take|must\s+take|has\s+to\s+take|painumin\s+ng|ipainom\s+ang)\b/i.test(trimmed) ||
    /\b(new\s+medicine|bagong\s+gamot)\b/i.test(trimmed) ||
    /^\+\s*[a-zA-Z]/i.test(trimmed)
  ) {
    return true;
  }

  // Recognize direct medicine dosage or schedule statements without explicit "add" trigger
  const dose = extractStrengthAndDose(trimmed);
  const schedule = extractScheduleDetails(trimmed);
  const name = extractMedicineName(trimmed);
  if (name && (dose.strengthValue !== null || schedule !== null)) {
    return true;
  }

  return false;
}

const DIAGNOSIS_PATTERNS = [
  /\b(diagnos|symptom|chest pain|dizzy|dizziness|nausea|fever|vomit|vomiting|shortness of breath|rash|bleeding)\b/i,
  /\b(sakit sa dibdib|nahihilo|lagnat|nagsusuka|masakit ang ulo|anong sakit|masakit ang tyan|hirap huminga)\b/i,
];

const DOSAGE_MODIFICATION_PATTERNS = [
  /\b(increase|decrease|double|triple|reduce|stop|discontinue|skip|change|adjust)\b.*?\b(dose|dosage|medicine|medication|tablet|pill|prescription)\b/i,
  /\b(dose|dosage|medicine|medication|tablet|pill)\b.*?\b(increase|decrease|double|triple|reduce|stop|discontinue|skip|change|adjust)\b/i,
  /\bcan i (increase|decrease|double|triple|reduce|stop|skip|change|adjust)\b/i,
  /\bshould i (increase|decrease|double|triple|reduce|stop|skip|change|adjust)\b/i,
  /\b(can|should)\s+i\s+(take|give|drink)\s+(an?\s+)?(extra|more|less|another|second|double|half|kalahati|\d+)\b/i,
  /\b(dagdagan|bawasan|itigil|ihinto|laktawan|palitan)\b.*?\b(dose|dosage|gamot|inumin|reseta)\b/i,
  /\bpwede bang (dagdagan|bawasan|itigil|doblehin|dalawa|kalahati)\b/i,
  /\b(doblehin|doble|kalahati)\s+(ang\s+)?(dose|dosage|gamot|inumin)\b/i,
];

const NEXT_DOSE_PATTERNS = [
  /what('?s| is)? (due |scheduled )?next/i,
  /next dose/i,
  /due next/i,
  /upcoming dose/i,
  /next medicine/i,
  /what should .* take next/i,
  /ano ang susunod/i,
  /susunod na (gamot|inumin)/i,
  /sunod na gamot/i,
  /susunod/i,
];

const SUMMARY_PATTERNS = [
  /today('?s)? summary/i,
  /\bsummary\b/i,
  /today('?s)? progress/i,
  /daily summary/i,
  /how is today/i,
  /buod ng araw/i,
  /\bbuod\b/i,
  /kamusta ang gamutan/i,
  /kumusta ang gamutan/i,
  /lagay ng gamot/i,
];

const STATUS_PATTERNS = [
  /did (someone|anyone|anybody) record/i,
  /who recorded/i,
  /who gave/i,
  /who administered/i,
  /has .* been (taken|recorded|given)/i,
  /was .* (taken|recorded|given)/i,
  /did .* take/i,
  /status of/i,
  /naitala na ba/i,
  /sino ang nagtala/i,
  /sinong nagtala/i,
  /nainom na ba/i,
  /sinong nagpainom/i,
  /sino nagpainom/i,
];

const PRESCRIPTION_PATTERNS = [
  /help with prescription/i,
  /how to add/i,
  /new prescription/i,
  /scan prescription/i,
  /\bprescription\b/i,
  /tulong sa reseta/i,
  /paano magdagdag/i,
  /bagong reseta/i,
  /\breseta\b/i,
];

export function evaluateLocalQuery(context: LocalEvaluationContext): LocalEvaluationResult {
  const { query, locale, patient, medications, timeline, now } = context;
  const trimmed = query.trim();
  const patientName = patient?.displayName || (locale === 'fil' ? 'ang pasyente' : 'the patient');

  // 0. Topic scope: Bantay only helps with the patient's medicines and care in Alaga.
  if (detectOffTopicRequest(trimmed)) {
    return {
      handled: true,
      answer: offTopicDecline(patientName, locale),
      actionableDose: null,
      medicationDraft: null,
      pendingDraft: context.pendingDraftState ?? null,
      expression: 'idle',
      suggestedQuickReplies: defaultQuickReplies(locale),
      source: 'local_rules',
    };
  }

  // 1. Critical Medical Safety Invariants (0ms enforcement)
  const isDiagnosisQuery = DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(trimmed));

  const isFoodOrAdministrationInquiry =
    /\b(with food|without food|before meal|after meal|before meals|after meals|with meal|with meals|empty stomach|before breakfast|after breakfast|with breakfast|before lunch|after lunch|with lunch|before dinner|after dinner|with dinner|before bed|bedtime|at night|in the morning|in the evening|with water|with juice|grapefruit|how to take|how should|when to take|when should|what time|paano inumin|paano ipainom|paano gamitin|kailan dapat|oras ng pag-inom|sa umaga|sa gabi|sa tanghali|bago kumain|pagkatapos kumain|kasabay ng pagkain|kasama ang tubig|nang may laman|walang laman)\b/i.test(
      trimmed,
    );
  const isMissedDoseInquiry =
    /\b(missed dose|missed a dose|missed her dose|missed his dose|missed her medicine|missed his medicine|nakalimutang uminom|nalimutang uminom|nakaligtaang dose|nalaktawang dose|nakalimutan|nalimutan|nakaligtaan|nalaktawan)\b/i.test(
      trimmed,
    ) || /\bmissed\b/i.test(trimmed);
  const isExplicitDosageAlteration =
    /\b(increase|decrease|double|triple|reduce|stop|discontinue|extra|more|less|half|bawasan|dagdagan|doble|doblehin|kalahati|itigil|ihinto)\b/i.test(
      trimmed,
    ) || /\b(change|adjust|palitan)\s+(ang\s+)?(dose|dosage|reseta)\b/i.test(trimmed);

  const isDosageQuery =
    !isExplicitDosageAlteration && (isFoodOrAdministrationInquiry || isMissedDoseInquiry)
      ? false
      : DOSAGE_MODIFICATION_PATTERNS.some((pattern) => pattern.test(trimmed));

  if (isDiagnosisQuery || isDosageQuery) {
    const answer = locale === 'fil'
      ? `Para sa anumang pagbabago sa gamot, dosage, o medikal na kalagayan, mangyaring sumangguni agad sa doktor o healthcare provider ni ${patientName}. Hindi po ako maaaring magbigay ng diagnosis o magbago ng niresetang gamot.`
      : `For any adjustments to medicines, dosage changes, or health concerns, please consult ${patientName}'s doctor or healthcare provider directly. I cannot diagnose conditions or modify prescribed doses.`;

    return {
      handled: true,
      answer,
      actionableDose: null,
      expression: 'idle',
      suggestedQuickReplies: defaultQuickReplies(locale),
      source: 'local_rules',
    };
  }

  // 2. Add Medicine Intent & Multi-Turn Clarification Flow
  const hasPendingDraft = Boolean(context.pendingDraftState);
  const isAddIntent = isAddMedicineIntent(trimmed);

  // Check cancellation intent when draft is pending
  const isCancelIntent = /^(?:cancel|itigil|ihinto|wag\s+na\s+lang|huwag\s+na\s+lang|ayaw\s+na|stop)$/i.test(trimmed);
  if (hasPendingDraft && isCancelIntent) {
    const answer = locale === 'fil'
      ? `Kinansela ko ang pagdagdag ng gamot para kay ${patientName}.`
      : `I cancelled adding the medicine for ${patientName}.`;

    return {
      handled: true,
      answer,
      actionableDose: null,
      medicationDraft: null,
      pendingDraft: null,
      expression: 'idle',
      suggestedQuickReplies: defaultQuickReplies(locale),
      source: 'local_rules',
    };
  }

  // If user enters another primary intent while having a pending draft, let other intent take over unless it's an answer to the clarification
  const isOtherIntent =
    NEXT_DOSE_PATTERNS.some((p) => p.test(trimmed)) ||
    SUMMARY_PATTERNS.some((p) => p.test(trimmed)) ||
    STATUS_PATTERNS.some((p) => p.test(trimmed)) ||
    PRESCRIPTION_PATTERNS.some((p) => p.test(trimmed));

  if ((hasPendingDraft && !isOtherIntent) || isAddIntent) {
    // Check role permissions: only care managers (owner or canManageMedications) can add medicines
    const canManage =
      context.canManageMedications ??
      (typeof context.patient?.canManageMedications === 'boolean'
        ? context.patient.canManageMedications
        : context.patient?.role === 'owner' || context.patient?.role === 'manager');

    if (!canManage) {
      const managerName = context.primaryCareManagerName ?? (context.patient?.primaryCareManagerName as string | undefined);
      const answer = locale === 'fil'
        ? (managerName
          ? `Tanging ang mga tagapamahala ng pangangalaga ang maaaring magdagdag ng bagong gamot para kay ${patientName}. Mangyaring makipag-ugnayan kay ${managerName}.`
          : `Tanging ang mga tagapamahala ng pangangalaga ang maaaring magdagdag ng bagong gamot para kay ${patientName}. Mangyaring makipag-ugnayan sa pangunahing tagapamahala ng pangangalaga.`)
        : (managerName
          ? `Only primary care managers can add new medicines for ${patientName}. Please coordinate with ${managerName}.`
          : `Only primary care managers can add new medicines for ${patientName}. Please coordinate with the primary care manager.`);

      return {
        handled: true,
        answer,
        actionableDose: null,
        medicationDraft: null,
        pendingDraft: null,
        expression: 'idle',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    // Prompt-only (e.g. "+ Add medicine", "Add medicine", "Magdagdag ng gamot")
    const isPromptOnly = /^\+?\s*(add\s+(a\s+)?(new\s+)?medicine|magdagdag\s+(ng\s+)?gamot|dagdag\s+(ng\s+)?gamot)$/i.test(
      trimmed,
    );
    if (isPromptOnly && !hasPendingDraft) {
      const answer = locale === 'fil'
        ? `Anong gamot ang nais mong idagdag para kay ${patientName}?`
        : `What medicine would you like to add for ${patientName}?`;

      return {
        handled: true,
        answer,
        actionableDose: null,
        medicationDraft: null,
        pendingDraft: {
          id: generateDraftId(),
          displayName: '',
          strengthValue: null,
          strengthUnit: 'mg',
          doseQuantity: 1,
          doseUnit: 'tablet',
          medicineForm: 'tablet',
          scheduleKind: 'exact',
          times: [],
          intervalHours: null,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          route: 'Oral',
        },
        expression: 'thinking',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    let draftToProcess: AssistantMedicationDraft;

    const detectedNewName = extractMedicineName(trimmed);
    const isNewMedicineSpecified = Boolean(
      detectedNewName &&
      (!hasPendingDraft || isAddIntent || (context.pendingDraftState?.displayName && detectedNewName.toLowerCase() !== context.pendingDraftState.displayName.toLowerCase()))
    );

    if (hasPendingDraft && context.pendingDraftState && !isNewMedicineSpecified) {
      const base = { ...context.pendingDraftState };
      const extractedSchedule = extractScheduleDetails(trimmed);
      const extractedDose = extractStrengthAndDose(trimmed);

      if (extractedSchedule) {
        base.scheduleKind = extractedSchedule.kind;
        base.times = extractedSchedule.times;
        base.intervalHours = extractedSchedule.intervalHours ?? null;
        base.mealName = extractedSchedule.mealName;
        base.mealRelation = extractedSchedule.mealRelation;
      }

      if (extractedDose.strengthValue !== null) {
        base.strengthValue = extractedDose.strengthValue;
        base.strengthUnit = extractedDose.strengthUnit || 'mg';
      }
      if (extractedDose.doseQuantity) {
        base.doseQuantity = extractedDose.doseQuantity;
        base.doseUnit = extractedDose.doseUnit;
        base.medicineForm = extractedDose.medicineForm;
      }

      if (!base.displayName) {
        const name = extractMedicineName(trimmed);
        if (name) base.displayName = name;
      }

      draftToProcess = base;
    } else {
      const displayName = detectedNewName || extractMedicineName(trimmed);
      if (!displayName) {
        const answer = locale === 'fil'
          ? `Anong gamot ang nais mong idagdag para kay ${patientName}?`
          : `What medicine would you like to add for ${patientName}?`;

        return {
          handled: true,
          answer,
          actionableDose: null,
          medicationDraft: null,
          pendingDraft: null,
          expression: 'idle',
          suggestedQuickReplies: defaultQuickReplies(locale),
          source: 'local_rules',
        };
      }

      const scheduleDetails = extractScheduleDetails(trimmed);
      const doseDetails = extractStrengthAndDose(trimmed);

      draftToProcess = {
        id: generateDraftId(),
        displayName,
        strengthValue: doseDetails.strengthValue,
        strengthUnit: doseDetails.strengthUnit || 'mg',
        doseQuantity: doseDetails.doseQuantity,
        doseUnit: doseDetails.doseUnit,
        medicineForm: doseDetails.medicineForm,
        scheduleKind: scheduleDetails?.kind || 'exact',
        times: scheduleDetails?.times || [],
        intervalHours: scheduleDetails?.intervalHours ?? null,
        mealName: scheduleDetails?.mealName,
        mealRelation: scheduleDetails?.mealRelation,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        route: 'Oral',
      };
    }

    // Evaluate completeness
    const hasTimes = draftToProcess.times.length > 0 || Boolean(draftToProcess.intervalHours);
    const hasStrength = draftToProcess.strengthValue !== null;

    if (!hasTimes && !hasStrength) {
      const answer = locale === 'fil'
        ? `Anong oras at dosage dapat inumin ni ${patientName} ang ${draftToProcess.displayName}?`
        : `What time and dosage should ${patientName} take for ${draftToProcess.displayName}?`;

      return {
        handled: true,
        answer,
        actionableDose: null,
        medicationDraft: null,
        pendingDraft: draftToProcess,
        expression: 'thinking',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    if (!hasTimes) {
      const strengthPart = draftToProcess.strengthValue
        ? ` ${draftToProcess.strengthValue}${draftToProcess.strengthUnit}`
        : '';
      const answer = locale === 'fil'
        ? `Anong oras dapat inumin ni ${patientName} ang ${draftToProcess.displayName}${strengthPart}?`
        : `What time should ${patientName} take ${draftToProcess.displayName}${strengthPart}?`;

      return {
        handled: true,
        answer,
        actionableDose: null,
        medicationDraft: null,
        pendingDraft: draftToProcess,
        expression: 'thinking',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    if (!hasStrength) {
      const answer = locale === 'fil'
        ? `Ano ang dosage o lakas para sa ${draftToProcess.displayName} (hal., 500mg, 1 tableta)?`
        : `What is the dosage or strength for ${draftToProcess.displayName} (e.g., 500mg, 1 tablet)?`;

      return {
        handled: true,
        answer,
        actionableDose: null,
        medicationDraft: null,
        pendingDraft: draftToProcess,
        expression: 'thinking',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    // Draft is complete! Check for duplicate in patient's active medications
    const medLower = draftToProcess.displayName.toLowerCase();
    const duplicate = medications.find((m) => {
      const name = m.displayName.toLowerCase();
      const generic = m.genericName?.toLowerCase();
      const brand = m.brandName?.toLowerCase();
      return (
        name === medLower ||
        name.includes(medLower) ||
        medLower.includes(name) ||
        generic === medLower ||
        brand === medLower
      );
    });

    if (duplicate) {
      draftToProcess.isDuplicate = true;
      draftToProcess.duplicateMedicationName = duplicate.displayName;
    }

    const answer = duplicate
      ? locale === 'fil'
        ? `Inihanda ko ang draft para sa ${draftToProcess.displayName}. Paalala: Ang ${duplicate.displayName} ay nasa listahan na ng aktibong gamot ni ${patientName}.`
        : `I prepared a draft for ${draftToProcess.displayName}. Note: ${duplicate.displayName} is already in ${patientName}'s active medicines.`
      : locale === 'fil'
      ? `Narito ang draft para sa ${draftToProcess.displayName}. Pakisuri at kumpirmahin.`
      : `Here is the draft for ${draftToProcess.displayName}. Please review and confirm.`;

    return {
      handled: true,
      answer,
      actionableDose: null,
      medicationDraft: draftToProcess,
      pendingDraft: null,
      expression: 'idle',
      suggestedQuickReplies: defaultQuickReplies(locale),
      source: 'local_rules',
    };
  }

  // 2. Next Dose Intent
  if (NEXT_DOSE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    if (timeline.length === 0) {
      const answer = locale === 'fil'
        ? `Walang nakaiskedyul na gamot si ${patientName} para sa araw na ito.`
        : `${patientName} has no medicines scheduled for today.`;
      return {
        handled: true,
        answer,
        actionableDose: null,
        expression: 'idle',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    const uncompletedDoses = timeline
      .filter((d) => d.status !== 'taken' && d.status !== 'skipped')
      .sort((a, b) => getDoseEffectiveTime(a) - getDoseEffectiveTime(b));

    if (uncompletedDoses.length === 0) {
      const answer = locale === 'fil'
        ? `Lahat ng gamot para sa araw na ito ay naitala na! Mahusay ang pag-aalaga mo kay ${patientName}.`
        : `All doses for today have already been recorded! Great job caring for ${patientName} today.`;
      return {
        handled: true,
        answer,
        actionableDose: null,
        expression: 'celebration',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    const currentTime = now.getTime();
    // Prefer upcoming dose within or after current time
    const upcomingDose = uncompletedDoses.find((d) => getDoseEffectiveTime(d) >= currentTime - 60_000);
    const targetDose = upcomingDose || uncompletedDoses[0];
    const isOverdue = getDoseEffectiveTime(targetDose) < currentTime - 60_000;
    const timeFormatted = formatFriendlyTime(targetDose.scheduledFor, locale);
    const doseDescription = formatDoseLine(targetDose);

    let answer = '';
    if (isOverdue) {
      answer = locale === 'fil'
        ? `May hindi pa naitatalang gamot si ${patientName} na ${targetDose.medicationName} (${doseDescription}) na nakaiskedyul noong ${timeFormatted} na kailangang suriin.`
        : `${patientName} has an unrecorded dose of ${targetDose.medicationName} (${doseDescription}) scheduled for ${timeFormatted} that needs review.`;
    } else {
      answer = locale === 'fil'
        ? `Ang susunod na gamot ni ${patientName} ay ${targetDose.medicationName} (${doseDescription}) sa ganap na ${timeFormatted}.`
        : `${patientName}'s next scheduled dose is ${targetDose.medicationName} (${doseDescription}) at ${timeFormatted}.`;
    }

    return {
      handled: true,
      answer,
      actionableDose: toActionableDose(targetDose),
      expression: 'idle',
      suggestedQuickReplies: defaultQuickReplies(locale),
      source: 'local_rules',
    };
  }

  // 3. Today's Summary Intent
  if (SUMMARY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    const total = timeline.length;
    if (total === 0) {
      const answer = locale === 'fil'
        ? `Walang nakaiskedyul na gamot para kay ${patientName} ngayong araw.`
        : `There are no scheduled doses for ${patientName} today.`;
      return {
        handled: true,
        answer,
        actionableDose: null,
        expression: 'idle',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    const taken = timeline.filter((d) => d.status === 'taken').length;
    const skipped = timeline.filter((d) => d.status === 'skipped').length;
    const pending = timeline.filter((d) => d.status === 'not_recorded' || d.status === 'snoozed').length;

    if (taken === total) {
      const answer = locale === 'fil'
        ? `Buod para kay ${patientName} ngayong araw: lahat ng ${total} na inumin ay naitalang nainom na! Napakahusay ng pag-aalaga.`
        : `Today's summary for ${patientName}: all ${total} scheduled doses have been taken! Excellent care today.`;
      return {
        handled: true,
        answer,
        actionableDose: null,
        expression: 'celebration',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    const answer = locale === 'fil'
      ? `Buod para kay ${patientName} ngayong araw: ${taken} sa ${total} na inumin ang naitalang nainom, ${skipped} ang nilaktawan, at ${pending} ang naghihintay ng tala.`
      : `Today's summary for ${patientName}: ${taken} of ${total} doses recorded as taken, ${skipped} skipped, and ${pending} pending review.`;

    const pendingDose = timeline.find((d) => d.status === 'not_recorded' || d.status === 'snoozed');

    return {
      handled: true,
      answer,
      actionableDose: pendingDose ? toActionableDose(pendingDose) : null,
      expression: 'idle',
      suggestedQuickReplies: defaultQuickReplies(locale),
      source: 'local_rules',
    };
  }

  // 4. Dose Status & Caregiver Attribution Intent
  const isStatusQuery = STATUS_PATTERNS.some((pattern) => pattern.test(trimmed));
  const queryLower = trimmed.toLowerCase();

  // Find medication mentioned in query
  const matchedDose = timeline.find((d) => {
    const medLower = d.medicationName.toLowerCase();
    return queryLower.includes(medLower) || medLower.split(/\s+/).some((w) => w.length >= 4 && queryLower.includes(w));
  }) || (isStatusQuery ? timeline[0] : null);

  const isRecordedOrTakenCheck = /\b(record|recorded|tala|naitala|nainom|naipainom|taken|given)\b/i.test(queryLower);
  if (!isFoodOrAdministrationInquiry && !isMissedDoseInquiry && (isStatusQuery || (matchedDose && isRecordedOrTakenCheck))) {
    if (matchedDose) {
      const actor = matchedDose.recordedByName || (locale === 'fil' ? 'isang tagapag-alaga' : 'a caregiver');
      const timeTaken = matchedDose.recordedAt ? formatFriendlyTime(matchedDose.recordedAt, locale) : formatFriendlyTime(matchedDose.scheduledFor, locale);

      if (matchedDose.status === 'taken') {
        const answer = locale === 'fil'
          ? `Oo, naitala na ang ${matchedDose.medicationName} bilang nainom ni ${actor} noong ${timeTaken}.`
          : `Yes, ${matchedDose.medicationName} was recorded as taken by ${actor} at ${timeTaken}.`;
        return {
          handled: true,
          answer,
          actionableDose: null,
          expression: 'idle',
          suggestedQuickReplies: defaultQuickReplies(locale),
          source: 'local_rules',
        };
      }

      if (matchedDose.status === 'skipped') {
        const reasonPart = matchedDose.reason
          ? (locale === 'fil' ? ` Dahilan: ${matchedDose.reason}.` : ` Reason: ${matchedDose.reason}.`)
          : '';
        const answer = locale === 'fil'
          ? `Ang ${matchedDose.medicationName} ay minarkahang nilaktawan ni ${actor} noong ${timeTaken}.${reasonPart}`
          : `${matchedDose.medicationName} was marked as skipped by ${actor} at ${timeTaken}.${reasonPart}`;
        return {
          handled: true,
          answer,
          actionableDose: null,
          expression: 'idle',
          suggestedQuickReplies: defaultQuickReplies(locale),
          source: 'local_rules',
        };
      }

      // not_recorded or snoozed
      const schedTime = formatFriendlyTime(matchedDose.scheduledFor, locale);
      const answer = locale === 'fil'
        ? `Hindi pa naitatala ang ${matchedDose.medicationName} ngayong araw. Ito ay nakaiskedyul sa ganap na ${schedTime}.`
        : `${matchedDose.medicationName} has not been recorded yet today. It is scheduled for ${schedTime}.`;
      return {
        handled: true,
        answer,
        actionableDose: toActionableDose(matchedDose),
        expression: 'idle',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }

    // If query was about a medicine in medications list not in today's timeline
    const matchedMed = medications.find((m) => {
      const medLower = m.displayName.toLowerCase();
      return queryLower.includes(medLower) || medLower.split(/\s+/).some((w) => w.length >= 4 && queryLower.includes(w));
    });

    if (matchedMed) {
      const answer = locale === 'fil'
        ? `Ang ${matchedMed.displayName} ay nasa listahan ng gamot ni ${patientName}, ngunit walang nakaiskedyul na inumin para sa araw na ito.`
        : `${matchedMed.displayName} is in ${patientName}'s medicine list, but has no scheduled doses for today.`;
      return {
        handled: true,
        answer,
        actionableDose: null,
        expression: 'idle',
        suggestedQuickReplies: defaultQuickReplies(locale),
        source: 'local_rules',
      };
    }
  }

  // 5. Prescription Guidance Intent
  if (PRESCRIPTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    const answer = locale === 'fil'
      ? `Upang magdagdag o mamahala ng reseta para kay ${patientName}, pumunta sa Medicines tab. Maaari kang magdagdag nang manu-mano o mag-scan ng label o timetable gamit ang camera.`
      : `To add or manage prescriptions for ${patientName}, go to the Medicines tab. You can add medicines manually or scan prescription labels and timetables with your camera.`;
    return {
      handled: true,
      answer,
      actionableDose: null,
      expression: 'idle',
      suggestedQuickReplies: defaultQuickReplies(locale),
      source: 'local_rules',
    };
  }

  // Fallback to Tier 2 Gemini LLM
  return { handled: false };
}
