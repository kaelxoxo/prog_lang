import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  type AlertButton,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../components/AppIcon';
import { Disclosure } from '../../components/Disclosure';
import { DrawnCheck } from '../../components/DrawnCheck';
import { PressableScale } from '../../components/PressableScale';
import { SyncNotice } from '../../components/SyncNotice';
import { apiRequest, errorMessage } from '../../lib/api';
import { confirmAction } from '../../lib/confirm';
import { recordedTakenHaptic } from '../../lib/motion';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { usePatientDisplay } from '../patients/usePatientDisplay';
import { useLocale } from '../settings/LocaleProvider';
import type { translate } from '../settings/translations';
import {
  groupByTimeSlot,
  isDueNow,
  isLaterToday,
  isNotRecorded,
  isRecorded,
  partOfDay,
  type PartOfDay,
  type TimeSlot,
} from './doseWindows';
import { manilaDate, type DoseOccurrence, type TimelineResponse } from './types';

type Props = {
  focusedOccurrenceId?: string | null;
  onFocusLayout?: (offset: number) => void;
  onOpenMedicines: () => void;
  patient: Patient;
};
type DoseAction = {
  occurrence: DoseOccurrence;
  kind: 'taken' | 'skipped' | 'snoozed';
  snoozeMinutes?: 15 | 30 | 60;
  reason?: string;
  correctsEventId?: string;
  clientActionId: string;
};
type Translator = typeof translate;
type DaySection = { part: PartOfDay; slots: TimeSlot[]; doses: DoseOccurrence[] };

const PART_TITLES = { morning: 'today.morning', afternoon: 'today.afternoon', evening: 'today.evening' } as const;

