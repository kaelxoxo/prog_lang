import { StatusBar } from 'expo-status-bar';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/features/auth/AuthProvider';
import { AuthScreen } from './src/features/auth/AuthScreen';
import { SyntheticDataNotice } from './src/components/SyntheticDataNotice';
import { MainTabs } from './src/features/navigation/MainTabs';
import { PatientProvider } from './src/features/patients/PatientProvider';
import { configureNotifications } from './src/features/reminders/notifications';
import { LocaleProvider, useLocale } from './src/features/settings/LocaleProvider';
import { spacing, type AppColors } from './src/theme/tokens';
import { useThemedStyles } from './src/theme/useTheme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

configureNotifications();

function AppContent() {
  const { styles } = useThemedStyles(createStyles);
  const { restoreError, retryRestore, session, signOut, status } = useAuth();
  const { t } = useLocale();

  if (status === 'loading') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.loadingScreen}>
        <Text style={styles.loadingBrand}>Alaga</Text>
        <Text style={styles.loadingText}>{t('app.restoring')}</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.restoreScreen}>
        <Text accessibilityRole="header" style={styles.restoreTitle}>{t('app.connectionTitle')}</Text>
        <Text accessibilityLiveRegion="assertive" style={styles.restoreBody}>{restoreError}</Text>
        <Pressable accessibilityRole="button" onPress={() => void retryRestore()} style={styles.restorePrimary}>
          <Text style={styles.restorePrimaryLabel}>{t('app.retry')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.restoreSecondary}>
          <Text style={styles.restoreSecondaryLabel}>{t('app.clearSession')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <PatientProvider>
      <MainTabs />
    </PatientProvider>
  );
}

export default function App() {
  const { colors, styles } = useThemedStyles(createStyles);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SafeAreaView style={styles.app}>
        <StatusBar style={colors.canvas === '#17211F' ? 'light' : 'dark'} />
        <QueryClientProvider client={queryClient}>
          <LocaleProvider>
            <SyntheticDataNotice />
            <View style={styles.content}>
              <AuthProvider>
                <AppContent />
              </AuthProvider>
            </View>
          </LocaleProvider>
        </QueryClientProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: { flex: 1 },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.canvas,
  },
  loadingBrand: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
  },
  restoreScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  restoreTitle: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
  },
  restoreBody: {
    maxWidth: 430,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  restorePrimary: {
    minHeight: 52,
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
  },
  restorePrimaryLabel: { color: colors.white, fontSize: 16, fontWeight: '700' },
  restoreSecondary: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md },
  restoreSecondaryLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
});
