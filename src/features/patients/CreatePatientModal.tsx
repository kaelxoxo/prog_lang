import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
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
            <View accessibilityLiveRegion="assertive" style={styles.errorBox}>
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
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: radii.full,
    backgroundColor: colors.mist,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: { color: colors.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  field: { gap: spacing.xs, marginTop: spacing.xs },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  inputError: { borderColor: colors.error },
  errorBox: { borderRadius: radii.sm, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  secondaryButtonPressed: { backgroundColor: colors.mist },
  secondaryLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  primaryButton: {
    minHeight: 48,
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    backgroundColor: colors.ink,
  },
  primaryButtonPressed: { backgroundColor: colors.primaryDark },
  primaryLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
