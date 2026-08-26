# Alaga roadmap handoff

This is the canonical resume point for roadmap work. It records the decisions made on 2026-08-26; update or remove superseded details as work progresses.

## Project boundary

Alaga remains a student side project. Do not plan a pilot, public users, production hosting or real-data workflows. Use synthetic accounts, people, medicines, prescriptions, timetables and images only. The supported development paths are Android Emulator, Expo Go on a shared private LAN, or an Android device connected through USB port reversal.

## Next milestone: English/Filipino Settings

Add a small Settings view that lets the user select English or Filipino and persists the selection locally.

Decisions already made:

- Keep the bottom navigation limited to Home, Today and Medicines. Open Settings from Home instead of adding a fourth tab.
- Use the existing SecureStore boundary on native and its localStorage fallback on web; do not add a localization dependency unless the existing boundary proves insufficient.
- Translate interface copy, beginning with navigation, the active-patient safety header, authentication, Home, Today/history and the medicine-management shell.
- Never translate or rewrite user-entered/source data such as names, medicine wording, notes, OCR output or label text.
- Keep safety wording cautious in both languages. An unrecorded dose must not be described as definitely missed.
- If the first implementation does not cover every interface string, label and document it as partial instead of implying full localization.

Likely entry points already inspected:

- `src/features/auth/sessionStorage.ts`
- `src/features/home/HomeScreen.tsx`
- `src/features/patients/CareHeader.tsx`
- `src/features/auth/AuthScreen.tsx`

Completion criteria:

- Settings is reachable from Home and does not change the three-item bottom navigation.
- English and Filipino controls are accessible and clearly announce their selected state.
- The locale survives a native restart and a web reload.
- Navigation, the active-patient safety context and the core auth/Home/Today/history/medicine shell respond to the selected locale.
- User-entered and OCR-derived content remains byte-for-byte unchanged by locale selection.
- `npm.cmd run typecheck`, `npm.cmd run test:server`, `npx.cmd expo-doctor` and `npm.cmd run export:android` pass.
- The Android export notification scan still finds none of `warnOfExpoGoPushUsage`, `addPushTokenListener` or `DevicePushTokenAutoRegistration`.
- Device-only behavior is reported as unverified until it is physically exercised in Expo Go or an Android development build.

## Resume state

No localization or Settings code has been started. The saved repository checkpoint was clean at commit `d0e6e61` (`Keep OCR model cache outside version control`). Recent completed milestones are seven-day history/archive browsing and synthetic local OCR medicine drafts. At the checkpoint, type checking, 12 server tests, Expo Doctor (21 checks), clean Android export, the notification bundle scan and the OCR worker smoke test passed.

Metro and the local API were stopped after verification. Start them in separate terminals with:

```powershell
npm.cmd run server
npm.cmd start
```

No device or emulator was attached at the checkpoint. Physical Expo Go layout, TalkBack, notification runtime and representative synthetic-image OCR checks remain pending; do not treat export success as those runtime checks.

## After localization

Finish the side-project presentation layer: tighten the README, capture synthetic-data screenshots, document a repeatable local demo route and prepare an Android demo build if useful. This is portfolio documentation, not hosting or pilot preparation.
