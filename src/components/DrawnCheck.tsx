import { useEffect } from 'react';
import Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { easeOut } from '../lib/motion';
import { useReducedMotion } from '../lib/useReducedMotion';
import { durations } from '../theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LENGTH = 24;

type Props = {
  color: string;
  size?: number;
  /** Draw the stroke on mount (a dose was just recorded). Otherwise render it complete. */
  animate?: boolean;
};

/**
 * Ink checkmark for a recorded dose. Draws itself over 200 ms (strong ease-out) on the UI thread when it first
 * appears, so a refetch running on the JS thread can't stall it. With reduced motion it appears complete.
 */
export function DrawnCheck({ animate = false, color, size = 20 }: Props) {
  const reducedMotion = useReducedMotion();
  const offset = useSharedValue(animate ? CHECK_LENGTH : 0);

  useEffect(() => {
    if (!animate) return;
    // ReduceMotion.System covers the moment before the app's reduced-motion check has answered.
    offset.set(reducedMotion ? 0 : withTiming(0, { duration: durations.stateChange, easing: easeOut, reduceMotion: ReduceMotion.System }));
  }, [animate, offset, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.get() }));

  return (
    <Svg accessibilityElementsHidden height={size} importantForAccessibility="no" viewBox="0 0 24 24" width={size}>
      <AnimatedPath
        animatedProps={animatedProps}
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke={color}
        strokeDasharray={CHECK_LENGTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
      />
    </Svg>
  );
}
