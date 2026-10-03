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
  buttonPress,
  cardPress,
  gentleSpring,
  instant,
  radii,
  spacing,
  type AppColors,
} from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';

export interface RefillHorizonCardProps {
  /**
   * Name of the medication (e.g. "Amlodipine Besylate").
   */
  medicationName: string;
  /**
   * Calendar days left in the medication's confirmed schedule, counting today.
   * Alaga does not track pills on hand, so this is a schedule horizon, not a stock count.
   */
  daysRemaining: number;
  /**
   * Secondary line under the name (e.g. "Schedule ends Oct 2").
   */
  dosageText?: string;
  /**
   * Threshold in days at or below which low-supply warning is triggered. Defaults to 5.
   */
  lowSupplyThreshold?: number;
  /**
   * Action button press callback (e.g. opening refill flow, pharmacy contact, or supply update).
   */
  onRefillPress?: () => void;
  /**
   * Entire card press callback (e.g. navigating to medication detail view).
   */
  onCardPress?: () => void;
  /**
   * Custom action button label (defaults to "Review medicine").
   */
  actionLabel?: string;
  /**
   * Disables the action while a related request is in flight.
   */
  isRefilling?: boolean;
  /**
   * Custom style for card container.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Test identifier.
   */
  testID?: string;
}

