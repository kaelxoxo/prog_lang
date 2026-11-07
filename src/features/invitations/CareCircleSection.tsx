import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest, errorMessage } from '../../lib/api';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import type { CareCircleMember, CareCircleResponse, PatientInvitation } from './types';

type Props = { patient: Patient };
type InviteInput = { email: string; canManageMedications: boolean };

function permissionCopy(member: CareCircleMember) {
  if (member.role === 'owner') return 'Owner';
  return member.canManageMedications ? 'Care manager' : 'Caregiver';
}

export function CareCircleSection({ patient }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { session, token } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['care-circle', patient.id] as const;
  const [email, setEmail] = useState('');
  const [canManageMedications, setCanManageMedications] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [lastInvitation, setLastInvitation] = useState<PatientInvitation | null>(null);

  useEffect(() => {
    setEmail('');
    setCanManageMedications(false);
    setNotice(null);
    setExpanded(false);
    setShowInviteForm(false);
    setEmailError(null);
    setLastInvitation(null);
  }, [patient.id]);

  const query = useQuery({
    queryKey,
    enabled: patient.role === 'owner',
    queryFn: () => apiRequest<CareCircleResponse>(`/patients/${patient.id}/care-circle`, { token }),
  });
  const inviteMutation = useMutation({
    mutationFn: (input: InviteInput) => apiRequest<{ invitation: PatientInvitation }>(
      `/patients/${patient.id}/invitations`,
      { method: 'POST', token, body: input },
    ),
    onSuccess: ({ invitation }) => {
      setEmail('');
      setCanManageMedications(false);
      setShowInviteForm(false);
      setNotice(`Invitation ready for ${invitation.email}.`);
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
      setNotice(`Invitation for ${invitation.email} was cancelled.`);
      return queryClient.invalidateQueries({ queryKey });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (member: CareCircleMember) => apiRequest(
      `/patients/${patient.id}/members/${member.accountId}/revoke`,
      { method: 'POST', token },
    ).then(() => member),
    onSuccess: (member) => {
      setNotice(`${member.displayName} no longer has access to ${patient.displayName}.`);
      return queryClient.invalidateQueries({ queryKey });
    },
  });

  if (patient.role !== 'owner') {
    return (
      <View style={styles.sharedNote}>
        <AppIcon color={colors.inkLine} name="shield-check" size={20} />
        <View style={styles.sharedCopy}>
          <Text accessibilityRole="header" style={styles.sharedTitle}>You are in {patient.displayName}'s care circle</Text>
          <Text style={styles.sharedBody}>
            Managed by the space owner. Your recorded doses remain attributed to you.
          </Text>
        </View>
      </View>
    );
  }

  const submitInvite = () => {
    setNotice(null);
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailError('Enter a valid email address, such as name@example.com.');
      return;
    }
    setEmailError(null);
    inviteMutation.mutate({ email: normalized, canManageMedications });
  };

  const shareInvitation = () => {
    if (!lastInvitation) return;
    void Share.share({
      title: `Join ${patient.displayName}'s care circle`,
      message: `You are invited to help with ${patient.displayName}'s care in Alaga. Sign in or create an account using ${lastInvitation.email}; the invitation expires ${new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(lastInvitation.expiresAt))}.`,
    });
  };

  const confirmRevoke = (member: CareCircleMember) => {
    Alert.alert(
      `Remove ${member.displayName}?`,
      `They will immediately lose access to ${patient.displayName}. Existing care history will remain attributed to them.`,
      [
        { text: 'Keep access', style: 'cancel' },
        { text: 'Remove access', style: 'destructive', onPress: () => revokeMutation.mutate(member) },
      ],
    );
  };

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityHint="Expands caregiver list and invitation settings"
        accessibilityLabel={`Care circle, ${expanded ? 'expanded' : 'collapsed'}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.headingButton, pressed && styles.pressed]}
      >
        <View style={styles.headingLeft}>
          <AppIcon color={colors.inkLine} name="users" size={20} />
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>Care circle</Text>
            <Text style={styles.subtitle}>
              {query.isLoading
                ? 'Loading people…'
                : query.data
                  ? `${query.data.members.length} ${query.data.members.length === 1 ? 'person' : 'people'}${query.data.invitations.length ? ` · ${query.data.invitations.length} waiting` : ''}`
                  : `Share ${patient.displayName}'s care log`}
            </Text>
          </View>
        </View>
        <View style={styles.manageAction}>
          <Text style={styles.manageLabel}>{expanded ? 'Hide' : 'Manage'}</Text>
          <AppIcon color={colors.primaryDark} name={expanded ? 'chevron-up' : 'chevron-down'} size={15} />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.expandedContent}>
          <Pressable
            accessibilityLabel={showInviteForm ? 'Close invitation form' : 'Invite caregiver'}
            accessibilityRole="button"
            onPress={() => setShowInviteForm((current) => !current)}
            style={({ pressed }) => [styles.openInviteButton, pressed && styles.pressed]}
          >
            <AppIcon color={colors.ink} name={showInviteForm ? 'x' : 'user-plus'} size={16} />
            <Text style={styles.openInviteLabel}>{showInviteForm ? 'Close invitation' : 'Invite caregiver'}</Text>
          </Pressable>

          {showInviteForm ? (
            <View style={styles.inviteForm}>
              <View style={styles.inviteHeader}>
                <AppIcon color={colors.ink} name="user-plus" size={18} />
                <Text style={styles.formTitle}>Create an invitation</Text>
              </View>
              <Text style={styles.deliveryNote}>
                Alaga does not send email yet. After creating the invitation, share the instructions with the caregiver yourself.
              </Text>
              <TextInput
                accessibilityHint={emailError || undefined}
                accessibilityLabel="Caregiver email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={(value) => { setEmail(value); if (emailError) setEmailError(null); }}
                placeholder="caregiver@example.com"
                placeholderTextColor={colors.muted}
                style={[styles.input, emailError && styles.inputError]}
                value={email}
              />
              {emailError ? <Text accessibilityLiveRegion="assertive" style={styles.fieldError}>{emailError}</Text> : null}
              <Pressable
                accessibilityLabel="Allow medicine management"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: canManageMedications }}
                onPress={() => setCanManageMedications((current) => !current)}
                style={({ pressed }) => [styles.permissionRow, pressed && styles.pressed]}
              >
                <View style={[styles.checkbox, canManageMedications && styles.checkboxSelected]}>
                  {canManageMedications ? <AppIcon color={colors.white} name="check" size={14} /> : null}
                </View>
                <View style={styles.permissionCopy}>
                  <Text style={styles.permissionTitle}>Allow medicine management</Text>
                  <Text style={styles.permissionBody}>They can add, edit, archive and restore confirmed medicines.</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={inviteMutation.isPending || !email.trim()}
                onPress={submitInvite}
                style={({ pressed }) => [styles.inviteButton, pressed && styles.inviteButtonPressed, (inviteMutation.isPending || !email.trim()) && styles.disabled]}
              >
                <AppIcon color={colors.white} name="user-plus" size={16} />
                <Text style={styles.inviteButtonLabel}>{inviteMutation.isPending ? 'Creating invitation…' : 'Create invitation'}</Text>
              </Pressable>
            </View>
          ) : null}

          {notice ? (
            <View accessibilityLiveRegion="polite" style={styles.noticeBanner}>
              <AppIcon color={colors.ink} name="circle-check-big" size={16} />
              <Text style={styles.notice}>{notice}</Text>
            </View>
          ) : null}

          {lastInvitation ? (
            <Pressable accessibilityRole="button" onPress={shareInvitation} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
              <AppIcon color={colors.ink} name="share-2" size={16} />
              <Text style={styles.shareLabel}>Share invitation instructions</Text>
            </Pressable>
          ) : null}

          {(query.error || inviteMutation.error || cancelMutation.error || revokeMutation.error) ? (
            <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorRow}>
              <AppIcon color={colors.error} name="alert-circle" size={16} />
              <Text style={styles.error}>
                {errorMessage(query.error || inviteMutation.error || cancelMutation.error || revokeMutation.error)}
              </Text>
            </View>
          ) : null}

          {query.isLoading ? (
            <Text style={styles.loading}>Loading the care circle…</Text>
          ) : query.data ? (
            <View style={styles.dataBlock}>
              <View style={styles.list}>
                {query.data.members.map((member) => (
                  <View key={member.accountId} style={styles.row}>
                    <AppIcon color={colors.inkLine} name="user-round" size={18} />
                    <View style={styles.rowCopy}>
                      <View style={styles.nameRow}>
                        <Text style={styles.memberName}>{member.displayName}</Text>
                        <Text style={styles.roleText}>{permissionCopy(member)}</Text>
                      </View>
                      <Text style={styles.memberEmail}>{member.email}</Text>
                    </View>
                    {member.role === 'caregiver' && member.accountId !== session?.id ? (
                      <Pressable
                        accessibilityLabel={`Remove ${member.displayName} from care circle`}
                        accessibilityRole="button"
                        disabled={revokeMutation.isPending}
                        onPress={() => confirmRevoke(member)}
                        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                      >
                        <AppIcon color={colors.error} name="user-x" size={15} />
                        <Text style={styles.removeLabel}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>

              {query.data.invitations.length ? (
                <View style={styles.pendingSection}>
                  <View style={styles.pendingHeader}>
                    <AppIcon color={colors.warning} name="clock-3" size={15} />
                    <Text style={styles.pendingTitle}>Waiting to join</Text>
                  </View>
                  {query.data.invitations.map((invitation) => (
                    <View key={invitation.id} style={styles.pendingRow}>
                      <View style={styles.rowCopy}>
                        <Text style={styles.memberName}>{invitation.email}</Text>
                        <Text style={styles.roleText}>
                          {invitation.canManageMedications ? 'Care manager' : 'Caregiver'}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={`Cancel invitation for ${invitation.email}`}
                        accessibilityRole="button"
                        disabled={cancelMutation.isPending}
                        onPress={() => cancelMutation.mutate(invitation)}
                        style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed, cancelMutation.isPending && styles.disabled]}
                      >
                        <AppIcon color={colors.error} name="x" size={14} />
                        <Text style={styles.cancelLabel}>Cancel</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  headingButton: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
  },
  headingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heading: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...sectionTitle,
    color: colors.ink,
  },
  subtitle: {
    ...typography.caption,
    maxWidth: 560,
    color: colors.muted,
  },
  manageAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
  },
  manageLabel: {
    ...typography.bodyEmphasis,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  expandedContent: {
    gap: spacing.md,
  },
  openInviteButton: {
    minHeight: 48,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  openInviteLabel: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
  inviteForm: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  formTitle: {
    ...typography.headline,
    color: colors.ink,
  },
  deliveryNote: {
    ...typography.caption,
    color: colors.muted,
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    ...typography.caption,
    color: colors.error,
  },
  permissionRow: {
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
    backgroundColor: colors.surface,
  },
  checkboxSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  permissionCopy: {
    flex: 1,
    gap: 2,
  },
  permissionTitle: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
  permissionBody: {
    ...typography.caption,
    color: colors.muted,
  },
  inviteButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  inviteButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  inviteButtonLabel: {
    ...typography.bodyEmphasis,
    color: colors.white,
    fontWeight: '700',
  },
  shareButton: {
    minHeight: 48,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  shareLabel: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.canvasSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  notice: {
    ...typography.body,
    flex: 1,
    color: colors.ink,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  error: {
    ...typography.caption,
    flex: 1,
    color: colors.error,
  },
  loading: {
    ...typography.body,
    color: colors.muted,
  },
  dataBlock: {
    gap: spacing.lg,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  memberName: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
  roleText: {
    ...typography.caption,
    color: colors.ink,
  },
  memberEmail: {
    ...typography.caption,
    color: colors.muted,
  },
  removeButton: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  removeLabel: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '700',
  },
  pendingSection: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pendingTitle: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '700',
  },
  pendingRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  cancelButton: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  cancelLabel: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '700',
  },
  sharedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  sharedCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sharedTitle: {
    ...sectionTitle,
    color: colors.ink,
  },
  sharedBody: {
    ...typography.body,
    maxWidth: 560,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.48,
  },
});
