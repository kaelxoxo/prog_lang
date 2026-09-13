import {
  type AssistantActionableDose,
  type AssistantDoseContext,
  type AssistantLocale,
  type LocalEvaluationContext,
  type LocalEvaluationResult,
  toActionableDose,
} from './types';

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
    ? ['Ano ang susunod na gamot?', 'Buod ng araw na ito', 'Tulong sa reseta']
    : ["What's due next?", "Today's summary", 'Help with prescription'];
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
  /add (a )?(new )?medicine/i,
  /how to add/i,
  /new prescription/i,
  /scan prescription/i,
  /\bprescription\b/i,
  /tulong sa reseta/i,
  /paano magdagdag/i,
  /magdagdag ng gamot/i,
  /bagong reseta/i,
  /\breseta\b/i,
];

export function evaluateLocalQuery(context: LocalEvaluationContext): LocalEvaluationResult {
  const { query, locale, patient, medications, timeline, now } = context;
  const trimmed = query.trim();
  const patientName = patient?.displayName || (locale === 'fil' ? 'ang pasyente' : 'the patient');

  // 1. Critical Medical Safety Invariants (0ms enforcement)
  const isDiagnosisQuery = DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(trimmed));
  const isDosageQuery = DOSAGE_MODIFICATION_PATTERNS.some((pattern) => pattern.test(trimmed));

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

  if (isStatusQuery || (matchedDose && (queryLower.includes('record') || queryLower.includes('tala') || queryLower.includes('inom')))) {
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
