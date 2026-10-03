import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import {
  cardPress,
  gentleSpring,
  instant,
  radii,
  snappySpring,
  spacing,
  type AppColors,
} from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import type { CopyKey } from '../settings/translations';
import { useLocale } from '../settings/LocaleProvider';

export interface CareStreakBadgeProps {
  /**
   * Number of consecutive days of consistent care / medication logging.
   */
  streakDays: number;
  /**
   * Optional manual override for milestone celebration state.
   * If omitted, milestone is auto-calculated for meaningful streaks (3, 7, 14, 30, 60, 90, 100+).
   */
  isMilestone?: boolean;
  /**
   * Custom title or badge text for the milestone (e.g. "7-Day Champion").
   */
  milestoneTitle?: string;
  /**
   * Subtitle or motivating copy (e.g. "Great consistency!", "3-day streak").
   */
  subtitle?: string;
  /**
   * Visual presentation variant:
   * - 'card': standard bento card with header, big streak counter, and celebration badge.
   * - 'compact': horizontal compact pill for headers and inline summaries (min 48dp touch target).
   */
  variant?: 'card' | 'compact';
  /**
   * Callback when the badge is tapped.
   */
  onPress?: () => void;
  /**
   * Optional custom container style.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Test identifier.
   */
  testID?: string;
}

/**
 * Checks if a given streak count represents a milestone.
 */
function checkIsMilestone(days: number): boolean {
  if (days < 3) return false;
  if (days === 3 || days === 7 || days === 14 || days === 21 || days === 30) return true;
  return days % 30 === 0 || days % 7 === 0;
}

/**
 * Default encouraging copy key based on streak count.
 */
function streakMessageKey(days: number, isMilestoneAchieved: boolean): CopyKey {
  if (days === 0) return 'home.streakStart';
  if (days === 1) return 'home.streakFirst';
  if (isMilestoneAchieved) return 'home.streakMilestoneCopy';
  if (days < 7) return 'home.streakBuilding';
  return 'home.streakWeek';
}

