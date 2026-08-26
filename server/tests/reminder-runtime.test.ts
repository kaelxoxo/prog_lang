import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REMINDER_CHANNEL_ID,
  reminderNotificationRuntime,
} from '../../src/features/reminders/runtime';

test('Milestone 5 notification runtime avoids unsupported Expo Go channel calls', () => {
  assert.deepEqual(reminderNotificationRuntime('android', true), {
    supported: true,
    customChannelId: undefined,
  });
  assert.deepEqual(reminderNotificationRuntime('android', false), {
    supported: true,
    customChannelId: REMINDER_CHANNEL_ID,
  });
  assert.deepEqual(reminderNotificationRuntime('ios', false), {
    supported: true,
    customChannelId: undefined,
  });
  assert.deepEqual(reminderNotificationRuntime('web', false), {
    supported: false,
    customChannelId: undefined,
  });
});
