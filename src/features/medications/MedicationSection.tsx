import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, errorMessage } from '../../lib/api';
import { SyncNotice } from '../../components/SyncNotice';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { MedicationEditorModal } from './MedicationEditorModal';
import { MedicationPhotoImport } from './MedicationPhotoImport';
import type { Medication, MedicationInput, MedicationOcrDraft, MedicationSchedule } from './types';

type Props = { patient: Patient };
type ListResponse = { medications: Medication[] };
type SaveResponse = { medicationId: string; versionId: string };
type Notice = { message: string; medicationId?: string; canUndo?: boolean };

function friendlyTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function scheduleSummary(schedules: MedicationSchedule[]) {
  const first = schedules[0];
  if (!first) return 'No schedule';
  const days = first.weekdays.length === 7 ? 'every day' : `${first.weekdays.length} days each week`;
  if (first.kind === 'interval') return `Every ${first.intervalHours} hours from ${friendlyTime(first.timeOfDay)}, ${days}`;
  if (first.kind === 'meal') return `${first.mealRelation === 'after' ? 'After' : 'Before'} breakfast, lunch, and dinner, ${days}`;
  return `${schedules.map((schedule) => friendlyTime(schedule.timeOfDay)).join(', ')}, ${days}`;
}

export function MedicationSection({ patient }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
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
      setNotice({ message: `${variables.medication ? 'Updated' : 'Confirmed'} ${variables.input.displayName} for ${patient.displayName}.` });
      void queryClient.invalidateQueries({ queryKey: ['today', patient.id] });
      void queryClient.invalidateQueries({ queryKey: ['reminders', patient.id] });
      return queryClient.invalidateQueries({ queryKey });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (medication: Medication) =>
      apiRequest(`/patients/${patient.id}/medications/${medication.id}/archive`, { method: 'POST', token }).then(() => medication),
    onSuccess: (medication) => {
      setNotice({ message: `${medication.displayName} was archived.`, medicationId: medication.id, canUndo: true });
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
      setNotice({ message: `Medicine restored for ${patient.displayName}.` });
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
      `Archive ${medication.displayName}?`,
      `It will leave ${patient.displayName}'s active medicine list. Its confirmed history will remain available.`,
      [
        { text: 'Keep medicine', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => archiveMutation.mutate(medication) },
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
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.title}>Medicines</Text>
          <Text style={styles.subtitle}>Confirmed schedules for {patient.displayName}</Text>
        </View>
        {patient.canManageMedications ? (
          <Pressable accessibilityRole="button" onPress={openCreate} style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}>
            <Text style={styles.addButtonLabel}>Add medicine</Text>
          </Pressable>
        ) : null}
      </View>

      {patient.canManageMedications ? <MedicationPhotoImport onReview={reviewImport} patient={patient} /> : null}

      {notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <View style={styles.noticeDot} />
          <Text style={styles.noticeText}>{notice.message}</Text>
          {notice.canUndo && notice.medicationId ? (
            <Pressable accessibilityRole="button" disabled={restoreMutation.isPending} onPress={() => restoreMutation.mutate(notice.medicationId!)} style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}>
              <Text style={styles.undoLabel}>{restoreMutation.isPending ? 'Restoring...' : 'Undo'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {medications.length > 6 ? (
        <TextInput
          accessibilityLabel="Find a medicine"
          onChangeText={setSearch}
          placeholder="Find a medicine"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          value={search}
        />
      ) : null}

      {medicationQuery.isLoading && !medicationQuery.data ? (
        <View style={styles.stateRow}><Text style={styles.stateText}>Loading medicines...</Text></View>
      ) : medicationQuery.error && !medicationQuery.data ? (
        <View style={styles.errorBox}>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage(medicationQuery.error)}</Text>
          <Pressable accessibilityRole="button" onPress={() => void medicationQuery.refetch()} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}><Text style={styles.retryLabel}>Try again</Text></Pressable>
        </View>
      ) : medications.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyDot} />
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>{archivedMedications.length ? 'No active medicines' : 'No confirmed medicines yet'}</Text>
            <Text style={styles.emptyBody}>{archivedMedications.length
              ? 'Archived medicines remain available below and create no new care entries.'
              : patient.canManageMedications ? 'Add the first medicine, set its schedule, and check it before confirming.' : 'A care manager can add a confirmed medicine schedule.'}</Text>
          </View>
        </View>
      ) : (
        <>
        <SyncNotice error={medicationQuery.error} onRetry={() => void medicationQuery.refetch()} updatedAt={medicationQuery.dataUpdatedAt} />
        <View style={styles.list}>
          {visibleMedications.map((medication) => (
            <View key={medication.id} style={[styles.medicineRow, highlightedId === medication.id && styles.medicineRowHighlighted]}>
              <View style={styles.rowTop}>
                <View style={styles.medicineCopy}>
                  <View style={styles.confirmedState}><View style={styles.confirmedDot} /><Text style={styles.confirmedLabel}>Confirmed</Text></View>
                  <Text style={styles.medicineName}>{medication.displayName}</Text>
                  <Text style={styles.dose}>{medication.doseQuantity} {medication.doseUnit}{medication.strengthValue ? `, ${medication.strengthValue} ${medication.strengthUnit}` : ''}</Text>
                </View>
              </View>
              <View style={styles.scheduleSummary}>
                <Text style={styles.scheduleTitle}>Schedule</Text>
                <Text style={styles.scheduleValue}>{scheduleSummary(medication.schedules)}</Text>
              </View>
              {(!medication.strengthValue || !medication.medicineForm || !medication.route) ? <Text style={styles.missingDetail}>Some label details are not provided. Open review to check them.</Text> : null}
              {patient.canManageMedications ? (
                <View style={styles.rowActions}>
                  <Pressable accessibilityRole="button" onPress={() => openEdit(medication)} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}><Text style={styles.editLabel}>Review or edit</Text></Pressable>
                  <Pressable accessibilityRole="button" disabled={archiveMutation.isPending} onPress={() => confirmArchive(medication)} style={({ pressed }) => [styles.archiveButton, pressed && styles.pressed]}>
                    <Text style={styles.archiveLabel}>{archiveMutation.isPending && archiveMutation.variables?.id === medication.id ? 'Archiving...' : 'Archive'}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
          {!visibleMedications.length ? <Text style={styles.noResults}>No medicine matches that name.</Text> : null}
        </View>
        </>
      )}

      {archivedMedications.length ? (
        <View style={styles.archivedSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showArchived }}
            onPress={() => setShowArchived((current) => !current)}
            style={({ pressed }) => [styles.archivedToggle, pressed && styles.pressed]}
          >
            <View style={styles.archivedHeading}>
              <Text style={styles.archivedTitle}>Archived medicines</Text>
              <Text style={styles.archivedCount}>{archivedMedications.length} retained</Text>
            </View>
            <Text style={styles.archivedToggleLabel}>{showArchived ? 'Hide' : 'Show'}</Text>
          </Pressable>
          {showArchived ? (
            <View style={styles.archivedList}>
              {archivedMedications.map((medication) => (
                <View key={medication.id} style={styles.archivedRow}>
                  <View style={styles.archivedCopy}>
                    <Text style={styles.archivedName}>{medication.displayName}</Text>
                    <Text style={styles.archivedDose}>{medication.doseQuantity} {medication.doseUnit}</Text>
                    <Text style={styles.archivedNote}>History is retained. This medicine creates no new care entries.</Text>
                  </View>
                  {patient.canManageMedications ? (
                    <Pressable accessibilityRole="button" disabled={restoreMutation.isPending} onPress={() => restoreMutation.mutate(medication.id)} style={({ pressed }) => [styles.restoreButton, pressed && styles.pressed]}>
                      <Text style={styles.restoreLabel}>{restoreMutation.isPending && restoreMutation.variables === medication.id ? 'Restoring...' : 'Restore'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {archivedQuery.error ? (
        <View style={styles.errorBox}>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>Archived medicines could not load. {errorMessage(archivedQuery.error)}</Text>
          <Pressable accessibilityRole="button" onPress={() => void archivedQuery.refetch()} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
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
  headingCopy: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 14 },
  addButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  addButtonPressed: { backgroundColor: colors.primaryDark },
  addButtonLabel: { color: colors.white, fontSize: 14, fontWeight: '800' },
  notice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.successTint, padding: spacing.md },
  noticeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  noticeText: { flex: 1, color: colors.successDark, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  undoButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  undoLabel: { color: colors.successDark, fontSize: 14, fontWeight: '900' },
  searchInput: { minHeight: 52, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.white, color: colors.ink, fontSize: 16, paddingHorizontal: spacing.md },
  stateRow: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: spacing.lg },
  stateText: { color: colors.muted, fontSize: 15 },
  errorBox: { gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  retryButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  retryLabel: { color: colors.error, fontSize: 14, fontWeight: '800' },
  emptyState: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: spacing.lg },
  emptyDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.sun, marginTop: 4 },
  emptyCopy: { flex: 1, gap: spacing.xs },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  emptyBody: { maxWidth: 520, color: colors.muted, fontSize: 14, lineHeight: 21 },
  list: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radii.lg, backgroundColor: colors.white },
  medicineRow: { gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, padding: spacing.md },
  medicineRowHighlighted: { backgroundColor: colors.successTint },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  medicineCopy: { flex: 1, gap: spacing.xs },
  confirmedState: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  confirmedLabel: { color: colors.successDark, fontSize: 13, fontWeight: '800' },
  medicineName: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  dose: { color: colors.muted, fontSize: 16 },
  scheduleSummary: { gap: 4, borderTopWidth: 1, borderTopColor: colors.mist, paddingTop: 12 },
  scheduleTitle: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  scheduleValue: { color: colors.ink, fontSize: 15, fontWeight: '700', lineHeight: 22 },
  missingDetail: { color: colors.warning, fontSize: 13, lineHeight: 19 },
  rowActions: { flexDirection: 'row', gap: spacing.sm },
  editButton: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.ink, borderRadius: radii.sm, backgroundColor: colors.white },
  editLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  archiveButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  archiveLabel: { color: colors.error, fontSize: 14, fontWeight: '700' },
  inlineError: { color: colors.error, fontSize: 13, lineHeight: 19 },
  noResults: { color: colors.muted, fontSize: 15, lineHeight: 22, paddingVertical: spacing.xl, textAlign: 'center' },
  archivedSection: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  archivedToggle: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  archivedHeading: { flex: 1, gap: 2 },
  archivedTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  archivedCount: { color: colors.muted, fontSize: 13 },
  archivedToggleLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  archivedList: { borderTopWidth: 1, borderTopColor: colors.line },
  archivedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.md },
  archivedCopy: { minWidth: 220, flex: 1, gap: 2 },
  archivedName: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  archivedDose: { color: colors.muted, fontSize: 14 },
  archivedNote: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  restoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.ink, borderRadius: radii.sm, paddingHorizontal: spacing.md },
  restoreLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
