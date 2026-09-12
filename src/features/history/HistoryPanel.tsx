import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest, errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { useLocale } from '../settings/LocaleProvider';
import { manilaDate, type DoseOccurrence } from '../today/types';

type HistoryDay = { date: string; timeline: DoseOccurrence[] };
type HistoryResponse = { through: string; days: number; history: HistoryDay[] };

function friendlyDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
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

function friendlyTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
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

function statusLine(dose: DoseOccurrence, locale: string, t: ReturnType<typeof useLocale>['t']) {
  if (dose.status === 'not_recorded') return t('dose.notRecorded');
  if (dose.status === 'snoozed') {
    return dose.snoozedUntil ? t('dose.snoozedUntil', { time: friendlyTime(dose.snoozedUntil, locale) }) : t('dose.snooze');
  }
  const actor = dose.recordedByName ? t('dose.by', { name: dose.recordedByName }) : '';
  const time = dose.recordedAt ? t('dose.at', { time: friendlyTime(dose.recordedAt, locale) }) : '';
  const correction = dose.reason ? t('dose.correction', { reason: dose.reason }) : '';
  return `${t(dose.status === 'taken' ? 'dose.taken' : 'dose.skipped')}${actor}${time}${correction}`;
}

export function HistoryPanel({ patient }: { patient: Patient }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const { localeTag, t } = useLocale();
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
      <Text style={styles.subtitle}>{t('history.subtitle', { patient: patient.displayName })}</Text>

      {historyQuery.isLoading && !historyQuery.data ? (
        <Text accessibilityLiveRegion="polite" style={styles.stateText}>{t('history.loading')}</Text>
      ) : historyQuery.error && !historyQuery.data ? (
        <View style={styles.errorBox}>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage(historyQuery.error)}</Text>
          <Pressable accessibilityRole="button" onPress={() => void historyQuery.refetch()} style={styles.retryButton}>
            <Text style={styles.retryLabel}>{t('app.retry')}</Text>
          </Pressable>
        </View>
      ) : !daysWithEntries.length ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><AppIcon color={colors.ink} name="calendar-days" size={22} /></View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('history.emptyBody')}</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <AppIcon color={colors.primaryDark} name="activity" size={18} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>{t('history.title')}</Text>
              <Text accessibilityLiveRegion="polite" style={styles.summaryValue}>
                {t('history.summary', { recorded: totals.recorded, available: totals.available })}
              </Text>
            </View>
          </View>

          <View style={styles.days}>
            {daysWithEntries.map((day) => (
              <View key={day.date} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayBadge}>
                    <AppIcon color={colors.primaryDark} name="calendar-days" size={14} />
                    <Text accessibilityRole="header" style={styles.dayTitle}>{friendlyDate(day.date, localeTag)}</Text>
                  </View>
                  <View style={styles.doseCountBadge}>
                    <Text style={styles.doseCountText}>{day.timeline.length}</Text>
                  </View>
                </View>

                <View style={styles.entries}>
                  {day.timeline.map((dose) => {
                    const isTaken = dose.status === 'taken';
                    const isSkipped = dose.status === 'skipped';
                    const isSnoozed = dose.status === 'snoozed';
                    const isNotRecorded = dose.status === 'not_recorded';

                    return (
                      <View
                        accessibilityLabel={`${friendlyTime(dose.scheduledFor, localeTag)}, ${dose.medicationName}, ${doseLine(dose)}, ${statusLine(dose, localeTag, t)}`}
                        accessible
                        key={dose.id}
                        style={[styles.entry, fontScale > 1.3 && styles.entryLarge]}
                      >
                        <View style={styles.timePill}>
                          <AppIcon color={colors.ink} name="clock-3" size={13} />
                          <Text style={styles.timeText}>{friendlyTime(dose.scheduledFor, localeTag)}</Text>
                        </View>
                        <View style={styles.entryCopy}>
                          <View style={styles.medicineRow}>
                            <Text style={styles.medicine}>{dose.medicationName}</Text>
                            <View style={styles.doseChip}>
                              <Text style={styles.doseChipText}>{doseLine(dose)}</Text>
                            </View>
                          </View>
                          <View style={[
                            styles.statusBadge,
                            isTaken && styles.statusBadgeTaken,
                            isSkipped && styles.statusBadgeSkipped,
                            isSnoozed && styles.statusBadgeSnoozed,
                            isNotRecorded && styles.statusBadgeNotRecorded,
                          ]}>
                            <AppIcon
                              color={isTaken ? colors.successDark : isNotRecorded ? colors.warning : colors.ink}
                              name={isTaken ? 'circle-check-big' : isSkipped ? 'minus' : isSnoozed ? 'clock-3' : 'alert-circle'}
                              size={13}
                            />
                            <Text style={[
                              styles.statusText,
                              isTaken && styles.statusTextTaken,
                              isSkipped && styles.statusTextSkipped,
                              isSnoozed && styles.statusTextSnoozed,
                              isNotRecorded && styles.statusTextNotRecorded,
                            ]}>
                              {statusLine(dose, localeTag, t)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
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
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  stateText: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, color: colors.muted, fontSize: 15, paddingVertical: spacing.lg },
  errorBox: { gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  retryLabel: { color: colors.error, fontSize: 14, fontWeight: '800' },
  emptyCard: {
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.xl,
  },
  emptyIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.sun },
  emptyCopy: { flex: 1, gap: spacing.xs },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  emptyBody: { maxWidth: 560, color: colors.muted, fontSize: 14, lineHeight: 21 },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  summaryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: { flex: 1, gap: 2 },
  summaryTitle: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  summaryValue: { color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  days: { gap: spacing.md },
  dayCard: {
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  doseCountBadge: {
    borderRadius: radii.full,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  doseCountText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  entries: { gap: spacing.sm },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radii.md,
    padding: 12,
  },
  entryLarge: { flexDirection: 'column', gap: spacing.xs },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timeText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  entryCopy: { flex: 1, gap: 6 },
  medicineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  medicine: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  doseChip: {
    borderRadius: radii.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  doseChipText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusBadgeTaken: { backgroundColor: colors.successTint, borderColor: colors.success },
  statusBadgeSkipped: { backgroundColor: colors.mist, borderColor: colors.line },
  statusBadgeSnoozed: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  statusBadgeNotRecorded: { backgroundColor: colors.warningTint, borderColor: colors.warning },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextTaken: { color: colors.successDark },
  statusTextSkipped: { color: colors.muted },
  statusTextSnoozed: { color: colors.primaryDark },
  statusTextNotRecorded: { color: colors.warning },
});
