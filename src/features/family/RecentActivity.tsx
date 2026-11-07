import { Fragment, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { PressableScale } from '../../components/PressableScale';
import { apiRequest, errorMessage } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { addLocalDays } from '../home/careInsights';
import { formatTime } from '../home/HomeSections';
import type { Patient } from '../patients/types';
import { useLocale } from '../settings/LocaleProvider';
import { manilaDate, type DoseOccurrence, type TimelineResponse } from '../today/types';
import { ACTIVITY_PREVIEW, buildActivity, type ActivityEntry } from './familyActivity';

/** Who recorded what over the last week, newest first, by day. Reads the same today and history caches as Home. */
export function RecentActivity({ patient }: { patient: Patient }) {
  const { styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { session, token } = useAuth();
  const [showAll, setShowAll] = useState(false);
  const date = manilaDate(useCurrentTime());
  const historyThrough = addLocalDays(date, -1);
  const todayQuery = useQuery({
    queryKey: ['today', patient.id, date],
    queryFn: () => apiRequest<TimelineResponse>(`/patients/${patient.id}/today?date=${date}`, { token }),
  });
  const historyQuery = useQuery({
    queryKey: ['history', patient.id, historyThrough],
    queryFn: () =>
      apiRequest<{ history: { date: string; timeline: DoseOccurrence[] }[] }>(
        `/patients/${patient.id}/history?through=${historyThrough}&days=7`,
        { token },
      ),
  });

  const activity = useMemo(
    () =>
      buildActivity(
        [...(todayQuery.data?.timeline ?? []), ...(historyQuery.data?.history ?? []).flatMap((day) => day.timeline)],
        { today: date, viewerName: session?.displayName, limit: showAll ? Infinity : ACTIVITY_PREVIEW },
      ),
    [todayQuery.data, historyQuery.data, date, session?.displayName, showAll],
  );

  const failed = [todayQuery, historyQuery].find((query) => query.error && !query.data);
  const loading = (todayQuery.isLoading && !todayQuery.data) || (historyQuery.isLoading && !historyQuery.data);

  // The template keeps its placeholders so the actor and the status can be set in bold.
  const sentence = (entry: ActivityEntry) => {
    const values: Record<string, { text: string; bold: boolean }> = {
      actor: {
        text: !entry.actor
          ? t('family.activitySomeone')
          : entry.actor.kind === 'you'
            ? t('family.activityYou')
            : entry.actor.name,
        bold: true,
      },
      medicine: { text: entry.medicationName, bold: false },
      status: { text: t(entry.status === 'taken' ? 'family.statusTaken' : 'family.statusSkipped'), bold: true },
    };
    return t(entry.corrected ? 'family.activityCorrected' : 'family.activityRecorded')
      .split(/\{(\w+)\}/)
      .map((part, index) => {
        // Odd indexes are placeholder names.
        if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
        const value = values[part];
        return value?.bold ? <Text key={index} style={styles.bold}>{value.text}</Text> : <Fragment key={index}>{value?.text ?? part}</Fragment>;
      });
  };

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{t('family.activityTitle')}</Text>
      {loading ? (
        <Text accessibilityLiveRegion="polite" style={styles.calm}>{t('family.activityLoading')}</Text>
      ) : failed ? (
        <View>
          <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage(failed.error)}</Text>
          <PressableScale
            accessibilityRole="button"
            onPress={() => {
              void todayQuery.refetch();
              void historyQuery.refetch();
            }}
            style={styles.textAction}
          >
            <Text style={styles.textActionLabel}>{t('app.retry')}</Text>
          </PressableScale>
        </View>
      ) : !activity.days.length ? (
        <Text style={styles.calm}>{t('family.activityEmpty')}</Text>
      ) : (
        <>
          {activity.days.map((day) => (
            <View key={day.date}>
              <Text accessibilityRole="header" style={styles.dayTitle}>
                {day.relative === 'today'
                  ? t('family.today')
                  : day.relative === 'yesterday'
                    ? t('family.yesterday')
                    : new Intl.DateTimeFormat(localeTag, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
                      .format(new Date(`${day.date}T12:00:00+08:00`))}
              </Text>
              {day.entries.map((entry) => (
                <View accessible key={entry.id} style={styles.row}>
                  <Text style={styles.rowText}>
                    {sentence(entry)}
                    <Text style={styles.time}>{` · ${formatTime(entry.recordedAt, localeTag)}`}</Text>
                  </Text>
                </View>
              ))}
            </View>
          ))}
          {activity.hidden > 0 ? (
            <PressableScale
              accessibilityLabel={t('family.showEarlierA11y', { count: activity.hidden })}
              accessibilityRole="button"
              onPress={() => setShowAll(true)}
              style={styles.textAction}
            >
              <Text style={styles.textActionLabel}>{t('family.showEarlier')}</Text>
            </PressableScale>
          ) : null}
        </>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  sectionTitle: {
    ...sectionTitle,
    color: colors.ink,
    paddingVertical: spacing.xs,
  },
  dayTitle: {
    ...typography.caption,
    color: colors.muted,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  row: {
    minHeight: 48,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingVertical: spacing.sm,
  },
  rowText: {
    ...typography.body,
    color: colors.ink,
  },
  bold: {
    fontWeight: '700',
  },
  time: {
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  calm: {
    ...typography.body,
    color: colors.muted,
    paddingVertical: spacing.sm,
  },
  error: {
    ...typography.body,
    color: colors.error,
    paddingVertical: spacing.xs,
  },
  textAction: {
    minHeight: 48,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  textActionLabel: {
    ...typography.bodyEmphasis,
    color: colors.primaryDark,
  },
});
