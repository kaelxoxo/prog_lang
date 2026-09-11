import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type CopyKey,
  type Locale,
  localeTag,
  translate,
  translations,
} from '../../src/features/settings/translations';

test('localization preserves interpolated source wording exactly', () => {
  const patient = 'Lina {time} $& ñ';
  const medicine = 'Amlo {patient} $1 5 mg';
  const message = translate('fil', 'dose.recordedNotice', {
    medicine,
    patient,
    status: translate('fil', 'dose.taken'),
  });

  assert.ok(message.includes(patient));
  assert.ok(message.includes(medicine));
  assert.equal(localeTag('en'), 'en-PH');
  assert.equal(localeTag('fil'), 'fil-PH');
});

test('zero-dose Home names the person without implying completed care', () => {
  const english = translate('en', 'home.noConfirmedFor', { patient: 'Lina' });
  const filipino = translate('fil', 'home.noConfirmedFor', { patient: 'Lina' });

  assert.equal(english, 'Lina has no confirmed medicines scheduled today.');
  assert.ok(filipino.includes('Lina'));
  assert.doesNotMatch(english, /caught up|recorded/i);
});

test('localization dictionary parity and placeholder invariant between English and Filipino', () => {
  const enKeys = Object.keys(translations.en) as CopyKey[];
  const filKeys = Object.keys(translations.fil) as CopyKey[];

  assert.equal(enKeys.length, filKeys.length, 'English and Filipino dictionaries must have matching key counts');

  const placeholderPattern = /\{(\w+)\}/g;

  for (const key of enKeys) {
    assert.ok(key in translations.fil, `Key "${key}" must exist in Filipino dictionary`);
    assert.ok(translations.en[key].length > 0, `English key "${key}" must not be empty`);
    assert.ok(translations.fil[key].length > 0, `Filipino key "${key}" must not be empty`);

    const enPlaceholders = [...translations.en[key].matchAll(placeholderPattern)].map((m) => m[1]).sort();
    const filPlaceholders = [...translations.fil[key].matchAll(placeholderPattern)].map((m) => m[1]).sort();

    assert.deepEqual(
      enPlaceholders,
      filPlaceholders,
      `Placeholders for key "${key}" must match identically between English (${enPlaceholders.join(
        ', ',
      )}) and Filipino (${filPlaceholders.join(', ')})`,
    );
  }
});

