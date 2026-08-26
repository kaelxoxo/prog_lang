# Alaga prototype architecture

## Status

Alaga is an Expo 57 and React Native 0.86 TypeScript side project. The feature paths through Milestone 6 are implemented: account sessions, patient creation, confirmed medication schedules, the attributable Today care log, private local reminders, a family-care Home, and caregiver invitations run through a local Node HTTP API, PostgreSQL 17, and device notification scheduling. Only synthetic data is in scope. This is not a release-readiness claim: the physical-device, accessibility and layout checks in `manual-test-checklist.md` still require recorded execution.

## Product invariant

A user account and patient profile are different entities. One account can manage several patients, and one patient can be shared with several authorized accounts.

All medication information, schedules, reminders, imports and dose records are patient-scoped. The active patient selected in the app is presentation state only; it never grants access to a patient.

An unrecorded dose must be described as **not recorded**, never as definitely missed.

AI timetable extraction produces a draft only. Every field requires human review and confirmation before a schedule can become active or create reminders. Vague instructions such as “three times daily” or “after meals” do not become exact times automatically.

## Prototype architecture

### Mobile application

- React Native, Expo 57 and strict TypeScript.
- Expo Router remains deferred; the current shell directly renders the three implemented destinations: Home, Today and Medicines.
- Feature modules own domain types, providers and repository interfaces.
- Server data uses TanStack Query after the PostgreSQL boundary.
- NativeWind may provide utility styling after installation; theme tokens remain framework-independent.
- `Asia/Manila` is the product default timezone.
- Patient data now comes from the server; synthetic information should still be used during development.

The compact patient identity selector is the primary context control. The selected person must be named before any medication content, and switching patients must replace all patient-scoped content together. Expo safe-area context reserves Android and iOS system-interface insets so the app navigation remains reachable above gesture and three-button navigation areas.

### PostgreSQL boundary

The PostgreSQL boundary currently contains:

- `patients`
- `patient_members`
- `medications`
- immutable `medication_versions`
- version-scoped `medication_schedules`
- immutable `dose_occurrences` pinned to the medication version used for that care day
- append-only `dose_events` for taken, skipped and snoozed actions
- private membership and role helper functions
- transactional patient, medication confirmation, and medication archive functions
- RLS policies, opaque hashed sessions and least-privilege grants

Profile creation must atomically create both the patient and its initial owner membership. Clients cannot insert or elevate memberships directly. Membership revocation is recorded rather than hard-deleted.

The selected patient identifier stored by the client is not an authorization input. RLS resolves the authenticated account from a valid, unrevoked session hash on every patient-scoped query. PostgreSQL credentials stay in the local HTTP server; the Expo client contains only the public API address and stores the raw session token in SecureStore on native platforms.

Every medication and dose table includes `patient_id`. Cross-patient references are prevented with composite foreign keys. A confirmed edit adds a medication version and its schedules in one transaction. Medications are soft-archived. Dose history is append-only and terminal taken/skipped actions are protected against duplicate recording.

### Navigation, Home and reminders

The bottom navigation contains only implemented destinations: **Home**, **Today** and **Medicines**. Home provides the active person's next dose, overdue items without a final care record, today's progress, safe navigation actions, incoming invitations and owner care-circle management. Today owns scheduled dose occurrences and care-history actions; Medicines owns confirmed medicine setup and editing.

An owner can create a seven-day invitation for a normalized email address, choose whether the caregiver may manage medicines, cancel a pending invitation and revoke an active caregiver. A signed-in account sees and may accept only invitations matching its account email. Invitation rows and account email joins remain behind security-definer functions; the API role cannot read them directly. Acceptance creates a caregiver membership, and revocation immediately removes patient access without deleting attributed care history.

This prototype does not send invitation email or verify ownership of an account email. Those controls are required before public deployment. “Not recorded” escalation is currently an in-app shared attention state: every active care-circle member sees overdue items when they open Home. Remote delivery remains deferred.

