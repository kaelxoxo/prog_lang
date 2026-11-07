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
import { PressableScale } from '../../components/PressableScale';
import { WelcomingMascot } from '../../components/WelcomingMascot';
import { errorMessage } from '../../lib/api';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import { useAuth } from './AuthProvider';

type Props = {
  onOpenWelcomeStory?: () => void;
};

export function AuthScreen({ onOpenWelcomeStory }: Props = {}) {
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
          <WelcomingMascot size={112} />
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
                description: t('auth.pillar1Desc'),
                icon: 'heart',
                iconColor: (c) => c.primary,
                id: 'pillar-meds',
                title: t('auth.pillar1Title'),
              },
              {
                description: t('auth.pillar2Desc'),
                icon: 'users',
                iconColor: (c) => c.inkLine,
                id: 'pillar-family',
                title: t('auth.pillar2Title'),
              },
              {
                description: t('auth.pillar3Desc'),
                icon: 'shield-check',
                iconColor: (c) => c.inkLine,
                id: 'pillar-privacy',
                title: t('auth.pillar3Title'),
              },
            ]}
          />

          {onOpenWelcomeStory ? (
            <PressableScale
              accessibilityHint={t('auth.meetBantayHint')}
              accessibilityLabel={t('auth.meetBantayLink')}
              accessibilityRole="button"
              onPress={onOpenWelcomeStory}
              style={styles.storyLink}
            >
              <Text style={styles.storyLinkLabel}>{t('auth.meetBantayLink')}</Text>
              <AppIcon color={colors.primaryDark} name="arrow-right" size={16} />
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.formSection}>
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
              <Pressable accessibilityLabel={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')} accessibilityRole="button" onPress={() => setShowPassword((current) => !current)} style={({ pressed }) => [styles.passwordToggle, pressed && styles.togglePressed]}>
                <AppIcon color={colors.primaryDark} name={showPassword ? 'eye-off' : 'eye'} size={19} />
                <Text style={styles.passwordToggleLabel}>{t(showPassword ? 'auth.hide' : 'auth.show')}</Text>
              </Pressable>
            </View>
            {fieldErrors.password ? <Text accessibilityLiveRegion="assertive" style={styles.fieldError}>{fieldErrors.password}</Text> : <Text style={styles.passwordHelp}>{t('auth.passwordHelp')}</Text>}
          </View>

          {error ? (
            <View accessibilityLiveRegion="assertive" style={styles.errorRow}>
              <AppIcon color={colors.error} name="circle-alert" size={16} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <PressableScale
            accessibilityLabel={t(isSubmitting ? 'auth.working' : mode === 'register' ? 'auth.createAccount' : 'auth.signIn')}
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void submit()}
            style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
          >
            <AppIcon color={colors.white} name={mode === 'register' ? 'user-round-plus' : 'log-in'} size={20} />
            <Text style={styles.primaryButtonLabel}>
              {t(isSubmitting ? 'auth.working' : mode === 'register' ? 'auth.createAccount' : 'auth.signIn')}
            </Text>
          </PressableScale>

          <PressableScale accessibilityRole="button" onPress={switchMode} style={styles.modeButton}>
            <Text style={styles.modeButtonLabel}>
              {t(mode === 'register' ? 'auth.modeSignIn' : 'auth.modeRegister')}
            </Text>
          </PressableScale>

          <PressableScale
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
            style={[styles.demoButton, isSubmitting && styles.buttonDisabled]}
          >
            <AppIcon color={colors.ink} name="user-round" size={18} />
            <Text style={styles.demoButtonLabel}>{t('auth.demoAccount')}</Text>
          </PressableScale>
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
    gap: spacing.lg,
    paddingHorizontal: 20,
    paddingVertical: spacing.xl,
    backgroundColor: colors.canvas,
  },
  brandBlock: { gap: spacing.sm, alignSelf: 'center', width: '100%', maxWidth: 520, alignItems: 'center' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  brand: { ...typography.hero, color: colors.ink, textAlign: 'center' },
  kicker: { ...typography.caption, color: colors.muted, textAlign: 'center' },
  title: { ...typography.title1, marginTop: 2, color: colors.ink, textAlign: 'center' },
  body: { ...typography.body, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.sm },
  formSection: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  inputError: { borderColor: colors.error },
  fieldError: { ...typography.caption, fontWeight: '400', color: colors.error },
  passwordRow: { minHeight: 50, flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.surface, overflow: 'hidden' },
  passwordInput: { minHeight: 50, flex: 1, color: colors.ink, fontSize: 15, paddingHorizontal: spacing.md },
  passwordToggle: { minHeight: 50, minWidth: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.sm },
  togglePressed: { backgroundColor: colors.canvasSubtle },
  passwordToggleLabel: { ...typography.caption, fontWeight: '700', color: colors.primaryDark },
  passwordHelp: { ...typography.caption, fontWeight: '400', color: colors.muted },
  formHeading: { gap: 4, marginBottom: spacing.xs },
  formTitle: { ...sectionTitle, color: colors.ink },
  formHint: { ...typography.body, color: colors.muted },
  field: { gap: 6 },
  label: { ...typography.caption, fontWeight: '600', color: colors.ink },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: spacing.md,
  },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  errorText: { ...typography.body, flex: 1, color: colors.error },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  primaryButtonLabel: { ...typography.headline, color: colors.white },
  buttonDisabled: { opacity: 0.55 },
  modeButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, paddingHorizontal: spacing.sm },
  modeButtonLabel: { ...typography.bodyEmphasis, color: colors.primaryDark, textAlign: 'center' },
  demoButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  demoButtonLabel: { ...typography.bodyEmphasis, color: colors.ink },
  storyLink: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  storyLinkLabel: {
    ...typography.bodyEmphasis,
    color: colors.primaryDark,
    textAlign: 'center',
  },
});
