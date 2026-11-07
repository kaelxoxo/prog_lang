import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/PressableScale';
import { apiRequest, errorMessage } from '../../lib/api';
import { SyncNotice } from '../../components/SyncNotice';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { usePatientDisplay } from '../patients/usePatientDisplay';
import { useLocale } from '../settings/LocaleProvider';
import { manilaDate } from '../today/types';
import { MedicationEditorModal } from './MedicationEditorModal';
import { MedicationInventoryModal } from './MedicationInventoryModal';
import { MedicationPhotoImport } from './MedicationPhotoImport';
import { estimateInventoryDaysRemaining, inventoryUnitLabel, normalizeInventoryUnit, supportsInventory } from './inventory';
import type { Medication, MedicationInput, MedicationOcrDraft, MedicationSchedule } from './types';

type Props = { patient: Patient };
type ListResponse = { medications: Medication[] };
type SaveResponse = { medicationId: string; versionId: string };
type Notice = { message: string; medicationId?: string; canUndo?: boolean };

type Translator = ReturnType<typeof useLocale>['t'];

function actionId() {
  const random = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Number.parseInt(random(), 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

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

export function MedicationSection({ patient }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { isSelf } = usePatientDisplay(patient);
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
  const [inventoryMedication, setInventoryMedication] = useState<Medication | null>(null);
  // One idempotency key per distinct save attempt, so retrying after a lost response cannot double-apply a refill.
  const inventoryAttempt = useRef<{ key: string; clientActionId: string } | null>(null);

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
  const inventoryMutation = useMutation({
    mutationFn: ({ medication, kind, quantity, clientActionId }: { medication: Medication; kind: 'count' | 'refill'; quantity: number; clientActionId: string }) =>
      apiRequest(`/patients/${patient.id}/medications/${medication.id}/inventory`, {
        method: 'POST', token, body: { kind, quantity, clientActionId },
      }),
    onSuccess: async () => {
      inventoryAttempt.current = null;
      setInventoryMedication(null);
      await queryClient.invalidateQueries({ queryKey });
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
          <Text style={styles.subtitle}>{isSelf ? t('shell.yourMedicines') : t('medicine.subtitle', { patient: patient.displayName })}</Text>
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
          <AppIcon color={colors.primary} name="pill" size={26} />
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

        {/* Medicines as ruled rows on the paper; the name is each row's one title */}
        <View style={styles.list}>
          {visibleMedications.map((medication) => (
            <View
              key={medication.id}
              style={[
                styles.medicineCard,
                highlightedId === medication.id && styles.medicineCardHighlighted,
              ]}
            >
              <PressableScale
                accessibilityLabel={`${t('medicine.confirmed')}, ${medication.displayName}, ${medication.doseQuantity} ${medication.doseUnit}${medication.strengthValue ? `, ${medication.strengthValue} ${medication.strengthUnit}` : ''}, ${t('medicine.schedule')}: ${scheduleSummary(medication.schedules, localeTag, t)}`}
                accessibilityRole="button"
                disabled={!patient.canManageMedications}
                onPress={() => patient.canManageMedications && openEdit(medication)}
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
                <View style={styles.confirmedMark}>
                  <AppIcon color={colors.ink} name="check" size={14} />
                  <Text style={styles.confirmedLabel}>{t('medicine.confirmed')}</Text>
                </View>
              </View>

              {/* Schedule line */}
              <View style={styles.scheduleRow}>
                <AppIcon color={colors.inkLine} name="calendar-days" size={15} />
                <Text numberOfLines={1} style={styles.scheduleText}>
                  {scheduleSummary(medication.schedules, localeTag, t)}
                </Text>
              </View>
              </PressableScale>

              {supportsInventory(medication) ? (
                <View style={[styles.inventoryRow, largeText && styles.inventoryRowLarge]}>
                  <View style={styles.inventoryCopy}>
                    <Text style={styles.inventoryValue}>
                      {medication.inventory
                        ? t('inventory.onHand', { quantity: medication.inventory.onHandQuantity, unit: inventoryUnitLabel(medication.inventory.unit, medication.inventory.onHandQuantity) })
                        : t('inventory.notRecorded')}
                    </Text>
                    {medication.inventory ? (
                      <Text style={styles.inventoryMeta}>{t('inventory.lastCounted', { date: new Intl.DateTimeFormat(localeTag, { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(medication.inventory.lastCountedAt)) })}</Text>
                    ) : <Text style={styles.inventoryMeta}>{t('inventory.startHint')}</Text>}
                    {medication.inventory && normalizeInventoryUnit(medication.inventory.unit) !== normalizeInventoryUnit(medication.doseUnit) ? (
                      <Text style={styles.inventoryWarning}>{t('inventory.unitChanged')}</Text>
                    ) : medication.inventory && medication.inventory.onHandQuantity < 0 ? (
                      <Text style={styles.inventoryWarning}>{t('inventory.recountWarning')}</Text>
                    ) : medication.inventory ? (
                      <Text style={styles.inventoryMeta}>
                        {(() => {
                          const days = estimateInventoryDaysRemaining(medication, manilaDate(new Date()));
                          return days === null ? t('inventory.noEstimate') : t('inventory.daysRemaining', { count: days });
                        })()}
                      </Text>
                    ) : null}
                  </View>
                  {patient.canManageMedications ? (
                    <PressableScale accessibilityRole="button" onPress={() => { inventoryMutation.reset(); inventoryAttempt.current = null; setInventoryMedication(medication); }} style={styles.inventoryButton}>
                      <Text style={styles.inventoryButtonLabel}>{t(medication.inventory ? 'inventory.manage' : 'inventory.recordCount')}</Text>
                    </PressableScale>
                  ) : null}
                </View>
              ) : null}

              {(!medication.strengthValue || !medication.medicineForm || !medication.route) ? (
                <View style={styles.missingDetailRow}>
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
                      <AppIcon color={colors.ink} name="pencil" size={16} />
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
                      <AppIcon color={colors.error} name="archive" size={16} />
                      <Text style={styles.archiveLabel}>{t(archiveMutation.isPending && archiveMutation.variables?.id === medication.id ? 'medicine.archiving' : 'medicine.archive')}</Text>
                    </View>
                  </PressableScale>
                </View>
              ) : null}
            </View>
          ))}
          {!visibleMedications.length ? <Text style={styles.noResults}>{t('medicine.noResults')}</Text> : null}
        </View>
        </>
      )}

      {/* Archived Medications Section */}
      {archivedMedications.length ? (
        <View style={styles.archivedSection}>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ expanded: showArchived }}
            onPress={() => setShowArchived((current) => !current)}
            style={[styles.archivedToggle, largeText && styles.archivedToggleLarge]}
          >
            <View style={styles.archivedHeading}>
              <View style={styles.archivedTitleRow}>
                <AppIcon color={colors.inkLine} name="archive" size={17} />
                <Text style={styles.archivedTitle}>{t('medicine.archivedTitle')}</Text>
              </View>
              <Text style={styles.archivedCount}>{t('medicine.retained', { count: archivedMedications.length })}</Text>
            </View>
            <View style={styles.archivedToggleLink}>
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

      {(archiveMutation.error || restoreMutation.error) ? (
        <View style={styles.inlineErrorRow}>
          <AppIcon color={colors.error} name="alert-circle" size={15} />
          <Text accessibilityLiveRegion="assertive" style={styles.inlineError}>{errorMessage(archiveMutation.error || restoreMutation.error)}</Text>
        </View>
      ) : null}

      <MedicationEditorModal
        draft={importDraft}
        medication={editingMedication}
        onClose={() => { setEditorVisible(false); setImportDraft(null); }}
        onSave={(input) => saveMutation.mutateAsync({ input, medication: editingMedication })}
        patient={patient}
        visible={editorVisible}
      />
      <MedicationInventoryModal
        error={inventoryMutation.error ? errorMessage(inventoryMutation.error) : null}
        isSaving={inventoryMutation.isPending}
        medicationName={inventoryMedication?.displayName ?? ''}
        onClose={() => setInventoryMedication(null)}
        onSave={(kind, quantity) => {
          if (!inventoryMedication) return;
          const key = `${inventoryMedication.id}:${kind}:${quantity}`;
          if (inventoryAttempt.current?.key !== key) inventoryAttempt.current = { key, clientActionId: actionId() };
          inventoryMutation.mutate({ medication: inventoryMedication, kind, quantity, clientActionId: inventoryAttempt.current.clientActionId });
        }}
        quantityOnHand={inventoryMedication?.inventory?.onHandQuantity ?? null}
        unit={inventoryUnitLabel(inventoryMedication?.doseUnit ?? 'tablets')}
        visible={inventoryMedication !== null}
      />
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { gap: spacing.md },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headingRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  headingCopy: { flex: 1, gap: 2 },
  title: { ...typography.title1, color: colors.ink },
  subtitle: { ...typography.body, color: colors.muted },
  addButton: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  addButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  addButtonLarge: { width: '100%' },
  addButtonLabel: { ...typography.bodyEmphasis, color: colors.white, fontWeight: '700' },

  // Quiet paper strip for confirmations; Undo is a narra text link
  notice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.canvasSubtle, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  noticeText: { ...typography.body, flex: 1, color: colors.ink },
  undoButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  undoLabel: { ...typography.bodyEmphasis, color: colors.primaryDark, fontWeight: '700' },

  searchContainer: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, minHeight: 48, color: colors.ink, fontSize: 15 },
  clearSearchButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },

  stateRow: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, paddingVertical: spacing.lg },
  stateText: { ...typography.body, color: colors.muted },
  // Kept as a tinted box: it holds the Retry action.
  errorBox: { gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { ...typography.body, color: colors.error },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  retryLabel: { ...typography.bodyEmphasis, color: colors.error, fontWeight: '700' },

  emptyCard: {
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingVertical: spacing.lg,
  },
  emptyCopy: { gap: spacing.xs },
  emptyTitle: { ...sectionTitle, color: colors.ink },
  emptyBody: { ...typography.body, maxWidth: 520, color: colors.muted },

  // Ruled medicine rows on the paper
  list: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  medicineCard: {
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingVertical: spacing.lg,
  },
  medicineCardHighlighted: {
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.canvasSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  nameBlock: { flex: 1, gap: 2 },
  medicineName: { ...sectionTitle, color: colors.ink },
  doseStrength: { ...typography.body, color: colors.muted },
  confirmedMark: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: 3 },
  confirmedLabel: { ...typography.caption, color: colors.ink },

  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scheduleText: { ...typography.bodyEmphasis, flexShrink: 1, color: colors.ink },
  inventoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inventoryRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  inventoryCopy: { flex: 1, gap: 2 },
  inventoryValue: { ...typography.bodyEmphasis, color: colors.ink },
  inventoryMeta: { ...typography.caption, color: colors.muted },
  inventoryWarning: { ...typography.caption, color: colors.warning, fontWeight: '600' },
  inventoryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md },
  inventoryButtonLabel: { ...typography.bodyEmphasis, color: colors.ink },

  missingDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  missingDetail: { ...typography.caption, flex: 1, color: colors.warning },

  // 48dp actions: quiet secondary outline + destructive text button
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  rowActionsLarge: { flexDirection: 'column', alignItems: 'stretch' },
  rowActionLarge: { width: '100%' },
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
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
  },
  editLabel: { ...typography.bodyEmphasis, color: colors.ink },
  archiveButton: { minHeight: 48, justifyContent: 'center' },
  archiveLabel: { ...typography.bodyEmphasis, color: colors.error },
  inlineErrorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  inlineError: { ...typography.caption, flex: 1, color: colors.error },
  noResults: { ...typography.body, color: colors.muted, paddingVertical: spacing.xl, textAlign: 'center' },

  archivedSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  archivedToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  archivedToggleLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  archivedHeading: { flex: 1, gap: 2 },
  archivedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  archivedTitle: { ...sectionTitle, color: colors.ink },
  archivedCount: { ...typography.caption, color: colors.muted },
  archivedToggleLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  archivedToggleLabel: { ...typography.bodyEmphasis, color: colors.primaryDark, fontWeight: '700' },
  archivedList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginTop: spacing.sm },
  archivedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: spacing.md },
  archivedCopy: { minWidth: 220, flex: 1, gap: 2 },
  archivedName: { ...typography.headline, color: colors.ink },
  archivedDose: { ...typography.caption, color: colors.muted },
  archivedNote: { ...typography.caption, color: colors.muted },
  restoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, paddingHorizontal: spacing.md },
  restoreLabel: { ...typography.bodyEmphasis, color: colors.ink },
});
