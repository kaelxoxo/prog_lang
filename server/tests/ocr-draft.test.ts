import test from 'node:test';
import assert from 'node:assert/strict';

import { medicationDraftFromText, medicationDraftsFromText } from '../src/ocr';

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
  assert.equal(draft.originalInstructions, 'Synthetic medicine\nTake one tablet three times daily after meals');
});

test('OCR drafts correctly parse meridiem tokens with periods like a.m. and p.m.', () => {
  const rawText = `Synthetic Tablet\n5 mg\nTake 1 tablet at 8:00 a.m. and 8:00 p.m.`;
  const draft = medicationDraftFromText(rawText, 'label_photo', 90);

  assert.deepEqual(draft.exactTimes, ['08:00', '20:00']);
});

test('OCR extracts multi-medicine prescriptions into distinct drafts', () => {
  const prescription = `Rx
1. Amlodipine (Norvasc) 5 mg tablet
Take 1 tablet once daily after breakfast
2. Metformin 500 mg tablet
Take 1 tablet twice daily with meals
3. Losartan 50 mg tablet
Take 1/2 tablet once daily at 8:00 AM`;

  const drafts = medicationDraftsFromText(prescription, 'timetable_photo', 92);
  assert.equal(drafts.length, 3);

  // Draft 1: Amlodipine with brand name Norvasc, meal timing after breakfast
  assert.equal(drafts[0].displayName, 'Amlodipine (Norvasc)');
  assert.equal(drafts[0].genericName, 'Amlodipine');
  assert.equal(drafts[0].brandName, 'Norvasc');
  assert.equal(drafts[0].strengthValue, 5);
  assert.equal(drafts[0].strengthUnit, 'mg');
  assert.equal(drafts[0].doseQuantity, 1);
  assert.equal(drafts[0].doseUnit, 'tablet');
  assert.equal(drafts[0].suggestedScheduleKind, 'meal');
  assert.deepEqual(drafts[0].detectedMeals, ['breakfast']);
  assert.equal(drafts[0].mealRelation, 'after');
  assert.ok(drafts[0].timingClarification?.includes('after breakfast'));

  // Draft 2: Metformin with meals
  assert.equal(drafts[1].displayName, 'Metformin');
  assert.equal(drafts[1].strengthValue, 500);
  assert.equal(drafts[1].strengthUnit, 'mg');
  assert.equal(drafts[1].doseQuantity, 1);
  assert.equal(drafts[1].suggestedScheduleKind, 'meal');
  assert.equal(drafts[1].mealRelation, 'after');

  // Draft 3: Losartan fractional 1/2 tablet with exact time 08:00
  assert.equal(drafts[2].displayName, 'Losartan');
  assert.equal(drafts[2].strengthValue, 50);
  assert.equal(drafts[2].doseQuantity, 0.5);
  assert.deepEqual(drafts[2].exactTimes, ['08:00']);
  assert.equal(drafts[2].suggestedScheduleKind, 'exact');
});

test('OCR correctly parses fractional and half tablet doses to prevent accidental overdose', () => {
  const halfText = `Metoprolol 50 mg tablet\nTake 1/2 tablet daily in the morning`;
  const draftHalf = medicationDraftFromText(halfText, 'label_photo', 90);
  assert.equal(draftHalf.doseQuantity, 0.5);
  assert.equal(draftHalf.doseUnit, 'tablet');

  const wordHalfText = `Rosuvastatin 10 mg tablet\nTake half tablet at bedtime`;
  const draftWordHalf = medicationDraftFromText(wordHalfText, 'label_photo', 90);
  assert.equal(draftWordHalf.doseQuantity, 0.5);

  const mixedText = `Prednisone 5 mg tablet\nTake 1 1/2 tablets daily`;
  const draftMixed = medicationDraftFromText(mixedText, 'label_photo', 90);
  assert.equal(draftMixed.doseQuantity, 1.5);
});

test('OCR detects interval frequency such as every 8 hours (q8h) and suggests interval schedule', () => {
  const intervalText = `Paracetamol 500 mg tablet\nTake 1 tablet every 8 hours as needed for fever`;
  const draft = medicationDraftFromText(intervalText, 'label_photo', 88);
  assert.equal(draft.displayName, 'Paracetamol');
  assert.equal(draft.doseQuantity, 1);
  assert.equal(draft.intervalHours, 8);
  assert.equal(draft.suggestedScheduleKind, 'interval');
  assert.ok(draft.isAsNeeded);
  assert.ok(draft.warnings.some((w) => w.includes('As-needed (PRN)')));
});