Reminders are opt-in and scheduled locally for up to seven days. The device stores the preference, and the lock-screen copy omits the patient name, medicine name and dose. Syncing keeps one notification per occurrence and cancels duplicates, changed times, completed doses and stale schedules. Remote delivery remains deferred.

## Vertical slices

- **Slice 1:** Prototype session boundary and multi-patient switching. **Implemented and superseded by the account-backed Milestone 2 flow.**
- **Slice 2:** PostgreSQL-backed authentication, patient creation and membership-backed patient queries. **Implemented.**
- **Slice 3:** Medication CRUD, separate strength/quantity/unit fields and confirmed repeating schedules. **Implemented.**
- **Slice 4:** Today timeline with taken, skipped and snoozed dose records. **Implemented.**
- **Slice 5:** Local patient reminders with duplicate-prevention behavior. **Implemented.**
- **Milestone 5.5:** Family-care Home and interface hardening. **Implemented.**
- **Slice 6:** Caregiver invitation and shared “not recorded” attention. **Implemented.**
- **Slice 7:** Printed timetable image upload, validated AI draft and mandatory review. **Deferred until after history; synthetic images only.**
- **Slice 8:** Seven-day history and archive flows. **Implemented in code; physical-device validation remains open.**

### Planning handoff — 2026-08-26

On 2026-08-25, the product owner identified the missing dashboard and insufficiently friendly interface as the main visible gap after Milestone 5. Milestone 5.5 was approved and implemented on 2026-08-26 before caregiver invitations.

Home now answers, without a corporate analytics layout: who is being cared for, what is next, what needs attention, how today is progressing and what safe action is available. Milestone 6 adds the care-circle invitation path and makes overdue items without a final care record visible to every accepted caregiver. English/Filipino selection and settings remain unnumbered roadmap work.

### Side-project planning handoff — 2026-08-26

The product owner cancelled the proposed private pilot and confirmed that no real hosting or real patient data will be used. The approved order is:

1. Establish a recoverable repository baseline, deterministic automated checks and synthetic database reset/seed tooling.
2. Execute and record Android physical-device, accessibility and layout checks; retain iOS checks as environment-dependent follow-up.
3. Implement seven-day care history and archived-medicine browsing before OCR.
4. Experiment with reviewable photo/OCR drafts using synthetic images only.
5. Add English/Filipino selection and Settings.
6. Prepare portfolio documentation, screenshots, demo data and an Android demonstration build.

Paid hosting, real participant onboarding, verified email, remote push, offline writes and public release operations remain explicitly out of scope.

### Slice 8 implementation notes

Today now contains an accessible Today/Past 7 days switch rather than adding a fourth primary destination. History is read-only and queries only dose occurrences Alaga actually materialized; it never reconstructs an old care day from a newer medication version. Recorded corrections and actor attribution remain visible.

Medicines now includes a collapsed archived section. Archived medicines create no new occurrences, but their latest confirmed details remain browsable and authorized medicine managers may restore them. The history and archived-list API paths retain the same membership-backed authorization boundary as Today and active medicines.

Each large dependent slice starts only after the previous slice’s validation is in place.

## Current shell acceptance criteria

- A user can register, sign in, restore a valid session and sign out.
- A new account receives a directed empty state and can create its first patient profile.
- An account with several authorized patients can switch between them.
- Home names the active person and shows the next dose, overdue items without a final record, and today's recorded progress.
- The active patient is always prominent on the Today screen.
- A user can open, dismiss and use the patient picker.
- Selecting a patient changes the patient name and patient-scoped status together.
- The picker exposes its purpose and selected state to assistive technology.
- Primary touch targets are at least 48 device-independent pixels.
- Synthetic data is used for development and smoke testing; the application makes no diagnosis or medication recommendation.
- Strict TypeScript checking and Expo public-config resolution pass.

## Backend policy acceptance criteria

