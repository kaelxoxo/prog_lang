import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useReducedMotion } from '../lib/useReducedMotion';
import { durations, easing, spacing, typography, type AppColors } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { AppIcon } from './AppIcon';

type PillarItem = {
  description: string;
  icon: 'heart' | 'users' | 'shield-check';
  iconColor: (colors: AppColors) => string;
  id: string;
  title: string;
};

type Props = {
  items: PillarItem[];
};

/** Sign-in feature rows: a one-time staggered entrance (rare screen), then still. */
export function AnimatedFeaturePills({ items: pillarData }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const reduceMotion = useReducedMotion();

  // Staggered entrance; with reduced motion, fade only.
  const fadeAnims = useRef(pillarData.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(pillarData.map(() => new Animated.Value(8))).current;

  useEffect(() => {
    if (reduceMotion) slideAnims.forEach((anim) => anim.setValue(0));
    const easeOut = Easing.bezier(...easing.out);

    const animations = pillarData.map((_, index) =>
      Animated.parallel([
        Animated.timing(fadeAnims[index], {
          duration: durations.drawer,
          easing: easeOut,
          toValue: 1,
          useNativeDriver: true,
        }),
        ...(reduceMotion
          ? []
          : [
              Animated.timing(slideAnims[index], {
                duration: durations.drawer,
                easing: easeOut,
                toValue: 0,
                useNativeDriver: true,
              }),
            ]),
      ]),
    );

    Animated.stagger(80, animations).start();
  }, [fadeAnims, pillarData, reduceMotion, slideAnims]);

  return (
    <View style={styles.container}>
      {pillarData.map((item, index) => {
        const animatedStyle = {
          opacity: fadeAnims[index],
          transform: [{ translateY: slideAnims[index] }],
        };

        return (
          <Animated.View key={item.id} style={[styles.row, index > 0 && styles.ruled, animatedStyle]}>
            <AppIcon color={item.iconColor(colors)} name={item.icon} size={18} />
            <View style={styles.textColumn}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text numberOfLines={1} style={styles.rowDescription}>
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
      marginVertical: spacing.xs,
      width: '100%',
    },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    ruled: {
      borderTopColor: colors.line,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowDescription: {
      ...typography.caption,
      color: colors.muted,
      fontWeight: '400',
    },
    rowTitle: {
      ...typography.bodyEmphasis,
      color: colors.ink,
    },
    textColumn: {
      flex: 1,
      gap: 1,
    },
  });
