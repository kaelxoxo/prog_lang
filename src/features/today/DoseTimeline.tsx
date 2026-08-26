import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  type AlertButton,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiRequest, errorMessage } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { SyncNotice } from '../../components/SyncNotice';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { manilaDate, type DoseOccurrence, type TimelineResponse } from './types';

type Props = {
  focusedOccurrenceId?: string | null;
  onFocusLayout?: (offset: number) => void;
  onOpenMedicines: () => void;
  patient: Patient;
};
type DoseActionInput = {
  occurrence: DoseOccurrence;
  kind: 'taken' | 'skipped' | 'snoozed';
  snoozeMinutes?: 15 | 30 | 60;
  reason?: string;
  correctsEventId?: string;
};
type DoseAction = DoseActionInput & { clientActionId: string };

function actionId() {
  const random = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Number.parseInt(random(), 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function friendlyTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(value));
}

function doseLine(dose: DoseOccurrence) {
  const strength = dose.strengthValue && dose.strengthUnit ? ` · ${dose.strengthValue} ${dose.strengthUnit}` : '';
  return `${dose.doseQuantity} ${dose.doseUnit}${strength}`;
}

function statusCopy(dose: DoseOccurrence) {
  const correction = dose.reason ? ` · Correction: ${dose.reason}` : '';
  if (dose.status === 'taken') return `Taken${dose.recordedByName ? ` by ${dose.recordedByName}` : ''}${dose.recordedAt ? ` at ${friendlyTime(dose.recordedAt)}` : ''}${correction}`;
  if (dose.status === 'skipped') return `Skipped${dose.recordedByName ? ` by ${dose.recordedByName}` : ''}${dose.recordedAt ? ` at ${friendlyTime(dose.recordedAt)}` : ''}${correction}`;
  if (dose.status === 'snoozed' && dose.snoozedUntil) return `Snoozed until ${friendlyTime(dose.snoozedUntil)}`;
  return 'Not recorded';
}

