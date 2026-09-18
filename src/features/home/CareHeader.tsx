import React, { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import type { Patient } from '../patients/types';

export interface CareHeaderProps {
  accountName?: string;
  activePatient: Patient;
  onOpenCareCircle?: () => void;
  onOpenSettings?: () => void;
}

export function CareHeader({ accountName, activePatient: _activePatient, onOpenCareCircle, onOpenSettings }: CareHeaderProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { fontScale } = useWindowDimensions();

  // Tactile press scaling (Emil Kowalski craft: scale 0.98)
  const circleScale = useRef(new Animated.Value(1)).current;
  const settingsScale = useRef(new Animated.Value(1)).current;

  const animatePressIn = (scale: Animated.Value) => {
    Animated.timing(scale, {
      duration: 100,
      easing: Easing.out(Easing.quad),
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const animatePressOut = (scale: Animated.Value) => {
    Animated.spring(scale, {
      tension: 140,
      friction: 7,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={styles.header}>
      <View style={styles.topBar}>
        {/* Brand lockup */}
        <View style={styles.brandLockup}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>Alaga</Text>
          {accountName ? (
            <Text numberOfLines={fontScale > 1.3 ? 2 : 1} style={styles.caregiverBadge}>
              · {accountName}
            </Text>
          ) : null}
        </View>

        {/* Top actions: Care Circle & Settings (both min 48dp) */}
        <View style={styles.topActions}>
          {onOpenCareCircle ? (
            <Pressable
              accessibilityHint={t('home.actionCareCircleHint')}
              accessibilityLabel={t('home.actionCareCircle')}
              accessibilityRole="button"
              onPress={onOpenCareCircle}
              onPressIn={() => animatePressIn(circleScale)}
              onPressOut={() => animatePressOut(circleScale)}
              style={styles.actionPressable}
            >
              <Animated.View style={[styles.actionButton, { transform: [{ scale: circleScale }] }]}>
                <AppIcon color={colors.ink} name="users" size={20} />
              </Animated.View>
            </Pressable>
          ) : null}

          {onOpenSettings ? (
            <Pressable
              accessibilityLabel={t('care.settings')}
              accessibilityRole="button"
              onPress={onOpenSettings}
              onPressIn={() => animatePressIn(settingsScale)}
              onPressOut={() => animatePressOut(settingsScale)}
              style={styles.actionPressable}
            >
              <Animated.View style={[styles.actionButton, { transform: [{ scale: settingsScale }] }]}>
                <AppIcon color={colors.ink} name="settings" size={20} />
              </Animated.View>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    header: {
      width: '100%',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
    },
    brandLockup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    brandDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.sun,
    },
    brand: {
      color: colors.ink,
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: -0.7,
    },
    caregiverBadge: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '600',
    },
    topActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    actionPressable: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
