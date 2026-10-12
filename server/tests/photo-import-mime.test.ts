import { test } from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import { imageMimeTypeFromBase64 } from '../../src/features/medications/imageType';

const pixel = () => sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } });

test('photo import labels the uploaded bytes, not the picked file, so Android re-encoded PNGs pass server validation', async () => {
  // Android expo-image-picker returns JPEG base64 for PNG sources when quality < 1.
  assert.equal(imageMimeTypeFromBase64((await pixel().jpeg().toBuffer()).toString('base64')), 'image/jpeg');
  assert.equal(imageMimeTypeFromBase64((await pixel().png().toBuffer()).toString('base64')), 'image/png');
});

test('photo import rejects payloads the server would not accept as JPEG or PNG', async () => {
  assert.equal(imageMimeTypeFromBase64((await pixel().webp().toBuffer()).toString('base64')), null);
  assert.equal(imageMimeTypeFromBase64(''), null);
});
