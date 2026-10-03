import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest, errorMessage } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { SyncNotice } from '../../components/SyncNotice';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { AssistantMascot, type MascotExpression } from '../assistant/AssistantMascot';
import { useAuth } from '../auth/AuthProvider';
import { CareCircleSection } from '../invitations/CareCircleSection';
import { InvitationInbox } from '../invitations/InvitationInbox';
import { MedicationEditorModal } from '../medications/MedicationEditorModal';
import { MedicationPhotoImport } from '../medications/MedicationPhotoImport';
import type { Medication, MedicationInput, MedicationOcrDraft } from '../medications/types';
import type { LucideIconName } from '@react-native-vector-icons/lucide';
import type { CopyKey } from '../settings/translations';
import { CareHeader } from './CareHeader';
import { AdherenceProgressRing } from './AdherenceProgressRing';
import { CareStreakBadge } from './CareStreakBadge';
import { addLocalDays, computeCareStreak, findPlanHorizon, type HistoryDay } from './careInsights';
import { NextDueCard } from './NextDueCard';
import { RefillHorizonCard } from './RefillHorizonCard';
import { CreatePatientModal } from '../patients/CreatePatientModal';
import { PatientSwitcher } from '../patients/PatientSwitcher';
import { usePatient } from '../patients/PatientProvider';
import { usePatientDisplay } from '../patients/usePatientDisplay';
import { useLocale } from '../settings/LocaleProvider';
import { actionableAt, manilaDate, type DoseOccurrence, type TimelineResponse } from '../today/types';

type Props = {
  onOpenAssistant?: () => void;
  onOpenMedicines: () => void;
  onOpenSettings: () => void;
  onOpenToday: () => void;
};

function friendlyTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

function generateUuid() {
  const random = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Number.parseInt(random(), 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function isHandled(dose: DoseOccurrence) {
  return dose.status === 'taken' || dose.status === 'skipped';
}

function getManilaTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const hour = hourPart ? parseInt(hourPart, 10) : parseInt(formatter.format(date), 10);
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  } catch {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  }
}

