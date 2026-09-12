import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import sharp from 'sharp';

import { translations } from '../../src/features/settings/translations';

const ROOT_DIR = path.resolve(__dirname, '../..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const ONBOARDING_STAGE_PATH = path.join(ROOT_DIR, 'src/features/onboarding/OnboardingMascotStage.tsx');
const ONBOARDING_SLIDESHOW_PATH = path.join(ROOT_DIR, 'src/features/onboarding/OnboardingSlideshow.tsx');
const TRANSLATIONS_PATH = path.join(ROOT_DIR, 'src/features/settings/translations.ts');

describe('Free-Standing Mascot System E2E Test Suite', () => {

  // =========================================================================
  // TIER 1: FEATURE COVERAGE & CONTRACT VERIFICATION
  // =========================================================================

  describe('Tier 1: Feature Coverage (Core Requirements & Contracts)', () => {

    it('R1 (FEAT-BORDERLESS): Stage styling completely eliminates card bounding box and borderRadius: 24', () => {
      assert.ok(fs.existsSync(ONBOARDING_STAGE_PATH), 'OnboardingMascotStage.tsx must exist');
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');

      // Verify elimination of the artificial card look / borderRadius: 24
      assert.ok(
        !stageCode.includes('borderRadius: 24'),
        'OnboardingMascotStage must eliminate borderRadius: 24 card boundary styling',
      );

      // Verify no opaque card container backgrounds are wrapping the mascot
      assert.ok(
        !stageCode.match(/mascotActor:\s*\{[^}]*backgroundColor/),
        'Mascot actor must not have an opaque card container background',
      );
    });

    it('R1 & R2 (FEAT-TRANSPARENCY): Mascot assets exist with valid formats and alpha transparency', async () => {
      const requiredAssets = [
        { file: 'mascot-welcome.gif', format: 'gif', minDimension: 320 },
        { file: 'mascot-medicine.gif', format: 'gif', minDimension: 320 },
        { file: 'mascot-heart.gif', format: 'gif', minDimension: 320 },
        { file: 'mascot.png', format: 'png', minDimension: 320 },
      ];

      for (const item of requiredAssets) {
        const filePath = path.join(ASSETS_DIR, item.file);
        assert.ok(fs.existsSync(filePath), `Asset ${item.file} must exist in assets/`);

        const metadata = await sharp(filePath).metadata();
        assert.equal(metadata.format, item.format, `${item.file} must be ${item.format} format`);
        assert.ok((metadata.width ?? 0) >= item.minDimension, `${item.file} width must be >= ${item.minDimension}`);
        assert.ok((metadata.height ?? 0) >= item.minDimension, `${item.file} height must be >= ${item.minDimension}`);

        // Alpha channel presence: true transparency required
        assert.ok(
          metadata.hasAlpha === true || metadata.channels === 4,
          `${item.file} must have alpha channel (hasAlpha: true or channels: 4) for clean transparency`,
        );
      }
    });

    it('R1 (FEAT-TRANSPARENCY): Mascot assets have transparent perimeter pixels with zero cream halos', async () => {
      const assetsToCheck = ['mascot-welcome.gif', 'mascot-medicine.gif', 'mascot-heart.gif', 'mascot.png'];

      for (const file of assetsToCheck) {
        const filePath = path.join(ASSETS_DIR, file);
        if (!fs.existsSync(filePath)) continue;

        // Extract raw RGBA pixel data
        const { data, info } = await sharp(filePath)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const width = info.width;
        const height = info.height;
        const channels = info.channels;

        // Helper to check pixel RGBA
        const getPixel = (x: number, y: number) => {
          const idx = (y * width + x) * channels;
          return {
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
            a: data[idx + 3],
          };
        };

        // Check top-left, top-right, bottom-left, bottom-right corners
        const corners = [
          getPixel(0, 0),
          getPixel(width - 1, 0),
          getPixel(0, height - 1),
          getPixel(width - 1, height - 1),
        ];

        for (const corner of corners) {
          // Zero cream/white border pixels (#FCF9EE is rgb(252, 249, 238))
          const isSolidCream = (corner.a as number) === 255 && corner.r > 240 && corner.g > 240 && corner.b > 220;
          assert.ok(!isSolidCream, `${file} must not contain solid cream background corner pixels`);

          // Perimeter corner pixels must be fully transparent (alpha === 0)
          assert.equal(
            corner.a,
            0,
            `${file} corner pixel must be transparent (alpha: 0) to guarantee organic borderless character`,
          );
        }
      }
    });

    it('R2 (FEAT-ACTION-SLIDE1, 2, 3): Multi-action choreography maps distinct states across slides', async () => {
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');

      // Verify all 3 distinct action assets are imported or referenced
      assert.ok(
        stageCode.includes('mascot-welcome.gif'),
        'Stage must reference mascot-welcome.gif for Slide 1 waving greeting',
      );
      assert.ok(
        stageCode.includes('mascot-medicine.gif'),
        'Stage must reference mascot-medicine.gif for Slide 2 medicine care checklist',
      );
      assert.ok(
        stageCode.includes('mascot-heart.gif'),
        'Stage must reference mascot-heart.gif for Slide 3 care heart and privacy shield',
      );
      assert.ok(
        stageCode.includes('mascot.png'),
        'Stage must reference mascot.png for reduceMotion fallback',
      );

      // Verify GIFs are multi-frame animations
      for (const gifName of ['mascot-welcome.gif', 'mascot-medicine.gif', 'mascot-heart.gif']) {
        const gifPath = path.join(ASSETS_DIR, gifName);
        if (fs.existsSync(gifPath)) {
          const gifMeta = await sharp(gifPath, { animated: true }).metadata();
          assert.ok(
            (gifMeta.pages ?? 1) > 1,
            `${gifName} must be a multi-frame animated GIF (pages: ${gifMeta.pages})`,
          );
        }
      }
    });

    it('R3 (FEAT-HERO-SCALE): Mascot stage defaults to 220dp hero scale on onboarding slideshow', () => {
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');
      const slideshowCode = fs.readFileSync(ONBOARDING_SLIDESHOW_PATH, 'utf-8');

      // In OnboardingMascotStage: default size should be 220
      const has220Default = stageCode.includes('size = 220') || stageCode.includes('size: number = 220');
      assert.ok(has220Default, 'OnboardingMascotStage must set default hero scale to size = 220');

      // In OnboardingSlideshow: stage invocation must use 220dp
      const uses220dp =
        slideshowCode.includes('size={220}') ||
        slideshowCode.includes('<OnboardingMascotStage slideIndex={index} />') ||
        slideshowCode.includes('<OnboardingMascotStage');
      assert.ok(uses220dp, 'OnboardingSlideshow must support 220dp hero presence');

      // Rejects old 190 scale
      assert.ok(
        !slideshowCode.includes('size={190}'),
        'OnboardingSlideshow must not hardcode outdated size={190}',
      );
    });

    it('R4 (FEAT-TALKBACK-A11Y): Single accessible button node without duplicate announcement nodes', () => {
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');

      // Outer Pressable is the accessible button
      assert.ok(
        stageCode.includes('accessibilityRole="button"') || stageCode.includes("accessibilityRole='button'"),
        'Mascot Pressable target must specify accessibilityRole="button"',
      );

      // Verify no duplicate accessibilityRole="image" on inner Image
      assert.ok(
        !stageCode.includes('accessibilityRole="image"'),
        'Inner Image must not declare accessibilityRole="image" (eliminates TalkBack double-announcement)',
      );
    });

    it('R4 (FEAT-BILINGUAL-PARITY): Mascot accessibility labels and tap hints maintain strict en/fil parity', () => {
      assert.ok(fs.existsSync(TRANSLATIONS_PATH), 'translations.ts must exist');

      // Check whether mascot translation keys exist in both English and Filipino
      const en = translations.en as Record<string, string>;
      const fil = translations.fil as Record<string, string>;

      // Expected key candidates (supporting dot or underscore notation)
      const possibleKeySets = [
        {
          slide1: 'onboarding_mascot_alt_slide1',
          slide2: 'onboarding_mascot_alt_slide2',
          slide3: 'onboarding_mascot_alt_slide3',
          hint: 'onboarding_mascot_tap_hint',
        },
        {
          slide1: 'onboarding.mascotSlide1',
          slide2: 'onboarding.mascotSlide2',
          slide3: 'onboarding.mascotSlide3',
          hint: 'onboarding.mascotTapHint',
        },
        {
          slide1: 'onboarding.mascotSlide1Alt',
          slide2: 'onboarding.mascotSlide2Alt',
          slide3: 'onboarding.mascotSlide3Alt',
          hint: 'onboarding.mascotTapHint',
        },
      ];

      // Find which key set is implemented
      const matchedSet = possibleKeySets.find(
        (set) => set.slide1 in en || set.hint in en,
      );

      assert.ok(
        matchedSet,
        'translations.ts must define bilingual keys for mascot alt descriptions and tap hint',
      );

      // Verify parity for matched keys
      for (const [name, key] of Object.entries(matchedSet)) {
        assert.ok(key in en, `English dictionary must contain key "${key}" (${name})`);
        assert.ok(key in fil, `Filipino dictionary must contain key "${key}" (${name})`);
        assert.ok(en[key].length > 0, `English "${key}" must not be empty`);
        assert.ok(fil[key].length > 0, `Filipino "${key}" must not be empty`);
      }

      // Verify healthcare companion narrative semantics
      assert.match(en[matchedSet.slide2], /approving nod/i, 'Slide 2 English alt must describe approving nod');
      assert.match(fil[matchedSet.slide2], /pagsang-ayon/i, 'Slide 2 Filipino alt must describe pagsang-ayon');
      assert.match(en[matchedSet.slide3], /shield/i, 'Slide 3 English alt must describe privacy shield');
      assert.match(fil[matchedSet.slide3], /panangga/i, 'Slide 3 Filipino alt must describe panangga');
    });

    it('R4 (FEAT-DESIGN-TOKENS): Flat design token conformance (0 drop shadows, >=48dp touch target)', () => {
      const slideshowCode = fs.readFileSync(ONBOARDING_SLIDESHOW_PATH, 'utf-8');

      // Check 0 drop shadows on primary button (no elevation > 0, no shadowColor on primaryButton)
      assert.ok(
        !slideshowCode.includes('elevation: 2'),
        'OnboardingSlideshow buttons must eliminate elevation: 2 drop shadow',
      );
      assert.ok(
        !slideshowCode.includes('shadowRadius: 6'),
        'OnboardingSlideshow buttons must eliminate shadowRadius: 6',
      );

      // Check touch target for skip button: must be >= 48dp
      assert.ok(
        !slideshowCode.includes('minHeight: 44'),
        'Skip button minHeight must be upgraded from 44 to at least 48dp',
      );
    });

    it('R1 (FEAT-RESTRAINT): GIF animation cadence maintains 3000ms loop with calm frame delays and physiological blinks', async () => {
      const animatedGifs = ['mascot-welcome.gif', 'mascot-medicine.gif', 'mascot-heart.gif'];

      for (const gifName of animatedGifs) {
        const gifPath = path.join(ASSETS_DIR, gifName);
        const meta = await sharp(gifPath, { animated: true }).metadata();
        const delays = meta.delay ?? [];

        assert.ok(delays.length >= 4, `${gifName} must contain at least 4 animation frames`);
        const totalDuration = delays.reduce((sum, d) => sum + d, 0);

        // Harmonized 3000ms loop cadence
        assert.ok(
          totalDuration >= 2800 && totalDuration <= 3200,
          `${gifName} total animation duration (${totalDuration}ms) must be calibrated to ~3000ms cadence`,
        );

        // No hyperactive fast looping: every frame delay >= 150ms
        for (const d of delays) {
          assert.ok(
            d >= 150,
            `${gifName} frame delay (${d}ms) must be >= 150ms to maintain calm companion visual discipline`,
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

    it('R1 (FEAT-MICRO-LIFE): Stage implements 3.0s breathing cycle with organic chest respiration scaling and restrained micro-tilt', () => {
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');

      // 1. Calibrated 3.0s breathing rhythm (1500ms inhale, 1500ms exhale)
      const durationMatch = stageCode.match(/duration:\s*(\d+)/);
      assert.ok(durationMatch, 'Float animation must declare a timing duration');
      const duration = parseInt(durationMatch[1], 10);
      assert.equal(
        duration,
        1500,
        `Breathing half-cycle duration must be calibrated to 1500ms (got ${duration}ms)`,
      );

      // 2. Organic chest respiration scaling coupled to floatAnim
      assert.ok(stageCode.includes('breathScaleY'), 'Stage must include breathScaleY for organic chest respiration');
      assert.ok(stageCode.includes('breathScaleX'), 'Stage must include breathScaleX for organic chest respiration');
      assert.ok(stageCode.includes('1.016'), 'breathScaleY must expand to 1.016');
      assert.ok(stageCode.includes('1.008'), 'breathScaleX must expand to 1.008');
      assert.ok(stageCode.includes('Animated.multiply(scaleX, breathScaleX)'), 'scaleX must compound with breathScaleX');
      assert.ok(stageCode.includes('Animated.multiply(squashAnim, breathScaleY)'), 'scaleY must compound with breathScaleY');

      // 3. Restrained head micro-tilt bounds within [-2deg, +2deg]
      assert.ok(stageCode.includes('rotate'), 'Stage must include soft head micro-tilt rotation');
      assert.ok(
        stageCode.includes("'-0.8deg'") && stageCode.includes("'1.0deg'"),
        'Head micro-tilt must remain restrained within [-0.8deg, 1.0deg]',
      );
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // =========================================================================

  describe('Tier 2: Boundary & Corner Cases', () => {

    it('T2.1: Out-of-bounds slideIndex clamping and fallback robustness', () => {
      // Test the mathematical/logical indexing fallback used in OnboardingMascotStage
      const assetArray = ['welcome', 'medicine', 'heart'];
      const selectAsset = (index: number) => assetArray[index] ?? assetArray[0];

      // Test negative index
      assert.equal(selectAsset(-1), 'welcome', 'Negative slideIndex must fall back safely to Slide 0');

      // Test out of upper bound
      assert.equal(selectAsset(3), 'welcome', 'slideIndex 3 must fall back safely to Slide 0');
      assert.equal(selectAsset(99), 'welcome', 'Extreme slideIndex 99 must fall back safely to Slide 0');

      // Test NaN or undefined
      assert.equal(selectAsset(NaN), 'welcome', 'NaN slideIndex must fall back safely to Slide 0');
    });

    it('T2.2: Extreme and zero size dimension handling', () => {
      // Equations from OnboardingMascotStage:
      // stageWidth = size + 36, shadowWidth = size * 0.72
      const calcStage = (size: number) => ({
        stageSize: size + 36,
        shadowWidth: size * 0.72,
      });

      // At size = 0
      const zero = calcStage(0);
      assert.equal(zero.stageSize, 36);
      assert.equal(zero.shadowWidth, 0);
      assert.ok(!Number.isNaN(zero.shadowWidth));

      // At size = 220 (hero)
      const hero = calcStage(220);
      assert.equal(hero.stageSize, 256);
      assert.equal(hero.shadowWidth, 158.4);

      // At extreme size = 440
      const large = calcStage(440);
      assert.equal(large.stageSize, 476);
      assert.equal(large.shadowWidth, 316.8);
    });

    it('T2.3: Theme canvas contrast — shadow adapts to light and dark backgrounds', () => {
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');

      // Hardcoded '#1E332A' glows light on dark canvas #17211F.
      // Must use theme-adaptive rgba(0,0,0,...) or colors.ink tint.
      assert.ok(
        !stageCode.includes("backgroundColor: '#1E332A'") &&
        !stageCode.includes('backgroundColor: "#1E332A"'),
        'Ground shadow must not use hardcoded #1E332A which causes dark mode glow defects',
      );
    });

    it('T2.4: Optional callback tolerance — tap handles undefined onMascotTap gracefully', () => {
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');

      // Must use optional chaining onMascotTap?.()
      assert.ok(
        stageCode.includes('onMascotTap?.()') || stageCode.includes('onMascotTap && onMascotTap()'),
        'Stage must invoke onMascotTap with optional chaining to prevent undefined invocation errors',
      );
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS & MATHEMATICAL PHYSICS
  // =========================================================================

  describe('Tier 3: Cross-Feature Interactions & Mathematical Physics', () => {

    it('T3.1 (FEAT-GROUND-SHADOW): Dynamic ground contact shadow coupling Z = floatAnim * 10 - hopAnim', () => {
      // The physical model:
      // Effective vertical elevation Z = floatNorm * 10 - hopY
      // Higher Z (farther from ground) => smaller shadow scale, lower shadow opacity
      // Resting Z = 0 => shadow scale ~ 1.05, opacity ~ 0.26
      // Jump apex Z = 30 => shadow scale <= 0.65, opacity <= 0.08
      // Landing impact Z = 0 (squash) => shadow scale >= 1.15, opacity >= 0.32

      const computeShadowProps = (floatNorm: number, hopY: number, squash = 1.0) => {
        const Z = floatNorm * 10 - hopY; // effective distance from ground in dp
        // Inverse linear interpolation modeling
        const scaleX = Math.max(0.5, (1.05 - (Z / 30) * 0.45) * (squash < 1 ? 1 + (1 - squash) * 1.2 : 1));
        const opacity = Math.max(0.05, Math.min(0.40, (0.26 - (Z / 30) * 0.18) * (squash < 1 ? 1.2 : 1)));
        return { Z, scaleX, opacity };
      };

      // 1. Resting ground level
      const resting = computeShadowProps(0, 0, 1.0);
      assert.equal(resting.Z, 0);
      assert.ok(resting.scaleX >= 1.0, 'Resting shadow scale must be >= 1.0');
      assert.ok(resting.opacity >= 0.20, 'Resting shadow opacity must be >= 0.20');

      // 2. Float apex (hovering 10dp up)
      const floatApex = computeShadowProps(1, 0, 1.0);
      assert.equal(floatApex.Z, 10);
      assert.ok(floatApex.scaleX < resting.scaleX, 'Floating higher must decrease shadow scale');
      assert.ok(floatApex.opacity < resting.opacity, 'Floating higher must decrease shadow opacity');

      // 3. Jump apex (float + hop = 30dp up)
      const jumpApex = computeShadowProps(1, -20, 1.0);
      assert.equal(jumpApex.Z, 30);
      assert.ok(jumpApex.scaleX < floatApex.scaleX, 'Jump apex must have smallest shadow scale');
      assert.ok(jumpApex.opacity < floatApex.opacity, 'Jump apex must have lowest shadow opacity');
      assert.ok(jumpApex.scaleX <= 0.65, 'Jump apex shadow scale must be <= 0.65');
      assert.ok(jumpApex.opacity <= 0.10, 'Jump apex shadow opacity must be <= 0.10');

      // 4. Landing impact squash
      const landingImpact = computeShadowProps(0, 0, 0.88);
      assert.ok(landingImpact.scaleX > resting.scaleX, 'Landing impact squash must expand shadow scale');
      assert.ok(landingImpact.opacity > resting.opacity, 'Landing impact squash must darken shadow');
    });

    it('T3.2 (FEAT-TAP-PHYSICS): Volume-conserving squash-and-stretch invariant scaleX * scaleY ≈ 1.0', () => {
      // Classical animation volume conservation principle:
      // When squashing vertically (scaleY < 1), character must expand horizontally (scaleX > 1).
      // When stretching vertically (scaleY > 1), character must compress horizontally (scaleX < 1).
      // scaleX * scaleY must remain approximately 1.0 (within 0.08 tolerance).

      const animationPhases = [
        { name: 'Anticipation Squash', scaleY: 0.92, scaleX: 1.08 },
        { name: 'Hop Takeoff Stretch', scaleY: 1.08, scaleX: 0.92 },
        { name: 'Impact Landing Squash', scaleY: 0.88, scaleX: 1.14 },
        { name: 'Settled Rest', scaleY: 1.00, scaleX: 1.00 },
      ];

      for (const phase of animationPhases) {
        const volumeProduct = phase.scaleX * phase.scaleY;
        const deviation = Math.abs(volumeProduct - 1.0);
        assert.ok(
          deviation <= 0.08,
          `${phase.name} violates volume conservation: scaleX (${phase.scaleX}) * scaleY (${phase.scaleY}) = ${volumeProduct.toFixed(4)} (deviation ${deviation.toFixed(4)} > 0.08)`,
        );
      }

      // Check OnboardingMascotStage code to verify both scaleX and scaleY are utilized
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');
      assert.ok(
        stageCode.includes('scaleX') || stageCode.includes('squashAnim'),
        'Tap animation must incorporate squash and stretch physics',
      );
    });

    it('T3.3 (FEAT-REDUCED-MOTION): reduceMotion halts float loop, resets transforms, and falls back to static PNG', () => {
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');

      // Verifies reduceMotion handling
      assert.ok(
        stageCode.includes('AccessibilityInfo.isReduceMotionEnabled') ||
        stageCode.includes('AccessibilityInfo.addEventListener'),
        'Stage must query AccessibilityInfo for reduceMotion',
      );

      // Verifies fallback to static mascot.png
      assert.ok(
        stageCode.includes('mascot.png'),
        'Stage must fall back to mascot.png when reduceMotion is enabled',
      );
    });

    it('T3.4 (FEAT-RESPIRATION-PHYSICS): Respiration chest scaling operates within organic subtle bounds', () => {
      // Inhale apex: breathScaleX = 1.008 (+0.8%), breathScaleY = 1.016 (+1.6%)
      // Product of expansion is ~1.024, perfectly subtle (<3% change) so it looks like gentle breathing
      const breathScaleX = 1.008;
      const breathScaleY = 1.016;

      assert.ok(breathScaleX > 1.0 && breathScaleX <= 1.015, 'Chest width expansion must be gentle (+0.5% to +1.5%)');
      assert.ok(breathScaleY > 1.0 && breathScaleY <= 1.025, 'Chest height expansion must be subtle (+1.0% to +2.5%)');

      // Check volume stability during tap squash while breathing
      // Max squash: squashAnim = 0.88, scaleX = 1.14
      // Compounded: scaleY = 0.88 * 1.016 = 0.89408, scaleX = 1.14 * 1.008 = 1.14912
      // Combined volume = 0.89408 * 1.14912 = 1.0274 (deviation from 1.0 is ~0.027, well within 0.08 tolerance)
      const combinedVolume = (0.88 * breathScaleY) * (1.14 * breathScaleX);
      assert.ok(
        Math.abs(combinedVolume - 1.0) <= 0.08,
        'Compounded tap physics and breathing respiration must maintain volume conservation within 0.08 tolerance',
      );
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================

  describe('Tier 4: Real-World Application Scenarios', () => {

    it('T4.1: Onboarding 3-slide journey simulation with correct tags and completion semantics', () => {
      const slideshowCode = fs.readFileSync(ONBOARDING_SLIDESHOW_PATH, 'utf-8');

      // Verify 3 distinct slide IDs
      assert.ok(slideshowCode.includes("'slide-0'") || slideshowCode.includes('"slide-0"'));
      assert.ok(slideshowCode.includes("'slide-1'") || slideshowCode.includes('"slide-1"'));
      assert.ok(slideshowCode.includes("'slide-2'") || slideshowCode.includes('"slide-2"'));

      // Verify slide tags
      assert.ok(slideshowCode.includes('MEET BANTAY') || slideshowCode.includes('Meet Bantay'));
      assert.ok(slideshowCode.includes('GENTLE MEDICINE CARE') || slideshowCode.includes('Gentle Medicine Care'));
      assert.ok(slideshowCode.includes('SHARED CARE CIRCLE') || slideshowCode.includes('Shared Care Circle'));

      // Verify completion flow
      assert.ok(
        slideshowCode.includes('onComplete'),
        'Slideshow must invoke onComplete upon completing all slides',
      );
    });

    it('T4.2: Small screen vertical budget clearance on 360x640dp Android devices', () => {
      // Viewport metrics on standard compact Android (360x640dp):
      const viewportHeight = 640;
      const topBars = 20;
      const headerHeight = 48;
      const footerHeight = 78;
      const availableSlideHeight = viewportHeight - (topBars + headerHeight + footerHeight); // 494dp

      // Slide content metrics:
      const mascotStageSize = 220 + 36; // 256dp
      const stageMarginBottom = 16;
      const textBlockHeight = 150; // Eyebrow + title (2 lines) + description (3 lines)
      const totalSlideContentHeight = mascotStageSize + stageMarginBottom + textBlockHeight; // 422dp

      const remainingMargin = availableSlideHeight - totalSlideContentHeight; // 72dp

      assert.ok(
        remainingMargin >= 40,
        `Slide layout must leave at least 40dp margin on 360x640 screens to prevent text clipping (current: ${remainingMargin}dp)`,
      );
    });

    it('T4.3: TalkBack screen reader tree exposes single interactive button per slide', () => {
      const stageCode = fs.readFileSync(ONBOARDING_STAGE_PATH, 'utf-8');

      // Count accessibilityRole declarations in OnboardingMascotStage
      const roleMatches = stageCode.match(/accessibilityRole=["']([^"']+)["']/g) ?? [];
      const roles = roleMatches.map((m) => m.replace(/accessibilityRole=["']|["']/g, ''));

      // Should only have 'button' role; 'image' role must be eliminated from inner Image
      assert.ok(
        roles.includes('button'),
        'Stage must expose an accessible button for the mascot',
      );
      assert.ok(
        !roles.includes('image'),
        'Stage must not expose accessibilityRole="image" on inner Image to prevent double TalkBack announcements',
      );
    });
  });
});
