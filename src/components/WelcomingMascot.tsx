import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { radii, spacing, type AppColors } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { AnimatedAppIcon } from './AnimatedAppIcon';

type Props = {
  greetingText?: string;
  size?: number;
};

export function WelcomingMascot({
  greetingText,
  size = 110,
}: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tapped, setTapped] = useState(false);

  // Animation values
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseAura = useRef(new Animated.Value(0)).current;
  const bounceScale = useRef(new Animated.Value(1)).current;

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
      pulseAura.setValue(0);
      return;
    }

    // 1. Gentle floating breath (vertical hover + tilt)
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    // 2. Warm sunlight aura pulse
    const auraLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAura, {
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAura, {
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    floatLoop.start();
    auraLoop.start();

    return () => {
      floatLoop.stop();
      auraLoop.stop();
    };
  }, [floatAnim, pulseAura, reduceMotion]);

  const handlePress = () => {
    setTapped(true);
    // Cheerful welcoming bounce spring
    bounceScale.setValue(0.92);
    Animated.spring(bounceScale, {
      friction: 4,
      tension: 50,
      toValue: 1,
      useNativeDriver: true,
    }).start();

    setTimeout(() => setTapped(false), 2600);
  };

  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });

  const rotate = floatAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '-1.5deg', '1.5deg'],
  });

  const auraScale = pulseAura.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const auraOpacity = pulseAura.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
  });

  return (
    <View style={styles.outerContainer}>
      {/* Welcoming Speech Pill */}
      {greetingText ? (
        <View style={styles.greetingPill}>
          <AnimatedAppIcon animation="pulse" color={colors.primaryDark} name="sparkles" size={13} />
          <Text style={styles.greetingText}>{greetingText}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityHint="Tap to interact with Bantay for a warm greeting"
        accessibilityLabel="Bantay, the Alaga mascot"
        accessibilityRole="button"
        onPress={handlePress}
        style={styles.pressableArea}
      >
        {/* Warm Sunlight Aura Ring */}
        {!reduceMotion ? (
          <Animated.View
            style={[
              styles.auraRing,
              {
                borderRadius: (size + 36) / 2,
                height: size + 36,
                opacity: auraOpacity,
                transform: [{ scale: auraScale }],
                width: size + 36,
              },
            ]}
          />
        ) : null}

        {/* Outer Frame with Floating Motion */}
        <Animated.View
          style={[
            styles.mascotFrame,
            {
              borderRadius: size / 2,
              height: size,
              width: size,
            },
            !reduceMotion && {
              transform: [
                { translateY },
                { rotate },
                { scale: bounceScale },
              ],
            },
          ]}
        >
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="Bantay guardian cub mascot"
            resizeMode="cover"
            source={reduceMotion ? require('../../assets/mascot.png') : require('../../assets/mascot-welcome.gif')}
            style={[
              styles.mascotImage,
              {
                borderRadius: size / 2,
                height: size,
                width: size,
              },
            ]}
          />

          {/* Cheerful Heart Badge on interaction */}
          {tapped ? (
            <View style={styles.heartReaction}>
              <AnimatedAppIcon animation="pulse" color={colors.primary} name="heart" size={16} />
            </View>
          ) : null}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    auraRing: {
      backgroundColor: colors.sun,
      position: 'absolute',
    },
    greetingPill: {
      alignItems: 'center',
      backgroundColor: colors.white,
      borderColor: colors.sun,
      borderRadius: radii.full,
      borderWidth: 1.5,
      flexDirection: 'row',
      gap: 6,
      marginBottom: spacing.md,
      paddingHorizontal: 14,
      paddingVertical: 6,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
    },
    greetingText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    heartReaction: {
      alignItems: 'center',
      backgroundColor: colors.white,
      borderColor: colors.primaryTint,
      borderRadius: 14,
      borderWidth: 1.5,
      bottom: -2,
      height: 28,
      justifyContent: 'center',
      position: 'absolute',
      right: -2,
      width: 28,
    },
    mascotFrame: {
      alignItems: 'center',
      backgroundColor: colors.white,
      borderColor: colors.line,
      borderWidth: 2,
      elevation: 4,
      justifyContent: 'center',
      overflow: 'hidden',
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
    },
    mascotImage: {
      overflow: 'hidden',
    },
    outerContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xs,
    },
    pressableArea: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
