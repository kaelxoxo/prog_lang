import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from './AppIcon';
import { PressableScale } from './PressableScale';
import { errorMessage } from '../lib/api';
import { radii, spacing, typography, type AppColors } from '../theme/tokens';
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
      <AppIcon color={colors.warning} name="cloud-off" size={18} />
      <View style={styles.copy}>
        <Text style={styles.title}>{t('sync.savedAt', { time })}</Text>
        <Text style={styles.body}>{msg}</Text>
      </View>
      {isSessionExpired ? (
        <PressableScale
          accessibilityLabel="Sign in again"
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={styles.retry}
        >
          <AppIcon color={colors.ink} name="log-out" size={15} />
          <Text style={styles.retryLabel}>Sign in</Text>
        </PressableScale>
      ) : (
        <PressableScale
          accessibilityLabel={t('app.retry')}
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.retry}
        >
          <AppIcon color={colors.ink} name="refresh-cw" size={15} />
          <Text style={styles.retryLabel}>{t('app.retry')}</Text>
        </PressableScale>
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.canvasSubtle,
    padding: spacing.md,
  },
  copy: {
    minWidth: 180,
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
  body: {
    ...typography.caption,
    fontWeight: '400',
    color: colors.ink,
  },
  retry: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    paddingHorizontal: spacing.md,
  },
  retryLabel: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
});
