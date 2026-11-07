import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest, errorMessage } from '../../lib/api';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { imageMimeTypeFromBase64 } from './imageType';
import type { MedicationOcrDraft } from './types';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
type SourceKind = MedicationOcrDraft['sourceKind'];

export function MedicationPhotoImport({
  initialExpanded = false,
  onReview,
  patient,
}: {
  initialExpanded?: boolean;
  onReview: (draft: MedicationOcrDraft) => void;
  patient: Patient;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(initialExpanded);
  const [sourceKind, setSourceKind] = useState<SourceKind>('timetable_photo');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<MedicationOcrDraft[]>([]);
  const [selectedDraftIndex, setSelectedDraftIndex] = useState(0);
  const [reviewedIndices, setReviewedIndices] = useState<number[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const activeDraft = drafts[selectedDraftIndex] ?? null;

  const ocrMutation = useMutation({
    mutationFn: (input: { imageBase64: string; mimeType: 'image/jpeg' | 'image/png'; sourceKind: SourceKind }) =>
      apiRequest<{ draft: MedicationOcrDraft; drafts?: MedicationOcrDraft[] }>(`/patients/${patient.id}/imports/ocr`, {
        method: 'POST',
        token,
        body: input,
      }),
    onSuccess: (response) => {
      const allDrafts = response.drafts && response.drafts.length > 0 ? response.drafts : [response.draft];
      setDrafts(allDrafts);
      setSelectedDraftIndex(0);
      setReviewedIndices([]);
    },
  });

  const chooseImage = async () => {
    setPickerError(null);
    setDrafts([]);
    setSelectedDraftIndex(0);
    setReviewedIndices([]);
    setImageUri(null);
    ocrMutation.reset();

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        base64: true,
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.base64) {
        setPickerError('Alaga could not read that image. Choose another JPEG or PNG.');
        return;
      }
      const decodedBytes = Math.floor(asset.base64.length * 0.75);
      if (decodedBytes > MAX_IMAGE_BYTES) {
        setPickerError('Choose an image smaller than 4 MB after cropping.');
        return;
      }

      const mimeType = imageMimeTypeFromBase64(asset.base64);
      if (!mimeType) {
        setPickerError('Alaga could not read that image. Choose another JPEG or PNG.');
        return;
      }

      setImageUri(asset.uri);
      ocrMutation.mutate({ imageBase64: asset.base64, mimeType, sourceKind });
    } catch (error) {
      setPickerError(errorMessage(error));
    }
  };

  const discard = () => {
    setDrafts([]);
    setSelectedDraftIndex(0);
    setReviewedIndices([]);
    setImageUri(null);
    setPickerError(null);
    ocrMutation.reset();
  };

  const startReview = () => {
    if (!activeDraft) return;
    setReviewedIndices((prev) => (prev.includes(selectedDraftIndex) ? prev : [...prev, selectedDraftIndex]));
    onReview(activeDraft);
  };

  return (
    <View style={styles.section}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((current) => !current)} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
        <View style={styles.headerRow}>
          <AppIcon color={colors.primary} name="camera" size={20} />
          <View style={styles.heading}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Import from synthetic photo</Text>
              <Text style={styles.experimentalText}>Experimental</Text>
            </View>
            <Text style={styles.summary}>Local OCR & multi-medicine draft extraction</Text>
          </View>
        </View>
        <View style={styles.toggleLink}>
          <Text style={styles.toggleLabel}>{expanded ? 'Close' : 'Try'}</Text>
          <AppIcon color={colors.primaryDark} name={expanded ? 'chevron-up' : 'chevron-down'} size={15} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.content}>
          <Text style={styles.body}>Images are processed locally and never stored.</Text>
          <View accessibilityRole="radiogroup" style={styles.sourceChoices}>
            {(['timetable_photo', 'label_photo'] as const).map((kind) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: sourceKind === kind }}
                key={kind}
                onPress={() => setSourceKind(kind)}
                style={({ pressed }) => [styles.sourceChoice, sourceKind === kind && styles.sourceChoiceSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.sourceLabel, sourceKind === kind && styles.sourceLabelSelected]}>
                  {kind === 'timetable_photo' ? 'Printed timetable' : 'Medicine label'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" disabled={ocrMutation.isPending} onPress={() => void chooseImage()} style={({ pressed }) => [styles.chooseButton, pressed && styles.chooseButtonPressed, ocrMutation.isPending && styles.disabled]}>
            <AppIcon color={colors.white} name="image" size={18} />
            <Text style={styles.chooseLabel}>{ocrMutation.isPending ? 'Reading image…' : 'Choose image'}</Text>
          </Pressable>

          {imageUri ? <Image accessibilityLabel="Selected synthetic source" resizeMode="contain" source={{ uri: imageUri }} style={styles.preview} /> : null}
          {pickerError || ocrMutation.error ? (
            <View style={styles.errorRow}>
              <AppIcon color={colors.error} name="alert-circle" size={15} />
              <Text accessibilityLiveRegion="assertive" style={styles.error}>{pickerError || errorMessage(ocrMutation.error)}</Text>
            </View>
          ) : null}

          {activeDraft ? (
            <View style={styles.result}>
              <View style={styles.resultHeading}>
                <Text accessibilityRole="header" style={styles.resultTitle}>
                  {drafts.length > 1 ? `${drafts.length} medicines found` : 'Draft text found'}
                </Text>
                <Text style={styles.confidence}>{activeDraft.confidence}% OCR confidence</Text>
              </View>

              {drafts.length > 1 ? (
                <View style={styles.multiSelector}>
                  <Text style={styles.multiSelectorHeading}>
                    Choose medicine to review{reviewedIndices.length > 0 ? ` (${reviewedIndices.length} of ${drafts.length} reviewed)` : ''}:
                  </Text>
                  <View style={styles.multiPills}>
                    {drafts.map((d, index) => {
                      const isReviewed = reviewedIndices.includes(index);
                      return (
                        <Pressable
                          accessibilityLabel={`Medicine ${index + 1}: ${d.displayName || 'Unrecognized'}${isReviewed ? ', reviewed' : ''}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: selectedDraftIndex === index }}
                          key={`${d.displayName}-${index}`}
                          onPress={() => setSelectedDraftIndex(index)}
                          style={({ pressed }) => [
                            styles.multiPill,
                            selectedDraftIndex === index && styles.multiPillSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          {isReviewed ? <AppIcon color={colors.ink} name="check" size={14} /> : null}
                          <Text style={[
                            styles.multiPillIndex,
                            isReviewed && styles.multiPillIndexReviewed,
                            selectedDraftIndex === index && styles.multiPillIndexSelected,
                          ]}>
                            #{index + 1}
                          </Text>
                          <Text numberOfLines={1} style={[
                            styles.multiPillText,
                            selectedDraftIndex === index && styles.multiPillTextSelected,
                          ]}>
                            {d.displayName || `Item ${index + 1}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {activeDraft.pndfVerified ? (
                <View style={styles.pndfRow}>
                  <AppIcon color={colors.ink} name="check" size={14} />
                  <Text style={styles.pndfText}>
                    Philippine Formulary (PNDF) Verified{activeDraft.pndfGenericName ? `: ${activeDraft.pndfGenericName}` : ''}
                  </Text>
                </View>
              ) : null}

              {activeDraft.lasaWarning ? (
                <View style={styles.lasaWarning}>
                  <View style={styles.lasaHeadingRow}>
                    <AppIcon color={colors.warning} name="alert-triangle" size={15} />
                    <Text style={styles.lasaHeading}>Look-Alike / Sound-Alike (LASA) Alert</Text>
                  </View>
                  <Text style={styles.lasaText}>{activeDraft.lasaWarning}</Text>
                </View>
              ) : null}

              {activeDraft.timingClarification ? (
                <View style={styles.timingClarification}>
                  <View style={styles.timingHeadingRow}>
                    <AppIcon color={colors.primary} name="clock" size={15} />
                    <Text style={styles.timingClarificationHeading}>Timing Clarification</Text>
                  </View>
                  <Text style={styles.timingClarificationText}>{activeDraft.timingClarification}</Text>
                </View>
              ) : null}

              {activeDraft.warnings.map((warning) => <Text key={warning} style={styles.warning}>• {warning}</Text>)}

              <View style={styles.rawText}>
                <Text style={styles.rawLabel}>Extracted source wording</Text>
                <Text selectable style={styles.rawValue}>{activeDraft.rawText || 'No text recognized.'}</Text>
              </View>

              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={discard} style={({ pressed }) => [styles.discardButton, pressed && styles.pressed]}>
                  <Text style={styles.discardLabel}>Discard</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={startReview} style={({ pressed }) => [styles.reviewButton, pressed && styles.chooseButtonPressed]}>
                  <Text style={styles.reviewLabel}>
                    {drafts.length > 1
                      ? `Review #${selectedDraftIndex + 1}: ${activeDraft.displayName || 'Medicine'}${reviewedIndices.includes(selectedDraftIndex) ? ' (reviewed)' : ''}`
                      : 'Review every field'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  // A ruled section on the paper; the toggle row is the action target.
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: spacing.sm,
  },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.sm },
  title: { ...sectionTitle, color: colors.ink },
  experimentalText: { ...typography.caption, color: colors.warning },
  summary: { ...typography.caption, color: colors.muted },
  toggleLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  toggleLabel: { ...typography.bodyEmphasis, color: colors.primaryDark, fontWeight: '700' },
  content: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginTop: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm },
  body: { ...typography.body, maxWidth: 560, color: colors.muted },
  sourceChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sourceChoice: {
    minHeight: 48,
    minWidth: 140,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  sourceChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  sourceLabel: { ...typography.bodyEmphasis, color: colors.muted },
  sourceLabelSelected: { color: colors.primaryDark, fontWeight: '700' },
  chooseButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  chooseButtonPressed: { backgroundColor: colors.primaryDark },
  chooseLabel: { ...typography.bodyEmphasis, color: colors.white, fontWeight: '700' },
  disabled: { opacity: 0.58 },
  preview: { width: '100%', height: 180, borderRadius: radii.md, backgroundColor: colors.canvasSubtle },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  error: { ...typography.body, flex: 1, color: colors.error },
  // Kept as a quiet inset box: the draft holds the Discard / Review actions.
  result: { gap: spacing.md, borderRadius: radii.md, backgroundColor: colors.canvasSubtle, padding: spacing.md },
  multiSelector: { gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingBottom: spacing.sm },
  multiSelectorHeading: { ...typography.bodyEmphasis, color: colors.ink },
  multiPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  multiPill: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  multiPillSelected: { borderColor: colors.primary },
  multiPillIndex: { ...typography.caption, color: colors.muted },
  multiPillIndexSelected: { color: colors.primaryDark, fontWeight: '700' },
  multiPillIndexReviewed: { color: colors.ink },
  multiPillText: { ...typography.caption, maxWidth: 160, color: colors.ink, fontWeight: '600' },
  multiPillTextSelected: { color: colors.primaryDark, fontWeight: '700' },
  timingClarification: { gap: spacing.xs },
  timingHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timingClarificationHeading: { ...typography.caption, color: colors.primaryDark, fontWeight: '700' },
  timingClarificationText: { ...typography.body, color: colors.ink },
  pndfRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pndfText: { ...typography.caption, flexShrink: 1, color: colors.ink },
  lasaWarning: { gap: spacing.xs },
  lasaHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lasaHeading: { ...typography.caption, color: colors.warning, fontWeight: '700' },
  lasaText: { ...typography.body, color: colors.ink },
  resultHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  resultTitle: { ...typography.headline, color: colors.ink },
  confidence: { ...typography.caption, color: colors.warning },
  warning: { ...typography.caption, color: colors.warning },
  rawText: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.md },
  rawLabel: { ...typography.caption, color: colors.muted },
  rawValue: { ...typography.body, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  discardButton: { minHeight: 48, minWidth: 100, flex: 1, alignItems: 'center', justifyContent: 'center' },
  discardLabel: { ...typography.bodyEmphasis, color: colors.primaryDark, fontWeight: '700' },
  reviewButton: { minHeight: 48, minWidth: 180, flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  reviewLabel: { ...typography.bodyEmphasis, color: colors.white, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
