import assert from 'node:assert/strict';
import test from 'node:test';

import { localeTag, translate } from '../../src/features/settings/translations';

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