export function CareStreakBadge({
  isMilestone,
  milestoneTitle,
  onPress,
  streakDays,
  style,
  subtitle,
  testID,
  variant = 'card',
}: CareStreakBadgeProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const [reduceMotion, setReduceMotion] = useState(false);

  // Micro-interaction springs
  const cardScale = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  const milestoneAchieved = typeof isMilestone === 'boolean' ? isMilestone : checkIsMilestone(streakDays);

  // Respect system reduce-motion accessibility setting
  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });
    return () => {
      isMounted = false;
      sub.remove();
    };
  }, []);

  // Emil Kowalski craft: snappy spring pulse on streak number when milestone is reached
  useEffect(() => {
    if (reduceMotion || !milestoneAchieved) return;

    pulseScale.setValue(1);
    const pulseAnim = Animated.sequence([
      Animated.spring(pulseScale, {
        friction: snappySpring.friction,
        tension: snappySpring.tension,
        toValue: 1.2,
        useNativeDriver: true,
      }),
      Animated.spring(pulseScale, {
        friction: gentleSpring.friction,
        tension: gentleSpring.tension,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);

    pulseAnim.start();

    return () => {
      pulseAnim.stop();
    };
  }, [milestoneAchieved, pulseScale, reduceMotion, streakDays]);

  // Emil Kowalski 100ms instant press-in feedback
  const handlePressIn = () => {
    if (reduceMotion) return;
    Animated.timing(cardScale, {
      duration: instant,
      easing: Easing.out(Easing.quad),
      toValue: cardPress,
      useNativeDriver: true,
    }).start();
  };

  // Emil Kowalski natural spring release
  const handlePressOut = () => {
    if (reduceMotion) return;
    Animated.spring(cardScale, {
      friction: gentleSpring.friction,
      tension: gentleSpring.tension,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const statusSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    return t(streakMessageKey(streakDays, milestoneAchieved));
  }, [milestoneAchieved, streakDays, subtitle, t]);

  const milestoneBadgeLabel = useMemo(() => {
    if (milestoneTitle) return milestoneTitle;
    return t('home.streakMilestone', { count: streakDays });
  }, [milestoneTitle, streakDays, t]);

  const unitText = t(streakDays === 1 ? 'home.streakDay' : 'home.streakDays');
  const accessibilityLabel = t('home.streakA11y', {
    count: streakDays,
    status: milestoneAchieved ? `${milestoneBadgeLabel}. ${statusSubtitle}` : statusSubtitle,
    unit: unitText,
  });

  // Render Compact Variant (inline / pill for headers and summary strips)
  if (variant === 'compact') {
    const compactContent = (
      <Animated.View
        style={[
          styles.compactContainer,
          milestoneAchieved && styles.compactContainerMilestone,
          { transform: [{ scale: cardScale }] },
          style,
        ]}
        testID={testID}
      >
        <View style={[styles.compactIconWrap, milestoneAchieved && styles.compactIconWrapMilestone]}>
          <AppIcon color={colors.flame} name="flame" size={16} />
        </View>

        <View style={styles.compactTextGroup}>
          <Animated.Text
            style={[
              styles.compactCount,
              milestoneAchieved && styles.compactCountMilestone,
              { transform: [{ scale: pulseScale }] },
            ]}
          >
            {streakDays}
          </Animated.Text>
          <Text style={styles.compactLabel}>{unitText}</Text>
        </View>

        {milestoneAchieved && (
          <View style={styles.compactMilestoneDot}>
            <AppIcon color={colors.flame} name="sparkles" size={12} />
          </View>
        )}

        {Boolean(onPress) && (
          <AppIcon color={colors.muted} name="chevron-right" size={14} />
        )}
      </Animated.View>
    );

    if (onPress) {
      return (
        <Pressable
          accessibilityHint={t('home.streakHint')}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          hitSlop={4}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.pressableWrapper}
        >
          {compactContent}
        </Pressable>
      );
    }

    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="summary"
        accessible
      >
        {compactContent}
      </View>
    );
  }

  // Render Card Variant (default for Bento grid / dashboard)
  const cardContent = (
    <Animated.View
      style={[
        styles.card,
        milestoneAchieved ? styles.cardMilestone : styles.cardStandard,
        { transform: [{ scale: cardScale }] },
        style,
      ]}
      testID={testID}
    >
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.eyebrowGroup}>
          <View
            style={[
              styles.flameIconWrap,
              milestoneAchieved && styles.flameIconWrapMilestone,
            ]}
          >
            <AppIcon color={colors.flame} name="flame" size={16} />
          </View>
          <Text style={styles.eyebrowText}>{t('home.streakEyebrow')}</Text>
        </View>

        {milestoneAchieved ? (
          <View style={styles.celebrationChip}>
            <AppIcon color={colors.flame} name="sparkles" size={11} />
            <Text numberOfLines={1} style={styles.celebrationChipText}>
              {milestoneBadgeLabel}
            </Text>
          </View>
        ) : Boolean(onPress) ? (
          <AppIcon color={colors.muted} name="chevron-right" size={16} />
        ) : null}
      </View>

      {/* Main Counter & Metric Body */}
      <View style={styles.bodyRow}>
        <View style={styles.counterGroup}>
          <Animated.Text
            style={[
              styles.counterNumber,
              milestoneAchieved && styles.counterNumberMilestone,
              { transform: [{ scale: pulseScale }] },
            ]}
          >
            {streakDays}
          </Animated.Text>
          <View style={styles.counterLabelGroup}>
            <Text style={styles.counterUnitText}>{unitText}</Text>
            <Text style={styles.counterStatusTag}>
              {t(streakDays > 0 ? 'home.streakOnTrack' : 'home.streakReady')}
            </Text>
          </View>
        </View>
      </View>

      {/* Footer / Subtitle Row */}
      <View style={styles.footerRow}>
        <Text numberOfLines={2} style={styles.subtitleText}>
          {statusSubtitle}
        </Text>
        {Boolean(onPress) && (
          <Text style={styles.footerActionText}>{t('home.streakMore')}</Text>
        )}
      </View>
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityHint={t('home.streakHint')}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressableWrapper}
      >
        {cardContent}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="summary"
      accessible
    >
      {cardContent}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    pressableWrapper: {
      flexGrow: 1,
      minHeight: 48,
      width: '100%',
    },
    // Standard Card Visuals
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.squircle,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      flexGrow: 1,
      minHeight: 140,
      justifyContent: 'space-between',
      gap: spacing.sm,
      // Emil Kowalski Craft Invariant: Zero drop shadows
      shadowOpacity: 0,
      elevation: 0,
    },
    cardStandard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
    },
    cardMilestone: {
      backgroundColor: colors.surface,
      borderColor: colors.sun,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      gap: spacing.xs,
    },
    eyebrowGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    flameIconWrap: {
      width: 28,
      height: 28,
      borderRadius: radii.sm,
      backgroundColor: colors.sunTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flameIconWrapMilestone: {
      backgroundColor: colors.sunTint,
      borderWidth: 1,
      borderColor: colors.flameLight,
    },
    eyebrowText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    celebrationChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.sunTint,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.sun,
    },
    celebrationChipText: {
      color: colors.flame,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    bodyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginVertical: 2,
    },
    counterGroup: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    counterNumber: {
      color: colors.ink,
      fontSize: 34,
      fontWeight: '900',
      letterSpacing: -0.8,
      lineHeight: 38,
    },
    counterNumberMilestone: {
      color: colors.flame,
    },
    counterLabelGroup: {
      gap: 1,
    },
    counterUnitText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    counterStatusTag: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      gap: spacing.sm,
    },
    subtitleText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
      lineHeight: 16,
    },
    footerActionText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },

    // Compact Pill Variant
    compactContainer: {
      minHeight: 48,
      backgroundColor: colors.surface,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      // Zero drop shadows
      shadowOpacity: 0,
      elevation: 0,
    },
    compactContainerMilestone: {
      borderColor: colors.sun,
      backgroundColor: colors.surface,
    },
    compactIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.sunTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactIconWrapMilestone: {
      backgroundColor: colors.sunTint,
    },
    compactTextGroup: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    compactCount: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: -0.3,
    },
    compactCountMilestone: {
      color: colors.flame,
    },
    compactLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '700',
    },
    compactMilestoneDot: {
      marginLeft: 2,
    },
  });