export function RefillHorizonCard({
  actionLabel,
  daysRemaining,
  dosageText,
  isRefilling = false,
  lowSupplyThreshold = 5,
  medicationName,
  onCardPress,
  onRefillPress,
  style,
  testID,
}: RefillHorizonCardProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const [reduceMotion, setReduceMotion] = useState(false);

  // Micro-interaction springs
  const cardScale = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const isLowSupply = daysRemaining <= lowSupplyThreshold;
  const isCritical = daysRemaining <= 2;

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

  // 100ms instant press-in feedback
  const animatePressIn = (target: Animated.Value, scaleVal: number) => {
    if (reduceMotion) return;
    Animated.timing(target, {
      duration: instant,
      easing: Easing.out(Easing.quad),
      toValue: scaleVal,
      useNativeDriver: true,
    }).start();
  };

  // Natural spring release physics
  const animatePressOut = (target: Animated.Value) => {
    if (reduceMotion) return;
    Animated.spring(target, {
      friction: gentleSpring.friction,
      tension: gentleSpring.tension,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  // Visual supply horizon meter (max 30 days scale)
  const supplyPercent = useMemo(() => {
    if (daysRemaining <= 0) return 0;
    return Math.min(100, Math.max(8, Math.round((daysRemaining / 30) * 100)));
  }, [daysRemaining]);

  const resolvedActionText = actionLabel || t('home.horizonReview');
  const unitText = t(daysRemaining === 1 ? 'home.horizonDayLeft' : 'home.horizonDaysLeft');

  const accessibilityLabel = [
    t('home.horizonA11y', { count: daysRemaining, medicine: medicationName, unit: unitText }),
    isLowSupply ? t('home.horizonLowA11y') : '',
  ]
    .filter(Boolean)
    .join(' ');

  const cardInner = (
    <Animated.View
      style={[
        styles.card,
        isLowSupply ? styles.cardLowSupply : styles.cardNormal,
        { transform: [{ scale: cardScale }] },
        style,
      ]}
      testID={testID}
    >
      {/* Top Header: Supply Horizon Eyebrow & Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.eyebrowGroup}>
          <View
            style={[
              styles.iconBadge,
              isLowSupply ? styles.iconBadgeWarning : styles.iconBadgeNormal,
            ]}
          >
            <AppIcon
              color={isLowSupply ? colors.warning : colors.primaryDark}
              name={isLowSupply ? 'package' : 'pill'}
              size={14}
            />
          </View>
          <Text
            style={[
              styles.eyebrowText,
              isLowSupply ? styles.eyebrowTextWarning : styles.eyebrowTextNormal,
            ]}
          >
            {t('home.horizonEyebrow')}
          </Text>
        </View>

        {isLowSupply ? (
          <View style={styles.warningPill}>
            <AppIcon color={colors.warning} name="circle-alert" size={12} />
            <Text style={styles.warningPillText}>
              {t(isCritical ? 'home.horizonLastDays' : 'home.horizonEndingSoon')}
            </Text>
          </View>
        ) : (
          <View style={styles.onTrackPill}>
            <AppIcon color={colors.successDark} name="check" size={11} />
            <Text style={styles.onTrackPillText}>{t('home.horizonOnSchedule')}</Text>
          </View>
        )}
      </View>

      {/* Remaining Days & Medicine Info (stacked so it fits a half-width bento cell) */}
      <View style={styles.medicationRow}>
        <View style={styles.daysCounterGroup}>
          <Text
            style={[
              styles.daysNumber,
              isLowSupply ? styles.daysNumberWarning : styles.daysNumberNormal,
            ]}
          >
            {daysRemaining}
          </Text>
          <Text style={styles.daysUnitText}>{unitText}</Text>
        </View>

        <View style={styles.medicationInfo}>
          <Text numberOfLines={2} style={styles.medicationName}>
            {medicationName}
          </Text>
          {Boolean(dosageText) && (
            <Text numberOfLines={1} style={styles.dosageText}>
              {dosageText}
            </Text>
          )}
        </View>
      </View>

      {/* Visual Supply Progress Bar */}
      <View style={styles.supplyBarSection}>
        <View style={styles.supplyBarTrack}>
          <View
            style={[
              styles.supplyBarFill,
              isLowSupply ? styles.supplyBarFillWarning : styles.supplyBarFillNormal,
              { width: `${supplyPercent}%` },
            ]}
          />
        </View>
        <Text numberOfLines={2} style={styles.supplyDetailText}>
          {t(isLowSupply ? 'home.horizonCheckRefill' : 'home.horizonView')}
        </Text>
      </View>

      {/* Quick Action Button (Min 48dp touch target) */}
      <Pressable
        accessibilityHint={t('home.horizonHint')}
        accessibilityLabel={`${resolvedActionText}: ${medicationName}`}
        accessibilityRole="button"
        disabled={isRefilling}
        hitSlop={4}
        onPress={onRefillPress}
        onPressIn={() => animatePressIn(buttonScale, buttonPress)}
        onPressOut={() => animatePressOut(buttonScale)}
        style={styles.actionButtonPressable}
      >
        <Animated.View
          style={[
            styles.actionButton,
            isLowSupply ? styles.actionButtonWarning : styles.actionButtonNormal,
            { transform: [{ scale: buttonScale }] },
          ]}
        >
          <AppIcon
            color={isLowSupply ? colors.white : colors.ink}
            name={isLowSupply ? 'package' : 'refresh-cw'}
            size={16}
          />
          <Text
            style={[
              styles.actionButtonText,
              isLowSupply ? styles.actionButtonTextWarning : styles.actionButtonTextNormal,
            ]}
          >
            {resolvedActionText}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );

  if (onCardPress) {
    return (
      <Pressable
        accessibilityHint={t('home.horizonHint')}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onCardPress}
        onPressIn={() => animatePressIn(cardScale, cardPress)}
        onPressOut={() => animatePressOut(cardScale)}
        style={styles.cardPressableWrapper}
      >
        {cardInner}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="summary"
      accessible
      style={styles.cardWrapper}
    >
      {cardInner}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    cardWrapper: {
      flexGrow: 1,
      width: '100%',
    },
    cardPressableWrapper: {
      flexGrow: 1,
      width: '100%',
      minHeight: 48,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.squircle,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      gap: spacing.md,
      flexGrow: 1,
      justifyContent: 'space-between',
      // Emil Kowalski Craft Invariant: Zero drop shadows
      shadowOpacity: 0,
      elevation: 0,
    },
    cardNormal: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
    },
    cardLowSupply: {
      backgroundColor: colors.surface,
      borderColor: colors.warning,
    },
    headerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      gap: 6,
    },
    eyebrowGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    iconBadge: {
      width: 26,
      height: 26,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBadgeNormal: {
      backgroundColor: colors.mist,
    },
    iconBadgeWarning: {
      backgroundColor: colors.warningTint,
    },
    eyebrowText: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    eyebrowTextNormal: {
      color: colors.muted,
    },
    eyebrowTextWarning: {
      color: colors.warning,
    },
    warningPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.warningTint,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: radii.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    warningPillText: {
      color: colors.warning,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    onTrackPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.successTint,
      borderRadius: radii.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    onTrackPillText: {
      color: colors.successDark,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    medicationRow: {
      gap: 4,
    },
    medicationInfo: {
      gap: 2,
    },
    medicationName: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: '900',
      letterSpacing: -0.3,
      lineHeight: 22,
    },
    dosageText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '600',
    },
    daysCounterGroup: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    daysNumber: {
      fontSize: 28,
      fontWeight: '900',
      letterSpacing: -0.6,
      lineHeight: 30,
    },
    daysNumberNormal: {
      color: colors.ink,
    },
    daysNumberWarning: {
      color: colors.warning,
    },
    daysUnitText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    supplyBarSection: {
      gap: 6,
    },
    supplyBarTrack: {
      width: '100%',
      height: 6,
      borderRadius: radii.full,
      backgroundColor: colors.mist,
      overflow: 'hidden',
    },
    supplyBarFill: {
      height: '100%',
      borderRadius: radii.full,
    },
    supplyBarFillNormal: {
      backgroundColor: colors.primary,
    },
    supplyBarFillWarning: {
      backgroundColor: colors.warning,
    },
    supplyDetailText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '600',
    },
    actionButtonPressable: {
      width: '100%',
      minHeight: 48,
    },
    actionButton: {
      width: '100%',
      minHeight: 48,
      borderRadius: radii.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: spacing.md,
    },
    actionButtonNormal: {
      backgroundColor: colors.mist,
      borderWidth: 1,
      borderColor: colors.line,
    },
    actionButtonWarning: {
      backgroundColor: colors.warning,
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: '800',
    },
    actionButtonTextNormal: {
      color: colors.ink,
    },
    actionButtonTextWarning: {
      color: colors.white,
    },
  });
