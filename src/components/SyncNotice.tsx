import { Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/api';
import { radii, spacing, type AppColors } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { useLocale } from '../features/settings/LocaleProvider';

export function SyncNotice({ error, onRetry, updatedAt }: {
  error: unknown;
  onRetry: () => void;
  updatedAt: number;
}) {
  const { styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  if (!error || !updatedAt) return null;

  const time = new Intl.DateTimeFormat(localeTag, { hour: 'numeric', minute: '2-digit' }).format(updatedAt);
  return (
    <View accessibilityLiveRegion="polite" style={styles.notice}>
      <View style={styles.copy}>
        <Text style={styles.title}>{t('sync.savedAt', { time })}</Text>
        <Text style={styles.body}>{errorMessage(error)}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
        <Text style={styles.retryLabel}>{t('app.retry')}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  notice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.warningTint, padding: spacing.md },
  copy: { minWidth: 210, flex: 1, gap: spacing.xs },
  title: { color: colors.warning, fontSize: 15, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  retry: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryLabel: { color: colors.warning, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
