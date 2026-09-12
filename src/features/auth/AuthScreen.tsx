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

import { AnimatedFeaturePills } from '../../components/AnimatedFeaturePills';
import { AppIcon } from '../../components/AppIcon';
import { WelcomingMascot } from '../../components/WelcomingMascot';
import { errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import { useAuth } from './AuthProvider';

export function AuthScreen() {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
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
    if (mode === 'register' && !displayName.trim()) problems.displayName = t('auth.nameError');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) problems.email = t('auth.emailError');
    if (password.length < 12) problems.password = t('auth.passwordError');
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
          <WelcomingMascot
            greetingText={t('auth.welcomeMascot')}
            size={112}
          />
          <View style={styles.brandLockup}>
            <Text accessibilityRole="header" style={styles.brand}>Alaga</Text>
          </View>
          <Text style={styles.kicker}>{t('auth.kicker')}</Text>
          <Text style={styles.title}>
            {t(mode === 'register' ? 'auth.registerTitle' : 'auth.signInTitle')}
          </Text>
          <Text style={styles.body}>{t('auth.body')}</Text>

          <AnimatedFeaturePills
            items={[
              {
                animation: 'pulse',
                description: t('auth.pillar1Desc'),
                icon: 'heart',
                iconColor: (c) => c.primary,
                id: 'pillar-meds',
                title: t('auth.pillar1Title'),
              },
              {
                animation: 'float',
                description: t('auth.pillar2Desc'),
                icon: 'users',
                iconColor: (c) => c.primaryDark,
                id: 'pillar-family',
                title: t('auth.pillar2Title'),
              },
              {
                animation: 'chime',
                description: t('auth.pillar3Desc'),
                icon: 'shield-check',
                iconColor: (c) => c.successDark,
                id: 'pillar-privacy',
                title: t('auth.pillar3Title'),
              },
            ]}
          />
        </View>

        <View style={styles.formCard}>
          <View style={styles.formHeading}>
            <Text accessibilityRole="header" style={styles.formTitle}>
              {t(mode === 'register' ? 'auth.createAccount' : 'auth.signIn')}
            </Text>
            <Text style={styles.formHint}>
              {t(mode === 'register' ? 'auth.registerHint' : 'auth.signInHint')}
            </Text>
          </View>

          {mode === 'register' ? (
            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.name')}</Text>
              <TextInput
                accessibilityLabel={t('auth.name')}
                accessibilityHint={fieldErrors.displayName}
                autoCapitalize="words"
                autoComplete="name"
                maxLength={80}
                onChangeText={setDisplayName}
                onBlur={() => setFieldErrors((current) => ({ ...current, displayName: displayName.trim() ? undefined : t('auth.nameError') }))}
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
            <Text style={styles.label}>{t('auth.email')}</Text>
            <TextInput
              accessibilityLabel={t('auth.email')}
              accessibilityHint={fieldErrors.email}
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              maxLength={320}
              onChangeText={setEmail}
              onBlur={() => setFieldErrors((current) => ({ ...current, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : t('auth.emailError') }))}
              placeholder="maya@example.com"
              placeholderTextColor={colors.muted}
              ref={emailRef}
              style={[styles.input, fieldErrors.email && styles.inputError]}
              value={email}
            />
            {fieldErrors.email ? <Text accessibilityLiveRegion="assertive" style={styles.fieldError}>{fieldErrors.email}</Text> : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.password')}</Text>
            <View style={[styles.passwordRow, fieldErrors.password && styles.inputError]}>
              <TextInput
                accessibilityLabel={t('auth.password')}
                accessibilityHint={fieldErrors.password || t('auth.passwordError')}
                autoCapitalize="none"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                maxLength={128}
                onChangeText={setPassword}
                onBlur={() => setFieldErrors((current) => ({ ...current, password: password.length >= 12 ? undefined : t('auth.passwordError') }))}
                placeholder={t('auth.passwordPlaceholder')}
                placeholderTextColor={colors.muted}
                ref={passwordRef}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                value={password}
              />
              <Pressable accessibilityLabel={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')} accessibilityRole="button" onPress={() => setShowPassword((current) => !current)} style={({ pressed }) => [styles.passwordToggle, pressed && styles.modeButtonPressed]}>
                <AppIcon color={colors.primaryDark} name={showPassword ? 'eye-off' : 'eye'} size={19} />
                <Text style={styles.passwordToggleLabel}>{t(showPassword ? 'auth.hide' : 'auth.show')}</Text>
              </Pressable>
            </View>
            {fieldErrors.password ? <Text accessibilityLiveRegion="assertive" style={styles.fieldError}>{fieldErrors.password}</Text> : <Text style={styles.passwordHelp}>{t('auth.passwordHelp')}</Text>}
          </View>

          {error ? (
            <View accessibilityLiveRegion="assertive" style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityLabel={t(isSubmitting ? 'auth.working' : mode === 'register' ? 'auth.createAccount' : 'auth.signIn')}
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              isSubmitting && styles.buttonDisabled,
            ]}
          >
            <AppIcon color={colors.white} name={mode === 'register' ? 'user-round-plus' : 'log-in'} size={20} />
            <Text style={styles.primaryButtonLabel}>
              {t(isSubmitting ? 'auth.working' : mode === 'register' ? 'auth.createAccount' : 'auth.signIn')}
            </Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={switchMode} style={({ pressed }) => [styles.modeButton, pressed && styles.modeButtonPressed]}>
            <Text style={styles.modeButtonLabel}>
              {t(mode === 'register' ? 'auth.modeSignIn' : 'auth.modeRegister')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel={t('auth.demoAccount')}
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={async () => {
              setMode('sign-in');
              setEmail('maya@example.test');
              setPassword('alaga-synthetic-only');
              setError(null);
              setFieldErrors({});
              setSubmitting(true);
              try {
                await signIn({ email: 'maya@example.test', password: 'alaga-synthetic-only' });
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setSubmitting(false);
              }
            }}
            style={({ pressed }) => [
              styles.demoButton,
              pressed && styles.modeButtonPressed,
              isSubmitting && styles.buttonDisabled,
            ]}
          >
            <AppIcon color={colors.primary} name="sparkles" size={18} />
            <Text style={styles.demoButtonLabel}>{t('auth.demoAccount')}</Text>
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
    paddingHorizontal: 20,
    paddingVertical: spacing.xl,
    backgroundColor: colors.canvas,
  },
  brandBlock: { gap: spacing.sm, alignSelf: 'center', width: '100%', maxWidth: 520, alignItems: 'center' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  brand: { color: colors.ink, fontSize: 36, fontWeight: '900', letterSpacing: -1.2, textAlign: 'center' },
  kicker: { color: colors.primaryDark, fontSize: 13, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { marginTop: 2, color: colors.ink, fontSize: 24, fontWeight: '800', lineHeight: 32, letterSpacing: -0.4, textAlign: 'center' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: spacing.sm },
  formCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: spacing.xl,
  },
  inputError: { borderColor: colors.error },
  fieldError: { color: colors.error, fontSize: 13, lineHeight: 18 },
  passwordRow: { minHeight: 50, flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.canvas, overflow: 'hidden' },
  passwordInput: { minHeight: 50, flex: 1, color: colors.ink, fontSize: 15, paddingHorizontal: spacing.md },
  passwordToggle: { minHeight: 50, minWidth: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.sm },
  passwordToggleLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  passwordHelp: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  formHeading: { gap: 4, marginBottom: spacing.xs },
  formTitle: { color: colors.ink, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  formHint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  field: { gap: 6 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.canvas,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: spacing.md,
  },
  errorBox: { borderRadius: radii.sm, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  primaryButtonPressed: { backgroundColor: colors.primaryDark },
  primaryButtonLabel: { color: colors.white, fontSize: 16, fontWeight: '800' },
  buttonDisabled: { opacity: 0.55 },
  modeButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.full, paddingHorizontal: spacing.sm },
  modeButtonPressed: { backgroundColor: colors.mist },
  modeButtonLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  demoButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.full,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  demoButtonLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
});