export function HomeScreen({ onOpenAssistant, onOpenMedicines, onOpenSettings, onOpenToday }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { fontScale } = useWindowDimensions();
  const [isSwitcherVisible, setSwitcherVisible] = useState(false);
  const [isCreatorVisible, setCreatorVisible] = useState(false);
  const [isScanRxModalVisible, setScanRxModalVisible] = useState(false);
  const [isMedicationEditorVisible, setMedicationEditorVisible] = useState(false);
  const [importDraft, setImportDraft] = useState<MedicationOcrDraft | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const queryClient = useQueryClient();
  const { session, token } = useAuth();
  const {
    activePatient,
    createPatient,
    dataUpdatedAt,
    error: patientError,
    isCreating,
    patients,
    retry: retryPatients,
    selectPatient,
  } = usePatient();
  const { name: patientName, showSelector, showCareCircle, isSelf } = usePatientDisplay(activePatient);
  const now = useCurrentTime();
  const date = manilaDate(now);
  const timelineQuery = useQuery({
    queryKey: ['today', activePatient?.id, date],
    enabled: Boolean(activePatient),
    queryFn: () => apiRequest<TimelineResponse>(`/patients/${activePatient!.id}/today?date=${date}`, { token }),
  });
  // Same key and range as HistoryPanel so the 7-day history is fetched once and shared.
  const historyThrough = addLocalDays(date, -1);
  const historyQuery = useQuery({
    queryKey: ['history', activePatient?.id, historyThrough],
    enabled: Boolean(activePatient),
    queryFn: () =>
      apiRequest<{ history: HistoryDay[] }>(
        `/patients/${activePatient!.id}/history?through=${historyThrough}&days=7`,
        { token },
      ),
  });
  const medicationsQuery = useQuery({
    queryKey: ['medications', activePatient?.id],
    enabled: Boolean(activePatient),
    queryFn: () => apiRequest<{ medications: Medication[] }>(`/patients/${activePatient!.id}/medications`, { token }),
  });

  const saveMedicationMutation = useMutation({
    mutationFn: (input: MedicationInput) =>
      apiRequest(`/patients/${activePatient!.id}/medications`, {
        method: 'POST',
        token,
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['today', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['timeline', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['medications', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['reminders', activePatient?.id] });
      void timelineQuery.refetch();
    },
  });

  const takeDoseMutation = useMutation({
    mutationFn: (dose: DoseOccurrence) =>
      apiRequest(`/patients/${activePatient!.id}/doses/${dose.id}/events`, {
        method: 'POST',
        token,
        body: {
          kind: 'taken',
          clientActionId: generateUuid(),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['today', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['timeline', activePatient?.id] });
      void queryClient.invalidateQueries({ queryKey: ['history', activePatient?.id] });
      void timelineQuery.refetch();
    },
  });

  const handleTakeDose = (dose: DoseOccurrence) => {
    takeDoseMutation.mutate(dose);
  };

  // Living dashboard animation states
  const beaconAnim = useRef(new Animated.Value(0.4)).current;
  const bubbleScaleAnim = useRef(new Animated.Value(0.95)).current;
  const bubbleOpacityAnim = useRef(new Animated.Value(0)).current;
  const pillScaleAnim = useRef(new Animated.Value(1)).current;

  // Spring press animations for the six quick-action squircles (Emil Kowalski: scale 0.96)
  const tileScales = useRef(Array.from({ length: 6 }, () => new Animated.Value(1))).current;

  const animatePressIn = (val: Animated.Value) => {
    Animated.timing(val, {
      duration: 100,
      easing: Easing.out(Easing.quad),
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const animatePressOut = (val: Animated.Value) => {
    Animated.spring(val, {
      tension: 140,
      friction: 7,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  // Continuous gentle beacon pulse for Bantay
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beaconAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(beaconAnim, {
          toValue: 0.4,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beaconAnim]);

  // Entrance animation for speech bubble (Emil Kowalski: sub-300ms ease-out, scale 0.95 -> 1.0)
  useEffect(() => {
    Animated.parallel([
      Animated.timing(bubbleOpacityAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(bubbleScaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 130,
        useNativeDriver: true,
      }),
    ]).start();
  }, [bubbleOpacityAnim, bubbleScaleAnim]);

  const formattedDateCaption = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag, {
        timeZone: 'Asia/Manila',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
        .format(now)
        .toUpperCase(),
    [localeTag, now],
  );

  const timeOfDay = getManilaTimeOfDay(now);
  const caregiverName = session?.displayName?.trim().split(/\s+/)[0] || 'Caregiver';
  const greetingText = t(
    timeOfDay === 'morning'
      ? 'home.greetingMorning'
      : timeOfDay === 'afternoon'
        ? 'home.greetingAfternoon'
        : 'home.greetingEvening',
    { name: caregiverName },
  );

  if (!activePatient) return null;

  const timeline = timelineQuery.data?.timeline ?? [];
  const handled = timeline.filter(isHandled).length;
  const progress = timeline.length ? Math.round((handled / timeline.length) * 100) : 0;
  const currentTime = now.getTime();
  const attention = timeline.filter((dose) => !isHandled(dose) && new Date(actionableAt(dose)).getTime() <= currentTime);
  const nextDose =
    timeline
      .filter((dose) => !isHandled(dose) && new Date(actionableAt(dose)).getTime() > currentTime)
      .sort((left, right) => new Date(actionableAt(left)).getTime() - new Date(actionableAt(right)).getTime())[0] ??
    null;

  const allHandled = timeline.length > 0 && handled === timeline.length;
  const bannerExpression: MascotExpression = allHandled ? 'celebration' : 'idle';
  const careStreak = computeCareStreak([...(historyQuery.data?.history ?? []), { date, timeline }], date);
  const planHorizon = findPlanHorizon(medicationsQuery.data?.medications ?? [], date);

  const openCareCircle = () => scrollRef.current?.scrollToEnd({ animated: true });
  const openMedicationEditor = () => {
    if (activePatient.canManageMedications) {
      setImportDraft(null);
      setMedicationEditorVisible(true);
    } else {
      onOpenMedicines();
    }
  };
  const openScanRx = () => {
    if (activePatient.canManageMedications) {
      setScanRxModalVisible(true);
    } else {
      onOpenMedicines();
    }
  };
  const quickActions: Array<{
    key: string;
    label: CopyKey;
    a11yLabel: CopyKey;
    hint: CopyKey;
    icon: LucideIconName;
    iconColor: string;
    tint: string;
    onPress: () => void;
  }> = [
    { key: 'log', label: 'home.tileLogDose', a11yLabel: 'home.actionLogDose', hint: 'home.actionLogDoseHint', icon: 'circle-check', iconColor: colors.successDark, tint: colors.successTint, onPress: onOpenToday },
    { key: 'add', label: 'home.tileAddMedicine', a11yLabel: 'home.actionAddMedicine', hint: 'home.actionAddMedicineHint', icon: 'plus', iconColor: colors.primaryDark, tint: colors.primaryTint, onPress: openMedicationEditor },
    { key: 'scan', label: 'home.tileScanRx', a11yLabel: 'home.actionScanRx', hint: 'home.actionScanRxHint', icon: 'camera', iconColor: colors.warning, tint: colors.warningTint, onPress: openScanRx },
    { key: 'ask', label: 'home.actionAskBantay', a11yLabel: 'home.actionAskBantay', hint: 'home.actionAskBantayHint', icon: 'message-circle', iconColor: colors.flame, tint: colors.sunTint, onPress: () => onOpenAssistant?.() },
    { key: 'medicines', label: 'home.actionMedicines', a11yLabel: 'home.actionMedicines', hint: 'home.actionMedicinesHint', icon: 'pill', iconColor: colors.ink, tint: colors.mist, onPress: onOpenMedicines },
    ...(showCareCircle ? [{ key: 'circle', label: 'home.actionCareCircle' as const, a11yLabel: 'home.actionCareCircle' as const, hint: 'home.actionCareCircleHint' as const, icon: 'users' as const, iconColor: colors.ink, tint: colors.mist, onPress: openCareCircle }] : []),
  ];

  const bannerStatusText = allHandled
    ? t(isSelf ? 'shell.bannerAllDoneSelf' : 'home.bannerAllDone', { patient: patientName })
    : attention.length > 0
      ? t(isSelf ? (attention.length === 1 ? 'shell.bannerReviewSelf' : 'shell.bannerManyReviewSelf') : (attention.length === 1 ? 'home.bannerReview' : 'home.bannerManyReview'), {
          count: attention.length,
          patient: patientName,
        })
      : nextDose
        ? t(isSelf ? 'shell.bannerNextDoseSelf' : 'home.bannerNextDose', {
            medicine: nextDose.medicationName,
            dose: `${nextDose.doseQuantity} ${nextDose.doseUnit}`,
            time: friendlyTime(actionableAt(nextDose), localeTag),
            patient: patientName,
          })
        : t('home.bannerTip');

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
      >
        <View style={styles.contentColumn}>
          {/* Top Header Bar */}
          <CareHeader
            accountName={session?.displayName}
            activePatient={activePatient}
            onOpenCareCircle={showCareCircle ? openCareCircle : undefined}
            onOpenSettings={onOpenSettings}
          />

          <SyncNotice error={patientError} onRetry={retryPatients} updatedAt={dataUpdatedAt} />

          <InvitationInbox />

          {/* Greeting section & patient switcher pill */}
          <View style={styles.greetingSection}>
            <Text style={styles.dateCaption}>{formattedDateCaption}</Text>
            <Text accessibilityRole="header" style={styles.greetingTitle}>
              {greetingText}
            </Text>
            {showSelector ? <Pressable
              accessibilityHint={t('care.patientHint')}
              accessibilityLabel={isSelf ? t('shell.caringForSelfPillA11y') : t('home.caringForPillA11y', { patient: patientName })}
              accessibilityRole="button"
              onPress={() => setSwitcherVisible(true)}
              onPressIn={() => animatePressIn(pillScaleAnim)}
              onPressOut={() => animatePressOut(pillScaleAnim)}
            >
              <Animated.View style={[styles.caringForPill, { transform: [{ scale: pillScaleAnim }] }]}>
                <Text numberOfLines={1} style={styles.caringForPillText}>
                  {isSelf ? t('shell.caringForSelfPill') : t('home.caringForPill', { patient: patientName })}
                </Text>
              </Animated.View>
            </Pressable> : null}
          </View>

          {/* Companion Hero Card: Forest-tinted Card with Peeking Bust & Speech Bubble */}
          <Pressable
            accessibilityHint={t('home.bannerHint')}
            accessibilityLabel={t('home.bannerA11y', { status: bannerStatusText })}
            accessibilityRole="button"
            onPress={() => onOpenAssistant?.()}
            style={({ pressed }) => [styles.mascotBanner, pressed && styles.mascotBannerPressed]}
          >
            <View style={styles.mascotWrap}>
              <View style={styles.mascotAuraGlow} />
              <AssistantMascot
                accessible={false}
                expression={bannerExpression}
                onPress={() => onOpenAssistant?.()}
                size={88}
                variant="bust"
              />
            </View>
            <Animated.View
              style={[
                styles.speechBubble,
                {
                  opacity: bubbleOpacityAnim,
                  transform: [{ scale: bubbleScaleAnim }],
                },
              ]}
            >
              <View style={styles.speechBubbleTail} />
              <View style={styles.speechBubbleHeaderRow}>
                <View style={styles.mascotStatusRow}>
                  <Animated.View
                    style={[
                      styles.beaconDot,
                      {
                        opacity: beaconAnim,
                        transform: [
                          {
                            scale: beaconAnim.interpolate({
                              inputRange: [0.4, 1],
                              outputRange: [0.85, 1.25],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  <Text style={styles.speechBubbleHeader}>{t('home.bannerHeader')}</Text>
                </View>
                <View style={styles.speechBubblePromptBadge}>
                  <AppIcon color={colors.successDark} name="message-circle" size={13} />
                  <AppIcon color={colors.muted} name="chevron-right" size={13} />
                </View>
              </View>
              <Text numberOfLines={3} style={styles.speechBubbleText}>
                {bannerStatusText}
              </Text>
            </Animated.View>
          </Pressable>

          {/* Quick Actions: 6 Squircles in a 3x2 grid */}
          <View style={styles.quickActionsSection}>
            <Text accessibilityRole="header" style={styles.quickActionsTitle}>
              {t('home.quickActionsTitle')}
            </Text>
            <View style={styles.quickActionsList}>
              {quickActions.map((action, index) => (
                <Pressable
                  accessibilityHint={t(action.hint)}
                  accessibilityLabel={t(action.a11yLabel)}
                  accessibilityRole="button"
                  key={action.key}
                  onPress={action.onPress}
                  onPressIn={() => animatePressIn(tileScales[index])}
                  onPressOut={() => animatePressOut(tileScales[index])}
                  style={styles.quickActionTilePressable}
                >
                  <Animated.View style={[styles.quickActionTile, { transform: [{ scale: tileScales[index] }] }]}>
                    <View style={[styles.quickActionIconWrap, { backgroundColor: action.tint }]}>
                      <AppIcon color={action.iconColor} name={action.icon} size={22} />
                    </View>
                    <Text numberOfLines={2} style={styles.quickActionLabel}>
                      {t(action.label)}
                    </Text>
                  </Animated.View>
                </Pressable>
              ))}
            </View>
          </View>

          {timelineQuery.isLoading && !timelineQuery.data ? (
            <View accessibilityLabel={t('home.loading')} accessible style={styles.summarySkeleton} />
          ) : timelineQuery.error && !timelineQuery.data ? (
            <View style={styles.errorBox}>
              <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
                {errorMessage(timelineQuery.error)}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => void timelineQuery.refetch()} style={styles.retry}>
                <Text style={styles.retryLabel}>{t('app.retry')}</Text>
              </Pressable>
            </View>
          ) : timeline.length === 0 ? (
            <>
              <SyncNotice
                error={timelineQuery.error}
                onRetry={() => void timelineQuery.refetch()}
                updatedAt={timelineQuery.dataUpdatedAt}
              />
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <AppIcon color={colors.ink} name="pill" size={24} />
                </View>
                <View style={styles.emptyCopy}>
                  <Text accessibilityRole="header" style={styles.emptyTitle}>
                    {isSelf ? t('shell.noConfirmedSelf') : t('home.noConfirmedFor', { patient: patientName })}
                  </Text>
                  <Text style={styles.emptyBody}>
                    {t(activePatient.canManageMedications ? 'home.emptyManagerBody' : 'home.emptyViewerBody')}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={t(
                    activePatient.canManageMedications ? 'home.manageMedicines' : 'home.viewMedicines',
                  )}
                  accessibilityRole="button"
                  onPress={onOpenMedicines}
                  style={({ pressed }) => [styles.emptyAction, pressed && styles.primaryActionPressed]}
                >
                  <AppIcon color={colors.white} name="pill" size={20} />
                  <Text style={styles.primaryActionLabel}>
                    {t(activePatient.canManageMedications ? 'home.manageMedicines' : 'home.viewMedicines')}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <SyncNotice
                error={timelineQuery.error}
                onRetry={() => void timelineQuery.refetch()}
                updatedAt={timelineQuery.dataUpdatedAt}
              />

              {/* Two-Column Bento Grid */}
              <View style={styles.bentoGrid}>
                {/* Left Card: Circular SVG Adherence Progress Ring */}
                <AdherenceProgressRing
                  handled={handled}
                  onPress={onOpenToday}
                  percentage={progress}
                  total={timeline.length}
                />

                {/* Right Card: Next Due Dose Card with 1-Tap Take Action */}
                <NextDueCard
                  allHandled={allHandled}
                  attention={attention}
                  isTaking={takeDoseMutation.isPending}
                  nextDose={nextDose}
                  onOpenMedicines={onOpenMedicines}
                  onOpenToday={onOpenToday}
                  onTakeDose={handleTakeDose}
                />
              </View>

              {/* Bento Row 2: Care Streak + Plan Horizon (horizon only when a schedule has an end date) */}
              <View style={[styles.bentoGrid, fontScale > 1.3 && styles.bentoGridStacked]}>
                <View style={fontScale > 1.3 ? styles.bentoCellStacked : styles.bentoCell}>
                  <CareStreakBadge onPress={onOpenToday} streakDays={careStreak} />
                </View>
                {planHorizon ? (
                  <View style={fontScale > 1.3 ? styles.bentoCellStacked : styles.bentoCell}>
                    <RefillHorizonCard
                      daysRemaining={planHorizon.daysRemaining}
                      dosageText={t('home.horizonEnds', {
                        date: new Intl.DateTimeFormat(localeTag, {
                          month: 'short',
                          day: 'numeric',
                          timeZone: 'UTC',
                        }).format(new Date(`${planHorizon.endOn}T00:00:00Z`)),
                      })}
                      medicationName={planHorizon.medication.displayName}
                      onRefillPress={onOpenMedicines}
                    />
                  </View>
                ) : null}
              </View>

              {/* Unified Today Schedule Container */}
              <View style={styles.scheduleCard}>
                <View style={styles.scheduleHeader}>
                  <View style={styles.scheduleTitleRow}>
                    <Text accessibilityRole="header" style={styles.scheduleTitle}>
                      {t('home.scheduleTitle')}
                    </Text>
                    <View style={styles.scheduleCountBadge}>
                      <Text style={styles.scheduleCountText}>
                        {t('home.doseRatio', { handled, total: timeline.length })}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityLabel={t(attention.length ? 'home.checkToday' : 'home.openToday')}
                    accessibilityRole="button"
                    onPress={onOpenToday}
                    style={styles.scheduleViewAllButton}
                  >
                    <Text style={styles.scheduleViewAllText}>{t('home.viewAll')}</Text>
                  </Pressable>
                </View>

                <View style={styles.scheduleList}>
                  {timeline.map((dose, index) => {
                    const isLast = index === timeline.length - 1;
                    const taken = dose.status === 'taken';
                    const skipped = dose.status === 'skipped';
                    const isOverdue =
                      !isHandled(dose) && new Date(actionableAt(dose)).getTime() <= currentTime;

                    return (
                      <View key={dose.id} style={[styles.doseRow, isLast && styles.doseRowLast]}>
                        {/* Time Badge Pill */}
                        <View style={[styles.doseTimePill, isOverdue && styles.doseTimePillOverdue]}>
                          <Text
                            style={[
                              styles.doseTimeText,
                              isOverdue && styles.doseTimeTextOverdue,
                            ]}
                          >
                            {friendlyTime(actionableAt(dose), localeTag)}
                          </Text>
                        </View>

                        {/* Medicine Details */}
                        <View style={styles.doseInfo}>
                          <Text numberOfLines={1} style={styles.doseMedName}>
                            {dose.medicationName}
                          </Text>
                          <Text numberOfLines={1} style={styles.doseStrength}>
                            {dose.doseQuantity} {dose.doseUnit}
                            {dose.strengthValue && dose.strengthUnit
                              ? ` · ${dose.strengthValue} ${dose.strengthUnit}`
                              : ''}
                            {isOverdue ? ' · Overdue' : ''}
                          </Text>
                        </View>

                        {/* Action or Checkmark Status */}
                        {taken ? (
                          <View style={styles.doseTakenBadge}>
                            <AppIcon color={colors.successDark} name="circle-check" size={20} />
                          </View>
                        ) : skipped ? (
                          <View style={styles.doseSkippedBadge}>
                            <AppIcon color={colors.muted} name="minus-circle" size={20} />
                          </View>
                        ) : (
                          <Pressable
                            accessibilityLabel={`Take ${dose.medicationName}`}
                            accessibilityRole="button"
                            disabled={takeDoseMutation.isPending}
                            onPress={() => handleTakeDose(dose)}
                            style={({ pressed }) => [
                              styles.doseTakeButton,
                              isOverdue && styles.doseTakeButtonOverdue,
                              pressed && styles.doseTakeButtonPressed,
                            ]}
                          >
                            <AppIcon color={colors.white} name="check" size={14} />
                            <Text style={styles.doseTakeButtonText}>{t('home.takeNow')}</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Bottom Quick Action Navigation Links */}
              <View style={[styles.actions, fontScale > 1.3 && styles.actionsLarge]}>
                <Pressable
                  accessibilityLabel={t(attention.length ? 'home.checkToday' : 'home.openToday')}
                  accessibilityRole="button"
                  onPress={onOpenToday}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    fontScale > 1.3 && styles.actionLarge,
                    pressed && styles.primaryActionPressed,
                  ]}
                >
                  <AppIcon color={colors.white} name="calendar-days" size={19} />
                  <Text style={styles.primaryActionLabel}>
                    {t(attention.length ? 'home.checkToday' : 'home.openToday')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={t(
                    activePatient.canManageMedications ? 'home.manageMedicines' : 'home.viewMedicines',
                  )}
                  accessibilityRole="button"
                  onPress={onOpenMedicines}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    fontScale > 1.3 && styles.actionLarge,
                    pressed && styles.secondaryActionPressed,
                  ]}
                >
                  <AppIcon color={colors.ink} name="pill" size={19} />
                  <Text style={styles.secondaryActionLabel}>
                    {t(activePatient.canManageMedications ? 'home.manageMedicines' : 'home.viewMedicines')}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {showCareCircle ? <CareCircleSection patient={activePatient} /> : null}
        </View>
      </ScrollView>

      {showSelector ? <PatientSwitcher
        activePatientId={activePatient.id}
        onAddPerson={() => setCreatorVisible(true)}
        onClose={() => setSwitcherVisible(false)}
        onSelect={selectPatient}
        patients={patients}
        visible={isSwitcherVisible}
      /> : null}
      <CreatePatientModal
        isCreating={isCreating}
        onClose={() => setCreatorVisible(false)}
        onCreate={createPatient}
        visible={isCreatorVisible}
      />

      {/* Scan Rx Modal */}
      <Modal
        animationType="slide"
        onRequestClose={() => setScanRxModalVisible(false)}
        transparent
        visible={isScanRxModalVisible}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityLabel={t('home.scanRxClose')}
            accessibilityRole="button"
            onPress={() => setScanRxModalVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.scanModalContainer}>
            <View style={styles.scanModalHeader}>
              <Text accessibilityRole="header" style={styles.scanModalTitle}>
                {t('home.scanRxTitle')}
              </Text>
              <Pressable
                accessibilityLabel={t('home.scanRxClose')}
                accessibilityRole="button"
                onPress={() => setScanRxModalVisible(false)}
                style={({ pressed }) => [styles.modalCloseButton, pressed && styles.modalCloseButtonPressed]}
              >
                <AppIcon color={colors.ink} name="x" size={20} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.scanModalBody}>
              <MedicationPhotoImport
                initialExpanded
                onReview={(draft) => {
                  setScanRxModalVisible(false);
                  setImportDraft(draft);
                  setMedicationEditorVisible(true);
                }}
                patient={activePatient}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Medication Editor Modal */}
      {activePatient && isMedicationEditorVisible ? (
        <MedicationEditorModal
          draft={importDraft}
          medication={null}
          onClose={() => {
            setMedicationEditorVisible(false);
            setImportDraft(null);
          }}
          onSave={async (input) => {
            await saveMedicationMutation.mutateAsync(input);
            setMedicationEditorVisible(false);
            setImportDraft(null);
          }}
          patient={activePatient}
          visible={isMedicationEditorVisible}
        />
      ) : null}
    </>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    screen: {
      flexGrow: 1,
      paddingBottom: 110,
      paddingHorizontal: 20,
      paddingTop: spacing.sm,
      backgroundColor: colors.canvas,
    },
    contentColumn: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      gap: spacing.lg,
    },
    greetingSection: {
      gap: 4,
    },
    dateCaption: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    greetingTitle: {
      color: colors.ink,
      fontSize: 26,
      fontWeight: '900',
      letterSpacing: -0.6,
    },
    caringForPill: {
      minHeight: 48,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.white,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginTop: 4,
    },
    caringForPillPressed: {
      backgroundColor: colors.mist,
      opacity: 0.85,
    },
    caringForPillText: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: '800',
    },
    mascotBanner: {
      minHeight: 114,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.successDark,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.06)',
    },
    mascotBannerPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.99 }],
    },
    mascotWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    mascotAuraGlow: {
      position: 'absolute',
      width: 72,
      height: 72,
      borderRadius: radii.full,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    speechBubble: {
      flex: 1,
      backgroundColor: colors.white,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 3,
      position: 'relative',
    },
    speechBubbleTail: {
      position: 'absolute',
      left: -5,
      top: '50%',
      marginTop: -5,
      width: 10,
      height: 10,
      backgroundColor: colors.white,
      transform: [{ rotate: '45deg' }],
    },
    speechBubbleHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    mascotStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    beaconDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.sun,
    },
    speechBubbleHeader: {
      color: colors.successDark,
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: -0.2,
    },
    speechBubblePromptBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    speechBubbleText: {
      color: colors.ink,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    quickActionsSection: {
      gap: 10,
    },
    quickActionsTitle: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    quickActionsList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      paddingVertical: 2,
    },
    quickActionTilePressable: {
      flexBasis: '30%',
      flexGrow: 1,
      minWidth: 88,
    },
    quickActionTile: {
      flex: 1,
      minHeight: 92,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 8,
      paddingVertical: 10,
      gap: 6,
    },
    quickActionTilePressed: {
      backgroundColor: colors.mist,
      opacity: 0.85,
    },
    quickActionIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.successTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionLabel: {
      color: colors.ink,
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'center',
    },
    bentoGrid: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    bentoGridStacked: {
      flexDirection: 'column',
    },
    bentoCell: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,
    },
    bentoCellStacked: {
      width: '100%',
    },
    scheduleCard: {
      backgroundColor: colors.white,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      gap: 12,
    },
    scheduleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    scheduleTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    scheduleTitle: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    scheduleCountBadge: {
      backgroundColor: colors.mist,
      borderRadius: radii.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    scheduleCountText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '700',
    },
    scheduleViewAllButton: {
      paddingVertical: 4,
      paddingHorizontal: 6,
    },
    scheduleViewAllText: {
      color: colors.primaryDark,
      fontSize: 13,
      fontWeight: '700',
    },
    scheduleList: {
      gap: 0,
    },
    doseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      gap: 12,
    },
    doseRowLast: {
      borderBottomWidth: 0,
      paddingBottom: 4,
    },
    doseTimePill: {
      backgroundColor: colors.mist,
      borderRadius: radii.full,
      paddingHorizontal: 8,
      paddingVertical: 4,
      minWidth: 68,
      alignItems: 'center',
    },
    doseTimePillOverdue: {
      backgroundColor: colors.warningTint,
    },
    doseTimeText: {
      color: colors.ink,
      fontSize: 11,
      fontWeight: '800',
    },
    doseTimeTextOverdue: {
      color: colors.warning,
    },
    doseInfo: {
      flex: 1,
      gap: 2,
    },
    doseMedName: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: '800',
    },
    doseStrength: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '500',
    },
    doseTakenBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.successTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doseSkippedBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.mist,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doseTakeButton: {
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: radii.full,
      backgroundColor: colors.successDark,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    doseTakeButtonOverdue: {
      backgroundColor: colors.primary,
    },
    doseTakeButtonPressed: {
      opacity: 0.85,
    },
    doseTakeButtonText: {
      color: colors.white,
      fontSize: 13,
      fontWeight: '800',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    scanModalContainer: {
      backgroundColor: colors.canvas,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      maxHeight: '85%',
      minHeight: 380,
      width: '100%',
    },
    scanModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    scanModalTitle: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    scanModalBody: {
      padding: spacing.md,
    },
    modalCloseButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCloseButtonPressed: {
      opacity: 0.8,
      backgroundColor: colors.mist,
    },
    summarySkeleton: {
      height: 260,
      borderRadius: radii.lg,
      backgroundColor: colors.mist,
    },
    emptyCard: {
      gap: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.white,
      padding: spacing.xl,
    },
    emptyIcon: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor: colors.sun,
    },
    emptyCopy: {
      minWidth: 0,
      gap: spacing.xs,
    },
    emptyTitle: {
      maxWidth: 600,
      color: colors.ink,
      fontSize: 21,
      fontWeight: '900',
      lineHeight: 28,
    },
    emptyBody: {
      maxWidth: 600,
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22,
    },
    emptyAction: {
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.ink,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xs,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    actionsLarge: {
      flexDirection: 'column',
    },
    actionLarge: {
      width: '100%',
      flex: 0,
    },
    primaryAction: {
      minHeight: 52,
      minWidth: 170,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.ink,
      paddingHorizontal: spacing.lg,
    },
    primaryActionPressed: {
      opacity: 0.88,
      backgroundColor: colors.primaryDark,
    },
    primaryActionLabel: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '800',
    },
    secondaryAction: {
      minHeight: 52,
      minWidth: 170,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.md,
      backgroundColor: colors.white,
      paddingHorizontal: spacing.lg,
    },
    secondaryActionPressed: {
      backgroundColor: colors.mist,
    },
    secondaryActionLabel: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: '800',
    },
    errorBox: {
      gap: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.errorTint,
      padding: spacing.md,
    },
    errorText: {
      color: colors.error,
      fontSize: 14,
      lineHeight: 20,
    },
    retry: {
      minHeight: 48,
      alignSelf: 'flex-start',
      justifyContent: 'center',
    },
    retryLabel: {
      color: colors.error,
      fontSize: 14,
      fontWeight: '800',
    },
  });
