import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { apiRequest, errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import type { MedicationOcrDraft } from './types';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
type SourceKind = MedicationOcrDraft['sourceKind'];

export function MedicationPhotoImport({
  onReview,
  patient,
}: {
  onReview: (draft: MedicationOcrDraft) => void;
  patient: Patient;
}) {
  const { styles } = useThemedStyles(createStyles);
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
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

      const isPng = asset.mimeType === 'image/png'
        || (Boolean(asset.uri) && asset.uri.toLowerCase().endsWith('.png'))
        || (Boolean(asset.base64) && asset.base64.startsWith('iVBORw0KGgo'));
      const mimeType: 'image/jpeg' | 'image/png' = isPng ? 'image/png' : 'image/jpeg';

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
        <View style={styles.heading}>
          <Text style={styles.title}>Import from synthetic photo</Text>
          <Text style={styles.summary}>Experimental local OCR & multi-medicine import</Text>
        </View>
        <Text style={styles.toggleLabel}>{expanded ? 'Close' : 'Try'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.content}>
          <Text style={styles.body}>Synthetic images only. The local API reads the image in memory and does not save it.</Text>
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
            <Text style={styles.chooseLabel}>{ocrMutation.isPending ? 'Reading image locally...' : 'Choose synthetic image'}</Text>
          </Pressable>

          {imageUri ? <Image accessibilityLabel="Selected synthetic source" resizeMode="contain" source={{ uri: imageUri }} style={styles.preview} /> : null}
          {pickerError || ocrMutation.error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{pickerError || errorMessage(ocrMutation.error)}</Text> : null}

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
                          accessibilityRole="button"
                          accessibilityState={{ selected: selectedDraftIndex === index }}
                          key={`${d.displayName}-${index}`}
                          onPress={() => setSelectedDraftIndex(index)}
                          style={({ pressed }) => [
                            styles.multiPill,
                            isReviewed && styles.multiPillReviewed,
                            selectedDraftIndex === index && styles.multiPillSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={[
                            styles.multiPillIndex,
                            isReviewed && styles.multiPillIndexReviewed,
                            selectedDraftIndex === index && styles.multiPillIndexSelected,
                          ]}>
                            {isReviewed ? '✓ ' : ''}#{index + 1}
                          </Text>
                          <Text numberOfLines={1} style={[
                            styles.multiPillText,
                            isReviewed && styles.multiPillTextReviewed,
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

              {activeDraft.timingClarification ? (
                <View style={styles.timingClarificationBox}>
                  <Text style={styles.timingClarificationHeading}>Timing Clarification</Text>
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
  section: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  toggle: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  heading: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  summary: { color: colors.muted, fontSize: 13 },
  toggleLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  content: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.md },
  body: { maxWidth: 560, color: colors.muted, fontSize: 14, lineHeight: 21 },
  sourceChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sourceChoice: { minHeight: 48, minWidth: 150, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.sm, backgroundColor: colors.white, paddingHorizontal: spacing.sm },
  sourceChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  sourceLabel: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  sourceLabelSelected: { color: colors.primaryDark, fontWeight: '900' },
  chooseButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.md },
  chooseButtonPressed: { opacity: 0.82 },
  chooseLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.58 },
  preview: { width: '100%', height: 180, borderRadius: radii.md, backgroundColor: colors.mist },
  error: { color: colors.error, fontSize: 14, lineHeight: 20 },
  result: { gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.warningTint, padding: spacing.md },
  multiSelector: { gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: spacing.sm },
  multiSelectorHeading: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  multiPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  multiPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 24, backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  multiPillSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  multiPillReviewed: { borderColor: colors.successDark, backgroundColor: colors.successTint },
  multiPillIndex: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  multiPillIndexSelected: { color: colors.primaryDark, fontWeight: '900' },
  multiPillIndexReviewed: { color: colors.successDark, fontWeight: '900' },
  multiPillText: { maxWidth: 160, color: colors.ink, fontSize: 13, fontWeight: '700' },
  multiPillTextSelected: { color: colors.primaryDark, fontWeight: '900' },
  multiPillTextReviewed: { color: colors.successDark, fontWeight: '800' },
  timingClarificationBox: { gap: 4, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryTint, padding: spacing.sm },
  timingClarificationHeading: { color: colors.primaryDark, fontSize: 13, fontWeight: '900' },
  timingClarificationText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  resultHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  resultTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  confidence: { color: colors.warning, fontSize: 13, fontWeight: '800' },
  warning: { color: colors.warning, fontSize: 14, lineHeight: 21 },
  rawText: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  rawLabel: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  rawValue: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  discardButton: { minHeight: 52, minWidth: 110, flex: 1, alignItems: 'center', justifyContent: 'center' },
  discardLabel: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  reviewButton: { minHeight: 52, minWidth: 190, flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.md },
  reviewLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
