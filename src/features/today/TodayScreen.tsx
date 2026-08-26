import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { SyncNotice } from '../../components/SyncNotice';
import { useAuth } from '../auth/AuthProvider';
import { InvitationInbox } from '../invitations/InvitationInbox';
import { CareHeader } from '../patients/CareHeader';
import { CreatePatientModal } from '../patients/CreatePatientModal';
import { PatientSwitcher } from '../patients/PatientSwitcher';
import { usePatient } from '../patients/PatientProvider';
import { ReminderControl } from '../reminders/ReminderControl';
import { DoseTimeline } from './DoseTimeline';

export function TodayScreen({ focusedOccurrenceId, onOpenMedicines }: { focusedOccurrenceId?: string | null; onOpenMedicines: () => void }) {
  const { styles } = useThemedStyles(createStyles);
  const [isSwitcherVisible, setSwitcherVisible] = useState(false);
  const [isCreatorVisible, setCreatorVisible] = useState(false);
  const { session, signOut } = useAuth();
  const { activePatient, createPatient, dataUpdatedAt, error, isCreating, isLoading, patients, retry, selectPatient } = usePatient();
  const now = useCurrentTime();
  const scrollRef = useRef<ScrollView>(null);
  const timelineOffset = useRef(0);
  const formattedDate = useMemo(
    () => new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric',
    }).format(now),
    [now],
  );

  if (isLoading) {
    return <View accessibilityLiveRegion="polite" style={styles.stateScreen}><Text style={styles.stateTitle}>Opening your care spaces...</Text></View>;
  }

  if (error && !activePatient) {
    return (
      <View style={styles.stateScreen}>
        <Text accessibilityRole="header" style={styles.stateTitle}>Your care spaces could not load.</Text>
        <Text accessibilityLiveRegion="assertive" style={styles.stateBody}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={styles.statePrimaryButton}><Text style={styles.statePrimaryLabel}>Try again</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.stateSecondaryButton}><Text style={styles.stateSecondaryLabel}>Sign out</Text></Pressable>
      </View>
    );
  }

  if (!activePatient) {
    return (
      <>
        <ScrollView contentContainerStyle={styles.emptyScreen}>
          <View style={styles.emptyColumn}>
            <View style={styles.topBar}>
              <View><Text style={styles.brand}>Alaga</Text><Text style={styles.greeting}>Hello, {session?.displayName}</Text></View>
              <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.exitButton}><Text style={styles.exitLabel}>Sign out</Text></Pressable>
            </View>
            <InvitationInbox />
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEyebrow}>Your first care space</Text>
              <Text accessibilityRole="header" style={styles.emptyTitle}>Who are you caring for?</Text>
              <Text style={styles.emptyBody}>Add a person before entering medicines or schedules. You will be their first care manager.</Text>
              <Pressable accessibilityRole="button" onPress={() => setCreatorVisible(true)} style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}>
                <Text style={styles.emptyButtonLabel}>Add a person</Text>
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
          <CareHeader accountName={session?.displayName} onAddPerson={() => setCreatorVisible(true)} onChangePerson={() => setSwitcherVisible(true)} onSignOut={() => void signOut()} patient={activePatient} />
          <SyncNotice error={error} onRetry={retry} updatedAt={dataUpdatedAt} />

          <View style={styles.todayIntro}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Today</Text>
            <Text style={styles.date}>{formattedDate}</Text>
          </View>
          <ReminderControl patient={activePatient} />
          <View onLayout={(event) => { timelineOffset.current = event.nativeEvent.layout.y; }}>
            <DoseTimeline
              focusedOccurrenceId={focusedOccurrenceId}
              onFocusLayout={(offset) => scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, timelineOffset.current + offset - spacing.md) })}
              onOpenMedicines={onOpenMedicines}
              patient={activePatient}
            />
          </View>
        </View>
      </ScrollView>

      <PatientSwitcher activePatientId={activePatient.id} onClose={() => setSwitcherVisible(false)} onSelect={selectPatient} patients={patients} visible={isSwitcherVisible} />
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
  exitButtonPressed: { backgroundColor: colors.mist },
  exitLabel: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  identityCard: { gap: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.ink, padding: spacing.lg },
  identityMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 32, backgroundColor: colors.sun },
  avatarLabel: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  identityCopy: { flex: 1 },
  eyebrow: { color: colors.inkMuted, fontSize: 13, fontWeight: '700' },
  patientName: { marginTop: spacing.xs, color: colors.white, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  relationship: { marginTop: 3, color: colors.inkMuted, fontSize: 14 },
  patientActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchButton: { minHeight: 52, minWidth: 180, flex: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.inkLine, borderRadius: radii.md, backgroundColor: colors.inkRaised },
  addPersonButton: { minHeight: 52, minWidth: 120, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.inkLine, borderRadius: radii.md },
  switchButtonPressed: { backgroundColor: colors.primaryDark },
  switchLabel: { color: colors.white, fontSize: 15, fontWeight: '700' },
  todayIntro: { gap: spacing.xs },
  sectionTitle: { color: colors.ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  date: { color: colors.muted, fontSize: 14 },
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
  emptyEyebrow: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  emptyTitle: { maxWidth: 420, color: colors.ink, fontSize: 30, fontWeight: '900', lineHeight: 37 },
  emptyBody: { maxWidth: 440, color: colors.muted, fontSize: 16, lineHeight: 24 },
  emptyButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  emptyButtonPressed: { opacity: 0.82 },
  emptyButtonLabel: { color: colors.white, fontSize: 17, fontWeight: '800' },
});
