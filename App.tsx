import { StatusBar } from 'expo-status-bar';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/features/auth/AuthProvider';
import { AuthScreen } from './src/features/auth/AuthScreen';
import { CareSetupFlow, type CareSetupFinishTarget } from './src/features/careSetup/CareSetupFlow';
import { OnboardingSlideshow } from './src/features/onboarding/OnboardingSlideshow';
import { markOnboardingCompleted, readHasSeenOnboarding } from './src/features/onboarding/onboardingStorage';
import { SyntheticDataNotice } from './src/components/SyntheticDataNotice';
import { MainTabs } from './src/features/navigation/MainTabs';
import { PatientProvider, usePatient } from './src/features/patients/PatientProvider';
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

function AuthenticatedContent({ onOpenWelcomeStory }: { onOpenWelcomeStory: () => void }) {
  const { styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { session } = useAuth();
  const { patients, isLoading, error } = usePatient();
  const [startedFor, setStartedFor] = useState<string | null>(null);
  const [deferredFor, setDeferredFor] = useState<string | null>(null);
  const [initialAction, setInitialAction] = useState<CareSetupFinishTarget>('home');

  useEffect(() => {
    if (session && session.careSetup === null && !isLoading && !error && patients.length === 0 && deferredFor !== session.id) {
      setStartedFor(session.id);
    }
  }, [deferredFor, error, isLoading, patients.length, session?.careSetup, session?.id]);

  if (session && startedFor === session.id) {
    return <CareSetupFlow onFinish={(target) => {
      setInitialAction(target);
      setDeferredFor(session.id);
      setStartedFor(null);
    }} />;
  }

  const awaitingDecision = session?.careSetup === null && deferredFor !== session.id;
  if (awaitingDecision && (isLoading || (!error && patients.length === 0))) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.loadingScreen}>
        <Text style={styles.loadingBrand}>Alaga</Text>
        <Text style={styles.loadingText}>{t('app.restoring')}</Text>
      </View>
    );
  }

  return <MainTabs initialAction={initialAction === 'addMedicine' ? 'addMedicine' : undefined} onOpenWelcomeStory={onOpenWelcomeStory} />;
}

function AppContent() {
  const { styles } = useThemedStyles(createStyles);
  const { restoreError, retryRestore, session, signOut, status } = useAuth();
  const { t } = useLocale();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [showReplayOnboarding, setShowReplayOnboarding] = useState(false);

  useEffect(() => {
    let active = true;
    void readHasSeenOnboarding().then((seen) => {
      if (active) setHasSeenOnboarding(seen);
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === 'loading' || hasSeenOnboarding === null) {
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

  const finishStory = async () => {
    await markOnboardingCompleted();
    setHasSeenOnboarding(true);
    setShowReplayOnboarding(false);
  };

  if (!hasSeenOnboarding) {
    return <OnboardingSlideshow onComplete={finishStory} />;
  }

  // A replay opens over the current screen so closing it returns exactly where the user was, form input included.
  return (
    <View style={styles.content}>
      <View accessibilityElementsHidden={showReplayOnboarding} importantForAccessibility={showReplayOnboarding ? 'no-hide-descendants' : 'auto'} style={styles.content}>
        {session ? (
          <PatientProvider>
            <AuthenticatedContent onOpenWelcomeStory={() => setShowReplayOnboarding(true)} />
          </PatientProvider>
        ) : (
          <AuthScreen onOpenWelcomeStory={() => setShowReplayOnboarding(true)} />
        )}
      </View>
      {showReplayOnboarding ? (
        <View style={StyleSheet.absoluteFill}>
          <OnboardingSlideshow onComplete={finishStory} />
        </View>
      ) : null}
    </View>
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
