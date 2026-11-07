import { useState, type ReactNode } from 'react';
import { LayoutAnimation, Platform, StyleSheet, UIManager, View, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '../lib/useReducedMotion';
import { durations } from '../theme/tokens';
import { AppIcon } from './AppIcon';
import { PressableScale } from './PressableScale';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

/** A ruled row that expands in place: height and opacity over 200 ms ease-out; opacity only with reduced motion. */
export function Disclosure({ accessibilityLabel, chevronColor, children, header, headerStyle, initiallyExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const reducedMotion = useReducedMotion();

  const toggle = () => {
    LayoutAnimation.configureNext(
      reducedMotion
        ? LayoutAnimation.create(durations.stateChange, LayoutAnimation.Types.easeOut, LayoutAnimation.Properties.opacity)
        : {
            duration: durations.stateChange,
            create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
            update: { type: LayoutAnimation.Types.easeOut },
            delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
          },
    );
    setExpanded((value) => !value);
  };

  return (
    <View>
      <PressableScale
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={[styles.header, headerStyle]}
        targetScale={0.99}
      >
        <View style={styles.headerContent}>{header}</View>
        <View style={expanded ? styles.chevronOpen : undefined}>
          <AppIcon color={chevronColor} name="chevron-down" size={18} />
        </View>
      </PressableScale>
      {expanded ? children : null}
    </View>
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
