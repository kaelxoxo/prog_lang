import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
        <Text style={styles.sharedTitle}>You are in {patient.displayName}'s care circle</Text>
        <Text style={styles.sharedBody}>
          The owner controls membership. Your care entries remain attributed to your account.
        </Text>
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
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.headingButton, pressed && styles.pressed]}
      >
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
        <Text style={styles.manageLabel}>{expanded ? 'Hide' : 'Manage'}</Text>
      </Pressable>

      {expanded ? <>
      <Pressable accessibilityRole="button" onPress={() => setShowInviteForm((current) => !current)} style={({ pressed }) => [styles.openInviteButton, pressed && styles.pressed]}>
        <Text style={styles.openInviteLabel}>{showInviteForm ? 'Close invitation' : '+ Invite caregiver'}</Text>
      </Pressable>

      {showInviteForm ? <View style={styles.inviteForm}>
        <Text style={styles.formTitle}>Create an invitation</Text>
        <Text style={styles.deliveryNote}>Alaga does not send email yet. After creating the invitation, share the instructions with the caregiver yourself.</Text>
        <TextInput
          accessibilityLabel="Caregiver email"
          accessibilityHint={emailError || undefined}
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
            <Text style={styles.checkmark}>{canManageMedications ? '✓' : ''}</Text>
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
          <Text style={styles.inviteButtonLabel}>{inviteMutation.isPending ? 'Creating invitation...' : 'Create invitation'}</Text>
        </Pressable>
      </View> : null}

      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      {lastInvitation ? <Pressable accessibilityRole="button" onPress={shareInvitation} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}><Text style={styles.shareLabel}>Share invitation instructions</Text></Pressable> : null}
      {(query.error || inviteMutation.error || cancelMutation.error || revokeMutation.error) ? (
        <Text accessibilityLiveRegion="assertive" style={styles.error}>
          {errorMessage(query.error || inviteMutation.error || cancelMutation.error || revokeMutation.error)}
        </Text>
      ) : null}

      {query.isLoading ? (
        <Text style={styles.loading}>Loading the care circle...</Text>
      ) : query.data ? (
        <>
          <View style={styles.list}>
            {query.data.members.map((member) => (
              <View key={member.accountId} style={styles.row}>
                <View style={styles.rowCopy}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  <Text style={styles.memberMeta}>{permissionCopy(member)}</Text>
                  <Text style={styles.memberEmail}>{member.email}</Text>
                </View>
                {member.role === 'caregiver' && member.accountId !== session?.id ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={revokeMutation.isPending}
                    onPress={() => confirmRevoke(member)}
                    style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.removeLabel}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>

          {query.data.invitations.length ? (
            <View style={styles.pendingSection}>
              <Text style={styles.pendingTitle}>Waiting to join</Text>
              {query.data.invitations.map((invitation) => (
                <View key={invitation.id} style={styles.pendingRow}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.memberName}>{invitation.email}</Text>
                    <Text style={styles.memberMeta}>
                      {invitation.canManageMedications ? 'Caregiver and medicine manager' : 'Caregiver'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={cancelMutation.isPending}
                    onPress={() => cancelMutation.mutate(invitation)}
                    style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.removeLabel}>Cancel</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      </> : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  headingButton: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderRadius: radii.sm, paddingHorizontal: spacing.sm },
  heading: { gap: spacing.xs },
  title: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  subtitle: { maxWidth: 560, color: colors.muted, fontSize: 14, lineHeight: 20 },
  manageLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  openInviteButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  openInviteLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  inviteForm: { gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.mist, padding: spacing.lg },
  formTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.white, color: colors.ink, fontSize: 16, paddingHorizontal: spacing.md },
  inputError: { borderColor: colors.error },
  fieldError: { color: colors.error, fontSize: 14, lineHeight: 20 },
  permissionRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.muted, borderRadius: 7, backgroundColor: colors.white },
  checkboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkmark: { color: colors.white, fontSize: 17, fontWeight: '900' },
  permissionCopy: { flex: 1, gap: 2 },
  permissionTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  permissionBody: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  inviteButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.lg },
  inviteButtonPressed: { backgroundColor: colors.primaryDark },
  inviteButtonLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
  deliveryNote: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  shareButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.sm, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  shareLabel: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  notice: { borderRadius: radii.md, backgroundColor: colors.successTint, color: colors.successDark, fontSize: 14, fontWeight: '700', lineHeight: 20, padding: spacing.md },
  error: { borderRadius: radii.md, backgroundColor: colors.errorTint, color: colors.error, fontSize: 14, lineHeight: 20, padding: spacing.md },
  loading: { color: colors.muted, fontSize: 15 },
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.md },
  rowCopy: { flex: 1, gap: 2 },
  memberName: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  memberMeta: { color: colors.successDark, fontSize: 13, fontWeight: '700' },
  memberEmail: { color: colors.muted, fontSize: 13 },
  removeButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  removeLabel: { color: colors.error, fontSize: 14, fontWeight: '800' },
  pendingSection: { gap: spacing.sm },
  pendingTitle: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  pendingRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.sm, backgroundColor: colors.warningTint, padding: spacing.md },
  sharedNote: { gap: spacing.xs, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: spacing.lg },
  sharedTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  sharedBody: { maxWidth: 560, color: colors.muted, fontSize: 14, lineHeight: 21 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
});