test('OCR detects Filipino meal instructions and fractional dosing', () => {
  const filipinoText = `Losartan 50 mg tableta\nUminom ng 1/2 tableta pagkatapos mag-almusal`;
  const draft = medicationDraftFromText(filipinoText, 'label_photo', 91);
  assert.equal(draft.displayName, 'Losartan');
  assert.equal(draft.doseQuantity, 0.5);
  assert.equal(draft.doseUnit, 'tablet');
  assert.equal(draft.route, 'by mouth');
  assert.equal(draft.suggestedScheduleKind, 'meal');
  assert.deepEqual(draft.detectedMeals, ['breakfast']);
  assert.equal(draft.mealRelation, 'after');
});

test('OCR ignores doctor header and clinic metadata and strips list bullets', () => {
  const prescriptionWithHeader = `St. Luke's Medical Center
Dr. Juan Dela Cruz, MD - PRC Lic. 0098765
Patient: Lola Rosa
Date: Sept 5, 2026
Rx:
- Amlodipine [Norvasc] 5 mg tablet
Take 1 tablet once daily in the morning
• Metformin / Glucophage 500 mg tablet
Take 1 tablet 2x daily with meals`;

  const drafts = medicationDraftsFromText(prescriptionWithHeader, 'timetable_photo', 89);
  assert.equal(drafts.length, 2);

  // First draft: Amlodipine with brand Norvasc in brackets, bullet stripped
  assert.equal(drafts[0].displayName, 'Amlodipine [Norvasc]');
  assert.equal(drafts[0].genericName, 'Amlodipine');
  assert.equal(drafts[0].brandName, 'Norvasc');
  assert.equal(drafts[0].strengthValue, 5);
  assert.equal(drafts[0].doseQuantity, 1);

  // Second draft: Metformin with slash brand, bullet stripped, 2x daily meals correctly yields 2 meals not 3
  assert.equal(drafts[1].displayName, 'Metformin / Glucophage');
  assert.equal(drafts[1].genericName, 'Metformin');
  assert.equal(drafts[1].brandName, 'Glucophage');
  assert.equal(drafts[1].strengthValue, 500);
  assert.equal(drafts[1].doseQuantity, 1);
  assert.equal(drafts[1].suggestedScheduleKind, 'meal');
  assert.deepEqual(drafts[1].detectedMeals, ['breakfast', 'dinner']);
  assert.equal(drafts[1].mealRelation, 'after');
});

test('OCR handles quarter dosage and bedtime instruction correctly', () => {
  const quarterBedtime = `Digoxin 0.25 mg tablet\nTake 1/4 tablet at bedtime (bago matulog)`;
  const draft = medicationDraftFromText(quarterBedtime, 'label_photo', 85);
  assert.equal(draft.displayName, 'Digoxin');
  assert.equal(draft.strengthValue, 0.25);
  assert.equal(draft.doseQuantity, 0.25);
  assert.equal(draft.suggestedScheduleKind, 'meal');
  assert.deepEqual(draft.detectedMeals, ['dinner']);
  assert.ok(draft.timingClarification?.includes('bedtime'));
});

test('OCR prioritizes intake instructions (Sig / Take / Uminom) over dispensing quantities (#30 / Dispense)', () => {
  const textWithDispenseAndSig = `Rx: Losartan 50mg
#30 tablets
Sig: 1 tab once daily in the morning`;

  const draft = medicationDraftFromText(textWithDispenseAndSig, 'label_photo', 90);
  assert.equal(draft.displayName, 'Losartan');
  assert.equal(draft.doseQuantity, 1, 'Dose quantity must be 1 tablet from Sig, not 30 from total dispensed');
  assert.equal(draft.doseUnit, 'tablet');

  const textWithDispenseWord = `Metformin 500mg
Dispense: 60 tablets
Take 1 tablet twice daily with meals`;

  const draftMetformin = medicationDraftFromText(textWithDispenseWord, 'label_photo', 90);
  assert.equal(draftMetformin.displayName, 'Metformin');
  assert.equal(draftMetformin.doseQuantity, 1, 'Dose quantity must be 1 tablet, not 60 tablets');
  assert.equal(draftMetformin.doseUnit, 'tablet');
});

