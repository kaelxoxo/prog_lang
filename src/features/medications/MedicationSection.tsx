import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  type GestureResponderEvent,
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

import { AppIcon } from '../../components/AppIcon';
import { apiRequest, errorMessage } from '../../lib/api';
import { SyncNotice } from '../../components/SyncNotice';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { useLocale } from '../settings/LocaleProvider';
import { MedicationEditorModal } from './MedicationEditorModal';
import { MedicationPhotoImport } from './MedicationPhotoImport';
import type { Medication, MedicationInput, MedicationOcrDraft, MedicationSchedule } from './types';

type Props = { patient: Patient };
type ListResponse = { medications: Medication[] };
type SaveResponse = { medicationId: string; versionId: string };
type Notice = { message: string; medicationId?: string; canUndo?: boolean };

type Translator = ReturnType<typeof useLocale>['t'];

function friendlyTime(value: string, locale: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function scheduleSummary(schedules: MedicationSchedule[], locale: string, t: Translator) {
  const first = schedules[0];
  if (!first) return t('medicine.noSchedule');
  const days = first.weekdays.length === 7 ? t('medicine.everyDay') : t('medicine.daysEachWeek', { count: first.weekdays.length });
  if (first.kind === 'interval') return t('medicine.intervalSchedule', { hours: first.intervalHours ?? '', time: friendlyTime(first.timeOfDay, locale), days });
  if (first.kind === 'meal') return t('medicine.mealSchedule', { relation: t(first.mealRelation === 'after' ? 'medicine.after' : 'medicine.before'), days });
  return t('medicine.exactSchedule', { times: schedules.map((schedule) => friendlyTime(schedule.timeOfDay, locale)).join(', '), days });
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

export function MedicationSection({ patient }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['medications', patient.id] as const;
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [importDraft, setImportDraft] = useState<MedicationOcrDraft | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    setNotice(null);
    setHighlightedId(null);
    setSearch('');
    setShowArchived(false);
    setImportDraft(null);
  }, [patient.id]);

  useEffect(() => {
    if (!highlightedId) return;
    const timeout = setTimeout(() => setHighlightedId(null), 5000);
    return () => clearTimeout(timeout);
  }, [highlightedId]);

  const medicationQuery = useQuery({
    queryKey,
    queryFn: () => apiRequest<ListResponse>(`/patients/${patient.id}/medications`, { token }),
  });
  const archivedQuery = useQuery({
    queryKey: ['medications', patient.id, 'archived'],
    queryFn: () => apiRequest<ListResponse>(`/patients/${patient.id}/medications?status=archived`, { token }),
  });
  const saveMutation = useMutation({
    mutationFn: ({ input, medication }: { input: MedicationInput; medication: Medication | null }) =>
      apiRequest<SaveResponse>(
        medication ? `/patients/${patient.id}/medications/${medication.id}/revisions` : `/patients/${patient.id}/medications`,
        { method: 'POST', token, body: input },
      ),
    onSuccess: (result, variables) => {
      setHighlightedId(result.medicationId);
      setNotice({ message: t(variables.medication ? 'medicine.updatedNotice' : 'medicine.confirmedNotice', { medicine: variables.input.displayName, patient: patient.displayName }) });
      void queryClient.invalidateQueries({ queryKey: ['today', patient.id] });
      void queryClient.invalidateQueries({ queryKey: ['reminders', patient.id] });
      return queryClient.invalidateQueries({ queryKey });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (medication: Medication) =>
      apiRequest(`/patients/${patient.id}/medications/${medication.id}/archive`, { method: 'POST', token }).then(() => medication),
    onSuccess: (medication) => {
      setNotice({ message: t('medicine.archivedNotice', { medicine: medication.displayName }), medicationId: medication.id, canUndo: true });
      void queryClient.invalidateQueries({ queryKey: ['today', patient.id] });
      void queryClient.invalidateQueries({ queryKey: ['history', patient.id] });
      void queryClient.invalidateQueries({ queryKey: ['reminders', patient.id] });
      return queryClient.invalidateQueries({ queryKey });
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (medicationId: string) =>
      apiRequest(`/patients/${patient.id}/medications/${medicationId}/restore`, { method: 'POST', token }),
    onSuccess: () => {
      setNotice({ message: t('medicine.restoredNotice', { patient: patient.displayName }) });
      void queryClient.invalidateQueries({ queryKey: ['today', patient.id] });
      void queryClient.invalidateQueries({ queryKey: ['history', patient.id] });
      void queryClient.invalidateQueries({ queryKey: ['reminders', patient.id] });
      return queryClient.invalidateQueries({ queryKey });
    },
  });

  const openCreate = () => {
    setNotice(null);
    setEditingMedication(null);
    setImportDraft(null);
    setEditorVisible(true);
  };

  const openEdit = (medication: Medication) => {
    setNotice(null);
    setEditingMedication(medication);
    setImportDraft(null);
    setEditorVisible(true);
  };

  const reviewImport = (draft: MedicationOcrDraft) => {
    setNotice(null);
    setEditingMedication(null);
    setImportDraft(draft);
    setEditorVisible(true);
  };

  const confirmArchive = (medication: Medication) => {
    Alert.alert(
      t('medicine.archiveTitle', { medicine: medication.displayName }),
      t('medicine.archiveBody', { patient: patient.displayName }),
      [
        { text: t('medicine.keep'), style: 'cancel' },
        { text: t('medicine.archive'), style: 'destructive', onPress: () => archiveMutation.mutate(medication) },
      ],
    );
  };

  const medications = medicationQuery.data?.medications ?? [];
  const archivedMedications = archivedQuery.data?.medications ?? [];
  const visibleMedications = medications.filter((medication) =>
    medication.displayName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <View style={styles.section}>
      {/* Editorial Header Row: Title & Subtitle + 48dp "+ Add Medicine" CTA */}
      <View style={[styles.headingRow, largeText && styles.headingRowLarge]}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.title}>{t('medicine.title')}</Text>
          <Text style={styles.subtitle}>{t('medicine.subtitle', { patient: patient.displayName })}</Text>
        </View>
        {patient.canManageMedications ? (
          <PressableScale
            accessibilityLabel={t('medicine.add')}
            accessibilityRole="button"
            onPress={openCreate}
            style={[styles.addButton, largeText && styles.addButtonLarge]}
          >
            <View style={styles.addButtonInner}>
              <AppIcon color={colors.white} name="plus" size={18} />
              <Text style={styles.addButtonLabel}>{t('medicine.add')}</Text>
            </View>
          </PressableScale>
        ) : null}
      </View>

      {patient.canManageMedications ? <MedicationPhotoImport onReview={reviewImport} patient={patient} /> : null}

      {notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <View style={styles.noticeDot} />
          <Text style={styles.noticeText}>{notice.message}</Text>
          {notice.canUndo && notice.medicationId ? (
            <PressableScale
              accessibilityRole="button"
              disabled={restoreMutation.isPending}
              onPress={() => restoreMutation.mutate(notice.medicationId!)}
              style={styles.undoButton}
            >
              <Text style={styles.undoLabel}>{t(restoreMutation.isPending ? 'medicine.restoring' : 'medicine.undo')}</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}

      {/* Styled Search / Filter Input */}
      {medications.length > 2 ? (
        <View style={styles.searchContainer}>
          <AppIcon color={colors.muted} name="search" size={18} />
          <TextInput
            accessibilityLabel={t('medicine.find')}
            onChangeText={setSearch}
            placeholder={t('medicine.find')}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={search}
          />
          {search ? (
            <PressableScale
              accessibilityLabel={t('app.clearSearch')}
              accessibilityRole="button"
              onPress={() => setSearch('')}
              style={styles.clearSearchButton}
            >
              <AppIcon color={colors.muted} name="x" size={16} />
            </PressableScale>
          ) : null}
        </View>
      ) : null}

      {medicationQuery.isLoading && !medicationQuery.data ? (
        <View style={styles.stateRow}><Text style={styles.stateText}>{t('medicine.loading')}</Text></View>
      ) : medicationQuery.error && !medicationQuery.data ? (
        <View style={styles.errorBox}>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage(medicationQuery.error)}</Text>
          <PressableScale accessibilityRole="button" onPress={() => void medicationQuery.refetch()} style={styles.retryButton}>
            <Text style={styles.retryLabel}>{t('app.retry')}</Text>
          </PressableScale>
        </View>
      ) : medications.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><AppIcon color={colors.ink} name="pill" size={24} /></View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>{t(archivedMedications.length ? 'medicine.noActive' : 'medicine.noConfirmed')}</Text>
            <Text style={styles.emptyBody}>{archivedMedications.length
              ? t('medicine.archivedEmptyBody')
              : t(patient.canManageMedications ? 'medicine.managerEmptyBody' : 'medicine.viewerEmptyBody')}</Text>
          </View>
        </View>
      ) : (
        <>
        <SyncNotice error={medicationQuery.error} onRetry={() => void medicationQuery.refetch()} updatedAt={medicationQuery.dataUpdatedAt} />

        {/* Streamlined Medication Cards (No card-inside-card clutter, no redundant subheaders) */}
        <View style={styles.list}>
          {visibleMedications.map((medication) => (
            <PressableScale
              accessibilityLabel={`${t('medicine.confirmed')}, ${medication.displayName}, ${medication.doseQuantity} ${medication.doseUnit}${medication.strengthValue ? `, ${medication.strengthValue} ${medication.strengthUnit}` : ''}, ${t('medicine.schedule')}: ${scheduleSummary(medication.schedules, localeTag, t)}`}
              accessibilityRole="button"
              disabled={!patient.canManageMedications}
              key={medication.id}
              onPress={() => patient.canManageMedications && openEdit(medication)}
              style={[
                styles.medicineCard,
                highlightedId === medication.id && styles.medicineCardHighlighted,
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.nameBlock}>
                  <Text numberOfLines={1} style={styles.medicineName}>{medication.displayName}</Text>
                  <Text numberOfLines={1} style={styles.doseStrength}>
                    {medication.doseQuantity} {medication.doseUnit}
                    {medication.strengthValue ? ` · ${medication.strengthValue} ${medication.strengthUnit}` : ''}
                    {medication.medicineForm ? ` · ${medication.medicineForm}` : ''}
                  </Text>
                </View>
                <View style={styles.confirmedBadge}>
                  <AppIcon color={colors.successDark} name="circle-check-big" size={13} />
                  <Text style={styles.confirmedLabel}>{t('medicine.confirmed')}</Text>
                </View>
              </View>

              {/* Sleek Scheduled Times Pill (No nested card-inside-card clutter, no redundant "Schedule" subheader) */}
              <View style={styles.schedulePill}>
                <AppIcon color={colors.primaryDark} name="calendar-days" size={14} />
                <Text numberOfLines={1} style={styles.schedulePillText}>
                  {scheduleSummary(medication.schedules, localeTag, t)}
                </Text>
              </View>

              {(!medication.strengthValue || !medication.medicineForm || !medication.route) ? (
                <View style={styles.missingDetailBox}>
                  <AppIcon color={colors.warning} name="alert-circle" size={14} />
                  <Text style={styles.missingDetail}>{t('medicine.missingDetails')}</Text>
                </View>
              ) : null}

              {/* Action Buttons: Review & Edit and Archive (min 48dp touch targets) */}
              {patient.canManageMedications ? (
                <View style={[styles.rowActions, largeText && styles.rowActionsLarge]}>
                  <PressableScale
                    accessibilityLabel={`${t('medicine.reviewEdit')}: ${medication.displayName}`}
                    accessibilityRole="button"
                    onPress={() => openEdit(medication)}
                    style={[styles.editButton, largeText && styles.rowActionLarge]}
                  >
                    <View style={styles.actionInner}>
                      <AppIcon color={colors.ink} name="pencil" size={15} />
                      <Text style={styles.editLabel}>{t('medicine.reviewEdit')}</Text>
                    </View>
                  </PressableScale>
                  <PressableScale
                    accessibilityLabel={t('medicine.archiveTitle', { medicine: medication.displayName })}
                    accessibilityRole="button"
                    disabled={archiveMutation.isPending}
                    onPress={() => confirmArchive(medication)}
                    style={[styles.archiveButton, largeText && styles.rowActionLarge]}
                  >
                    <View style={styles.actionInner}>
                      <AppIcon color={colors.error} name="archive" size={15} />
                      <Text style={styles.archiveLabel}>{t(archiveMutation.isPending && archiveMutation.variables?.id === medication.id ? 'medicine.archiving' : 'medicine.archive')}</Text>
                    </View>
                  </PressableScale>
                </View>
              ) : null}
            </PressableScale>
          ))}
          {!visibleMedications.length ? <Text style={styles.noResults}>{t('medicine.noResults')}</Text> : null}
        </View>
        </>
      )}

      {/* Archived Medications Section */}
      {archivedMedications.length ? (
        <View style={styles.archivedCard}>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ expanded: showArchived }}
            onPress={() => setShowArchived((current) => !current)}
            style={[styles.archivedToggle, largeText && styles.archivedToggleLarge]}
          >
            <View style={styles.archivedHeading}>
              <View style={styles.archivedTitleRow}>
                <AppIcon color={colors.muted} name="archive" size={17} />
                <Text style={styles.archivedTitle}>{t('medicine.archivedTitle')}</Text>
              </View>
              <Text style={styles.archivedCount}>{t('medicine.retained', { count: archivedMedications.length })}</Text>
            </View>
            <View style={styles.archivedTogglePill}>
              <Text style={styles.archivedToggleLabel}>{t(showArchived ? 'medicine.hide' : 'medicine.show')}</Text>
              <AppIcon color={colors.primaryDark} name={showArchived ? 'chevron-up' : 'chevron-down'} size={15} />
            </View>
          </PressableScale>
          {showArchived ? (
            <View style={styles.archivedList}>
              {archivedMedications.map((medication) => (
                <View key={medication.id} style={styles.archivedRow}>
                  <View style={styles.archivedCopy}>
                    <Text style={styles.archivedName}>{medication.displayName}</Text>
                    <Text style={styles.archivedDose}>{medication.doseQuantity} {medication.doseUnit}</Text>
                    <Text style={styles.archivedNote}>{t('medicine.archivedNote')}</Text>
                  </View>
                  {patient.canManageMedications ? (
                    <PressableScale
                      accessibilityRole="button"
                      disabled={restoreMutation.isPending}
                      onPress={() => restoreMutation.mutate(medication.id)}
                      style={styles.restoreButton}
                    >
                      <Text style={styles.restoreLabel}>{t(restoreMutation.isPending && restoreMutation.variables === medication.id ? 'medicine.restoring' : 'medicine.restore')}</Text>
                    </PressableScale>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {archivedQuery.error ? (
        <View style={styles.errorBox}>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{t('medicine.archivedLoadError')} {errorMessage(archivedQuery.error)}</Text>
          <PressableScale accessibilityRole="button" onPress={() => void archivedQuery.refetch()} style={styles.retryButton}>
            <Text style={styles.retryLabel}>{t('app.retry')}</Text>
          </PressableScale>
        </View>
      ) : null}

      {(archiveMutation.error || restoreMutation.error) ? <Text accessibilityLiveRegion="assertive" style={styles.inlineError}>{errorMessage(archiveMutation.error || restoreMutation.error)}</Text> : null}

      <MedicationEditorModal
        draft={importDraft}
        medication={editingMedication}
        onClose={() => { setEditorVisible(false); setImportDraft(null); }}
        onSave={(input) => saveMutation.mutateAsync({ input, medication: editingMedication })}
        patient={patient}
        visible={editorVisible}
      />
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { gap: spacing.md },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headingRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  headingCopy: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 14 },
  addButton: {
    minHeight: 48,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
  },
  addButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  addButtonLarge: { width: '100%' },
  addButtonLabel: { color: colors.white, fontSize: 14, fontWeight: '800' },
  notice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.successTint, padding: spacing.md },
  noticeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  noticeText: { flex: 1, color: colors.successDark, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  undoButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  undoLabel: { color: colors.successDark, fontSize: 14, fontWeight: '900' },

  // Styled search bar
  searchContainer: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, minHeight: 48, color: colors.ink, fontSize: 15 },
  clearSearchButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },

  stateRow: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: spacing.lg },
  stateText: { color: colors.muted, fontSize: 15 },
  errorBox: { gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  retryLabel: { color: colors.error, fontSize: 14, fontWeight: '800' },

  emptyCard: {
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.xl,
  },
  emptyIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.sun },
  emptyCopy: { flex: 1, gap: spacing.xs },
  emptyTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  emptyBody: { maxWidth: 520, color: colors.muted, fontSize: 14, lineHeight: 21 },

  // Streamlined medication card
  list: { gap: spacing.md },
  medicineCard: {
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    padding: 16,
  },
  medicineCardHighlighted: {
    borderColor: colors.success,
    backgroundColor: colors.successTint,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  nameBlock: { flex: 1, gap: 2 },
  medicineName: { color: colors.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  doseStrength: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  confirmedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    backgroundColor: colors.successTint,
    borderWidth: 1,
    borderColor: colors.successBorder,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  confirmedLabel: { color: colors.successDark, fontSize: 12, fontWeight: '800' },

  // Streamlined scheduled times pill (no card-inside-card clutter)
  schedulePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.full,
    backgroundColor: colors.mist,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  schedulePillText: { color: colors.ink, fontSize: 13, fontWeight: '700' },

  missingDetailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.warningTint,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  missingDetail: { flex: 1, color: colors.warning, fontSize: 12, fontWeight: '600' },

  // 48dp action buttons
  rowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  rowActionsLarge: { flexDirection: 'column' },
  rowActionLarge: { width: '100%', flex: 0 },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  editButton: {
    minHeight: 48,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.full,
    backgroundColor: colors.canvas,
  },
  editLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  archiveButton: {
    minHeight: 48,
    borderRadius: radii.full,
    backgroundColor: colors.mist,
  },
  archiveLabel: { color: colors.error, fontSize: 13, fontWeight: '700' },
  inlineError: { color: colors.error, fontSize: 13, lineHeight: 19 },
  noResults: { color: colors.muted, fontSize: 15, lineHeight: 22, paddingVertical: spacing.xl, textAlign: 'center' },

  archivedCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  archivedToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  archivedToggleLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  archivedHeading: { flex: 1, gap: 2 },
  archivedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  archivedTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  archivedCount: { color: colors.muted, fontSize: 12 },
  archivedTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  archivedToggleLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  archivedList: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.md, paddingTop: spacing.xs },
  archivedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.md },
  archivedCopy: { minWidth: 220, flex: 1, gap: 2 },
  archivedName: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  archivedDose: { color: colors.muted, fontSize: 13 },
  archivedNote: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  restoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.full, paddingHorizontal: spacing.md, backgroundColor: colors.canvas },
  restoreLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
});
