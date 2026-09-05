import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createWorker, OEM, PSM } from 'tesseract.js';

export type PhotoSourceKind = 'label_photo' | 'timetable_photo';

export type MedicationOcrDraft = {
  confidence: number;
  displayName: string;
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
};

const NAME_NOISE = /\b(take|daily|morning|evening|breakfast|lunch|dinner|instruction|patient|doctor|prescription)\b/i;
const NON_MEDICINE_BANNER = /\b(synthetic test label|for demo only|not a real medicine)\b/i;
const STRENGTH_ONLY_LINE = /^\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml)(?:\s+(?:tablets?|capsules?))?$/i;

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

export function medicationDraftFromText(
  rawText: string,
  sourceKind: PhotoSourceKind,
  confidence = 0,
): MedicationOcrDraft {
  const text = rawText.replaceAll('\r', '').trim();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const candidateName = lines.find((line) => (
    /[a-z]/i.test(line)
    && !NAME_NOISE.test(line)
    && !NON_MEDICINE_BANNER.test(line)
    && !STRENGTH_ONLY_LINE.test(line)
  )) || '';
  const strength = text.match(/\b(\d+(?:\.\d+)?)\s*(mcg|mg|g|ml)\b/i);
  const dose = text.match(/\btake\s+(\d+(?:\.\d+)?)\s*(tablet|tablets|capsule|capsules|ml)\b/i);
  const times = explicitTimes(text);
  const medicineForm = dose?.[2]?.toLowerCase().replace(/s$/, '') || '';
  const warnings = [
    'OCR text can be wrong. Check every field against the synthetic source image.',
  ];

  if (!times.length) {
    warnings.push('No explicit clock time was found. Add and review the schedule manually.');
  }
  if (!strength) warnings.push('Strength was not recognized. Leave it blank unless the image clearly provides it.');
  if (!candidateName) warnings.push('Medicine name was not recognized. Enter it manually.');

  return {
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    displayName: candidateName.slice(0, 120),
    doseQuantity: dose ? Number(dose[1]) : null,
    doseUnit: medicineForm,
    exactTimes: times,
    medicineForm,
    originalInstructions: text,
    rawText: text,
    route: /\b(by mouth|orally)\b/i.test(text) ? 'by mouth' : '',
    sourceKind,
    strengthUnit: strength?.[2]?.toLowerCase() || '',
    strengthValue: strength ? Number(strength[1]) : null,
    warnings,
  };
}

export async function recognizeMedicationImage(
  image: Buffer,
  sourceKind: PhotoSourceKind,
) {
  const cachePath = resolve(process.cwd(), '.cache', 'tesseract');
  await mkdir(cachePath, { recursive: true });
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath });

  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: PSM.AUTO,
    });
    const result = await worker.recognize(image);
    return medicationDraftFromText(result.data.text, sourceKind, result.data.confidence);
  } finally {
    await worker.terminate();
  }
}
