import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { errorMessage } from '../../lib/api';
import { sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { usePatient } from '../patients/PatientProvider';
import type { Patient } from '../patients/types';
import { useLocale } from '../settings/LocaleProvider';
import { useReminderSwitch } from './useReminders';

/** Settings section: one private-reminder switch per person on this device. Native only. */
export function ReminderSettings() {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { patients } = usePatient();
  if (Platform.OS === 'web' || patients.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionCopy}>
        <View style={styles.sectionHeading}>
          <AppIcon color={colors.inkLine} name="bell" size={20} />
          <Text accessibilityRole="header" style={styles.sectionTitle}>{t('reminders.title')}</Text>
        </View>
        <Text style={styles.body}>{t('reminders.settingsBody')}</Text>
      </View>
      {patients.map((patient) => <ReminderRow key={patient.id} patient={patient} />)}
    </View>
  );
}

function ReminderRow({ patient }: { patient: Patient }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const reminders = useReminderSwitch(patient);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = patient.isSelf ? t('shell.you') : patient.displayName;

  const toggle = async (value: boolean) => {
    setSaving(true);
    setError(null);
    try {
      if (value && !(await reminders.enable())) setError(t('reminders.blocked'));
      if (!value) await reminders.disable();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const shownError = error ?? (reminders.error ? errorMessage(reminders.error) : null);
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <View style={styles.copy}>
          <Text numberOfLines={2} style={styles.name}>{name}</Text>
          <Text style={styles.status}>{t(reminders.on ? 'reminders.onBody' : 'reminders.offBody')}</Text>
        </View>
        <View style={[styles.switchTarget, (!reminders.ready || saving) && styles.disabled]}>
          <Switch
            accessibilityLabel={t('reminders.label', { patient: name })}
            accessibilityState={{ busy: saving, disabled: !reminders.ready || saving }}
            disabled={!reminders.ready || saving}
            onValueChange={(value) => void toggle(value)}
            thumbColor={reminders.on ? colors.white : colors.muted}
            trackColor={{ false: colors.controlBorder, true: colors.primary }}
            value={reminders.on}
          />
        </View>
      </View>
      {shownError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{shownError}</Text> : null}
      {reminders.blocked || error === t('reminders.blocked') ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openSettings()} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <Text style={styles.linkLabel}>{t('reminders.openSettings')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg },
  sectionCopy: { gap: spacing.xs },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...sectionTitle, color: colors.ink },
  body: { ...typography.body, maxWidth: 620, color: colors.muted },
  row: { gap: spacing.xs },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  name: { ...typography.headline, color: colors.ink },
  status: { ...typography.caption, color: colors.muted },
  error: { ...typography.caption, color: colors.error },
  switchTarget: { minWidth: 52, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  link: { minHeight: 48, alignItems: 'flex-start', justifyContent: 'center' },
  linkLabel: { ...typography.bodyEmphasis, color: colors.primaryDark, fontWeight: '700' },
  pressed: { opacity: 0.76 },
});
