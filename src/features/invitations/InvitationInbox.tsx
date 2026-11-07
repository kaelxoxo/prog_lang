import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PressableScale } from '../../components/PressableScale';
import { apiRequest, errorMessage } from '../../lib/api';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth } from '../auth/AuthProvider';
import { usePatient } from '../patients/PatientProvider';
import { useLocale } from '../settings/LocaleProvider';
import type { IncomingInvitation } from './types';

type InvitationAction = { invitation: IncomingInvitation; action: 'accept' | 'decline' };

/** Invitations waiting for the signed-in account; shared by the inbox and the Family tab's dot. */
export function useIncomingInvitations() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['invitations'],
    queryFn: () => apiRequest<{ invitations: IncomingInvitation[] }>('/invitations', { token }),
  });
}

/** "Invitations for you": renders nothing while there are none. */
export function InvitationInbox() {
  const { styles } = useThemedStyles(createStyles);
  const { token } = useAuth();
  const { selectPatient } = usePatient();
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const query = useIncomingInvitations();
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

  if (query.error && !query.data) {
    return (
      <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.section}>
        <Text style={styles.error}>{t('family.invitationsError', { error: errorMessage(query.error) })}</Text>
        <PressableScale accessibilityRole="button" onPress={() => void query.refetch()} style={styles.textAction}>
          <Text style={styles.textActionLabel}>{t('app.retry')}</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{t('family.invitationsTitle')}</Text>
      {query.data?.invitations.map((invitation) => {
        const busy = mutation.isPending && mutation.variables?.invitation.id === invitation.id;
        return (
          <View key={invitation.id} style={styles.row}>
            <Text style={styles.name}>{t('family.title', { patient: invitation.patientName })}</Text>
            <Text style={styles.body}>
              {t('family.invitationBody', { name: invitation.invitedByName, patient: invitation.patientName })}
            </Text>
            <Text style={styles.detail}>
              {t(invitation.canManageMedications ? 'family.invitationAsMedicineManager' : 'family.invitationAsCaregiver')}
            </Text>
            <View style={styles.actions}>
              <PressableScale
                accessibilityLabel={t('family.joinA11y', { patient: invitation.patientName })}
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={() => mutation.mutate({ invitation, action: 'accept' })}
                style={[styles.join, busy && styles.disabled]}
              >
                <Text style={styles.joinLabel}>{busy ? t('family.saving') : t('family.join')}</Text>
              </PressableScale>
              <PressableScale
                accessibilityLabel={t('family.declineA11y', { patient: invitation.patientName })}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => mutation.mutate({ invitation, action: 'decline' })}
                style={[styles.textAction, busy && styles.disabled]}
              >
                <Text style={styles.textActionLabel}>{t('family.decline')}</Text>
              </PressableScale>
            </View>
          </View>
        );
      })}
      {mutation.error ? (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
          {errorMessage(mutation.error)}
        </Text>
      ) : null}
    </View>
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
  row: {
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingVertical: spacing.sm,
  },
  name: {
    ...typography.bodyEmphasis,
    color: colors.ink,
  },
  body: {
    ...typography.body,
    color: colors.ink,
  },
  detail: {
    ...typography.caption,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  join: {
    minHeight: 48,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  joinLabel: {
    ...typography.bodyEmphasis,
    color: colors.white,
  },
  textAction: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  textActionLabel: {
    ...typography.bodyEmphasis,
    color: colors.primaryDark,
  },
  error: {
    ...typography.body,
    color: colors.error,
    paddingVertical: spacing.xs,
  },
  disabled: {
    opacity: 0.5,
  },
});
