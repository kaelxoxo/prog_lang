import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  type AlertButton,
  Animated,
  findNodeHandle,
  type GestureResponderEvent,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest, errorMessage } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { SyncNotice } from '../../components/SyncNotice';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { useLocale } from '../settings/LocaleProvider';
import { actionableAt, manilaDate, type DoseOccurrence, type TimelineResponse } from './types';

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

type Translator = ReturnType<typeof useLocale>['t'];

function friendlyTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(value));
}

function doseLine(dose: DoseOccurrence) {
  const strength = dose.strengthValue && dose.strengthUnit ? ` · ${dose.strengthValue} ${dose.strengthUnit}` : '';
  return `${dose.doseQuantity} ${dose.doseUnit}${strength}`;
}

function statusCopy(dose: DoseOccurrence, locale: string, t: Translator) {
  const correction = dose.reason ? t('dose.correction', { reason: dose.reason }) : '';
  const actor = dose.recordedByName ? t('dose.by', { name: dose.recordedByName }) : '';
  const time = dose.recordedAt ? t('dose.at', { time: friendlyTime(dose.recordedAt, locale) }) : '';
  if (dose.status === 'taken') return `${t('dose.taken')}${actor}${time}${correction}`;
  if (dose.status === 'skipped') return `${t('dose.skipped')}${actor}${time}${correction}`;
  if (dose.status === 'snoozed' && dose.snoozedUntil) return t('dose.snoozedUntil', { time: friendlyTime(dose.snoozedUntil, locale) });
  return t('dose.notRecorded');
}

/** Emil Kowalski scale: 0.98 spring pressable with reduced-motion awareness */
type PressableScaleProps = PressableProps & {
  children: React.ReactNode;
  targetScale?: number;
  containerStyle?: StyleProp<ViewStyle>;
};

