import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useReducedMotion } from '../lib/useReducedMotion';
import { durations, easing, pressScales } from '../theme/tokens';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  /** Applied to the scaling surface (background, padding, layout). */
  style?: StyleProp<ViewStyle>;
  targetScale?: number;
};

const easeOut = Easing.bezier(...easing.out);

/** Press feedback: scales to 0.97 over 160 ms ease-out, no bounce. Reduced motion skips the scale. */
export function PressableScale({
  children,
  disabled,
  onPressIn,
  onPressOut,
  style,
  targetScale = pressScales.buttonPress,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();

  const animateTo = (toValue: number) => {
    Animated.timing(scale, { toValue, duration: durations.feedback, easing: easeOut, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(event: GestureResponderEvent) => {
        if (!disabled && !reducedMotion) animateTo(targetScale);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        if (!reducedMotion) animateTo(1);
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
