import { StyleSheet, Text, View } from 'react-native';

import { spacing, type AppColors } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

export function SyntheticDataNotice() {
  const { styles } = useThemedStyles(createStyles);

  return (
    <View accessibilityRole="text" style={styles.notice}>
      <Text style={styles.label}>Side-project build. Use synthetic information only.</Text>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  notice: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.warningTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
});
