import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { apiRequest, errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { manilaDate, type DoseOccurrence } from '../today/types';

type HistoryDay = { date: string; timeline: DoseOccurrence[] };
type HistoryResponse = { through: string; days: number; history: HistoryDay[] };

function friendlyDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
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

function friendlyTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

function doseLine(dose: DoseOccurrence) {
  const strength = dose.strengthValue && dose.strengthUnit
    ? `, ${dose.strengthValue} ${dose.strengthUnit}`
    : '';
  return `${dose.doseQuantity} ${dose.doseUnit}${strength}`;
}

function statusLine(dose: DoseOccurrence) {
  if (dose.status === 'not_recorded') return 'Not recorded';
  if (dose.status === 'snoozed') {
    return dose.snoozedUntil ? `Snoozed until ${friendlyTime(dose.snoozedUntil)}` : 'Snoozed';
  }
  const actor = dose.recordedByName ? ` by ${dose.recordedByName}` : '';
  const time = dose.recordedAt ? ` at ${friendlyTime(dose.recordedAt)}` : '';
  const correction = dose.reason ? ` Correction: ${dose.reason}` : '';
  return `${dose.status === 'taken' ? 'Taken' : 'Skipped'}${actor}${time}.${correction}`;
}

export function HistoryPanel({ patient }: { patient: Patient }) {
  const { styles } = useThemedStyles(createStyles);
  const { token } = useAuth();
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
    return {
      available: doses.length,
      recorded: doses.filter((dose) => dose.status === 'taken' || dose.status === 'skipped').length,
    };
  }, [daysWithEntries]);

  return (
    <View style={styles.section}>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>Past 7 days</Text>
        <Text style={styles.subtitle}>Read-only care entries for {patient.displayName}</Text>
      </View>

      {historyQuery.isLoading && !historyQuery.data ? (
        <Text accessibilityLiveRegion="polite" style={styles.stateText}>Loading care history...</Text>
      ) : historyQuery.error && !historyQuery.data ? (
        <View style={styles.errorBox}>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage(historyQuery.error)}</Text>
          <Pressable accessibilityRole="button" onPress={() => void historyQuery.refetch()} style={styles.retryButton}>
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : !daysWithEntries.length ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyDot} />
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>No care entries available</Text>
            <Text style={styles.emptyBody}>History appears after Alaga has opened or scheduled a care day. It never reconstructs an old day from a newer medicine version.</Text>
          </View>
        </View>
      ) : (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.summary}>
            {totals.recorded} of {totals.available} available entries have a taken or skipped record.
          </Text>
          <View style={styles.days}>
            {daysWithEntries.map((day) => (
              <View key={day.date} style={styles.day}>
                <Text accessibilityRole="header" style={styles.dayTitle}>{friendlyDate(day.date)}</Text>
                <View style={styles.entries}>
                  {day.timeline.map((dose) => (
                    <View key={dose.id} style={styles.entry}>
                      <Text style={styles.time}>{friendlyTime(dose.scheduledFor)}</Text>
                      <View style={styles.entryCopy}>
                        <Text style={styles.medicine}>{dose.medicationName}</Text>
                        <Text style={styles.dose}>{doseLine(dose)}</Text>
                        <Text style={dose.status === 'not_recorded' ? styles.unknown : styles.status}>
                          {statusLine(dose)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { gap: spacing.md },
  intro: { gap: spacing.xs },
  title: { color: colors.ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  stateText: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, color: colors.muted, fontSize: 15, paddingVertical: spacing.lg },
  errorBox: { gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  retryLabel: { color: colors.error, fontSize: 14, fontWeight: '800' },
  emptyState: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: spacing.lg },
  emptyDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.sun, marginTop: 4 },
  emptyCopy: { flex: 1, gap: spacing.xs },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  emptyBody: { maxWidth: 560, color: colors.muted, fontSize: 14, lineHeight: 21 },
  summary: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  days: { borderTopWidth: 1, borderTopColor: colors.line },
  day: { gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.md },
  dayTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  entries: { gap: spacing.sm },
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  time: { width: 76, color: colors.ink, fontSize: 15, fontWeight: '800' },
  entryCopy: { flex: 1, gap: 2 },
  medicine: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  dose: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  status: { color: colors.successDark, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  unknown: { color: colors.warning, fontSize: 14, fontWeight: '700', lineHeight: 20 },
});
