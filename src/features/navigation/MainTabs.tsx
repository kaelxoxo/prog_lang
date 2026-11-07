import { useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/PressableScale';
import { apiRequest } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
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
import { ReminderSync } from '../reminders/useReminders';
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
  icon: 'house' | 'calendar-days' | 'pill';
  label: string;
  onPress: () => void;
  selected: boolean;
};

function TabItem({ icon, label, onPress, selected }: TabItemProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const tint = selected ? colors.primary : colors.muted;

  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      containerStyle={styles.tabSlot}
      style={styles.tab}
    >
      <AppIcon color={tint} name={icon} size={22} />
      <Text numberOfLines={1} style={[styles.tabLabel, selected && styles.tabLabelSelected, { color: tint }]}>
        {label}
      </Text>
      <View style={[styles.tabMarker, selected && styles.tabMarkerSelected]} />
    </PressableScale>
  );
}

type Props = {
  onOpenWelcomeStory?: () => void;
  initialAction?: 'addMedicine';
};

export function MainTabs({ onOpenWelcomeStory, initialAction }: Props = {}) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { session, signOut, token } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Screen>('home');
  const [pendingRoute, setPendingRoute] = useState<ReminderRoute | null>(null);
  const [focusedOccurrenceId, setFocusedOccurrenceId] = useState<string | null>(null);
  const [isAssistantVisible, setAssistantVisible] = useState(false);
  const [isQuickDrawerVisible, setIsQuickDrawerVisible] = useState(false);
  const [isMedicationEditorVisible, setMedicationEditorVisible] = useState(initialAction === 'addMedicine');
  const [isScanRxModalVisible, setScanRxModalVisible] = useState(false);
  const [importDraft, setImportDraft] = useState<MedicationOcrDraft | null>(null);

  const previousPatientId = useRef<string | undefined>(undefined);
  const settingsOrigin = useRef<Tab>('home');
  const insets = useSafeAreaInsets();
  const { activePatient, patients, selectPatient } = usePatient();
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
      {/* Keeps each person's enabled reminders scheduled whichever screen is open; the switches live in Settings. */}
      {patients.map((patient) => <ReminderSync key={patient.id} patient={patient} />)}
      <View style={styles.content}>
        {tab === 'home'
          ? (
            <HomeScreen
              onOpenAssistant={() => setAssistantVisible(true)}
              onOpenMedicines={() => setTab('medicines')}
              onOpenSettings={openSettings}
              onOpenToday={(occurrenceId) => {
                setFocusedOccurrenceId(occurrenceId ?? null);
                setTab('today');
              }}
            />
          )
          : tab === 'today'
            ? <TodayScreen focusedOccurrenceId={focusedOccurrenceId} onOpenMedicines={() => setTab('medicines')} onOpenSettings={openSettings} />
            : tab === 'medicines'
              ? <MedicinesScreen onOpenSettings={openSettings} />
              : <SettingsScreen accountName={session?.displayName} onBack={() => setTab(settingsOrigin.current)} onOpenWelcomeStory={onOpenWelcomeStory} onSignOut={() => void signOut()} />}
      </View>

      {tab !== 'settings' ? (
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <View accessibilityRole="tablist" style={styles.tabsRow}>
            <TabItem icon="house" label={t('nav.home')} onPress={() => setTab('home')} selected={tab === 'home'} />
            <TabItem icon="calendar-days" label={t('nav.today')} onPress={() => setTab('today')} selected={tab === 'today'} />
            <TabItem icon="pill" label={t('nav.medicines')} onPress={() => setTab('medicines')} selected={tab === 'medicines'} />
          </View>
          <PressableScale
            accessibilityHint={t('nav.quickActionsHint')}
            accessibilityLabel={t('nav.quickActions')}
            accessibilityRole="button"
            onPress={() => setIsQuickDrawerVisible(true)}
            style={styles.addButton}
          >
            <AppIcon color={colors.white} name="plus" size={24} />
          </PressableScale>
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
              <PressableScale
                accessibilityLabel={t('home.scanRxClose')}
                accessibilityRole="button"
                onPress={() => setScanRxModalVisible(false)}
                style={styles.modalCloseButton}
                targetScale={0.94}
              >
                <AppIcon color={colors.ink} name="x" size={22} />
              </PressableScale>
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
    tabBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      backgroundColor: colors.canvas,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    tabsRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    tabSlot: {
      flex: 1,
    },
    tab: {
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingTop: spacing.xs,
    },
    tabLabel: {
      ...typography.caption,
    },
    tabLabelSelected: {
      fontWeight: '700',
    },
    // Selection is marked by colour, weight, and this rule, so it never relies on colour alone.
    tabMarker: {
      width: 20,
      height: 2,
      borderRadius: radii.full,
      marginTop: 2,
    },
    tabMarkerSelected: {
      backgroundColor: colors.primary,
    },
    addButton: {
      width: 52,
      height: 52,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    scanModalContainer: {
      maxHeight: '90%',
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingBottom: spacing.lg,
    },
    scanModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    scanModalTitle: {
      ...sectionTitle,
      color: colors.ink,
      flex: 1,
    },
    scanModalBody: {
      padding: spacing.md,
    },
    modalCloseButton: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