- Anonymous and unauthorized accounts receive no patient-scoped rows and cannot write them.
- An account cannot read or mutate a patient it has not joined, even when it guesses the patient ID.
- Direct membership insertion, role elevation and provenance changes fail.
- Patient creation produces exactly one patient and one owner membership in one transaction.
- Revocation removes access immediately without deleting audit history.
- Cross-patient medication and dose references fail.
- RLS, grants and sensitive function execution privileges are covered by automated database policy tests.

## Slice 3 acceptance criteria

- An owner or explicitly authorized medicine manager can add a medicine for an accessible patient.
- Medicine name, strength, dose quantity and dose unit remain separate values.
- Fixed-time, repeating-interval and meal-window schedules are supported in `Asia/Manila`.
- A schedule requires at least one weekday, a valid start date and explicit review before confirmation.
- Missing strength, form or route remains visibly "not provided" and is never guessed.
- Editing creates a new confirmed version while retaining the earlier version and schedules.
- Archiving removes a medicine from active queries without deleting its history, and an authorized manager can immediately restore it through the undo action.
- An ordinary caregiver can view confirmed medicines but cannot create, revise or archive them without medicine-manager permission.
- Direct writes remain denied to the API database role; writes use audited security-definer functions.
- API integration tests prove creation, list/current-version behavior, permission denial/grant, version retention and archive retention.

## Slice 4 acceptance criteria

- Today materializes only confirmed, active schedules in `Asia/Manila`.
- An untouched occurrence is shown as **Not recorded**, never inferred as missed.
- Any active patient member can record taken, skipped or 15/30/60-minute snoozed events.
- Taken and skipped actions require confirmation and create attributable, timestamped, append-only history.
- A client action UUID makes a retried write idempotent, while a different second terminal action is rejected.
- Editing a medicine does not rewrite already-materialized occurrences; the care day remains pinned to its original version.
- An unrelated account cannot read a guessed timeline or write a dose event.

## Slice 5 acceptance criteria

- Reminders are off until the user opts in and grants device permission.
- Notifications are local, scheduled for at most seven days, and use generic lock-screen wording.
- One scheduled notification is kept per dose occurrence; duplicates, stale times and removed occurrences are cancelled.
- Taken or skipped doses are removed from the next reminder sync, while snoozing moves the reminder.
- Turning reminders off cancels this patient's pending local reminders.
- Reminder preference is stored per account and patient on the device.

## Milestone 5.5 acceptance criteria

- Home is the default destination after selecting or creating a patient.
- Home names the active person before showing the next dose, attention state or progress.
- A past scheduled or snoozed time without a terminal event is described as needing a care record, never as definitely missed.
- Today's progress counts taken and skipped events as recorded while leaving unknown states visible.
- Home provides clear routes to Today and Medicines without turning the care log into a corporate analytics grid.
- The three-destination shell retains 48dp controls, wrapping actions and a centered tablet content width.
- The app shell consumes device safe-area insets so system status and navigation controls do not cover Alaga controls.

## Slice 6 acceptance criteria

- Only an active owner can create or cancel a caregiver invitation or view the care-circle roster.
- A pending invitation is tied to a normalized email, expires after seven days and may optionally grant medicine-manager permission.
- Only the signed-in account whose email matches the invitation may accept or decline it.
- Accepting creates one active caregiver membership; retrying the same acceptance is idempotent.
- A caregiver cannot invite another caregiver or view the owner's care-circle management data.
- Revocation removes patient access immediately while preserving attributed dose history.
- The API database role cannot read or write private invitation rows directly.
- Accepted caregivers see the same shared Home attention and Today care log for the patient.

## Deferred decisions

- Owner-transfer policy and additional caregiver capabilities beyond medicine management.
- Patient/profile retention and account offboarding policy.
- Verified email ownership, invitation delivery and shared-household identity rules.
- Offline conflict behavior.
- AI vision provider and image-retention window.
- Remote caregiver escalation and push delivery architecture.

These decisions remain deferred while Alaga is a synthetic-data side project. They need explicit treatment before any public, pilot or clinical deployment. The prototype is not a diagnostic or treatment system.
