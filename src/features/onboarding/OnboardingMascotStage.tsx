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
import { useLocale } from '../settings/LocaleProvider';
import type { CopyKey } from '../settings/translations';

type Props = {
  slideIndex: number;
  size?: number;
  onMascotTap?: () => void;
};

const SLIDE_ASSETS = [
  {
    gif: require('../../../assets/mascot-welcome.gif'),
    altKey: 'onboarding_mascot_alt_slide1' as CopyKey,
    defaultAlt: 'Bantay, Alaga care companion waving hello warmly',
  },
  {
    gif: require('../../../assets/mascot-medicine.gif'),
    altKey: 'onboarding_mascot_alt_slide2' as CopyKey,
    defaultAlt: 'Bantay holding up your Alaga care checklist with an approving nod',
  },
  {
    gif: require('../../../assets/mascot-heart.gif'),
    altKey: 'onboarding_mascot_alt_slide3' as CopyKey,
    defaultAlt: 'Bantay hugging your glowing care heart and privacy shield',
  },
];

export function OnboardingMascotStage({ slideIndex, size = 220, onMascotTap }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
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
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          duration: 1500,
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

  // Interactive tap reaction with volume-conserving squash-and-stretch
  const handleTap = () => {
    if (reduceMotion) {
      onMascotTap?.();
      return;
    }

    onMascotTap?.();

    Animated.sequence([
      // 1. Anticipation squash (compression before leap)
      Animated.timing(squashAnim, {
        duration: 90,
        easing: Easing.out(Easing.quad),
        toValue: 0.92,
        useNativeDriver: true,
      }),
      // 2. Spring hop takeoff with vertical stretch
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
      // 3. Fall back down and land with impact squash
      Animated.sequence([
        Animated.parallel([
          Animated.timing(hopAnim, {
            duration: 130,
            easing: Easing.in(Easing.quad),
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.timing(squashAnim, {
            duration: 130,
            easing: Easing.in(Easing.quad),
            toValue: 0.88,
            useNativeDriver: true,
          }),
        ]),
        // 4. Elastic settling to resting baseline
        Animated.parallel([
          Animated.spring(hopAnim, {
            friction: 6,
            tension: 100,
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.spring(squashAnim, {
            friction: 6,
            tension: 100,
            toValue: 1.0,
            useNativeDriver: true,
          }),
        ]),
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

  // Organic chest respiration scale coupled to 3.0s breathing rhythm
  const breathScaleY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.016],
  });

  const breathScaleX = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.008],
  });

  // Volume-conserving squash-and-stretch: scaleX * scaleY approx 1.0
  const scaleX = squashAnim.interpolate({
    inputRange: [0.88, 1.0, 1.08],
    outputRange: [1.14, 1.0, 0.92],
  });

  // Ground contact shadow coupling: Z = floatAnim * 10 - hopAnim
  const verticalZ = Animated.subtract(
    Animated.multiply(floatAnim, 10),
    hopAnim,
  );

  const shadowBaseScaleX = verticalZ.interpolate({
    inputRange: [0, 10, 30],
    outputRange: [1.05, 0.88, 0.58],
    extrapolate: 'clamp',
  });

  const shadowSquashMult = squashAnim.interpolate({
    inputRange: [0.88, 1.0, 1.08],
    outputRange: [1.15, 1.0, 0.92],
    extrapolate: 'clamp',
  });

  const shadowScaleX = Animated.multiply(shadowBaseScaleX, shadowSquashMult);

  const shadowScaleY = verticalZ.interpolate({
    inputRange: [0, 10, 30],
    outputRange: [1.02, 0.80, 0.52],
    extrapolate: 'clamp',
  });

  const shadowBaseOpacity = verticalZ.interpolate({
    inputRange: [0, 10, 30],
    outputRange: [0.26, 0.18, 0.08],
    extrapolate: 'clamp',
  });

  const shadowOpacityMult = squashAnim.interpolate({
    inputRange: [0.88, 1.0, 1.08],
    outputRange: [1.25, 1.0, 0.95],
    extrapolate: 'clamp',
  });

  const shadowOpacity = Animated.multiply(shadowBaseOpacity, shadowOpacityMult);

  const activeAsset = SLIDE_ASSETS[slideIndex] ?? SLIDE_ASSETS[0];
  const localizedLabel = t(activeAsset.altKey) || activeAsset.defaultAlt;
  const localizedHint = t('onboarding_mascot_tap_hint') || 'Tap to make Bantay playfully hop';

  return (
    <View style={[styles.stage, { height: size + 36, width: size + 36 }]}>
      {/* Organic Grounding Contact Shadow */}
      <Animated.View
        style={[
          styles.groundShadow,
          {
            bottom: 2,
            height: 16,
            opacity: reduceMotion ? 0.22 : shadowOpacity,
            transform: [
              { scaleX: reduceMotion ? 1 : shadowScaleX },
              { scaleY: reduceMotion ? 1 : shadowScaleY },
            ],
            width: size * 0.72,
          },
        ]}
      />

      {/* Interactive Free-Standing Mascot Actor */}
      <Animated.View
        style={[
          styles.mascotActor,
          {
            height: size,
            transform: [
              { translateY },
              { rotate: reduceMotion ? '0deg' : rotate },
              { scaleX: reduceMotion ? 1 : Animated.multiply(scaleX, breathScaleX) },
              { scaleY: reduceMotion ? 1 : Animated.multiply(squashAnim, breathScaleY) },
            ],
            width: size,
          },
        ]}
      >
        <Pressable
          accessibilityHint={localizedHint}
          accessibilityLabel={localizedLabel}
          accessibilityRole="button"
          hitSlop={12}
          onPress={handleTap}
          style={styles.pressableTarget}
        >
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            fadeDuration={0}
            importantForAccessibility="no"
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
      backgroundColor: colors.canvas === '#17211F' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.22)',
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
      // Free-standing organic character: zero card borders or clipping bounding boxes
    },
  });
