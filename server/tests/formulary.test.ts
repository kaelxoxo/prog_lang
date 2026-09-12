import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findFormularyMatch,
  groundDraftWithFormulary,
  normalizeOpticalCharacters,
  PHILIPPINE_DRUG_FORMULARY,
} from '../src/formulary';
import { medicationDraftFromText } from '../src/ocr';

test('Formulary: normalizes optical OCR character corruptions', () => {
  assert.equal(normalizeOpticalCharacters('Metf0rmin'), 'Metformin');
  assert.equal(normalizeOpticalCharacters('L0sartan'), 'Losartan');
  assert.equal(normalizeOpticalCharacters('Bioge5ic'), 'Biogesic');
  assert.equal(normalizeOpticalCharacters('Cardio5el'), 'Cardiosel');
});

test('Formulary: matches generic and Philippine brand names with fuzzy tolerance', () => {
  // Exact match
  const amlodipine = findFormularyMatch('Amlodipine');
  assert.ok(amlodipine);
  assert.equal(amlodipine?.drug.genericName, 'Amlodipine');
  assert.equal(amlodipine?.isBrandMatch, false);

  // Optical typo match (Am1odipine)
  const amlodipineTypo = findFormularyMatch('Am1odipine');
  assert.ok(amlodipineTypo);
  assert.equal(amlodipineTypo?.drug.genericName, 'Amlodipine');

  // Brand match (Norvasc)
  const norvasc = findFormularyMatch('Norvasc');
  assert.ok(norvasc);
  assert.equal(norvasc?.drug.genericName, 'Amlodipine');
  assert.equal(norvasc?.matchedName, 'Norvasc');
  assert.equal(norvasc?.isBrandMatch, true);

  // Filipino OTC Brand match (Biogesic -> Paracetamol)
  const biogesic = findFormularyMatch('Biogesic');
  assert.ok(biogesic);
  assert.equal(biogesic?.drug.genericName, 'Paracetamol');
  assert.equal(biogesic?.isBrandMatch, true);

  // Solmux -> Carbocisteine
  const solmux = findFormularyMatch('Solmux');
  assert.ok(solmux);
  assert.equal(solmux?.drug.genericName, 'Carbocisteine');
});

test('Formulary: detects Look-Alike / Sound-Alike (LASA) safety hazards', () => {
  // Celebrex (celecoxib) vs Celexa (citalopram)
  const celebrexMatch = findFormularyMatch('Celebrex');
  assert.ok(celebrexMatch);
  assert.ok(celebrexMatch?.drug.lasaWarning?.includes('Celexa'));

  // Hydralazine vs Hydroxyzine
  const hydralazineMatch = findFormularyMatch('Hydralazine');
  assert.ok(hydralazineMatch);
  assert.ok(hydralazineMatch?.drug.lasaWarning?.includes('Hydroxyzine'));

  // Grounding attaches LASA warning prominently to draft
  const draft = medicationDraftFromText('Celebrex 200 mg capsule\nTake 1 capsule daily', 'label_photo', 90);
  assert.ok(draft.lasaWarning);
  assert.ok(draft.lasaWarning.includes('Celexa'));
  assert.ok(draft.warnings.some((w) => w.includes('Look-Alike / Sound-Alike')));
  assert.equal(draft.pndfVerified, true);
  assert.equal(draft.pndfGenericName, 'Celecoxib');
});

test('Formulary: automatically repairs optical OCR errors and verifies PNDF registration', () => {
  const typoText = `Metform1n 500 mg tablet\nTake 1 tablet twice daily with meals`;
  const draft = medicationDraftFromText(typoText, 'label_photo', 88);

  assert.equal(draft.displayName, 'Metformin');
  assert.equal(draft.genericName, 'Metformin');
  assert.equal(draft.pndfVerified, true);
  assert.equal(draft.pndfGenericName, 'Metformin');
  assert.equal(draft.strengthValue, 500);
  assert.equal(draft.strengthUnit, 'mg');
});

test('Formulary: warns on non-standard drug dosage strengths', () => {
  // Amlodipine standard strengths in PNDF are 5mg and 10mg
  const oddStrengthText = `Amlodipine 75 mg tablet\nTake 1 tablet daily`;
  const draft = medicationDraftFromText(oddStrengthText, 'label_photo', 85);

  assert.equal(draft.pndfVerified, true);
  assert.ok(draft.warnings.some((w) => w.includes('non-standard for Amlodipine')));
});
