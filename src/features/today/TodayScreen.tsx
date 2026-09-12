import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { SyncNotice } from '../../components/SyncNotice';
import { useAuth } from '../auth/AuthProvider';
import { HistoryPanel } from '../history/HistoryPanel';
import { InvitationInbox } from '../invitations/InvitationInbox';
import { CareHeader } from '../patients/CareHeader';
import { CreatePatientModal } from '../patients/CreatePatientModal';
import { PatientSwitcher } from '../patients/PatientSwitcher';
import { usePatient } from '../patients/PatientProvider';
import { ReminderControl } from '../reminders/ReminderControl';
import { useLocale } from '../settings/LocaleProvider';
import { DoseTimeline } from './DoseTimeline';

type Props = { focusedOccurrenceId?: string | null; onOpenMedicines: () => void; onOpenSettings: () => void };

export function TodayScreen({ focusedOccurrenceId, onOpenMedicines, onOpenSettings }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const [isSwitcherVisible, setSwitcherVisible] = useState(false);
  const [isCreatorVisible, setCreatorVisible] = useState(false);
  const [view, setView] = useState<'today' | 'history'>('today');
  const { session, signOut } = useAuth();
  const { activePatient, createPatient, dataUpdatedAt, error, isCreating, isLoading, patients, retry, selectPatient } = usePatient();
  const now = useCurrentTime();
  const scrollRef = useRef<ScrollView>(null);
  const timelineOffset = useRef(0);
  const formattedDate = useMemo(
    () => new Intl.DateTimeFormat(localeTag, {
      timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric',
    }).format(now),
    [localeTag, now],
  );

  useEffect(() => {
    setView('today');
  }, [activePatient?.id, focusedOccurrenceId]);

  if (isLoading) {
    return <View accessibilityLiveRegion="polite" style={styles.stateScreen}><Text style={styles.stateTitle}>{t('today.opening')}</Text></View>;
  }

  if (error && !activePatient) {
    return (
      <View style={styles.stateScreen}>
        <Text accessibilityRole="header" style={styles.stateTitle}>{t('today.loadError')}</Text>
        <Text accessibilityLiveRegion="assertive" style={styles.stateBody}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={styles.statePrimaryButton}><Text style={styles.statePrimaryLabel}>{t('app.retry')}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.stateSecondaryButton}><Text style={styles.stateSecondaryLabel}>{t('care.signOut')}</Text></Pressable>
      </View>
    );
  }

  if (!activePatient) {
    return (
      <>
        <ScrollView contentContainerStyle={styles.emptyScreen}>
          <View style={styles.emptyColumn}>
            <View style={styles.topBar}>
              <View><Text style={styles.brand}>Alaga</Text><Text style={styles.greeting}>{t('today.hello', { name: session?.displayName ?? '' })}</Text></View>
              <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.exitButton}><Text style={styles.exitLabel}>{t('care.signOut')}</Text></Pressable>
            </View>
            <InvitationInbox />
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><AppIcon color={colors.ink} name="user-round-plus" size={25} /></View>
              <Text style={styles.emptyEyebrow}>{t('today.firstSpace')}</Text>
              <Text accessibilityRole="header" style={styles.emptyTitle}>{t('today.who')}</Text>
              <Text style={styles.emptyBody}>{t('today.emptyBody')}</Text>
              <Pressable accessibilityRole="button" onPress={() => setCreatorVisible(true)} style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}>
                <Text style={styles.emptyButtonLabel}>{t('today.addPerson')}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
        <CreatePatientModal isCreating={isCreating} onClose={() => setCreatorVisible(false)} onCreate={createPatient} visible={isCreatorVisible} />
      </>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.screen} ref={scrollRef}>
        <View style={styles.contentColumn}>
          <CareHeader accountName={session?.displayName} onChangePerson={() => setSwitcherVisible(true)} onOpenSettings={onOpenSettings} patient={activePatient} />
          <SyncNotice error={error} onRetry={retry} updatedAt={dataUpdatedAt} />

          <View accessibilityRole="tablist" style={styles.viewSwitch}>
            {(['today', 'history'] as const).map((option) => (
              <Pressable
                accessibilityLabel={t(option === 'today' ? 'today.title' : 'today.history')}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === option }}
                key={option}
                onPress={() => setView(option)}
                style={({ pressed }) => [styles.viewOption, view === option && styles.viewOptionSelected, pressed && styles.pressed]}
              >
                <AppIcon color={view === option ? colors.ink : colors.muted} name={option === 'today' ? 'calendar-days' : 'history'} size={17} />
                <Text style={[styles.viewOptionLabel, view === option && styles.viewOptionLabelSelected]}>
                  {t(option === 'today' ? 'today.title' : 'today.history')}
                </Text>
              </Pressable>
            ))}
          </View>

          {view === 'today' ? (
            <>
              <View style={styles.datePill}>
                <AppIcon color={colors.muted} name="calendar-days" size={15} />
                <Text style={styles.date}>{formattedDate}</Text>
              </View>
              <View onLayout={(event) => { timelineOffset.current = event.nativeEvent.layout.y; }}>
                <DoseTimeline
                  focusedOccurrenceId={focusedOccurrenceId}
                  onFocusLayout={(offset) => scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, timelineOffset.current + offset - spacing.md) })}
                  onOpenMedicines={onOpenMedicines}
                  patient={activePatient}
                />
              </View>
              <ReminderControl patient={activePatient} />
            </>
          ) : <HistoryPanel patient={activePatient} />}
        </View>
      </ScrollView>

      <PatientSwitcher activePatientId={activePatient.id} onAddPerson={() => setCreatorVisible(true)} onClose={() => setSwitcherVisible(false)} onSelect={selectPatient} patients={patients} visible={isSwitcherVisible} />
      <CreatePatientModal isCreating={isCreating} onClose={() => setCreatorVisible(false)} onCreate={createPatient} visible={isCreatorVisible} />
    </>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flexGrow: 1, paddingBottom: spacing.xl, paddingHorizontal: 20, paddingTop: spacing.md, backgroundColor: colors.canvas },
  contentColumn: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: colors.ink, fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  greeting: { marginTop: 2, color: colors.muted, fontSize: 14 },
  exitButton: { minHeight: 48, justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: spacing.sm },
  exitLabel: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  datePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  date: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  viewSwitch: {
    flexDirection: 'row',
    borderRadius: radii.full,
    backgroundColor: colors.mist,
    padding: 4,
  },
  viewOption: {
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
  },
  viewOptionSelected: {
    backgroundColor: colors.white,
  },
  viewOptionLabel: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  viewOptionLabelSelected: { color: colors.ink, fontWeight: '900' },
  pressed: { opacity: 0.75 },
  stateScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.canvas },
  stateTitle: { maxWidth: 420, color: colors.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  stateBody: { maxWidth: 420, color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  statePrimaryButton: { minHeight: 52, minWidth: 180, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.lg },
  statePrimaryLabel: { color: colors.white, fontSize: 16, fontWeight: '700' },
  stateSecondaryButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.lg },
  stateSecondaryLabel: { color: colors.primaryDark, fontSize: 15, fontWeight: '700' },
  emptyScreen: { flexGrow: 1, padding: 20, backgroundColor: colors.canvas },
  emptyColumn: { width: '100%', maxWidth: 640, flex: 1, alignSelf: 'center', gap: spacing.xl },
  emptyCard: { flex: 1, justifyContent: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radii.lg, backgroundColor: colors.white, padding: spacing.xl },
  emptyIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: colors.sun },
  emptyEyebrow: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  emptyTitle: { maxWidth: 420, color: colors.ink, fontSize: 30, fontWeight: '900', lineHeight: 37 },
  emptyBody: { maxWidth: 440, color: colors.muted, fontSize: 16, lineHeight: 24 },
  emptyButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  emptyButtonPressed: { opacity: 0.82 },
  emptyButtonLabel: { color: colors.white, fontSize: 17, fontWeight: '800' },
});
