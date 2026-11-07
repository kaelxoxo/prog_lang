import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../lib/api';
import { useCurrentTime } from '../../lib/useCurrentTime';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from '../patients/types';
import { manilaDate, type DoseOccurrence } from '../today/types';
import {
  cancelPatientReminders,
  readReminderPreference,
  remindersPermission,
  requestRemindersPermission,
  saveReminderPreference,
  syncPatientReminders,
} from './notifications';

const supported = Platform.OS !== 'web';
const permissionKey = ['reminderPermission'] as const;
const preferenceKey = (accountId: string, patientId: string) => ['reminderPreference', accountId, patientId] as const;

/** Whether this device may show notifications. Shared by the Settings switches and the background sync. */
function usePermission() {
  return useQuery({ queryKey: permissionKey, queryFn: remindersPermission, enabled: supported });
}

/** Whether this account turned reminders on for this person on this device. */
function usePreference(patientId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: preferenceKey(session?.id ?? '', patientId),
    queryFn: () => readReminderPreference(session!.id, patientId),
    enabled: supported && Boolean(session),
  });
}

/** State and actions for one person's reminder switch in Settings. */
export function useReminderSwitch(patient: Patient) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const permission = usePermission();
  const preference = usePreference(patient.id);

  const setPreference = async (on: boolean) => {
    if (!session) return;
    await saveReminderPreference(session.id, patient.id, on);
    if (!on) await cancelPatientReminders(patient.id);
    queryClient.setQueryData(preferenceKey(session.id, patient.id), on);
  };

  return {
    ready: permission.isFetched && preference.isFetched,
    on: Boolean(preference.data && permission.data),
    /** Turned on but the device blocks notifications: point the user to device settings. */
    blocked: Boolean(preference.data && permission.isFetched && !permission.data),
    error: preference.error ?? permission.error,
    /** Asks for notification permission first; resolves false when the device refuses. */
    enable: async () => {
      const granted = await requestRemindersPermission();
      queryClient.setQueryData(permissionKey, granted);
      if (!granted) return false;
      await setPreference(true);
      return true;
    },
    disable: () => setPreference(false),
  };
}

/**
 * Keeps one person's scheduled notifications in step with their next seven days while the app is open.
 * Renders nothing; MainTabs mounts one per person so reminders stay current whichever screen is showing.
 */
export function ReminderSync({ patient }: { patient: Patient }) {
  const { token } = useAuth();
  const date = manilaDate(useCurrentTime());
  const permission = usePermission();
  const preference = usePreference(patient.id);
  const on = Boolean(preference.data && permission.data);
  const reminders = useQuery({
    queryKey: ['reminders', patient.id, date],
    enabled: supported && on,
    queryFn: () =>
      apiRequest<{ timeline: DoseOccurrence[] }>(`/patients/${patient.id}/reminders?from=${date}&days=7`, { token }),
  });

  useEffect(() => {
    if (!on || !reminders.data) return;
    // A failed sync keeps the previous schedule; the next refetch tries again.
    void syncPatientReminders(patient, reminders.data.timeline).catch(() => undefined);
  }, [on, patient, reminders.data]);

  return null;
}
