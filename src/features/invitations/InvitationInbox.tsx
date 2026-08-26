import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { usePatient } from '../patients/PatientProvider';
import type { IncomingInvitation } from './types';

type InvitationListResponse = { invitations: IncomingInvitation[] };
type InvitationAction = { invitation: IncomingInvitation; action: 'accept' | 'decline' };

export function InvitationInbox() {
  const { styles } = useThemedStyles(createStyles);
  const { token } = useAuth();
  const { selectPatient } = usePatient();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['invitations'],
    queryFn: () => apiRequest<InvitationListResponse>('/invitations', { token }),
  });
  const mutation = useMutation({
    mutationFn: ({ invitation, action }: InvitationAction) =>
      apiRequest<{ patientId: string }>(`/invitations/${invitation.id}/${action}`, { method: 'POST', token }),
    onSuccess: (result: { patientId?: string }, { action }) => {
      void queryClient.invalidateQueries({ queryKey: ['invitations'] });
      if (action === 'accept' && result.patientId) {
        selectPatient(result.patientId);
        void queryClient.invalidateQueries({ queryKey: ['patients'] });
      }
    },
  });

  if (query.isLoading || (!query.error && !query.data?.invitations.length)) {
    return null;
  }

  if (query.error) {
    return (
      <View style={styles.errorBox}>
        <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
          Care-circle invitations could not load. {errorMessage(query.error)}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void query.refetch()} style={styles.retry}>
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>Care-circle invitation</Text>
      {query.data?.invitations.map((invitation) => {
        const busy = mutation.isPending && mutation.variables?.invitation.id === invitation.id;
        return (
          <View key={invitation.id} style={styles.invitation}>
            <View style={styles.copy}>
              <Text accessibilityRole="header" style={styles.title}>{invitation.patientName}</Text>
              <Text style={styles.body}>
                {invitation.invitedByName} invited you to help keep this care log up to date.
              </Text>
              <Text style={styles.permission}>
                {invitation.canManageMedications
                  ? 'You can record care and manage medicines.'
                  : 'You can view medicines and record care.'}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => mutation.mutate({ invitation, action: 'accept' })}
                style={({ pressed }) => [styles.accept, pressed && styles.pressed, busy && styles.disabled]}
              >
                <Text style={styles.acceptLabel}>{busy ? 'Saving...' : 'Join care circle'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => mutation.mutate({ invitation, action: 'decline' })}
                style={({ pressed }) => [styles.decline, pressed && styles.pressed, busy && styles.disabled]}
              >
                <Text style={styles.declineLabel}>Decline</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {mutation.error ? (
        <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{errorMessage(mutation.error)}</Text>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: { gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.primaryTint, padding: spacing.lg },
  eyebrow: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  invitation: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  copy: { gap: spacing.xs },
  title: { color: colors.ink, fontSize: 21, fontWeight: '800' },
  body: { maxWidth: 560, color: colors.ink, fontSize: 15, lineHeight: 22 },
  permission: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  accept: { minHeight: 50, minWidth: 180, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.md },
  acceptLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
  decline: { minHeight: 50, minWidth: 100, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  declineLabel: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  errorBox: { gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  retry: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  retryLabel: { color: colors.error, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.5 },
});
