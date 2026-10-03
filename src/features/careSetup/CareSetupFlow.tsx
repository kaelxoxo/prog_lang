import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AccessibilityInfo, Animated, BackHandler, Easing, Keyboard, KeyboardAvoidingView,
  Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { ApiError, apiRequest, errorMessage } from '../../lib/api';
import { confirmAction } from '../../lib/confirm';
import { durations, radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { SetupBantay, type SetupBantayPose } from '../assistant/SetupBantay';
import { useAuth, type CareSetup } from '../auth/AuthProvider';
import type { IncomingInvitation, PatientInvitation } from '../invitations/types';
import { usePatient } from '../patients/PatientProvider';
import { useLocale } from '../settings/LocaleProvider';
import type { CopyKey } from '../settings/translations';

export type CareSetupFinishTarget = 'home' | 'addMedicine';
type Step = 'check' | 'invitations' | 'invitedRole' | 'question' | 'self' | 'professionalQuestion' | 'person' | 'invite' | 'waiting' | 'done';
type Choice = CareSetup | 'waiting';
type InviteInput = { email: string; canManageMedications: boolean };

type Props = { onFinish: (target: CareSetupFinishTarget) => void };

const choiceDetails: Record<Choice, { title: CopyKey; description: CopyKey; icon: 'heart' | 'users' | 'briefcase-business' | 'mail'; pose: SetupBantayPose }> = {
  self: { title: 'setup.self', description: 'setup.selfDesc', icon: 'heart', pose: 'self' },
  family: { title: 'setup.family', description: 'setup.familyDesc', icon: 'users', pose: 'family' },
  professional: { title: 'setup.professional', description: 'setup.professionalDesc', icon: 'briefcase-business', pose: 'professional' },
  waiting: { title: 'setup.waiting', description: 'setup.waitingDesc', icon: 'mail', pose: 'waiting' },
};

function SetupButton({ label, onPress, disabled = false, secondary = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary ? styles.secondaryButton : styles.primaryButton,
        disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={secondary ? styles.secondaryLabel : styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

function ChoiceRow({ value, selected, disabled, onPress }: { value: Choice; selected: boolean; disabled: boolean; onPress: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const scale = useRef(new Animated.Value(1)).current;
  const details = choiceDetails[value];
  return (
    <Pressable
      accessibilityLabel={`${t(details.title)}. ${t(details.description)}`}
      accessibilityRole="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => Animated.timing(scale, { toValue: 0.98, duration: durations.instant, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(scale, { toValue: 1, duration: durations.instant, useNativeDriver: true }).start()}
    >
      <Animated.View style={[styles.choice, { transform: [{ scale }] }]}>
        <AppIcon color={selected ? colors.primary : colors.muted} name={details.icon} size={22} />
        <View style={styles.choiceCopy}>
          <Text style={[styles.choiceTitle, selected && styles.choiceTitleSelected]}>{t(details.title)}</Text>
          <Text style={styles.choiceDescription}>{t(details.description)}</Text>
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function CareSetupFlow({ onFinish }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t, localeTag } = useLocale();
  const { session, token, setCareSetup, signOut } = useAuth();
  const { createPatient, selectPatient } = usePatient();
  const queryClient = useQueryClient();
  const { fontScale } = useWindowDimensions();
  const [step, setStep] = useState<Step>('check');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [roleChoice, setRoleChoice] = useState<'family' | 'professional' | null>(null);
  const [invites, setInvites] = useState<IncomingInvitation[]>([]);
  const [acceptedName, setAcceptedName] = useState('');
  const [name, setName] = useState(session?.displayName ?? '');
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [email, setEmail] = useState('');
  const [canManageMedications, setCanManageMedications] = useState(false);
  const [addedInvites, setAddedInvites] = useState<PatientInvitation[]>([]);
  const [fieldError, setFieldError] = useState<CopyKey | null>(null);
  const [actionError, setActionError] = useState<CopyKey | null>(null);
  const [reactionKey, setReactionKey] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [waitingFrom, setWaitingFrom] = useState<'question' | 'professionalQuestion'>('question');
  const stage = useRef(new Animated.Value(1)).current;
  const checkedInitialInvites = useRef(false);

  const invitationsQuery = useQuery({
    queryKey: ['invitations'],
    queryFn: () => apiRequest<{ invitations: IncomingInvitation[] }>('/invitations', { token }),
    retry: false,
    refetchOnMount: 'always',
    enabled: step === 'check' || step === 'waiting',
  });

  useEffect(() => {
    // Decide only on a response fetched for this visit, never on whatever the cache held.
    if (step !== 'check' || invitationsQuery.isFetching || !invitationsQuery.data || checkedInitialInvites.current) return;
    checkedInitialInvites.current = true;
    setInvites(invitationsQuery.data.invitations);
    setStep(invitationsQuery.data.invitations.length ? 'invitations' : 'question');
  }, [step, invitationsQuery.data, invitationsQuery.isFetching]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const change = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { active = false; change.remove(); show.remove(); hide.remove(); };
  }, []);

  // Taps that land while the next step animates in belong to the previous step; drop them so a double tap can't skip ahead.
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    stage.setValue(0);
    setSettling(true);
    Animated.timing(stage, { toValue: 1, duration: durations.stateChange,
      easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const settle = setTimeout(() => setSettling(false), durations.stateChange);
    return () => clearTimeout(settle);
  }, [step, stage]);

  const invitationMutation = useMutation({
    mutationFn: ({ invitation, action }: { invitation: IncomingInvitation; action: 'accept' | 'decline' }) =>
      apiRequest<{ patientId: string }>(`/invitations/${invitation.id}/${action}`, { method: 'POST', token }),
    onSuccess: (result, variables) => {
      const remaining = invites.filter((invitation) => invitation.id !== variables.invitation.id);
      setInvites(remaining);
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
      if (variables.action === 'accept') {
        selectPatient(result.patientId);
        void queryClient.invalidateQueries({ queryKey: ['patients'] });
        setAcceptedName(variables.invitation.patientName);
        setStep('invitedRole');
      } else if (!remaining.length) setStep('question');
    },
    onError: async (failure, variables) => {
      if (!(failure instanceof ApiError) || failure.status !== 409) return;
      // The Owner cancelled it, or it expired or was answered elsewhere: show only what is still pending.
      const fresh = await invitationsQuery.refetch();
      const pending = (fresh.data?.invitations ?? []).filter((invitation) => invitation.id !== variables.invitation.id);
      setInvites(pending);
      if (!pending.length) go('question');
      setActionError('setup.invitationGone');
    },
  });
  const setupMutation = useMutation({ mutationFn: (next: CareSetup) => setCareSetup(next) });
  const createMutation = useMutation({ mutationFn: (input: { displayName: string; isSelf: boolean }) =>
    createPatient(input.displayName, { isSelf: input.isSelf }),
  });
  const inviteMutation = useMutation({
    mutationFn: (input: InviteInput) => apiRequest<{ invitation: PatientInvitation }>(
      `/patients/${patientId}/invitations`, { method: 'POST', token, body: input },
    ),
    onSuccess: ({ invitation }) => {
      setAddedInvites((current) => [...current, invitation]);
      setEmail('');
      setCanManageMedications(false);
      setReactionKey((current) => current + 1);
      void queryClient.invalidateQueries({ queryKey: ['care-circle', patientId] });
    },
  });

  const busy = invitationMutation.isPending || setupMutation.isPending || createMutation.isPending || inviteMutation.isPending;
  const mutationError = invitationMutation.error ?? setupMutation.error ?? createMutation.error ?? inviteMutation.error;
  const sessionExpired = [mutationError, invitationsQuery.error].some((failure) => failure instanceof ApiError && failure.kind === 'auth');
  const go = (next: Step) => {
    setFieldError(null);
    setActionError(null);
    invitationMutation.reset();
    setupMutation.reset();
    createMutation.reset();
    inviteMutation.reset();
    setStep(next);
  };
  const goBack = () => {
    if (busy) return;
    if (step === 'invitations') go('question');
    else if (step === 'self' || step === 'professionalQuestion') go('question');
    else if (step === 'person') go(choice === 'professional' ? 'professionalQuestion' : 'question');
    else if (step === 'waiting') go(waitingFrom);
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy) return true;
      // First screens have nothing behind them: let Android leave the app as usual.
      if (step === 'check' || step === 'question') return false;
      if (step === 'done' || step === 'invitedRole') onFinish('home');
      else if (step === 'invite') go('done');
      else goBack();
      return true;
    });
    return () => subscription.remove();
  });

  const chooseSetup = () => {
    if (!choice || busy) return;
    if (choice === 'waiting') { setWaitingFrom('question'); go('waiting'); return; }
    // The Care Setup is saved once its first profile exists, so abandoning mid-path brings the flow back.
    setName(choice === 'self' ? session?.displayName ?? '' : '');
    go(choice === 'self' ? 'self' : choice === 'professional' ? 'professionalQuestion' : 'person');
  };
  const chooseInvitedRole = async () => {
    if (!roleChoice || busy) return;
    try { await setupMutation.mutateAsync(roleChoice); onFinish('home'); }
    catch { /* Mutation error is displayed inline. */ }
  };
  const createProfile = async (isSelf: boolean) => {
    if (!choice || choice === 'waiting') return;
    const displayName = name.trim();
    if (!patientId && !displayName) { setFieldError('setup.nameError'); return; }
    setFieldError(null);
    try {
      if (!patientId) {
        const patient = await createMutation.mutateAsync({ displayName, isSelf });
        setPatientId(patient.id);
        setPatientName(patient.displayName);
      }
      if (session?.careSetup !== choice) await setupMutation.mutateAsync(choice);
      go(isSelf ? 'done' : 'invite');
    } catch { /* Mutation error is displayed inline. */ }
  };
  const addInvitation = async () => {
    if (!patientId) return;
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setFieldError('setup.emailError'); return; }
    setFieldError(null);
    try { await inviteMutation.mutateAsync({ email: normalized, canManageMedications }); }
    catch { /* Mutation error is displayed inline. */ }
  };
  const shareInvite = async (invitation: PatientInvitation) => {
    try {
      await Share.share({
        title: t('setup.shareTitle', { patient: patientName }),
        message: t('setup.shareMessage', { patient: patientName, email: invitation.email,
          date: new Intl.DateTimeFormat(localeTag, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(invitation.expiresAt)) }),
      });
    } catch { setActionError('setup.shareError'); }
  };
  const shareEmail = async () => {
    try { await Share.share({ title: t('setup.shareEmailTitle'),
      message: t('setup.shareEmailMessage', { email: session?.email ?? '' }) }); }
    catch { setActionError('setup.shareError'); }
  };
  const checkAgain = async () => {
    setActionError(null);
    const response = await invitationsQuery.refetch();
    if (response.error) return;
    if (response.data?.invitations.length) { setInvites(response.data.invitations); go('invitations'); }
    else setActionError('setup.noInvitations');
  };

  const pose: SetupBantayPose = step === 'check' || step === 'invitations' ? 'letter'
    : step === 'invitedRole' ? roleChoice ?? 'family'
    : step === 'question' ? choice ? choiceDetails[choice].pose : 'family'
    : step === 'self' || step === 'person' ? 'writing'
    : step === 'professionalQuestion' ? 'professional'
    : step === 'invite' ? 'sending'
    : step === 'waiting' ? 'waiting' : 'stamp';
  const mascotLabels: Record<SetupBantayPose, CopyKey> = {
    letter: 'setup.mascotLetter', self: 'setup.mascotSelf', family: 'setup.mascotFamily',
    professional: 'setup.mascotProfessional', waiting: 'setup.mascotWaiting',
    writing: 'setup.mascotWriting', sending: 'setup.mascotSending', stamp: 'setup.mascotStamp',
  };
  const stepNumber = step === 'check' || step === 'invitations' ? 1 : step === 'question' || step === 'invitedRole' ? 2
    : step === 'self' || step === 'person' || step === 'professionalQuestion' || step === 'waiting' ? 3 : step === 'invite' ? 4 : 5;
  const titleKey: CopyKey = step === 'check' ? invitationsQuery.isError ? 'setup.loadErrorTitle' : 'setup.loadingTitle'
    : step === 'invitations' ? 'setup.invitationTitle' : step === 'invitedRole' ? 'setup.invitedRoleTitle'
    : step === 'question' ? 'setup.questionTitle' : step === 'self' ? 'setup.selfTitle'
    : step === 'professionalQuestion' ? 'setup.professionalTitle' : step === 'person' ? 'setup.personTitle'
    : step === 'invite' ? 'setup.inviteTitle' : step === 'waiting' ? 'setup.waitingTitle'
    : choice === 'self' ? 'setup.doneSelfTitle' : 'setup.doneTitle';
  const bodyKey: CopyKey = step === 'check' ? invitationsQuery.isError ? 'setup.loadErrorBody' : 'setup.loadingBody'
    : step === 'invitations' ? 'setup.invitationBody' : step === 'invitedRole' ? 'setup.invitedRoleBody'
    : step === 'question' ? 'setup.questionBody' : step === 'self' ? 'setup.selfBody'
    : step === 'professionalQuestion' ? 'setup.professionalBody' : step === 'person' ? 'setup.personBody'
    : step === 'invite' ? 'setup.inviteBody' : step === 'waiting' ? 'setup.waitingBody'
    : choice === 'self' ? 'setup.doneSelfBody' : 'setup.donePersonBody';
  const errorText = fieldError ? t(fieldError) : actionError ? t(actionError) : mutationError ? errorMessage(mutationError) : null;
  const checking = step === 'check' && (invitationsQuery.isLoading || invitationsQuery.isFetching);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, settling && styles.settling]}>
      <View accessibilityLabel={t('setup.progress', { step: stepNumber, total: 5 })} accessibilityRole="progressbar" style={styles.progress}>
        {[1, 2, 3, 4, 5].map((number) => <View key={number} style={[styles.progressTrack, number <= stepNumber && styles.progressFill]} />)}
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {step !== 'check' && step !== 'done' && step !== 'question' && step !== 'invitedRole' && step !== 'invite' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('setup.back')} disabled={busy}
            onPress={goBack} style={styles.back}>
            <AppIcon color={colors.muted} name="arrow-left" size={20} />
            <Text style={styles.backText}>{t('setup.back')}</Text>
          </Pressable>
        ) : null}
        <Animated.View style={{ opacity: stage, transform: [{ translateX: reducedMotion ? 0 : stage.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <View style={[styles.mascot, (keyboardOpen || fontScale >= 1.3) && styles.compactMascot]}><SetupBantay pose={pose} size={160} compact={keyboardOpen || fontScale >= 1.3}
            reactionKey={reactionKey} accessibilityLabel={t(mascotLabels[pose])} /></View>
          <Text accessibilityRole="header" style={styles.title}>{t(titleKey, { patient: acceptedName })}</Text>
          <Text style={styles.body}>{t(bodyKey, { patient: patientName })}</Text>

          {step === 'invitations' ? invites.map((invitation) => (
            <View key={invitation.id} style={styles.invitation}>
              <Text style={styles.invitationLine}>{t('setup.invitationLine', { owner: invitation.invitedByName, patient: invitation.patientName })}</Text>
              <View style={styles.invitationActions}>
                <SetupButton label={invitationMutation.isPending && invitationMutation.variables?.invitation.id === invitation.id ? t('setup.saving') : t('setup.accept')}
                  disabled={busy} onPress={() => invitationMutation.mutate({ invitation, action: 'accept' })} />
                <SetupButton secondary label={t('setup.decline')} disabled={busy} onPress={() => confirmAction({
                  title: t('setup.declineTitle'),
                  message: t('setup.declineConfirm', { owner: invitation.invitedByName, patient: invitation.patientName }),
                  cancelLabel: t('setup.keep'),
                  confirmLabel: t('setup.decline'),
                  destructive: true,
                  onConfirm: () => invitationMutation.mutate({ invitation, action: 'decline' }),
                })} />
              </View>
            </View>
          )) : null}
          {step === 'question' || step === 'invitedRole' ? (
            <View accessibilityRole="radiogroup" style={styles.choices}>
              {(step === 'question' ? ['self', 'family', 'professional', 'waiting'] as Choice[] : ['family', 'professional'] as Choice[])
                .map((item) => <ChoiceRow key={item} value={item} disabled={busy} selected={(step === 'question' ? choice : roleChoice) === item}
                  onPress={() => { if (step === 'question') setChoice(item); else setRoleChoice(item as 'family' | 'professional'); }} />)}
            </View>
          ) : null}
          {step === 'self' || step === 'person' ? (
            <View style={styles.form}>
              <Text style={styles.label}>{t(step === 'self' ? 'setup.yourName' : 'setup.personName')}</Text>
              <TextInput accessibilityLabel={t(step === 'self' ? 'setup.yourName' : 'setup.personName')}
                autoCapitalize="words" autoComplete="name" maxLength={80} value={patientId && step === 'person' ? patientName : name}
                editable={!patientId}
                onChangeText={(value) => {
                  setName(value); setFieldError(null); setReactionKey((current) => current + 1);
                }} style={styles.input} placeholder={t(step === 'self' ? 'setup.yourName' : 'setup.personName')}
                placeholderTextColor={colors.muted} returnKeyType="done" />
            </View>
          ) : null}
          {step === 'invite' ? (
            <View style={styles.form}>
              <Text style={styles.label}>{t('setup.email')}</Text>
              <TextInput accessibilityLabel={t('setup.email')} autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={320}
                value={email} onChangeText={(value) => { setEmail(value); setFieldError(null); }}
                placeholder={t('setup.emailPlaceholder')} placeholderTextColor={colors.muted} style={styles.input} />
              <Pressable accessibilityRole="checkbox" aria-checked={canManageMedications} aria-disabled={busy}
                disabled={busy} onPress={() => setCanManageMedications((current) => !current)} style={styles.checkboxRow}>
                <View style={[styles.checkbox, canManageMedications && styles.checkboxChecked]}>
                  {canManageMedications ? <AppIcon color={colors.white} name="check" size={16} /> : null}
                </View>
                <View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{t('setup.manageMedicines')}</Text>
                  <Text style={styles.choiceDescription}>{t('setup.manageMedicinesHint')}</Text></View>
              </Pressable>
              <SetupButton secondary label={inviteMutation.isPending ? t('setup.saving') : t('setup.addInvite')}
                disabled={busy || !email.trim()} onPress={() => void addInvitation()} />
              {addedInvites.map((invitation) => (
                <View key={invitation.id} style={styles.addedRow}>
                  <Text style={styles.addedText}>{t('setup.added', { email: invitation.email })}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${t('setup.share')}: ${invitation.email}`}
                    onPress={() => void shareInvite(invitation)} style={styles.shareButton}>
                    <AppIcon color={colors.primary} name="send" size={17} /><Text style={styles.shareLabel}>{t('setup.share')}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          {step === 'waiting' ? <Text selectable style={styles.emailHighlight}>{session?.email}</Text> : null}
          {errorText ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorText}</Text> : null}
          {step === 'waiting' && invitationsQuery.isError && !invitationsQuery.isFetching
            ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{t('setup.checkError')}</Text> : null}
        </Animated.View>
      </ScrollView>
      <View style={styles.footer}>
        {sessionExpired ? <SetupButton label={t('setup.signInAgain')} onPress={() => void signOut()} />
        : step === 'check' ? invitationsQuery.isError && !invitationsQuery.isFetching ? (
          <><SetupButton label={t('setup.retry')} onPress={() => void invitationsQuery.refetch()} />
            <SetupButton secondary label={t('setup.continueUnchecked')} onPress={() => go('question')} /></>
        ) : checking ? <Text style={styles.loading}>{t('setup.loadingTitle')}</Text> : null
        : step === 'invitedRole' ? <><SetupButton label={setupMutation.isPending ? t('setup.saving') : t('setup.continue')}
            disabled={busy || !roleChoice} onPress={() => void chooseInvitedRole()} />
            <SetupButton secondary label={t('setup.skip')} disabled={busy} onPress={() => onFinish('home')} /></>
        : step === 'question' ? <><SetupButton label={setupMutation.isPending ? t('setup.saving') : t('setup.continue')}
            disabled={busy || !choice} onPress={() => void chooseSetup()} />
            <SetupButton secondary label={t('setup.later')} disabled={busy} onPress={() => onFinish('home')} /></>
        : step === 'self' || step === 'person' ? <SetupButton label={createMutation.isPending ? t('setup.saving') : t(step === 'self' ? 'setup.createSelf' : 'setup.createPerson')}
            disabled={busy} onPress={() => void createProfile(step === 'self')} />
        : step === 'professionalQuestion' ? <><SetupButton label={t('setup.yes')} disabled={busy} onPress={() => { setWaitingFrom('professionalQuestion'); go('waiting'); }} />
            <SetupButton secondary label={t('setup.no')} disabled={busy} onPress={() => { setName(''); go('person'); }} /></>
        : step === 'invite' ? <SetupButton secondary={!addedInvites.length} label={t(addedInvites.length ? 'setup.continue' : 'setup.skip')} disabled={busy} onPress={() => go('done')} />
        : step === 'waiting' ? <><SetupButton label={invitationsQuery.isFetching ? t('setup.loadingTitle') : t('setup.checkAgain')}
            disabled={busy || invitationsQuery.isFetching} onPress={() => void checkAgain()} />
            <SetupButton secondary label={t('setup.share')} disabled={busy} onPress={() => void shareEmail()} />
            <Pressable accessibilityRole="button" disabled={busy} style={styles.quiet} onPress={() => go('question')}><Text style={styles.quietText}>{t('setup.backChoices')}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} style={styles.quiet} onPress={() => onFinish('home')}><Text style={styles.quietText}>{t('setup.later')}</Text></Pressable></>
        : step === 'done' ? <><SetupButton label={t('setup.addMedicine')} onPress={() => onFinish('addMedicine')} />
            <SetupButton secondary label={t('setup.goHome')} onPress={() => onFinish('home')} /></> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  settling: { pointerEvents: 'none' },
  progress: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  progressTrack: { flex: 1, height: 3, borderRadius: radii.full, backgroundColor: colors.line },
  progressFill: { backgroundColor: colors.primary },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: spacing.xs, alignSelf: 'flex-start' },
  backText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  mascot: { alignItems: 'center', justifyContent: 'center', minHeight: 168, marginTop: spacing.sm, marginBottom: spacing.lg },
  compactMascot: { minHeight: 100, marginBottom: spacing.sm },
  title: { color: colors.ink, fontSize: 27, fontWeight: '800', lineHeight: 34, letterSpacing: -0.6, marginBottom: spacing.sm },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23, marginBottom: spacing.lg },
  choices: { gap: spacing.xs },
  // No card chrome: rows sit directly on the canvas; selection shows as a filled radio and emphasized title.
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm },
  choiceCopy: { flex: 1, gap: spacing.xs },
  choiceTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  choiceTitleSelected: { color: colors.primary, fontWeight: '800' },
  radio: { height: 24, width: 24, borderRadius: radii.full, borderWidth: 2, borderColor: colors.controlBorder,
    alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.primary },
  radioDot: { height: 12, width: 12, borderRadius: radii.full, backgroundColor: colors.primary },
  choiceDescription: { color: colors.muted, fontSize: 14, lineHeight: 19 },
  invitation: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, gap: spacing.sm },
  invitationLine: { color: colors.ink, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  invitationActions: { gap: spacing.sm },
  form: { gap: spacing.md },
  label: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  input: { backgroundColor: colors.white, color: colors.ink, minHeight: 52, borderWidth: 1, borderColor: colors.controlBorder,
    borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: 16 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  checkbox: { height: 24, width: 24, borderRadius: radii.xs, borderWidth: 1, borderColor: colors.controlBorder,
    alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  addedRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing.sm, gap: spacing.xs },
  addedText: { color: colors.ink, fontSize: 14 },
  shareButton: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: spacing.sm, alignSelf: 'flex-start' },
  shareLabel: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  emailHighlight: { color: colors.ink, fontSize: 20, fontWeight: '800', paddingVertical: spacing.md },
  error: { color: colors.error, fontSize: 14, lineHeight: 20, marginTop: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.sm,
    width: '100%', maxWidth: 560, alignSelf: 'center' },
  button: { minHeight: 52, borderRadius: radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  primaryButton: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondaryButton: { backgroundColor: 'transparent', borderColor: 'transparent' },
  primaryLabel: { color: colors.canvas === '#0D1F18' ? '#0D1F18' : '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  secondaryLabel: { color: colors.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.98 }] },
  quiet: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  quietText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  loading: { color: colors.muted, textAlign: 'center', fontSize: 14 },
});
