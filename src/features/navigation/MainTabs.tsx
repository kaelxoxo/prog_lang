import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { AskBantayBottomSheet } from '../assistant/AskBantayBottomSheet';
import { useAuth } from '../auth/AuthProvider';
import { HomeScreen } from '../home/HomeScreen';
import { MedicationEditorModal } from '../medications/MedicationEditorModal';
import { MedicationPhotoImport } from '../medications/MedicationPhotoImport';
import type { Medication, MedicationInput, MedicationOcrDraft } from '../medications/types';
import { MedicinesScreen } from '../medications/MedicinesScreen';
import { usePatient } from '../patients/PatientProvider';
import { subscribeToReminderRoutes, type ReminderRoute } from '../reminders/notifications';
import { useLocale } from '../settings/LocaleProvider';
import { SettingsScreen } from '../settings/SettingsScreen';
import { TodayScreen } from '../today/TodayScreen';
import { manilaDate, type TimelineResponse } from '../today/types';
import { QuickActionDrawer } from './QuickActionDrawer';

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

type TabItemProps = {
  accessibilityLabel: string;
  icon: 'house' | 'calendar-days' | 'pill';
  label: string;
  onPress: () => void;
  selected: boolean;
};

function TabItem({
  accessibilityLabel,
  icon,
  label,
  onPress,
  selected,
}: TabItemProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, {
      duration: 100,
      easing: Easing.out(Easing.quad),
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      tension: 140,
      friction: 7,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const activeCapsuleBg = isDark ? '#24342F' : '#EAF2EC';
  const iconColor = selected ? colors.successDark : colors.muted;
  const labelColor = selected ? colors.successDark : colors.muted;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabPressable}
    >
      <Animated.View
        style={[
          styles.tabContent,
          selected && [styles.tabContentSelected, { backgroundColor: activeCapsuleBg }],
          { transform: [{ scale }] },
        ]}
      >
        <AppIcon color={iconColor} name={icon} size={20} />
        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            selected ? styles.tabLabelSelected : styles.tabLabelUnselected,
            { color: labelColor },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

type Props = {
  onOpenWelcomeStory?: () => void;
};

export function MainTabs({ onOpenWelcomeStory }: Props = {}) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { session, signOut, token } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Screen>('home');
  const [pendingRoute, setPendingRoute] = useState<ReminderRoute | null>(null);
  const [focusedOccurrenceId, setFocusedOccurrenceId] = useState<string | null>(null);
  const [isAssistantVisible, setAssistantVisible] = useState(false);
  const [isQuickDrawerVisible, setIsQuickDrawerVisible] = useState(false);
  const [isMedicationEditorVisible, setMedicationEditorVisible] = useState(false);
  const [isScanRxModalVisible, setScanRxModalVisible] = useState(false);
  const [importDraft, setImportDraft] = useState<MedicationOcrDraft | null>(null);

  const previousPatientId = useRef<string | undefined>(undefined);
  const settingsOrigin = useRef<Tab>('home');
  const fabScale = useRef(new Animated.Value(1)).current;

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

  const saveMedicationMutation = useMutation({
    mutationFn: (input: MedicationInput) =>
      apiRequest(`/patients/${activePatient!.id}/medications`, {
        method: 'POST',
        token,
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['today', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['timeline', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['medications', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['reminders', activePatient?.id] });
      void timelineQuery.refetch();
      void medicationsQuery.refetch();
    },
  });

  const openReminder = (route: ReminderRoute) => {
    setPendingRoute(route);
    selectPatient(route.patientId);
  };

  const openSettings = () => {
    if (tab !== 'settings') settingsOrigin.current = tab;
    setTab('settings');
  };

  const handleFabPressIn = () => {
    Animated.timing(fabScale, {
      duration: 100,
      easing: Easing.out(Easing.quad),
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handleFabPressOut = () => {
    Animated.spring(fabScale, {
      tension: 140,
      friction: 7,
      toValue: 1,
      useNativeDriver: true,
    }).start();
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
      setIsQuickDrawerVisible(false);
    }
    previousPatientId.current = activePatient?.id;
  }, [activePatient?.id, pendingRoute]);

  // Comprehensive hardware back button handling across drawer and modals
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isQuickDrawerVisible) {
        setIsQuickDrawerVisible(false);
        return true;
      }
      if (isScanRxModalVisible) {
        setScanRxModalVisible(false);
        return true;
      }
      if (isMedicationEditorVisible) {
        setMedicationEditorVisible(false);
        return true;
      }
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
  }, [
    isQuickDrawerVisible,
    isScanRxModalVisible,
    isMedicationEditorVisible,
    isAssistantVisible,
    tab,
  ]);

  if (!activePatient) return <TodayScreen onOpenMedicines={() => setTab('medicines')} onOpenSettings={openSettings} />;

  return (
    <View style={styles.shell}>
      <View style={styles.content}>
        {tab === 'home'
          ? <HomeScreen onOpenAssistant={() => setAssistantVisible(true)} onOpenMedicines={() => setTab('medicines')} onOpenSettings={openSettings} onOpenToday={() => setTab('today')} />
          : tab === 'today'
            ? <TodayScreen focusedOccurrenceId={focusedOccurrenceId} onOpenMedicines={() => setTab('medicines')} onOpenSettings={openSettings} />
            : tab === 'medicines'
              ? <MedicinesScreen onOpenSettings={openSettings} />
              : <SettingsScreen accountName={session?.displayName} onBack={() => setTab(settingsOrigin.current)} onOpenWelcomeStory={onOpenWelcomeStory} onSignOut={() => void signOut()} />}
      </View>

      {/* Floating Pill Navigation Bar with Integrated '+' Action */}
      {tab !== 'settings' ? (
        <View
          style={[
            styles.floatingBarContainer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View
            accessibilityRole="tablist"
            style={[
              styles.floatingBar,
              fontScale > 1.3 && styles.floatingBarLarge,
            ]}
          >
            {/* Segmented Tab Group: Home, Today, Medicines */}
            <View style={styles.tabsRow}>
              <TabItem
                accessibilityLabel={t('nav.home')}
                icon="house"
                label={t('nav.home')}
                onPress={() => setTab('home')}
                selected={tab === 'home'}
              />
              <TabItem
                accessibilityLabel={t('nav.today')}
                icon="calendar-days"
                label={t('nav.today')}
                onPress={() => setTab('today')}
                selected={tab === 'today'}
              />
              <TabItem
                accessibilityLabel={t('nav.medicines')}
                icon="pill"
                label={t('nav.medicines')}
                onPress={() => setTab('medicines')}
                selected={tab === 'medicines'}
              />
            </View>

            {/* Integrated Circular '+' Action Button (~46-48dp, scale: 0.96) */}
            <Pressable
              accessibilityHint="Opens quick action drawer to log dose, add medicine, scan prescription, or ask Bantay"
              accessibilityLabel="Quick actions"
              accessibilityRole="button"
              onPress={() => setIsQuickDrawerVisible(true)}
              onPressIn={handleFabPressIn}
              onPressOut={handleFabPressOut}
              style={styles.fabPressable}
            >
              <Animated.View style={[styles.fabButton, { transform: [{ scale: fabScale }] }]}>
                <AppIcon color="#FFFFFF" name="plus" size={22} />
              </Animated.View>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Quick-Action Drawer */}
      <QuickActionDrawer
        onAddMed={() => {
          setIsQuickDrawerVisible(false);
          if (activePatient?.canManageMedications) {
            setImportDraft(null);
            setMedicationEditorVisible(true);
          } else {
            setTab('medicines');
          }
        }}
        onAskBantay={() => {
          setIsQuickDrawerVisible(false);
          setAssistantVisible(true);
        }}
        onClose={() => setIsQuickDrawerVisible(false)}
        onLogDose={() => {
          setIsQuickDrawerVisible(false);
          const timeline = timelineQuery.data?.timeline ?? [];
          const pendingDose = timeline.find((d) => d.status !== 'taken' && d.status !== 'skipped');
          if (pendingDose) {
            setFocusedOccurrenceId(pendingDose.id);
          }
          setTab('today');
        }}
        onScanRx={() => {
          setIsQuickDrawerVisible(false);
          if (activePatient?.canManageMedications) {
            setScanRxModalVisible(true);
          } else {
            setTab('medicines');
          }
        }}
        visible={isQuickDrawerVisible}
      />

      {/* Medication Editor Modal triggered from Quick Action Drawer */}
      {activePatient && isMedicationEditorVisible ? (
        <MedicationEditorModal
          draft={importDraft}
          medication={null}
          onClose={() => {
            setMedicationEditorVisible(false);
            setImportDraft(null);
          }}
          onSave={async (input) => {
            await saveMedicationMutation.mutateAsync(input);
            setMedicationEditorVisible(false);
            setImportDraft(null);
          }}
          patient={activePatient}
          visible={isMedicationEditorVisible}
        />
      ) : null}

      {/* Scan Rx Modal triggered from Quick Action Drawer */}
      <Modal
        animationType="slide"
        onRequestClose={() => setScanRxModalVisible(false)}
        transparent
        visible={isScanRxModalVisible}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityLabel={t('home.scanRxClose')}
            accessibilityRole="button"
            onPress={() => setScanRxModalVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.scanModalContainer}>
            <View style={styles.scanModalHeader}>
              <Text accessibilityRole="header" style={styles.scanModalTitle}>
                {t('home.scanRxTitle')}
              </Text>
              <Pressable
                accessibilityLabel={t('home.scanRxClose')}
                accessibilityRole="button"
                onPress={() => setScanRxModalVisible(false)}
                style={({ pressed }) => [styles.modalCloseButton, pressed && styles.modalCloseButtonPressed]}
              >
                <AppIcon color={colors.ink} name="x" size={20} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.scanModalBody}>
              {activePatient ? (
                <MedicationPhotoImport
                  initialExpanded
                  onReview={(draft) => {
                    setScanRxModalVisible(false);
                    setImportDraft(draft);
                    setMedicationEditorVisible(true);
                  }}
                  patient={activePatient}
                />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Ask Bantay Bottom Sheet */}
      {tab !== 'settings' && activePatient ? (
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
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    shell: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    content: {
      flex: 1,
    },
    // Floating Pill Navigation Bar
    floatingBarContainer: {
      paddingHorizontal: 16,
      paddingTop: 4,
      backgroundColor: colors.canvas,
      alignItems: 'center',
    },
    floatingBar: {
      width: '100%',
      maxWidth: 480,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 64,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.white,
      paddingVertical: 6,
      paddingLeft: 8,
      paddingRight: 8,
      elevation: 4,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    floatingBarLarge: {
      minHeight: 74,
    },
    tabsRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      marginRight: 6,
    },
    tabPressable: {
      flex: 1,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    tabContent: {
      minHeight: 48,
      minWidth: 64,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: radii.full,
    },
    tabContentSelected: {
      borderWidth: 1,
      borderColor: colors.successBorder || colors.line,
    },
    tabLabel: {
      fontSize: 11,
      letterSpacing: -0.1,
    },
    tabLabelSelected: {
      fontWeight: '800',
    },
    tabLabelUnselected: {
      fontWeight: '600',
    },
    // Integrated Circular '+' Action Button
    fabPressable: {
      minWidth: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 4,
    },
    fabButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#2D5A46',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#2D5A46',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    scanModalContainer: {
      maxHeight: '90%',
      backgroundColor: colors.white,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: spacing.lg,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.line,
    },
    scanModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    scanModalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.ink,
    },
    scanModalBody: {
      padding: spacing.md,
    },
    modalCloseButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.mist,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCloseButtonPressed: {
      opacity: 0.75,
    },
  });
