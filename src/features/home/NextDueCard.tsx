import React, { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import { actionableAt, type DoseOccurrence } from '../today/types';

export interface NextDueCardProps {
  allHandled: boolean;
  attention: DoseOccurrence[];
  isTaking?: boolean;
  nextDose: DoseOccurrence | null;
  onOpenMedicines: () => void;
  onOpenToday: () => void;
  onTakeDose: (dose: DoseOccurrence) => void;
}

function friendlyTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

export function NextDueCard({
  allHandled,
  attention,
  isTaking = false,
  nextDose,
  onOpenMedicines,
  onOpenToday,
  onTakeDose,
}: NextDueCardProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();

  // Card spring press scale
  const cardScale = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const animatePressIn = (val: Animated.Value) => {
    Animated.timing(val, {
      duration: 100,
      easing: Easing.out(Easing.quad),
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const animatePressOut = (val: Animated.Value) => {
    Animated.spring(val, {
      tension: 140,
      friction: 7,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  // Priority 1: Attention / Overdue dose
  const targetDose = attention.length > 0 ? attention[0] : nextDose;
  const isAttention = attention.length > 0;

  if (allHandled) {
    return (
      <Pressable
        accessibilityLabel="All doses completed for today. Tap to review care log."
        accessibilityRole="button"
        onPress={onOpenToday}
        onPressIn={() => animatePressIn(cardScale)}
        onPressOut={() => animatePressOut(cardScale)}
        style={styles.cardWrapper}
      >
        <Animated.View style={[styles.card, styles.celebrationCard, { transform: [{ scale: cardScale }] }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.celebrationEyebrow}>TODAY'S CARE</Text>
            <AppIcon color={colors.successDark} name="sparkles" size={14} />
          </View>

          <View style={styles.celebrationBody}>
            <View style={styles.celebrationIconWrap}>
              <AppIcon color={colors.successDark} name="circle-check-big" size={32} />
            </View>
            <Text style={styles.celebrationTitle}>{t('home.caughtUp')}</Text>
            <Text numberOfLines={2} style={styles.celebrationSubtext}>
              All scheduled doses recorded
            </Text>
          </View>

          <View style={styles.celebrationFooter}>
            <Text style={styles.viewTimelineLink}>View care log ›</Text>
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  if (!targetDose) {
    return (
      <Pressable
        accessibilityLabel="No doses scheduled. Tap to view medicines."
        accessibilityRole="button"
        onPress={onOpenMedicines}
        onPressIn={() => animatePressIn(cardScale)}
        onPressOut={() => animatePressOut(cardScale)}
        style={styles.cardWrapper}
      >
        <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEyebrow}>SCHEDULE</Text>
            <AppIcon color={colors.muted} name="chevron-right" size={14} />
          </View>

          <View style={styles.emptyBody}>
            <View style={styles.emptyIconWrap}>
              <AppIcon color={colors.primaryDark} name="pill" size={24} />
            </View>
            <Text style={styles.emptyTitle}>{t('home.noMoreDoses')}</Text>
            <Text style={styles.emptySubtext}>{t('home.reviewToday')}</Text>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.viewTimelineLink}>Medicines ›</Text>
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <View style={styles.cardWrapper}>
      <View style={[styles.card, isAttention ? styles.attentionCardBorder : null]}>
        {/* Card Header with Timing Pill */}
        <View style={styles.cardHeader}>
          <View style={styles.eyebrowRow}>
            <AppIcon
              color={isAttention ? colors.warning : colors.primaryDark}
              name={isAttention ? 'circle-alert' : 'clock-3'}
              size={13}
            />
            <Text
              style={[
                styles.cardEyebrow,
                isAttention ? { color: colors.warning } : { color: colors.primaryDark },
              ]}
            >
              {isAttention ? 'OVERDUE' : 'NEXT DUE'}
            </Text>
          </View>

          <View style={[styles.timePill, isAttention ? styles.timePillAttention : styles.timePillNormal]}>
            <Text style={[styles.timePillText, isAttention ? styles.timePillTextAttention : styles.timePillTextNormal]}>
              {friendlyTime(actionableAt(targetDose), localeTag)}
            </Text>
          </View>
        </View>

        {/* Medicine Details */}
        <View style={styles.medDetails}>
          <Text numberOfLines={2} style={styles.medName}>
            {targetDose.medicationName}
          </Text>
          <Text numberOfLines={1} style={styles.medStrength}>
            {targetDose.doseQuantity} {targetDose.doseUnit}
            {targetDose.strengthValue && targetDose.strengthUnit
              ? ` · ${targetDose.strengthValue} ${targetDose.strengthUnit}`
              : ''}
          </Text>
        </View>

        {/* 1-Tap "Take" Action Button */}
        <Pressable
          accessibilityHint="Record this dose as taken now"
          accessibilityLabel={`Take ${targetDose.medicationName}`}
          accessibilityRole="button"
          disabled={isTaking}
          hitSlop={8}
          onPress={() => onTakeDose(targetDose)}
          onPressIn={() => animatePressIn(buttonScale)}
          onPressOut={() => animatePressOut(buttonScale)}
          style={styles.takeButtonPressable}
        >
          <Animated.View
            style={[
              styles.takeButton,
              isAttention ? styles.takeButtonAttention : styles.takeButtonNormal,
              { transform: [{ scale: buttonScale }] },
            ]}
          >
            <AppIcon color={colors.white} name="check" size={16} />
            <Text style={styles.takeButtonText}>
              {isTaking ? 'Recording…' : isAttention ? 'Take Now' : 'Take'}
            </Text>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    cardWrapper: {
      flex: 1,
      minWidth: 140,
    },
    card: {
      backgroundColor: colors.white,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      justifyContent: 'space-between',
      minHeight: 200,
      gap: 10,
    },
    celebrationCard: {
      backgroundColor: colors.successTint,
      borderColor: colors.successBorder,
      alignItems: 'center',
    },
    attentionCardBorder: {
      borderColor: colors.warning,
      backgroundColor: colors.white,
    },
    cardHeader: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 4,
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    cardEyebrow: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    timePill: {
      borderRadius: radii.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    timePillNormal: {
      backgroundColor: colors.primaryTint,
    },
    timePillAttention: {
      backgroundColor: colors.warningTint,
    },
    timePillText: {
      fontSize: 11,
      fontWeight: '800',
    },
    timePillTextNormal: {
      color: colors.primaryDark,
    },
    timePillTextAttention: {
      color: colors.warning,
    },
    medDetails: {
      gap: 3,
      marginVertical: 4,
    },
    medName: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: -0.4,
      lineHeight: 22,
    },
    medStrength: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '600',
    },
    takeButtonPressable: {
      width: '100%',
      minHeight: 48,
    },
    takeButton: {
      minHeight: 48,
      width: '100%',
      borderRadius: radii.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
    },
    takeButtonNormal: {
      backgroundColor: colors.successDark,
    },
    takeButtonAttention: {
      backgroundColor: colors.primary,
    },
    takeButtonText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '800',
    },
    celebrationBody: {
      alignItems: 'center',
      gap: 4,
      marginVertical: 6,
    },
    celebrationIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    celebrationEyebrow: {
      color: colors.successDark,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    celebrationTitle: {
      color: colors.successDark,
      fontSize: 16,
      fontWeight: '900',
      textAlign: 'center',
    },
    celebrationSubtext: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
    },
    celebrationFooter: {
      width: '100%',
      alignItems: 'center',
    },
    viewTimelineLink: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyBody: {
      alignItems: 'center',
      gap: 4,
      marginVertical: 6,
    },
    emptyIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.mist,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptySubtext: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '500',
      textAlign: 'center',
    },
    cardFooter: {
      width: '100%',
      alignItems: 'center',
    },
  });