test('OCR handles range doses like 1-2 capsules and safely defaults to minimum single dose', () => {
  const rangeDoseText = `Tramadol 50mg
Take 1-2 capsules every 6 hours as needed for pain
Dispense #20 capsules`;

  const draft = medicationDraftFromText(rangeDoseText, 'label_photo', 88);
  assert.equal(draft.displayName, 'Tramadol');
  assert.equal(draft.doseQuantity, 1, 'Range dose 1-2 should yield minimum safe dose of 1');
  assert.equal(draft.doseUnit, 'capsule');
  assert.equal(draft.intervalHours, 6);
  assert.ok(draft.isAsNeeded);
});

test('OCR splits Roman numeral numbered prescriptions (I., II., III.)', () => {
  const romanPrescription = `I. Amlodipine 5mg
Take 1 tablet once daily in the morning

II. Atorvastatin 20mg
Take 1 tablet once daily at bedtime`;

  const drafts = medicationDraftsFromText(romanPrescription, 'label_photo', 92);
  assert.equal(drafts.length, 2, 'Should split into two drafts for Roman numerals I and II');
  assert.equal(drafts[0].displayName, 'Amlodipine');
  assert.equal(drafts[0].doseQuantity, 1);
  assert.equal(drafts[1].displayName, 'Atorvastatin');
  assert.equal(drafts[1].doseQuantity, 1);
});

test('OCR handles Unicode fractions and mixed fractions (½, ¼, 1½)', () => {
  const halfDraft = medicationDraftFromText('Metoprolol 50mg\nTake ½ tablet daily', 'label_photo', 90);
  assert.equal(halfDraft.doseQuantity, 0.5);

  const quarterDraft = medicationDraftFromText('Digoxin 0.25mg\nTake ¼ tablet daily', 'label_photo', 90);
  assert.equal(quarterDraft.doseQuantity, 0.25);

  const mixedDraft = medicationDraftFromText('Prednisone 5mg\nTake 1½ tablets daily', 'label_photo', 90);
  assert.equal(mixedDraft.doseQuantity, 1.5);
});

test('OCR handles Latin abbreviations with periods and PRN (P.O., B.I.D., P.C., p.r.n.)', () => {
  const text = `Metformin 500mg\n1 tab P.O. B.I.D. P.C.`;
  const draft = medicationDraftFromText(text, 'label_photo', 90);
  assert.equal(draft.displayName, 'Metformin');
  assert.equal(draft.doseQuantity, 1);
  assert.equal(draft.route, 'by mouth');
  assert.equal(draft.suggestedScheduleKind, 'meal');
  assert.deepEqual(draft.detectedMeals, ['breakfast', 'dinner']);
  assert.equal(draft.mealRelation, 'after');

  const prnText = `Salbutamol 2mg\nTake 1 tablet every 6 hours p.r.n. for cough`;
  const prnDraft = medicationDraftFromText(prnText, 'label_photo', 90);
  assert.equal(prnDraft.intervalHours, 6);
  assert.ok(prnDraft.isAsNeeded);
});

test('OCR handles Tagalog range doses and fever PRN instruction', () => {
  const text = `Paracetamol 500mg\nUminom ng 1 hanggang 2 tableta tuwing ika-4 oras kung may lagnat`;
  const draft = medicationDraftFromText(text, 'label_photo', 90);
  assert.equal(draft.displayName, 'Paracetamol');
  assert.equal(draft.doseQuantity, 1);
  assert.equal(draft.intervalHours, 4);
  assert.ok(draft.isAsNeeded);
});

test('OCR splits prescriptions with dropped period on numbered items or parenthesized numbers', () => {
  const droppedDot = `Rx
1. Amlodipine 5mg tablet
Take 1 tablet daily
2 Metformin 500mg tablet
Take 1 tablet twice daily
3. Losartan 50mg tablet
Take 1 tablet daily`;

  const drafts = medicationDraftsFromText(droppedDot, 'timetable_photo', 90);
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].displayName, 'Amlodipine');
  assert.equal(drafts[1].displayName, 'Metformin');
  assert.equal(drafts[2].displayName, 'Losartan');

  const parens = `(1) Amlodipine 5mg
Take 1 tablet daily
(2) Metformin 500mg
Take 1 tablet twice daily`;

  const parenDrafts = medicationDraftsFromText(parens, 'timetable_photo', 90);
  assert.equal(parenDrafts.length, 2);
  assert.equal(parenDrafts[0].displayName, 'Amlodipine');
  assert.equal(parenDrafts[1].displayName, 'Metformin');
});

