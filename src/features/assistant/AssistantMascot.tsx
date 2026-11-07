import { StyleProp, View, ViewStyle } from 'react-native';

import { PressableScale } from '../../components/PressableScale';
import { useLocale } from '../settings/LocaleProvider';
import type { CopyKey } from '../settings/translations';
import { BantaySprite, type BantaySpriteAnimation } from './BantaySprite';

export type MascotExpression = 'idle' | 'attention' | 'thinking' | 'celebration';

export interface AssistantMascotProps {
  accessible?: boolean;
  accessibilityLabel?: string;
  expression: MascotExpression;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: 'bust' | 'full';
}

const animationFor: Record<MascotExpression, BantaySpriteAnimation> = {
  idle: 'idle',
  attention: 'attention',
  thinking: 'thinking',
  celebration: 'celebrate',
};

const labelFor: Record<MascotExpression, CopyKey> = {
  idle: 'bantay.mascotIdleAlt',
  attention: 'bantay.mascotAttentionAlt',
  thinking: 'bantay.mascotThinkingAlt',
  celebration: 'bantay.mascotCelebrationAlt',
};

/** Bantay, animated from his sprite sheets. Pressable when `onPress` is given (scale 0.97 press feedback). */
export function AssistantMascot({
  accessible = true,
  accessibilityLabel,
  expression,
  onPress,
  size = 64,
  style,
  testID,
  variant = 'bust',
}: AssistantMascotProps) {
  const { t } = useLocale();
  const label = accessible ? accessibilityLabel ?? t(labelFor[expression]) : undefined;
  const sprite = <BantaySprite animation={animationFor[expression]} size={size} variant={variant} />;

  if (onPress) {
    return (
      <PressableScale
        accessibilityLabel={label}
        accessibilityRole={accessible ? 'button' : undefined}
        accessible={accessible}
        hitSlop={8}
        importantForAccessibility={accessible ? 'auto' : 'no-hide-descendants'}
        onPress={onPress}
        style={style}
        testID={testID}
      >
        {sprite}
      </PressableScale>
    );
  }

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole={accessible ? 'image' : undefined}
      accessible={accessible}
      importantForAccessibility={accessible ? 'auto' : 'no-hide-descendants'}
      pointerEvents="none"
      style={style}
      testID={testID}
    >
      {sprite}
    </View>
  );
}
