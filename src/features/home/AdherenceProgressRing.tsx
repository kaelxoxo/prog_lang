import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';

export interface AdherenceProgressRingProps {
  handled: number;
  onPress?: () => void;
  percentage: number;
  size?: number;
  strokeWidth?: number;
  total: number;
}

export function AdherenceProgressRing({
  handled,
  onPress,
  percentage,
  size = 96,
  strokeWidth = 8,
  total,
}: AdherenceProgressRingProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [animatedPercent, setAnimatedPercent] = useState(0);

  // Card spring press scale (Emil Kowalski craft: scale 0.98)
  const cardScale = useRef(new Animated.Value(1)).current;

  // Reduced motion detection
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

  // Smooth animated fill (sub-300ms ease-out)
  useEffect(() => {
    if (reduceMotion) {
      setAnimatedPercent(percentage);
      return;
    }

    let animId: number;
    const startTime = Date.now();
    const duration = 280; // Emil Kowalski sub-300ms rule
    const startVal = animatedPercent;
    const diff = percentage - startVal;

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Strong ease-out: 1 - (1 - progress)^3
      const ease = 1 - Math.pow(1 - progress, 3);
      setAnimatedPercent(Math.round(startVal + diff * ease));

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [percentage, reduceMotion]);

  const handlePressIn = () => {
    Animated.timing(cardScale, {
      duration: 100,
      easing: Easing.out(Easing.quad),
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(cardScale, {
      tension: 140,
      friction: 7,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * Math.min(100, Math.max(0, animatedPercent))) / 100;
  const isComplete = total > 0 && handled === total;

  return (
    <Pressable
      accessibilityHint="Tap to view today's dose breakdown"
      accessibilityLabel={`Adherence progress ${percentage} percent, ${handled} of ${total} doses taken`}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.cardWrapper}
    >
      <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardEyebrow}>ADHERENCE</Text>
          <AppIcon color={colors.muted} name="chevron-right" size={14} />
        </View>

        {/* Circular SVG Ring */}
        <View style={styles.ringContainer}>
          <Svg height={size} width={size}>
            <G origin={`${size / 2}, ${size / 2}`} rotation="-90">
              {/* Background Track */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                fill="none"
                r={radius}
                stroke={colors.mist}
                strokeWidth={strokeWidth}
              />
              {/* Progress Stroke */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                fill="none"
                r={radius}
                stroke={isComplete ? colors.successDark : colors.success}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                strokeWidth={strokeWidth}
              />
            </G>
          </Svg>

          {/* Centered Readout */}
          <View style={styles.centerTextContainer}>
            <Text style={styles.percentageText}>{animatedPercent}%</Text>
            <Text style={styles.ratioMiniText}>
              {total > 0 ? `${handled}/${total}` : '0/0'}
            </Text>
          </View>
        </View>

        {/* Bottom Ratio & Subtext */}
        <View style={styles.cardFooter}>
          <Text numberOfLines={1} style={styles.footerRatioText}>
            {total > 0
              ? t('home.recordedCount', { handled, total })
              : 'No doses today'}
          </Text>
          <Text style={styles.footerHintText}>
            {isComplete ? 'All completed 🎉' : 'Tap for details ›'}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
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
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 200,
      gap: 10,
    },
    cardHeader: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardEyebrow: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    ringContainer: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 4,
    },
    centerTextContainer: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    percentageText: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    ratioMiniText: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '700',
      marginTop: -2,
    },
    cardFooter: {
      width: '100%',
      alignItems: 'center',
      gap: 2,
    },
    footerRatioText: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: '800',
      textAlign: 'center',
    },
    footerHintText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