function PressableScale({
  children,
  targetScale = 0.98,
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reduceMotion.current = enabled;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotion.current = enabled;
    });
    return () => sub.remove();
  }, []);

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!disabled && !reduceMotion.current) {
      Animated.spring(scale, {
        toValue: targetScale,
        friction: 7,
        tension: 140,
        useNativeDriver: true,
      }).start();
    }
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    if (!disabled && !reduceMotion.current) {
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 140,
        useNativeDriver: true,
      }).start();
    }
    onPressOut?.(event);
  };

  return (
    <Pressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={style}
      {...rest}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export function DoseTimeline({ focusedOccurrenceId, onFocusLayout, onOpenMedicines, patient }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const now = useCurrentTime();
  const date = manilaDate(now);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<DoseOccurrence | null>(null);
  const [correctionKind, setCorrectionKind] = useState<'taken' | 'skipped'>('taken');
  const [correctionReason, setCorrectionReason] = useState('');
  const focusedRef = useRef<View>(null);
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
        ? t('dose.correctedNotice', { medicine: action.occurrence.medicationName, status: t(action.kind === 'taken' ? 'dose.taken' : 'dose.skipped').toLowerCase(), patient: patient.displayName })
        : action.kind === 'snoozed'
        ? t('dose.snoozedNotice', { medicine: action.occurrence.medicationName, minutes: action.snoozeMinutes ?? '' })
        : t('dose.recordedNotice', { medicine: action.occurrence.medicationName, status: t(action.kind === 'taken' ? 'dose.taken' : 'dose.skipped').toLowerCase(), patient: patient.displayName }));
      setCorrecting(null);
      setCorrectionReason('');
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['history', patient.id] });
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
    const label = t(action.kind === 'taken' ? 'dose.taken' : 'dose.skipped').toLowerCase();
    Alert.alert(
      t('dose.recordTitle', { medicine: action.occurrence.medicationName, status: label }),
      t('dose.recordBody', { dose: doseLine(action.occurrence), time: friendlyTime(action.occurrence.scheduledFor, localeTag), patient: patient.displayName }),
      [{ text: t('dose.cancel'), style: 'cancel' }, { text: t('dose.recordAction', { status: label }), onPress: () => mutation.mutate(mutationAction) }],
    );
  };

  const snooze = (occurrence: DoseOccurrence) => Alert.alert(
    t('dose.snoozeTitle', { medicine: occurrence.medicationName, patient: patient.displayName }),
    t('dose.snoozeBody', { time: friendlyTime(occurrence.scheduledFor, localeTag) }),
    ([15, 30, 60].map((minutes) => ({
      text: t('dose.minutes', { minutes }),
      onPress: () => record({ occurrence, kind: 'snoozed', snoozeMinutes: minutes as 15 | 30 | 60 }),
    })) as AlertButton[]).concat([{ text: t('dose.cancel'), style: 'cancel' }]),
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
    return <View accessibilityLabel={t('dose.loading')} accessible style={styles.stack}>{[0, 1, 2].map((item) => <View key={item} style={styles.skeleton} />)}</View>;
  }
  if (query.error && !query.data) {
    return <View style={styles.messageCard}><Text style={styles.messageTitle}>{t('dose.loadError')}</Text><Text style={styles.messageBody}>{errorMessage(query.error)}</Text><PressableScale accessibilityRole="button" onPress={() => void query.refetch()} style={styles.retry}><Text style={styles.retryLabel}>{t('app.retry')}</Text></PressableScale></View>;
  }
  if (!query.data?.timeline.length) {
    return <View style={styles.messageCard}><Text style={styles.messageTitle}>{t('dose.emptyTitle')}</Text><Text style={styles.messageBody}>{t('dose.emptyBody')}</Text><PressableScale accessibilityRole="button" onPress={onOpenMedicines} style={styles.retry}><Text style={styles.retryLabel}>{t('dose.openMedicines')}</Text></PressableScale></View>;
  }

  const timeline = query.data.timeline;
  const handledCount = timeline.filter((dose) => dose.status === 'taken' || dose.status === 'skipped').length;

  return (
    <View style={styles.stack}>
      <SyncNotice error={query.error} onRetry={() => void query.refetch()} updatedAt={query.dataUpdatedAt} />
      {notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <AppIcon color={colors.successDark} name="circle-check-big" size={18} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {/* Streamlined Unified Schedule Container (No card-inside-card clutter) */}
      <View onLayout={(event) => { listOffset.current = event.nativeEvent.layout.y; }} style={styles.scheduleCard}>
        <View style={styles.scheduleHeader}>
          <View style={styles.scheduleTitleRow}>
            <AppIcon color={colors.successDark} name="calendar-check" size={17} />
            <Text style={styles.scheduleTitle}>{t('home.scheduleTitle')}</Text>
          </View>
          <View style={styles.ratioBadge}>
            <Text style={styles.ratioText}>
              {t('home.doseRatio', { handled: handledCount, total: timeline.length })}
            </Text>
          </View>
        </View>

        <View style={styles.timelineList}>
          {timeline.map((dose, index) => {
            const isLast = index === timeline.length - 1;
            const terminal = dose.status === 'taken' || dose.status === 'skipped';
            const dueForReview = !terminal && new Date(actionableAt(dose)).getTime() <= now.getTime();
            const busy = mutation.isPending && mutation.variables?.occurrence.id === dose.id;

            return (
              <View
                key={dose.id}
                onLayout={focusedOccurrenceId === dose.id ? (event) => onFocusLayout?.(listOffset.current + event.nativeEvent.layout.y) : undefined}
                style={[
                  styles.doseRow,
                  isLast && styles.doseRowLast,
                  dueForReview && styles.doseRowAttention,
                  focusedOccurrenceId === dose.id && styles.doseRowFocused,
                ]}
              >
                <View
                  accessibilityLabel={`${friendlyTime(dose.scheduledFor, localeTag)}, ${dose.medicationName}, ${doseLine(dose)}, ${statusCopy(dose, localeTag, t)}`}
                  accessible
                  ref={focusedOccurrenceId === dose.id ? focusedRef : undefined}
                  style={styles.doseRowContent}
                >
                  {/* Top metadata: Time Badge Pill + Overdue Warning Indicator */}
                  <View style={styles.doseHeaderRow}>
                    <View style={[styles.timePill, dueForReview && styles.timePillAttention, terminal && styles.timePillTerminal]}>
                      <AppIcon
                        color={dueForReview ? colors.warning : terminal ? colors.successDark : colors.ink}
                        name={dueForReview ? 'alert-triangle' : terminal ? 'check' : 'clock-3'}
                        size={13}
                      />
                      <Text style={[styles.timeText, dueForReview && styles.timeTextAttention, terminal && styles.timeTextTerminal]}>
                        {friendlyTime(dose.scheduledFor, localeTag)}
                      </Text>
                    </View>

                    {dueForReview ? (
                      <View style={styles.overdueBadge}>
                        <Text style={styles.overdueBadgeText}>OVERDUE</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Medicine Details & Status Line */}
                  <View style={styles.doseCopy}>
                    <Text accessible={false} style={styles.medicine}>{dose.medicationName}</Text>
                    <View style={styles.detailsRow}>
                      <AppIcon color={colors.muted} name="pill" size={14} />
                      <Text accessible={false} style={styles.details}>{doseLine(dose)}</Text>
                    </View>
                    {terminal || dose.status === 'snoozed' ? (
                      <Text accessible={false} style={[styles.statusLine, dose.status === 'taken' && styles.statusLineTaken, dose.status === 'snoozed' && styles.statusLineSnoozed]}>
                        {statusCopy(dose, localeTag, t)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Interactive Actions (Take, Skip, Snooze) or Terminal Record Badge */}
                {!terminal ? (
                  <View style={[styles.actions, largeText && styles.actionsLarge]}>
                    <PressableScale
                      accessibilityLabel={t('dose.recordTitle', { medicine: dose.medicationName, status: t('dose.taken') })}
                      accessibilityRole="button"
                      accessibilityState={{ busy, disabled: busy }}
                      disabled={busy}
                      onPress={() => record({ occurrence: dose, kind: 'taken' })}
                      style={[styles.primaryAction, largeText && styles.actionLarge, busy && styles.disabled]}
                    >
                      <View style={styles.actionInner}>
                        <AppIcon color={colors.white} name="check" size={17} />
                        <Text style={styles.primaryLabel}>{t(busy ? 'dose.saving' : 'dose.taken')}</Text>
                      </View>
                    </PressableScale>
                    <PressableScale
                      accessibilityLabel={t('dose.recordTitle', { medicine: dose.medicationName, status: t('dose.skipped') })}
                      accessibilityRole="button"
                      accessibilityState={{ busy, disabled: busy }}
                      disabled={busy}
                      onPress={() => record({ occurrence: dose, kind: 'skipped' })}
                      style={[styles.secondaryAction, largeText && styles.actionLarge, busy && styles.disabled]}
                    >
                      <View style={styles.actionInner}>
                        <AppIcon color={colors.ink} name="minus" size={17} />
                        <Text style={styles.secondaryLabel}>{t('dose.skip')}</Text>
                      </View>
                    </PressableScale>
                    <PressableScale
                      accessibilityLabel={t('dose.snoozeTitle', { medicine: dose.medicationName, patient: patient.displayName })}
                      accessibilityRole="button"
                      accessibilityState={{ busy, disabled: busy }}
                      disabled={busy}
                      onPress={() => snooze(dose)}
                      style={[styles.secondaryAction, largeText && styles.actionLarge, busy && styles.disabled]}
                    >
                      <View style={styles.actionInner}>
                        <AppIcon color={colors.ink} name="clock-3" size={17} />
                        <Text style={styles.secondaryLabel}>{t('dose.snooze')}</Text>
                      </View>
                    </PressableScale>
                  </View>
                ) : (
                  <View style={styles.terminalRow}>
                    <View style={[
                      styles.statusBadge,
                      dose.status === 'taken' && styles.statusBadgeTaken,
                      dose.status === 'skipped' && styles.statusBadgeSkipped,
                    ]}>
                      <AppIcon color={dose.status === 'taken' ? colors.successDark : colors.muted} name={dose.status === 'taken' ? 'circle-check' : 'minus'} size={15} />
                      <Text style={[styles.statusBadgeText, dose.status === 'taken' && styles.statusBadgeTextTaken]}>
                        {t(dose.status === 'taken' ? 'dose.taken' : 'dose.skipped')}
                      </Text>
                    </View>
                    <PressableScale
                      accessibilityLabel={`${t('dose.correctRecord')}: ${dose.medicationName}`}
                      accessibilityRole="button"
                      onPress={() => openCorrection(dose)}
                      style={styles.correctAction}
                    >
                      <View style={styles.correctActionInner}>
                        <AppIcon color={colors.primaryDark} name="pencil" size={14} />
                        <Text style={styles.correctLabel}>{t('dose.correctRecord')}</Text>
                      </View>
                    </PressableScale>
                  </View>
                )}

                {mutation.error && mutation.variables?.occurrence.id === dose.id ? (
                  <View style={styles.actionError}>
                    <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage(mutation.error)}</Text>
                    <PressableScale accessibilityRole="button" onPress={() => mutation.mutate(mutation.variables!)} style={styles.retryInline}>
                      <Text style={styles.retryInlineLabel}>{t('app.retry')}</Text>
                    </PressableScale>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
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
                  <PressableScale accessibilityRole="radio" accessibilityState={{ checked: correctionKind === kind }} key={kind} onPress={() => setCorrectionKind(kind)} style={[styles.correctionChoice, correctionKind === kind && styles.correctionChoiceSelected]}>
                    <Text style={[styles.correctionChoiceLabel, correctionKind === kind && styles.correctionChoiceLabelSelected]}>{t(kind === 'taken' ? 'dose.taken' : 'dose.skipped')}</Text>
                  </PressableScale>
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
                  <Text style={styles.correctionCancelLabel}>{t('dose.cancel')}</Text>
                </PressableScale>
                <PressableScale accessibilityRole="button" disabled={!correctionReason.trim() || mutation.isPending} onPress={saveCorrection} style={[styles.correctionSave, (!correctionReason.trim() || mutation.isPending) && styles.disabled]}>
                  <Text style={styles.correctionSaveLabel}>{t(mutation.isPending ? 'dose.saving' : 'dose.saveCorrection')}</Text>
                </PressableScale>
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
  skeleton: { height: 142, borderRadius: radii.lg, backgroundColor: colors.mist },
  messageCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radii.lg, backgroundColor: colors.white, padding: spacing.lg },
  messageTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  messageBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  retry: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  retryLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.successTint,
    padding: spacing.md,
  },
  noticeText: { flex: 1, color: colors.successDark, fontSize: 14, fontWeight: '700' },
  error: { color: colors.error, fontSize: 14, fontWeight: '700' },

  // Streamlined schedule card container
  scheduleCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.mist,
  },
  scheduleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  scheduleTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  ratioBadge: {
    borderRadius: radii.full,
    backgroundColor: colors.successTint,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  ratioText: { color: colors.successDark, fontSize: 12, fontWeight: '800' },

  timelineList: { width: '100%' },
  doseRow: {
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
  },
  doseRowLast: {
    borderBottomWidth: 0,
  },
  doseRowAttention: {
    backgroundColor: colors.warningTint + '30',
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  doseRowFocused: {
    backgroundColor: colors.primaryTint + '30',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  doseRowContent: { gap: spacing.xs },
  doseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.full,
    backgroundColor: colors.mist,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timePillAttention: {
    backgroundColor: colors.warningTint,
  },
  timePillTerminal: {
    backgroundColor: colors.successTint,
  },
  timeText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  timeTextAttention: { color: colors.warning },
  timeTextTerminal: { color: colors.successDark },
  overdueBadge: {
    borderRadius: radii.full,
    backgroundColor: colors.warningTint,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  overdueBadgeText: { color: colors.warning, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  doseCopy: { gap: 4 },
  medicine: { color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  details: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  statusLine: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  statusLineTaken: { color: colors.successDark },
  statusLineSnoozed: { color: colors.primaryDark },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  actionsLarge: { flexDirection: 'column' },
  actionLarge: { width: '100%', flex: 0 },
  primaryAction: {
    minHeight: 48,
    minWidth: 95,
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.successDark,
  },
  secondaryAction: {
    minHeight: 48,
    minWidth: 85,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.canvas,
  },
  actionInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  primaryLabel: { color: colors.white, fontSize: 14, fontWeight: '800' },
  secondaryLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.48 },

  terminalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeTaken: { backgroundColor: colors.successTint },
  statusBadgeSkipped: { backgroundColor: colors.mist },
  statusBadgeText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  statusBadgeTextTaken: { color: colors.successDark },

  correctAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    backgroundColor: colors.mist,
  },
  correctActionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  correctLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },

  actionError: { gap: spacing.xs, borderRadius: radii.sm, backgroundColor: colors.errorTint, padding: spacing.sm },
  retryInline: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryInlineLabel: { color: colors.error, fontSize: 15, fontWeight: '800' },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalKeyboard: { flex: 1, justifyContent: 'flex-end' },
  correctionSheet: {
    gap: spacing.md,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.canvas,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.controlBorder,
    alignSelf: 'center',
    marginBottom: 4,
  },
  correctionTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  correctionBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  correctionChoices: { flexDirection: 'row', gap: spacing.sm },
  correctionChoice: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  correctionChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  correctionChoiceLabel: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  correctionChoiceLabelSelected: { color: colors.primaryDark, fontWeight: '900' },
  correctionLabel: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  correctionInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 16,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  correctionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  correctionCancel: { minHeight: 52, minWidth: 110, flex: 1, alignItems: 'center', justifyContent: 'center' },
  correctionCancelLabel: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  correctionSave: {
    minHeight: 52,
    minWidth: 170,
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
  },
  correctionSaveLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
});
