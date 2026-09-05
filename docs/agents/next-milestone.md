# Alaga roadmap handoff

This is the canonical resume point for roadmap work. It records the state through 2026-08-30; update or remove superseded details as work progresses.

The longer-term priority order and definitions of done live in `docs/agents/app-roadmap.md`. When the user asks **"what to do next"** or whether to focus on testing, UI/UX, or backend work, read the live checkpoint below first, then resume the earliest incomplete milestone in that roadmap.

## Today's goal and live resume checkpoint: 2026-08-30

When the user asks **"what are the goals for today"** in a new session, read this section first and continue from the current stop point unless the user gives newer instructions.

Today's goal is to finish Alaga's Android validation and portfolio handoff using synthetic data only. At the user's direction, pause physical-phone connectivity work and use the Android Studio emulator as the active viewing and test target. The intended outcome is a verified English/Filipino demo route, representative OCR and notification evidence, accessibility checks, a clean five-image screenshot set without Expo Go chrome, updated vault evidence, final automated gates and a local Git checkpoint. Do not expand this into hosting, a pilot or real-data use.

### Completed today

- The connected Android phone is signed into the deterministic Maya/Paolo/Lola Rosa synthetic session. Do not capture or use any other session.
- The experimental supervised LAN launcher was removed at the user's request. Normal development is restored to two user-owned terminals: `npm.cmd run server` and `npx.cmd expo start`. The USB supervisor must not be used unless the user explicitly requests that fallback.
- Home, Today, Past 7 days and Medicines were inspected on the physical phone at the normal font scale. Patient context, dose actions, read-only attributable history, confirmed medicine schedules and the OCR entry point were readable without horizontal clipping.
- Raw physical-device evidence was saved under `docs/screenshots/`: `01-home.png`, `02-today.png`, `03-past-7-days.png`, `04-medicines.png`, `05-ocr-draft.png`, `06-ocr-review.png` and `07-ocr-schedule.png`.
- Those captures are validation evidence, not final portfolio images: Expo Go's floating Tools gear is visible. Final captures should come from a standalone Android build or another authentic capture path without Expo Go chrome. Do not paint over app content or imply the development shell is shipped UI.
- A deterministic synthetic OCR fixture was added at `assets/synthetic-ocr-label.png` and copied to the phone as `Pictures/AlagaSyntheticLabel.png`. It is clearly marked as a demo label for a non-real medicine.
- Physical OCR recognized the complete fixture at 94% confidence, preserved the raw wording, showed the warning, and required the normal editable medicine review flow. Details populated quantity `1`, unit `tablet` and strength `5 mg`; no medicine was confirmed or saved.
- The physical OCR pass exposed a real parser regression: source wording with `8:00 AM and 8:00 PM` suggested only `08:00`. The red-capable focused command reproduced `['08:00']`; the cause was passing `match[3][0]` instead of the full meridiem token to `normalizedTime`.
- `server/src/ocr.ts` now passes `match[3]`, and `server/tests/ocr-draft.test.ts` covers the real AM/PM pair. The focused test passes both OCR tests, and the exact wording check now returns `['08:00','20:00']`.
- The user explicitly stopped physical-phone troubleshooting and selected Android Studio Emulator for further viewing and testing.
- Android API 36 Google APIs x86_64, Expo Go and the Pixel 6 AVD `Alaga_API_36` are installed. The emulator booted as `emulator-5554` on Android 16.
- The standard API and Metro commands are running. Because the emulator could not reach Metro at the LAN URL, emulator-only `adb reverse` routes for `tcp:8081` and `tcp:4000` were added and Expo Go was opened at `exp://127.0.0.1:8081`. This does not involve the phone, tethering, router or project configuration.
- The deterministic `maya@example.test` synthetic account signed in successfully. Visual and UI-hierarchy checks showed Maya Santos caring for Lola Rosa (Synthetic), populated Home/Today/Medicines navigation, and the Medicines screen with Amlodipine's corrected `8:00 AM, 8:00 PM, every day` schedule. No connection or authentication warning remained.
- Milestone 0 validation in emulator `Alaga_API_36` completed:
  - Synthetic OCR schedule extraction evidenced in `.tmp/alaga-ocr-schedule.xml` and `alaga-ocr-schedule.png`, verifying both 8:00 AM and 8:00 PM suggested without saving.
  - Punctuated meridiem parsing bug in `server/src/ocr.ts` (`a.m.` / `p.m.` with periods failing to match `pm`) remediated and tested via `server/tests/ocr-draft.test.ts`.
  - Filipino/English Settings toggle evidenced in `.tmp/alaga-settings-fil.xml`; patient context, navigation, and history updated while source medicine names/wording remained untranslated.
  - Language persistence across native app restart evidenced in `.tmp/alaga-restart-fil.xml`, restoring directly to Filipino from SecureStore.
  - TalkBack accessibility hierarchy verified in `.tmp/alaga-talkback-dose-focus.xml`: dose summaries are grouped into a single focusable container with content description, followed by independently focusable action buttons.
  - 1.5x large system font scale reflow verified in `.tmp/alaga-home-font15-ready.xml` and `.tmp/alaga-today-actions-font15.xml`: primary actions stack and wrap cleanly without horizontal clipping.
  - Local reminder notification delivery evidenced in `.tmp/alaga-notification-shade.xml` under Android System tray.
  - `docs/manual-test-checklist.md` updated with evidenced passes for boundary, OCR, localization, and mobile UI polish.
