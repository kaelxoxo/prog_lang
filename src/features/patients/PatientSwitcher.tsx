import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../components/AppIcon';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
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
    () => patients.filter((patient) => (patient.isSelf ? `${t('shell.you')} ${patient.displayName}` : patient.displayName).toLowerCase().includes(search.trim().toLowerCase())),
    [patients, search, t],
  );
  const close = () => {
    setSearch('');
    onClose();
  };
  // The Self Profile is always yours to manage, so only other people get a care-manager line.
  const managerLine = (patient: Patient) => {
    if (patient.isSelf) return null;
    if (patient.role === 'owner') return t('people.youManage');
    return patient.primaryCareManagerName ? t('people.managedBy', { name: patient.primaryCareManagerName }) : null;
  };
  const addPerson = () => {
    setSearch('');
    onClose();
    onAddPerson();
  };

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible={visible}>
      <SafeAreaView accessibilityViewIsModal edges={['bottom']} style={styles.backdrop}>
        <Pressable
          accessibilityLabel={t('people.closePicker')}
          accessibilityRole="button"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <View style={[styles.sheet, largeText && styles.sheetLarge]}>
            <View style={styles.sheetHandle} />
            <View style={[styles.headingRow, largeText && styles.headingRowLarge]}>
              <View style={styles.headingCopy}>
                <Text accessibilityRole="header" style={styles.title}>{t('people.changeTitle')}</Text>
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
              <AppIcon color={colors.primaryDark} name="user-round-plus" size={18} />
              <Text style={styles.addPersonLabel}>{t('care.addPersonLabel')}</Text>
            </Pressable>

            {patients.length > 4 ? (
              <View style={styles.searchContainer}>
                <AppIcon color={colors.muted} name="search" size={18} />
                <TextInput
                  accessibilityLabel={t('people.find')}
                  autoCapitalize="words"
                  onChangeText={setSearch}
                  placeholder={t('people.find')}
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  value={search}
                />
                {search ? (
                  <Pressable accessibilityLabel={t('app.clearSearch')} accessibilityRole="button" hitSlop={12} onPress={() => setSearch('')} style={styles.clearSearchButton}>
                    <AppIcon color={colors.muted} name="x" size={16} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <ScrollView contentContainerStyle={styles.patientList} keyboardShouldPersistTaps="handled">
              {visiblePatients.map((patient) => {
                const isSelected = patient.id === activePatientId;
                const name = patient.isSelf ? t('shell.you') : patient.displayName;
                const manager = managerLine(patient);

                return (
                  <Pressable
                    accessibilityLabel={[name, patient.relationshipLabel, manager].filter(Boolean).join(', ')}
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
                      <Text style={styles.patientName}>{name}</Text>
                      <Text style={styles.relationshipText}>{patient.relationshipLabel}</Text>
                      {manager ? <Text style={styles.relationshipText}>{manager}</Text> : null}
                    </View>
                    <View style={styles.selectBadge}>
                      <Text style={[styles.selectedMark, isSelected && styles.selectedMarkVisible]}>
                        {t(isSelected ? 'people.selected' : 'people.choose')}
                      </Text>
                      {isSelected ? <AppIcon color={colors.primaryDark} name="check" size={14} /> : null}
                    </View>
                  </Pressable>
                );
              })}
              {!visiblePatients.length ? <Text style={styles.noResults}>{t('people.noResults')}</Text> : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  keyboardView: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.surfaceElevated,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: radii.full,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetLarge: {
    maxHeight: '94%',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
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
    ...sectionTitle,
    color: colors.ink,
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
  },
  closeButton: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    paddingHorizontal: spacing.md,
  },
  closeButtonPressed: {
    backgroundColor: colors.canvasSubtle,
  },
  closeLabel: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
  searchContainer: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    color: colors.ink,
    fontSize: 15,
  },
  clearSearchButton: { padding: 4 },
  addPersonButton: {
    minHeight: 48,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  addPersonLabel: { ...typography.bodyEmphasis, color: colors.primaryDark, fontWeight: '700' },
  patientList: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  patientOption: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  patientOptionLarge: {
    alignItems: 'flex-start',
  },
  patientOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.canvasSubtle,
  },
  patientOptionPressed: {
    opacity: 0.78,
  },
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
  avatarSelected: {
    borderColor: colors.primary,
  },
  avatarLabel: {
    ...typography.headline,
    color: colors.ink,
  },
  avatarLabelSelected: {
    color: colors.primaryDark,
  },
  patientCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  patientName: {
    ...typography.headline,
    color: colors.ink,
  },
  relationshipText: {
    ...typography.caption,
    color: colors.muted,
  },
  selectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectedMark: {
    ...typography.caption,
    color: colors.muted,
  },
  selectedMarkVisible: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  noResults: { ...typography.body, color: colors.muted, paddingVertical: spacing.xl, textAlign: 'center' },
});
