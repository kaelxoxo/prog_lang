import test from 'node:test';
import assert from 'node:assert/strict';

import { medicationDraftFromText } from '../src/ocr';

test('OCR drafts preserve source text and suggest only explicit schedule times', () => {
  const rawText = `Amlodipine\n5 mg tablet\nTake 1 tablet by mouth at 8:00 AM and 8:00 PM`;
  const draft = medicationDraftFromText(rawText, 'label_photo', 87.4);

  assert.equal(draft.displayName, 'Amlodipine');
  assert.equal(draft.strengthValue, 5);
  assert.equal(draft.strengthUnit, 'mg');
  assert.equal(draft.doseQuantity, 1);
  assert.equal(draft.doseUnit, 'tablet');
  assert.equal(draft.route, 'by mouth');
  assert.deepEqual(draft.exactTimes, ['08:00', '20:00']);
  assert.equal(draft.rawText, rawText);
  assert.equal(draft.confidence, 87);
});

test('OCR drafts skip synthetic test banners when choosing the medicine name', () => {
  const rawText = `ALAGA SYNTHETIC TEST LABEL
Gardenia Tablets
5 mg
Take 1 tablet at 8:00 AM and 8:00 PM.
Review every OCR field before saving.
FOR DEMO ONLY - NOT A REAL MEDICINE`;
  const draft = medicationDraftFromText(rawText, 'label_photo', 94);

  assert.equal(draft.displayName, 'Gardenia Tablets');
  assert.equal(draft.strengthValue, 5);
  assert.equal(draft.strengthUnit, 'mg');
  assert.equal(draft.doseQuantity, 1);
  assert.equal(draft.doseUnit, 'tablet');
  assert.deepEqual(draft.exactTimes, ['08:00', '20:00']);
});

test('OCR drafts never turn vague frequency wording into clock times', () => {
  const draft = medicationDraftFromText(
    'Synthetic medicine\nTake one tablet three times daily after meals',
    'timetable_photo',
    60,
  );

  assert.deepEqual(draft.exactTimes, []);
  assert.ok(draft.warnings.some((warning) => warning.includes('No explicit clock time')));
  assert.equal(draft.originalInstructions, 'Synthetic medicine\nTake one tablet three times daily after meals');
});

test('OCR drafts correctly parse meridiem tokens with periods like a.m. and p.m.', () => {
  const rawText = `Synthetic Tablet\n5 mg\nTake 1 tablet at 8:00 a.m. and 8:00 p.m.`;
  const draft = medicationDraftFromText(rawText, 'label_photo', 90);

  assert.deepEqual(draft.exactTimes, ['08:00', '20:00']);
});

