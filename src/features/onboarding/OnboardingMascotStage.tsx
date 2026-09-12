import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AnimatedAppIcon } from '../../components/AnimatedAppIcon';
import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';

type Props = {
  slideIndex: number;
  size?: number;
};

export function OnboardingMascotStage({ slideIndex, size = 150 }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Animation values
  const floatAnim = useRef(new Animated.Value(0)).current;
  const auraScale = useRef(new Animated.Value(0)).current;
  const badgeFloat1 = useRef(new Animated.Value(0)).current;
  const badgeFloat2 = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (reduceMotion) {
      floatAnim.setValue(0);
      auraScale.setValue(0);
      badgeFloat1.setValue(0);
      badgeFloat2.setValue(0);
      return;
    }

    // 1. Floating sine hover for mascot
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    // 2. Aura pulsing
    const auraLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(auraScale, {
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(auraScale, {
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    // 3. Floating micro-badges with counter-phase
    const badge1Loop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgeFloat1, {
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(badgeFloat1, {
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    const badge2Loop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgeFloat2, {
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(badgeFloat2, {
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    floatLoop.start();
    auraLoop.start();
    badge1Loop.start();
    badge2Loop.start();

    return () => {
      floatLoop.stop();
      auraLoop.stop();
      badge1Loop.stop();
      badge2Loop.stop();
    };
  }, [reduceMotion, slideIndex]);

  // Interpolations
  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const rotate = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-1deg', '1.5deg'],
  });

  const auraSize = size * 1.5;
  const currentAuraScale = auraScale.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14],
  });

  const currentAuraOpacity = auraScale.interpolate({
    inputRange: [0, 1],
    outputRange: [0.38, 0.72],
  });

  const badge1TranslateY = badgeFloat1.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  const badge2TranslateY = badgeFloat2.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });

  // Dynamic Aura Colors by slide
  // Slide 0: Sun Gold (#E8B85D)
  // Slide 1: Sage Green (#477064)
  // Slide 2: Warm Clay (#9C4F35)
  const auraColor =
    slideIndex === 0
      ? colors.sun
      : slideIndex === 1
        ? colors.success
        : colors.primary;

  const auraSecondaryColor =
    slideIndex === 0
      ? 'rgba(232, 184, 93, 0.22)'
      : slideIndex === 1
        ? 'rgba(71, 112, 100, 0.20)'
        : 'rgba(156, 79, 53, 0.22)';

  return (
    <View style={[styles.stageContainer, { height: size + 90 }]}>
      {/* Outer Halo Aura */}
      <Animated.View
        style={[
          styles.auraOuter,
          {
            backgroundColor: auraSecondaryColor,
            borderRadius: auraSize,
            height: auraSize,
            opacity: currentAuraOpacity,
            transform: [{ scale: currentAuraScale }],
            width: auraSize,
          },
        ]}
      />

      {/* Inner Glowing Aura Ring */}
      <Animated.View
        style={[
          styles.auraInner,
          {
            borderColor: auraColor,
            borderRadius: size + 24,
            height: size + 24,
            opacity: currentAuraOpacity,
            width: size + 24,
          },
        ]}
      />

      {/* Mascot Frame */}
      <Animated.View
        style={[
          styles.mascotWrapper,
          {
            borderRadius: size / 2,
            height: size,
            width: size,
            transform: [{ translateY }, { rotate }],
          },
        ]}
      >
        <Image
          accessibilityLabel="Bantay, Alaga Care Companion"
          accessibilityRole="image"
          resizeMode="cover"
          source={
            reduceMotion
              ? require('../../../assets/mascot.png')
              : require('../../../assets/mascot-welcome.gif')
          }
          style={[styles.mascotImage, { borderRadius: size / 2, height: size, width: size }]}
        />
      </Animated.View>

      {/* Contextual Badges for Slide 0: Welcome */}
      {slideIndex === 0 && (
        <>
          <Animated.View
            style={[
              styles.floatingChip,
              styles.chipTopRight,
              { transform: [{ translateY: badge1TranslateY }] },
            ]}
          >
            <AppIcon color={colors.sun} name="sparkles" size={14} />
            <Text style={styles.chipText}>Warm Welcome</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.floatingBadge,
              styles.badgeBottomLeft,
              { transform: [{ translateY: badge2TranslateY }] },
            ]}
          >
            <AnimatedAppIcon animation="pulse" color={colors.primary} name="heart" size={16} />
          </Animated.View>
        </>
      )}

      {/* Contextual Badges for Slide 1: Medicine Care */}
      {slideIndex === 1 && (
        <>
          <Animated.View
            style={[
              styles.floatingBadge,
              styles.badgeTopRight,
              { transform: [{ translateY: badge1TranslateY }] },
            ]}
          >
            <AnimatedAppIcon animation="pulse" color={colors.success} name="heart" size={17} />
          </Animated.View>

          <Animated.View
            style={[
              styles.floatingChip,
              styles.chipBottomLeft,
              { transform: [{ translateY: badge2TranslateY }] },
            ]}
          >
            <AppIcon color={colors.successDark} name="clock" size={14} />
            <Text style={styles.chipText}>Meal Timings & Schedules</Text>
          </Animated.View>
        </>
      )}

      {/* Contextual Badges for Slide 2: Care Circle & Privacy */}
      {slideIndex === 2 && (
        <>
          <Animated.View
            style={[
              styles.floatingBadge,
              styles.badgeTopLeft,
              { transform: [{ translateY: badge1TranslateY }] },
            ]}
          >
            <AnimatedAppIcon animation="float" color={colors.primary} name="users" size={16} />
          </Animated.View>

          <Animated.View
            style={[
              styles.floatingChip,
              styles.chipBottomRight,
              { transform: [{ translateY: badge2TranslateY }] },
            ]}
          >
            <AppIcon color={colors.primary} name="shield-check" size={14} />
            <Text style={styles.chipText}>100% On-Device Safe</Text>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    stageContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      width: '100%',
    },
    auraOuter: {
      position: 'absolute',
    },
    auraInner: {
      borderWidth: 2.5,
      position: 'absolute',
    },
    mascotWrapper: {
      alignItems: 'center',
      borderColor: colors.white,
      borderWidth: 4,
      elevation: 6,
      justifyContent: 'center',
      overflow: 'hidden',
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
    },
    mascotImage: {
      backgroundColor: colors.white,
    },
    floatingBadge: {
      alignItems: 'center',
      backgroundColor: colors.white,
      borderColor: colors.line,
      borderRadius: radii.full,
      borderWidth: 1,
      elevation: 3,
      height: 38,
      justifyContent: 'center',
      position: 'absolute',
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 5,
      width: 38,
    },
    badgeTopRight: {
      right: '18%',
      top: 10,
    },
    badgeTopLeft: {
      left: '18%',
      top: 10,
    },
    badgeBottomLeft: {
      bottom: 8,
      left: '20%',
    },
    floatingChip: {
      alignItems: 'center',
      backgroundColor: colors.white,
      borderColor: colors.line,
      borderRadius: radii.full,
      borderWidth: 1,
      elevation: 3,
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      position: 'absolute',
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    chipTopRight: {
      right: '12%',
      top: 8,
    },
    chipBottomLeft: {
      bottom: 8,
      left: '10%',
    },
    chipBottomRight: {
      bottom: 8,
      right: '10%',
    },
    chipText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: '600',
    },
  });
