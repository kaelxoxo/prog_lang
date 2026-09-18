import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { typography } from '../../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  accessibilityLabel?: string;
  centerLabel?: string;
  progress: number; // 0 - 100
  progressColor: string;
  size?: number;
  strokeWidth?: number;
  trackColor: string;
};

export function CircularProgressRing({
  accessibilityLabel,
  centerLabel,
  progress,
  progressColor,
  size = 76,
  strokeWidth = 7,
  trackColor,
}: Props) {
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!isMounted) return;
      if (reduced) {
        animatedProgress.setValue(progress);
      } else {
        Animated.timing(animatedProgress, {
          duration: 450,
          easing: Easing.out(Easing.cubic),
          toValue: progress,
          useNativeDriver: false,
        }).start();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [progress, animatedProgress]);

  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  const center = size / 2;
  const displayLabel = centerLabel ?? `${Math.round(Math.min(100, Math.max(0, progress)))}%`;

  return (
    <View
      accessibilityLabel={accessibilityLabel || `${displayLabel} completed`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: progress }}
      style={[styles.container, { width: size, height: size }]}
    >
      <Svg height={size} width={size}>
        <G rotation="-90" origin={`${center}, ${center}`}>
          {/* Background Track */}
          <Circle
            cx={center}
            cy={center}
            fill="transparent"
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          {/* Animated Fill Stroke */}
          <AnimatedCircle
            cx={center}
            cy={center}
            fill="transparent"
            r={radius}
            stroke={progressColor}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
          />
        </G>
      </Svg>
      <View pointerEvents="none" style={styles.labelContainer}>
        <Text numberOfLines={1} style={styles.labelText}>
          {displayLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  labelContainer: {
    ...StyleSheet.absoluteFill as any,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    ...typography.headline,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
});
