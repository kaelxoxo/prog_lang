# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Completion gate for every agent

Never mark work complete immediately after implementation. Review the changed code and its surrounding call paths, then run verification proportional to the change and report any environment-dependent checks that remain unverified.

For dependency or native-module changes, stop active Metro processes before installation, run Expo Doctor, rebuild with an empty Metro cache, and confirm at least one target-platform export. Do not install packages while Metro is resolving the same project. When Metro reports a missing file that exists in `node_modules`, restart with `npx expo start --clear` before changing application imports.

Alaga uses local notifications in Android Expo Go. Keep the focused `expo-notifications/build/*` imports in `src/features/reminders/notifications.ts`; the package's top-level barrel evaluates remote push-token auto-registration and crashes Android Expo Go. Android Expo Go must also skip custom notification-channel creation because its scoped channel provider can be unavailable. Preserve the `reminderNotificationRuntime` boundary and its regression test. After changing notification code, confirm a clean Android export contains none of `warnOfExpoGoPushUsage`, `addPushTokenListener`, or `DevicePushTokenAutoRegistration`.

Bundle success is not proof that a native call works at runtime. Review every promise started during module or application initialization: either move the native call behind a user action/lifecycle that handles rejection, or attach an explicit rejection handler. For Expo/native changes, report whether Expo Go and development-build behavior were each physically exercised; never imply that an export performed a device runtime test.
