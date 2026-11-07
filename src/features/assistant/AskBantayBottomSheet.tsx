import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest } from '../../lib/api';
import { queryAssistant } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { AppColors, radii, sectionTitle, spacing, typography } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { MedicationEditorModal } from '../medications/MedicationEditorModal';
import type { Medication, MedicationInput, MedicationOcrDraft } from '../medications/types';
import type { Patient } from '../patients/types';
import { useLocale } from '../settings/LocaleProvider';
import type { DoseOccurrence } from '../today/types';
import { AssistantMascot } from './AssistantMascot';
import { evaluateLocalQuery } from './rulesEngine';
import type {
  AssistantActionableDose,
  AssistantChatMessage,
  AssistantMedicationDraft,
  MascotExpression,
} from './types';
import { useAssistantMascotState } from './useAssistantMascotState';

export interface AskBantayBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  patient: Patient | null;
  medications?: Medication[];
  timeline?: DoseOccurrence[];
  onNavigateToToday?: (occurrenceId: string) => void;
  onNavigateToMedicines?: () => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function formatDoseTime(value: string, localeTag: string): string {
  try {
    return new Intl.DateTimeFormat(localeTag, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Manila',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function draftToMedicationInput(draft: AssistantMedicationDraft): MedicationInput {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  let schedules: MedicationInput['schedules'] = [];
  if (draft.scheduleKind === 'interval') {
    schedules = [
      {
        kind: 'interval',
        timeOfDay: draft.times[0] || '08:00',
        intervalHours: draft.intervalHours ?? 8,
        weekdays: draft.weekdays && draft.weekdays.length > 0 ? draft.weekdays : [0, 1, 2, 3, 4, 5, 6],
        startOn: today,
        endOn: '',
        timeZone: 'Asia/Manila',
      },
    ];
  } else if (draft.scheduleKind === 'meal') {
    const meal = draft.mealName || 'breakfast';
    const relation = draft.mealRelation || 'after';
    const defaultMealTimes = {
      breakfast: { time: '08:00', start: '07:00', end: '09:00' },
      lunch: { time: '12:00', start: '11:00', end: '13:00' },
      dinner: { time: '18:00', start: '17:00', end: '19:00' },
    }[meal];

    schedules = [
      {
        kind: 'meal',
        timeOfDay: draft.times[0] || defaultMealTimes.time,
        weekdays: draft.weekdays && draft.weekdays.length > 0 ? draft.weekdays : [0, 1, 2, 3, 4, 5, 6],
        mealName: meal,
        mealRelation: relation,
        windowStart: defaultMealTimes.start,
        windowEnd: defaultMealTimes.end,
        startOn: today,
        endOn: '',
        timeZone: 'Asia/Manila',
      },
    ];
  } else {
    const times = draft.times && draft.times.length > 0 ? draft.times : ['08:00'];
    schedules = times.map((t) => ({
      kind: 'exact' as const,
      timeOfDay: t,
      weekdays: draft.weekdays && draft.weekdays.length > 0 ? draft.weekdays : [0, 1, 2, 3, 4, 5, 6],
      startOn: today,
      endOn: '',
      timeZone: 'Asia/Manila' as const,
    }));
  }

  return {
    displayName: draft.displayName,
    genericName: draft.genericName || '',
    brandName: draft.brandName || '',
    strengthValue: draft.strengthValue,
    strengthUnit: draft.strengthValue !== null ? (draft.strengthUnit || 'mg') : '',
    doseQuantity: draft.doseQuantity || 1,
    doseUnit: draft.doseUnit || 'tablet',
    medicineForm: draft.medicineForm || 'tablet',
    route: draft.route || 'Oral',
    prescriber: '',
    reason: '',
    originalInstructions: draft.originalInstructions || '',
    notes: draft.notes || '',
    sourceKind: 'manual',
    schedules,
  };
}

function assistantDraftToOcrDraft(draft: AssistantMedicationDraft): MedicationOcrDraft {
  return {
    confidence: 1,
    displayName: draft.displayName,
    genericName: draft.genericName,
    brandName: draft.brandName,
    doseQuantity: draft.doseQuantity,
    doseUnit: draft.doseUnit,
    exactTimes: draft.times.length > 0 ? draft.times : ['08:00'],
    medicineForm: draft.medicineForm,
    originalInstructions: draft.originalInstructions || '',
    rawText: draft.displayName,
    route: draft.route || 'Oral',
    sourceKind: 'label_photo',
    strengthUnit: draft.strengthUnit,
    strengthValue: draft.strengthValue,
    warnings: draft.isDuplicate && draft.duplicateMedicationName
      ? [`Duplicate warning: ${draft.duplicateMedicationName} already in active medicines.`]
      : [],
    suggestedScheduleKind: draft.scheduleKind,
    detectedMeals: draft.mealName ? [draft.mealName] : undefined,
    mealRelation: draft.mealRelation,
    intervalHours: draft.intervalHours,
  };
}

function formatDraftSchedule(draft: AssistantMedicationDraft): string {
  if (draft.scheduleKind === 'interval') {
    const hours = draft.intervalHours ?? 8;
    const start = draft.times[0] || '08:00';
    return `Every ${hours} hours (starting ${start})`;
  }
  if (draft.scheduleKind === 'meal') {
    const rel = draft.mealRelation === 'before' ? 'Before' : 'After';
    const meal = draft.mealName ?? 'meal';
    const time = draft.times[0] ? ` (${draft.times[0]})` : '';
    return `${rel} ${meal}${time}`;
  }
  const times = draft.times.length > 0 ? draft.times.join(', ') : '08:00';
  const days = draft.weekdays && draft.weekdays.length === 7 ? 'Daily' : `${draft.weekdays.length} days/week`;
  return `${times} · ${days}`;
}

export function AskBantayBottomSheet({
  visible,
  onClose,
  patient,
  medications = [],
  timeline = [],
  onNavigateToToday,
  onNavigateToMedicines,
}: AskBantayBottomSheetProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { session, token } = useAuth();
  const queryClient = useQueryClient();
  const now = useCurrentTime();

  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [recordingDoseId, setRecordingDoseId] = useState<string | null>(null);
  const [pendingDraftState, setPendingDraftState] = useState<AssistantMedicationDraft | null>(null);
  const [editorModalVisible, setEditorModalVisible] = useState(false);
  const [editorDraft, setEditorDraft] = useState<MedicationOcrDraft | null>(null);
  const [confirmingDraftId, setConfirmingDraftId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const prevVisibleRef = useRef(false);
  const prevPatientIdRef = useRef<string | null>(null);

  // Mascot expression synchronized with dose completion & query thinking
  const { expression, setExpression, startThinking, stopThinking } =
    useAssistantMascotState(timeline, isQuerying);

  // Dynamic greeting based on current state
  const greetingText = useMemo(() => {
    const caregiverName = session?.displayName || 'Caregiver';
    const patientName = patient?.displayName || 'Lola Rosa';

    if (!timeline || timeline.length === 0) {
      return t('assistant.greetingDefault', { name: caregiverName, patient: patientName });
    }

    const allCompleted = timeline.every((d) => d.status === 'taken' || d.status === 'skipped');
    if (allCompleted) {
      return t('assistant.greetingCelebration', { name: caregiverName, patient: patientName });
    }

    const nextDue = timeline.find((d) => d.status === 'not_recorded' || d.status === 'snoozed');
    if (nextDue) {
      const formattedTime = formatDoseTime(nextDue.dueAt, localeTag);
      return t('assistant.greetingNextDose', {
        name: caregiverName,
        patient: patientName,
        count: 1,
        time: formattedTime,
      });
    }

    return t('assistant.greetingDefault', { name: caregiverName, patient: patientName });
  }, [localeTag, patient?.displayName, session?.displayName, t, timeline]);

  // Reset conversation greeting ONLY when opening sheet or switching patient
  useEffect(() => {
    const isOpening = visible && !prevVisibleRef.current;
    const isPatientSwitch = visible && Boolean(patient?.id) && patient?.id !== prevPatientIdRef.current;

    if (isOpening || isPatientSwitch) {
      setPendingDraftState(null);
      setMessages([
        {
          id: 'greeting-msg',
          sender: 'assistant',
          text: greetingText,
          timestamp: new Date().toISOString(),
          source: 'local_rules',
        },
      ]);
    }
    prevVisibleRef.current = visible;
    prevPatientIdRef.current = patient?.id ?? null;
  }, [greetingText, patient?.id, visible]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isQuerying]);

  // Inline dose recording mutation
  const recordDoseMutation = useMutation({
    mutationFn: async ({
      occurrenceId,
      medicationName,
    }: {
      occurrenceId: string;
      medicationName: string;
    }) => {
      if (!patient?.id || !token) throw new Error('Authentication required');
      setRecordingDoseId(occurrenceId);

      const clientActionId = generateId() + '-dose';
      return apiRequest(`/patients/${patient.id}/doses`, {
        method: 'POST',
        token,
        body: {
          occurrenceId,
          kind: 'taken',
          clientActionId,
        },
      });
    },
    onSuccess: (_, variables) => {
      setRecordingDoseId(null);

      // Invalidate relevant queries so Today and Home update in real time
      if (patient?.id) {
        queryClient.invalidateQueries({ queryKey: ['timeline', patient.id] });
        queryClient.invalidateQueries({ queryKey: ['home', patient.id] });
        queryClient.invalidateQueries({ queryKey: ['history', patient.id] });
      }

      // Add confirmation message
      const successMessage = t('assistant.doseCardRecordedSuccess', {
        medicine: variables.medicationName,
        patient: patient?.displayName || 'Patient',
      });

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          sender: 'assistant',
          text: successMessage,
          timestamp: new Date().toISOString(),
          source: 'local_rules',
        },
      ]);
    },
    onError: () => {
      setRecordingDoseId(null);
    },
  });

  // Inline medication draft confirmation mutation
  const confirmMedicationMutation = useMutation({
    mutationFn: async (draft: AssistantMedicationDraft) => {
      if (!patient?.id || !token) throw new Error('Authentication required');
      setConfirmingDraftId(draft.id);
      const input = draftToMedicationInput(draft);
      return apiRequest<{ medicationId: string; versionId: string }>(
        `/patients/${patient.id}/medications`,
        {
          method: 'POST',
          token,
          body: input,
        },
      );
    },
    onSuccess: (_, draft) => {
      setConfirmingDraftId(null);

      if (patient?.id) {
        void queryClient.invalidateQueries({ queryKey: ['medications', patient.id] });
        void queryClient.invalidateQueries({ queryKey: ['today', patient.id] });
        void queryClient.invalidateQueries({ queryKey: ['timeline', patient.id] });
        void queryClient.invalidateQueries({ queryKey: ['reminders', patient.id] });
        void queryClient.invalidateQueries({ queryKey: ['home', patient.id] });
      }

      // Mark draft in conversation as confirmed
      setMessages((prev) =>
        prev.map((m) =>
          m.medicationDraft?.id === draft.id
            ? { ...m, medicationDraft: { ...m.medicationDraft, confirmed: true } }
            : m,
        ),
      );

      setPendingDraftState(null);

      const successMessage = t('assistant.draftCardSuccess', {
        medicine: draft.displayName,
        patient: patient?.displayName || 'Patient',
      });

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          sender: 'assistant',
          text: successMessage,
          timestamp: new Date().toISOString(),
          source: 'local_rules',
          canViewInSchedule: true,
        },
      ]);
    },
    onError: () => {
      setConfirmingDraftId(null);
    },
  });

  const handleEditDraft = useCallback((draft: AssistantMedicationDraft) => {
    const ocrDraft = assistantDraftToOcrDraft(draft);
    setEditorDraft(ocrDraft);
    setEditorModalVisible(true);
  }, []);

  const handleEditorSave = useCallback(
    async (input: MedicationInput) => {
      if (!patient?.id || !token) return;
      await apiRequest(`/patients/${patient.id}/medications`, {
        method: 'POST',
        token,
        body: input,
      });
      setEditorModalVisible(false);
      setEditorDraft(null);
      setPendingDraftState(null);

      if (patient.id) {
        void queryClient.invalidateQueries({ queryKey: ['medications', patient.id] });
        void queryClient.invalidateQueries({ queryKey: ['today', patient.id] });
        void queryClient.invalidateQueries({ queryKey: ['timeline', patient.id] });
        void queryClient.invalidateQueries({ queryKey: ['reminders', patient.id] });
        void queryClient.invalidateQueries({ queryKey: ['home', patient.id] });
      }

      const successMessage = t('assistant.draftCardSuccess', {
        medicine: input.displayName,
        patient: patient.displayName,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          sender: 'assistant',
          text: successMessage,
          timestamp: new Date().toISOString(),
          source: 'local_rules',
          canViewInSchedule: true,
        },
      ]);
    },
    [patient?.displayName, patient?.id, queryClient, t, token],
  );

  // Handle submitting query (Tier 1 Local Rules -> Tier 2 Gemini API)
  const handleSendQuery = useCallback(
    async (textToSend?: string) => {
      const query = (textToSend || inputQuery).trim();
      if (!query || !patient?.id) return;

      setInputQuery('');

      // 1. Append user message to stream
      const userMsgId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          sender: 'user',
          text: query,
          timestamp: new Date().toISOString(),
        },
      ]);

      // 2. Evaluate Tier 1 Local Rules (instant 0ms response)
      const localResult = evaluateLocalQuery({
        query,
        patient: {
          id: patient.id,
          displayName: patient.displayName,
          role: patient.role,
          canManageMedications: patient.canManageMedications,
          primaryCareManagerName: patient.primaryCareManagerName,
        },
        medications,
        timeline,
        now,
        pendingDraftState,
      });

      if (localResult.handled && localResult.answer) {
        if (localResult.expression) {
          setExpression(localResult.expression);
        }
        if (localResult.pendingDraft) {
          setPendingDraftState(localResult.pendingDraft);
        } else {
          setPendingDraftState(null);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            sender: 'assistant',
            text: localResult.answer!,
            timestamp: new Date().toISOString(),
            actionableDose: localResult.actionableDose,
            medicationDraft: localResult.medicationDraft,
            source: 'local_rules',
          },
        ]);
        return;
      }

      // 3. Fallback to Tier 2 Gemini Cloud API
      setIsQuerying(true);
      startThinking();

      try {
        const response = await queryAssistant(
          patient.id,
          {
            query,
            currentLocalTime: 'Asia/Manila',
            todayDate: new Date().toISOString().slice(0, 10),
          },
          token,
        );

        stopThinking();
        setIsQuerying(false);

        if (response.medicationDraft) {
          setPendingDraftState(null);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            sender: 'assistant',
            text: response.answer,
            timestamp: new Date().toISOString(),
            actionableDose: response.actionableDose,
            medicationDraft: response.medicationDraft,
            leafletCitation: response.leafletCitation,
            source: response.source,
          },
        ]);
      } catch (err) {
        stopThinking();
        setIsQuerying(false);

        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            sender: 'assistant',
            text: t('assistant.offlineNotice'),
            timestamp: new Date().toISOString(),
            source: 'fallback',
          },
        ]);
      }
    },
    [
      inputQuery,
      medications,
      now,
      patient,
      pendingDraftState,
      setExpression,
      startThinking,
      stopThinking,
      t,
      timeline,
      token,
    ],
  );

  // Suggested quick chips
  const suggestionChips = useMemo(() => {
    return [
      { id: 'chip-add-med', label: t('assistant.chipAddMedicine') },
      { id: 'chip-next', label: t('assistant.chipNextDose') },
      { id: 'chip-summary', label: t('assistant.chipTodaySummary') },
      { id: 'chip-prescription', label: t('assistant.chipPrescription') },
    ];
  }, [t]);

  if (!visible) return null;

  return (
    <>
      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={onClose}
        statusBarTranslucent
        visible={visible}
      >
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.screen}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.mascotAndTitle}>
              <View style={styles.mascotBadge}>
                <AssistantMascot
                  expression={expression}
                  size={40}
                />
              </View>
              <View style={styles.titleColumn}>
                <Text accessibilityRole="header" style={styles.sheetTitle}>
                  {t('assistant.sheetTitle')}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  {t('assistant.sheetSubtitle')}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityLabel={t('assistant.sheetClose')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}
            >
              <AppIcon color={colors.ink} name="x" size={20} />
            </Pressable>
          </View>

          {/* Conversation Stream */}
          <ScrollView
            contentContainerStyle={styles.messagesContent}
            ref={scrollRef}
            style={styles.messagesScroll}
          >
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <View
                  key={msg.id}
                  style={[
                    styles.messageRow,
                    isUser ? styles.userMessageRow : styles.assistantMessageRow,
                  ]}
                >
                  {!isUser ? (
                    <View style={styles.miniMascotAvatar}>
                      <AssistantMascot expression={expression} size={28} />
                    </View>
                  ) : null}

                  <View style={styles.bubbleWrapper}>
                    <View
                      style={[
                        styles.messageBubble,
                        isUser ? styles.userBubble : styles.assistantBubble,
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          isUser ? styles.userMessageText : styles.assistantMessageText,
                        ]}
                      >
                        {msg.text}
                      </Text>
                    </View>

                    {/* Attributable Dose Card */}
                    {msg.actionableDose ? (
                      <View style={styles.doseCard}>
                        <View style={styles.doseCardHeader}>
                          <AppIcon color={colors.primary} name="pill" size={16} />
                          <View style={styles.doseCardTextGroup}>
                            <Text style={styles.doseCardPatient}>
                              {patient?.displayName || 'Patient'}
                            </Text>
                            <Text style={styles.doseCardMedication}>
                              {msg.actionableDose.medicationName}
                              {msg.actionableDose.strengthValue && msg.actionableDose.strengthUnit
                                ? ` · ${msg.actionableDose.strengthValue} ${msg.actionableDose.strengthUnit}`
                                : ''}
                            </Text>
                            <Text style={styles.doseCardTime}>
                              {formatDoseTime(msg.actionableDose.scheduledFor, localeTag)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.doseCardActions}>
                          <Pressable
                            accessibilityLabel={t('assistant.doseCardRecordTaken')}
                            accessibilityRole="button"
                            disabled={recordingDoseId === msg.actionableDose.occurrenceId}
                            onPress={() =>
                              recordDoseMutation.mutate({
                                occurrenceId: msg.actionableDose!.occurrenceId,
                                medicationName: msg.actionableDose!.medicationName,
                              })
                            }
                            style={({ pressed }) => [
                              styles.recordTakenButton,
                              pressed && styles.buttonPressed,
                            ]}
                          >
                            {recordingDoseId === msg.actionableDose.occurrenceId ? (
                              <ActivityIndicator color={colors.white} size="small" />
                            ) : (
                              <>
                                <AppIcon color={colors.white} name="check" size={16} />
                                <Text style={styles.recordTakenText}>
                                  {t('assistant.doseCardRecordTaken')}
                                </Text>
                              </>
                            )}
                          </Pressable>

                          {onNavigateToToday ? (
                            <Pressable
                              accessibilityLabel={t('assistant.doseCardViewToday')}
                              accessibilityRole="button"
                              onPress={() => {
                                onClose();
                                onNavigateToToday(msg.actionableDose!.occurrenceId);
                              }}
                              style={({ pressed }) => [
                                styles.viewTodayButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <Text style={styles.viewTodayText}>
                                {t('assistant.doseCardViewToday')}
                              </Text>
                              <AppIcon color={colors.ink} name="arrow-right" size={14} />
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ) : null}

                    {/* Interactive In-Chat Medication Draft Card */}
                    {msg.medicationDraft ? (
                      <View style={styles.draftCard}>
                        <View style={styles.draftCardPatientRow}>
                          <Text style={styles.draftCardPatientText}>
                            {t('assistant.draftCardForPatient', {
                              patient: patient?.displayName || 'Patient',
                            })}
                          </Text>
                        </View>

                        <View style={styles.draftCardHeader}>
                          <AppIcon color={colors.primary} name="pill" size={18} />
                          <View style={styles.draftCardTextGroup}>
                            <Text style={styles.draftCardMedication}>
                              {msg.medicationDraft.displayName}
                            </Text>
                            <Text style={styles.draftCardDoseDetails}>
                              {msg.medicationDraft.strengthValue
                                ? `${msg.medicationDraft.strengthValue} ${msg.medicationDraft.strengthUnit} · `
                                : ''}
                              {msg.medicationDraft.doseQuantity} {msg.medicationDraft.doseUnit} ({msg.medicationDraft.medicineForm})
                            </Text>
                            <View style={styles.draftCardScheduleRow}>
                              <AppIcon color={colors.primaryDark} name="clock" size={13} />
                              <Text style={styles.draftCardScheduleText}>
                                {formatDraftSchedule(msg.medicationDraft)}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Duplicate Warning */}
                        {msg.medicationDraft.isDuplicate ? (
                          <View style={styles.duplicateWarningBox}>
                            <AppIcon color={colors.warning} name="alert-triangle" size={14} />
                            <Text style={styles.duplicateWarningText}>
                              {t('assistant.draftCardDuplicateNotice', {
                                medicine: msg.medicationDraft.duplicateMedicationName || msg.medicationDraft.displayName,
                              })}
                            </Text>
                          </View>
                        ) : null}

                        {/* Actions or Confirmed Status */}
                        {msg.medicationDraft.confirmed ? (
                          <View style={styles.confirmedBadgeRow}>
                            <View style={styles.confirmedBadge}>
                              <AppIcon color={colors.ink} name="check" size={16} />
                              <Text style={styles.confirmedBadgeText}>
                                {t('assistant.draftCardAdded')}
                              </Text>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.draftCardActions}>
                            <Pressable
                              accessibilityLabel={t('assistant.draftCardConfirm')}
                              accessibilityRole="button"
                              disabled={confirmingDraftId === msg.medicationDraft.id}
                              onPress={() => confirmMedicationMutation.mutate(msg.medicationDraft!)}
                              style={({ pressed }) => [
                                styles.confirmDraftButton,
                                confirmingDraftId === msg.medicationDraft!.id && styles.buttonDisabled,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              {confirmingDraftId === msg.medicationDraft.id ? (
                                <ActivityIndicator color={colors.white} size="small" />
                              ) : (
                                <>
                                  <AppIcon color={colors.white} name="check" size={16} />
                                  <Text style={styles.confirmDraftText}>
                                    {t('assistant.draftCardConfirm')}
                                  </Text>
                                </>
                              )}
                            </Pressable>

                            <Pressable
                              accessibilityLabel={t('assistant.draftCardEdit')}
                              accessibilityRole="button"
                              disabled={confirmingDraftId === msg.medicationDraft.id}
                              onPress={() => handleEditDraft(msg.medicationDraft!)}
                              style={({ pressed }) => [
                                styles.editDraftButton,
                                pressed && styles.buttonPressed,
                              ]}
                            >
                              <AppIcon color={colors.ink} name="pencil" size={14} />
                              <Text style={styles.editDraftText}>
                                {t('assistant.draftCardEdit')}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    ) : null}

                    {/* Verified Formulary Leaflet Citation Card */}
                    {msg.leafletCitation ? (
                      <View
                        accessibilityLabel={t('assistant.leafletCitationBadgeA11y', {
                          source: msg.leafletCitation.sourceTitle,
                          medication: msg.leafletCitation.medicationName,
                          section: msg.leafletCitation.section,
                        })}
                        accessibilityRole="text"
                        style={styles.leafletCitationCard}
                      >
                        <View style={styles.leafletCitationHeader}>
                          <AppIcon color={colors.primaryDark} name="book-open" size={13} />
                          <Text style={styles.leafletCitationBadgeText}>
                            {t('assistant.leafletCitationBadge')}
                          </Text>
                        </View>
                        <Text style={styles.leafletCitationMedication}>
                          {msg.leafletCitation.medicationName} · {msg.leafletCitation.section}
                        </Text>
                        <Text style={styles.leafletCitationSource}>
                          {msg.leafletCitation.sourceTitle}
                        </Text>
                      </View>
                    ) : null}

                    {/* View in Schedule Navigation Button */}
                    {msg.canViewInSchedule && (onNavigateToMedicines || onNavigateToToday) ? (
                      <View style={styles.viewScheduleRow}>
                        <Pressable
                          accessibilityLabel={t('assistant.draftCardViewSchedule')}
                          accessibilityRole="button"
                          onPress={() => {
                            onClose();
                            if (onNavigateToMedicines) {
                              onNavigateToMedicines();
                            } else if (onNavigateToToday) {
                              onNavigateToToday('');
                            }
                          }}
                          style={({ pressed }) => [
                            styles.viewScheduleButton,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          <Text style={styles.viewScheduleText}>
                            {t('assistant.draftCardViewSchedule')}
                          </Text>
                          <AppIcon color={colors.primaryDark} name="arrow-right" size={14} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}

            {isQuerying ? (
              <View style={[styles.messageRow, styles.assistantMessageRow]}>
                <View style={styles.miniMascotAvatar}>
                  <AssistantMascot expression="thinking" size={28} />
                </View>
                <View style={[styles.messageBubble, styles.assistantBubble, styles.thinkingBubble]}>
                  <ActivityIndicator color={colors.primary} size="small" style={{ marginRight: 8 }} />
                  <Text style={[styles.messageText, styles.thinkingText]}>
                    {t('assistant.thinkingMessage')}
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Quick Suggestion Chips (above input bar) */}
          <View style={styles.chipsRow}>
            <ScrollView
              contentContainerStyle={styles.chipsContent}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {suggestionChips.map((chip) => (
                <Pressable
                  accessibilityLabel={chip.label}
                  accessibilityRole="button"
                  key={chip.id}
                  onPress={() => void handleSendQuery(chip.label)}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.chipText}>{chip.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Text Input Bar */}
          <View style={styles.inputContainer}>
            <TextInput
              accessibilityLabel={t('assistant.inputPlaceholder')}
              multiline={false}
              onChangeText={setInputQuery}
              onSubmitEditing={() => void handleSendQuery()}
              placeholder={t('assistant.inputPlaceholder')}
              placeholderTextColor={colors.muted}
              returnKeyType="send"
              style={styles.textInput}
              value={inputQuery}
            />
            <Pressable
              accessibilityLabel={t('assistant.sendButton')}
              accessibilityRole="button"
              disabled={!inputQuery.trim() || isQuerying}
              hitSlop={8}
              onPress={() => void handleSendQuery()}
              style={({ pressed }) => [
                styles.sendButton,
                (!inputQuery.trim() || isQuerying) && styles.sendButtonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <AppIcon
                color={!inputQuery.trim() || isQuerying ? colors.muted : colors.white}
                name="arrow-up"
                size={20}
              />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
    {patient && editorModalVisible ? (
      <MedicationEditorModal
        draft={editorDraft}
        medication={null}
        onClose={() => {
          setEditorModalVisible(false);
          setEditorDraft(null);
        }}
        onSave={handleEditorSave}
        patient={patient}
        visible={editorModalVisible}
      />
    ) : null}
  </>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.surfaceElevated,
      flex: 1,
    },
    header: {
      alignItems: 'center',
      borderBottomColor: colors.line,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    mascotAndTitle: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    mascotBadge: {
      alignItems: 'center',
      height: 52,
      justifyContent: 'center',
      width: 52,
    },
    titleColumn: {
      justifyContent: 'center',
    },
    sheetTitle: {
      ...sectionTitle,
      color: colors.ink,
    },
    sheetSubtitle: {
      ...typography.caption,
      color: colors.muted,
    },
    closeButton: {
      alignItems: 'center',
      borderRadius: radii.full,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    chipsRow: {
      backgroundColor: colors.surfaceElevated,
      borderTopColor: colors.line,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingVertical: spacing.sm,
    },
    chipsContent: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    chip: {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.controlBorder,
      borderRadius: radii.full,
      borderWidth: 1,
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    chipPressed: {
      backgroundColor: colors.canvasSubtle,
      borderColor: colors.controlBorder,
    },
    chipText: {
      ...typography.caption,
      color: colors.ink,
      fontWeight: '600',
    },
    messagesScroll: {
      flex: 1,
    },
    messagesContent: {
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    messageRow: {
      flexDirection: 'row',
      marginVertical: 2,
    },
    userMessageRow: {
      justifyContent: 'flex-end',
    },
    assistantMessageRow: {
      alignItems: 'flex-start',
      gap: spacing.xs,
      justifyContent: 'flex-start',
    },
    miniMascotAvatar: {
      marginTop: 2,
    },
    bubbleWrapper: {
      flexDirection: 'column',
      maxWidth: '82%',
    },
    messageBubble: {
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    userBubble: {
      backgroundColor: colors.primaryTint,
      borderColor: colors.primaryBorder,
      borderRadius: radii.lg,
      borderBottomRightRadius: radii.xs,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    assistantBubble: {
      backgroundColor: colors.canvas,
      borderBottomLeftRadius: radii.xs,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    thinkingBubble: {
      alignItems: 'center',
      flexDirection: 'row',
    },
    messageText: {
      ...typography.body,
    },
    userMessageText: {
      color: colors.ink,
      fontWeight: '500',
    },
    assistantMessageText: {
      color: colors.ink,
    },
    thinkingText: {
      color: colors.muted,
      fontStyle: 'italic',
    },
    doseCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.md,
      borderWidth: 1,
      marginTop: spacing.xs,
      padding: spacing.md,
    },
    doseCardHeader: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    doseCardTextGroup: {
      flex: 1,
    },
    doseCardPatient: {
      ...typography.caption,
      color: colors.muted,
    },
    doseCardMedication: {
      ...sectionTitle,
      color: colors.ink,
    },
    doseCardTime: {
      ...typography.caption,
      color: colors.primaryDark,
      fontWeight: '600',
      marginTop: 2,
    },
    doseCardActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    recordTakenButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    recordTakenText: {
      ...typography.bodyEmphasis,
      color: colors.white,
      fontWeight: '700',
    },
    viewTodayButton: {
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderColor: colors.controlBorder,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    viewTodayText: {
      ...typography.bodyEmphasis,
      color: colors.ink,
    },
    inputContainer: {
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderTopColor: colors.line,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    textInput: {
      ...typography.body,
      backgroundColor: colors.canvas,
      borderColor: colors.controlBorder,
      borderRadius: radii.md,
      borderWidth: 1,
      color: colors.ink,
      flex: 1,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    sendButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    sendButtonDisabled: {
      backgroundColor: colors.inkMuted,
    },
    buttonPressed: {
      opacity: 0.8,
    },
    draftCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.md,
      borderWidth: 1,
      marginTop: spacing.xs,
      padding: spacing.md,
    },
    draftCardPatientRow: {
      borderBottomColor: colors.line,
      borderBottomWidth: StyleSheet.hairlineWidth,
      marginBottom: spacing.sm,
      paddingBottom: spacing.xs,
    },
    draftCardPatientText: {
      ...typography.caption,
      color: colors.muted,
    },
    draftCardHeader: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    draftCardTextGroup: {
      flex: 1,
    },
    draftCardMedication: {
      ...sectionTitle,
      color: colors.ink,
    },
    draftCardDoseDetails: {
      ...typography.caption,
      color: colors.ink,
      marginTop: 2,
    },
    draftCardScheduleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    draftCardScheduleText: {
      ...typography.caption,
      color: colors.primaryDark,
      fontWeight: '600',
    },
    duplicateWarningBox: {
      alignItems: 'center',
      backgroundColor: colors.canvasSubtle,
      borderRadius: radii.xs,
      flexDirection: 'row',
      gap: 6,
      marginVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    duplicateWarningText: {
      ...typography.caption,
      color: colors.warning,
      flex: 1,
      fontWeight: '600',
    },
    draftCardActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    confirmDraftButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      flex: 1,
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: spacing.sm,
    },
    confirmDraftText: {
      ...typography.bodyEmphasis,
      color: colors.white,
      fontWeight: '700',
    },
    editDraftButton: {
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderColor: colors.controlBorder,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: spacing.md,
    },
    editDraftText: {
      ...typography.bodyEmphasis,
      color: colors.ink,
    },
    confirmedBadgeRow: {
      marginTop: spacing.sm,
    },
    confirmedBadge: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
      paddingVertical: spacing.xs,
    },
    confirmedBadgeText: {
      ...typography.caption,
      color: colors.ink,
      fontWeight: '600',
    },
    viewScheduleRow: {
      marginTop: spacing.xs,
    },
    viewScheduleButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      minHeight: 48,
      paddingVertical: 10,
    },
    viewScheduleText: {
      ...typography.bodyEmphasis,
      color: colors.primaryDark,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    leafletCitationCard: {
      borderTopColor: colors.line,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'column',
      gap: 2,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
    },
    leafletCitationHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    leafletCitationBadgeText: {
      ...typography.caption,
      color: colors.primaryDark,
      fontWeight: '600',
    },
    leafletCitationMedication: {
      ...typography.caption,
      color: colors.ink,
      fontWeight: '600',
    },
    leafletCitationSource: {
      ...typography.caption,
      color: colors.muted,
    },
  });
