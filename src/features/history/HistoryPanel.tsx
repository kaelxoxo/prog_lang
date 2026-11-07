import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { DrawnCheck } from '../../components/DrawnCheck';
import { PressableScale } from '../../components/PressableScale';
import { apiRequest, errorMessage } from '../../lib/api';
import { sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { usePatientDisplay } from '../patients/usePatientDisplay';
import { useLocale } from '../settings/LocaleProvider';
import type { translate } from '../settings/translations';
import { isRecorded } from '../today/doseWindows';
import { manilaDate, type DoseOccurrence } from '../today/types';

type HistoryDay = { date: string; timeline: DoseOccurrence[] };
type HistoryResponse = { through: string; days: number; history: HistoryDay[] };

function friendlyDate(value: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Manila',
    weekday: 'long',
  }).format(new Date(`${value}T12:00:00+08:00`));
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function friendlyTime(value: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

function doseLine(dose: DoseOccurrence) {
  const strength = dose.strengthValue && dose.strengthUnit
    ? ` · ${dose.strengthValue} ${dose.strengthUnit}`
    : '';
  return `${dose.doseQuantity} ${dose.doseUnit}${strength}`;
}

/** Past days are closed: anything not taken or skipped (snoozed included) is Not Recorded. */
function statusLine(dose: DoseOccurrence, localeTag: string, t: typeof translate) {
  if (!isRecorded(dose)) return t('dose.notRecorded');
  const actor = dose.recordedByName ? t('dose.by', { name: dose.recordedByName }) : '';
  const time = dose.recordedAt ? t('dose.at', { time: friendlyTime(dose.recordedAt, localeTag) }) : '';
  const correction = dose.reason ? t('dose.correction', { reason: dose.reason }) : '';
  return `${t(dose.status === 'taken' ? 'dose.taken' : 'dose.skipped')}${actor}${time}${correction}`;
}

export function HistoryPanel({ patient }: { patient: Patient }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const { localeTag, t } = useLocale();
  const { token } = useAuth();
  const { isSelf } = usePatientDisplay(patient);
  const through = addDays(manilaDate(), -1);
  const historyQuery = useQuery({
    queryKey: ['history', patient.id, through],
    queryFn: () => apiRequest<HistoryResponse>(
      `/patients/${patient.id}/history?through=${through}&days=7`,
      { token },
    ),
  });
  const daysWithEntries = useMemo(
    () => (historyQuery.data?.history ?? []).filter((day) => day.timeline.length).reverse(),
    [historyQuery.data?.history],
  );
  const totals = useMemo(() => {
    const doses = daysWithEntries.flatMap((day) => day.timeline);
    return { available: doses.length, recorded: doses.filter(isRecorded).length };
  }, [daysWithEntries]);

  return (
    <View style={styles.section}>
      <Text style={styles.subtitle}>{isSelf ? t('shell.yourCareLog') : t('history.subtitle', { patient: patient.displayName })}</Text>

      {historyQuery.isLoading && !historyQuery.data ? (
        <Text accessibilityLiveRegion="polite" style={styles.stateText}>{t('history.loading')}</Text>
      ) : historyQuery.error && !historyQuery.data ? (
        <View style={styles.errorBlock}>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage(historyQuery.error)}</Text>
          <View style={styles.buttonRow}>
            <PressableScale accessibilityRole="button" onPress={() => void historyQuery.refetch()} style={styles.retryButton}>
              <Text style={styles.retryLabel}>{t('app.retry')}</Text>
            </PressableScale>
          </View>
        </View>
      ) : !daysWithEntries.length ? (
        <View style={styles.message}>
          <Text accessibilityRole="header" style={styles.dayTitle}>{t('history.emptyTitle')}</Text>
          <Text style={styles.messageBody}>{t('history.emptyBody')}</Text>
        </View>
      ) : (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.summary}>
            {t('history.summary', { recorded: totals.recorded, available: totals.available })}
          </Text>

          {daysWithEntries.map((day) => (
            <View key={day.date} style={styles.day}>
              <View style={styles.dayHeader}>
                <Text accessibilityRole="header" style={styles.dayTitle}>{friendlyDate(day.date, localeTag)}</Text>
                <Text style={styles.dayCount}>
                  {day.timeline.length === 1 ? t('today.oneDose') : t('today.doseCount', { count: day.timeline.length })}
                </Text>
              </View>

              {day.timeline.map((dose) => {
                const notRecorded = !isRecorded(dose);
                const status = statusLine(dose, localeTag, t);
                const time = friendlyTime(dose.scheduledFor, localeTag);
                return (
                  <View
                    accessibilityLabel={`${time}, ${dose.medicationName}, ${doseLine(dose)}, ${status}`}
                    accessible
                    key={dose.id}
                    style={[styles.entry, largeText && styles.entryLarge]}
                  >
                    <Text style={[styles.time, largeText && styles.timeLarge]}>{time}</Text>
                    <View style={styles.marker}>
                      {dose.status === 'taken' ? (
                        <DrawnCheck color={colors.ink} size={20} />
                      ) : dose.status === 'skipped' ? (
                        <AppIcon color={colors.ink} name="minus" size={18} />
                      ) : (
                        <View style={styles.dot} />
                      )}
                    </View>
                    <View style={styles.entryCopy}>
                      <Text style={styles.medicine}>{dose.medicationName}</Text>
                      <Text style={styles.details}>{doseLine(dose)}</Text>
                      <Text style={[styles.status, notRecorded && styles.statusNotRecorded]}>{status}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { gap: spacing.md },
  subtitle: { ...typography.body, color: colors.muted },
  stateText: {
    ...typography.body,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    color: colors.muted,
    paddingVertical: spacing.lg,
  },
  errorBlock: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.md },
  errorText: { ...typography.body, color: colors.error },
  buttonRow: { flexDirection: 'row' },
  retryButton: { minHeight: 48, justifyContent: 'center' },
  retryLabel: { ...typography.headline, color: colors.error },
  message: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.md },
  messageBody: { ...typography.body, maxWidth: 560, color: colors.muted },
  summary: { ...typography.caption, color: colors.muted },
  day: { borderTopWidth: 1, borderTopColor: colors.controlBorder, paddingTop: spacing.sm },
  dayHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm, paddingBottom: spacing.sm },
  dayTitle: { ...sectionTitle, color: colors.ink },
  dayCount: { ...typography.caption, color: colors.muted },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingVertical: 12,
  },
  entryLarge: { flexWrap: 'wrap', rowGap: spacing.xs },
  time: { ...typography.caption, width: 68, color: colors.muted, paddingTop: 2 },
  timeLarge: { width: '100%' },
  marker: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning },
  entryCopy: { flex: 1, gap: 2 },
  medicine: { ...typography.bodyEmphasis, color: colors.ink },
  details: { ...typography.body, color: colors.muted },
  status: { ...typography.caption, color: colors.ink, marginTop: 2 },
  statusNotRecorded: { color: colors.warning, fontWeight: '600' },
});
