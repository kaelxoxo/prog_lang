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
  const [draft, setDraft] = useState<MedicationOcrDraft | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const ocrMutation = useMutation({
    mutationFn: (input: { imageBase64: string; mimeType: 'image/jpeg'; sourceKind: SourceKind }) =>
      apiRequest<{ draft: MedicationOcrDraft }>(`/patients/${patient.id}/imports/ocr`, {
        method: 'POST',
        token,
        body: input,
      }),
    onSuccess: (response) => setDraft(response.draft),
  });

  const chooseImage = async () => {
    setPickerError(null);
    setDraft(null);
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

      setImageUri(asset.uri);
      ocrMutation.mutate({ imageBase64: asset.base64, mimeType: 'image/jpeg', sourceKind });
    } catch (error) {
      setPickerError(errorMessage(error));
    }
  };

  const discard = () => {
    setDraft(null);
    setImageUri(null);
    setPickerError(null);
    ocrMutation.reset();
  };

  return (
    <View style={styles.section}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((current) => !current)} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
        <View style={styles.heading}>
          <Text style={styles.title}>Import from synthetic photo</Text>
          <Text style={styles.summary}>Experimental local OCR</Text>
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

          {draft ? (
            <View style={styles.result}>
              <View style={styles.resultHeading}>
                <Text accessibilityRole="header" style={styles.resultTitle}>Draft text found</Text>
                <Text style={styles.confidence}>{draft.confidence}% OCR confidence</Text>
              </View>
              {draft.warnings.map((warning) => <Text key={warning} style={styles.warning}>• {warning}</Text>)}
              <View style={styles.rawText}>
                <Text style={styles.rawLabel}>Extracted source wording</Text>
                <Text selectable style={styles.rawValue}>{draft.rawText || 'No text recognized.'}</Text>
              </View>
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={discard} style={({ pressed }) => [styles.discardButton, pressed && styles.pressed]}>
                  <Text style={styles.discardLabel}>Discard</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => onReview(draft)} style={({ pressed }) => [styles.reviewButton, pressed && styles.chooseButtonPressed]}>
                  <Text style={styles.reviewLabel}>Review every field</Text>
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
