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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest } from '../../lib/api';
import { queryAssistant } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { AppColors, radii, spacing } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Medication } from '../medications/types';
import type { Patient } from '../patients/types';
import { useLocale } from '../settings/LocaleProvider';
import type { DoseOccurrence } from '../today/types';
import { AssistantMascot } from './AssistantMascot';
import { evaluateLocalQuery } from './rulesEngine';
import type {
  AssistantActionableDose,
  AssistantChatMessage,
  AssistantLocale,
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
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function formatDoseTime(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'fil' ? 'fil-PH' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Manila',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AskBantayBottomSheet({
  visible,
  onClose,
  patient,
  medications = [],
  timeline = [],
  onNavigateToToday,
}: AskBantayBottomSheetProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const { session, token } = useAuth();
  const queryClient = useQueryClient();
  const now = useCurrentTime();

  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [recordingDoseId, setRecordingDoseId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  // Mascot expression synchronized with dose completion & query thinking
  const { expression, setExpression, startThinking, stopThinking, triggerCelebration } =
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
      const formattedTime = formatDoseTime(nextDue.dueAt, locale);
      return t('assistant.greetingNextDose', {
        name: caregiverName,
        patient: patientName,
        count: 1,
        time: formattedTime,
      });
    }

    return t('assistant.greetingDefault', { name: caregiverName, patient: patientName });
  }, [locale, patient?.displayName, session?.displayName, t, timeline]);

  // Reset conversation greeting when opening or switching patient
  useEffect(() => {
    if (visible) {
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
      triggerCelebration();

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
      const assistantLocale: AssistantLocale = locale === 'fil' ? 'fil' : 'en';
      const localResult = evaluateLocalQuery({
        query,
        locale: assistantLocale,
        patient: {
          id: patient.id,
          displayName: patient.displayName,
          role: patient.role,
        },
        medications,
        timeline,
        now,
      });

      if (localResult.handled && localResult.answer) {
        if (localResult.expression) {
          setExpression(localResult.expression);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            sender: 'assistant',
            text: localResult.answer!,
            timestamp: new Date().toISOString(),
            actionableDose: localResult.actionableDose,
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
            locale: assistantLocale,
            currentLocalTime: 'Asia/Manila',
            todayDate: new Date().toISOString().slice(0, 10),
          },
          token,
        );

        stopThinking();
        setIsQuerying(false);

        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            sender: 'assistant',
            text: response.answer,
            timestamp: new Date().toISOString(),
            actionableDose: response.actionableDose,
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
      locale,
      medications,
      now,
      patient,
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
      { id: 'chip-next', label: t('assistant.chipNextDose') },
      { id: 'chip-summary', label: t('assistant.chipTodaySummary') },
      { id: 'chip-prescription', label: t('assistant.chipPrescription') },
    ];
  }, [t]);

  if (!visible) return null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityHint="Closes the Ask Bantay assistant"
          accessibilityLabel={t('assistant.sheetClose')}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.sheetContainer,
            {
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.mascotAndTitle}>
              <AssistantMascot
                expression={expression}
                size={48}
              />
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
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}
            >
              <AppIcon color={colors.ink} name="x" size={20} />
            </Pressable>
          </View>

          {/* Suggestion Chips */}
          <View style={styles.chipsRow}>
            <ScrollView
              contentContainerStyle={styles.chipsContent}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {suggestionChips.map((chip) => (
                <Pressable
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
                          <View style={styles.dosePillIcon}>
                            <AppIcon color={colors.primaryDark} name="pill" size={16} />
                          </View>
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
                              {formatDoseTime(msg.actionableDose.scheduledFor, locale)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.doseCardActions}>
                          <Pressable
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
                  <ActivityIndicator color={colors.sun} size="small" style={{ marginRight: 8 }} />
                  <Text style={[styles.messageText, styles.thinkingText]}>
                    {t('assistant.thinkingMessage')}
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

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
                size={18}
              />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    overlay: {
      backgroundColor: 'rgba(0, 0, 0, 0.42)',
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      flex: 1,
    },
    sheetContainer: {
      backgroundColor: colors.canvas,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      borderTopWidth: 1,
      borderColor: colors.line,
      maxHeight: '85%',
      minHeight: 380,
      width: '100%',
    },
    header: {
      alignItems: 'center',
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    mascotAndTitle: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    titleColumn: {
      justifyContent: 'center',
    },
    sheetTitle: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sheetSubtitle: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '500',
    },
    closeButton: {
      alignItems: 'center',
      borderRadius: radii.full,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    chipsRow: {
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
      paddingVertical: spacing.xs,
    },
    chipsContent: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    chip: {
      backgroundColor: colors.white,
      borderColor: colors.line,
      borderRadius: radii.full,
      borderWidth: 1,
      minHeight: 32,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    chipPressed: {
      backgroundColor: colors.primaryTint,
      borderColor: colors.primary,
    },
    chipText: {
      color: colors.ink,
      fontSize: 12,
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
      backgroundColor: colors.primaryDark,
      borderBottomRightRadius: spacing.xs,
    },
    assistantBubble: {
      backgroundColor: colors.white,
      borderBottomLeftRadius: spacing.xs,
      borderColor: colors.line,
      borderWidth: 1,
    },
    thinkingBubble: {
      alignItems: 'center',
      flexDirection: 'row',
    },
    messageText: {
      fontSize: 14,
      lineHeight: 20,
    },
    userMessageText: {
      color: colors.white,
      fontWeight: '500',
    },
    assistantMessageText: {
      color: colors.ink,
      fontWeight: '400',
    },
    thinkingText: {
      color: colors.muted,
      fontStyle: 'italic',
    },
    doseCard: {
      backgroundColor: colors.white,
      borderColor: colors.primaryTint,
      borderRadius: radii.md,
      borderWidth: 1.5,
      marginTop: spacing.xs,
      padding: spacing.sm,
    },
    doseCardHeader: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    dosePillIcon: {
      alignItems: 'center',
      backgroundColor: colors.primaryTint,
      borderRadius: radii.full,
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    doseCardTextGroup: {
      flex: 1,
    },
    doseCardPatient: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    doseCardMedication: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: '800',
    },
    doseCardTime: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 1,
    },
    doseCardActions: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    recordTakenButton: {
      alignItems: 'center',
      backgroundColor: colors.primaryDark,
      borderRadius: radii.sm,
      flexDirection: 'row',
      gap: 4,
      justifyContent: 'center',
      minHeight: 36,
      paddingHorizontal: spacing.sm,
    },
    recordTakenText: {
      color: colors.white,
      fontSize: 12,
      fontWeight: '700',
    },
    viewTodayButton: {
      alignItems: 'center',
      backgroundColor: colors.canvas,
      borderColor: colors.line,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      justifyContent: 'center',
      minHeight: 36,
      paddingHorizontal: spacing.sm,
    },
    viewTodayText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: '600',
    },
    inputContainer: {
      alignItems: 'center',
      borderTopColor: colors.line,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    textInput: {
      backgroundColor: colors.white,
      borderColor: colors.line,
      borderRadius: radii.full,
      borderWidth: 1,
      color: colors.ink,
      flex: 1,
      fontSize: 14,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    sendButton: {
      alignItems: 'center',
      backgroundColor: colors.primaryDark,
      borderRadius: radii.full,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    sendButtonDisabled: {
      backgroundColor: colors.line,
    },
    buttonPressed: {
      opacity: 0.8,
    },
  });
