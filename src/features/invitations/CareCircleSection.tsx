import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest, errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import type { CareCircleMember, CareCircleResponse, PatientInvitation } from './types';

type Props = { patient: Patient };
type InviteInput = { email: string; canManageMedications: boolean };

function permissionCopy(member: CareCircleMember) {
  if (member.role === 'owner') return 'Owner';
  return member.canManageMedications ? 'Caregiver and medicine manager' : 'Caregiver';
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
        <View style={styles.sharedIconWrap}>
          <AppIcon color={colors.successDark} name="shield-check" size={20} />
        </View>
        <View style={styles.sharedCopy}>
          <Text accessibilityRole="header" style={styles.sharedTitle}>You are in {patient.displayName}'s care circle</Text>
          <Text style={styles.sharedBody}>
            The owner controls membership. Your care entries remain attributed to your account.
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
          <View style={styles.iconWrap}>
            <AppIcon color={colors.primaryDark} name="users" size={18} />
          </View>
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
        <View style={styles.managePill}>
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
              <AppIcon color={colors.successDark} name="circle-check-big" size={16} />
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
            <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorBox}>
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
                    <View style={styles.memberAvatar}>
                      <AppIcon color={colors.primaryDark} name="user-round" size={17} />
                    </View>
                    <View style={styles.rowCopy}>
                      <View style={styles.nameRow}>
                        <Text style={styles.memberName}>{member.displayName}</Text>
                        <View style={[styles.roleBadge, member.role === 'owner' ? styles.ownerBadge : styles.caregiverBadge]}>
                          <Text style={[styles.roleText, member.role === 'owner' ? styles.ownerText : styles.caregiverText]}>
                            {permissionCopy(member)}
                          </Text>
                        </View>
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
                        <View style={[styles.roleBadge, styles.pendingBadge]}>
                          <Text style={[styles.roleText, styles.pendingText]}>
                            {invitation.canManageMedications ? 'Caregiver & medicine manager' : 'Caregiver'}
                          </Text>
                        </View>
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
    paddingTop: spacing.md,
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
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    maxWidth: 560,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  managePill: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  manageLabel: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
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
    borderColor: colors.line,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
  },
  openInviteLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  inviteForm: {
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.mist,
    padding: spacing.lg,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  formTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  deliveryNote: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
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
    borderRadius: 6,
    backgroundColor: colors.white,
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
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  permissionBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  inviteButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
  },
  inviteButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  inviteButtonLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  shareButton: {
    minHeight: 48,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
  },
  shareLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.successTint,
    padding: spacing.md,
  },
  notice: {
    flex: 1,
    color: colors.successDark,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.errorTint,
    padding: spacing.md,
  },
  error: {
    flex: 1,
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  loading: {
    color: colors.muted,
    fontSize: 14,
  },
  dataBlock: {
    gap: spacing.md,
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
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.mist,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  roleBadge: {
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ownerBadge: {
    backgroundColor: colors.primaryTint,
  },
  caregiverBadge: {
    backgroundColor: colors.successTint,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  ownerText: {
    color: colors.primaryDark,
  },
  caregiverText: {
    color: colors.successDark,
  },
  pendingBadge: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  pendingText: {
    color: colors.warning,
  },
  memberEmail: {
    color: colors.muted,
    fontSize: 13,
  },
  removeButton: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  removeLabel: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '700',
  },
  pendingSection: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.warningTint,
    padding: spacing.md,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pendingTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '800',
  },
  pendingRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
  },
  cancelButton: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  cancelLabel: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '700',
  },
  sharedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.lg,
  },
  sharedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.successTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sharedTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  sharedBody: {
    maxWidth: 560,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.48,
  },
});
