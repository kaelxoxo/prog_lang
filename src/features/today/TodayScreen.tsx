import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressableScale } from '../../components/PressableScale';
import { radii, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { reflow } from '../../lib/motion';
import { SyncNotice } from '../../components/SyncNotice';
import { useAuth } from '../auth/AuthProvider';
import { HistoryPanel } from '../history/HistoryPanel';
import { InvitationInbox } from '../invitations/InvitationInbox';
import { CareHeader } from '../patients/CareHeader';
import { CreatePatientModal } from '../patients/CreatePatientModal';
import { PatientChips } from '../patients/PatientChips';
import { usePatient } from '../patients/PatientProvider';
import { ReminderControl } from '../reminders/ReminderControl';
import { useLocale } from '../settings/LocaleProvider';
import { DoseTimeline } from './DoseTimeline';

type Props = { focusedOccurrenceId?: string | null; onOpenMedicines: () => void; onOpenSettings: () => void };

export function TodayScreen({ focusedOccurrenceId, onOpenMedicines, onOpenSettings }: Props) {
  const { styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const [isCreatorVisible, setCreatorVisible] = useState(false);
  const [view, setView] = useState<'today' | 'history'>('today');
  const { session, signOut } = useAuth();
  const { activePatient, createPatient, dataUpdatedAt, error, isCreating, isLoading, retry } = usePatient();
  const now = useCurrentTime();
  const scrollRef = useRef<ScrollView>(null);
  const timelineOffset = useRef(0);
  const formattedDate = useMemo(
    () => new Intl.DateTimeFormat(localeTag, {
      timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric',
    }).format(now),
    [localeTag, now],
  );

  useEffect(() => {
    setView('today');
  }, [activePatient?.id, focusedOccurrenceId]);

  if (isLoading) {
    return <View accessibilityLiveRegion="polite" style={styles.stateScreen}><Text style={styles.stateTitle}>{t('today.opening')}</Text></View>;
  }

  if (error && !activePatient) {
    return (
      <View style={styles.stateScreen}>
        <Text accessibilityRole="header" style={styles.stateTitle}>{t('today.loadError')}</Text>
        <Text accessibilityLiveRegion="assertive" style={styles.stateBody}>{error}</Text>
        <PressableScale accessibilityRole="button" onPress={retry} style={styles.statePrimaryButton}>
          <Text style={styles.statePrimaryLabel}>{t('app.retry')}</Text>
        </PressableScale>
        <PressableScale accessibilityRole="button" onPress={() => void signOut()} style={styles.stateSecondaryButton}>
          <Text style={styles.stateSecondaryLabel}>{t('care.signOut')}</Text>
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
                <Text style={styles.exitLabel}>{t('care.signOut')}</Text>
              </PressableScale>
            </View>
            <InvitationInbox />
            <View style={styles.emptySection}>
              <Text accessibilityRole="header" style={styles.emptyTitle}>{t('today.who')}</Text>
              <Text style={styles.emptyBody}>{t('today.emptyBody')}</Text>
              <PressableScale accessibilityRole="button" onPress={() => setCreatorVisible(true)} style={styles.emptyButton}>
                <Text style={styles.emptyButtonLabel}>{t('today.addPerson')}</Text>
              </PressableScale>
            </View>
          </View>
        </ScrollView>
        <CreatePatientModal isCreating={isCreating} onClose={() => setCreatorVisible(false)} onCreate={createPatient} visible={isCreatorVisible} />
      </>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      ref={scrollRef}
    >
      <View style={styles.contentColumn}>
        <View style={styles.header}>
          <CareHeader accountName={session?.displayName} onOpenSettings={onOpenSettings} />
          <PatientChips />
        </View>
        <SyncNotice error={error} onRetry={retry} updatedAt={dataUpdatedAt} />

        <View accessibilityRole="tablist" style={styles.viewSwitch}>
          {(['today', 'history'] as const).map((option) => {
            const isSelected = view === option;
            const label = t(option === 'today' ? 'today.title' : 'today.history');
            return (
              <PressableScale
                accessibilityLabel={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                key={option}
                onPress={() => setView(option)}
                style={[styles.viewOption, isSelected && styles.viewOptionSelected]}
              >
                <Text style={[styles.viewOptionLabel, isSelected && styles.viewOptionLabelSelected]}>{label}</Text>
              </PressableScale>
            );
          })}
        </View>

        {view === 'today' ? (
          <>
            <Text accessibilityRole="header" style={styles.date}>{formattedDate}</Text>
            <View onLayout={(event) => { timelineOffset.current = event.nativeEvent.layout.y; }}>
              <DoseTimeline
                focusedOccurrenceId={focusedOccurrenceId}
                onFocusLayout={(offset) => scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, timelineOffset.current + offset - spacing.md) })}
                onOpenMedicines={onOpenMedicines}
                patient={activePatient}
              />
            </View>
            {/* Glides with the Disclosures above it instead of jumping when one opens or closes. */}
            <Animated.View layout={reflow}>
              <ReminderControl patient={activePatient} />
            </Animated.View>
          </>
        ) : <HistoryPanel patient={activePatient} />}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flexGrow: 1, paddingBottom: 110, paddingHorizontal: 20, paddingTop: spacing.md, backgroundColor: colors.canvas },
  contentColumn: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.lg },
  header: { gap: spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { ...typography.title1, color: colors.ink },
  greeting: { ...typography.body, color: colors.muted },
  exitButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  exitLabel: { ...typography.bodyEmphasis, color: colors.muted },
  date: { ...typography.title1, color: colors.ink },

  viewSwitch: { flexDirection: 'row', gap: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  viewOption: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  viewOptionSelected: { borderBottomColor: colors.primary },
  viewOptionLabel: { ...typography.headline, color: colors.muted },
  viewOptionLabelSelected: { color: colors.ink },

  stateScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.canvas },
  stateTitle: { ...typography.title1, maxWidth: 420, color: colors.ink, textAlign: 'center' },
  stateBody: { ...typography.body, maxWidth: 420, color: colors.muted, textAlign: 'center' },
  statePrimaryButton: { minHeight: 48, minWidth: 180, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: colors.primary, paddingHorizontal: spacing.lg },
  statePrimaryLabel: { ...typography.headline, color: colors.white },
  stateSecondaryButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.lg },
  stateSecondaryLabel: { ...typography.headline, color: colors.ink },
  emptyScreen: { flexGrow: 1, padding: 20, backgroundColor: colors.canvas },
  emptyColumn: { width: '100%', maxWidth: 640, flex: 1, alignSelf: 'center', gap: spacing.xl },
  emptySection: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.xl },
  emptyTitle: { ...typography.hero, maxWidth: 420, color: colors.ink },
  emptyBody: { ...typography.body, maxWidth: 440, color: colors.muted },
  emptyButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: colors.primary, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  emptyButtonLabel: { ...typography.headline, color: colors.white },
});
