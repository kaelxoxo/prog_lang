import React, { useMemo } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppColors, radii, spacing } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import type { DoseOccurrence } from '../today/types';
import { AssistantMascot } from './AssistantMascot';
import { useAssistantMascotState } from './useAssistantMascotState';

export interface AssistantFABProps {
  onPress: () => void;
  timeline?: DoseOccurrence[] | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AssistantFAB({
  onPress,
  timeline,
  style,
  testID = 'assistant-fab',
}: AssistantFABProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  // Count unrecorded doses scheduled for today
  const pendingCount = useMemo(() => {
    if (!timeline) return 0;
    return timeline.filter((d) => d.status === 'not_recorded' || d.status === 'snoozed').length;
  }, [timeline]);

  const hasActionableDose = pendingCount > 0;

  // Mascot expression synchronized with dose completion
  const { expression } = useAssistantMascotState(timeline);

  // Soft breathing pulse for the beacon dot
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!hasActionableDose) {
      pulseAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasActionableDose, pulseAnim]);

  const accessibilityLabel = hasActionableDose
    ? `${t('assistant.fabLabel')}, ${t('assistant.fabBeaconHint', { count: pendingCount })}`
    : t('assistant.fabLabel');

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.fabContainer,
        {
          bottom: Math.max(insets.bottom, 8) + 62,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityHint={t('assistant.fabA11yHint')}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [styles.fabButton, pressed && styles.fabPressed]}
        testID={testID}
      >
        <AssistantMascot
          expression={expression}
          size={46}
        />

        {/* Soft Status Beacon Dot */}
        {hasActionableDose ? (
          <View style={styles.beaconAnchor}>
            <Animated.View
              style={[
                styles.beaconHalo,
                {
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.2, 0.6],
                  }),
                  transform: [
                    {
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1.4],
                      }),
                    },
                  ],
                },
              ]}
            />
            <View style={styles.beaconDot}>
              {pendingCount > 1 ? (
                <Text style={styles.beaconCountText}>
                  {pendingCount > 9 ? '9+' : pendingCount}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    fabContainer: {
      alignItems: 'flex-end',
      bottom: 76,
      position: 'absolute',
      right: spacing.md,
      zIndex: 90,
    },
    fabButton: {
      alignItems: 'center',
      backgroundColor: colors.white,
      borderColor: colors.line,
      borderRadius: radii.full,
      borderWidth: 1.5,
      height: 56,
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 48,
      position: 'relative',
      width: 56,
    },
    fabPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.95 }],
    },
    beaconAnchor: {
      alignItems: 'center',
      height: 18,
      justifyContent: 'center',
      position: 'absolute',
      right: -2,
      top: -2,
      width: 18,
    },
    beaconHalo: {
      backgroundColor: colors.sun,
      borderRadius: radii.full,
      height: 18,
      position: 'absolute',
      width: 18,
    },
    beaconDot: {
      alignItems: 'center',
      backgroundColor: colors.sun,
      borderColor: colors.white,
      borderRadius: radii.full,
      borderWidth: 1.5,
      height: 14,
      justifyContent: 'center',
      minWidth: 14,
      paddingHorizontal: 2,
    },
    beaconCountText: {
      color: colors.ink,
      fontSize: 9,
      fontWeight: '800',
      lineHeight: 11,
      textAlign: 'center',
    },
  });
