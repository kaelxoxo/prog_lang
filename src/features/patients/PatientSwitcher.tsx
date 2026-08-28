import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import type { Patient } from './types';

type PatientSwitcherProps = {
  activePatientId: string;
  onAddPerson: () => void;
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
  onAddPerson,
  onClose,
  onSelect,
  patients,
  visible,
}: PatientSwitcherProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const [search, setSearch] = useState('');
  const visiblePatients = useMemo(
    () => patients.filter((patient) => patient.displayName.toLowerCase().includes(search.trim().toLowerCase())),
    [patients, search],
  );
  const close = () => {
    setSearch('');
    onClose();
  };
  const addPerson = () => {
    setSearch('');
    onClose();
    onAddPerson();
  };

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible={visible}>
      <SafeAreaView accessibilityViewIsModal edges={['bottom']} style={styles.backdrop}>
        <View style={[styles.sheet, largeText && styles.sheetLarge]}>
          <View style={[styles.headingRow, largeText && styles.headingRowLarge]}>
            <View style={styles.headingCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                {t('people.changeTitle')}
              </Text>
              <Text style={styles.subtitle}>{t('people.changeBody')}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('people.closePicker')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={close}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <Text style={styles.closeLabel}>{t('people.close')}</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityLabel={t('care.addPersonLabel')}
            accessibilityRole="button"
            onPress={addPerson}
            style={({ pressed }) => [styles.addPersonButton, pressed && styles.patientOptionPressed]}
          >
            <AppIcon color={colors.primaryDark} name="user-round-plus" size={19} />
            <Text style={styles.addPersonLabel}>{t('care.addPersonLabel')}</Text>
          </Pressable>

          {patients.length > 4 ? (
            <TextInput
              accessibilityLabel={t('people.find')}
              autoCapitalize="words"
              onChangeText={setSearch}
              placeholder={t('people.find')}
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
                    largeText && styles.patientOptionLarge,
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
                    {largeText ? (
                      <Text style={[styles.selectedMark, isSelected && styles.selectedMarkVisible]}>
                        {t(isSelected ? 'people.selected' : 'people.choose')}
                      </Text>
                    ) : null}
                  </View>
                  {!largeText ? <Text style={[styles.selectedMark, isSelected && styles.selectedMarkVisible]}>
                    {t(isSelected ? 'people.selected' : 'people.choose')}
                  </Text> : null}
                </Pressable>
              );
            })}
            {!visiblePatients.length ? <Text style={styles.noResults}>{t('people.noResults')}</Text> : null}
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
  sheetLarge: {
    maxHeight: '94%',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headingRowLarge: {
    flexDirection: 'column',
    gap: spacing.sm,
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
  addPersonButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  addPersonLabel: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
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
  patientOptionLarge: {
    alignItems: 'flex-start',
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
    minWidth: 0,
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
