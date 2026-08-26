import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { apiRequest, errorMessage } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { SyncNotice } from '../../components/SyncNotice';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { CareCircleSection } from '../invitations/CareCircleSection';
import { InvitationInbox } from '../invitations/InvitationInbox';
import { CareHeader } from '../patients/CareHeader';
import { CreatePatientModal } from '../patients/CreatePatientModal';
import { PatientSwitcher } from '../patients/PatientSwitcher';
import { usePatient } from '../patients/PatientProvider';
import { manilaDate, type DoseOccurrence, type TimelineResponse } from '../today/types';

type Props = { onOpenMedicines: () => void; onOpenToday: () => void };

function friendlyTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

function isHandled(dose: DoseOccurrence) {
  return dose.status === 'taken' || dose.status === 'skipped';
}

export function HomeScreen({ onOpenMedicines, onOpenToday }: Props) {
  const { styles } = useThemedStyles(createStyles);
  const [isSwitcherVisible, setSwitcherVisible] = useState(false);
  const [isCreatorVisible, setCreatorVisible] = useState(false);
  const { session, signOut, token } = useAuth();
  const { activePatient, createPatient, dataUpdatedAt, error: patientError, isCreating, patients, retry: retryPatients, selectPatient } = usePatient();
  const now = useCurrentTime();
  const date = manilaDate(now);
  const timelineQuery = useQuery({
    queryKey: ['today', activePatient?.id, date],
    enabled: Boolean(activePatient),
    queryFn: () => apiRequest<TimelineResponse>(`/patients/${activePatient!.id}/today?date=${date}`, { token }),
  });
  const formattedDate = useMemo(
    () => new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric',
    }).format(now),
    [now],
  );

  if (!activePatient) return null;

  const timeline = timelineQuery.data?.timeline ?? [];
  const handled = timeline.filter(isHandled).length;
  const progress = timeline.length ? Math.round((handled / timeline.length) * 100) : 0;
  const currentTime = now.getTime();
  const attention = timeline.filter((dose) => !isHandled(dose) && new Date(dose.dueAt).getTime() <= currentTime);
  const nextDose = timeline
    .filter((dose) => !isHandled(dose) && new Date(dose.dueAt).getTime() > currentTime)
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime())[0] ?? null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.contentColumn}>
          <CareHeader
            accountName={session?.displayName}
            onAddPerson={() => setCreatorVisible(true)}
            onChangePerson={() => setSwitcherVisible(true)}
            onSignOut={() => void signOut()}
            patient={activePatient}
          />
          <SyncNotice error={patientError} onRetry={retryPatients} updatedAt={dataUpdatedAt} />

          <InvitationInbox />

          <View style={styles.intro}>
            <Text style={styles.date}>{formattedDate}</Text>
            <Text accessibilityRole="header" style={styles.title}>Today at a glance</Text>
          </View>

          {timelineQuery.isLoading && !timelineQuery.data ? (
            <View accessibilityLabel="Loading today's care summary" style={styles.summarySkeleton} />
          ) : timelineQuery.error && !timelineQuery.data ? (
            <View style={styles.errorBox}>
              <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage(timelineQuery.error)}</Text>
              <Pressable accessibilityRole="button" onPress={() => void timelineQuery.refetch()} style={styles.retry}>
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <>
            <SyncNotice error={timelineQuery.error} onRetry={() => void timelineQuery.refetch()} updatedAt={timelineQuery.dataUpdatedAt} />
            <View style={styles.summary}>
              <View style={styles.nextSection}>
                <Text style={styles.eyebrow}>Next</Text>
                {nextDose ? (
                  <>
                    <Text style={styles.nextTime}>{friendlyTime(nextDose.dueAt)}</Text>
                    <Text style={styles.nextMedicine}>{nextDose.medicationName}</Text>
                    <Text style={styles.nextDose}>{nextDose.doseQuantity} {nextDose.doseUnit}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.nextMedicine}>{timeline.length ? 'No more scheduled doses today' : 'No doses scheduled today'}</Text>
                    <Text style={styles.nextDose}>{timeline.length ? 'Review Today for the complete care record.' : 'Add a confirmed medicine to begin.'}</Text>
                  </>
                )}
              </View>

              <View style={[styles.attentionSection, attention.length > 0 && styles.attentionSectionActive]}>
                <Text style={[styles.attentionTitle, attention.length > 0 && styles.attentionTitleActive]}>
                  {attention.length > 0
                    ? `${attention.length} ${attention.length === 1 ? 'dose needs' : 'doses need'} review`
                    : 'All caught up'}
                </Text>
                {attention.length > 0 ? <Text style={styles.attentionBody}>The scheduled time passed without a final care record. Check Today before recording what happened.</Text> : null}
              </View>

              <View style={styles.progressSection}>
                <View style={styles.progressHeading}>
                  <Text style={styles.progressTitle}>Today's care</Text>
                  <Text style={styles.progressCount}>{handled} of {timeline.length} recorded</Text>
                </View>
                <View accessibilityLabel={`${handled} of ${timeline.length} scheduled doses recorded`} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: timeline.length || 1, now: handled }} style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
              </View>
            </View>
            </>
          )}

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onOpenToday} style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryActionPressed]}>
              <Text style={styles.primaryActionLabel}>{attention.length ? 'Check Today' : 'Open Today'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onOpenMedicines} style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}>
              <Text style={styles.secondaryActionLabel}>{activePatient.canManageMedications ? 'Manage medicines' : 'View medicines'}</Text>
            </Pressable>
          </View>

          <CareCircleSection patient={activePatient} />
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
  intro: { gap: spacing.xs },
  title: { color: colors.ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  date: { color: colors.muted, fontSize: 14 },
  summarySkeleton: { height: 278, borderRadius: radii.lg, backgroundColor: colors.mist },
  summary: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radii.lg, backgroundColor: colors.white, paddingHorizontal: spacing.lg },
  nextSection: { gap: spacing.xs, paddingVertical: spacing.lg },
  eyebrow: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  nextTime: { color: colors.primaryDark, fontSize: 18, fontWeight: '800' },
  nextMedicine: { maxWidth: 600, color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.4 },
  nextDose: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  attentionSection: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.md },
  attentionSectionActive: { backgroundColor: colors.warningTint, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  attentionTitle: { color: colors.successDark, fontSize: 17, fontWeight: '800' },
  attentionTitleActive: { color: colors.warning },
  attentionBody: { maxWidth: 620, color: colors.muted, fontSize: 14, lineHeight: 21 },
  progressSection: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.md },
  progressHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  progressTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  progressCount: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: colors.mist, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: colors.success },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryAction: { minHeight: 52, minWidth: 170, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.lg },
  primaryActionPressed: { backgroundColor: colors.primaryDark },
  primaryActionLabel: { color: colors.white, fontSize: 16, fontWeight: '800' },
  secondaryAction: { minHeight: 52, minWidth: 170, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.white, paddingHorizontal: spacing.lg },
  secondaryActionPressed: { backgroundColor: colors.mist },
  secondaryActionLabel: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  errorBox: { gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  retry: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  retryLabel: { color: colors.error, fontSize: 14, fontWeight: '800' },
});
