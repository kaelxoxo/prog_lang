import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import sharp from 'sharp';

import { translations } from '../../src/features/settings/translations';

const ROOT_DIR = path.resolve(__dirname, '../..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const STAGE_PATH = path.join(ROOT_DIR, 'src/features/onboarding/OnboardingMascotStage.tsx');
const SLIDESHOW_PATH = path.join(ROOT_DIR, 'src/features/onboarding/OnboardingSlideshow.tsx');

test('mascot unit invariants: all 4 assets exist with genuine multi-frame alpha transparency', async () => {
  const assets = [
    { file: 'mascot.png', format: 'png', minPages: 1, minDimension: 360 },
    { file: 'mascot-welcome.gif', format: 'gif', minPages: 4, minDimension: 320 },
    { file: 'mascot-medicine.gif', format: 'gif', minPages: 4, minDimension: 320 },
    { file: 'mascot-heart.gif', format: 'gif', minPages: 4, minDimension: 320 },
  ];

  for (const asset of assets) {
    const assetPath = path.join(ASSETS_DIR, asset.file);
    assert.ok(fs.existsSync(assetPath), `${asset.file} must exist on disk`);

    const meta = await sharp(assetPath, { animated: true }).metadata();
    assert.equal(meta.format, asset.format, `${asset.file} format must match ${asset.format}`);
    assert.ok((meta.width ?? 0) >= asset.minDimension, `${asset.file} width must be >= ${asset.minDimension}`);
    assert.ok((meta.height ?? 0) >= asset.minDimension, `${asset.file} height must be >= ${asset.minDimension}`);
    assert.ok(
      meta.hasAlpha === true || meta.channels === 4,
      `${asset.file} must have alpha transparency (hasAlpha: true or channels: 4)`,
    );

    const pages = meta.pages ?? 1;
    assert.ok(
      pages >= asset.minPages,
      `${asset.file} must contain at least ${asset.minPages} pages (found ${pages})`,
    );
  }
});

test('mascot unit invariants: perimeter pixels are 100% transparent with zero cream/white halos', async () => {
  const assetFiles = ['mascot.png', 'mascot-welcome.gif', 'mascot-medicine.gif', 'mascot-heart.gif'];

  for (const file of assetFiles) {
    const assetPath = path.join(ASSETS_DIR, file);
    const { data, info } = await sharp(assetPath, { page: 0 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    const getPixel = (x: number, y: number) => {
      const idx = (y * width + x) * channels;
      return {
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        a: data[idx + 3],
      };
    };

    // Check all 4 perimeter corners
    const corners = [
      { name: 'top-left', p: getPixel(0, 0) },
      { name: 'top-right', p: getPixel(width - 1, 0) },
      { name: 'bottom-left', p: getPixel(0, height - 1) },
      { name: 'bottom-right', p: getPixel(width - 1, height - 1) },
    ];

    for (const { name, p } of corners) {
      // Corner alpha must be strictly 0 (fully transparent)
      assert.equal(
        p.a,
        0,
        `${file} ${name} corner pixel must be transparent (alpha === 0, got ${p.a})`,
      );

      // Must not contain solid cream background #FCF9EE (r>240, g>240, b>220)
      const isCream = (p.a as number) === 255 && p.r > 240 && p.g > 240 && p.b > 220;
      assert.ok(!isCream, `${file} ${name} must not contain solid cream background halo`);
    }

    // Check perimeter midpoints
    const midpoints = [
      { name: 'top-mid', p: getPixel(Math.floor(width / 2), 0) },
      { name: 'bottom-mid', p: getPixel(Math.floor(width / 2), height - 1) },
      { name: 'left-mid', p: getPixel(0, Math.floor(height / 2)) },
      { name: 'right-mid', p: getPixel(width - 1, Math.floor(height / 2)) },
    ];

    for (const { name, p } of midpoints) {
      assert.equal(
        p.a,
        0,
        `${file} ${name} midpoint perimeter pixel must be transparent (got alpha=${p.a})`,
      );
    }
  }
});

test('mascot unit invariants: localization dictionary parity for mascot labels and tap hints', () => {
  const en = translations.en;
  const fil = translations.fil;

  const requiredKeys = [
    'onboarding_mascot_alt_slide1',
    'onboarding_mascot_alt_slide2',
    'onboarding_mascot_alt_slide3',
    'onboarding_mascot_tap_hint',
  ] as const;

  for (const key of requiredKeys) {
    assert.ok(key in en, `Key "${key}" must exist in English dictionary`);
    assert.ok(key in fil, `Key "${key}" must exist in Filipino dictionary`);
    assert.ok(en[key].length > 0, `English translation for "${key}" must not be empty`);
    assert.ok(fil[key].length > 0, `Filipino translation for "${key}" must not be empty`);
  }

  // Check specific semantic content
  assert.match(en.onboarding_mascot_alt_slide1, /waving/i);
  assert.match(en.onboarding_mascot_alt_slide2, /checklist/i);
  assert.match(en.onboarding_mascot_alt_slide3, /heart/i);
  assert.match(en.onboarding_mascot_tap_hint, /hop/i);

  assert.match(fil.onboarding_mascot_alt_slide1, /kumakaway/i);
  assert.match(fil.onboarding_mascot_alt_slide2, /checklist/i);
  assert.match(fil.onboarding_mascot_alt_slide3, /puso/i);
  assert.match(fil.onboarding_mascot_tap_hint, /lumundag/i);

  // Check nuanced healthcare companion narrative semantics
  assert.match(en.onboarding_mascot_alt_slide2, /approving nod/i);
  assert.match(fil.onboarding_mascot_alt_slide2, /pagsang-ayon/i);
  assert.match(en.onboarding_mascot_alt_slide3, /shield/i);
  assert.match(fil.onboarding_mascot_alt_slide3, /panangga/i);
});

test('mascot unit invariants: OnboardingMascotStage design, physics, and accessibility contracts', () => {
  const code = fs.readFileSync(STAGE_PATH, 'utf-8');

  // 1. Zero card border or bounding box
  assert.ok(!code.includes('borderRadius: 24'), 'Must eliminate borderRadius: 24');

  // 2. Default hero scale is size = 220
  assert.ok(code.includes('size = 220'), 'Must set default size to 220dp');

  // 3. Dynamic ground shadow: theme adaptive, no hardcoded #1E332A
  assert.ok(!code.includes("backgroundColor: '#1E332A'"), 'Must eliminate hardcoded #1E332A shadow color');
  assert.ok(code.includes('rgba(0, 0, 0,'), 'Must use theme-adaptive rgba(0, 0, 0, ...) shadow tint');

  // 4. Mathematical physics: volume conservation scaleX * scaleY ≈ 1.0
  assert.ok(code.includes('scaleX'), 'Must include scaleX for squash and stretch volume conservation');
  assert.ok(code.includes('squashAnim'), 'Must include squashAnim');
  assert.ok(code.includes('hopAnim'), 'Must include hopAnim');
  assert.ok(code.includes('verticalZ'), 'Must couple shadow to combined vertical elevation Z');

  // 5. TalkBack single-node accessibility
  assert.ok(code.includes('accessibilityRole="button"'), 'Pressable must have accessibilityRole="button"');
  assert.ok(!code.includes('accessibilityRole="image"'), 'Inner Image must not have accessibilityRole="image"');
  assert.ok(code.includes('accessible={false}'), 'Inner Image must set accessible={false}');

  // 6. Reduced motion fallback
  assert.ok(code.includes('AccessibilityInfo'), 'Must query AccessibilityInfo');
  // Bantay 2.0 is a crisp vector: reduced motion stops the loops instead of swapping to a raster still.
  assert.ok(code.includes('<BantayMascotSvg'), 'Must render the vector Bantay 2.0 mascot');
  assert.ok(code.includes('reduceMotion'), 'Must gate procedural motion on reduceMotion');

  // 7. Calibrated 3.0s breathing float cycle (1500ms inhale, 1500ms exhale)
  const durationMatch = code.match(/duration:\s*(\d+)/);
  assert.ok(durationMatch, 'Float animation must declare a timing duration');
  const duration = parseInt(durationMatch[1], 10);
  assert.equal(
    duration,
    1500,
    `Breathing half-cycle duration must be calibrated to 1500ms (got ${duration}ms)`,
  );

  // 8. Organic chest respiration scale coupled to floatAnim
  assert.ok(code.includes('breathScaleY'), 'Must include breathScaleY for organic chest respiration');
  assert.ok(code.includes('breathScaleX'), 'Must include breathScaleX for organic chest respiration');
  assert.ok(code.includes('1.016'), 'breathScaleY must expand to 1.016');
  assert.ok(code.includes('1.008'), 'breathScaleX must expand to 1.008');
  assert.ok(code.includes('Animated.multiply(scaleX, breathScaleX)'), 'scaleX must compound with breathScaleX');
  assert.ok(code.includes('Animated.multiply(squashAnim, breathScaleY)'), 'scaleY must compound with breathScaleY');

  // 9. Restrained head micro-tilt bounds within [-2deg, +2deg]
  assert.ok(code.includes('rotate'), 'Stage must include soft head micro-tilt rotation');
  assert.ok(
    code.includes("'-0.8deg'") && code.includes("'1.0deg'"),
    'Head micro-tilt must remain restrained within [-0.8deg, 1.0deg]',
  );
});

test('mascot unit invariants: calm restraint GIF loop cadence and physiological blinks', async () => {
  const animatedGifs = ['mascot-welcome.gif', 'mascot-medicine.gif', 'mascot-heart.gif'];

  for (const gifName of animatedGifs) {
    const gifPath = path.join(ASSETS_DIR, gifName);
    const meta = await sharp(gifPath, { animated: true }).metadata();
    const delays = meta.delay ?? [];

    assert.ok(delays.length >= 4, `${gifName} must contain at least 4 animation frames`);
    const totalDuration = delays.reduce((sum, d) => sum + d, 0);

    // Harmonized loop duration ~3000ms
    assert.ok(
      totalDuration >= 2800 && totalDuration <= 3200,
      `${gifName} total loop duration (${totalDuration}ms) must be calibrated to ~3000ms cadence`,
    );

    // No hyperactive flicker: every frame delay >= 150ms
    for (const d of delays) {
      assert.ok(
        d >= 150,
        `${gifName} frame delay (${d}ms) must be >= 150ms to preserve calm visual discipline`,
      );
    }

    // Physiological blink: contains a quick soft blink frame between 150ms and 250ms
    const hasBlinkFrame = delays.some((d) => d >= 150 && d <= 250);
    assert.ok(
      hasBlinkFrame,
      `${gifName} must include a physiological blink frame with duration between 150ms and 250ms`,
    );
  }
});

test('mascot unit invariants: OnboardingSlideshow layout, 0 drop shadows, and 48dp touch target', () => {
  const code = fs.readFileSync(SLIDESHOW_PATH, 'utf-8');

  // 1. Stage uses 220dp hero presence
  assert.ok(code.includes('size={220}'), 'Slideshow must invoke OnboardingMascotStage with size={220}');
  assert.ok(!code.includes('size={190}'), 'Slideshow must not use outdated size={190}');

  // 2. Flat design tokens: 0 drop shadows
  assert.ok(!code.includes('elevation: 2'), 'Primary button must eliminate elevation: 2');
  assert.ok(!code.includes('shadowRadius: 6'), 'Primary button must eliminate shadowRadius: 6');

  // 3. Skip button touch target >= 48dp
  assert.ok(code.includes('minHeight: 48'), 'Skip button must have minHeight: 48');
  assert.ok(!code.includes('minHeight: 44'), 'Skip button must eliminate sub-48dp minHeight: 44');

  // 4. Sentence case tags
  assert.ok(code.includes('Meet Bantay'), 'Must use sentence case tag "Meet Bantay"');
  assert.ok(code.includes('Gentle Medicine Care'), 'Must use sentence case tag "Gentle Medicine Care"');
  assert.ok(code.includes('Shared Care Circle'), 'Must use sentence case tag "Shared Care Circle"');
});
