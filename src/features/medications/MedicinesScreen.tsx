import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { SyncNotice } from '../../components/SyncNotice';
import { useAuth } from '../auth/AuthProvider';
import { CareHeader } from '../patients/CareHeader';
import { CreatePatientModal } from '../patients/CreatePatientModal';
import { PatientSwitcher } from '../patients/PatientSwitcher';
import { usePatient } from '../patients/PatientProvider';
import { MedicationSection } from './MedicationSection';

export function MedicinesScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { styles } = useThemedStyles(createStyles);
  const [isSwitcherVisible, setSwitcherVisible] = useState(false);
  const [isCreatorVisible, setCreatorVisible] = useState(false);
  const { session } = useAuth();
  const { activePatient, createPatient, dataUpdatedAt, error, isCreating, patients, retry, selectPatient } = usePatient();

  if (!activePatient) return null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.contentColumn}>
          <CareHeader
            accountName={session?.displayName}
            onChangePerson={() => setSwitcherVisible(true)}
            onOpenSettings={onOpenSettings}
            patient={activePatient}
          />
          <SyncNotice error={error} onRetry={retry} updatedAt={dataUpdatedAt} />
          <MedicationSection patient={activePatient} />
        </View>
      </ScrollView>
      <PatientSwitcher activePatientId={activePatient.id} onAddPerson={() => setCreatorVisible(true)} onClose={() => setSwitcherVisible(false)} onSelect={selectPatient} patients={patients} visible={isSwitcherVisible} />
      <CreatePatientModal isCreating={isCreating} onClose={() => setCreatorVisible(false)} onCreate={createPatient} visible={isCreatorVisible} />
    </>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flexGrow: 1, paddingBottom: spacing.xl, paddingHorizontal: 20, paddingTop: spacing.md, backgroundColor: colors.canvas },
  contentColumn: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.lg },
});
