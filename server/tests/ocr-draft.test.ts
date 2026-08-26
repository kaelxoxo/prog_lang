import test from 'node:test';
import assert from 'node:assert/strict';

import { medicationDraftFromText } from '../src/ocr';

test('OCR drafts preserve source text and suggest only explicit schedule times', () => {
  const rawText = `Amlodipine\n5 mg tablet\nTake 1 tablet by mouth at 8:00 AM and 20:00`;
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