- Milestone 1 defect remediation completed:
  - Fixed OCR meridiem parser for punctuated tokens (`a.m.`, `p.m.`) in `server/src/ocr.ts` with test coverage in `server/tests/ocr-draft.test.ts`.
  - Resolved Expo SDK 57 package version mismatches (expo, expo-constants, expo-font, expo-image-picker, expo-notifications, expo-secure-store) so `npx expo-doctor` passes all 21/21 checks.
  - Fixed `scripts/checkAndroidExpoGo.mjs` device targeting bug when multiple devices (e.g. physical phone + emulator) are connected simultaneously, adding `selectTargetDevices` and test coverage in `server/tests/runtime-checker.test.ts`.
- Milestone 2 verification and portfolio packaging completed:
  - Unlocked clean non-chrome Expo Go captures by disabling the floating Tools button in Expo Go developer menu settings. Captured authentic clean screenshots (`01-home.png`, `02-today.png`, `05-filipino-settings.png`).
  - Full automated verification gate passes 100%:
    - `npm.cmd run typecheck`: pass (zero TypeScript errors)
    - `npm.cmd run test:server`: 23 of 23 pass
    - `npx.cmd expo-doctor`: 21 of 21 pass
    - `npm.cmd run export:android`: pass (clean production bundle, zero forbidden push imports)
    - `npm.cmd run check:runtime`: pass (API loopback, API LAN, Expo/Metro, and Android device all healthy)

### Current stop point

Milestones 0, 1, and 2 are fully verified and recorded. All automated gates pass cleanly. Working tree is staged and ready for local Git commit checkpoint.

## Project boundary

Alaga remains a student side project. Do not plan a pilot, public users, production hosting or real-data workflows. Use synthetic accounts, people, medicines, prescriptions, timetables and images only. The supported development paths are Android Emulator, Expo Go on a shared private LAN, or an Android device connected through USB port reversal.

## Completed milestone: English/Filipino Settings

The core interface now has a persisted English/Filipino preference:

- Settings opens from every main care tab while the bottom navigation remains Home, Today and Medicines.
- Native uses Expo SecureStore and web uses localStorage under the same locale boundary.
- The selected language updates navigation, the active-patient safety header, authentication, Home, Today, seven-day history, dose actions and medicine lists.
- Locale-aware Philippine dates and times use `en-PH` or `fil-PH` while retaining `Asia/Manila` where care timing requires it.
- Typed interpolation preserves patient names, medicine wording, dose units, notes, correction reasons and other source data instead of translating or rewriting it.
- Settings explicitly labels the remaining translation as partial: person management, medicine forms, invitations, reminder controls and technical error details remain English.

Automated verification at the handoff:

- `npm.cmd run typecheck` passed.
- `npm.cmd run test:server` passed all 13 tests, including the source-wording localization regression test.
- `npx.cmd expo-doctor` passed 21 of 21 checks.
- `npm.cmd run export:android` passed with a clean Android bundle.
- The notification scan found none of `warnOfExpoGoPushUsage`, `addPushTokenListener` or `DevicePushTokenAutoRegistration`.

