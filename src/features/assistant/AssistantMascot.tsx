import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { type AppColors, radii } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';

export type MascotExpression = 'idle' | 'thinking' | 'celebration';

export interface AssistantMascotProps {
  expression: MascotExpression;
  size?: number;
  accessibilityLabel?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const IDLE_ASSET: ImageSourcePropType = require('../../../assets/mascot-welcome.gif');
const CELEBRATION_ASSET: ImageSourcePropType = require('../../../assets/mascot-heart.gif');
const STATIC_ASSET: ImageSourcePropType = require('../../../assets/mascot.png');

export function AssistantMascot({
  expression,
  size = 64,
  accessibilityLabel,
  onPress,
  style,
  testID,
}: AssistantMascotProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Animation values
  const floatAnim = useRef(new Animated.Value(0)).current;
  const hopAnim = useRef(new Animated.Value(0)).current;
  const squashAnim = useRef(new Animated.Value(1)).current;
  const thinkingAnim = useRef(new Animated.Value(expression === 'thinking' ? 1 : 0)).current;
  const celebrationAnim = useRef(new Animated.Value(expression === 'celebration' ? 1 : 0)).current;
  const sparklePulse = useRef(new Animated.Value(0)).current;

  // Track system reduceMotion setting
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

  // 3.0s Calibrated breathing float loop
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
  }, [floatAnim, reduceMotion]);

  // Sparkle glow & aura pulse loop
  useEffect(() => {
    if (reduceMotion) {
      sparklePulse.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparklePulse, {
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(sparklePulse, {
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    pulseLoop.start();

    return () => {
      pulseLoop.stop();
    };
  }, [sparklePulse, reduceMotion]);

  // Spring hop with volume-conserving squash-and-stretch
  const triggerSpringHop = (distance: number = 18) => {
    if (reduceMotion) return;

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
          duration: 170,
          easing: Easing.out(Easing.cubic),
          toValue: -distance,
          useNativeDriver: true,
        }),
        Animated.timing(squashAnim, {
          duration: 170,
          easing: Easing.out(Easing.cubic),
          toValue: 1.08,
          useNativeDriver: true,
        }),
      ]),
      // 3. Fall back down and land with impact squash
      Animated.sequence([
        Animated.parallel([
          Animated.timing(hopAnim, {
            duration: 120,
            easing: Easing.in(Easing.quad),
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.timing(squashAnim, {
            duration: 120,
            easing: Easing.in(Easing.quad),
            toValue: 0.88,
            useNativeDriver: true,
          }),
        ]),
        // 4. Elastic settling to resting baseline
        Animated.parallel([
          Animated.spring(hopAnim, {
            friction: 6,
            tension: 110,
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.spring(squashAnim, {
            friction: 6,
            tension: 110,
            toValue: 1.0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  };

  // Thinking state transitions
  useEffect(() => {
    if (reduceMotion) {
      thinkingAnim.setValue(expression === 'thinking' ? 1 : 0);
      return;
    }

    Animated.timing(thinkingAnim, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: expression === 'thinking' ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [expression, reduceMotion, thinkingAnim]);

  // Celebration state transitions & auto-hop
  useEffect(() => {
    if (reduceMotion) {
      celebrationAnim.setValue(expression === 'celebration' ? 1 : 0);
      return;
    }

    Animated.timing(celebrationAnim, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: expression === 'celebration' ? 1 : 0,
      useNativeDriver: true,
    }).start();

    if (expression === 'celebration') {
      triggerSpringHop(Math.max(14, Math.round(size * 0.25)));
    }
  }, [expression, reduceMotion, celebrationAnim, size]);

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
    triggerSpringHop(Math.max(14, Math.round(size * 0.28)));
  };

  // Vertical movement: breathing float (-3 to +3) combined with spring hop
  const floatTranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [3, -3],
  });

  const translateY = Animated.add(floatTranslateY, hopAnim);

  // Rotation: idle micro-tilt (-0.8deg to 1.0deg) blended with thinking tilt (-5.0deg)
  const idleTiltNum = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-0.8, 1.0],
  });

  const thinkingTiltNum = thinkingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5.0],
  });

  const totalTiltNum = Animated.add(idleTiltNum, thinkingTiltNum);

  const rotate = totalTiltNum.interpolate({
    inputRange: [-10, 10],
    outputRange: ['-10deg', '10deg'],
  });

  // Chest respiration scaling coupled to 3.0s breathing rhythm
  const breathScaleY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.016],
  });

  const breathScaleX = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.008],
  });

  // Volume-conserving squash-and-stretch from hop: scaleX * scaleY approx 1.0
  const scaleXSquash = squashAnim.interpolate({
    inputRange: [0.88, 1.0, 1.08],
    outputRange: [1.14, 1.0, 0.92],
  });

  // Thinking alert vertical stretch (scaleY: 1.04, scaleX: 0.98)
  const thinkingScaleY = thinkingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.04],
  });

  const thinkingScaleX = thinkingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 0.98],
  });

  // Combined scale values
  const finalScaleY = Animated.multiply(
    Animated.multiply(squashAnim, breathScaleY),
    thinkingScaleY,
  );

  const finalScaleX = Animated.multiply(
    Animated.multiply(scaleXSquash, breathScaleX),
    thinkingScaleX,
  );

  // Ground contact shadow elevation coupling: Z = float - hop
  const verticalZ = Animated.subtract(
    Animated.multiply(floatAnim, 6),
    hopAnim,
  );

  const shadowScaleX = verticalZ.interpolate({
    inputRange: [-5, 0, 15, 30],
    outputRange: [1.1, 1.0, 0.85, 0.6],
    extrapolate: 'clamp',
  });

  const shadowScaleY = verticalZ.interpolate({
    inputRange: [-5, 0, 15, 30],
    outputRange: [1.08, 1.0, 0.78, 0.5],
    extrapolate: 'clamp',
  });

  const shadowOpacity = verticalZ.interpolate({
    inputRange: [-5, 0, 15, 30],
    outputRange: [0.32, 0.24, 0.16, 0.08],
    extrapolate: 'clamp',
  });

  // Asset selection
  let assetSource: ImageSourcePropType;
  if (reduceMotion) {
    assetSource = STATIC_ASSET;
  } else if (expression === 'celebration') {
    assetSource = CELEBRATION_ASSET;
  } else {
    // Both idle and thinking use welcome gif (thinking overlays tilt & sparkle aura)
    assetSource = IDLE_ASSET;
  }

  // Accessibility label
  const defaultLabel =
    expression === 'thinking'
      ? 'Bantay is thinking...'
      : expression === 'celebration'
        ? 'Bantay celebrating all care tasks completed'
        : 'Bantay, Alaga care companion';

  const accessibleLabelText = accessibilityLabel || defaultLabel;

  // Proportional sparkle sizes
  const sparkleSize = Math.max(14, Math.round(size * 0.26));
  const smallSparkleSize = Math.max(12, Math.round(size * 0.2));

  return (
    <View
      style={[
        styles.stage,
        {
          height: size + Math.max(10, Math.round(size * 0.2)),
          width: size + Math.max(10, Math.round(size * 0.2)),
        },
        style,
      ]}
      testID={testID}
    >
      {/* Ground Contact Shadow */}
      <Animated.View
        style={[
          styles.groundShadow,
          {
            bottom: 2,
            height: Math.max(6, Math.round(size * 0.1)),
            opacity: reduceMotion ? 0.2 : shadowOpacity,
            transform: [
              { scaleX: reduceMotion ? 1 : shadowScaleX },
              { scaleY: reduceMotion ? 1 : shadowScaleY },
            ],
            width: size * 0.72,
          },
        ]}
      />

      {/* Thinking State: Pulsing Glow Aura */}
      {!reduceMotion ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thinkingAura,
            {
              borderRadius: radii.full,
              height: size * 1.15,
              opacity: Animated.multiply(
                thinkingAnim,
                sparklePulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.12, 0.32],
                }),
              ),
              transform: [
                {
                  scale: sparklePulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1.1],
                  }),
                },
              ],
              width: size * 1.15,
            },
          ]}
        />
      ) : null}

      {/* Mascot Animated Actor */}
      <Animated.View
        style={[
          styles.mascotActor,
          {
            height: size,
            transform: [
              { translateY: reduceMotion ? 0 : translateY },
              { rotate: reduceMotion ? '0deg' : rotate },
              { scaleX: reduceMotion ? 1 : finalScaleX },
              { scaleY: reduceMotion ? 1 : finalScaleY },
            ],
            width: size,
          },
        ]}
      >
        <Pressable
          accessibilityHint="Tap to make Bantay playfully hop"
          accessibilityLabel={accessibleLabelText}
          accessibilityRole={onPress ? 'button' : 'image'}
          hitSlop={8}
          onPress={handlePress}
          style={styles.pressableTarget}
        >
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            fadeDuration={0}
            importantForAccessibility="no"
            key={`assistant-mascot-${expression}-${reduceMotion ? 'static' : 'animated'}`}
            resizeMode="contain"
            source={assetSource}
            style={{ height: size, width: size }}
          />
        </Pressable>

        {/* Thinking Sparkle Overlay (Top-Right of Head) */}
        {!reduceMotion ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thinkingSparkleBadge,
              {
                opacity: thinkingAnim,
                right: -Math.round(size * 0.04),
                top: -Math.round(size * 0.04),
                transform: [
                  {
                    scale: sparklePulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.85, 1.15],
                    }),
                  },
                  {
                    rotate: sparklePulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['-5deg', '15deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            <AppIcon color={colors.sun} name="sparkles" size={sparkleSize} />
          </Animated.View>
        ) : null}

        {/* Celebration Sparkles Overlay (Both Paws & Heart Aura) */}
        {!reduceMotion ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.celebrationSparkleTopRight,
                {
                  opacity: celebrationAnim,
                  right: -Math.round(size * 0.05),
                  top: -Math.round(size * 0.02),
                  transform: [
                    {
                      scale: sparklePulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1.2],
                      }),
                    },
                  ],
                },
              ]}
            >
              <AppIcon color={colors.sun} name="sparkles" size={sparkleSize} />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.celebrationSparkleTopLeft,
                {
                  left: -Math.round(size * 0.06),
                  opacity: celebrationAnim,
                  top: Math.round(size * 0.08),
                  transform: [
                    {
                      scale: sparklePulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1.15, 0.85],
                      }),
                    },
                  ],
                },
              ]}
            >
              <AppIcon color={colors.primaryDark} name="sparkles" size={smallSparkleSize} />
            </Animated.View>
          </>
        ) : null}
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
      backgroundColor:
        colors.canvas === '#17211F' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.22)',
      borderRadius: radii.full,
      position: 'absolute',
    },
    thinkingAura: {
      backgroundColor: colors.sun,
      position: 'absolute',
    },
    mascotActor: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    pressableTarget: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    thinkingSparkleBadge: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
    },
    celebrationSparkleTopRight: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
    },
    celebrationSparkleTopLeft: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
    },
  });
