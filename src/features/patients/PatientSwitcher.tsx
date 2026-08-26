import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import type { Patient } from './types';

type PatientSwitcherProps = {
  activePatientId: string;
  onClose: () => void;
  onSelect: (patientId: string) => void;
  patients: readonly Patient[];
  visible: boolean;
};

function initialsFor(displayName: string) {
  return displayName
    .split(' ')
    .map((part) => part.at(0))
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function PatientSwitcher({
  activePatientId,
  onClose,
  onSelect,
  patients,
  visible,
}: PatientSwitcherProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [search, setSearch] = useState('');
  const visiblePatients = useMemo(
    () => patients.filter((patient) => patient.displayName.toLowerCase().includes(search.trim().toLowerCase())),
    [patients, search],
  );
  const close = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible={visible}>
      <SafeAreaView accessibilityViewIsModal edges={['bottom']} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                Change person
              </Text>
              <Text style={styles.subtitle}>Choose whose care details you want to see.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close patient picker"
              accessibilityRole="button"
              hitSlop={8}
              onPress={close}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <Text style={styles.closeLabel}>Close</Text>
            </Pressable>
          </View>

          {patients.length > 4 ? (
            <TextInput
              accessibilityLabel="Find a person"
              autoCapitalize="words"
              onChangeText={setSearch}
              placeholder="Find a person"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              value={search}
            />
          ) : null}

          <ScrollView contentContainerStyle={styles.patientList}>
            {visiblePatients.map((patient) => {
              const isSelected = patient.id === activePatientId;

              return (
                <Pressable
                  accessibilityLabel={`${patient.displayName}, ${patient.relationshipLabel}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  key={patient.id}
                  onPress={() => {
                    onSelect(patient.id);
                    close();
                  }}
                  style={({ pressed }) => [
                    styles.patientOption,
                    isSelected && styles.patientOptionSelected,
                    pressed && styles.patientOptionPressed,
                  ]}
                >
                  <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
                    <Text style={[styles.avatarLabel, isSelected && styles.avatarLabelSelected]}>
                      {initialsFor(patient.displayName)}
                    </Text>
                  </View>
                  <View style={styles.patientCopy}>
                    <Text style={styles.patientName}>{patient.displayName}</Text>
                    <Text style={styles.relationship}>{patient.relationshipLabel}</Text>
                  </View>
                  <Text style={[styles.selectedMark, isSelected && styles.selectedMarkVisible]}>
                    {isSelected ? 'Selected' : 'Choose'}
                  </Text>
                </Pressable>
              );
            })}
            {!visiblePatients.length ? <Text style={styles.noResults}>No one in your care circle matches that name.</Text> : null}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.canvas,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headingCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  closeButton: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
  },
  closeButtonPressed: {
    backgroundColor: colors.mist,
  },
  closeLabel: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '700',
  },
  searchInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 16,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  patientList: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  patientOption: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  patientOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  patientOptionPressed: {
    opacity: 0.78,
  },
  avatar: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: colors.mist,
  },
  avatarSelected: {
    backgroundColor: colors.primary,
  },
  avatarLabel: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  avatarLabelSelected: {
    color: colors.white,
  },
  patientCopy: {
    flex: 1,
    gap: 3,
  },
  patientName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  relationship: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  selectedMark: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  selectedMarkVisible: {
    color: colors.primaryDark,
  },
  noResults: { color: colors.muted, fontSize: 15, lineHeight: 22, paddingVertical: spacing.xl, textAlign: 'center' },
});
