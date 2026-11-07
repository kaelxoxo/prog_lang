import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';

type Props = {
  accountName?: string;
  onOpenSettings?: () => void;
};

/** Wordmark, signed-in account, and settings. Changing person lives in PatientChips, not here. */
export function CareHeader({ accountName, onOpenSettings }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { fontScale } = useWindowDimensions();

  return (
    <View style={styles.topBar}>
      <View style={styles.accountCopy}>
        <View style={styles.brandLockup}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>Alaga</Text>
        </View>
        {accountName ? (
          <Text numberOfLines={fontScale > 1.3 ? 2 : 1} style={styles.account}>
            {accountName}
          </Text>
        ) : null}
      </View>
      {onOpenSettings ? (
        <Pressable
          accessibilityLabel={t('care.settings')}
          accessibilityRole="button"
          onPress={onOpenSettings}
          style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
        >
          <AppIcon color={colors.ink} name="settings" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  accountCopy: { minWidth: 0, flex: 1, gap: 2 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  brand: { ...typography.title1, color: colors.ink },
  account: { ...typography.caption, maxWidth: 320, color: colors.muted },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonPressed: { backgroundColor: colors.canvasSubtle },
});
