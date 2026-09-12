import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { radii, spacing, type AppColors } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { AnimatedAppIcon, type IconAnimationKind } from './AnimatedAppIcon';

type PillarItem = {
  animation: IconAnimationKind;
  description: string;
  icon: 'heart' | 'users' | 'shield-check';
  iconColor: (colors: AppColors) => string;
  id: string;
  title: string;
};

type Props = {
  items?: PillarItem[];
};

export function AnimatedFeaturePills({ items }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [reduceMotion, setReduceMotion] = useState(false);

  const defaultItems: PillarItem[] = [
    {
      animation: 'pulse',
      description: 'Walang kalituhan sa iskedyul',
      icon: 'heart',
      iconColor: (c) => c.primary,
      id: 'meds',
      title: 'Maingat na Gamot',
    },
    {
      animation: 'float',
      description: 'Sama-samang pag-aalaga',
      icon: 'users',
      iconColor: (c) => c.primaryDark,
      id: 'family',
      title: 'Care Circle',
    },
    {
      animation: 'chime',
      description: 'Sa device mo lang nakatago',
      icon: 'shield-check',
      iconColor: (c) => c.successDark,
      id: 'privacy',
      title: '100% Pribado',
    },
  ];

  const pillarData = items || defaultItems;

  // Staggered entrance animations
  const fadeAnims = useRef(pillarData.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(pillarData.map(() => new Animated.Value(14))).current;

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotion(enabled);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      fadeAnims.forEach((anim) => anim.setValue(1));
      slideAnims.forEach((anim) => anim.setValue(0));
      return;
    }

    const animations = pillarData.map((_, index) =>
      Animated.parallel([
        Animated.timing(fadeAnims[index], {
          duration: 450,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnims[index], {
          duration: 450,
          easing: Easing.out(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    Animated.stagger(120, animations).start();
  }, [fadeAnims, pillarData, reduceMotion, slideAnims]);

  return (
    <View style={styles.container}>
      {pillarData.map((item, index) => {
        const animatedStyle = !reduceMotion
          ? {
              opacity: fadeAnims[index],
              transform: [{ translateY: slideAnims[index] }],
            }
          : {};

        return (
          <Animated.View key={item.id} style={[styles.pillCard, animatedStyle]}>
            <View style={styles.iconCircle}>
              <AnimatedAppIcon
                animation={item.animation}
                color={item.iconColor(colors)}
                delay={index * 300}
                name={item.icon}
                size={18}
              />
            </View>
            <View style={styles.textColumn}>
              <Text style={styles.pillTitle}>{item.title}</Text>
              <Text numberOfLines={1} style={styles.pillDescription}>
                {item.description}
              </Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.xs,
      marginVertical: spacing.xs,
      width: '100%',
    },
    iconCircle: {
      alignItems: 'center',
      backgroundColor: colors.mist,
      borderColor: colors.line,
      borderRadius: 18,
      borderWidth: 1,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    pillCard: {
      alignItems: 'center',
      backgroundColor: colors.white,
      borderColor: colors.line,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
    },
    pillDescription: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '400',
    },
    pillTitle: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    textColumn: {
      flex: 1,
      gap: 1,
    },
  });
