import { type LucideIconName } from '@react-native-vector-icons/lucide';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';

import { AppIcon } from './AppIcon';

export type IconAnimationKind = 'float' | 'pulse' | 'chime' | 'breathe' | 'none';

type Props = {
  animation?: IconAnimationKind;
  color: string;
  delay?: number;
  duration?: number;
  name: LucideIconName;
  size?: number;
};

export function AnimatedAppIcon({
  animation = 'none',
  color,
  delay = 0,
  duration = 2400,
  name,
  size = 20,
}: Props) {
  const animValue = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setReduceMotion(enabled),
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (animation === 'none' || reduceMotion) {
      animValue.setValue(0);
      return;
    }

    const timer = setTimeout(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();

      return () => loop.stop();
    }, delay);

    return () => clearTimeout(timer);
  }, [animValue, animation, delay, duration, reduceMotion]);

  if (animation === 'none' || reduceMotion) {
    return <AppIcon color={color} name={name} size={size} />;
  }

  let transformStyle: Animated.WithAnimatedValue<object> = {};

  if (animation === 'float') {
    const translateY = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -4],
    });
    transformStyle = { transform: [{ translateY }] };
  } else if (animation === 'pulse') {
    const scale = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.14],
    });
    transformStyle = { transform: [{ scale }] };
  } else if (animation === 'chime') {
    const rotate = animValue.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: ['0deg', '8deg', '-8deg'],
    });
    transformStyle = { transform: [{ rotate }] };
  } else if (animation === 'breathe') {
    const scale = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.97, 1.06],
    });
    const opacity = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.85, 1],
    });
    transformStyle = { opacity, transform: [{ scale }] };
  }

  return (
    <Animated.View style={[styles.container, transformStyle]}>
      <AppIcon color={color} name={name} size={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
