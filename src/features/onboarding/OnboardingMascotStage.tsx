import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';

type Props = {
  slideIndex: number;
  size?: number;
  onMascotTap?: () => void;
};

const SLIDE_ASSETS = [
  {
    gif: require('../../../assets/mascot-welcome.gif'),
    alt: 'Bantay, Alaga care companion waving hello warmly',
  },
  {
    gif: require('../../../assets/mascot-medicine.gif'),
    alt: 'Bantay holding and inspecting a gentle medicine pill',
  },
  {
    gif: require('../../../assets/mascot-heart.gif'),
    alt: 'Bantay embracing a warm glowing golden care heart and privacy shield',
  },
];

export function OnboardingMascotStage({ slideIndex, size = 190, onMascotTap }: Props) {
  const { styles } = useThemedStyles(createStyles);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Animation values
  const floatAnim = useRef(new Animated.Value(0)).current;
  const hopAnim = useRef(new Animated.Value(0)).current;
  const squashAnim = useRef(new Animated.Value(1)).current;

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

  // Continuous breathing float animation
  useEffect(() => {
    if (reduceMotion) {
      floatAnim.setValue(0);
      return;
    }

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    floatLoop.start();

    return () => {
      floatLoop.stop();
    };
  }, [reduceMotion]);

  // Interactive tap reaction (playful spring hop with squash and stretch)
  const handleTap = () => {
    if (reduceMotion) {
      onMascotTap?.();
      return;
    }

    onMascotTap?.();

    Animated.sequence([
      // 1. Squash before hop
      Animated.timing(squashAnim, {
        duration: 90,
        easing: Easing.out(Easing.quad),
        toValue: 0.92,
        useNativeDriver: true,
      }),
      // 2. Spring hop up
      Animated.parallel([
        Animated.timing(hopAnim, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
          toValue: -20,
          useNativeDriver: true,
        }),
        Animated.timing(squashAnim, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
          toValue: 1.08,
          useNativeDriver: true,
        }),
      ]),
      // 3. Fall back down and land
      Animated.parallel([
        Animated.spring(hopAnim, {
          friction: 5,
          tension: 90,
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.spring(squashAnim, {
          friction: 5,
          tension: 90,
          toValue: 1.0,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  // Interpolate floating translation
  const translateY = Animated.add(
    floatAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -10],
    }),
    hopAnim,
  );

  const rotate = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-0.8deg', '1.0deg'],
  });

  // Dynamic ground shadow that scales inversely with float height
  const shadowScaleX = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.05, 0.86],
  });

  const shadowScaleY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.02, 0.78],
  });

  const shadowOpacity = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.26, 0.12],
  });

  const activeAsset = SLIDE_ASSETS[slideIndex] ?? SLIDE_ASSETS[0];

  return (
    <View style={[styles.stage, { height: size + 36, width: size + 36 }]}>
      {/* Organic Grounding Contact Shadow */}
      <Animated.View
        style={[
          styles.groundShadow,
          {
            bottom: 2,
            height: 16,
            opacity: reduceMotion ? 0.2 : shadowOpacity,
            transform: [
              { scaleX: reduceMotion ? 1 : shadowScaleX },
              { scaleY: reduceMotion ? 1 : shadowScaleY },
            ],
            width: size * 0.72,
          },
        ]}
      />

      {/* Interactive Mascot Actor */}
      <Animated.View
        style={[
          styles.mascotActor,
          {
            height: size,
            transform: [
              { translateY },
              { rotate: reduceMotion ? '0deg' : rotate },
              { scaleY: squashAnim },
            ],
            width: size,
          },
        ]}
      >
        <Pressable
          accessibilityHint="Tap to make Bantay playfully hop"
          accessibilityLabel={activeAsset.alt}
          accessibilityRole="button"
          hitSlop={12}
          onPress={handleTap}
          style={styles.pressableTarget}
        >
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel={activeAsset.alt}
            accessibilityRole="image"
            fadeDuration={0}
            key={`slide-mascot-${slideIndex}`}
            resizeMode="contain"
            source={reduceMotion ? require('../../../assets/mascot.png') : activeAsset.gif}
            style={[styles.mascotImage, { height: size, width: size }]}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    stage: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    groundShadow: {
      backgroundColor: '#1E332A',
      borderRadius: 9999,
      position: 'absolute',
    },
    mascotActor: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressableTarget: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    mascotImage: {
      borderRadius: 24,
    },
  });
