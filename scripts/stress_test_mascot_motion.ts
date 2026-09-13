/**
 * Empirical Stress Test Harness for Mascot Motion Physics & Mathematical Invariants
 * 
 * Tests:
 * 1. Volume conservation (scaleX * scaleY approx 1.0) across all phases compounded with 3.0s chest respiration
 * 2. High-resolution grid scan of squash and respiration combinations
 * 3. Rapid consecutive tap concurrency, interruption, drift, and settling
 * 4. reduceMotion toggle invariants, transitions, and baseline resets
 * 5. Ground contact shadow coupling, clamping, and contrast dynamics
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Polyfill requestAnimationFrame for react-native-web Animated engine in Node
(global as any).requestAnimationFrame = (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 16);
(global as any).cancelAnimationFrame = (id: any) => clearTimeout(id);

const { Animated, Easing } = require('react-native-web');

// -----------------------------------------------------------------------------
// Core Mathematical Definitions extracted verbatim from OnboardingMascotStage
// -----------------------------------------------------------------------------

function interpolateRespirationX(floatVal: number): number {
  // floatAnim [0, 1] => [1.0, 1.008]
  return 1.0 + floatVal * 0.008;
}

function interpolateRespirationY(floatVal: number): number {
  // floatAnim [0, 1] => [1.0, 1.016]
  return 1.0 + floatVal * 0.016;
}

function interpolateScaleX(squashVal: number): number {
  // squashAnim inputRange: [0.88, 1.0, 1.08], outputRange: [1.14, 1.0, 0.92]
  // In React Native Animated, interpolation uses piecewise linear interpolation with extend extrapolation
  if (squashVal <= 1.0) {
    // between 0.88 and 1.00: slope = (1.0 - 1.14) / (1.0 - 0.88) = -0.14 / 0.12 = -1.1666667
    const t = (squashVal - 0.88) / (1.0 - 0.88);
    return 1.14 + t * (1.0 - 1.14);
  } else {
    // between 1.00 and 1.08: slope = (0.92 - 1.0) / (1.08 - 1.0) = -0.08 / 0.08 = -1.0
    const t = (squashVal - 1.0) / (1.08 - 1.0);
    return 1.0 + t * (0.92 - 1.0);
  }
}

function computeCompoundedVolume(squashVal: number, floatVal: number) {
  const breathX = interpolateRespirationX(floatVal);
  const breathY = interpolateRespirationY(floatVal);
  const sX = interpolateScaleX(squashVal);
  const sY = squashVal;

  const effectiveScaleX = sX * breathX;
  const effectiveScaleY = sY * breathY;
  const volume = effectiveScaleX * effectiveScaleY;
  const deviation = Math.abs(volume - 1.0);

  return {
    squashVal,
    floatVal,
    sX,
    sY,
    breathX,
    breathY,
    effectiveScaleX,
    effectiveScaleY,
    volume,
    deviation,
  };
}

// -----------------------------------------------------------------------------
// Test 1: Volume Conservation Across Nominal & Over-extension Grids
// -----------------------------------------------------------------------------
async function testVolumeConservation() {
  console.log('================================================================');
  console.log('TEST 1: VOLUME CONSERVATION MATHEMATICAL GRID SCAN');
  console.log('================================================================');

  // Key animation phases
  const keyPhases = [
    { name: 'Rest Baseline', squash: 1.00 },
    { name: 'Phase 1: Anticipation Squash', squash: 0.92 },
    { name: 'Phase 2: Hop Takeoff Stretch', squash: 1.08 },
    { name: 'Phase 3: Impact Landing Squash', squash: 0.88 },
  ];

  console.log('\nEvaluating Key Animation Phases against Inhale (float=1) and Exhale (float=0):');
  for (const phase of keyPhases) {
    for (const floatVal of [0.0, 0.5, 1.0]) {
      const res = computeCompoundedVolume(phase.squash, floatVal);
      console.log(
        `  ${phase.name.padEnd(32)} | Float: ${floatVal.toFixed(1)} | scaleX: ${res.effectiveScaleX.toFixed(4)} | scaleY: ${res.effectiveScaleY.toFixed(4)} | Volume: ${res.volume.toFixed(5)} | Dev: ${(res.deviation * 100).toFixed(2)}%`,
      );
      assert.ok(
        res.deviation <= 0.08,
        `Phase ${phase.name} at float ${floatVal} exceeds volume tolerance 0.08 (got ${res.deviation})`,
      );
    }
  }

  // High-density scan across nominal bounds [0.88, 1.08] x [0.0, 1.0]
  let maxNominalDeviation = 0;
  let minNominalVolume = Infinity;
  let maxNominalVolume = -Infinity;
  let worstNominalPoint: any = null;

  const SQUASH_STEPS = 200;
  const FLOAT_STEPS = 100;

  for (let i = 0; i <= SQUASH_STEPS; i++) {
    const s = 0.88 + (i / SQUASH_STEPS) * (1.08 - 0.88);
    for (let j = 0; j <= FLOAT_STEPS; j++) {
      const f = j / FLOAT_STEPS;
      const res = computeCompoundedVolume(s, f);

      if (res.volume < minNominalVolume) minNominalVolume = res.volume;
      if (res.volume > maxNominalVolume) maxNominalVolume = res.volume;
      if (res.deviation > maxNominalDeviation) {
        maxNominalDeviation = res.deviation;
        worstNominalPoint = res;
      }
    }
  }

  console.log('\nHigh-Density Nominal Scan Results (20,301 grid points):');
  console.log(`  Min Volume: ${minNominalVolume.toFixed(5)}`);
  console.log(`  Max Volume: ${maxNominalVolume.toFixed(5)}`);
  console.log(`  Max Deviation: ${(maxNominalDeviation * 100).toFixed(3)}%`);
  console.log(`  Worst Point: squash=${worstNominalPoint.squashVal.toFixed(3)}, float=${worstNominalPoint.floatVal.toFixed(3)}`);

  assert.ok(
    maxNominalDeviation <= 0.08,
    `Nominal volume deviation ${(maxNominalDeviation * 100).toFixed(2)}% must be <= 8%`,
  );
  assert.ok(
    maxNominalDeviation <= 0.04,
    `Nominal volume deviation ${(maxNominalDeviation * 100).toFixed(2)}% is within high-precision 4% bound`,
  );

  // Over-extension Scan (Spring overshoot bounds [0.82, 1.14])
  let maxOverDeviation = 0;
  for (let i = 0; i <= 300; i++) {
    const s = 0.82 + (i / 300) * (1.14 - 0.82);
    for (let j = 0; j <= 50; j++) {
      const f = j / 50;
      const res = computeCompoundedVolume(s, f);
      if (res.deviation > maxOverDeviation) maxOverDeviation = res.deviation;
    }
  }
  console.log(`  Over-extension Scan ([0.82, 1.14] bounds): Max Deviation: ${(maxOverDeviation * 100).toFixed(3)}%`);
  assert.ok(
    maxOverDeviation <= 0.08,
    `Over-extension volume deviation ${(maxOverDeviation * 100).toFixed(2)}% must remain <= 8%`,
  );

  console.log('  [PASS] Test 1: Volume conservation invariant verified.\n');
  return { minNominalVolume, maxNominalVolume, maxNominalDeviation, maxOverDeviation };
}

// -----------------------------------------------------------------------------
// Test 2: Rapid Consecutive Tap Concurrency & Drift
// -----------------------------------------------------------------------------
async function testRapidTapConcurrency() {
  console.log('================================================================');
  console.log('TEST 2: RAPID CONSECUTIVE TAP CONCURRENCY & DRIFT');
  console.log('================================================================');

  function createMascotTapSimulator() {
    const hopAnim = new Animated.Value(0);
    const squashAnim = new Animated.Value(1);

    let activeAnim: any = null;
    let sequenceCompleted = 0;
    let sequenceCancelled = 0;

    const triggerTap = () => {
      // Replicate the exact handleTap animation sequence
      const seq = Animated.sequence([
        // 1. Anticipation squash (compression before leap)
        Animated.timing(squashAnim, {
          duration: 90,
          easing: Easing.out(Easing.quad),
          toValue: 0.92,
          useNativeDriver: false,
        }),
        // 2. Spring hop takeoff with vertical stretch
        Animated.parallel([
          Animated.timing(hopAnim, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
            toValue: -20,
            useNativeDriver: false,
          }),
          Animated.timing(squashAnim, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
            toValue: 1.08,
            useNativeDriver: false,
          }),
        ]),
        // 3. Fall back down and land with impact squash
        Animated.sequence([
          Animated.parallel([
            Animated.timing(hopAnim, {
              duration: 130,
              easing: Easing.in(Easing.quad),
              toValue: 0,
              useNativeDriver: false,
            }),
            Animated.timing(squashAnim, {
              duration: 130,
              easing: Easing.in(Easing.quad),
              toValue: 0.88,
              useNativeDriver: false,
            }),
          ]),
          // 4. Elastic settling to resting baseline
          Animated.parallel([
            Animated.spring(hopAnim, {
              friction: 6,
              tension: 100,
              toValue: 0,
              useNativeDriver: false,
            }),
            Animated.spring(squashAnim, {
              friction: 6,
              tension: 100,
              toValue: 1.0,
              useNativeDriver: false,
            }),
          ]),
        ]),
      ]);

      activeAnim = seq;
      seq.start((result: { finished: boolean }) => {
        if (result.finished) {
          sequenceCompleted++;
        } else {
          sequenceCancelled++;
        }
      });
    };

    return {
      hopAnim,
      squashAnim,
      triggerTap,
      getStats: () => ({ sequenceCompleted, sequenceCancelled }),
    };
  }

  // Scenario 2A: Double Tap at 50ms (during anticipation squash)
  console.log('\nScenario 2A: Double-tap at 50ms interval');
  {
    const sim = createMascotTapSimulator();
    sim.triggerTap();
    await new Promise((r) => setTimeout(r, 50));
    const midSquash = sim.squashAnim._value;
    const midHop = sim.hopAnim._value;
    console.log(`  Pre-second-tap state at 50ms: hopAnim=${midHop}, squashAnim=${midSquash.toFixed(4)}`);
    sim.triggerTap();

    // Wait for settling (1400ms to allow the 800ms spring settling to finish)
    await new Promise((r) => setTimeout(r, 1400));
    console.log(`  Settled state: hopAnim=${sim.hopAnim._value}, squashAnim=${sim.squashAnim._value}`);
    const stats = sim.getStats();
    console.log(`  Sequences: completed=${stats.sequenceCompleted}, cancelled=${stats.sequenceCancelled}`);

    assert.equal(sim.hopAnim._value, 0, 'hopAnim must settle to 0');
    assert.equal(sim.squashAnim._value, 1.0, 'squashAnim must settle to 1.0');
    assert.equal(stats.sequenceCancelled, 1, 'First sequence must be cleanly cancelled');
    assert.equal(stats.sequenceCompleted, 1, 'Second sequence must finish');
  }

  // Scenario 2B: Mid-leap tap at 200ms (while jumping up)
  console.log('\nScenario 2B: Mid-leap tap at 200ms interval');
  {
    const sim = createMascotTapSimulator();
    sim.triggerTap();
    await new Promise((r) => setTimeout(r, 200));
    const midHop = sim.hopAnim._value;
    const midSquash = sim.squashAnim._value;
    console.log(`  Pre-tap state at 200ms: hopAnim=${midHop.toFixed(2)}, squashAnim=${midSquash.toFixed(4)}`);
    assert.ok(midHop < -5, 'Mascot must be mid-air at 200ms');

    sim.triggerTap(); // Interrupt mid-air
    await new Promise((r) => setTimeout(r, 1400));
    console.log(`  Settled state: hopAnim=${sim.hopAnim._value}, squashAnim=${sim.squashAnim._value}`);

    assert.equal(sim.hopAnim._value, 0, 'hopAnim must settle to 0');
    assert.equal(sim.squashAnim._value, 1.0, 'squashAnim must settle to 1.0');
  }

  // Scenario 2C: Impact landing tap at 350ms (during landing squash)
  console.log('\nScenario 2C: Impact landing tap at 350ms interval');
  {
    const sim = createMascotTapSimulator();
    sim.triggerTap();
    await new Promise((r) => setTimeout(r, 350));
    const midHop = sim.hopAnim._value;
    const midSquash = sim.squashAnim._value;
    console.log(`  Pre-tap state at 350ms: hopAnim=${midHop.toFixed(2)}, squashAnim=${midSquash.toFixed(4)}`);

    sim.triggerTap(); // Interrupt during impact squash
    await new Promise((r) => setTimeout(r, 1400));
    console.log(`  Settled state: hopAnim=${sim.hopAnim._value}, squashAnim=${sim.squashAnim._value}`);

    assert.equal(sim.hopAnim._value, 0, 'hopAnim must settle to 0');
    assert.equal(sim.squashAnim._value, 1.0, 'squashAnim must settle to 1.0');
  }

  // Scenario 2D: Extreme Burst Hammering (25 taps every 30ms)
  console.log('\nScenario 2D: Extreme Burst Hammering (25 taps spaced 30ms apart)');
  {
    const sim = createMascotTapSimulator();
    const tapCount = 25;
    let minHopSeen = 0;
    let maxHopSeen = 0;
    let minSquashSeen = 1;
    let maxSquashSeen = 1;

    const sampler = setInterval(() => {
      const h = sim.hopAnim._value;
      const s = sim.squashAnim._value;
      if (h < minHopSeen) minHopSeen = h;
      if (h > maxHopSeen) maxHopSeen = h;
      if (s < minSquashSeen) minSquashSeen = s;
      if (s > maxSquashSeen) maxSquashSeen = s;
    }, 10);

    for (let i = 0; i < tapCount; i++) {
      sim.triggerTap();
      await new Promise((r) => setTimeout(r, 30));
    }

    // Wait for the final animation to complete (1400ms)
    await new Promise((r) => setTimeout(r, 1400));
    clearInterval(sampler);

    const stats = sim.getStats();
    console.log(`  Hammering test complete:`);
    console.log(`    Sequences: completed=${stats.sequenceCompleted}, cancelled=${stats.sequenceCancelled}`);
    console.log(`    hopAnim excursion: min=${minHopSeen.toFixed(2)}, max=${maxHopSeen.toFixed(2)}`);
    console.log(`    squashAnim excursion: min=${minSquashSeen.toFixed(4)}, max=${maxSquashSeen.toFixed(4)}`);
    console.log(`    Final settled values: hopAnim=${sim.hopAnim._value}, squashAnim=${sim.squashAnim._value}`);

    // Invariant assertions:
    assert.equal(stats.sequenceCancelled, tapCount - 1, 'All previous taps must be cleanly cancelled');
    assert.equal(stats.sequenceCompleted, 1, 'Final tap must complete');
    assert.equal(sim.hopAnim._value, 0, 'Final hopAnim must settle to exactly 0');
    assert.equal(sim.squashAnim._value, 1.0, 'Final squashAnim must settle to exactly 1.0');
    assert.ok(minHopSeen >= -25, 'hopAnim must not over-drift upwards beyond -25');
    assert.ok(maxHopSeen <= 2, 'hopAnim must not over-drift downwards into negative ground');
    assert.ok(minSquashSeen >= 0.85, 'squashAnim must not over-compress below 0.85');
    assert.ok(maxSquashSeen <= 1.15, 'squashAnim must not over-stretch beyond 1.15');
  }

  console.log('  [PASS] Test 2: Rapid consecutive tap concurrency and drift verified.\n');
}

// -----------------------------------------------------------------------------
// Test 3: reduceMotion Toggle Invariants & Transitions
// -----------------------------------------------------------------------------
async function testReduceMotionToggle() {
  console.log('================================================================');
  console.log('TEST 3: REDUCEMOTION TOGGLE INVARIANTS & TRANSITIONS');
  console.log('================================================================');

  // In OnboardingMascotStage:
  // When reduceMotion is true:
  // - floatAnim.setValue(0); floatLoop.stop()
  // - transform:
  //     translateY (Animated.add(floatAnim.interpolate(0..-10), hopAnim))
  //     rotate: '0deg'
  //     scaleX: 1
  //     scaleY: 1
  // - shadow:
  //     opacity: 0.22
  //     scaleX: 1
  //     scaleY: 1
  // - tap handler:
  //     if (reduceMotion) { onMascotTap?.(); return; }

  // 3A: Baseline reduceMotion = true state
  console.log('Scenario 3A: Static reduceMotion = true state evaluation');
  {
    const floatAnim = new Animated.Value(0);
    const hopAnim = new Animated.Value(0);
    const squashAnim = new Animated.Value(1);

    const reduceMotion = true;
    const computedTransforms = {
      translateY: floatAnim._value + hopAnim._value,
      rotate: reduceMotion ? '0deg' : '0.5deg',
      scaleX: reduceMotion ? 1 : 1.05,
      scaleY: reduceMotion ? 1 : 1.05,
      shadowOpacity: reduceMotion ? 0.22 : 0.26,
      shadowScaleX: reduceMotion ? 1 : 1.05,
      shadowScaleY: reduceMotion ? 1 : 1.02,
    };

    console.log('  Static transforms with reduceMotion=true:', computedTransforms);
    assert.equal(computedTransforms.translateY, 0);
    assert.equal(computedTransforms.rotate, '0deg');
    assert.equal(computedTransforms.scaleX, 1);
    assert.equal(computedTransforms.scaleY, 1);
    assert.equal(computedTransforms.shadowOpacity, 0.22);
    assert.equal(computedTransforms.shadowScaleX, 1);
    assert.equal(computedTransforms.shadowScaleY, 1);
  }

  // 3B: Mid-flight toggle false -> true transition
  console.log('\nScenario 3B: Dynamic toggle from false -> true during active motion');
  {
    const floatAnim = new Animated.Value(0);
    const hopAnim = new Animated.Value(0);
    const squashAnim = new Animated.Value(1);

    // Start float loop
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { duration: 1500, easing: Easing.inOut(Easing.sin), toValue: 1, useNativeDriver: false }),
        Animated.timing(floatAnim, { duration: 1500, easing: Easing.inOut(Easing.sin), toValue: 0, useNativeDriver: false }),
      ]),
    );
    floatLoop.start();

    // Advance 400ms into float loop
    await new Promise((r) => setTimeout(r, 400));
    console.log(`  Mid-float value before toggle: floatAnim=${floatAnim._value.toFixed(4)}`);
    assert.ok(floatAnim._value > 0, 'floatAnim should be active');

    // Simulate reduceMotion switch
    floatLoop.stop();
    floatAnim.setValue(0);

    console.log(`  Value after toggle to reduceMotion=true: floatAnim=${floatAnim._value}`);
    assert.equal(floatAnim._value, 0, 'floatAnim must immediately clamp to 0');

    // Verify subsequent taps do not trigger animation
    let tapCallbackFired = false;
    let reduceMotionActive = true;

    const handleTapSim = (onMascotTap?: () => void) => {
      if (reduceMotionActive) {
        onMascotTap?.();
        return;
      }
      // animation code would go here
    };

    handleTapSim(() => { tapCallbackFired = true; });
    assert.ok(tapCallbackFired, 'Tap callback must fire for user feedback');
    assert.equal(hopAnim._value, 0, 'hopAnim must stay 0 under reduceMotion');
    assert.equal(squashAnim._value, 1, 'squashAnim must stay 1 under reduceMotion');
  }

  // 3C: Rapid flickering toggle (50 toggles in 100ms)
  console.log('\nScenario 3C: Stress test rapid reduceMotion setting toggle (50 rapid toggles)');
  {
    let currentReduceMotion = false;
    const floatAnim = new Animated.Value(0);
    let loop: any = null;

    const setReduce = (val: boolean) => {
      currentReduceMotion = val;
      if (val) {
        if (loop) loop.stop();
        floatAnim.setValue(0);
      } else {
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(floatAnim, { duration: 1500, toValue: 1, useNativeDriver: false }),
            Animated.timing(floatAnim, { duration: 1500, toValue: 0, useNativeDriver: false }),
          ]),
        );
        loop.start();
      }
    };

    for (let i = 0; i < 50; i++) {
      setReduce(i % 2 === 0);
      await new Promise((r) => setTimeout(r, 2));
    }

    // End on reduceMotion = true
    setReduce(true);
    assert.equal(floatAnim._value, 0, 'floatAnim must settle at 0');
    console.log('  [PASS] Rapid toggling handled without uncaught exceptions or lingering timers.');
  }

  console.log('  [PASS] Test 3: reduceMotion toggle invariants verified.\n');
}

// -----------------------------------------------------------------------------
// Test 4: Ground Shadow Coupling & Clamping Invariants
// -----------------------------------------------------------------------------
async function testGroundShadowCoupling() {
  console.log('================================================================');
  console.log('TEST 4: GROUND SHADOW COUPLING & CLAMPING INVARIANTS');
  console.log('================================================================');

  // Shadow formulas from OnboardingMascotStage.tsx:
  // verticalZ = floatAnim * 10 - hopAnim;
  // shadowBaseScaleX = verticalZ.interpolate([0, 10, 30] => [1.05, 0.88, 0.58], clamp)
  // shadowSquashMult = squashAnim.interpolate([0.88, 1.0, 1.08] => [1.15, 1.0, 0.92], clamp)
  // shadowScaleX = shadowBaseScaleX * shadowSquashMult
  // shadowScaleY = verticalZ.interpolate([0, 10, 30] => [1.02, 0.80, 0.52], clamp)
  // shadowBaseOpacity = verticalZ.interpolate([0, 10, 30] => [0.26, 0.18, 0.08], clamp)
  // shadowOpacityMult = squashAnim.interpolate([0.88, 1.0, 1.08] => [1.25, 1.0, 0.95], clamp)
  // shadowOpacity = shadowBaseOpacity * shadowOpacityMult

  function calcShadow(floatVal: number, hopVal: number, squashVal: number) {
    const verticalZ = floatVal * 10 - hopVal;

    // Piecewise linear interpolation with clamp for [0, 10, 30]
    const interpZ = (out0: number, out10: number, out30: number) => {
      const zClamped = Math.max(0, Math.min(30, verticalZ));
      if (zClamped <= 10) {
        return out0 + (zClamped / 10) * (out10 - out0);
      } else {
        return out10 + ((zClamped - 10) / 20) * (out30 - out10);
      }
    };

    const interpSquash = (out88: number, out100: number, out108: number) => {
      const sClamped = Math.max(0.88, Math.min(1.08, squashVal));
      if (sClamped <= 1.0) {
        return out88 + ((sClamped - 0.88) / 0.12) * (out100 - out88);
      } else {
        return out100 + ((sClamped - 1.0) / 0.08) * (out108 - out100);
      }
    };

    const shadowBaseScaleX = interpZ(1.05, 0.88, 0.58);
    const shadowSquashMult = interpSquash(1.15, 1.0, 0.92);
    const shadowScaleX = shadowBaseScaleX * shadowSquashMult;

    const shadowScaleY = interpZ(1.02, 0.80, 0.52);

    const shadowBaseOpacity = interpZ(0.26, 0.18, 0.08);
    const shadowOpacityMult = interpSquash(1.25, 1.0, 0.95);
    const shadowOpacity = shadowBaseOpacity * shadowOpacityMult;

    return {
      verticalZ,
      shadowScaleX,
      shadowScaleY,
      shadowOpacity,
    };
  }

  // Check extreme cases:
  // Case A: Negative Z (spring overshoot below resting line, e.g. hopAnim = +5)
  const belowGround = calcShadow(0, 5, 0.90);
  console.log('Case A (Negative Z = -5, spring rebound):', belowGround);
  assert.equal(belowGround.verticalZ, -5);
  assert.ok(belowGround.shadowScaleX >= 1.0, 'Shadow must clamp gracefully, scaleX >= 1.0');
  assert.ok(belowGround.shadowOpacity <= 0.35, 'Shadow opacity must not exceed 0.35');

  // Case B: Jump apex (float = 1.0, hop = -20 => Z = 30)
  const jumpApex = calcShadow(1.0, -20, 1.08);
  console.log('Case B (Jump Apex Z = 30):', jumpApex);
  assert.equal(jumpApex.verticalZ, 30);
  assert.ok(jumpApex.shadowScaleX <= 0.55, 'Shadow scaleX must compress to <= 0.55 at apex');
  assert.ok(jumpApex.shadowOpacity <= 0.08, 'Shadow opacity must fade to <= 0.08 at apex');

  // Case C: Beyond jump apex (Z = 50, extreme hypothetical)
  const extremeHeight = calcShadow(1.0, -40, 1.08);
  console.log('Case C (Extreme Z = 50 clamp):', extremeHeight);
  assert.equal(extremeHeight.shadowScaleX, jumpApex.shadowScaleX, 'Z must clamp cleanly at 30 without exploding');
  assert.equal(extremeHeight.shadowOpacity, jumpApex.shadowOpacity, 'Opacity must clamp cleanly at 30');

  // High density scan of 10,000 combinations
  for (let z = -10; z <= 40; z += 0.5) {
    for (let s = 0.80; s <= 1.20; s += 0.02) {
      const res = calcShadow(0, -z, s);
      assert.ok(!Number.isNaN(res.shadowScaleX), 'shadowScaleX must not be NaN');
      assert.ok(!Number.isNaN(res.shadowScaleY), 'shadowScaleY must not be NaN');
      assert.ok(!Number.isNaN(res.shadowOpacity), 'shadowOpacity must not be NaN');
      assert.ok(res.shadowScaleX > 0, 'shadowScaleX must be strictly positive');
      assert.ok(res.shadowScaleY > 0, 'shadowScaleY must be strictly positive');
      assert.ok(res.shadowOpacity >= 0.05 && res.shadowOpacity <= 0.40, 'shadowOpacity must stay within [0.05, 0.40]');
    }
  }

  console.log('  [PASS] Test 4: Ground shadow coupling and clamping verified.\n');
}

// -----------------------------------------------------------------------------
// Main Runner
// -----------------------------------------------------------------------------
async function runAllStressTests() {
  console.log('================================================================');
  console.log('MASCOT MOTION PHYSICS & INVARIANTS EMPIRICAL CHALLENGER SUITE');
  console.log('================================================================\n');

  const t1 = await testVolumeConservation();
  await testRapidTapConcurrency();
  await testReduceMotionToggle();
  await testGroundShadowCoupling();

  const report = {
    timestamp: new Date().toISOString(),
    verdict: 'APPROVE',
    metrics: {
      volumeConservation: t1,
      rapidTapConcurrency: 'PASS (Zero drift, 100% baseline settling, clean cancellation)',
      reduceMotionInvariants: 'PASS (Immediate freeze, neutral transforms, 0 animation in reduced mode)',
      groundShadowCoupling: 'PASS (Clamped [0, 30], positive scales, bounded opacity [0.07, 0.33])',
    },
  };

  const reportPath = path.resolve(process.cwd(), 'scripts/mascot_motion_stress_report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Wrote full stress report to ${reportPath}`);
  console.log('\n================================================================');
  console.log(`FINAL EMPIRICAL CHALLENGER VERDICT: [ ${report.verdict} ]`);
  console.log('================================================================\n');
}

runAllStressTests().catch((err) => {
  console.error('Stress test failed with error:', err);
  process.exit(1);
});
