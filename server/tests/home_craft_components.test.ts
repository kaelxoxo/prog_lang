import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { describe, it } from 'node:test';

const ROOT_DIR = path.resolve(__dirname, '../..');
const CARE_STREAK_BADGE_PATH = path.join(ROOT_DIR, 'src/features/home/CareStreakBadge.tsx');
const REFILL_HORIZON_CARD_PATH = path.join(ROOT_DIR, 'src/features/home/RefillHorizonCard.tsx');

describe('Home Craft Components Suite (Emil Kowalski Invariants & Accessibility)', () => {
  describe('CareStreakBadge Component', () => {
    it('source file exists and exports CareStreakBadge and CareStreakBadgeProps', () => {
      assert.ok(fs.existsSync(CARE_STREAK_BADGE_PATH), 'CareStreakBadge.tsx must exist');
      const content = fs.readFileSync(CARE_STREAK_BADGE_PATH, 'utf8');
      assert.ok(content.includes('export function CareStreakBadge'), 'Must export CareStreakBadge function');
      assert.ok(content.includes('export interface CareStreakBadgeProps'), 'Must export CareStreakBadgeProps');
    });

    it('enforces Zero Drop Shadows invariant', () => {
      const content = fs.readFileSync(CARE_STREAK_BADGE_PATH, 'utf8');
      assert.ok(content.includes('shadowOpacity: 0'), 'Must enforce shadowOpacity: 0');
      assert.ok(content.includes('elevation: 0'), 'Must enforce elevation: 0');
      assert.ok(!content.includes('shadowRadius'), 'Must not have shadowRadius blur');
    });

    it('implements Emil Kowalski micro-interaction tokens (100ms instant, gentleSpring, snappySpring, cardPress)', () => {
      const content = fs.readFileSync(CARE_STREAK_BADGE_PATH, 'utf8');
      assert.ok(content.includes('cardPress'), 'Must use cardPress (0.98 scale compression)');
      assert.ok(content.includes('gentleSpring'), 'Must use gentleSpring physics for release');
      assert.ok(content.includes('snappySpring'), 'Must use snappySpring physics for milestone pulse');
      assert.ok(content.includes('instant'), 'Must use instant (100ms) for press feedback');
      assert.ok(content.includes('useNativeDriver: true'), 'Animations must run on native driver');
    });

    it('respects system reduceMotion accessibility settings', () => {
      const content = fs.readFileSync(CARE_STREAK_BADGE_PATH, 'utf8');
      assert.ok(content.includes('AccessibilityInfo.isReduceMotionEnabled'), 'Must query reduceMotionEnabled');
      assert.ok(content.includes('reduceMotionChanged'), 'Must listen to reduceMotionChanged events');
      assert.ok(content.includes('if (reduceMotion) return;'), 'Must bypass animations when reduceMotion is true');
    });

    it('enforces minimum 48dp touch targets', () => {
      const content = fs.readFileSync(CARE_STREAK_BADGE_PATH, 'utf8');
      assert.ok(content.includes('minHeight: 48'), 'Interactive wrappers must guarantee minHeight: 48dp');
    });

    it('supports both card and compact variants with accessible labels', () => {
      const content = fs.readFileSync(CARE_STREAK_BADGE_PATH, 'utf8');
      assert.ok(content.includes("variant === 'compact'"), 'Must support compact pill variant');
      assert.ok(content.includes('accessibilityLabel='), 'Must provide comprehensive accessibilityLabel');
      assert.ok(content.includes('accessibilityRole="button"'), 'Pressable states must provide accessibilityRole button');
      assert.ok(content.includes('accessibilityRole="summary"'), 'Non-pressable states must provide accessibilityRole summary');
    });
  });

  describe('RefillHorizonCard Component', () => {
    it('source file exists and exports RefillHorizonCard and RefillHorizonCardProps', () => {
      assert.ok(fs.existsSync(REFILL_HORIZON_CARD_PATH), 'RefillHorizonCard.tsx must exist');
      const content = fs.readFileSync(REFILL_HORIZON_CARD_PATH, 'utf8');
      assert.ok(content.includes('export function RefillHorizonCard'), 'Must export RefillHorizonCard function');
      assert.ok(content.includes('export interface RefillHorizonCardProps'), 'Must export RefillHorizonCardProps');
    });

    it('enforces Zero Drop Shadows invariant', () => {
      const content = fs.readFileSync(REFILL_HORIZON_CARD_PATH, 'utf8');
      assert.ok(content.includes('shadowOpacity: 0'), 'Must enforce shadowOpacity: 0');
      assert.ok(content.includes('elevation: 0'), 'Must enforce elevation: 0');
      assert.ok(!content.includes('shadowRadius'), 'Must not have shadowRadius blur');
    });

    it('implements Emil Kowalski micro-interaction tokens (buttonPress, cardPress, gentleSpring, instant)', () => {
      const content = fs.readFileSync(REFILL_HORIZON_CARD_PATH, 'utf8');
      assert.ok(content.includes('buttonPress'), 'Must use buttonPress (0.96 scale compression) for CTA');
      assert.ok(content.includes('cardPress'), 'Must use cardPress (0.98 scale compression) for card wrapper');
      assert.ok(content.includes('gentleSpring'), 'Must use gentleSpring physics for release');
      assert.ok(content.includes('instant'), 'Must use instant (100ms) for press feedback');
      assert.ok(content.includes('useNativeDriver: true'), 'Animations must run on native driver');
    });

    it('respects system reduceMotion accessibility settings', () => {
      const content = fs.readFileSync(REFILL_HORIZON_CARD_PATH, 'utf8');
      assert.ok(content.includes('AccessibilityInfo.isReduceMotionEnabled'), 'Must query reduceMotionEnabled');
      assert.ok(content.includes('reduceMotionChanged'), 'Must listen to reduceMotionChanged events');
      assert.ok(content.includes('if (reduceMotion) return;'), 'Must bypass animations when reduceMotion is true');
    });

    it('enforces minimum 48dp touch targets on CTA and card', () => {
      const content = fs.readFileSync(REFILL_HORIZON_CARD_PATH, 'utf8');
      assert.ok(content.includes('actionButtonPressable: {'), 'Must have actionButtonPressable style');
      assert.ok(content.includes('minHeight: 48'), 'Must enforce minHeight: 48dp on pressables');
    });

    it('calculates low supply threshold and visual supply percentage', () => {
      const content = fs.readFileSync(REFILL_HORIZON_CARD_PATH, 'utf8');
      assert.ok(content.includes('daysRemaining <= lowSupplyThreshold'), 'Must compare against lowSupplyThreshold');
      assert.ok(content.includes('daysRemaining <= 2'), 'Must detect critical low supply <= 2 days');
      assert.ok(content.includes('Math.round((daysRemaining / 30) * 100)'), 'Must calculate percentage on a 30-day target');
    });

    it('provides accessible TalkBack labels and role attributes', () => {
      const content = fs.readFileSync(REFILL_HORIZON_CARD_PATH, 'utf8');
      assert.ok(content.includes('accessibilityLabel='), 'Must provide dynamic accessibilityLabel');
      assert.ok(content.includes('accessibilityHint='), 'Must provide accessibilityHint');
      assert.ok(content.includes('accessibilityRole="button"'), 'Button must specify accessibilityRole');
    });
  });
});
