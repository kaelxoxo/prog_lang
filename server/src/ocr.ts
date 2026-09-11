import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createWorker, OEM, PSM } from 'tesseract.js';

export type PhotoSourceKind = 'label_photo' | 'timetable_photo';

export type MedicationOcrDraft = {
  confidence: number;
  displayName: string;
  genericName?: string;
  brandName?: string;
  doseQuantity: number | null;
  doseUnit: string;
  exactTimes: string[];
  medicineForm: string;
  originalInstructions: string;
  rawText: string;
  route: string;
  sourceKind: PhotoSourceKind;
  strengthUnit: string;
  strengthValue: number | null;
  warnings: string[];
  suggestedScheduleKind?: 'exact' | 'interval' | 'meal';
  detectedMeals?: Array<'breakfast' | 'lunch' | 'dinner'>;
  mealRelation?: 'before' | 'after';
  intervalHours?: number | null;
  timingClarification?: string | null;
  isAsNeeded?: boolean;
};

const NAME_NOISE = /\b(take|daily|morning|evening|breakfast|lunch|dinner|instruction|instructions|patient|doctor|physician|consultant|dr|md|prescription|almusal|tanghalian|hapunan|bago|pagkatapos|uminom|signature|license|lic|prc|ptr|s2|clinic|hospital|center|infirmary|medical|name|age|sex|gender|date|address|contact|tel|phone|sig)\b/i;
const NON_MEDICINE_BANNER = /\b(synthetic test label|for demo only|not a real medicine)\b/i;
const STRENGTH_ONLY_LINE = /^\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml)\b(?:\s+(?:tablets?|capsules?|tableta|kapsula|tabs?|caps?))?$/i;
const DISPENSE_OR_FORM_LINE = /^(?:(?:dispense|qty|quantity|total|bilang|mitte|mitt|d\.t\.d)\b|#\s*\d+|#?\s*\d*\s*(?:tablets?|capsules?|tableta|kapsula|tabs?|caps?)$)/i;

function normalizedTime(hours: number, minutes: number, meridiem?: string) {
  let normalizedHours = hours;
  if (meridiem) {
    normalizedHours %= 12;
    if (meridiem.replace(/\./g, '').toLowerCase() === 'pm') normalizedHours += 12;
  }
  return `${String(normalizedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function explicitTimes(text: string) {
  const times = new Set<string>();
  const clockPattern = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
  const meridiemPattern = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/gi;

  for (const match of text.matchAll(clockPattern)) {
    times.add(normalizedTime(Number(match[1]), Number(match[2])));
  }
  for (const match of text.matchAll(meridiemPattern)) {
    times.add(normalizedTime(Number(match[1]), Number(match[2] || 0), match[3]));
  }
  return [...times].sort();
}

function parseFractionOrNumber(str: string): number | null {
  const trimmed = str.trim().toLowerCase();
  if (trimmed === 'quarter' || trimmed === 'sangkapat') return 0.25;
  if (trimmed === 'half' || trimmed === 'kalahati' || trimmed === 'kalahating' || trimmed === 'ss' || trimmed === 'semis') return 0.5;
  if (trimmed === 'three quarters' || trimmed === 'tatlong sangkapat') return 0.75;
  if (trimmed === 'one' || trimmed === 'isa' || trimmed === 'isang' || trimmed === 'i') return 1;
  if (trimmed === 'two' || trimmed === 'dalawa' || trimmed === 'dalawang' || trimmed === 'ii') return 2;
  if (trimmed === 'three' || trimmed === 'tatlo' || trimmed === 'tatlong' || trimmed === 'iii') return 3;
  if (trimmed === 'four' || trimmed === 'apat' || trimmed === 'apat na' || trimmed === 'iv') return 4;
  if (trimmed === 'five' || trimmed === 'lima' || trimmed === 'limang' || trimmed === 'v') return 5;

  const unicodeMixed = trimmed.match(/^(\d+)?\s*([½¼¾⅓⅔])$/);
  if (unicodeMixed) {
    const whole = unicodeMixed[1] ? Number(unicodeMixed[1]) : 0;
    const char = unicodeMixed[2];
    const frac = char === '½' ? 0.5 : char === '¼' ? 0.25 : char === '¾' ? 0.75 : char === '⅓' ? 1 / 3 : char === '⅔' ? 2 / 3 : 0;
    const total = whole + frac;
    return total > 0 ? total : null;
  }

  const range = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:-|to|hanggang)\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const minVal = Number(range[1]);
    if (Number.isFinite(minVal) && minVal > 0) return minVal;
  }

  const mixed = trimmed.match(/^(\d+)\s*(?:and\s+|\-|\s+)\s*(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den > 0) return whole + num / den;
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den > 0) return num / den;
  }

  const num = Number(trimmed);
  return Number.isFinite(num) && num > 0 ? num : null;
}

const DOSE_AMOUNT_PATTERN = String.raw`(?:\d+(?:\.\d+)?\s*(?:-|to|hanggang)\s*\d+(?:\.\d+)?|\d+\s*(?:and\s+|\-|\s+)\d+\/\d+|\d+\s*[½¼¾⅓⅔]|\d+\/\d+|\d+(?:\.\d+)?|[½¼¾⅓⅔]|quarter|sangkapat|half|kalahati|kalahating|semis|ss|one|two|three|four|five|isa|dalawa|tatlo|apat|lima|isang|dalawang|tatlong|apat na|limang|iii|ii|iv|i\b)`;
const DOSE_UNIT_PATTERN = String.raw`(?:tablets?|tableta|tabs?|capsules?|kapsula|caps?|ml|drops?|patak|puffs?)`;

const EXPLICIT_DOSE_PATTERN = new RegExp(
  String.raw`(?:\btake\b|\buminom(?:\s+ng)?\b|\binumin(?:\s+ang)?\b|\binstill\b|\bapply\b|\buse\b|\bsig(?:\s*[:\.]|\s+))\s*(${DOSE_AMOUNT_PATTERN})(?:\s+na)?\s*(${DOSE_UNIT_PATTERN})\b`,
  'i',
);
const EXPLICIT_REVERSE_DOSE_PATTERN = new RegExp(
  String.raw`(?:\btake\b|\buminom(?:\s+ng)?\b|\binumin(?:\s+ang)?\b|\binstill\b|\bapply\b|\buse\b|\bsig(?:\s*[:\.]|\s+))\s*(${DOSE_UNIT_PATTERN})\s*(${DOSE_AMOUNT_PATTERN})\b`,
  'i',
);
const GENERIC_DOSE_PATTERN = new RegExp(
  String.raw`\b(${DOSE_AMOUNT_PATTERN})(?:\s+na)?\s*(${DOSE_UNIT_PATTERN})\b`,
  'i',
);
const GENERIC_REVERSE_DOSE_PATTERN = new RegExp(
  String.raw`\b(${DOSE_UNIT_PATTERN})\s*(${DOSE_AMOUNT_PATTERN})\b`,
  'i',
);
const FORM_FALLBACK_PATTERN = /\b(tablets?|tableta|tabs?|capsules?|kapsula|caps?|ml|drops?|patak|puffs?)\b/i;
const DISPENSE_LINE_PATTERN = /\b(dispense|qty|quantity|total|bilang|mitte|mitt|d\.t\.d)\b/i;

function extractDoseAndUnit(text: string): { doseQuantity: number | null; doseUnit: string; defaultedFromDispense?: boolean } {
  // 1. Explicit intake instructions (e.g. "Take 1 tab", "Sig: 1 tab", "Sig: 1-2 caps")
  const explicitMatch = text.match(EXPLICIT_DOSE_PATTERN);
  if (explicitMatch && explicitMatch[1] && explicitMatch[2]) {
    return {
      doseQuantity: parseFractionOrNumber(explicitMatch[1]),
      doseUnit: normalizeDoseUnit(explicitMatch[2]),
    };
  }

  // 1b. Reverse explicit instructions (e.g. "Sig: Tab 1", "Sig: Cap i", "Sig: Tab ii")
  const reverseExplicit = text.match(EXPLICIT_REVERSE_DOSE_PATTERN);
  if (reverseExplicit && reverseExplicit[1] && reverseExplicit[2]) {
    return {
      doseQuantity: parseFractionOrNumber(reverseExplicit[2]),
      doseUnit: normalizeDoseUnit(reverseExplicit[1]),
    };
  }

  // 2. Scan lines that are not package/dispense quantities
  const lines = text.split('\n');
  for (const line of lines) {
    if (DISPENSE_LINE_PATTERN.test(line) || /^\s*#\s*\d+/i.test(line)) {
      continue;
    }
    const lineMatch = line.match(GENERIC_DOSE_PATTERN);
    if (lineMatch && lineMatch[1] && lineMatch[2]) {
      const parsed = parseFractionOrNumber(lineMatch[1]);
      const unit = normalizeDoseUnit(lineMatch[2]);
      if (parsed !== null && (unit === 'tablet' || unit === 'capsule') && parsed > 10) {
        return { doseQuantity: 1, doseUnit: unit };
      }
      return {
        doseQuantity: parsed,
        doseUnit: unit,
      };
    }
    const reverseMatch = line.match(GENERIC_REVERSE_DOSE_PATTERN);
    if (reverseMatch && reverseMatch[1] && reverseMatch[2]) {
      return {
        doseQuantity: parseFractionOrNumber(reverseMatch[2]),
        doseUnit: normalizeDoseUnit(reverseMatch[1]),
      };
    }
  }

  // 3. Fallback: if only dispense lines are present (e.g. Dispense: 60 tablets or #30 tablets),
  // NEVER use 30 or 60 as a single dose! Default safely to 1 tablet/capsule.
  const formFallback = text.match(FORM_FALLBACK_PATTERN);
  const detectedUnit = formFallback && formFallback[1] ? normalizeDoseUnit(formFallback[1]) : 'tablet';
  const hasDispense = lines.some((l) => DISPENSE_LINE_PATTERN.test(l) || /^\s*#\s*\d+/i.test(l));

  if (hasDispense) {
    return {
      doseQuantity: 1,
      doseUnit: detectedUnit,
      defaultedFromDispense: true,
    };
  }

  return {
    doseQuantity: null,
    doseUnit: detectedUnit,
  };
}

function normalizeDoseUnit(unit?: string): string {
  if (!unit) return 'tablet';
  const lower = unit.toLowerCase().trim();
  if (/^tableta?s?$/i.test(lower) || lower === 'tab' || lower === 'tabs') return 'tablet';
  if (/^caps?ules?$/i.test(lower) || /^kapsula?$/i.test(lower) || lower === 'cap' || lower === 'caps') return 'capsule';
  if (lower === 'ml') return 'ml';
  if (/^drops?$/i.test(lower) || /^patak$/i.test(lower)) return 'drops';
  if (/^puffs?$/i.test(lower)) return 'puff';
  return lower.replace(/s$/, '');
}

function detectRoute(text: string): string {
  if (/\b(by mouth|orally|oral|uminom|inumin|sa bibig|po|per\s+os)\b/i.test(text) || /(?:^|[\s,;])p\.o\.(?:[\s,;]|$)/i.test(text)) return 'by mouth';
  if (/\b(topical|apply|pahid|ipahid)\b/i.test(text)) return 'topical';
  if (/\b(sublingual|under the tongue|sa ilalim ng dila)\b/i.test(text)) return 'sublingual';
  if (/\b(inhaled|inhalation|singhutin|langhapin|puff)\b/i.test(text)) return 'inhaled';
  if (/\b(eye drops|ear drops|patak sa mata|patak sa tainga)\b/i.test(text)) return 'drops';
  if (/\b(injection|subcutaneous|intramuscular|turok)\b/i.test(text)) return 'injection';
  return '';
}

export function splitPrescriptionBlocks(rawText: string): string[] {
  const text = rawText.replaceAll('\r', '').trim();
  if (!text) return [];

  // Match items indicated by numbers/letters:
  // 1., 1), (1), [1], 1 - , 1:
  // A., A), (A), [A]
  // I., I), (I), [I], II., III.
  // Optional prefix: "Item 1.", "Item #1", "Rx 1."
  // Bullets: •, -, *
  // OCR dropped period: single digit 1-9 followed by space and drug name (not a unit, noise word, or number)
  const itemPattern = /(?:^|\n)\s*(?:(?:(?:item|rx)\s*[:\.]?\s*)?(?:(?:[1-9]\d?|[A-Z]|(?:[IVXLCDM]+))[\.\)\:\-]\s+|(?:\([1-9]\d?\)|\([A-Z]\)|\((?:[IVXLCDM]+)\)|\[[1-9]\d?\]|\[[A-Z]\]|\[(?:[IVXLCDM]+)\])\s*)|[-•*–—\u2022]\s+|(?=[1-9]\s+(?![0-9]|mg\b|mcg\b|g\b|ml\b|tabs?\b|caps?\b|tablets?\b|capsules?\b|tableta\b|kapsula\b|drops?\b|patak\b|puffs?\b|times\b|beses\b|hours?\b|hrs?\b|oras\b|days?\b|araw\b|x\b|take\b|sig\b|dispense\b|qty\b|total\b|bago\b|pagkatapos\b)[A-Za-z]))/g;

  const itemMatches = [...text.matchAll(itemPattern)];

  if (itemMatches.length >= 2) {
    const blocks: string[] = [];
    for (let i = 0; i < itemMatches.length; i++) {
      const start = itemMatches[i].index! + (itemMatches[i][0].startsWith('\n') ? 1 : 0);
      const end = i + 1 < itemMatches.length ? itemMatches[i + 1].index! : text.length;
      const chunk = text.slice(start, end).trim();
      if (chunk) blocks.push(chunk);
    }
    if (blocks.length > 0) return blocks;
  }

  // Match multiple distinct Rx headers
  const rxPattern = /(?:^|\n)\s*Rx\s*[:\.]?\s+/gi;
  const rxMatches = [...text.matchAll(rxPattern)];
  if (rxMatches.length >= 2) {
    const blocks: string[] = [];
    for (let i = 0; i < rxMatches.length; i++) {
      const start = rxMatches[i].index! + (rxMatches[i][0].startsWith('\n') ? 1 : 0);
      const end = i + 1 < rxMatches.length ? rxMatches[i + 1].index! : text.length;
      const chunk = text.slice(start, end).trim();
      if (chunk) blocks.push(chunk);
    }
    if (blocks.length > 0) return blocks;
  }

  const doubleNewlineBlocks = text
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (doubleNewlineBlocks.length >= 2) {
    const medLikeBlocks = doubleNewlineBlocks.filter((b) =>
      /\b(\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml)|take|tablet|capsule|tableta|kapsula|tab)\b/i.test(b),
    );
    if (medLikeBlocks.length >= 2) {
      return doubleNewlineBlocks;
    }
  }

  return [text];
}

export function medicationDraftFromText(
  rawText: string,
  sourceKind: PhotoSourceKind,
  confidence = 0,
): MedicationOcrDraft {
  const text = rawText.replaceAll('\r', '').trim();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  let candidateName = '';
  for (const rawLine of lines) {
    let stripped = rawLine.replace(/^[\s\-•*–—\u2022]+/g, '').trim();
    while (/^(?:Rx\s*[:\.]?|#\s*\d+[\.\)\:\-]?|item\s*#?\s*\d+[\.\)\:\-]?|\(\d+\)[\.\)\:\-]?|\[\d+\][\.\)\:\-]?|\d+[\.\)\:\-]?|\([A-Z]\)[\.\)\:\-]?|\[[A-Z]\][\.\)\:\-]?|[A-Z][\.\)\:\-]|(?:[IVXLCDM]+)[\.\)\:\-])\s*/i.test(stripped)) {
      stripped = stripped.replace(/^(?:Rx\s*[:\.]?|#\s*\d+[\.\)\:\-]?|item\s*#?\s*\d+[\.\)\:\-]?|\(\d+\)[\.\)\:\-]?|\[\d+\][\.\)\:\-]?|\d+[\.\)\:\-]?|\([A-Z]\)[\.\)\:\-]?|\[[A-Z]\][\.\)\:\-]?|[A-Z][\.\)\:\-]|(?:[IVXLCDM]+)[\.\)\:\-])\s*/i, '').trim();
    }
    stripped = stripped.replace(/^[:\.\-\s]+/g, '').trim();
    if (
      /[a-z]/i.test(stripped)
      && !DISPENSE_OR_FORM_LINE.test(stripped)
      && !NAME_NOISE.test(stripped)
      && !NON_MEDICINE_BANNER.test(stripped)
      && !STRENGTH_ONLY_LINE.test(stripped)
    ) {
      const nameWithoutTrailingStrength = stripped
        .replace(/(?:\s+|\b)(?:\d+(?:\.\d+)?\s*)?(?:mcg|mg|g|ml)\b(?:\s+(?:tablets?|capsules?|tableta|kapsula|tabs?|caps?))?.*$/i, '')
        .replace(/(?<=[a-zA-Z])\s*\d+(?:\.\d+)?(?:\s+(?:tablets?|capsules?|tableta|kapsula|tabs?|caps?))?.*$/i, '')
        .trim();
      candidateName = nameWithoutTrailingStrength || stripped;
      break;
    }
  }

  let genericName: string | undefined;
  let brandName: string | undefined;
  const parenMatch = candidateName.match(/^([^(]+?)\s*\(([^)]+)\)(?:\s*(?:mcg|mg|g|ml|tablets?|capsules?|tabs?|caps?|tableta|kapsula|\d+))*$/i)
    || candidateName.match(/^([^[]+?)\s*\[([^\]]+)\](?:\s*(?:mcg|mg|g|ml|tablets?|capsules?|tabs?|caps?|tableta|kapsula|\d+))*$/i)
    || candidateName.match(/^([^\/]+?)\s*\/\s*([^\/]+?)(?:\s*(?:mcg|mg|g|ml|tablets?|capsules?|tabs?|caps?|tableta|kapsula|\d+))*$/i);
  if (parenMatch) {
    genericName = parenMatch[1].trim();
    brandName = parenMatch[2].trim();
  }

  const strength = text.match(/\b(\d+(?:\.\d+)?)\s*(mcg|mg|g|ml)\b/i);

  const { doseQuantity, doseUnit, defaultedFromDispense } = extractDoseAndUnit(text);
  const medicineForm = doseUnit;

  const times = explicitTimes(text);
  const route = detectRoute(text);
  const warnings = [
    'OCR text can be wrong. Check every field against the synthetic source image.',
  ];

  const hasBreakfast = /\b(breakfast|almusal|agahan|umaga)\b/i.test(text);
  const hasLunch = /\b(lunch|tanghalian|tanghali)\b/i.test(text);
  const hasDinner = /\b(dinner|supper|hapunan|gabi)\b/i.test(text);
  const hasGeneralMeal = /\b(meals?|pagkain|kumain|food)\b/i.test(text) || /(?:^|[\s,;])(?:pc|p\.c\.|ac|a\.c\.)(?:[\s,;]|$)/i.test(text);

  const isFourTimes = /\b(four times|4\s*times|4x|qid|apat\s+na\s+beses)\b/i.test(text) || /(?:^|[\s,;])q\.i\.d\.(?:[\s,;]|$)/i.test(text);
  const isThreeTimes = /\b(three times|3\s*times|3x|tid|tatlong\s+beses)\b/i.test(text) || /(?:^|[\s,;])t\.i\.d\.(?:[\s,;]|$)/i.test(text);
  const isTwiceDaily = /\b(twice|2\s*times|2x|bid|dalawang\s+beses)\b/i.test(text) || /(?:^|[\s,;])b\.i\.d\.(?:[\s,;]|$)/i.test(text);
  const isOnceDaily = /\b(once|1\s*time|1x|od|qd|isang\s+beses)\b/i.test(text) || /(?:^|[\s,;])(?:o\.d\.|q\.d\.)(?:[\s,;]|$)/i.test(text);

  const isBefore = /\b(before|bago(?:\s+mag)?|ac|ante\s*cibum)\b/i.test(text) || /(?:^|[\s,;])a\.c\.(?:[\s,;]|$)/i.test(text);
  const isAfter = /\b(after|pagkatapos(?:\s+ng|\s+mag)?|kasabay(?:\s+ng)?|with|pc|post\s*cibum)\b/i.test(text) || /(?:^|[\s,;])p\.c\.(?:[\s,;]|$)/i.test(text);
  const mealRelation: 'before' | 'after' = isBefore ? 'before' : 'after';

  let detectedMeals: Array<'breakfast' | 'lunch' | 'dinner'> | undefined;
  if (hasBreakfast || hasLunch || hasDinner) {
    detectedMeals = [];
    if (hasBreakfast) detectedMeals.push('breakfast');
    if (hasLunch) detectedMeals.push('lunch');
    if (hasDinner) detectedMeals.push('dinner');
  } else if (hasGeneralMeal || isFourTimes || isThreeTimes || isTwiceDaily || isOnceDaily) {
    if (isFourTimes) {
      detectedMeals = ['breakfast', 'lunch', 'dinner'];
    } else if (isThreeTimes) {
      detectedMeals = ['breakfast', 'lunch', 'dinner'];
    } else if (isTwiceDaily) {
      detectedMeals = ['breakfast', 'dinner'];
    } else if (isOnceDaily) {
      detectedMeals = ['breakfast'];
    } else {
      detectedMeals = ['breakfast', 'lunch', 'dinner'];
    }
  }

  const intervalMatch = text.match(/(?:every|tuwing\s+ika-|tuwing|bawat|q)\s*(\d{1,2})(?:\s*(?:-|to|hanggang)\s*\d{1,2})?\s*(?:hours?|hrs?|oras|h\b)/i);
  const intervalHours = intervalMatch && Number(intervalMatch[1]) >= 1 && Number(intervalMatch[1]) <= 24
    ? Number(intervalMatch[1])
    : null;

  const isBedtime = /\b(bedtime|bago matulog|sa pagtulog|hs\b)\b/i.test(text);
  const isAsNeeded = /\b(as needed|prn|kung kailangan|kapag kailangan|kung may lagnat|kung may sakit|kung masakit|kapag nilalagnat)\b/i.test(text) || /(?:^|[\s,;])p\.r\.n\.(?:[\s,;]|$)/i.test(text);

  let suggestedScheduleKind: 'exact' | 'interval' | 'meal' | undefined;
  let timingClarification: string | null = null;

  if (times.length > 0) {
    suggestedScheduleKind = 'exact';
  } else if (intervalHours) {
    suggestedScheduleKind = 'interval';
    timingClarification = `Detected interval: every ${intervalHours} hours. Recommended starting time provided.`;
  } else if (detectedMeals && detectedMeals.length > 0) {
    suggestedScheduleKind = 'meal';
    const mealsDescription = detectedMeals.join(', ');
    const relationWord = mealRelation === 'before' ? 'before' : 'after';
    timingClarification = `Detected '${relationWord} ${mealsDescription}'. Recommended window provided. You can keep this meal-based timing or clarify with exact clock times.`;
  } else if (isBedtime) {
    suggestedScheduleKind = 'meal';
    detectedMeals = ['dinner'];
    timingClarification = `Detected bedtime (HS / bago matulog) instruction. Recommended dinner/night window provided. You can clarify to a fixed clock time (e.g. 21:00) or keep dinner/bedtime.`;
  }

  if (defaultedFromDispense) {
    warnings.push('Dose quantity was not explicitly specified (only total dispense count was found); defaulted to 1. Check and verify dose.');
  }

  if (isAsNeeded) {
    warnings.push('As-needed (PRN) instruction detected: schedule reminders are optional.');
  }

  if (!times.length && suggestedScheduleKind !== 'meal' && suggestedScheduleKind !== 'interval') {
    warnings.push('No explicit clock time was found. Add and review the schedule manually.');
  }
  if (!strength) warnings.push('Strength was not recognized. Leave it blank unless the image clearly provides it.');
  if (!candidateName) warnings.push('Medicine name was not recognized. Enter it manually.');

  return {
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    displayName: candidateName.slice(0, 120),
    genericName,
    brandName,
    doseQuantity,
    doseUnit,
    exactTimes: times,
    medicineForm,
    originalInstructions: text,
    rawText: text,
    route,
    sourceKind,
    strengthUnit: strength?.[2]?.toLowerCase() || '',
    strengthValue: strength ? Number(strength[1]) : null,
    warnings,
    suggestedScheduleKind,
    detectedMeals,
    mealRelation,
    intervalHours,
    timingClarification,
    isAsNeeded,
  };
}

export function medicationDraftsFromText(
  rawText: string,
  sourceKind: PhotoSourceKind,
  confidence = 0,
): MedicationOcrDraft[] {
  const blocks = splitPrescriptionBlocks(rawText);
  if (blocks.length <= 1) {
    return [medicationDraftFromText(rawText, sourceKind, confidence)];
  }

  const drafts = blocks
    .map((block) => medicationDraftFromText(block, sourceKind, confidence))
    .filter((draft) => draft.displayName && !NAME_NOISE.test(draft.displayName) && (draft.strengthValue !== null || draft.doseQuantity !== null || draft.suggestedScheduleKind !== undefined || draft.exactTimes.length > 0 || draft.isAsNeeded));

  return drafts.length > 0
    ? drafts
    : [medicationDraftFromText(rawText, sourceKind, confidence)];
}

export type RecognizeMedicationResult = MedicationOcrDraft & {
  drafts: MedicationOcrDraft[];
};

export async function recognizeMedicationImage(
  image: Buffer,
  sourceKind: PhotoSourceKind,
): Promise<RecognizeMedicationResult> {
  const cachePath = resolve(process.cwd(), '.cache', 'tesseract');
  await mkdir(cachePath, { recursive: true });
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath });

  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: PSM.AUTO,
    });
    const result = await worker.recognize(image);
    const drafts = medicationDraftsFromText(result.data.text, sourceKind, result.data.confidence);
    const primary = drafts[0];
    return {
      ...primary,
      drafts,
    };
  } finally {
    await worker.terminate();
  }
}

