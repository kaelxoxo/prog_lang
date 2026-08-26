import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import {
  AndroidImportance,
  AndroidNotificationVisibility,
  type NotificationChannel,
} from 'expo-notifications/build/NotificationChannelManager.types';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import {
  addNotificationResponseReceivedListener,
  clearLastNotificationResponse,
  getLastNotificationResponse,
} from 'expo-notifications/build/NotificationsEmitter';
import {
  SchedulableTriggerInputTypes,
  type NotificationRequest,
  type NotificationResponse,
} from 'expo-notifications/build/Notifications.types';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';

import type { Patient } from '../patients/types';
import type { DoseOccurrence } from '../today/types';
import { planReminderSync, type ExistingReminder } from './planner';
import { reminderNotificationRuntime } from './runtime';

const DATA_KIND = 'alaga-dose-reminder';
const runtime = reminderNotificationRuntime(Platform.OS, isRunningInExpoGo());
let channelReady: Promise<NotificationChannel | null> | null = null;

export function configureNotifications() {
  if (!runtime.supported) return;
  setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type ReminderRoute = {
  occurrenceId: string;
  patientId: string;
};

function routeFromResponse(response: NotificationResponse | null): ReminderRoute | null {
  const data = response?.notification.request.content.data;
  if (data?.kind !== DATA_KIND
    || typeof data.patientId !== 'string'
    || typeof data.occurrenceId !== 'string') return null;
  return { patientId: data.patientId, occurrenceId: data.occurrenceId };
}

export function subscribeToReminderRoutes(listener: (route: ReminderRoute) => void) {
  if (!runtime.supported) return () => undefined;

  const deliver = (response: NotificationResponse | null) => {
    const route = routeFromResponse(response);
    if (!route) return;
    listener(route);
    clearLastNotificationResponse();
  };

  deliver(getLastNotificationResponse());
  const subscription = addNotificationResponseReceivedListener(deliver);
  return () => subscription.remove();
}

async function ensureNotificationChannel() {
  if (!runtime.customChannelId) return null;
  channelReady ??= setNotificationChannelAsync(runtime.customChannelId, {
    name: 'Care reminders',
    importance: AndroidImportance.DEFAULT,
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    vibrationPattern: [0, 200],
  });
  try {
    return await channelReady;
  } catch (error) {
    channelReady = null;
    throw error;
  }
}

function preferenceKey(accountId: string, patientId: string) {
  return `alaga.reminders.${accountId}.${patientId}`;
}

export async function readReminderPreference(accountId: string, patientId: string) {
  if (!runtime.supported) return false;
  return await SecureStore.getItemAsync(preferenceKey(accountId, patientId)) === 'enabled';
}

export async function saveReminderPreference(accountId: string, patientId: string, enabled: boolean) {
  if (!runtime.supported) return;
  await SecureStore.setItemAsync(preferenceKey(accountId, patientId), enabled ? 'enabled' : 'disabled');
}

export async function remindersPermission() {
  if (!runtime.supported) return false;
  return (await getPermissionsAsync()).granted;
}

export async function requestRemindersPermission() {
  if (!runtime.supported) return false;
  await ensureNotificationChannel();
  return (await requestPermissionsAsync({ ios: { allowAlert: true, allowSound: false, allowBadge: false } })).granted;
}

function alagaReminder(request: NotificationRequest): ExistingReminder | null {
  const data = request.content.data;
  if (data?.kind !== DATA_KIND
    || typeof data.occurrenceId !== 'string'
    || typeof data.patientId !== 'string'
    || typeof data.dueAt !== 'string') return null;
  return {
    identifier: request.identifier,
    occurrenceId: data.occurrenceId,
    patientId: data.patientId,
    dueAt: data.dueAt,
  };
}

export async function cancelPatientReminders(patientId: string) {
  if (!runtime.supported) return;
  const scheduled = await getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.map(alagaReminder).filter((item): item is ExistingReminder => Boolean(item))
    .filter((item) => item.patientId === patientId)
    .map((item) => cancelScheduledNotificationAsync(item.identifier)));
}

export async function syncPatientReminders(patient: Patient, timeline: DoseOccurrence[]) {
  if (!runtime.supported) return 0;
  await ensureNotificationChannel();
  const now = Date.now();
  const desired = timeline
    .filter((dose) => (dose.status === 'not_recorded' || dose.status === 'snoozed') && new Date(dose.dueAt).getTime() > now)
    .map((dose) => ({ occurrenceId: dose.id, patientId: patient.id, dueAt: dose.dueAt }));
  const scheduled = await getAllScheduledNotificationsAsync();
  const existing = scheduled.map(alagaReminder).filter((item): item is ExistingReminder => Boolean(item));
  const plan = planReminderSync(existing.filter((item) => item.patientId === patient.id), desired);
  await Promise.all(plan.cancel.map((identifier) => cancelScheduledNotificationAsync(identifier)));
  await Promise.all(plan.schedule.map((item) => scheduleNotificationAsync({
    content: {
      title: 'Medicine reminder',
      body: 'A care schedule is ready to check.',
      data: { ...item, kind: DATA_KIND },
      sound: false,
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: new Date(item.dueAt),
      ...(runtime.customChannelId ? { channelId: runtime.customChannelId } : {}),
    },
  })));
  return desired.length;
}
