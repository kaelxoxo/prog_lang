# Alaga local development setup

## Services

Alaga is a local side project. Use synthetic information only; the current setup is not intended for real patient or medication data.

Milestones 2 through 6 use three local layers:

1. The Expo application stores an opaque session token and calls the HTTP API.
2. The Node HTTP API validates input, hashes session tokens and owns database credentials.
3. PostgreSQL enforces membership access with row-level security.

The mobile application must never connect directly to PostgreSQL.

## PostgreSQL

PostgreSQL 17 is installed as the automatic Windows service `postgresql-x64-17` on port `5432`. Remote PostgreSQL access is not enabled.

Local secrets live in `.env.server.local`, which is ignored by Git. To rebuild the database boundary after changing migrations:

```powershell
npm.cmd run db:setup
```

The setup command creates or updates the least-privilege `alaga_api` login, creates `alaga_dev` when needed and applies unapplied files from `database/migrations`.

## Run the application

Start the API first:

```powershell
npm.cmd run server
```

Then start Expo in another terminal:

```powershell
npx.cmd expo start
```

Before handing the running app back to someone, verify both services and LAN API reachability:

```powershell
npm.cmd run check:runtime
```

Keep the API and Expo terminals open while the local app is in use.

When an authorized Android device is connected, this check also requires the `4000` and `8081` USB reverse routes, confirms Expo Go is in the foreground, and rejects the visible “Cannot connect to Expo CLI” state. With no connected device, the Android check is skipped.

`.env.local` uses `EXPO_PUBLIC_API_URL=auto` for local development. Alaga reads Expo's current development host and uses port `4000`, so moving the computer and phone to another Wi-Fi no longer requires editing an IP address. Android Emulator falls back to `http://10.0.2.2:4000`; iOS Simulator and web fall back to `http://127.0.0.1:4000`. Set an explicit HTTPS URL instead for a deployed API.

Local development currently uses HTTP. A deployed environment must terminate TLS before accepting credentials or session tokens.

### “Alaga cannot connect right now” on a phone

General internet access is not enough for the local prototype: the phone must be able to reach the Alaga API running on the development computer.

1. Keep `npm.cmd run server` running on the computer.
2. Put the phone and computer on the same Wi-Fi network; guest networks and client isolation can block device-to-computer traffic.
3. Confirm that `.env.local` contains `EXPO_PUBLIC_API_URL=auto` and restart Expo after changing networks so its development host is current.
4. On the phone, open `http://<computer-ip>:4000/health` in a browser. A reachable server returns `{"ok":true}`.
5. If that address fails on the phone but works on the computer, allow the Node process or TCP port 4000 through Windows Firewall for the private network.
6. Restart Expo with `npx.cmd expo start --clear` after changing networks. The app will derive the API address from the new Expo host.

Automatic discovery applies to local LAN development. If the phone is on a different network from the computer, or the Wi-Fi isolates clients, deploy the API behind HTTPS or use an authenticated development tunnel; a private computer address cannot be reached across unrelated networks.

For the approved side-project scope, unrelated-network access is not supported. Use Android Emulator, a shared private LAN, or USB debugging instead of deploying the API.

### Android USB fallback

With an Android device connected and authorized for USB debugging, use the supervised USB runtime:

```powershell
npm.cmd run dev:usb
```

Keep that terminal open. The command starts the API or Expo when either is missing, uses Expo's localhost mode, restores the `4000` and `8081` reverse routes, opens Expo Go, and checks again every five seconds so reconnecting the cable repairs the routes automatically. Confirm the complete live state at any time with:

```powershell
npm.cmd run check:runtime
```

The Expo development host becomes `127.0.0.1`; Alaga's automatic API resolver then uses `http://127.0.0.1:4000`, which USB forwards to the local API. Closing the terminal stops services that command started; after restarting the computer, run `npm.cmd run dev:usb` again.

If the desktop health endpoints pass but Expo Go still says it cannot connect to Expo CLI, stop any old Expo process and rerun `npm.cmd run dev:usb`.

## Synthetic demo data

After applying all migrations, reset the local development database and create deterministic portfolio data with:

```powershell
npm.cmd run db:reset:synthetic -- --confirm-synthetic-reset
```

