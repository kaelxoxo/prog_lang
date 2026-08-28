import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
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
import { useLocale } from '../settings/LocaleProvider';
import { actionableAt, manilaDate, type DoseOccurrence, type TimelineResponse } from '../today/types';

type Props = { onOpenMedicines: () => void; onOpenSettings: () => void; onOpenToday: () => void };

function friendlyTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

function isHandled(dose: DoseOccurrence) {
  return dose.status === 'taken' || dose.status === 'skipped';
}

export function HomeScreen({ onOpenMedicines, onOpenSettings, onOpenToday }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { fontScale } = useWindowDimensions();
  const [isSwitcherVisible, setSwitcherVisible] = useState(false);
  const [isCreatorVisible, setCreatorVisible] = useState(false);
  const { session, token } = useAuth();
  const { activePatient, createPatient, dataUpdatedAt, error: patientError, isCreating, patients, retry: retryPatients, selectPatient } = usePatient();
  const now = useCurrentTime();
  const date = manilaDate(now);
  const timelineQuery = useQuery({
    queryKey: ['today', activePatient?.id, date],
    enabled: Boolean(activePatient),
    queryFn: () => apiRequest<TimelineResponse>(`/patients/${activePatient!.id}/today?date=${date}`, { token }),
  });
  const formattedDate = useMemo(
    () => new Intl.DateTimeFormat(localeTag, {
      timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric',
    }).format(now),
    [localeTag, now],
  );

  if (!activePatient) return null;

  const timeline = timelineQuery.data?.timeline ?? [];
  const handled = timeline.filter(isHandled).length;
  const progress = timeline.length ? Math.round((handled / timeline.length) * 100) : 0;
  const currentTime = now.getTime();
  const attention = timeline.filter((dose) => !isHandled(dose) && new Date(actionableAt(dose)).getTime() <= currentTime);
  const nextDose = timeline
    .filter((dose) => !isHandled(dose) && new Date(actionableAt(dose)).getTime() > currentTime)
    .sort((left, right) => new Date(actionableAt(left)).getTime() - new Date(actionableAt(right)).getTime())[0] ?? null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.contentColumn}>
          <CareHeader
            accountName={session?.displayName}
            onChangePerson={() => setSwitcherVisible(true)}
            onOpenSettings={onOpenSettings}
            patient={activePatient}
          />
          <SyncNotice error={patientError} onRetry={retryPatients} updatedAt={dataUpdatedAt} />

          <InvitationInbox />

          <View style={styles.intro}>
            <Text accessibilityRole="header" style={styles.title}>{t('home.title')}</Text>
            <Text style={styles.date}>{formattedDate}</Text>
          </View>

          {timelineQuery.isLoading && !timelineQuery.data ? (
            <View accessibilityLabel={t('home.loading')} accessible style={styles.summarySkeleton} />
          ) : timelineQuery.error && !timelineQuery.data ? (
            <View style={styles.errorBox}>
              <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage(timelineQuery.error)}</Text>
              <Pressable accessibilityRole="button" onPress={() => void timelineQuery.refetch()} style={styles.retry}>
                <Text style={styles.retryLabel}>{t('app.retry')}</Text>
              </Pressable>
            </View>
          ) : timeline.length === 0 ? (
            <>
              <SyncNotice error={timelineQuery.error} onRetry={() => void timelineQuery.refetch()} updatedAt={timelineQuery.dataUpdatedAt} />
              <View style={styles.emptyState}>
                <View style={styles.emptyHeading}>
                  <View style={styles.emptyIcon}><AppIcon color={colors.ink} name="pill" size={21} /></View>
                  <View style={styles.emptyCopy}>
                    <Text accessibilityRole="header" style={styles.emptyTitle}>{t('home.noConfirmedFor', { patient: activePatient.displayName })}</Text>
                    <Text style={styles.emptyBody}>{t(activePatient.canManageMedications ? 'home.emptyManagerBody' : 'home.emptyViewerBody')}</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel={t(activePatient.canManageMedications ? 'home.manageMedicines' : 'home.viewMedicines')}
                  accessibilityRole="button"
                  onPress={onOpenMedicines}
                  style={({ pressed }) => [styles.emptyAction, pressed && styles.primaryActionPressed]}
                >
                  <AppIcon color={colors.white} name="pill" size={20} />
                  <Text style={styles.primaryActionLabel}>{t(activePatient.canManageMedications ? 'home.manageMedicines' : 'home.viewMedicines')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
            <SyncNotice error={timelineQuery.error} onRetry={() => void timelineQuery.refetch()} updatedAt={timelineQuery.dataUpdatedAt} />
            <View style={styles.summary}>
              <View style={styles.nextSection}>
                <View style={styles.nextHeader}>
                  <View style={styles.nextIcon}><AppIcon color={colors.primaryDark} name="clock-3" size={21} /></View>
                  <View style={styles.nextMeta}>
                    <Text style={styles.eyebrow}>{t('home.next')}</Text>
                    {nextDose ? <Text style={styles.nextTime}>{friendlyTime(actionableAt(nextDose), localeTag)}</Text> : null}
                  </View>
                </View>
                {nextDose ? (
                  <>
                    <Text style={styles.nextMedicine}>{nextDose.medicationName}</Text>
                    <Text style={styles.nextDose}>{nextDose.doseQuantity} {nextDose.doseUnit}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.nextMedicine}>{t('home.noMoreDoses')}</Text>
                    <Text style={styles.nextDose}>{t('home.reviewToday')}</Text>
                  </>
                )}
              </View>

              <View style={[styles.attentionSection, attention.length > 0 && styles.attentionSectionActive]}>
                <View style={styles.attentionHeading}>
                  <AppIcon color={attention.length > 0 ? colors.warning : colors.successDark} name={attention.length > 0 ? 'circle-alert' : 'circle-check-big'} size={21} />
                  <Text style={[styles.attentionTitle, attention.length > 0 && styles.attentionTitleActive]}>
                    {attention.length > 0
                      ? t(attention.length === 1 ? 'home.oneNeedsReview' : 'home.manyNeedReview', { count: attention.length })
                      : t('home.caughtUp')}
                  </Text>
                </View>
                {attention.length > 0 ? <Text style={styles.attentionBody}>{t('home.attentionBody')}</Text> : null}
              </View>

              <View style={styles.progressSection}>
                <View style={styles.progressHeading}>
                  <Text style={styles.progressTitle}>{t('home.todaysCare')}</Text>
                  <Text style={styles.progressCount}>{t('home.recordedCount', { handled, total: timeline.length })}</Text>
                </View>
                <View accessibilityLabel={t('home.progressLabel', { handled, total: timeline.length })} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: timeline.length || 1, now: handled }} style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
              </View>
            </View>
            <View style={[styles.actions, fontScale > 1.3 && styles.actionsLarge]}>
              <Pressable accessibilityLabel={t(attention.length ? 'home.checkToday' : 'home.openToday')} accessibilityRole="button" onPress={onOpenToday} style={({ pressed }) => [styles.primaryAction, fontScale > 1.3 && styles.actionLarge, pressed && styles.primaryActionPressed]}>
                <AppIcon color={colors.white} name="calendar-days" size={20} />
                <Text style={styles.primaryActionLabel}>{t(attention.length ? 'home.checkToday' : 'home.openToday')}</Text>
              </Pressable>
              <Pressable accessibilityLabel={t(activePatient.canManageMedications ? 'home.manageMedicines' : 'home.viewMedicines')} accessibilityRole="button" onPress={onOpenMedicines} style={({ pressed }) => [styles.secondaryAction, fontScale > 1.3 && styles.actionLarge, pressed && styles.secondaryActionPressed]}>
                <AppIcon color={colors.ink} name="pill" size={20} />
                <Text style={styles.secondaryActionLabel}>{t(activePatient.canManageMedications ? 'home.manageMedicines' : 'home.viewMedicines')}</Text>
              </Pressable>
            </View>
            </>
          )}

          <CareCircleSection patient={activePatient} />
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
  intro: { gap: spacing.xs },
  title: { color: colors.ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  date: { color: colors.muted, fontSize: 14 },
  summarySkeleton: { height: 278, borderRadius: radii.md, backgroundColor: colors.mist },
  emptyState: { gap: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: spacing.lg },
  emptyHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  emptyIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.sun },
  emptyCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  emptyTitle: { maxWidth: 600, color: colors.ink, fontSize: 21, fontWeight: '900', lineHeight: 28 },
  emptyBody: { maxWidth: 600, color: colors.muted, fontSize: 15, lineHeight: 22 },
  emptyAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.lg },
  summary: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.white, paddingHorizontal: spacing.lg },
  nextSection: { gap: spacing.sm, paddingVertical: spacing.lg },
  nextHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.primaryTint },
  nextMeta: { flex: 1, gap: 1 },
  eyebrow: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  nextTime: { color: colors.primaryDark, fontSize: 18, fontWeight: '800' },
  nextMedicine: { maxWidth: 600, color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.4 },
  nextDose: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  attentionSection: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.md },
  attentionSectionActive: { backgroundColor: colors.warningTint, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  attentionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  actionsLarge: { flexDirection: 'column' },
  actionLarge: { width: '100%', flex: 0 },
  primaryAction: { minHeight: 52, minWidth: 170, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.lg },
  primaryActionPressed: { backgroundColor: colors.primaryDark },
  primaryActionLabel: { color: colors.white, fontSize: 16, fontWeight: '800' },
  secondaryAction: { minHeight: 52, minWidth: 170, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.white, paddingHorizontal: spacing.lg },
  secondaryActionPressed: { backgroundColor: colors.mist },
  secondaryActionLabel: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  errorBox: { gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  retry: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  retryLabel: { color: colors.error, fontSize: 14, fontWeight: '800' },
});
