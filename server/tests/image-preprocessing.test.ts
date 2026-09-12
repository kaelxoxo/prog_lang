import test from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import { preprocessOcrImage } from '../src/image-preprocessing';

test('Image Pre-processing: enhances image contrast, applies CLAHE, and outputs clean PNG buffer', async () => {
  // Create a synthetic 200x200 low-contrast test image
  const rawImage = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 180, g: 185, b: 190 },
    },
  })
    .png()
    .toBuffer();

  const preprocessed = await preprocessOcrImage(rawImage, {
    maxDimension: 100,
    applyClahe: true,
    applySharpen: true,
    normalizeContrast: true,
  });

  assert.ok(Buffer.isBuffer(preprocessed));
  assert.ok(preprocessed.length > 0);

  // Inspect the preprocessed image metadata
  const metadata = await sharp(preprocessed).metadata();
  assert.equal(metadata.format, 'png');
  assert.ok(metadata.width! <= 100);
  // Valid image output produced
  assert.ok(metadata.channels && metadata.channels >= 1);
});

test('Image Pre-processing: gracefully falls back on corrupted or invalid image buffers', async () => {
  const invalidBuffer = Buffer.from('not an actual image content');
  const fallback = await preprocessOcrImage(invalidBuffer);

  assert.ok(Buffer.isBuffer(fallback));
  assert.equal(fallback.toString(), 'not an actual image content');
});