export function DoseTimeline({ focusedOccurrenceId, onFocusLayout, onOpenMedicines, patient }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const date = manilaDate(useCurrentTime());
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<DoseOccurrence | null>(null);
  const [correctionKind, setCorrectionKind] = useState<'taken' | 'skipped'>('taken');
  const [correctionReason, setCorrectionReason] = useState('');
  const focusedRef = useRef<Text>(null);
  const listOffset = useRef(0);
  const queryKey = ['today', patient.id, date] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => apiRequest<TimelineResponse>(`/patients/${patient.id}/today?date=${date}`, { token }),
  });
  const mutation = useMutation({
    mutationFn: (mutationAction: DoseAction) => apiRequest(
      `/patients/${patient.id}/doses/${mutationAction.occurrence.id}/events`,
      { method: 'POST', token, body: { kind: mutationAction.kind, snoozeMinutes: mutationAction.snoozeMinutes, reason: mutationAction.reason, correctsEventId: mutationAction.correctsEventId, clientActionId: mutationAction.clientActionId } },
    ),
    onSuccess: (_result, action) => {
      setNotice(action.correctsEventId
        ? `${action.occurrence.medicationName} was corrected to ${action.kind} for ${patient.displayName}.`
        : action.kind === 'snoozed'
        ? `${action.occurrence.medicationName} reminder moved by ${action.snoozeMinutes} minutes.`
        : `${action.occurrence.medicationName} recorded as ${action.kind} for ${patient.displayName}.`);
      setCorrecting(null);
      setCorrectionReason('');
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['reminders', patient.id] });
    },
  });

  useEffect(() => {
    if (!focusedOccurrenceId || !query.data?.timeline.some((dose) => dose.id === focusedOccurrenceId)) return;
    const node = findNodeHandle(focusedRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [focusedOccurrenceId, query.data]);

  const record = (action: DoseActionInput) => {
    const mutationAction = { ...action, clientActionId: actionId() };
    if (action.kind === 'snoozed' || action.correctsEventId) {
      mutation.mutate(mutationAction);
      return;
    }
    const label = action.kind === 'taken' ? 'taken' : 'skipped';
    Alert.alert(
      `Record ${action.occurrence.medicationName} as ${label}?`,
      `${doseLine(action.occurrence)}, scheduled ${friendlyTime(action.occurrence.scheduledFor)}, for ${patient.displayName}. This adds an attributed care-history entry.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: `Record ${label}`, onPress: () => mutation.mutate(mutationAction) }],
    );
  };

  const snooze = (occurrence: DoseOccurrence) => Alert.alert(
    `Snooze ${occurrence.medicationName} for ${patient.displayName}`,
    `This dose was scheduled for ${friendlyTime(occurrence.scheduledFor)}. When should the private reminder return?`,
    ([15, 30, 60].map((minutes) => ({
      text: `${minutes} minutes`,
      onPress: () => record({ occurrence, kind: 'snoozed', snoozeMinutes: minutes as 15 | 30 | 60 }),
    })) as AlertButton[]).concat([{ text: 'Cancel', style: 'cancel' }]),
  );

  const openCorrection = (occurrence: DoseOccurrence) => {
    setCorrecting(occurrence);
    setCorrectionKind(occurrence.status === 'taken' ? 'skipped' : 'taken');
    setCorrectionReason('');
  };

  const saveCorrection = () => {
    if (!correcting?.eventId || !correctionReason.trim()) return;
    record({
      occurrence: correcting,
      kind: correctionKind,
      reason: correctionReason.trim(),
      correctsEventId: correcting.eventId,
    });
  };

  if (query.isLoading && !query.data) {
    return <View accessibilityLabel="Loading today's medicines" style={styles.stack}>{[0, 1, 2].map((item) => <View key={item} style={styles.skeleton} />)}</View>;
  }
  if (query.error && !query.data) {
    return <View style={styles.messageCard}><Text style={styles.messageTitle}>Today’s schedule could not load.</Text><Text style={styles.messageBody}>{errorMessage(query.error)}</Text><Pressable accessibilityRole="button" onPress={() => void query.refetch()} style={styles.retry}><Text style={styles.retryLabel}>Try again</Text></Pressable></View>;
  }
  if (!query.data?.timeline.length) {
    return <View style={styles.messageCard}><Text style={styles.messageTitle}>No doses are scheduled today.</Text><Text style={styles.messageBody}>Add a confirmed medicine and schedule to start today’s care log.</Text><Pressable accessibilityRole="button" onPress={onOpenMedicines} style={styles.retry}><Text style={styles.retryLabel}>Open Medicines</Text></Pressable></View>;
  }

  return (
    <View style={styles.stack}>
      <SyncNotice error={query.error} onRetry={() => void query.refetch()} updatedAt={query.dataUpdatedAt} />
      {notice ? <View accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      <View onLayout={(event) => { listOffset.current = event.nativeEvent.layout.y; }} style={styles.list}>
      {query.data.timeline.map((dose, index) => {
        const terminal = dose.status === 'taken' || dose.status === 'skipped';
        const busy = mutation.isPending && mutation.variables?.occurrence.id === dose.id;
        return (
          <View
            key={dose.id}
            onLayout={focusedOccurrenceId === dose.id ? (event) => onFocusLayout?.(listOffset.current + event.nativeEvent.layout.y) : undefined}
            style={[styles.doseCard, focusedOccurrenceId === dose.id && styles.doseCardFocused, index < query.data.timeline.length - 1 && styles.doseCardBorder]}
          >
            <View style={styles.doseTop}>
              <View style={styles.timeBlock}><Text style={styles.time}>{friendlyTime(dose.scheduledFor)}</Text><View style={[styles.timelineDot, terminal && styles.timelineDotDone]} /></View>
              <View style={styles.doseCopy}>
                <Text accessibilityLabel={`${dose.medicationName}, ${doseLine(dose)}, ${statusCopy(dose)}`} ref={focusedOccurrenceId === dose.id ? focusedRef : undefined} style={styles.medicine}>{dose.medicationName}</Text>
                <Text style={styles.details}>{doseLine(dose)}</Text>
                <Text style={[styles.status, terminal && styles.statusDone]}>{statusCopy(dose)}</Text>
              </View>
            </View>
            {!terminal ? (
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => record({ occurrence: dose, kind: 'taken' })} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.primaryLabel}>{busy ? 'Saving…' : 'Taken'}</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => record({ occurrence: dose, kind: 'skipped' })} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.secondaryLabel}>Skip</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => snooze(dose)} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.secondaryLabel}>Snooze</Text></Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => openCorrection(dose)} style={({ pressed }) => [styles.correctAction, pressed && styles.pressed]}>
                <Text style={styles.correctLabel}>Correct record</Text>
              </Pressable>
            )}
            {mutation.error && mutation.variables?.occurrence.id === dose.id ? (
              <View style={styles.actionError}>
                <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage(mutation.error)}</Text>
                <Pressable accessibilityRole="button" onPress={() => mutation.mutate(mutation.variables!)} style={({ pressed }) => [styles.retryInline, pressed && styles.pressed]}>
                  <Text style={styles.retryInlineLabel}>Try again</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
      </View>
      <Modal animationType="fade" onRequestClose={() => setCorrecting(null)} transparent visible={Boolean(correcting)}>
        <SafeAreaView style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}>
            <View accessibilityViewIsModal style={styles.correctionSheet}>
              <Text accessibilityRole="header" style={styles.correctionTitle}>Correct this care record</Text>
              <Text style={styles.correctionBody}>
                {correcting ? `${correcting.medicationName}, ${doseLine(correcting)}, for ${patient.displayName}. The earlier entry stays in history.` : ''}
              </Text>
              <View accessibilityRole="radiogroup" style={styles.correctionChoices}>
                {(['taken', 'skipped'] as const).map((kind) => (
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: correctionKind === kind }} key={kind} onPress={() => setCorrectionKind(kind)} style={({ pressed }) => [styles.correctionChoice, correctionKind === kind && styles.correctionChoiceSelected, pressed && styles.pressed]}>
                    <Text style={[styles.correctionChoiceLabel, correctionKind === kind && styles.correctionChoiceLabelSelected]}>{kind === 'taken' ? 'Taken' : 'Skipped'}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.correctionLabel}>Reason for correction</Text>
              <TextInput
                accessibilityLabel="Reason for correction"
                autoFocus
                maxLength={240}
                multiline
                onChangeText={setCorrectionReason}
                placeholder="For example, the original entry was for the wrong dose"
                placeholderTextColor={colors.muted}
                style={styles.correctionInput}
                value={correctionReason}
              />
              {mutation.error && mutation.variables?.correctsEventId ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage(mutation.error)}</Text> : null}
              <View style={styles.correctionActions}>
                <Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={() => setCorrecting(null)} style={({ pressed }) => [styles.correctionCancel, pressed && styles.pressed]}><Text style={styles.correctionCancelLabel}>Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={!correctionReason.trim() || mutation.isPending} onPress={saveCorrection} style={({ pressed }) => [styles.correctionSave, pressed && styles.pressed, (!correctionReason.trim() || mutation.isPending) && styles.disabled]}><Text style={styles.correctionSaveLabel}>{mutation.isPending ? 'Saving…' : 'Save correction'}</Text></Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  stack: { gap: spacing.md },
  skeleton: { height: 142, borderRadius: radii.md, backgroundColor: colors.mist },
  messageCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radii.lg, backgroundColor: colors.white, padding: spacing.lg },
  messageTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  messageBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  retry: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  retryLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
  notice: { borderRadius: radii.md, backgroundColor: colors.successTint, padding: spacing.md },
  noticeText: { color: colors.successDark, fontSize: 14, fontWeight: '700' },
  error: { color: colors.error, fontSize: 14, fontWeight: '700' },
  list: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radii.lg, backgroundColor: colors.white },
  doseCard: { gap: spacing.md, padding: spacing.md },
  doseCardFocused: { backgroundColor: colors.primaryTint },
  doseCardBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  doseTop: { flexDirection: 'row', gap: spacing.md },
  timeBlock: { width: 82, alignItems: 'flex-start', gap: spacing.sm },
  time: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sun },
  timelineDotDone: { backgroundColor: colors.success },
  doseCopy: { flex: 1 },
  medicine: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  details: { marginTop: spacing.xs, color: colors.muted, fontSize: 15 },
  status: { alignSelf: 'flex-start', marginTop: spacing.sm, color: colors.warning, fontSize: 13, fontWeight: '800' },
  statusDone: { color: colors.successDark },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryAction: { minHeight: 48, minWidth: 112, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: colors.ink, paddingHorizontal: spacing.md },
  primaryLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
  secondaryAction: { minHeight: 48, minWidth: 96, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  secondaryLabel: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.48 },
  correctAction: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.sm },
  correctLabel: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  actionError: { gap: spacing.xs, borderRadius: radii.sm, backgroundColor: colors.errorTint, padding: spacing.sm },
  retryInline: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryInlineLabel: { color: colors.error, fontSize: 15, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalKeyboard: { flex: 1, justifyContent: 'flex-end' },
  correctionSheet: { gap: spacing.md, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, backgroundColor: colors.canvas, padding: spacing.lg, paddingBottom: spacing.xl },
  correctionTitle: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  correctionBody: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  correctionChoices: { flexDirection: 'row', gap: spacing.sm },
  correctionChoice: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.white },
  correctionChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  correctionChoiceLabel: { color: colors.muted, fontSize: 16, fontWeight: '700' },
  correctionChoiceLabelSelected: { color: colors.primaryDark },
  correctionLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  correctionInput: { minHeight: 96, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.white, color: colors.ink, fontSize: 16, padding: spacing.md, textAlignVertical: 'top' },
  correctionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  correctionCancel: { minHeight: 52, minWidth: 110, flex: 1, alignItems: 'center', justifyContent: 'center' },
  correctionCancelLabel: { color: colors.primaryDark, fontSize: 16, fontWeight: '800' },
  correctionSave: { minHeight: 52, minWidth: 170, flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.md },
  correctionSaveLabel: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