test('OCR prevents dispense quantities (Dispense: 60, #30) from becoming overdose quantities when instruction lacks explicit dose', () => {
  const dispenseText = `Metformin 500mg\nDispense: 60 tablets\nTake twice daily with meals`;
  const draft = medicationDraftFromText(dispenseText, 'label_photo', 90);
  assert.equal(draft.displayName, 'Metformin');
  assert.equal(draft.doseQuantity, 1, 'Dose quantity must safely default to 1, never 60 from Dispense count');
  assert.equal(draft.doseUnit, 'tablet');
  assert.ok(draft.warnings.some((w) => w.includes('dispense count') || w.includes('defaulted to 1')));

  const hashQuantityText = `Amlodipine 5mg\n#30 tablets\nOnce daily in the morning`;
  const draftHash = medicationDraftFromText(hashQuantityText, 'label_photo', 90);
  assert.equal(draftHash.displayName, 'Amlodipine');
  assert.equal(draftHash.doseQuantity, 1, 'Dose quantity must safely default to 1, never 30 from #30 bottle count');
});

test('OCR handles Latin reverse dose order (Sig: Tab 1, Sig: Tab i BID, Sig: Cap 1 TID)', () => {
  const tab1Text = `Amoxicillin 500mg\nSig: Tab 1 PO TID`;
  const draft1 = medicationDraftFromText(tab1Text, 'label_photo', 90);
  assert.equal(draft1.displayName, 'Amoxicillin');
  assert.equal(draft1.doseQuantity, 1);
  assert.equal(draft1.doseUnit, 'tablet');
  assert.equal(draft1.suggestedScheduleKind, 'meal');
  assert.deepEqual(draft1.detectedMeals, ['breakfast', 'lunch', 'dinner']);

  const tabIText = `Ciprofloxacin 500mg\nSig: Tab i BID`;
  const draftI = medicationDraftFromText(tabIText, 'label_photo', 90);
  assert.equal(draftI.displayName, 'Ciprofloxacin');
  assert.equal(draftI.doseQuantity, 1);
  assert.equal(draftI.suggestedScheduleKind, 'meal');
  assert.deepEqual(draftI.detectedMeals, ['breakfast', 'dinner']);
});

test('OCR strips compound prefixes (Rx: 1. Medicine) cleanly without leaving numbered artifacts in displayName', () => {
  const text = `Rx: 1. Amlodipine 5mg\nTake 1 tablet daily`;
  const draft = medicationDraftFromText(text, 'label_photo', 90);
  assert.equal(draft.displayName, 'Amlodipine');

  const textHash = `Rx #1: Losartan 50mg\nTake 1 tablet daily`;
  const draftHash = medicationDraftFromText(textHash, 'label_photo', 90);
  assert.equal(draftHash.displayName, 'Losartan');
});

test('OCR splits multi-medicine prescriptions with multiline dosage and dispense lines without phantom items', () => {
  const text = `Rx
1. Amoxicillin
500 mg tablet
Take 1 tablet every 8 hours
#21 capsules
2. Paracetamol
500 mg tablet
Take 1 tablet every 4 hours
#15 tablets`;

  const drafts = medicationDraftsFromText(text, 'timetable_photo', 90);
  assert.equal(drafts.length, 2, 'Should only create 2 drafts for Amoxicillin and Paracetamol, not extra drafts for #21 or 500mg');
  assert.equal(drafts[0].displayName, 'Amoxicillin');
  assert.equal(drafts[0].doseQuantity, 1);
  assert.equal(drafts[0].strengthValue, 500);
  assert.equal(drafts[0].intervalHours, 8);
  assert.equal(drafts[1].displayName, 'Paracetamol');
  assert.equal(drafts[1].doseQuantity, 1);
  assert.equal(drafts[1].strengthValue, 500);
  assert.equal(drafts[1].intervalHours, 4);
});

