import { StyleSheet, View } from 'react-native';

import { AssistantMascot } from '../features/assistant/AssistantMascot';
import { type AppColors } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

type Props = {
  size?: number;
};

/** Bantay's portrait on the sign-in screen: breathing and blinking in a round paper frame. */
export function WelcomingMascot({ size = 110 }: Props) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={[styles.frame, { borderRadius: size / 2, height: size, width: size }]}>
      <AssistantMascot expression="idle" size={size * 0.94} variant="bust" />
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    frame: {
      alignItems: 'center',
      backgroundColor: colors.canvasSubtle,
      borderColor: colors.line,
      borderWidth: 1,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
  });
