import { useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { HomeScreen } from '../home/HomeScreen';
import { MedicinesScreen } from '../medications/MedicinesScreen';
import { usePatient } from '../patients/PatientProvider';
import { subscribeToReminderRoutes, type ReminderRoute } from '../reminders/notifications';
import { TodayScreen } from '../today/TodayScreen';

type Tab = 'home' | 'today' | 'medicines';

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
  const color = selected ? colors.primary : colors.muted;

  if (tab === 'home') {
    return (
      <View style={styles.iconFrame}>
        <View style={[styles.homeRoof, { borderColor: color }]} />
        <View style={[styles.homeBody, { borderColor: color }]} />
      </View>
    );
  }

  if (tab === 'today') {
    return (
      <View style={[styles.calendarIcon, { borderColor: color }]}>
        <View style={[styles.calendarLine, { backgroundColor: color }]} />
        <View style={[styles.calendarDot, { backgroundColor: color }]} />
      </View>
    );
  }

  return <View style={[styles.medicineIcon, { borderColor: color }]}><View style={[styles.medicineLine, { backgroundColor: color }]} /></View>;
}

export function MainTabs() {
  const { styles } = useThemedStyles(createStyles);
  const [tab, setTab] = useState<Tab>('home');
  const [pendingRoute, setPendingRoute] = useState<ReminderRoute | null>(null);
  const [focusedOccurrenceId, setFocusedOccurrenceId] = useState<string | null>(null);
  const previousPatientId = useRef<string | undefined>(undefined);
  const { fontScale } = useWindowDimensions();
  const { activePatient, selectPatient } = usePatient();

  const openReminder = (route: ReminderRoute) => {
    setPendingRoute(route);
    selectPatient(route.patientId);
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
    }
    previousPatientId.current = activePatient?.id;
  }, [activePatient?.id, pendingRoute]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'home') return false;
      setTab('home');
      setFocusedOccurrenceId(null);
      return true;
    });
    return () => subscription.remove();
  }, [tab]);

  if (!activePatient) return <TodayScreen onOpenMedicines={() => setTab('medicines')} />;

  return (
    <View style={styles.shell}>
      <View style={styles.content}>
        {tab === 'home'
          ? <HomeScreen onOpenMedicines={() => setTab('medicines')} onOpenToday={() => setTab('today')} />
          : tab === 'today'
            ? <TodayScreen focusedOccurrenceId={focusedOccurrenceId} onOpenMedicines={() => setTab('medicines')} />
            : <MedicinesScreen />}
      </View>
      <View accessibilityRole="tablist" style={[styles.nav, fontScale > 1.3 && styles.navLarge]}>
        <Pressable accessibilityLabel="Home" accessibilityRole="tab" accessibilityState={{ selected: tab === 'home' }} onPress={() => setTab('home')} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
          <TabIcon selected={tab === 'home'} tab="home" />
          <Text style={[styles.label, tab === 'home' && styles.labelSelected]}>Home</Text>
        </Pressable>
        <Pressable accessibilityLabel="Today" accessibilityRole="tab" accessibilityState={{ selected: tab === 'today' }} onPress={() => setTab('today')} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
          <TabIcon selected={tab === 'today'} tab="today" />
          <Text style={[styles.label, tab === 'today' && styles.labelSelected]}>Today</Text>
        </Pressable>
        <Pressable accessibilityLabel="Medicines" accessibilityRole="tab" accessibilityState={{ selected: tab === 'medicines' }} onPress={() => setTab('medicines')} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
          <TabIcon selected={tab === 'medicines'} tab="medicines" />
          <Text style={[styles.label, tab === 'medicines' && styles.labelSelected]}>Medicines</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.canvas },
  content: { flex: 1 },
  nav: { minHeight: 68, flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.white, paddingBottom: 3, paddingHorizontal: spacing.sm, paddingTop: 5 },
  navLarge: { minHeight: 80 },
  tab: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10 },
  pressed: { opacity: 0.72 },
  iconFrame: { width: 24, height: 23 },
  homeRoof: { position: 'absolute', top: 3, left: 6, width: 13, height: 13, borderLeftWidth: 2, borderTopWidth: 2, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  homeBody: { position: 'absolute', left: 5, bottom: 1, width: 15, height: 12, borderRightWidth: 2, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  calendarIcon: { width: 22, height: 21, justifyContent: 'flex-end', alignItems: 'center', borderWidth: 2, borderRadius: 5, paddingBottom: 4 },
  calendarLine: { position: 'absolute', top: 5, left: 0, right: 0, height: 2 },
  calendarDot: { width: 5, height: 5, borderRadius: 3 },
  medicineIcon: { width: 22, height: 12, justifyContent: 'center', borderWidth: 2, borderRadius: 7, transform: [{ rotate: '-35deg' }] },
  medicineLine: { alignSelf: 'center', width: 2, height: 9 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  labelSelected: { color: colors.primaryDark, fontWeight: '900' },
});
