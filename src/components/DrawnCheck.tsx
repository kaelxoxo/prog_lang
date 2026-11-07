import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useReducedMotion } from '../lib/useReducedMotion';
import { durations, easing } from '../theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LENGTH = 24;

type Props = {
  color: string;
  size?: number;
  /** Draw the stroke on mount (a dose was just recorded). Otherwise render it complete. */
  animate?: boolean;
};

/** Ink checkmark for a recorded dose. Draws itself over 200 ms when it first appears. */
export function DrawnCheck({ animate = false, color, size = 20 }: Props) {
  const reducedMotion = useReducedMotion();
  const offset = useRef(new Animated.Value(animate ? CHECK_LENGTH : 0)).current;

  useEffect(() => {
    if (!animate) return;
    if (reducedMotion) {
      offset.setValue(0);
      return;
    }
    Animated.timing(offset, {
      toValue: 0,
      duration: durations.stateChange,
      easing: Easing.bezier(...easing.out),
      // strokeDashoffset is not a native-driver prop.
      useNativeDriver: false,
    }).start();
  }, [animate, offset, reducedMotion]);

  return (
    <Svg accessibilityElementsHidden height={size} importantForAccessibility="no" viewBox="0 0 24 24" width={size}>
      <AnimatedPath
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke={color}
        strokeDasharray={CHECK_LENGTH}
        strokeDashoffset={offset}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
      />
    </Svg>
  );
}