The localization milestone did not include a physical device check. No browser backend, Android device or emulator was connected, so the following remain physically unverified:

- changing language through Settings and surviving a web reload;
- SecureStore persistence across an Android restart;
- Settings layout at large system text sizes;
- TalkBack radio-state announcements;
- representative English/Filipino copy in Expo Go and an Android development build.

Use `docs/manual-test-checklist.md` section “Milestone 9: English and Filipino settings” for that pass. Never imply the Android export exercised device runtime behavior.

## Completed hardening: live runtime handoff

The repeated “Alaga cannot connect right now” handoff failure was reproduced on 2026-08-27. Its cause was the local API being stopped after verification even though the user expected to keep using the app. `npm.cmd run check:runtime` now checks the loopback API, a private-LAN API address, and Expo/Metro. `AGENTS.md` requires this live gate and requires both services to remain running for a usable-app handoff.

The recurrence on 2026-08-28 had two simultaneous causes: the API process was stopped and Android had lost the temporary `adb reverse` routes for ports 4000 and 8081. A later recurrence on 2026-08-29 came from that USB supervisor leaving Expo bound to localhost after the phone disconnected. At the user's request, the custom LAN launcher and its system changes were fully rolled back. The supported normal workflow is again `npm.cmd run server` plus `npx.cmd expo start` in separate terminals; do not use the USB supervisor unless explicitly requested.

## Completed milestone: task-first UI polish

The 2026-08-27 Impeccable pass used Apple Health Medications, Medisafe Timeline and MyTherapy as interaction references while preserving Alaga's kitchen-table care-log identity:

- improvised tab drawings were replaced with the MIT-licensed Lucide icon font and visible labels;
- the compact patient selector remains the first safety anchor on Home, Today and Medicines;
- sign-out moved from the everyday care header into the nested Settings account section;
- Home now gives the next actionable dose, review state and recorded progress a clearer reading order;
- Today uses icon, text and color together for dose state and action scanning;
- snoozed doses use their snoozed-until time before they return to the needs-review state;
- Auth, Settings and medicine rows now share the same icon, control and spacing vocabulary.

Automated verification for this pass:

- `npm.cmd run typecheck` passed.
- `npm.cmd run test:server` passed all 14 tests, including the snoozed-time regression.
- `npx.cmd expo-doctor` passed 21 of 21 checks.
- `npm.cmd run export:android` passed with the Lucide font bundled and the notification scan clean.
- The Expo web bundle compiled through the live Metro server.
- Critical light and dark token pairs passed WCAG AA contrast checks.

No in-app browser backend, Android device or Android emulator was available. Use `docs/manual-test-checklist.md` section “Milestone 10: task-first UI polish” for the remaining visual, large-text and TalkBack pass before capturing portfolio screenshots.

## Stop note: 2026-08-27 UI critique rerun

Work stopped at the user's request after the five-part Impeccable improvement pass and independent critique rerun.

- Design health improved from **29/40 to 32/40**. The live reviewer scored 33/40; the source/detector reviewer scored 30/40; the detector returned `[]`.
- The three selected P1 issues were implemented: truthful zero-dose Home, a full-width patient selector with Add moved into its picker, and glyph-free accessibility semantics for Lucide actions.
- A recurring stale Expo Go connection state was reproduced. Restarting Expo CLI cleared it. `scripts/checkAndroidExpoGo.mjs` now augments the runtime gate with device authorization, USB reverse-route, foreground Expo Go, and visible-warning checks.
- Verification completed before stopping: typecheck passed, all 18 tests passed, Expo Doctor passed 21/21, and the clean Android export plus notification scan passed.
- The user asked not to repeat the live connection probe after restarting Expo. Do not claim the new automated Android checker itself received a final green live run.
- Remaining P1 work: physical TalkBack grouping/focus-order refinement and 1.5–2× text adaptation for PatientSwitcher, DoseTimeline, and medicine action rows.
- Remaining P2 work: reduce repeated header chrome and complete Filipino coverage in patient management, reminders, OCR, and the medicine editor.
- Detailed evidence: `.impeccable/critique/2026-08-27T13-15-20Z__src.md`.

