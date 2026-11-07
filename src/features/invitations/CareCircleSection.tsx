import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/PressableScale';
import { ApiError, apiRequest, errorMessage } from '../../lib/api';
import { confirmAction } from '../../lib/confirm';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { memberRole, type MemberRole } from '../family/familyActivity';
import type { Patient } from '../patients/types';
import { useLocale } from '../settings/LocaleProvider';
import type { CopyKey } from '../settings/translations';
import type { CareCircleMember, CareCircleResponse, PatientInvitation } from './types';

type InviteInput = { email: string; canManageMedications: boolean };

const roleKeys: Record<MemberRole, CopyKey> = {
  owner: 'family.roleOwner',
  medicineManager: 'family.roleMedicineManager',
  caregiver: 'family.roleCaregiver',
};

function isForbidden(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

/**
 * The selected Patient's Care Circle, shown as "family": Members, then Pending invitations for the Primary care
 * manager. Everyone sees names and roles; only the Primary care manager sees emails, Remove and Invite someone.
 * A Self Profile nobody else shares yet gets the "Share your care log with family" invite instead.
 * Key it by patient id so a person switch starts with a closed form.
 */
export function CareCircleSection({ patient }: { patient: Patient }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const { session, token } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['care-circle', patient.id] as const;
  const isOwner = patient.role === 'owner';
  const [email, setEmail] = useState('');
  const [canManageMedications, setCanManageMedications] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastInvitation, setLastInvitation] = useState<PatientInvitation | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => apiRequest<CareCircleResponse>(`/patients/${patient.id}/care-circle`, { token }),
    // A database without the member read-out answers 403 to non-owners; asking again will not change that.
    retry: (failures, error) => !isForbidden(error) && failures < 1,
  });
  const inviteMutation = useMutation({
    mutationFn: (input: InviteInput) => apiRequest<{ invitation: PatientInvitation }>(
      `/patients/${patient.id}/invitations`,
      { method: 'POST', token, body: input },
    ),
    onSuccess: ({ invitation }) => {
      setEmail('');
      setCanManageMedications(false);
      setFormVisible(false);
      setNotice(t('family.inviteReady', { email: invitation.email }));
      setLastInvitation(invitation);
      return queryClient.invalidateQueries({ queryKey });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (invitation: PatientInvitation) => apiRequest(
      `/patients/${patient.id}/invitations/${invitation.id}/cancel`,
      { method: 'POST', token },
    ).then(() => invitation),
    onSuccess: (invitation) => {
      setNotice(t('family.cancelled', { email: invitation.email }));
      if (lastInvitation?.id === invitation.id) setLastInvitation(null);
      return queryClient.invalidateQueries({ queryKey });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (member: CareCircleMember) => apiRequest(
      `/patients/${patient.id}/members/${member.accountId}/revoke`,
      { method: 'POST', token },
    ).then(() => member),
    onSuccess: (member) => {
      setNotice(t('family.removed', { name: member.displayName, patient: patient.displayName }));
      return queryClient.invalidateQueries({ queryKey });
    },
  });

  const data = query.data;
  const others = data?.members.filter((member) => member.accountId !== session?.id) ?? [];
  const selfEmpty = isOwner && patient.isSelf && Boolean(data) && others.length === 0 && !data?.invitations.length;
  const actionError = inviteMutation.error || cancelMutation.error || revokeMutation.error;
  const readOnlyNote = patient.primaryCareManagerName
    ? t('family.readOnly', { manager: patient.primaryCareManagerName })
    : t('family.readOnlyUnnamed');

  const submitInvite = () => {
    setNotice(null);
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    inviteMutation.mutate({ email: normalized, canManageMedications });
  };

  const shareInvitation = () => {
    if (!lastInvitation) return;
    void Share.share({
      title: t('family.shareTitle', { patient: patient.displayName }),
      message: t('family.shareMessage', {
        patient: patient.displayName,
        email: lastInvitation.email,
        date: new Intl.DateTimeFormat(localeTag, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
          .format(new Date(lastInvitation.expiresAt)),
      }),
    }).catch(() => setNotice(t('family.shareError')));
  };

  const confirmRemove = (member: CareCircleMember) => {
    confirmAction({
      title: t('family.removeTitle', { name: member.displayName }),
      message: t('family.removeBody', { patient: patient.displayName }),
      confirmLabel: t('family.remove'),
      cancelLabel: t('family.keep'),
      destructive: true,
      onConfirm: () => revokeMutation.mutate(member),
    });
  };

  const inviteForm = (
    <View style={styles.form}>
      <Text style={styles.formTitle}>
        {patient.isSelf ? t('family.inviteTitleSelf') : t('family.inviteTitle', { patient: patient.displayName })}
      </Text>
      <Text style={styles.caption}>{t('family.inviteDelivery')}</Text>
      <TextInput
        accessibilityHint={emailError ? t('family.inviteEmailError') : undefined}
        accessibilityLabel={t('family.inviteEmail')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={(value) => {
          setEmail(value);
          if (emailError) setEmailError(false);
        }}
        onSubmitEditing={submitInvite}
        placeholder={t('family.inviteEmailPlaceholder')}
        placeholderTextColor={colors.muted}
        style={[styles.input, emailError && styles.inputError]}
        value={email}
      />
      {emailError ? (
        <Text accessibilityLiveRegion="assertive" style={styles.error}>{t('family.inviteEmailError')}</Text>
      ) : null}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: canManageMedications }}
        onPress={() => setCanManageMedications((current) => !current)}
        style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
      >
        <View style={[styles.checkbox, canManageMedications && styles.checkboxChecked]}>
          {canManageMedications ? <AppIcon color={colors.white} name="check" size={14} /> : null}
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.name}>{t('family.canManageMedicines')}</Text>
          <Text style={styles.caption}>{t('family.canManageMedicinesBody')}</Text>
        </View>
      </Pressable>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ busy: inviteMutation.isPending, disabled: inviteMutation.isPending || !email.trim() }}
        disabled={inviteMutation.isPending || !email.trim()}
        onPress={submitInvite}
        style={[styles.primaryButton, (inviteMutation.isPending || !email.trim()) && styles.disabled]}
      >
        <Text style={styles.primaryLabel}>
          {inviteMutation.isPending ? t('family.creatingInvite') : t('family.createInvite')}
        </Text>
      </PressableScale>
    </View>
  );

  const feedback = (
    <>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      {lastInvitation ? (
        <PressableScale accessibilityRole="button" onPress={shareInvitation} style={styles.outlineButton}>
          <AppIcon color={colors.ink} name="share-2" size={16} />
          <Text style={styles.outlineLabel}>{t('family.shareInvite')}</Text>
        </PressableScale>
      ) : null}
      {actionError ? (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
          {errorMessage(actionError)}
        </Text>
      ) : null}
    </>
  );

  if (selfEmpty) {
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{t('family.selfEmptyTitle')}</Text>
        <Text style={styles.body}>{t('family.selfEmptyBody')}</Text>
        {inviteForm}
        {feedback}
      </View>
    );
  }

  return (
    <>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{t('family.membersTitle')}</Text>
        {query.isLoading ? (
          <Text accessibilityLiveRegion="polite" style={styles.calm}>{t('family.membersLoading')}</Text>
        ) : !data && !isOwner && isForbidden(query.error) ? (
          <Text style={styles.calm}>
            {t('family.memberNote', { patient: patient.displayName })} {readOnlyNote}
          </Text>
        ) : !data ? (
          <View>
            <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage(query.error)}</Text>
            <PressableScale accessibilityRole="button" onPress={() => void query.refetch()} style={styles.textAction}>
              <Text style={styles.textActionLabel}>{t('app.retry')}</Text>
            </PressableScale>
          </View>
        ) : (
          <>
            {data.members.map((member) => {
              const isYou = member.accountId === session?.id;
              const role = t(roleKeys[memberRole(member)]);
              return (
                <View key={member.accountId} style={styles.row}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.name}>{member.displayName}</Text>
                    <Text style={styles.caption}>{isYou ? t('family.memberRoleYou', { role }) : role}</Text>
                    {isOwner && member.email ? <Text style={styles.caption}>{member.email}</Text> : null}
                  </View>
                  {isOwner && member.role === 'caregiver' && !isYou ? (
                    <PressableScale
                      accessibilityLabel={t('family.removeA11y', { name: member.displayName, patient: patient.displayName })}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: revokeMutation.isPending }}
                      disabled={revokeMutation.isPending}
                      onPress={() => confirmRemove(member)}
                      style={styles.textAction}
                    >
                      <Text style={styles.destructiveLabel}>{t('family.remove')}</Text>
                    </PressableScale>
                  ) : null}
                </View>
              );
            })}
            {isOwner ? (
              <View style={styles.inviteBlock}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ expanded: formVisible }}
                  onPress={() => setFormVisible((current) => !current)}
                  style={styles.outlineButton}
                >
                  <AppIcon color={colors.ink} name={formVisible ? 'x' : 'user-plus'} size={16} />
                  <Text style={styles.outlineLabel}>{formVisible ? t('family.closeInvite') : t('family.inviteSomeone')}</Text>
                </PressableScale>
                {formVisible ? inviteForm : null}
                {feedback}
              </View>
            ) : (
              <Text style={styles.calm}>{readOnlyNote}</Text>
            )}
          </>
        )}
      </View>

      {isOwner && data?.invitations.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{t('family.pendingTitle')}</Text>
          {data.invitations.map((invitation) => (
            <View key={invitation.id} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.name}>{invitation.email}</Text>
                <Text style={styles.caption}>
                  {t('family.pendingDetail', {
                    role: t(roleKeys[memberRole({ role: 'caregiver', canManageMedications: invitation.canManageMedications })]),
                    date: new Intl.DateTimeFormat(localeTag, { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
                      .format(new Date(invitation.expiresAt)),
                  })}
                </Text>
              </View>
              <PressableScale
                accessibilityLabel={t('family.cancelA11y', { email: invitation.email })}
                accessibilityRole="button"
                accessibilityState={{ disabled: cancelMutation.isPending }}
                disabled={cancelMutation.isPending}
                onPress={() => cancelMutation.mutate(invitation)}
                style={[styles.textAction, cancelMutation.isPending && styles.disabled]}
              >
                <Text style={styles.destructiveLabel}>{t('family.cancel')}</Text>
              </PressableScale>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  sectionTitle: {
    ...sectionTitle,
    color: colors.ink,
    paddingVertical: spacing.xs,
  },
  body: {
    ...typography.body,
    color: colors.muted,
    paddingBottom: spacing.sm,
  },
  calm: {
    ...typography.body,
    color: colors.muted,
    paddingVertical: spacing.sm,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingVertical: spacing.sm,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
  caption: {
    ...typography.caption,
    color: colors.muted,
  },
  textAction: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  textActionLabel: {
    ...typography.bodyEmphasis,
    color: colors.primaryDark,
  },
  destructiveLabel: {
    ...typography.bodyEmphasis,
    color: colors.error,
  },
  inviteBlock: {
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  outlineButton: {
    minHeight: 48,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  outlineLabel: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
  form: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  formTitle: {
    ...typography.headline,
    color: colors.ink,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: colors.error,
  },
  checkRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.xs,
    backgroundColor: colors.white,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: {
    ...typography.bodyEmphasis,
    color: colors.white,
    fontWeight: '700',
  },
  notice: {
    ...typography.body,
    color: colors.ink,
  },
  error: {
    ...typography.body,
    color: colors.error,
    paddingVertical: spacing.xs,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
});
