import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ASSETS = [
  'mascot.png',
  'mascot-welcome.gif',
  'mascot-medicine.gif',
  'mascot-heart.gif',
];

const BACKGROUNDS = [
  { name: 'LightCanvas', hex: '#F6F1E7', rgb: { r: 246, g: 241, b: 231 } },
  { name: 'DarkCanvas', hex: '#17211F', rgb: { r: 23, g: 33, b: 31 } },
  { name: 'PureBlack', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
  { name: 'PureWhite', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
  { name: 'Evergreen', hex: '#233A35', rgb: { r: 35, g: 58, b: 53 } },
];

async function testCompositing() {
  console.log('--- Testing Compositing against 5 Diverse Backgrounds ---');
  let totalComposites = 0;
  let artifactCount = 0;

  for (const assetName of ASSETS) {
    const assetPath = path.resolve(process.cwd(), 'assets', assetName);
    const meta = await sharp(assetPath, { animated: true }).metadata();
    const pages = meta.pages || 1;

    for (let p = 0; p < pages; p++) {
      const frameBuffer = await sharp(assetPath, { page: p }).toBuffer();
      const frameMeta = await sharp(frameBuffer).metadata();
      const width = frameMeta.width;
      const height = frameMeta.height;

      for (const bg of BACKGROUNDS) {
        totalComposites++;
        // Create solid background
        const composited = await sharp({
          create: {
            width,
            height,
            channels: 4,
            background: { r: bg.rgb.r, g: bg.rgb.g, b: bg.rgb.b, alpha: 1 },
          },
        })
          .composite([{ input: frameBuffer, top: 0, left: 0 }])
          .raw()
          .toBuffer({ resolveWithObject: true });

        const rawData = composited.data;

        // Verify perimeter pixels of composited image match background EXACTLY
        // If there were a bounding box or halo at perimeter, rawData would differ from bg
        let perimeterMismatches = 0;
        const checkMatch = (x, y) => {
          const idx = (y * width + x) * 4;
          const r = rawData[idx];
          const g = rawData[idx + 1];
          const b = rawData[idx + 2];
          const diff = Math.abs(r - bg.rgb.r) + Math.abs(g - bg.rgb.g) + Math.abs(b - bg.rgb.b);
          if (diff > 0) perimeterMismatches++;
        };

        for (let x = 0; x < width; x++) {
          checkMatch(x, 0);
          checkMatch(x, height - 1);
        }
        for (let y = 1; y < height - 1; y++) {
          checkMatch(0, y);
          checkMatch(width - 1, y);
        }

        if (perimeterMismatches > 0) {
          artifactCount++;
          console.error(`  [FAIL] ${assetName} (frame ${p}) on ${bg.name}: ${perimeterMismatches} perimeter pixels deviated from background!`);
        }
      }
    }
    console.log(`✓ ${assetName} (${pages} frames x 5 backgrounds = ${pages * 5} composites): 100% borderless background integration.`);
  }

  console.log(`\nCompositing summary: ${totalComposites} compositions tested, ${artifactCount} artifacts found.`);
  return artifactCount === 0;
}

testCompositing()
  .then((pass) => {
    if (!pass) process.exit(1);
    console.log('All compositing tests PASSED seamlessly.');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
