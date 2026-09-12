import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '../../components/AppIcon';
import { apiRequest, errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { usePatient } from '../patients/PatientProvider';
import { useLocale } from '../settings/LocaleProvider';
import type { IncomingInvitation } from './types';

type InvitationListResponse = { invitations: IncomingInvitation[] };
type InvitationAction = { invitation: IncomingInvitation; action: 'accept' | 'decline' };

export function InvitationInbox() {
  const { colors, styles } = useThemedStyles(createStyles);
  const { token } = useAuth();
  const { selectPatient } = usePatient();
  const { t } = useLocale();
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
      <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorBox}>
        <View style={styles.errorHeader}>
          <AppIcon color={colors.error} name="alert-circle" size={18} />
          <Text style={styles.errorText}>
            Care-circle invitations could not load. {errorMessage(query.error)}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={t('app.retry')}
          accessibilityRole="button"
          onPress={() => void query.refetch()}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text style={styles.retryLabel}>{t('app.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <AppIcon color={colors.primaryDark} name="mail" size={17} />
        </View>
        <Text style={styles.eyebrow}>Care-circle invitation</Text>
      </View>
      {query.data?.invitations.map((invitation) => {
        const busy = mutation.isPending && mutation.variables?.invitation.id === invitation.id;
        return (
          <View key={invitation.id} style={styles.invitation}>
            <View style={styles.copy}>
              <Text accessibilityRole="header" style={styles.title}>{invitation.patientName}</Text>
              <Text style={styles.body}>
                {invitation.invitedByName} invited you to help keep this care log up to date.
              </Text>
              <View style={styles.permissionBadge}>
                <AppIcon color={colors.primaryDark} name="shield-check" size={14} />
                <Text style={styles.permission}>
                  {invitation.canManageMedications
                    ? 'You can record care and manage medicines.'
                    : 'You can view medicines and record care.'}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityLabel={`Join ${invitation.patientName}'s care circle`}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => mutation.mutate({ invitation, action: 'accept' })}
                style={({ pressed }) => [styles.accept, pressed && styles.pressed, busy && styles.disabled]}
              >
                <AppIcon color={colors.white} name="check" size={16} />
                <Text style={styles.acceptLabel}>{busy ? 'Saving…' : 'Join care circle'}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Decline invitation to ${invitation.patientName}'s care circle`}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => mutation.mutate({ invitation, action: 'decline' })}
                style={({ pressed }) => [styles.decline, pressed && styles.pressed, busy && styles.disabled]}
              >
                <AppIcon color={colors.primaryDark} name="x" size={15} />
                <Text style={styles.declineLabel}>Decline</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {mutation.error ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.mutationErrorBox}>
          <AppIcon color={colors.error} name="alert-circle" size={16} />
          <Text style={styles.mutationError}>{errorMessage(mutation.error)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  section: {
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  invitation: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  copy: {
    gap: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  body: {
    maxWidth: 560,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  permissionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    backgroundColor: colors.mist,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: spacing.xs,
  },
  permission: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  accept: {
    minHeight: 48,
    minWidth: 180,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
  },
  acceptLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  decline: {
    minHeight: 48,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  declineLabel: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '800',
  },
  errorBox: {
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.errorTint,
    padding: spacing.md,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  mutationErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.errorTint,
    padding: spacing.md,
  },
  mutationError: {
    flex: 1,
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  retry: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  retryLabel: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.76,
  },
  disabled: {
    opacity: 0.5,
  },
});
