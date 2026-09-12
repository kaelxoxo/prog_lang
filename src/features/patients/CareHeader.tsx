import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import type { Patient } from './types';

type Props = {
  accountName?: string;
  onChangePerson: () => void;
  onOpenSettings?: () => void;
  patient: Patient;
};

function initialsFor(displayName: string) {
  return displayName.split(' ').map((part) => part.at(0)).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

export function CareHeader({ accountName, onChangePerson, onOpenSettings, patient }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { fontScale } = useWindowDimensions();
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
        {onOpenSettings ? (
          <Pressable
            accessibilityLabel={t('care.settings')}
            accessibilityRole="button"
            onPress={onOpenSettings}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
          >
            <AppIcon color={colors.ink} name="settings" size={20} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.patientBar}>
        <Pressable
          accessibilityHint={t('care.patientHint')}
          accessibilityLabel={t('care.patientLabel', { patient: patient.displayName })}
          accessibilityRole="button"
          onPress={onChangePerson}
          style={({ pressed }) => [styles.patientButton, pressed && styles.patientButtonPressed]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>{initialsFor(patient.displayName)}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.eyebrow}>{t('care.caringFor')}</Text>
            <Text numberOfLines={fontScale > 1.3 ? 3 : 2} style={styles.patientName}>{patient.displayName}</Text>
            <View style={styles.relationshipPill}>
              <Text numberOfLines={1} style={styles.relationship}>{patient.relationshipLabel}</Text>
            </View>
            {fontScale > 1.3 ? changeAction : null}
          </View>
          {fontScale <= 1.3 ? changeAction : null}
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  header: { gap: spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountCopy: { minWidth: 0, flex: 1, gap: 2 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sun },
  brand: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.7 },
  greeting: { maxWidth: 320, color: colors.muted, fontSize: 13, fontWeight: '600' },
  settingsButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  settingsButtonPressed: { backgroundColor: colors.mist },
  patientBar: { width: '100%' },
  patientButton: {
    minHeight: 76,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  patientButtonPressed: { opacity: 0.85, backgroundColor: colors.mist },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: colors.sun,
  },
  avatarLabel: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  identityCopy: { minWidth: 0, flex: 1, gap: 2 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  patientName: { color: colors.ink, fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  relationshipPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    backgroundColor: colors.mist,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
  },
  relationship: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  changeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  changeLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
});

