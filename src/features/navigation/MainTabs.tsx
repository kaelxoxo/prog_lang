import { useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { AskBantayBottomSheet } from '../assistant/AskBantayBottomSheet';
import { AssistantFAB } from '../assistant/AssistantFAB';
import { useAuth } from '../auth/AuthProvider';
import { HomeScreen } from '../home/HomeScreen';
import { type Medication } from '../medications/types';
import { MedicinesScreen } from '../medications/MedicinesScreen';
import { usePatient } from '../patients/PatientProvider';
import { subscribeToReminderRoutes, type ReminderRoute } from '../reminders/notifications';
import { useLocale } from '../settings/LocaleProvider';
import { SettingsScreen } from '../settings/SettingsScreen';
import { TodayScreen } from '../today/TodayScreen';
import { manilaDate, type TimelineResponse } from '../today/types';

type Tab = 'home' | 'today' | 'medicines';
type Screen = Tab | 'settings';

function routeFromUrl(value: string): ReminderRoute | null {
  try {
    const url = new URL(value);
    const patientId = url.searchParams.get('patientId');
    const occurrenceId = url.searchParams.get('occurrenceId');
    return url.hostname === 'today' && patientId && occurrenceId ? { patientId, occurrenceId } : null;
  } catch {
    return null;
  }
}

function TabIcon({ selected, tab }: { selected: boolean; tab: Tab }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const icon = tab === 'home' ? 'house' : tab === 'today' ? 'calendar-days' : 'pill';
  return (
    <View style={[styles.tabIcon, selected && styles.tabIconSelected]}>
      <AppIcon color={selected ? colors.primaryDark : colors.muted} name={icon} size={20} />
    </View>
  );
}

type Props = {
  onOpenWelcomeStory?: () => void;
};

export function MainTabs({ onOpenWelcomeStory }: Props = {}) {
  const { styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { session, signOut, token } = useAuth();
  const [tab, setTab] = useState<Screen>('home');
  const [pendingRoute, setPendingRoute] = useState<ReminderRoute | null>(null);
  const [focusedOccurrenceId, setFocusedOccurrenceId] = useState<string | null>(null);
  const [isAssistantVisible, setAssistantVisible] = useState(false);
  const previousPatientId = useRef<string | undefined>(undefined);
  const settingsOrigin = useRef<Tab>('home');
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { activePatient, selectPatient } = usePatient();
  const now = useCurrentTime();
  const date = manilaDate(now);

  const timelineQuery = useQuery({
    queryKey: ['today', activePatient?.id, date],
    enabled: Boolean(activePatient),
    queryFn: () => apiRequest<TimelineResponse>(`/patients/${activePatient!.id}/today?date=${date}`, { token }),
  });

  const medicationsQuery = useQuery({
    queryKey: ['medications', activePatient?.id],
    enabled: Boolean(activePatient),
    queryFn: () => apiRequest<{ medications: Medication[] }>(`/patients/${activePatient!.id}/medications`, { token }),
  });

  const openReminder = (route: ReminderRoute) => {
    setPendingRoute(route);
    selectPatient(route.patientId);
  };

  const openSettings = () => {
    if (tab !== 'settings') settingsOrigin.current = tab;
    setTab('settings');
  };

  useEffect(() => subscribeToReminderRoutes(openReminder), [selectPatient]);

  useEffect(() => {
    void Linking.getInitialURL().then((value) => {
      const route = value ? routeFromUrl(value) : null;
      if (route) openReminder(route);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const route = routeFromUrl(url);
      if (route) openReminder(route);
    });
    return () => subscription.remove();
  }, [selectPatient]);

  useEffect(() => {
    if (pendingRoute && activePatient?.id === pendingRoute.patientId) {
      setFocusedOccurrenceId(pendingRoute.occurrenceId);
      setTab('today');
      setPendingRoute(null);
    } else if (!pendingRoute && previousPatientId.current && previousPatientId.current !== activePatient?.id) {
      setTab('home');
      setFocusedOccurrenceId(null);
      setAssistantVisible(false);
    }
    previousPatientId.current = activePatient?.id;
  }, [activePatient?.id, pendingRoute]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isAssistantVisible) {
        setAssistantVisible(false);
        return true;
      }
      if (tab === 'settings') {
        setTab(settingsOrigin.current);
        return true;
      }
      if (tab === 'home') return false;
      setTab('home');
      setFocusedOccurrenceId(null);
      return true;
    });
    return () => subscription.remove();
  }, [isAssistantVisible, tab]);

  if (!activePatient) return <TodayScreen onOpenMedicines={() => setTab('medicines')} onOpenSettings={openSettings} />;

  return (
    <View style={styles.shell}>
      <View style={styles.content}>
        {tab === 'home'
          ? <HomeScreen onOpenMedicines={() => setTab('medicines')} onOpenSettings={openSettings} onOpenToday={() => setTab('today')} />
          : tab === 'today'
            ? <TodayScreen focusedOccurrenceId={focusedOccurrenceId} onOpenMedicines={() => setTab('medicines')} onOpenSettings={openSettings} />
            : tab === 'medicines'
              ? <MedicinesScreen onOpenSettings={openSettings} />
              : <SettingsScreen accountName={session?.displayName} onBack={() => setTab(settingsOrigin.current)} onOpenWelcomeStory={onOpenWelcomeStory} onSignOut={() => void signOut()} />}
      </View>
      {tab !== 'settings' ? (
        <View
          accessibilityRole="tablist"
          style={[
            styles.nav,
            fontScale > 1.3 && styles.navLarge,
            { paddingBottom: Math.max(insets.bottom, 6) },
          ]}
        >
          <Pressable
            accessibilityLabel={t('nav.home')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'home' }}
            onPress={() => setTab('home')}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <TabIcon selected={tab === 'home'} tab="home" />
            <Text style={[styles.label, tab === 'home' && styles.labelSelected]}>{t('nav.home')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('nav.today')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'today' }}
            onPress={() => setTab('today')}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <TabIcon selected={tab === 'today'} tab="today" />
            <Text style={[styles.label, tab === 'today' && styles.labelSelected]}>{t('nav.today')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('nav.medicines')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'medicines' }}
            onPress={() => setTab('medicines')}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <TabIcon selected={tab === 'medicines'} tab="medicines" />
            <Text style={[styles.label, tab === 'medicines' && styles.labelSelected]}>{t('nav.medicines')}</Text>
          </Pressable>
        </View>
      ) : null}
      {tab !== 'settings' && activePatient ? (
        <>
          <AssistantFAB
            onPress={() => setAssistantVisible(true)}
            timeline={timelineQuery.data?.timeline}
          />
          <AskBantayBottomSheet
            medications={medicationsQuery.data?.medications}
            onClose={() => setAssistantVisible(false)}
            onNavigateToToday={(occurrenceId) => {
              setAssistantVisible(false);
              setTab('today');
              setFocusedOccurrenceId(occurrenceId);
            }}
            onNavigateToMedicines={() => {
              setAssistantVisible(false);
              setTab('medicines');
            }}
            patient={activePatient}
            timeline={timelineQuery.data?.timeline}
            visible={isAssistantVisible}
          />
        </>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.canvas },
  content: { flex: 1 },
  nav: {
    minHeight: 70,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
    paddingBottom: 6,
    paddingHorizontal: spacing.md,
    paddingTop: 6,
  },
  navLarge: { minHeight: 84 },
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: radii.md,
  },
  pressed: { opacity: 0.75 },
  tabIcon: {
    width: 48,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
  },
  tabIconSelected: { backgroundColor: colors.primaryTint },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  labelSelected: { color: colors.primaryDark, fontWeight: '900' },
});

