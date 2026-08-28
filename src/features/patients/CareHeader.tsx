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
  const changeAction = <View style={styles.changeAction}><Text style={styles.changeLabel}>{t('care.change')}</Text><AppIcon color={colors.primaryDark} name="chevron-down" size={17} /></View>;
  return (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <View style={styles.accountCopy}>
          <Text style={styles.brand}>Alaga</Text>
          <Text numberOfLines={fontScale > 1.3 ? 2 : 1} style={styles.greeting}>{accountName}</Text>
        </View>
        {onOpenSettings ? (
          <Pressable accessibilityLabel={t('care.settings')} accessibilityRole="button" onPress={onOpenSettings} style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}>
            <AppIcon color={colors.ink} name="settings" size={22} />
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
          <View style={styles.avatar}><Text style={styles.avatarLabel}>{initialsFor(patient.displayName)}</Text></View>
          <View style={styles.identityCopy}>
            <Text style={styles.eyebrow}>{t('care.caringFor')}</Text>
            <Text style={styles.patientName}>{patient.displayName}</Text>
            <Text style={styles.relationship}>{patient.relationshipLabel}</Text>
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
  accountCopy: { minWidth: 0, flex: 1 },
  brand: { color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  greeting: { maxWidth: 320, marginTop: 1, color: colors.muted, fontSize: 13 },
  settingsButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  pressed: { backgroundColor: colors.mist },
  patientBar: { width: '100%' },
  patientButton: { minHeight: 72, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 10 },
  patientButtonPressed: { backgroundColor: colors.mist },
  avatar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.sun },
  avatarLabel: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  identityCopy: { minWidth: 0, flex: 1 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  patientName: { marginTop: 1, color: colors.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  relationship: { marginTop: 1, color: colors.muted, fontSize: 13 },
  changeAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  changeLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
});