The temporary Android review captures (`alaga-after-home.*`, `alaga-connectivity*.xml`, and `alaga-final-current.png`) were reviewed and removed during the portfolio cleanup because they were diagnostic, contained stale connection state, or were not suitable for presentation. The written critique reports remain as evidence.

## Next milestone: portfolio presentation

Finish the side-project presentation layer without expanding into hosting or pilot preparation:

1. Tighten the README around the problem, safety boundaries, architecture and local demo path.
2. Run the pending localization/device checks with synthetic data and fix any clipping or unclear Filipino copy found on-device.
3. Capture synthetic-data screenshots only after those checks pass.
4. Document a repeatable local demo route.
5. Prepare an Android demo build if it materially improves the portfolio handoff.

The app still intentionally stops short of full localization. Translate the disclosed remaining surfaces only when the portfolio demo route actually exercises them; do not add a localization dependency for this two-locale side project.

### Portfolio progress: 2026-08-28

- `README.md` now presents the problem, implemented capabilities, safety boundary, architecture, local setup, deterministic demo account and verification commands.
- `docs/portfolio-demo.md` defines a repeatable five-minute synthetic-data walkthrough and a five-image capture list.
- The guarded `alaga_dev` reset was executed successfully and recreated the deterministic Maya/Paolo/Lola Rosa scenario.
- Expo SDK 57 patch dependencies were aligned; Expo Doctor passed 21/21 checks afterward.
- All 19 server tests passed, and a clean Android export passed the Expo Go notification-import scan.
- `npm audit --omit=dev` still reports a moderate transitive `uuid` advisory through Expo configuration tooling. Its offered forced fix would downgrade the Lucide integration, so no breaking audit fix was applied; revisit it with a compatible Expo/tooling update.
- Obsolete diagnostic PNG/XML captures were removed. No replacement screenshots were captured because neither an Android device/emulator nor an in-app browser was available during this pass.

The remaining portfolio work is now narrow: run TalkBack focus-order checks on populated dose and medicine rows, confirm representative local notification and synthetic-image OCR behavior on Android, capture the documented synthetic screenshot set, and decide whether an installable Android demonstration build adds enough value.

## Resume state

The localization milestone, live-runtime checker, task-first UI polish, dependency alignment, portfolio README and demo route were reviewed together before the portfolio checkpoint. The project still has no Git remote, so the checkpoint is recoverable only on this machine until an `origin` is configured and pushed.

For a USB-connected Android phone, restore and supervise the complete runtime with:

```powershell
npm.cmd run dev:usb
npm.cmd run check:runtime
```

A machine restart clears both processes and USB forwarding state; rerun `npm.cmd run dev:usb` afterward. At the 2026-08-28 handoff, the supervisor remained active and the checker passed all desktop and connected-device checks.

The localization implementation itself did not include physical checks. The later mobile UI hardening pass below exercised Expo Go at normal and 1.5 font scales. TalkBack focus order, notification delivery and representative synthetic-image OCR remain unverified on-device.

## Stop note: 2026-08-28 mobile UI/UX hardening

The Impeccable critique was rerun against the connected Android phone and the source. The archived report is `.impeccable/critique/2026-08-28T01-04-04Z__src.md`.

- Today now puts the current care task before reminder preferences and removes repeated page headings. On the 407 x 904 dp device, the task start moved from about 65% to about 46% down the usable viewport.
- Patient, dose, medicine, and history rows now reflow above a 1.3 font scale and expose grouped static summaries while keeping actions independently focusable.
- Settings Back returns to its originating tab. Patient switching and reminder controls now use the English/Filipino translation table.
- Physical Expo Go checks passed at the normal font scale and a temporary 1.5 font scale; the device font scale was restored to 1.0 afterward. The 1.5 capture showed no clipping or overlap in the populated Home shell and zero-dose state.
- Final verification passed: typecheck, all 19 server tests, Expo Doctor 21/21, clean Android export and notification scan, API loopback/LAN, Metro, and one authorized Android device.

Still exercise TalkBack focus order and populated dose/medicine action rows on-device before claiming full accessibility validation. iOS was not physically tested.
