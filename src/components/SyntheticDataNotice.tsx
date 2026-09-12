import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from './AppIcon';
import { spacing, type AppColors } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { useLocale } from '../features/settings/LocaleProvider';

export function SyntheticDataNotice() {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();

  return (
    <View accessibilityLabel={t('synthetic.notice')} accessibilityRole="text" style={styles.notice}>
      <View style={styles.content}>
        <AppIcon color={colors.warning} name="flask-conical" size={14} />
        <Text style={styles.label}>{t('synthetic.notice')}</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  notice: {
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    backgroundColor: colors.warningTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 38,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  label: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
});
