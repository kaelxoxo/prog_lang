import assert from 'node:assert/strict';
import test from 'node:test';

import { translate } from '../../src/features/settings/translations';

test('interpolation inserts names verbatim, even with replacement-pattern characters', () => {
  const patient = 'Lina {time} $& ñ';
  const medicine = 'Amlo {patient} $1 5 mg';
  const message = translate('dose.recordedNotice', { medicine, patient, status: 'taken' });

  assert.ok(message.includes(patient));
  assert.ok(message.includes(medicine));
});

test('interpolation leaves placeholders without a value intact', () => {
  const message = translate('dose.recordedNotice', { medicine: 'Amlodipine' });

  assert.ok(message.includes('Amlodipine'));
  assert.ok(message.includes('{patient}'));
});
