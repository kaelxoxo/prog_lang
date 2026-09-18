import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from './AppIcon';
import { errorMessage } from '../lib/api';
import { radii, spacing, type AppColors } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { useAuth } from '../features/auth/AuthProvider';
import { useLocale } from '../features/settings/LocaleProvider';

export function SyncNotice({ error, onRetry, updatedAt }: {
  error: unknown;
  onRetry: () => void;
  updatedAt: number;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { signOut } = useAuth();
  if (!error || !updatedAt) return null;

  const msg = errorMessage(error);
  const isSessionExpired = msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('sign in');
  const time = new Intl.DateTimeFormat(localeTag, { hour: 'numeric', minute: '2-digit' }).format(updatedAt);
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.notice}>
      <View style={styles.iconWrap}>
        <AppIcon color={colors.warning} name="cloud-off" size={17} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{t('sync.savedAt', { time })}</Text>
        <Text style={styles.body}>{msg}</Text>
      </View>
      {isSessionExpired ? (
        <Pressable
          accessibilityLabel="Sign in again"
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <AppIcon color={colors.warning} name="log-out" size={15} />
          <Text style={styles.retryLabel}>Sign in</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={t('app.retry')}
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <AppIcon color={colors.warning} name="refresh-cw" size={15} />
          <Text style={styles.retryLabel}>{t('app.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  notice: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.warningTint,
    padding: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    minWidth: 180,
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '800',
  },
  body: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  retry: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryLabel: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
});
