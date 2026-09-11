import assert from 'node:assert/strict';
import {
  medicationDraftFromText,
  medicationDraftsFromText,
  splitPrescriptionBlocks,
} from '../server/src/ocr';

console.log('--- RUNNING OCR & PARSING STRESS TEST PASS ---');

const cases = [
  // 1. Dispense vs Sig Priority
  {
    category: 'Dispense vs Sig',
    text: `Rx: Losartan 50mg
#30 tablets
Sig: 1 tab once daily in the morning`,
    expected: {
      displayName: 'Losartan',
      doseQuantity: 1,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Dispense vs Sig (Dispense: 60)',
    text: `Metformin 500mg
Dispense: 60 tablets
Take 1 tablet twice daily with meals`,
    expected: {
      displayName: 'Metformin',
      doseQuantity: 1,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Dispense vs Sig (Qty: 100)',
    text: `Omeprazole 20mg
Qty: 100 capsules
Take 1 capsule 30 minutes before breakfast`,
    expected: {
      displayName: 'Omeprazole',
      doseQuantity: 1,
      doseUnit: 'capsule',
    },
  },
  {
    category: 'Dispense vs Sig (Total: 30 tablets)',
    text: `Amlodipine 5mg
Total: 30 tablets
Take 1 tablet once daily`,
    expected: {
      displayName: 'Amlodipine',
      doseQuantity: 1,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Dispense vs Sig (Dispense #28 / Inumin ang 1 tableta)',
    text: `Simvastatin 20mg
Dispense #28 tableta
Inumin ang 1 tableta sa gabi`,
    expected: {
      displayName: 'Simvastatin',
      doseQuantity: 1,
      doseUnit: 'tablet',
    },
  },

  // 2. Fractional Doses & Word Numbers
  {
    category: 'Fractional (1/2 tablet)',
    text: `Metoprolol 50mg
Take 1/2 tablet daily`,
    expected: {
      doseQuantity: 0.5,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (1/4 tablet)',
    text: `Digoxin 0.25mg
Take 1/4 tablet daily`,
    expected: {
      doseQuantity: 0.25,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (3/4 tablet)',
    text: `Clonazepam 2mg
Take 3/4 tablet at bedtime`,
    expected: {
      doseQuantity: 0.75,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (half tablet word)',
    text: `Rosuvastatin 10mg
Take half tablet daily`,
    expected: {
      doseQuantity: 0.5,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (quarter tablet word)',
    text: `Levothyroxine 100mcg
Take quarter tablet daily`,
    expected: {
      doseQuantity: 0.25,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (mixed 1 1/2 tablets)',
    text: `Prednisone 5mg
Take 1 1/2 tablets daily in the morning`,
    expected: {
      doseQuantity: 1.5,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (mixed 2 1/2 tablets)',
    text: `Calcium Carbonate 500mg
Take 2 1/2 tablets daily`,
    expected: {
      doseQuantity: 2.5,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (hyphenated mixed 1-1/2)',
    text: `Warfarin 2.5mg
Take 1-1/2 tablets at 6 PM`,
    expected: {
      doseQuantity: 1.5,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (Filipino: kalahati)',
    text: `Losartan 50mg
Uminom ng kalahating tableta araw-araw`,
    expected: {
      doseQuantity: 0.5,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (Filipino: sangkapat)',
    text: `Atenolol 50mg
Uminom ng sangkapat na tableta sa umaga`,
    expected: {
      doseQuantity: 0.25,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (Unicode fraction ½)',
    text: `Metoprolol 50mg
Take ½ tablet daily in the morning`,
    expected: {
      doseQuantity: 0.5,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (Unicode fraction ¼)',
    text: `Digoxin 0.25mg
Take ¼ tablet at bedtime`,
    expected: {
      doseQuantity: 0.25,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Fractional (Unicode mixed 1½)',
    text: `Prednisone 5mg
Take 1½ tablets daily`,
    expected: {
      doseQuantity: 1.5,
      doseUnit: 'tablet',
    },
  },

  // 3. Range Doses (Safest Minimum Single Dose)
  {
    category: 'Range dose (1-2 capsules)',
    text: `Tramadol 50mg
Take 1-2 capsules every 6 hours as needed for severe pain`,
    expected: {
      doseQuantity: 1,
      doseUnit: 'capsule',
      intervalHours: 6,
      isAsNeeded: true,
    },
  },
  {
    category: 'Range dose (2-3 tablets)',
    text: `Antacid 500mg
Take 2 to 3 tablets chewable after meals`,
    expected: {
      doseQuantity: 2,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Range dose (Filipino: 1 hanggang 2)',
    text: `Paracetamol 500mg
Uminom ng 1 hanggang 2 tableta tuwing ika-4 oras kung may lagnat`,
    expected: {
      doseQuantity: 1,
      doseUnit: 'tablet',
      intervalHours: 4,
      isAsNeeded: true,
    },
  },

  // 4. Interval and Frequency Variations
  {
    category: 'Interval (q8h)',
    text: `Amoxicillin 500mg
Take 1 capsule q8h for 7 days`,
    expected: {
      doseQuantity: 1,
      doseUnit: 'capsule',
      intervalHours: 8,
      suggestedScheduleKind: 'interval',
    },
  },
  {
    category: 'Interval (q12h)',
    text: `Cefuroxime 500mg
Take 1 tablet q12h after meals`,
    expected: {
      doseQuantity: 1,
      doseUnit: 'tablet',
      intervalHours: 12,
      suggestedScheduleKind: 'interval',
    },
  },
  {
    category: 'Interval (every 4-6 hours)',
    text: `Ibuprofen 400mg
Take 1 tablet every 4-6 hours as needed for pain`,
    expected: {
      doseQuantity: 1,
      intervalHours: 4,
      isAsNeeded: true,
    },
  },
  {
    category: 'Interval (q 6 h with spaces)',
    text: `Paracetamol 500mg
Take 1 tablet q 6 h prn`,
    expected: {
      doseQuantity: 1,
      intervalHours: 6,
      isAsNeeded: true,
    },
  },

  // 5. Latin and Abbreviated Sig instructions
  {
    category: 'Latin: BID with meals',
    text: `Metformin 500mg tablet
Sig: 1 tab PO BID pc`,
    expected: {
      doseQuantity: 1,
      doseUnit: 'tablet',
      route: 'by mouth',
      suggestedScheduleKind: 'meal',
      detectedMeals: ['breakfast', 'dinner'],
      mealRelation: 'after',
    },
  },
  {
    category: 'Latin: TID before meals (ac)',
    text: `Metoclopramide 10mg tablet
Sig: 1 tab PO TID ac`,
    expected: {
      doseQuantity: 1,
      doseUnit: 'tablet',
      route: 'by mouth',
      suggestedScheduleKind: 'meal',
      detectedMeals: ['breakfast', 'lunch', 'dinner'],
      mealRelation: 'before',
    },
  },
  {
    category: 'Latin: HS (hora somni / bedtime)',
    text: `Atorvastatin 20mg tablet
Sig: 1 tab PO HS`,
    expected: {
      doseQuantity: 1,
      doseUnit: 'tablet',
      route: 'by mouth',
      suggestedScheduleKind: 'meal',
      detectedMeals: ['dinner'],
    },
  },
  {
    category: 'Latin: with periods (P.O. B.I.D. P.C.)',
    text: `Metformin 500mg
1 tab P.O. B.I.D. P.C.`,
    expected: {
      doseQuantity: 1,
      route: 'by mouth',
      suggestedScheduleKind: 'meal',
      detectedMeals: ['breakfast', 'dinner'],
      mealRelation: 'after',
    },
  },
  {
    category: 'PRN with periods (p.r.n.)',
    text: `Salbutamol 2mg
Take 1 tablet every 6 hours p.r.n. for cough`,
    expected: {
      isAsNeeded: true,
    },
  },

  // 6. Name and Brand/Generic Parsing
  {
    category: 'Name: Parenthesized brand with trailing strength',
    text: `Amlodipine (Norvasc) 5 mg tablet
Take 1 tablet once daily`,
    expected: {
      displayName: 'Amlodipine (Norvasc)',
      genericName: 'Amlodipine',
      brandName: 'Norvasc',
      strengthValue: 5,
      strengthUnit: 'mg',
    },
  },
  {
    category: 'Name: Bracketed brand with trailing strength',
    text: `Losartan [Cozaar] 50 mg tablet
Take 1 tablet daily`,
    expected: {
      displayName: 'Losartan [Cozaar]',
      genericName: 'Losartan',
      brandName: 'Cozaar',
      strengthValue: 50,
      strengthUnit: 'mg',
    },
  },
  {
    category: 'Name: Slash brand with trailing strength',
    text: `Metformin / Glucophage 500 mg tablet
Take 1 tablet twice daily`,
    expected: {
      displayName: 'Metformin / Glucophage',
      genericName: 'Metformin',
      brandName: 'Glucophage',
      strengthValue: 500,
      strengthUnit: 'mg',
    },
  },
  {
    category: 'Name: Brand with missing strength digit (OCR dropped 5)',
    text: `Amlodipine (Norvasc) mg tablet
Take 1 tablet daily`,
    expected: {
      genericName: 'Amlodipine',
      brandName: 'Norvasc',
    },
  },
  {
    category: 'Name: Noise exclusion (Clinic Header)',
    text: `ST. LUKE'S MEDICAL CENTER
DR. RAMON SANTOS, MD - INTERNAL MEDICINE
PRC LIC. 1234567
PATIENT: LOLA ROSA
Rx:
Amlodipine 5mg
Take 1 tablet daily`,
    expected: {
      displayName: 'Amlodipine',
      strengthValue: 5,
    },
  },

  // 7. Multi-prescription splitting
  {
    category: 'Multi-prescription: Numbered with dot',
    text: `Rx
1. Amlodipine 5mg
Take 1 tablet daily
2. Metformin 500mg
Take 1 tablet twice daily
3. Losartan 50mg
Take 1 tablet daily`,
    expectedDraftsCount: 3,
  },
  {
    category: 'Multi-prescription: Numbered without dot on item 2 (OCR dropped period)',
    text: `Rx
1. Amlodipine 5mg tablet
Take 1 tablet daily
2 Metformin 500mg tablet
Take 1 tablet twice daily
3. Losartan 50mg tablet
Take 1 tablet daily`,
    expectedDraftsCount: 3,
  },
  {
    category: 'Multi-prescription: Roman numerals (I, II, III)',
    text: `I. Amlodipine 5mg
Take 1 tablet daily
II. Metformin 500mg
Take 1 tablet twice daily
III. Losartan 50mg
Take 1 tablet daily`,
    expectedDraftsCount: 3,
  },
  {
    category: 'Multi-prescription: Letters (A., B., C.)',
    text: `A. Amlodipine 5mg
Take 1 tablet daily
B. Metformin 500mg
Take 1 tablet twice daily`,
    expectedDraftsCount: 2,
  },
  {
    category: 'Multi-prescription: Bullets (•, -, *)',
    text: `• Amlodipine 5mg
Take 1 tablet daily
• Metformin 500mg
Take 1 tablet twice daily`,
    expectedDraftsCount: 2,
  },
  {
    category: 'Multi-prescription: Multiple Rx headers',
    text: `Rx Amlodipine 5mg
Take 1 tablet daily
Rx Metformin 500mg
Take 1 tablet twice daily`,
    expectedDraftsCount: 2,
  },
  {
    category: 'Multi-prescription: Parenthesized numbers (1), (2)',
    text: `(1) Amlodipine 5mg
Take 1 tablet daily
(2) Metformin 500mg
Take 1 tablet twice daily`,
    expectedDraftsCount: 2,
  },
  {
    category: 'Dispense vs Sig: Dispense 60 without explicit dose defaults to 1',
    text: `Metformin 500mg
Dispense: 60 tablets
Take twice daily with meals`,
    expected: {
      displayName: 'Metformin',
      doseQuantity: 1,
      doseUnit: 'tablet',
    },
  },
  {
    category: 'Latin: Reverse dose order (Sig: Tab 1)',
    text: `Amoxicillin 500mg
Sig: Tab 1 PO TID`,
    expected: {
      displayName: 'Amoxicillin',
      doseQuantity: 1,
      doseUnit: 'tablet',
      suggestedScheduleKind: 'meal',
      detectedMeals: ['breakfast', 'lunch', 'dinner'],
    },
  },
  {
    category: 'Latin: Reverse dose order (Sig: Tab i BID)',
    text: `Ciprofloxacin 500mg
Sig: Tab i BID`,
    expected: {
      displayName: 'Ciprofloxacin',
      doseQuantity: 1,
      doseUnit: 'tablet',
      suggestedScheduleKind: 'meal',
      detectedMeals: ['breakfast', 'dinner'],
    },
  },
  {
    category: 'Name: Compound prefix (Rx: 1. Medicine)',
    text: `Rx: 1. Amlodipine 5mg
Take 1 tablet daily`,
    expected: {
      displayName: 'Amlodipine',
    },
  },
  {
    category: 'Multi-prescription: Multiline dosage and dispense quantities without phantom drafts',
    text: `Rx
1. Amoxicillin
500 mg tablet
Take 1 tablet every 8 hours
#21 capsules
2. Paracetamol
500 mg tablet
Take 1 tablet every 4 hours
#15 tablets`,
    expectedDraftsCount: 2,
  },
];

let passed = 0;
let failed = 0;
const failures: Array<{ category: string; error: string }> = [];

for (const tc of cases) {
  try {
    if (tc.expectedDraftsCount !== undefined) {
      const drafts = medicationDraftsFromText(tc.text, 'timetable_photo', 90);
      assert.equal(
        drafts.length,
        tc.expectedDraftsCount,
        `Expected ${tc.expectedDraftsCount} drafts, but got ${drafts.length}: ${drafts.map((d) => d.displayName).join(' | ')}`,
      );
    } else {
      const draft = medicationDraftFromText(tc.text, 'label_photo', 90);
      for (const [key, val] of Object.entries(tc.expected)) {
        assert.deepEqual(
          (draft as Record<string, unknown>)[key],
          val,
          `Key "${key}" failed on "${tc.category}": expected ${JSON.stringify(val)}, got ${JSON.stringify((draft as Record<string, unknown>)[key])}`,
        );
      }
    }
    passed++;
    console.log(`PASS: ${tc.category}`);
  } catch (err: any) {
    failed++;
    console.log(`FAIL: ${tc.category} -> ${err.message}`);
    failures.push({ category: tc.category, error: err.message });
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed out of ${cases.length} stress tests.`);
if (failures.length > 0) {
  console.log('\nFailures summary:');
  failures.forEach((f) => console.log(`- [${f.category}]: ${f.error}`));
}
