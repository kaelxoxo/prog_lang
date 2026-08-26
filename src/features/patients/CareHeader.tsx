import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import type { Patient } from './types';

type Props = {
  accountName?: string;
  onAddPerson: () => void;
  onChangePerson: () => void;
  onSignOut: () => void;
  patient: Patient;
};

function initialsFor(displayName: string) {
  return displayName.split(' ').map((part) => part.at(0)).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

export function CareHeader({ accountName, onAddPerson, onChangePerson, onSignOut, patient }: Props) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>Alaga</Text>
          <Text numberOfLines={1} style={styles.greeting}>{accountName}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onSignOut} style={({ pressed }) => [styles.exitButton, pressed && styles.pressed]}>
          <Text style={styles.exitLabel}>Sign out</Text>
        </Pressable>
      </View>
      <View style={styles.patientBar}>
        <Pressable
          accessibilityHint="Opens the people in your care circle"
          accessibilityLabel={`Caring for ${patient.displayName}. Change person.`}
          accessibilityRole="button"
          onPress={onChangePerson}
          style={({ pressed }) => [styles.patientButton, pressed && styles.patientButtonPressed]}
        >
          <View style={styles.avatar}><Text style={styles.avatarLabel}>{initialsFor(patient.displayName)}</Text></View>
          <View style={styles.identityCopy}>
            <Text style={styles.eyebrow}>Caring for</Text>
            <Text style={styles.patientName}>{patient.displayName}</Text>
            <Text style={styles.relationship}>{patient.relationshipLabel}</Text>
          </View>
          <Text style={styles.changeLabel}>Change</Text>
        </Pressable>
        <Pressable accessibilityLabel="Add another person" accessibilityRole="button" onPress={onAddPerson} style={({ pressed }) => [styles.addPersonButton, pressed && styles.pressed]}>
          <Text style={styles.addPersonLabel}>+ Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  header: { gap: spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  greeting: { maxWidth: 220, marginTop: 1, color: colors.muted, fontSize: 13 },
  exitButton: { minHeight: 48, justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: spacing.sm },
  pressed: { backgroundColor: colors.mist },
  exitLabel: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  patientBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: spacing.sm },
  patientButton: { minHeight: 72, minWidth: 220, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 10 },
  patientButtonPressed: { backgroundColor: colors.mist },
  avatar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.sun },
  avatarLabel: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  identityCopy: { flex: 1 },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  patientName: { marginTop: 1, color: colors.ink, fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  relationship: { marginTop: 1, color: colors.muted, fontSize: 13 },
  changeLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  addPersonButton: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.canvas, paddingHorizontal: spacing.sm },
  addPersonLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
});
