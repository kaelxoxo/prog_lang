import { useEffect, useRef, useState } from 'react';
import { LayoutAnimation, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PressableScale } from '../../components/PressableScale';
import { SyncNotice } from '../../components/SyncNotice';
import { apiRequest, errorMessage } from '../../lib/api';
import { confirmAction } from '../../lib/confirm';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { durations, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { CareCircleSection } from '../invitations/CareCircleSection';
import { InvitationInbox } from '../invitations/InvitationInbox';
import type { Medication } from '../medications/types';
import { CareHeader } from '../patients/CareHeader';
import { PatientChips } from '../patients/PatientChips';
import { usePatient } from '../patients/PatientProvider';
import { usePatientDisplay } from '../patients/usePatientDisplay';
import { useLocale } from '../settings/LocaleProvider';
import { partOfDay } from '../today/doseWindows';
import { actionableAt, manilaDate, type DoseOccurrence, type TimelineResponse } from '../today/types';
import { BantayHero } from './BantayHero';
import { addLocalDays, computeCareStreak, findRefillAlerts, heroState, sortHomeDoses, type HistoryDay } from './careInsights';
import {
  DueNowSection,
  formatTime,
  LaterTodaySection,
  RecordedSection,
  RefillSection,
  type RecordingState,
} from './HomeSections';

type Props = {
  onOpenAssistant: () => void;
  onOpenMedicines: () => void;
  onOpenSettings: () => void;
  /** Opens Today, focused on one Dose Occurrence when an id is given. */
  onOpenToday: (occurrenceId?: string) => void;
};

/** How long a just-recorded dose keeps its drawn check in place before folding into Recorded. */
const SETTLE_MS = 900;

function generateUuid() {
  const random = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Number.parseInt(random(), 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function HomeScreen({ onOpenAssistant, onOpenMedicines, onOpenSettings, onOpenToday }: Props) {
  const { styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const reducedMotion = useReducedMotion();
  const [settling, setSettling] = useState<ReadonlyMap<string, DoseOccurrence>>(() => new Map());
  const settleTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const unmounted = useRef(false);
  const queryClient = useQueryClient();
  const { session, token } = useAuth();
  const { activePatient, dataUpdatedAt, error: patientError, retry: retryPatients } = usePatient();
  const { name: patientName, showCareCircle, isSelf } = usePatientDisplay(activePatient);
  const now = useCurrentTime();
  const date = manilaDate(now);
  const timelineQuery = useQuery({
    queryKey: ['today', activePatient?.id, date],
    enabled: Boolean(activePatient),
    queryFn: () => apiRequest<TimelineResponse>(`/patients/${activePatient!.id}/today?date=${date}`, { token }),
  });
  // Same key and range as HistoryPanel so the 7-day history is fetched once and shared.
  const historyThrough = addLocalDays(date, -1);
  const historyQuery = useQuery({
    queryKey: ['history', activePatient?.id, historyThrough],
    enabled: Boolean(activePatient),
    queryFn: () =>
      apiRequest<{ history: HistoryDay[] }>(
        `/patients/${activePatient!.id}/history?through=${historyThrough}&days=7`,
        { token },
      ),
  });
  const medicationsQuery = useQuery({
    queryKey: ['medications', activePatient?.id],
    enabled: Boolean(activePatient),
    queryFn: () => apiRequest<{ medications: Medication[] }>(`/patients/${activePatient!.id}/medications`, { token }),
  });

  useEffect(() => {
    const timers = settleTimers.current;
    return () => {
      unmounted.current = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const takeDoseMutation = useMutation({
    mutationFn: (dose: DoseOccurrence) =>
      apiRequest(`/patients/${activePatient!.id}/doses/${dose.id}/events`, {
        method: 'POST',
        token,
        body: { kind: 'taken', clientActionId: generateUuid() },
      }),
    onSuccess: (_result, dose) => {
      // Keep the row where it was with its drawn check, then fold it into Recorded once both the
      // minimum hold has passed and the refetched timeline is in, so the row never flips back to "Take".
      setSettling((current) => new Map(current).set(dose.id, dose));
      const minimumHold = new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          settleTimers.current.delete(timer);
          resolve();
        }, SETTLE_MS);
        settleTimers.current.add(timer);
      });
      const refetched = queryClient.invalidateQueries({ queryKey: ['today', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['timeline', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['history', activePatient?.id] });
      void Promise.all([minimumHold, refetched]).then(() => {
        if (unmounted.current) return;
        LayoutAnimation.configureNext(
          reducedMotion
            ? LayoutAnimation.create(durations.stateChange, LayoutAnimation.Types.easeOut, LayoutAnimation.Properties.opacity)
            : {
                duration: durations.stateChange,
                create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
                update: { type: LayoutAnimation.Types.easeOut },
                delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
              },
        );
        setSettling((current) => {
          const next = new Map(current);
          next.delete(dose.id);
          return next;
        });
      });
    },
  });

  if (!activePatient) return null;

  const timeline = timelineQuery.data?.timeline ?? [];
  const currentTime = now.getTime();
  const careStreak = computeCareStreak([...(historyQuery.data?.history ?? []), { date, timeline }], date);
  const hero = heroState(timeline, currentTime, careStreak);
  // Sections read just-recorded doses as they were, so each keeps its place until its check has drawn.
  const sections = sortHomeDoses(
    timeline.map((dose) => settling.get(dose.id) ?? dose),
    currentTime,
  );
  const nextDose = sections.dueSoon[0] ?? sections.laterToday[0] ?? null;
  const refillAlerts = findRefillAlerts(medicationsQuery.data?.medications ?? [], date);
  const recording: RecordingState = {
    pendingId: takeDoseMutation.isPending ? (takeDoseMutation.variables?.id ?? null) : null,
    settling,
  };

  const greetingName = session?.displayName?.trim().split(/\s+/)[0] || t('home.caregiverFallback');
  const timeOfDay = partOfDay(now.toISOString());
  const greeting = t(
    timeOfDay === 'morning' ? 'home.greetingMorning' : timeOfDay === 'afternoon' ? 'home.greetingAfternoon' : 'home.greetingEvening',
    { name: greetingName },
  );
  const dateCaption = new Intl.DateTimeFormat(localeTag, {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);

  const recordEarly = (dose: DoseOccurrence) => {
    confirmAction({
      title: t('home.recordEarlyTitle', {
        time: formatTime(actionableAt(dose), localeTag),
        medicine: dose.medicationName,
      }),
      message: t('home.recordEarlyBody'),
      confirmLabel: t('home.recordEarlyConfirm'),
      cancelLabel: t('home.cancel'),
      onConfirm: () => takeDoseMutation.mutate(dose),
    });
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.contentColumn}>
          <CareHeader accountName={session?.displayName} onOpenSettings={onOpenSettings} />

          <SyncNotice error={patientError} onRetry={retryPatients} updatedAt={dataUpdatedAt} />

          <InvitationInbox />

          <Text style={styles.dateCaption}>{dateCaption}</Text>

          <PatientChips />

          {/* Bantay says the welcome; until today's doses load there is no hero, so the plain greeting stands in. */}
          {timelineQuery.data ? (
            <BantayHero
              hero={hero}
              isSelf={isSelf}
              key={activePatient.id}
              onOpenAssistant={onOpenAssistant}
              patientName={patientName}
              welcome={greeting}
            />
          ) : (
            <Text accessibilityRole="header" style={styles.greetingTitle}>
              {greeting}
            </Text>
          )}

          {timelineQuery.isLoading && !timelineQuery.data ? (
            <Text accessibilityLiveRegion="polite" style={styles.calm}>
              {t('home.loading')}
            </Text>
          ) : timelineQuery.error && !timelineQuery.data ? (
            <View style={styles.notice}>
              <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
                {errorMessage(timelineQuery.error)}
              </Text>
              <PressableScale
                accessibilityRole="button"
                onPress={() => void timelineQuery.refetch()}
                style={styles.textAction}
              >
                <Text style={styles.textActionLabel}>{t('app.retry')}</Text>
              </PressableScale>
            </View>
          ) : timeline.length === 0 ? (
            <View style={styles.notice}>
              <SyncNotice
                error={timelineQuery.error}
                onRetry={() => void timelineQuery.refetch()}
                updatedAt={timelineQuery.dataUpdatedAt}
              />
              {activePatient.canManageMedications ? null : <Text style={styles.calm}>{t('home.emptyViewerBody')}</Text>}
              <PressableScale accessibilityRole="button" onPress={onOpenMedicines} style={styles.textAction}>
                <Text style={styles.textActionLabel}>
                  {t(activePatient.canManageMedications ? 'home.manageMedicines' : 'home.viewMedicines')}
                </Text>
              </PressableScale>
            </View>
          ) : (
            <>
              <SyncNotice
                error={timelineQuery.error}
                onRetry={() => void timelineQuery.refetch()}
                updatedAt={timelineQuery.dataUpdatedAt}
              />

              {takeDoseMutation.error ? (
                <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
                  {errorMessage(takeDoseMutation.error)}
                </Text>
              ) : null}

              <DueNowSection
                allRecorded={hero.kind === 'allRecorded'}
                dueSoon={sections.dueSoon}
                nextDose={nextDose}
                onTake={(dose) => takeDoseMutation.mutate(dose)}
                recording={recording}
                slots={sections.notRecordedSlots}
              />
              <RecordedSection doses={sections.recorded} onCorrect={(dose) => onOpenToday(dose.id)} />
              <LaterTodaySection doses={sections.laterToday} onRecordEarly={recordEarly} recording={recording} />
            </>
          )}

          <RefillSection alerts={refillAlerts} onOpenMedicines={onOpenMedicines} />

          {showCareCircle ? <CareCircleSection patient={activePatient} /> : null}
        </View>
      </ScrollView>
    </>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    screen: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
      backgroundColor: colors.canvas,
    },
    contentColumn: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      gap: spacing.md,
    },
    dateCaption: {
      ...typography.caption,
      color: colors.muted,
      paddingTop: spacing.sm,
    },
    greetingTitle: {
      ...typography.hero,
      color: colors.ink,
    },
    calm: {
      ...typography.body,
      color: colors.muted,
    },
    notice: {
      gap: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      paddingTop: spacing.sm,
    },
    errorText: {
      ...typography.body,
      color: colors.danger,
    },
    textAction: {
      minHeight: 48,
      alignSelf: 'flex-start',
      justifyContent: 'center',
    },
    textActionLabel: {
      ...typography.bodyEmphasis,
      color: colors.primaryDark,
    },
  });