The command is intentionally destructive and only accepts database names ending in `_dev` or `_test`. Without the exact confirmation flag it refuses to run. It creates two `example.test` accounts, one explicitly synthetic patient, two synthetic medicines and an accepted caregiver relationship. Never point this command at a database containing information you need to retain.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run test:server
npm.cmd run check:runtime
npx.cmd expo config --type public
```

Run the combined code and dependency checks with `npm.cmd run verify`. Run `npm.cmd run export:android` for a clean Android export plus the Expo Go notification-import regression scan. GitHub Actions repeats database setup, verification and Android export when the project is eventually pushed to GitHub.

The verification suite covers account registration, session restoration, atomic patient ownership, cross-account isolation, denied direct writes, caregiver invitation matching and acceptance, owner-only care-circle access, membership revocation, confirmed medication creation, three schedule shapes, medicine-manager permission, immutable revision history, soft archive retention, version-pinned Today occurrences, attributable idempotent dose events, duplicate terminal-event rejection and local reminder deduplication planning.

Milestone 6 invitation delivery is intentionally local: Alaga stores a pending invitation for a normalized email, and the matching signed-in account sees it in the app. No email is sent, and local account registration does not yet prove ownership of that email. Use synthetic addresses only.

Alaga's current reminders are local notifications. They can be exercised in Expo Go and do not require a cloud AI provider or push-notification server. Remote push notifications require a development build on Android, but Alaga does not use that remote feature in Milestone 5. The app requests notification permission only after the user turns reminders on.

### Synthetic photo/OCR experiment

Medicine managers may choose a synthetic JPEG or PNG from the device library. The mobile app sends a cropped JPEG to the local API, which holds it in memory, runs Tesseract.js and returns a draft. The API does not retain the image. The first OCR request may download and cache Tesseract's English language model, so that first request needs internet access and takes longer; later local requests reuse the cache.

OCR accuracy is not assumed. Check the raw extracted wording and every suggested field, especially medicine name, strength, quantity and clock times. Vague wording intentionally produces no clock-time suggestion. The experiment must never be used with a real label, timetable, person or prescription.

To check the real OCR worker and its cached language model without using a medicine image, run `npm.cmd run test:ocr:smoke`. It processes Alaga's app icon and verifies only that worker initialization, recognition and cleanup complete; parser correctness remains covered by the normal server test suite.

### Expo Go notification startup error

With Expo SDK 57, importing the top-level `expo-notifications` module also evaluates its remote push-token auto-registration path. Android Expo Go rejects that remote path and can stop startup with `[runtime not ready]`, even when the application only needs supported local notifications.

Alaga therefore imports only the local scheduling, permission, channel and handler modules that it uses. Do not replace those focused imports with `import * as Notifications from 'expo-notifications'` unless an SDK upgrade has been verified in Android Expo Go. A clean Android export should not contain `warnOfExpoGoPushUsage`, `addPushTokenListener` or `DevicePushTokenAutoRegistration`.

Android Expo Go can also reject custom channel creation with a missing scoped `NotificationsChannelsProvider`. Alaga skips its private custom channel in Expo Go and lets local notifications use Expo Go's fallback channel. A native development or production build still creates Alaga's private channel before requesting permission or scheduling. Channel creation is lazy and awaited, so a native rejection is shown in the reminder control instead of becoming an unhandled startup promise.

The automated runtime-boundary test must verify Android Expo Go never receives Alaga's custom channel ID, while an Android development build does. Compilation and export checks do not replace a physical Expo Go smoke test.

## Metro and native dependency troubleshooting

Stop Metro before installing or updating Expo/native packages. A running bundler can retain a dependency map from the middle of an npm update and then report that an existing module cannot be resolved.

If Metro reports a missing file under `node_modules`:

1. Confirm the package and referenced file are present.
2. Stop every Metro process for this project.
3. Run `npx.cmd expo-doctor`.
4. Restart with `npx.cmd expo start --clear`.
5. Before considering the repair complete, run `npx.cmd expo export --platform android --clear` and the normal type and server tests.

The App Store URL-opening error on Windows is separate from application bundling: Expo cannot launch the iOS App Store from Windows. Test iOS through a macOS/iOS environment; use Android or web locally on Windows.
