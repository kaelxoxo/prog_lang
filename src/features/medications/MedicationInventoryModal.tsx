import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';

type Props = {
  visible: boolean;
  medicationName: string;
  quantityOnHand: number | null;
  unit: string;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (kind: 'count' | 'refill', quantity: number) => void;
};

export function MedicationInventoryModal({
  error,
  isSaving,
  medicationName,
  onClose,
  onSave,
  quantityOnHand,
  unit,
  visible,
}: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const [kind, setKind] = useState<'count' | 'refill'>('count');
  const [quantity, setQuantity] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setKind('count');
      setQuantity(quantityOnHand === null ? '' : String(quantityOnHand));
      setValidationError(null);
    }
  }, [quantityOnHand, visible]);

  const submit = () => {
    const parsed = Number(quantity.trim());
    if (!quantity.trim() || !Number.isFinite(parsed) || parsed < 0 || parsed > 999_999 || (kind === 'refill' && parsed === 0)) {
      setValidationError(t(kind === 'count' ? 'inventory.countQuantityError' : 'inventory.refillQuantityError'));
      return;
    }
    setValidationError(null);
    onSave(kind, parsed);
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
            <Pressable accessibilityLabel={t('people.close')} onPress={onClose} style={styles.backdrop} />
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.header}>
            <View style={styles.iconWrap}><AppIcon color={colors.primaryDark} name="package" size={21} /></View>
            <Pressable accessibilityLabel={t('people.close')} accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <AppIcon color={colors.muted} name="x" size={20} />
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={styles.title}>{t('inventory.title')}</Text>
          <Text style={styles.medicineName}>{medicationName}</Text>
          <Text style={styles.body}>{t('inventory.modalBody')}</Text>

          {quantityOnHand !== null ? (
            <View style={styles.modeRow}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: kind === 'count' }} onPress={() => { setKind('count'); setQuantity(String(quantityOnHand)); setValidationError(null); }} style={[styles.modeButton, kind === 'count' && styles.modeButtonSelected]}>
                <Text style={[styles.modeLabel, kind === 'count' && styles.modeLabelSelected]}>{t('inventory.countAction')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: kind === 'refill' }} onPress={() => { setKind('refill'); setQuantity(''); setValidationError(null); }} style={[styles.modeButton, kind === 'refill' && styles.modeButtonSelected]}>
                <Text style={[styles.modeLabel, kind === 'refill' && styles.modeLabelSelected]}>{t('inventory.refillAction')}</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.label}>{t(kind === 'count' ? 'inventory.countLabel' : 'inventory.refillLabel', { unit })}</Text>
          <TextInput
            accessibilityLabel={t(kind === 'count' ? 'inventory.countLabel' : 'inventory.refillLabel', { unit })}
            autoFocus
            keyboardType="decimal-pad"
            onChangeText={(value) => { setQuantity(value); setValidationError(null); }}
            placeholder="0"
            placeholderTextColor={colors.muted}
            selectTextOnFocus
            style={styles.input}
            value={quantity}
          />
          {validationError || error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{validationError || error}</Text> : null}

          <Pressable accessibilityRole="button" disabled={isSaving} onPress={submit} style={[styles.primaryButton, isSaving && styles.buttonDisabled]}>
            <Text style={styles.primaryLabel}>{t(isSaving ? 'inventory.saving' : kind === 'count' ? 'inventory.saveCount' : 'inventory.saveRefill')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={isSaving} onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelLabel}>{t('dose.cancel')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 20, 16, 0.62)' },
  dialog: { width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: radii.lg, backgroundColor: colors.white, padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.primaryTint },
  closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  medicineName: { color: colors.primaryDark, fontSize: 16, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modeButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, paddingHorizontal: spacing.sm },
  modeButtonSelected: { borderColor: colors.primaryDark, backgroundColor: colors.primaryTint },
  modeLabel: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  modeLabelSelected: { color: colors.primaryDark },
  label: { color: colors.ink, fontSize: 14, fontWeight: '800', marginTop: spacing.sm },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.canvas, color: colors.ink, fontSize: 20, fontWeight: '700', paddingHorizontal: spacing.md },
  error: { color: colors.error, fontSize: 13, lineHeight: 18 },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  primaryLabel: { color: colors.white, fontSize: 16, fontWeight: '800' },
  buttonDisabled: { opacity: 0.55 },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { color: colors.muted, fontSize: 15, fontWeight: '700' },
});
