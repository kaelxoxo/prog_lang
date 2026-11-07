import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { usePatient } from './PatientProvider';
import { usePatientDisplay } from './usePatientDisplay';
import { useLocale } from '../settings/LocaleProvider';
import type { Patient } from './types';

type Props = {
  accountName?: string;
  onChangePerson: () => void;
  onOpenSettings?: () => void;
  patient: Patient;
  showPatientBar?: boolean;
};

function initialsFor(displayName?: string) {
  if (!displayName || !displayName.trim()) return 'P';
  const initials = displayName.trim().split(/\s+/).map((part) => part.at(0)).filter(Boolean).join('').slice(0, 2).toUpperCase();
  return initials || 'P';
}

export function CareHeader({ accountName, onChangePerson, onOpenSettings, patient, showPatientBar = true }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { fontScale } = useWindowDimensions();
  const { name, showSelector, isProfessional } = usePatientDisplay(patient);
  const changeAction = (
    <View style={styles.changeAction}>
      <Text style={styles.changeLabel}>{t('care.change')}</Text>
      <AppIcon color={colors.primaryDark} name="chevron-down" size={16} />
    </View>
  );

  return (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <View style={styles.accountCopy}>
          <View style={styles.brandLockup}>
            <View style={styles.brandDot} />
            <Text style={styles.brand}>Alaga</Text>
          </View>
          {accountName ? (
            <Text numberOfLines={fontScale > 1.3 ? 2 : 1} style={styles.greeting}>
              {accountName}
            </Text>
          ) : null}
        </View>
        <View style={styles.topActions}>
          {showSelector ? <Pressable
            accessibilityHint={t('care.patientHint')}
            accessibilityLabel={t('care.patientLabel', { patient: name })}
            accessibilityRole="button"
            onPress={onChangePerson}
            style={({ pressed }) => [styles.avatarButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.avatarMiniLabel}>{initialsFor(name)}</Text>
          </Pressable> : null}
          {onOpenSettings ? (
            <Pressable
              accessibilityLabel={t('care.settings')}
              accessibilityRole="button"
              onPress={onOpenSettings}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.actionButtonPressed]}
            >
              <AppIcon color={colors.ink} name="settings" size={20} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {showPatientBar && showSelector ? (
        <View style={styles.patientBar}>
          <Pressable
            accessibilityHint={t('care.patientHint')}
            accessibilityLabel={t('care.patientLabel', { patient: name })}
            accessibilityRole="button"
            onPress={onChangePerson}
            style={({ pressed }) => [styles.patientButton, pressed && styles.patientButtonPressed]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarLabel}>{initialsFor(name)}</Text>
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.eyebrow}>{isProfessional ? t('shell.peopleYouCareFor') : t('care.caringFor')}</Text>
              <Text numberOfLines={fontScale > 1.3 ? 3 : 2} style={styles.patientName}>{name}</Text>
              <Text numberOfLines={1} style={styles.relationship}>{patient.relationshipLabel}</Text>
              {fontScale > 1.3 ? changeAction : null}
            </View>
            {fontScale <= 1.3 ? changeAction : null}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  header: { gap: spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountCopy: { minWidth: 0, flex: 1, gap: 2 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  brand: { ...typography.title1, color: colors.ink },
  greeting: { ...typography.caption, maxWidth: 320, color: colors.muted },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.canvasSubtle,
  },
  avatarMiniLabel: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  settingsButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  actionButtonPressed: { opacity: 0.72, backgroundColor: colors.canvasSubtle },
  patientBar: { width: '100%' },
  patientButton: {
    minHeight: 76,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  patientButtonPressed: { backgroundColor: colors.canvasSubtle },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.canvasSubtle,
  },
  avatarLabel: { ...typography.headline, color: colors.ink },
  identityCopy: { minWidth: 0, flex: 1, gap: 2 },
  eyebrow: { ...typography.caption, color: colors.muted },
  patientName: { ...sectionTitle, color: colors.ink },
  relationship: { ...typography.caption, color: colors.muted },
  changeAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
  },
  changeLabel: { ...typography.caption, color: colors.primaryDark, fontWeight: '700' },
});

