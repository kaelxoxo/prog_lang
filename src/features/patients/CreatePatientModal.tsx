import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../components/AppIcon';
import { errorMessage } from '../../lib/api';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';

type CreatePatientModalProps = {
  isCreating: boolean;
  onClose: () => void;
  onCreate: (displayName: string) => Promise<unknown>;
  visible: boolean;
};

export function CreatePatientModal({
  isCreating,
  onClose,
  onCreate,
  visible,
}: CreatePatientModalProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const close = () => {
    if (isCreating) {
      return;
    }

    setDisplayName('');
    setError(null);
    onClose();
  };

  const create = async () => {
    setError(null);

    if (!displayName.trim()) {
      setError('Enter the name you use to identify this person.');
      inputRef.current?.focus();
      return;
    }

    try {
      await onCreate(displayName);
      close();
    } catch (createError) {
      setError(errorMessage(createError));
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible={visible}>
      <SafeAreaView edges={['bottom']} style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text accessibilityRole="header" style={styles.title}>Add a person</Text>
          <Text style={styles.subtitle}>
            This creates a private care space for this person. You will be its first care manager.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Person’s display name</Text>
            <TextInput
              accessibilityLabel="Person’s display name"
              accessibilityHint={error || undefined}
              autoCapitalize="words"
              autoFocus
              maxLength={80}
              onChangeText={(value) => { setDisplayName(value); if (error) setError(null); }}
              onSubmitEditing={() => void create()}
              placeholder="Lina Santos"
              placeholderTextColor={colors.muted}
              ref={inputRef}
              returnKeyType="done"
              style={[styles.input, error && styles.inputError]}
              value={displayName}
            />
          </View>

          {error ? (
            <View accessibilityLiveRegion="assertive" style={styles.errorRow}>
              <AppIcon color={colors.error} name="alert-circle" size={16} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={isCreating}
              onPress={close}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            >
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isCreating}
              onPress={() => void create()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                isCreating && styles.disabled,
              ]}
            >
              <Text style={styles.primaryLabel}>{isCreating ? 'Creating…' : 'Create profile'}</Text>
            </Pressable>
          </View>
        </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  keyboardView: { flex: 1, justifyContent: 'flex-end' },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet: {
    gap: spacing.md,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: radii.full,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...sectionTitle, color: colors.ink },
  subtitle: { ...typography.body, color: colors.muted },
  field: { gap: spacing.xs, marginTop: spacing.xs },
  label: { ...typography.caption, color: colors.ink, fontWeight: '600' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  inputError: { borderColor: colors.error },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  errorText: { ...typography.caption, flex: 1, color: colors.error },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: {
    minHeight: 52,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  secondaryButtonPressed: { backgroundColor: colors.canvasSubtle },
  secondaryLabel: { ...typography.bodyEmphasis, color: colors.ink, fontWeight: '700' },
  primaryButton: {
    minHeight: 52,
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  primaryButtonPressed: { backgroundColor: colors.primaryDark },
  primaryLabel: { ...typography.bodyEmphasis, color: colors.white, fontWeight: '700' },
  disabled: { opacity: 0.55 },
});
