import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest, errorMessage } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { useLocale } from '../settings/LocaleProvider';
import { manilaDate, type DoseOccurrence } from '../today/types';
import {
  cancelPatientReminders,
  readReminderPreference,
  remindersPermission,
  requestRemindersPermission,
  saveReminderPreference,
  syncPatientReminders,
} from './notifications';

type ReminderResponse = { timeline: DoseOccurrence[] };

export function ReminderControl({ patient }: { patient: Patient }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { session, token } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const date = manilaDate(useCurrentTime());

  useEffect(() => {
    let active = true;
    setReady(false);
    if (!session) return () => { active = false; };
    void Promise.all([
      readReminderPreference(session.id, patient.id),
      remindersPermission(),
    ]).then(([preference, granted]) => {
      if (!active) return;
      setEnabled(preference);
      setPermission(granted);
      setReady(true);
    }).catch((error) => {
      if (!active) return;
      setSyncError(errorMessage(error));
      setReady(true);
    });
    return () => { active = false; };
  }, [patient.id, session]);

  const query = useQuery({
    queryKey: ['reminders', patient.id, date],
    enabled: ready && enabled && permission && Platform.OS !== 'web',
    queryFn: () => apiRequest<ReminderResponse>(`/patients/${patient.id}/reminders?from=${date}&days=7`, { token }),
  });

  useEffect(() => {
    if (!query.data || !enabled || !permission) return;
    let active = true;
    void syncPatientReminders(patient, query.data.timeline)
      .then(() => { if (active) setSyncError(null); })
      .catch((error) => { if (active) setSyncError(errorMessage(error)); });
    return () => { active = false; };
  }, [enabled, patient, permission, query.data]);

  const enable = async () => {
    if (!session) return;
    setSaving(true);
    setSyncError(null);
    try {
      const granted = await requestRemindersPermission();
      setPermission(granted);
      if (!granted) {
        setSyncError(t('reminders.blocked'));
        return;
      }
      await saveReminderPreference(session.id, patient.id, true);
      setEnabled(true);
    } catch (error) {
      setSyncError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const disable = async () => {
    if (!session) return;
    setSaving(true);
    setSyncError(null);
    try {
      await saveReminderPreference(session.id, patient.id, false);
      await cancelPatientReminders(patient.id);
      setEnabled(false);
    } catch (error) {
      setSyncError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (Platform.OS === 'web') return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <AppIcon color={colors.primaryDark} name="bell" size={18} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{t('reminders.title')}</Text>
          <Text style={styles.body}>{t(enabled && permission ? 'reminders.onBody' : 'reminders.offBody')}</Text>
        </View>
        <View style={[styles.switchTarget, (!ready || saving) && styles.disabled]}>
          <Switch
            accessibilityLabel={t('reminders.label', { patient: patient.displayName })}
            accessibilityState={{ busy: saving, disabled: !ready || saving }}
            disabled={!ready || saving}
            onValueChange={(value) => void (value ? enable() : disable())}
            thumbColor={enabled && permission ? colors.white : colors.muted}
            trackColor={{ false: colors.mist, true: colors.success }}
            value={enabled && permission}
          />
        </View>
      </View>
      {query.isFetching ? <Text accessibilityLiveRegion="polite" style={styles.status}>{t('reminders.refreshing')}</Text> : null}
      {query.error || syncError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{syncError || errorMessage(query.error)}</Text> : null}
      {!permission && (enabled || syncError) ? <Pressable accessibilityRole="link" onPress={() => void Linking.openSettings()} style={styles.settings}><Text style={styles.settingsLabel}>{t('reminders.openSettings')}</Text></Pressable> : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  status: { width: '100%', color: colors.successDark, fontSize: 12, fontWeight: '700', marginTop: 4 },
  error: { width: '100%', color: colors.error, fontSize: 12, fontWeight: '700', marginTop: 4 },
  switchTarget: { minWidth: 52, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.5 },
  settings: { width: '100%', minHeight: 48, alignItems: 'flex-start', justifyContent: 'center', marginTop: 4 },
  settingsLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
});