test('localization invariants: patient names, medicine wording, units, notes, and OCR extracts are never translated or modified', () => {
  const complexPatient = 'Dr. Maria-José "Pepe" Peña-Reyes & Lola Rosa <3';
  const complexMedicine = 'Amlodipine Besylate / Atorvastatin Calcium (Caduet®) 5mg/10mg';
  const complexDose = '1.5 tablets (500 mg)';
  const complexReason = 'Patient spat out tablet: reassessed by Dr. Santos-Dela Cruz.';
  const complexTime = '08:00 AM (Asia/Manila)';
  const complexNote = 'Take with warm water. Huwag inumin nang walang laman ang tiyan.';
  const ocrExtract = 'Rx: Metformin HCl 500mg #30 Sig: Take 1 tab BID with meals';

  const locales: Locale[] = ['en', 'fil'];

  for (const locale of locales) {
    // 1. Notices
    const recordedNotice = translate(locale, 'dose.recordedNotice', {
      medicine: complexMedicine,
      patient: complexPatient,
      status: translate(locale, 'dose.taken'),
    });
    assert.ok(recordedNotice.includes(complexMedicine), `${locale}: dose.recordedNotice must contain medicine verbatim`);
    assert.ok(recordedNotice.includes(complexPatient), `${locale}: dose.recordedNotice must contain patient verbatim`);

    const correctedNotice = translate(locale, 'dose.correctedNotice', {
      medicine: complexMedicine,
      patient: complexPatient,
      status: translate(locale, 'dose.skipped'),
    });
    assert.ok(correctedNotice.includes(complexMedicine), `${locale}: dose.correctedNotice must contain medicine verbatim`);
    assert.ok(correctedNotice.includes(complexPatient), `${locale}: dose.correctedNotice must contain patient verbatim`);

    const snoozedNotice = translate(locale, 'dose.snoozedNotice', {
      medicine: complexMedicine,
      minutes: 15,
    });
    assert.ok(snoozedNotice.includes(complexMedicine), `${locale}: dose.snoozedNotice must contain medicine verbatim`);

    const updatedMedNotice = translate(locale, 'medicine.updatedNotice', {
      medicine: complexMedicine,
      patient: complexPatient,
    });
    assert.ok(updatedMedNotice.includes(complexMedicine), `${locale}: medicine.updatedNotice must contain medicine verbatim`);
    assert.ok(updatedMedNotice.includes(complexPatient), `${locale}: medicine.updatedNotice must contain patient verbatim`);

    const archivedMedNotice = translate(locale, 'medicine.archivedNotice', {
      medicine: complexMedicine,
    });
    assert.ok(archivedMedNotice.includes(complexMedicine), `${locale}: medicine.archivedNotice must contain medicine verbatim`);

    const restoredMedNotice = translate(locale, 'medicine.restoredNotice', {
      patient: complexPatient,
    });
    assert.ok(restoredMedNotice.includes(complexPatient), `${locale}: medicine.restoredNotice must contain patient verbatim`);

    // 2. Dialogues and confirmations
    const recordBody = translate(locale, 'dose.recordBody', {
      dose: complexDose,
      time: complexTime,
      patient: complexPatient,
    });
    assert.ok(recordBody.includes(complexDose), `${locale}: dose.recordBody must contain dose/unit verbatim`);
    assert.ok(recordBody.includes(complexTime), `${locale}: dose.recordBody must contain time verbatim`);
    assert.ok(recordBody.includes(complexPatient), `${locale}: dose.recordBody must contain patient verbatim`);

    const correctBody = translate(locale, 'dose.correctBody', {
      medicine: complexMedicine,
      dose: complexDose,
      patient: complexPatient,
    });
    assert.ok(correctBody.includes(complexMedicine), `${locale}: dose.correctBody must contain medicine verbatim`);
    assert.ok(correctBody.includes(complexDose), `${locale}: dose.correctBody must contain dose verbatim`);
    assert.ok(correctBody.includes(complexPatient), `${locale}: dose.correctBody must contain patient verbatim`);

    const correctionLine = translate(locale, 'dose.correction', {
      reason: complexReason,
    });
    assert.ok(correctionLine.includes(complexReason), `${locale}: dose.correction must contain reason verbatim`);

    const archiveBody = translate(locale, 'medicine.archiveBody', {
      patient: complexPatient,
    });
    assert.ok(archiveBody.includes(complexPatient), `${locale}: medicine.archiveBody must contain patient verbatim`);

    // 3. Navigation and headers
    const patientLabel = translate(locale, 'care.patientLabel', {
      patient: complexPatient,
    });
    assert.ok(patientLabel.includes(complexPatient), `${locale}: care.patientLabel must contain patient verbatim`);

    const homeNoConfirmed = translate(locale, 'home.noConfirmedFor', {
      patient: complexPatient,
    });
    assert.ok(homeNoConfirmed.includes(complexPatient), `${locale}: home.noConfirmedFor must contain patient verbatim`);

    const historySubtitle = translate(locale, 'history.subtitle', {
      patient: complexPatient,
    });
    assert.ok(historySubtitle.includes(complexPatient), `${locale}: history.subtitle must contain patient verbatim`);

    const remindersLabel = translate(locale, 'reminders.label', {
      patient: complexPatient,
    });
    assert.ok(remindersLabel.includes(complexPatient), `${locale}: reminders.label must contain patient verbatim`);

    const medicineSubtitle = translate(locale, 'medicine.subtitle', {
      patient: complexPatient,
    });
    assert.ok(medicineSubtitle.includes(complexPatient), `${locale}: medicine.subtitle must contain patient verbatim`);

    const todayHello = translate(locale, 'today.hello', {
      name: complexPatient,
    });
    assert.ok(todayHello.includes(complexPatient), `${locale}: today.hello must contain name verbatim`);
  }

  // Verify OCR extract preservation
  for (const locale of locales) {
    const ocrRecordedNotice = translate(locale, 'dose.recordedNotice', {
      medicine: ocrExtract,
      patient: complexPatient,
      status: translate(locale, 'dose.taken'),
    });
    assert.ok(ocrRecordedNotice.includes(ocrExtract), `${locale}: must preserve OCR extract verbatim in notice`);
  }
});
