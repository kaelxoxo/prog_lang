import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from './AuthProvider';

export function AuthScreen() {
  const { colors, styles } = useThemedStyles(createStyles);
  const [mode, setMode] = useState<'sign-in' | 'register'>('register');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ displayName?: string; email?: string; password?: string }>({});
  const displayNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const { register, signIn } = useAuth();

  const validate = () => {
    const problems: typeof fieldErrors = {};
    if (mode === 'register' && !displayName.trim()) problems.displayName = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) problems.email = 'Enter a valid email address, such as name@example.com.';
    if (password.length < 12) problems.password = 'Use at least 12 characters.';
    setFieldErrors(problems);
    const first = problems.displayName ? displayNameRef : problems.email ? emailRef : problems.password ? passwordRef : null;
    first?.current?.focus();
    return Object.keys(problems).length === 0;
  };

  const submit = async () => {
    setError(null);
    if (!validate()) return;
    setSubmitting(true);

    try {
      if (mode === 'register') {
        await register({ displayName, email, password });
      } else {
        await signIn({ email, password });
      }
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode((current) => (current === 'register' ? 'sign-in' : 'register'));
    setError(null);
    setFieldErrors({});
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardView}
    >
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandBlock}>
          <Text accessibilityRole="header" style={styles.brand}>Alaga</Text>
          <Text style={styles.kicker}>CARE, KEPT TOGETHER</Text>
          <Text style={styles.title}>
            {mode === 'register' ? 'Start a private care space.' : 'Welcome back to your care space.'}
          </Text>
          <Text style={styles.body}>
            Keep each person's medicines and schedules together in one private care space.
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.formHeading}>
            <Text accessibilityRole="header" style={styles.formTitle}>
              {mode === 'register' ? 'Create your account' : 'Sign in'}
            </Text>
            <Text style={styles.formHint}>
              {mode === 'register'
                ? 'You can add the people you care for after creating your account.'
                : 'Continue where you left off.'}
            </Text>
          </View>

          {mode === 'register' ? (
            <View style={styles.field}>
              <Text style={styles.label}>Your name</Text>
              <TextInput
                accessibilityLabel="Your name"
                accessibilityHint={fieldErrors.displayName}
                autoCapitalize="words"
                autoComplete="name"
                maxLength={80}
                onChangeText={setDisplayName}
                onBlur={() => setFieldErrors((current) => ({ ...current, displayName: displayName.trim() ? undefined : 'Enter your name.' }))}
                placeholder="Maya"
                placeholderTextColor={colors.muted}
                ref={displayNameRef}
                style={[styles.input, fieldErrors.displayName && styles.inputError]}
                value={displayName}
              />
              {fieldErrors.displayName ? <Text accessibilityLiveRegion="assertive" style={styles.fieldError}>{fieldErrors.displayName}</Text> : null}
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              accessibilityHint={fieldErrors.email}
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              maxLength={320}
              onChangeText={setEmail}
              onBlur={() => setFieldErrors((current) => ({ ...current, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : 'Enter a valid email address, such as name@example.com.' }))}
              placeholder="maya@example.com"
              placeholderTextColor={colors.muted}
              ref={emailRef}
              style={[styles.input, fieldErrors.email && styles.inputError]}
              value={email}
            />
            {fieldErrors.email ? <Text accessibilityLiveRegion="assertive" style={styles.fieldError}>{fieldErrors.email}</Text> : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={[styles.passwordRow, fieldErrors.password && styles.inputError]}>
              <TextInput
                accessibilityLabel="Password"
                accessibilityHint={fieldErrors.password || 'Use at least 12 characters.'}
                autoCapitalize="none"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                maxLength={128}
                onChangeText={setPassword}
                onBlur={() => setFieldErrors((current) => ({ ...current, password: password.length >= 12 ? undefined : 'Use at least 12 characters.' }))}
                placeholder="At least 12 characters"
                placeholderTextColor={colors.muted}
                ref={passwordRef}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                value={password}
              />
              <Pressable accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} accessibilityRole="button" onPress={() => setShowPassword((current) => !current)} style={({ pressed }) => [styles.passwordToggle, pressed && styles.modeButtonPressed]}>
                <Text style={styles.passwordToggleLabel}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>
            {fieldErrors.password ? <Text accessibilityLiveRegion="assertive" style={styles.fieldError}>{fieldErrors.password}</Text> : <Text style={styles.passwordHelp}>At least 12 characters. Password managers and paste are supported.</Text>}
          </View>

          {error ? (
            <View accessibilityLiveRegion="assertive" style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              isSubmitting && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>
              {isSubmitting ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={switchMode} style={({ pressed }) => [styles.modeButton, pressed && styles.modeButtonPressed]}>
            <Text style={styles.modeButtonLabel}>
              {mode === 'register' ? 'Already have an account? Sign in' : 'New to Alaga? Create an account'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  keyboardView: { flex: 1 },
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  brandBlock: { gap: spacing.sm, alignSelf: 'center', width: '100%', maxWidth: 520 },
  brand: { color: colors.ink, fontSize: 42, fontWeight: '800', letterSpacing: -1.8 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  title: { marginTop: spacing.md, color: colors.ink, fontSize: 31, fontWeight: '700', lineHeight: 38 },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  formCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: spacing.lg,
  },
  inputError: { borderColor: colors.error },
  fieldError: { color: colors.error, fontSize: 14, lineHeight: 20 },
  passwordRow: { minHeight: 52, flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.canvas, overflow: 'hidden' },
  passwordInput: { minHeight: 52, flex: 1, color: colors.ink, fontSize: 16, paddingHorizontal: spacing.md },
  passwordToggle: { minHeight: 52, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  passwordToggleLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  passwordHelp: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  formHeading: { gap: spacing.xs, marginBottom: spacing.sm },
  formTitle: { color: colors.ink, fontSize: 23, fontWeight: '800' },
  formHint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  field: { gap: spacing.sm },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  errorBox: { borderRadius: radii.sm, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: { backgroundColor: colors.primaryDark },
  primaryButtonLabel: { color: colors.white, fontSize: 17, fontWeight: '700' },
  buttonDisabled: { opacity: 0.55 },
  modeButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  modeButtonPressed: { backgroundColor: colors.mist },
  modeButtonLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
