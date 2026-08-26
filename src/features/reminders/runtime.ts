export const REMINDER_CHANNEL_ID = 'alaga-care-reminders';

export function reminderNotificationRuntime(platform: string, runningInExpoGo: boolean) {
  const supported = platform !== 'web';
  const customChannelId = platform === 'android' && !runningInExpoGo
    ? REMINDER_CHANNEL_ID
    : undefined;

  return { supported, customChannelId };
}
