import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SyncNotice } from '../../components/SyncNotice';
import { spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { CareCircleSection } from '../invitations/CareCircleSection';
import { InvitationInbox } from '../invitations/InvitationInbox';
import { CareHeader } from '../patients/CareHeader';
import { PatientChips } from '../patients/PatientChips';
import { usePatient } from '../patients/PatientProvider';
import { useLocale } from '../settings/LocaleProvider';
import { RecentActivity } from './RecentActivity';

/** The selected Patient's Care Circle, called "family" on screen. */
export function FamilyScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { session } = useAuth();
  const { activePatient, dataUpdatedAt, error, retry } = usePatient();

  if (!activePatient) return null;

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.contentColumn}>
        <View style={styles.header}>
          <CareHeader accountName={session?.displayName} onOpenSettings={onOpenSettings} />
          <PatientChips />
        </View>
        <SyncNotice error={error} onRetry={retry} updatedAt={dataUpdatedAt} />
        <InvitationInbox />
        <Text accessibilityRole="header" style={styles.title}>
          {activePatient.isSelf ? t('family.titleSelf') : t('family.title', { patient: activePatient.displayName })}
        </Text>
        {/* Keyed by person so "Show earlier" and an open invite form start fresh after a switch. */}
        <RecentActivity key={`activity-${activePatient.id}`} patient={activePatient} />
        <CareCircleSection key={`circle-${activePatient.id}`} patient={activePatient} />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flexGrow: 1, paddingBottom: 110, paddingHorizontal: 20, paddingTop: spacing.md, backgroundColor: colors.canvas },
  contentColumn: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.lg },
  header: { gap: spacing.md },
  title: { ...typography.hero, color: colors.ink },
});