test('OCR handles range dose lines inside numbered items without creating phantom medications', () => {
  const text = `1. Amoxicillin 500mg
1 to 2 capsules every 8 hours
2. Paracetamol 500mg
Take 1 tablet as needed`;

  const drafts = medicationDraftsFromText(text, 'timetable_photo', 90);
  assert.equal(drafts.length, 2, 'Should not produce phantom draft named "to" from "1 to 2 capsules"');
  assert.equal(drafts[0].displayName, 'Amoxicillin');
  assert.equal(drafts[0].doseQuantity, 1);
  assert.equal(drafts[0].doseUnit, 'capsule');
  assert.equal(drafts[0].intervalHours, 8);
  assert.equal(drafts[1].displayName, 'Paracetamol');
  assert.equal(drafts[1].doseQuantity, 1);
  assert.equal(drafts[1].isAsNeeded, true);
});

test('OCR keeps sub-bullet instructions attached to parent numbered medications', () => {
  const text = `1. Losartan 50mg
- Take 1 tablet daily in the morning
2. Amlodipine 5mg
- Take 1 tablet in the evening`;

  const drafts = medicationDraftsFromText(text, 'timetable_photo', 90);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].displayName, 'Losartan');
  assert.equal(drafts[0].doseQuantity, 1);
  assert.equal(drafts[0].doseUnit, 'tablet');
  assert.equal(drafts[1].displayName, 'Amlodipine');
  assert.equal(drafts[1].doseQuantity, 1);
  assert.equal(drafts[1].doseUnit, 'tablet');
});

test('OCR preserves single medication header when prescription contains bulleted instructions', () => {
  const text = `Losartan 50mg
- Take 1 tablet daily in the morning
- Dispense #30`;

  const drafts = medicationDraftsFromText(text, 'label_photo', 90);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].displayName, 'Losartan');
  assert.equal(drafts[0].doseQuantity, 1);
  assert.equal(drafts[0].doseUnit, 'tablet');
});

test('OCR safely resolves range doses with "or" and "o" to minimum single dose', () => {
  const textEn = `Paracetamol 500mg\nTake 1 or 2 tablets every 6 hours`;
  const draftEn = medicationDraftFromText(textEn, 'label_photo', 90);
  assert.equal(draftEn.doseQuantity, 1, 'Should resolve "1 or 2" to safe minimum 1');
  assert.equal(draftEn.doseUnit, 'tablet');

  const textFil = `Paracetamol 500mg\nUminom ng 1 o 2 tableta bawat 6 na oras`;
  const draftFil = medicationDraftFromText(textFil, 'label_photo', 90);
  assert.equal(draftFil.doseQuantity, 1, 'Should resolve "1 o 2" to safe minimum 1');
  assert.equal(draftFil.doseUnit, 'tablet');
});

test('OCR extracts Filipino interval instructions with ligature na (bawat 6 na oras)', () => {
  const text = `Paracetamol 500mg\nUminom bawat 6 na oras`;
  const draft = medicationDraftFromText(text, 'label_photo', 90);
  assert.equal(draft.intervalHours, 6);
  assert.equal(draft.suggestedScheduleKind, 'interval');
});

test('OCR extracts Filipino kada interval and mixed fraction dosage (isa at kalahati)', () => {
  const text = `Carbocisteine 500mg kapsula\nUminom ng isa at kalahating tableta kada 8 oras`;
  const draft = medicationDraftFromText(text, 'label_photo', 92);
  assert.equal(draft.displayName, 'Carbocisteine');
  assert.equal(draft.doseQuantity, 1.5);
  assert.equal(draft.intervalHours, 8);
  assert.equal(draft.suggestedScheduleKind, 'interval');
  assert.equal(draft.pndfVerified, true);
  assert.equal(draft.pndfGenericName, 'Carbocisteine');
});

test('OCR extracts Filipino before-breakfast instruction (bago mag-almusal)', () => {
  const text = `Omeprazole 20mg kapsula\nUminom ng 1 kapsula bago mag-almusal`;
  const draft = medicationDraftFromText(text, 'label_photo', 93);
  assert.equal(draft.displayName, 'Omeprazole');
  assert.equal(draft.doseQuantity, 1);
  assert.equal(draft.doseUnit, 'capsule');
  assert.equal(draft.suggestedScheduleKind, 'meal');
  assert.deepEqual(draft.detectedMeals, ['breakfast']);
  assert.equal(draft.mealRelation, 'before');
  assert.equal(draft.pndfVerified, true);
});








