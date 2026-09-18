import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ASSETS_DIR = path.resolve(process.cwd(), 'assets');
const EXPLORER_DIR = path.resolve(process.cwd(), '.agents/explorer_survey_mascot_2');

const BACKGROUNDS = [
  { name: 'DarkEvergreen', hex: '#2D5A46', rgb: { r: 45, g: 90, b: 70 } },
  { name: 'WarmCream', hex: '#FBF9F5', rgb: { r: 251, g: 249, b: 245 } },
  { name: 'DarkMidnight', hex: '#121B18', rgb: { r: 18, g: 27, b: 24 } },
  { name: 'PureWhite', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
  { name: 'PureBlack', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
];

export async function generateAndVerify() {
  console.log('Generating transparent 32-bit RGBA master bust PNG assets...');

  const bustRestingSrc = path.join(EXPLORER_DIR, 'test_bantay_cutout.png');
  const bustWaveSrc = path.join(EXPLORER_DIR, 'test_bantay_wave_cutout.png');

  const bustRestingDest = path.join(ASSETS_DIR, 'mascot-bantay-bust.png');
  const bustWaveDest = path.join(ASSETS_DIR, 'mascot-bantay-bust-wave.png');

  // Resize with sharp to 512x512 transparent PNG
  await sharp(bustRestingSrc)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(bustRestingDest);
  console.log('Saved assets/mascot-bantay-bust.png');

  await sharp(bustWaveSrc)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(bustWaveDest);
  console.log('Saved assets/mascot-bantay-bust-wave.png');

  // Verify transparency & compositing
  for (const assetFile of ['mascot-bantay-bust.png', 'mascot-bantay-bust-wave.png']) {
    const assetPath = path.join(ASSETS_DIR, assetFile);
    const meta = await sharp(assetPath).metadata();
    console.log(`\nVerifying ${assetFile}: ${meta.width}x${meta.height}, channels=${meta.channels}, hasAlpha=${meta.hasAlpha}`);

    if (meta.channels !== 4 || !meta.hasAlpha) {
      throw new Error(`Asset ${assetFile} must be 32-bit RGBA with alpha channel!`);
    }

    const { data, info } = await sharp(assetPath).raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;

    // Check top-left and top-right corners for 100% transparency
    const tlAlpha = data[3];
    const trAlpha = data[(width - 1) * 4 + 3];
    if (tlAlpha !== 0 || trAlpha !== 0) {
      throw new Error(`Asset ${assetFile} has non-transparent top corners: TL=${tlAlpha}, TR=${trAlpha}`);
    }

    // Check top 10 rows for 100% transparency (above ears)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3];
        if (a !== 0) {
          throw new Error(`Asset ${assetFile} has non-transparent pixel in top row y=${y}, x=${x}: alpha=${a}`);
        }
      }
    }

    // Compositing test on all 5 backgrounds
    for (const bg of BACKGROUNDS) {
      const composited = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: bg.rgb.r, g: bg.rgb.g, b: bg.rgb.b, alpha: 1 },
        },
      })
        .composite([{ input: assetPath, top: 0, left: 0 }])
        .raw()
        .toBuffer({ resolveWithObject: true });

      const cData = composited.data;
      // Top 10 rows perimeter check
      let mismatch = 0;
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const diff = Math.abs(cData[idx] - bg.rgb.r) + Math.abs(cData[idx + 1] - bg.rgb.g) + Math.abs(cData[idx + 2] - bg.rgb.b);
          if (diff > 0) mismatch++;
        }
      }
      if (mismatch > 0) {
        throw new Error(`Asset ${assetFile} failed compositing on ${bg.name}! ${mismatch} top perimeter mismatches`);
      }
      console.log(`  ✓ Composited on ${bg.name} (${bg.hex}) with 0 halo.`);
    }
  }

  console.log('\nAll master bust PNG assets generated and verified successfully!');
}

generateAndVerify().catch((err) => {
  console.error(err);
  process.exit(1);
});
