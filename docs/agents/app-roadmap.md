# Alaga app roadmap

This is the durable milestone plan for deciding what to do next after the live checkpoint in `next-milestone.md`. It was last reviewed on 2026-08-30.

When the user asks **"what to do next"**, **"what are the goals for today"**, or asks whether to work on testing, UI/UX, or the backend, read `next-milestone.md` first and then use this roadmap. Resume the earliest incomplete milestone unless the user gives a newer priority.

## Product boundary

Alaga remains a student portfolio side project for synthetic data. Do not expand the roadmap into real patient data, a public pilot, paid hosting, clinical claims, remote push delivery, or production operations unless the user explicitly changes the project boundary.

The current target is Android. Use `Alaga_API_36` as the default test device. Physical-phone, tethering, router, and LAN troubleshooting are not roadmap work unless the user explicitly asks to return to them.

## Priority rule

Use this order when choosing work:

1. Finish an already-started validation pass.
2. Fix defects that the pass actually exposes, especially safety, accessibility, data integrity, or blocked-demo defects.
3. Re-run the affected checks and capture clean evidence.
4. Improve presentation only after the core route is reliable.
5. Add backend or experimental features only when they solve a demonstrated gap.

Do not redesign working screens or add infrastructure merely to make the project look larger. Prefer a small, credible, well-tested demo.

## Milestone 0 — finish Android validation (in progress; do next)

Goal: prove the current synthetic demo route works in the Android emulator before adding features.

Work:

- Resume the exact emulator state and commands recorded in `next-milestone.md`.
- Re-run the synthetic OCR image through Review every field and Schedule; verify both 8:00 AM and 8:00 PM are suggested, without confirming or saving the medicine.
- Verify English/Filipino switching across the documented demo route and persistence after restart. Source data such as names, medicine wording, units, notes, and OCR text must remain unchanged.
- Exercise one representative local notification and record only what was actually observed.
- Exercise TalkBack focus order and grouped announcements on populated dose and medicine rows.
- Check populated Home, Today, and Medicines at 1.5 font scale, then restore 1.0.
- Record passes and failures in `docs/manual-test-checklist.md`.

Exit criteria:

- OCR shows both expected times and still requires human review.
- Language switching and persistence are evidenced on Android.
- Notification and TalkBack results are explicitly recorded as passed, failed, or environment-blocked.
- No clipped primary action or misleading medication status is visible at 1.5 font scale.
- Every discovered regression has a reproducible note before it is fixed.

## Milestone 1 — repair only evidenced UI/UX defects

Goal: fix the concrete issues found in Milestone 0 without starting a broad redesign.

Likely focus areas, only if validation shows a problem:

- TalkBack grouping, focus order, selected-state announcements, and meaningful action labels.
- Reflow for populated dose and medicine action rows at large text sizes.
- Unclear English/Filipino copy on the five-minute demo route.
- Repeated header chrome or controls that hide the current care task.
- Connection, empty, retry, and permission states that do not tell the user what to do.

For each fix, add the smallest useful regression test when the behavior can be tested as pure logic or through the existing server test runner. Do not add a heavy UI test framework solely for one fix.

Exit criteria:

- All Milestone 0 blocking defects are fixed or consciously documented as deferred.
- The affected emulator checks pass again at normal and 1.5 font scales.
- `npm.cmd run typecheck`, `npm.cmd run test:server`, Expo Doctor, and the Android export/notification scan pass.

If Milestone 0 finds no material UI/UX defect, skip this milestone.

## Milestone 2 — portfolio-ready demo package

Goal: make the implemented product easy to understand, run, and present without pretending it is production-ready.

Work:

