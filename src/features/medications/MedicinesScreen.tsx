import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/PressableScale';
import { radii, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { SyncNotice } from '../../components/SyncNotice';
import { useAuth } from '../auth/AuthProvider';
import { InvitationInbox } from '../invitations/InvitationInbox';
import { CareHeader } from '../patients/CareHeader';
import { CreatePatientModal } from '../patients/CreatePatientModal';
import { PatientChips } from '../patients/PatientChips';
import { usePatient } from '../patients/PatientProvider';
import { useLocale } from '../settings/LocaleProvider';
import { MedicationSection } from './MedicationSection';

export function MedicinesScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const [isCreatorVisible, setCreatorVisible] = useState(false);
  const { session, signOut } = useAuth();
  const { activePatient, createPatient, dataUpdatedAt, error, isCreating, isLoading, retry } = usePatient();

  if (isLoading) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.stateScreen}>
        <Text style={styles.stateTitle}>{t('today.opening')}</Text>
      </View>
    );
  }

  if (error && !activePatient) {
    return (
      <View style={styles.stateScreen}>
        <Text accessibilityRole="header" style={styles.stateTitle}>{t('today.loadError')}</Text>
        <Text accessibilityLiveRegion="assertive" style={styles.stateBody}>{error}</Text>
        <PressableScale accessibilityRole="button" onPress={retry} style={styles.statePrimaryButton}>
          <View style={styles.buttonContentRow}>
            <AppIcon color={colors.white} name="refresh-cw" size={16} />
            <Text style={styles.statePrimaryLabel}>{t('app.retry')}</Text>
          </View>
        </PressableScale>
        <PressableScale accessibilityRole="button" onPress={() => void signOut()} style={styles.stateSecondaryButton}>
          <View style={styles.buttonContentRow}>
            <AppIcon color={colors.primaryDark} name="log-out" size={16} />
            <Text style={styles.stateSecondaryLabel}>{t('care.signOut')}</Text>
          </View>
        </PressableScale>
      </View>
    );
  }

  if (!activePatient) {
    return (
      <>
        <ScrollView contentContainerStyle={styles.emptyScreen}>
          <View style={styles.emptyColumn}>
            <View style={styles.topBar}>
              <View>
                <Text style={styles.brand}>Alaga</Text>
                <Text style={styles.greeting}>{t('today.hello', { name: session?.displayName ?? '' })}</Text>
              </View>
              <PressableScale accessibilityRole="button" onPress={() => void signOut()} style={styles.exitButton}>
                <View style={styles.buttonContentRow}>
                  <AppIcon color={colors.muted} name="log-out" size={15} />
                  <Text style={styles.exitLabel}>{t('care.signOut')}</Text>
                </View>
              </PressableScale>
            </View>
            <InvitationInbox />
            <View style={styles.emptyCard}>
              <AppIcon color={colors.primary} name="user-round-plus" size={28} />
              <Text style={styles.emptyEyebrow}>{t('today.firstSpace')}</Text>
              <Text accessibilityRole="header" style={styles.emptyTitle}>{t('today.who')}</Text>
              <Text style={styles.emptyBody}>{t('today.emptyBody')}</Text>
              <PressableScale accessibilityRole="button" onPress={() => setCreatorVisible(true)} style={styles.emptyButton}>
                <View style={styles.buttonContentRow}>
                  <AppIcon color={colors.white} name="user-plus" size={18} />
                  <Text style={styles.emptyButtonLabel}>{t('today.addPerson')}</Text>
                </View>
              </PressableScale>
            </View>
          </View>
        </ScrollView>
        <CreatePatientModal isCreating={isCreating} onClose={() => setCreatorVisible(false)} onCreate={createPatient} visible={isCreatorVisible} />
      </>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.contentColumn}>
        <View style={styles.header}>
          <CareHeader accountName={session?.displayName} onOpenSettings={onOpenSettings} />
          <PatientChips />
        </View>
        <SyncNotice error={error} onRetry={retry} updatedAt={dataUpdatedAt} />
        <MedicationSection patient={activePatient} />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flexGrow: 1, paddingBottom: 110, paddingHorizontal: 20, paddingTop: spacing.md, backgroundColor: colors.canvas },
  contentColumn: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.lg },
  header: { gap: spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { ...typography.hero, color: colors.ink },
  greeting: { ...typography.body, marginTop: 2, color: colors.muted },
  buttonContentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  exitButton: { minHeight: 48, justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: spacing.sm },
  exitLabel: { ...typography.bodyEmphasis, color: colors.muted },
  stateScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.canvas },
  stateTitle: { ...typography.title1, maxWidth: 420, color: colors.ink, textAlign: 'center' },
  stateBody: { ...typography.body, maxWidth: 420, color: colors.muted, textAlign: 'center' },
  statePrimaryButton: { minHeight: 52, minWidth: 180, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.primary, paddingHorizontal: spacing.lg },
  statePrimaryLabel: { ...typography.headline, color: colors.white },
  stateSecondaryButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.lg },
  stateSecondaryLabel: { ...typography.bodyEmphasis, color: colors.primaryDark, fontWeight: '700' },
  emptyScreen: { flexGrow: 1, padding: 20, backgroundColor: colors.canvas },
  emptyColumn: { width: '100%', maxWidth: 640, flex: 1, alignSelf: 'center', gap: spacing.xl },
  emptyCard: { flex: 1, justifyContent: 'center', gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingVertical: spacing.lg },
  emptyEyebrow: { ...typography.caption, color: colors.muted },
  emptyTitle: { ...typography.hero, maxWidth: 420, color: colors.ink },
  emptyBody: { ...typography.body, maxWidth: 440, color: colors.muted, fontSize: 16, lineHeight: 24 },
  emptyButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.primary, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  emptyButtonLabel: { ...typography.headline, color: colors.white },
});
