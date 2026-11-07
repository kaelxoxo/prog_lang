import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import { fadeIn, fadeOut, reflow } from '../lib/motion';
import { useReducedMotion } from '../lib/useReducedMotion';
import { AppIcon } from './AppIcon';
import { PressableScale } from './PressableScale';

type Props = {
  /** Read by screen readers for the header row, e.g. "Later today, 6 doses, next at 6:00 PM". */
  accessibilityLabel: string;
  children: ReactNode;
  /** Header content to the left of the chevron. */
  header: ReactNode;
  chevronColor: string;
  initiallyExpanded?: boolean;
  headerStyle?: StyleProp<ViewStyle>;
};

/**
 * A ruled row that expands in place. The body fades in over 200 ms (out over 140 ms) with a strong ease-out while
 * the row and everything after it glide to their new places; with reduced motion the body only fades.
 * Only toggles animate: the Disclosure mounts and unmounts as it is, and so do the rows inside its body.
 */
export function Disclosure({ accessibilityLabel, chevronColor, children, header, headerStyle, initiallyExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const reducedMotion = useReducedMotion();

  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <Animated.View layout={reducedMotion ? undefined : reflow}>
        <PressableScale
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={[styles.header, headerStyle]}
          targetScale={0.99}
        >
          <View style={styles.headerContent}>{header}</View>
          <View style={expanded ? styles.chevronOpen : undefined}>
            <AppIcon color={chevronColor} name="chevron-down" size={18} />
          </View>
        </PressableScale>
        {expanded ? (
          <Animated.View entering={fadeIn} exiting={fadeOut}>
            <LayoutAnimationConfig skipEntering skipExiting>
              <View collapsable={false}>{children}</View>
            </LayoutAnimationConfig>
          </Animated.View>
        ) : null}
      </Animated.View>
    </LayoutAnimationConfig>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerContent: { flex: 1 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
});