- Capture the five clean synthetic-data images defined in `docs/portfolio-demo.md`: Home, Today, Past 7 days, Medicines/OCR entry, and Filipino Settings.
- Exclude Expo Go Tools chrome, connection warnings, and unrelated device notifications. Do not paint over app UI.
- Run the full five-minute demo route from a fresh synthetic reset.
- Decide whether an installable emulator demo build adds enough value. Prefer it if it removes Expo Go chrome and remains repeatable with the local API; otherwise document the Expo Go/emulator route honestly.
- Tighten README/demo instructions only where the rehearsal exposes ambiguity.
- Run all final automated gates and the live runtime gate.
- Create a local Git checkpoint after reviewing the existing uncommitted work. Adding a remote remains optional and requires the user's chosen repository/account.

Exit criteria:

- A fresh reviewer can start the project and complete the demo route from the docs.
- The five screenshots are authentic, consistent, and use only the deterministic Maya/Paolo/Lola Rosa dataset.
- The README states the safety boundary, architecture, demo credentials, and verification commands.
- The working state is recoverable from a reviewed local commit.

## Milestone 3 — targeted reliability and test hardening

Goal: protect the flows most likely to break without pursuing a coverage percentage for its own sake.

Priority scenarios:

- Session restore, expiration, sign-out, and useful recovery after API downtime.
- Patient switching with no cross-patient medicine, timeline, or history leakage.
- Medication edit/version/archive behavior and invalid schedule input.
- Duplicate dose actions, correction history, snooze timing, and reminder de-duplication.
- OCR parsing for AM/PM pairs, uncertain fields, vague instructions, invalid image types, and size limits.
- Localization invariants that preserve names and source wording.
- Runtime startup and emulator port reversal after a reboot.

Prefer database integration tests and pure-function regression tests in the existing `node --test` setup. Add component or end-to-end tooling only when an important behavior cannot be tested reliably through the existing boundaries.

Exit criteria:

- Every known regression has a focused automated test where practical.
- Synthetic reset plus the automated suite is deterministic from a clean local database.
- Offline/retry and expired-session behavior are manually evidenced in the emulator.
- The runtime documentation matches the commands that actually work.

## Milestone 4 — backend robustness, only after the demo is stable

Goal: strengthen the existing local Node/PostgreSQL boundary, not replace it.

Candidate work should be selected from observed failures:

- Normalize API error responses so the app can distinguish validation, authorization, expired session, conflict, and connectivity failures.
- Add missing boundary tests for row-level security, role permissions, idempotency, migrations, and deterministic reset behavior.
- Review request-size limits, timeouts, cancellation, and OCR worker cleanup under repeated requests.
- Add concise development logging that aids diagnosis without logging session tokens, OCR image data, or patient content.
- Verify migrations work from an empty database and an existing development database.

Exit criteria:

- Backend changes correspond to a reproduced risk or demo failure.
- Authorization and data-integrity guarantees remain covered by integration tests.
- No secret or synthetic medical content is exposed in logs.
- Setup, migration, reset, test, and runtime commands are documented and repeatable.

## Milestone 5 — optional experiments and future choices

These are not current work. Re-evaluate them only after Milestones 0–3:

- Compare local Tesseract OCR with a cloud model such as GLM OCR using a small, explicitly synthetic image fixture set. Measure field accuracy, schedule accuracy, latency, cost, failure behavior, and privacy—not just whether the output looks plausible. Keep any provider secret on the server. Local OCR is sufficient for present prototype testing.
- Build a standalone Android APK if it improves portfolio review. A physical standalone build still needs an intentional API connectivity strategy; the local PostgreSQL-backed server is not bundled into the APK.
- Complete Filipino translation outside the demo route.
- Add iOS validation when a macOS/iOS test environment exists.
- Revisit the compatible Expo/tooling update that resolves the transitive `uuid` audit advisory without a breaking downgrade.

Still deferred outside the current side-project scope: real-data use, verified email delivery, account recovery, offline writes/conflict resolution, remote caregiver push, hosted infrastructure, app-store release, analytics, and clinical validation.

## Current recommendation

The next session should start with **Milestone 0, synthetic OCR schedule verification in `Alaga_API_36`**. Continue through Filipino persistence, notification, TalkBack, and large-text checks. Do not begin a general UI redesign or backend expansion before that evidence is recorded.