function actionId() {
  const random = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Number.parseInt(random(), 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function friendlyTime(value: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(value));
}

function doseLine(dose: DoseOccurrence) {
  const strength = dose.strengthValue && dose.strengthUnit ? ` · ${dose.strengthValue} ${dose.strengthUnit}` : '';
  return `${dose.doseQuantity} ${dose.doseUnit}${strength}`;
}

function doseCount(count: number, t: Translator) {
  return count === 1 ? t('today.oneDose') : t('today.doseCount', { count });
}

/** Time Slots grouped under Morning / Afternoon / Evening, in time order. */
function daySections(timeline: DoseOccurrence[]): DaySection[] {
  const sections = new Map<PartOfDay, TimeSlot[]>();
  for (const slot of groupByTimeSlot(timeline)) {
    const part = partOfDay(slot.at);
    sections.set(part, [...(sections.get(part) ?? []), slot]);
  }
  return [...sections.entries()].map(([part, slots]) => ({ part, slots, doses: slots.flatMap((slot) => slot.doses) }));
}

/** Status text under a dose; Later Today doses need none. */
function statusCopy(dose: DoseOccurrence, now: number, localeTag: string, t: Translator) {
  if (isRecorded(dose)) {
    const actor = dose.recordedByName ? t('dose.by', { name: dose.recordedByName }) : '';
    const time = dose.recordedAt ? t('dose.at', { time: friendlyTime(dose.recordedAt, localeTag) }) : '';
    const correction = dose.reason ? t('dose.correction', { reason: dose.reason }) : '';
    return `${t(dose.status === 'taken' ? 'dose.taken' : 'dose.skipped')}${actor}${time}${correction}`;
  }
  if (isNotRecorded(dose, now)) return t('dose.notRecorded');
  if (dose.status === 'snoozed' && dose.snoozedUntil) return t('dose.snoozedUntil', { time: friendlyTime(dose.snoozedUntil, localeTag) });
  if (isDueNow(dose, now)) return t('dose.dueNow');
  return null;
}

export function DoseTimeline({ focusedOccurrenceId, onFocusLayout, onOpenMedicines, patient }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { isSelf } = usePatientDisplay(patient);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const now = useCurrentTime();
  const date = manilaDate(now);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [justTaken, setJustTaken] = useState<ReadonlySet<string>>(() => new Set());
  const [correcting, setCorrecting] = useState<DoseOccurrence | null>(null);
  const [correctionKind, setCorrectionKind] = useState<'taken' | 'skipped'>('taken');
  const [correctionReason, setCorrectionReason] = useState('');
  const rootRef = useRef<View>(null);
  const focusedRef = useRef<View>(null);
  const queryKey = ['today', patient.id, date] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => apiRequest<TimelineResponse>(`/patients/${patient.id}/today?date=${date}`, { token }),
  });
  const nowMs = now.getTime();
  const mutation = useMutation({
    mutationFn: (mutationAction: DoseAction) => apiRequest(
      `/patients/${patient.id}/doses/${mutationAction.occurrence.id}/events`,
      { method: 'POST', token, body: { kind: mutationAction.kind, snoozeMinutes: mutationAction.snoozeMinutes, reason: mutationAction.reason, correctsEventId: mutationAction.correctsEventId, clientActionId: mutationAction.clientActionId } },
    ),
    onSuccess: (_result, action) => {
      setNotice(action.correctsEventId
        ? t('dose.correctedNotice', { medicine: action.occurrence.medicationName, status: t(action.kind === 'taken' ? 'dose.taken' : 'dose.skipped').toLowerCase(), patient: patient.displayName })
        : action.kind === 'snoozed'
        ? t('dose.snoozedNotice', { medicine: action.occurrence.medicationName, minutes: action.snoozeMinutes ?? '' })
        : t('dose.recordedNotice', { medicine: action.occurrence.medicationName, status: t(action.kind === 'taken' ? 'dose.taken' : 'dose.skipped').toLowerCase(), patient: patient.displayName }));
      if (action.kind === 'taken') setJustTaken((ids) => new Set(ids).add(action.occurrence.id));
      setCorrecting(null);
      setCorrectionReason('');
      const refetched = queryClient.invalidateQueries({ queryKey });
      // The check draws once the refetched row says Taken; the haptic lands on that same frame.
      if (action.kind === 'taken') void refetched.then(recordedTakenHaptic);
      void queryClient.invalidateQueries({ queryKey: ['history', patient.id] });
      void queryClient.invalidateQueries({ queryKey: ['reminders', patient.id] });
    },
  });

  useEffect(() => {
    if (!focusedOccurrenceId || !query.data?.timeline.some((dose) => dose.id === focusedOccurrenceId)) return;
    const node = findNodeHandle(focusedRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [focusedOccurrenceId, query.data]);

  /** Every Taken/Skip asks once: Later Today doses as an early recording, the rest with the usual record confirmation. */
  const record = (occurrence: DoseOccurrence, kind: 'taken' | 'skipped') => {
    const status = t(kind === 'taken' ? 'dose.taken' : 'dose.skipped').toLowerCase();
    const time = friendlyTime(occurrence.scheduledFor, localeTag);
    // Same clock the rows render with, so the dialog always matches the row that was pressed.
    const early = isLaterToday(occurrence, nowMs);
    confirmAction({
      title: early ? t('dose.earlyTitle') : t('dose.recordTitle', { medicine: occurrence.medicationName, status }),
      message: early
        ? t('dose.earlyBody', { time, medicine: occurrence.medicationName, status })
        : t('dose.recordBody', { dose: doseLine(occurrence), time, patient: patient.displayName }),
      confirmLabel: t('dose.recordAction', { status }),
      cancelLabel: t('dose.cancel'),
      onConfirm: () => mutation.mutate({ occurrence, kind, clientActionId: actionId() }),
    });
  };

  const snooze = (occurrence: DoseOccurrence) => Alert.alert(
    t(isSelf ? 'shell.snoozeSelf' : 'dose.snoozeTitle', { medicine: occurrence.medicationName, patient: patient.displayName }),
    t('dose.snoozeBody', { time: friendlyTime(occurrence.scheduledFor, localeTag) }),
    ([15, 30, 60] as const).map<AlertButton>((minutes) => ({
      text: t('dose.minutes', { minutes }),
      onPress: () => mutation.mutate({ occurrence, kind: 'snoozed', snoozeMinutes: minutes, clientActionId: actionId() }),
    })).concat([{ text: t('dose.cancel'), style: 'cancel' }]),
  );

  const openCorrection = (occurrence: DoseOccurrence) => {
    setCorrecting(occurrence);
    setCorrectionKind(occurrence.status === 'taken' ? 'skipped' : 'taken');
    setCorrectionReason('');
  };

  const saveCorrection = () => {
    if (!correcting?.eventId || !correctionReason.trim()) return;
    mutation.mutate({
      occurrence: correcting,
      kind: correctionKind,
      reason: correctionReason.trim(),
      correctsEventId: correcting.eventId,
      clientActionId: actionId(),
    });
  };

  const reportFocusOffset = () => {
    const root = rootRef.current;
    if (!root || !onFocusLayout) return;
    focusedRef.current?.measureLayout(root, (_x, y) => onFocusLayout(y), () => undefined);
  };

  if (query.isLoading && !query.data) {
    return (
      <View accessibilityLabel={t('dose.loading')} accessible>
        {[0, 1, 2].map((item) => (
          <View key={item} style={styles.skeletonRow}>
            <View style={styles.skeletonBar} />
            <View style={[styles.skeletonBar, styles.skeletonBarShort]} />
          </View>
        ))}
      </View>
    );
  }
  if (query.error && !query.data) {
    return (
      <View style={styles.message}>
        <Text accessibilityRole="header" style={styles.messageTitle}>{t('dose.loadError')}</Text>
        <Text accessibilityLiveRegion="assertive" style={styles.messageBody}>{errorMessage(query.error)}</Text>
        <View style={styles.buttonRow}>
          <PressableScale accessibilityRole="button" onPress={() => void query.refetch()} style={styles.primaryAction}>
            <Text style={styles.primaryLabel}>{t('app.retry')}</Text>
          </PressableScale>
        </View>
      </View>
    );
  }
  if (!query.data?.timeline.length) {
    return (
      <View style={styles.message}>
        <Text accessibilityRole="header" style={styles.messageTitle}>{t('dose.emptyTitle')}</Text>
        <Text style={styles.messageBody}>{t('dose.emptyBody')}</Text>
        <View style={styles.buttonRow}>
          <PressableScale accessibilityRole="button" onPress={onOpenMedicines} style={styles.primaryAction}>
            <Text style={styles.primaryLabel}>{t('dose.openMedicines')}</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  const timeline = query.data.timeline;
  const recordedCount = timeline.filter(isRecorded).length;

  const renderDose = (dose: DoseOccurrence) => {
    const recorded = isRecorded(dose);
    const notRecorded = isNotRecorded(dose, nowMs);
    const dueNow = !notRecorded && isDueNow(dose, nowMs);
    const status = statusCopy(dose, nowMs, localeTag, t);
    const busy = mutation.isPending && mutation.variables?.occurrence.id === dose.id;
    const focused = focusedOccurrenceId === dose.id;

    const summary = (
      <View
        accessibilityLabel={[friendlyTime(dose.scheduledFor, localeTag), dose.medicationName, doseLine(dose), status].filter(Boolean).join(', ')}
        accessible
        ref={focused ? focusedRef : undefined}
        style={styles.doseSummary}
      >
        <View style={styles.marker}>
          {dose.status === 'taken' ? (
            <DrawnCheck animate={justTaken.has(dose.id)} color={colors.ink} size={22} />
          ) : dose.status === 'skipped' ? (
            <AppIcon color={colors.ink} name="minus" size={20} />
          ) : (
            <View style={[styles.dot, dueNow && styles.dotDueNow, notRecorded && styles.dotNotRecorded]} />
          )}
        </View>
        <View style={styles.doseCopy}>
          <Text style={styles.medicine}>{dose.medicationName}</Text>
          <Text style={styles.details}>{doseLine(dose)}</Text>
          {status ? (
            <Text style={[styles.status, recorded && styles.statusRecorded, dueNow && styles.statusDueNow, notRecorded && styles.statusNotRecorded]}>
              {status}
            </Text>
          ) : null}
        </View>
      </View>
    );

    return (
      <View key={dose.id} onLayout={focused ? reportFocusOffset : undefined} style={[styles.doseRow, focused && styles.doseRowFocused]}>
        {recorded ? (
          <View style={[styles.recordedRow, largeText && styles.recordedRowLarge]}>
            {summary}
            <PressableScale
              accessibilityLabel={`${t('dose.correctRecord')}: ${dose.medicationName}`}
              accessibilityRole="button"
              onPress={() => openCorrection(dose)}
              style={styles.editAction}
            >
              <Text style={styles.editLabel}>{t('dose.correctRecord')}</Text>
            </PressableScale>
          </View>
        ) : (
          <>
            {summary}
            <View style={[styles.actions, largeText && styles.actionsLarge]}>
              <PressableScale
                accessibilityLabel={`${t('dose.taken')}: ${dose.medicationName}`}
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={() => record(dose, 'taken')}
                style={[styles.primaryAction, busy && styles.disabled]}
              >
                <Text style={styles.primaryLabel}>{t(busy ? 'dose.saving' : 'dose.taken')}</Text>
              </PressableScale>
              <PressableScale
                accessibilityLabel={`${t('dose.skip')}: ${dose.medicationName}`}
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={() => record(dose, 'skipped')}
                style={[styles.secondaryAction, busy && styles.disabled]}
              >
                <Text style={styles.secondaryLabel}>{t('dose.skip')}</Text>
              </PressableScale>
              <PressableScale
                accessibilityLabel={t(isSelf ? 'shell.snoozeSelf' : 'dose.snoozeTitle', { medicine: dose.medicationName, patient: patient.displayName })}
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={() => snooze(dose)}
                style={[styles.secondaryAction, busy && styles.disabled]}
              >
                <Text style={styles.secondaryLabel}>{t('dose.snooze')}</Text>
              </PressableScale>
            </View>
          </>
        )}

        {mutation.error && mutation.variables?.occurrence.id === dose.id && !mutation.variables.correctsEventId ? (
          <View style={[styles.actionError, largeText && styles.actionErrorLarge]}>
            <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage(mutation.error)}</Text>
            <PressableScale accessibilityRole="button" onPress={() => mutation.mutate(mutation.variables!)} style={styles.retryInline}>
              <Text style={styles.retryInlineLabel}>{t('app.retry')}</Text>
            </PressableScale>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View ref={rootRef} style={styles.stack}>
      <SyncNotice error={query.error} onRetry={() => void query.refetch()} updatedAt={query.dataUpdatedAt} />
      <Text accessibilityLiveRegion="polite" style={styles.ratio}>
        {t('today.recordedRatio', { recorded: recordedCount, total: timeline.length })}
      </Text>
      {notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <AppIcon color={colors.ink} name="check" size={16} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.sections}>
        {daySections(timeline).map(({ part, slots, doses }) => {
          // A section of only Later Today doses starts folded, unless the focused dose is in it.
          const startsExpanded = doses.some((dose) => !isLaterToday(dose, nowMs) || dose.id === focusedOccurrenceId);
          const title = t(PART_TITLES[part]);
          const summary = `${doseCount(doses.length, t)} · ${t('today.fromTime', { time: friendlyTime(slots[0].at, localeTag) })}`;
          return (
            <Disclosure
              accessibilityLabel={`${title}, ${summary}`}
              chevronColor={colors.muted}
              header={(
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>{title}</Text>
                  <Text style={styles.sectionSummary}>{summary}</Text>
                </View>
              )}
              headerStyle={styles.sectionHeader}
              initiallyExpanded={startsExpanded}
              // Remount when a folded section gains a Due Now, recorded, or focused dose so it opens.
              key={`${part}:${startsExpanded}`}
            >
              {slots.map((slot) => (
                <View key={slot.at} style={styles.slot}>
                  <Text style={styles.slotHeader}>
                    <Text style={styles.slotTime}>{friendlyTime(slot.at, localeTag)}</Text>
                    {` · ${doseCount(slot.doses.length, t)}`}
                  </Text>
                  {slot.doses.map(renderDose)}
                </View>
              ))}
            </Disclosure>
          );
        })}
      </View>

      <Modal animationType="fade" onRequestClose={() => setCorrecting(null)} transparent visible={Boolean(correcting)}>
        <SafeAreaView style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}>
            <View accessibilityViewIsModal style={styles.correctionSheet}>
              <View style={styles.sheetHandle} />
              <Text accessibilityRole="header" style={styles.correctionTitle}>{t('dose.correctTitle')}</Text>
              <Text style={styles.correctionBody}>
                {correcting ? t('dose.correctBody', { medicine: correcting.medicationName, dose: doseLine(correcting), patient: patient.displayName }) : ''}
              </Text>
              <View accessibilityRole="radiogroup" style={styles.correctionChoices}>
                {(['taken', 'skipped'] as const).map((kind) => (
                  <View key={kind} style={styles.correctionChoiceCell}>
                    <PressableScale
                      accessibilityRole="radio"
                      accessibilityState={{ checked: correctionKind === kind }}
                      onPress={() => setCorrectionKind(kind)}
                      style={[styles.correctionChoice, correctionKind === kind && styles.correctionChoiceSelected]}
                    >
                      <Text style={[styles.correctionChoiceLabel, correctionKind === kind && styles.correctionChoiceLabelSelected]}>
                        {t(kind === 'taken' ? 'dose.taken' : 'dose.skipped')}
                      </Text>
                    </PressableScale>
                  </View>
                ))}
              </View>
              <Text style={styles.correctionLabel}>{t('dose.reason')}</Text>
              <TextInput
                accessibilityLabel={t('dose.reason')}
                autoFocus
                maxLength={240}
                multiline
                onChangeText={setCorrectionReason}
                placeholder={t('dose.reasonPlaceholder')}
                placeholderTextColor={colors.muted}
                style={styles.correctionInput}
                value={correctionReason}
              />
              {mutation.error && mutation.variables?.correctsEventId ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage(mutation.error)}</Text> : null}
              <View style={styles.correctionActions}>
                <PressableScale accessibilityRole="button" disabled={mutation.isPending} onPress={() => setCorrecting(null)} style={styles.correctionCancel}>
                  <Text style={styles.secondaryLabel}>{t('dose.cancel')}</Text>
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  disabled={!correctionReason.trim() || mutation.isPending}
                  onPress={saveCorrection}
                  style={[styles.primaryAction, (!correctionReason.trim() || mutation.isPending) && styles.disabled]}
                >
                  <Text style={styles.primaryLabel}>{t(mutation.isPending ? 'dose.saving' : 'dose.saveCorrection')}</Text>
                </PressableScale>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// Marker column width plus its gap, so actions line up under the medicine name.
const COPY_INDENT = 36;

const createStyles = (colors: AppColors) => StyleSheet.create({
  stack: { gap: spacing.md },
  skeletonRow: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingVertical: spacing.md },
  skeletonBar: { width: '55%', height: 14, borderRadius: radii.xs, backgroundColor: colors.canvasSubtle },
  skeletonBarShort: { width: '30%' },
  message: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.md },
  messageTitle: { ...sectionTitle, color: colors.ink },
  messageBody: { ...typography.body, color: colors.muted },
  buttonRow: { flexDirection: 'row', marginTop: spacing.sm },
  ratio: { ...typography.caption, color: colors.muted },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noticeText: { ...typography.body, flex: 1, color: colors.ink },

  sections: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  sectionHeader: { borderTopWidth: 1, borderTopColor: colors.controlBorder, paddingVertical: spacing.sm },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm },
  sectionTitle: { ...sectionTitle, color: colors.ink },
  sectionSummary: { ...typography.caption, color: colors.muted },
  slot: { paddingBottom: spacing.sm },
  slotHeader: { ...typography.caption, color: colors.muted, paddingBottom: spacing.sm },
  slotTime: { ...typography.bodyEmphasis, color: colors.ink },

  doseRow: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingVertical: 12 },
  doseRowFocused: { marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, backgroundColor: colors.canvasSubtle },
  doseSummary: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  marker: { width: 24, height: 22, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.controlBorder },
  dotDueNow: { borderColor: colors.primary },
  dotNotRecorded: { borderColor: colors.warning, backgroundColor: colors.warning },
  doseCopy: { flex: 1, gap: 2 },
  medicine: { ...typography.bodyEmphasis, color: colors.ink },
  details: { ...typography.body, color: colors.muted },
  status: { ...typography.caption, color: colors.muted, marginTop: 2 },
  statusRecorded: { color: colors.ink },
  statusDueNow: { color: colors.primary },
  statusNotRecorded: { color: colors.warning, fontWeight: '600' },

  recordedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  recordedRowLarge: { flexDirection: 'column' },
  editAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  editLabel: { ...typography.bodyEmphasis, color: colors.primary },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginLeft: COPY_INDENT },
  actionsLarge: { flexDirection: 'column', marginLeft: 0 },
  primaryAction: {
    minHeight: 48,
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  secondaryAction: {
    minHeight: 48,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
  },
  primaryLabel: { ...typography.headline, color: colors.white },
  secondaryLabel: { ...typography.headline, color: colors.ink },
  disabled: { opacity: 0.48 },

  actionError: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginLeft: COPY_INDENT },
  actionErrorLarge: { marginLeft: 0 },
  error: { ...typography.caption, color: colors.error },
  retryInline: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryInlineLabel: { ...typography.headline, color: colors.error },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalKeyboard: { flex: 1, justifyContent: 'flex-end' },
  correctionSheet: {
    gap: spacing.md,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.controlBorder, alignSelf: 'center' },
  correctionTitle: { ...typography.title1, color: colors.ink },
  correctionBody: { ...typography.body, color: colors.muted },
  correctionChoices: { flexDirection: 'row', gap: spacing.sm },
  correctionChoiceCell: { flex: 1 },
  correctionChoice: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.sm,
  },
  correctionChoiceSelected: { borderColor: colors.ink, backgroundColor: colors.canvasSubtle },
  correctionChoiceLabel: { ...typography.headline, color: colors.muted },
  correctionChoiceLabelSelected: { color: colors.ink },
  correctionLabel: { ...typography.bodyEmphasis, color: colors.ink },
  correctionInput: {
    ...typography.body,
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.sm,
    backgroundColor: colors.canvas,
    color: colors.ink,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  correctionActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm },
  correctionCancel: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md },
});
