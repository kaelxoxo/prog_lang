# Alaga mobile smoke-test checklist

Use synthetic test accounts and patient profiles only. Android is the current side-project target. Run iOS checks later when a suitable macOS/iOS environment is available, and record them separately rather than implying that Windows or an Android export exercised iOS.

## Side-project boundary

- [ ] The persistent notice says this is a side-project build and permits synthetic information only.
- [ ] No real person, account, medicine, prescription, timetable or label image is used.
- [ ] Resetting demo data requires the explicit destructive confirmation flag and refuses non-development database names.

## Current account and patient context

- [ ] Launching the app shows registration or sign-in without clipping or overlap.
- [ ] Registering or signing in opens the account-backed care space.
- [ ] A new account without patients sees the directed first-person empty state.
- [ ] Creating the first patient opens that person's Today context.
- [ ] The screen clearly names the active patient before showing patient-scoped status.
- [ ] “Change person” opens the patient picker.
- [ ] Closing the picker leaves the active patient unchanged.
- [ ] Android system Back dismisses the picker without changing the active patient.
- [ ] Choosing another authorized synthetic patient updates identity, timeline and medicines together.
- [ ] Signing out returns to authentication and the revoked session cannot access patient data.
- [ ] The displayed date is correct for `Asia/Manila` around local midnight.

## Accessibility

- [ ] VoiceOver and TalkBack announce “Change person” as a button with a useful hint.
- [ ] The picker heading and purpose are announced when it opens.
- [ ] Each patient option is announced as a radio option with its selected state.
- [ ] Focus does not move to content behind the open picker.
- [ ] Every primary control is comfortably tappable and at least 48 by 48 dp.
- [ ] Essential text and actions remain visible at the largest practical system font size.
- [ ] Text and selected states remain understandable without relying on color alone.
- [ ] Keyboard or switch-control navigation can enter, use and leave the picker.

## Platform and layout

- [ ] Android content does not overlap the status bar or gesture navigation area.
- [ ] Android three-button system navigation does not cover the app's Home, Today or Medicines bar.
- [ ] iPhone content respects the notch, Dynamic Island and home indicator.
- [ ] Tablet layout remains readable and does not stretch text to an uncomfortable line length.
- [ ] Portrait orientation remains enforced as configured.
- [ ] App background and modal transition do not flash an unintended color.

## Safety language

- [ ] Only synthetic names and status text appear.
- [ ] No screen claims that an unrecorded dose was definitely missed.
- [ ] No diagnosis, treatment recommendation, interaction conclusion or dosing advice appears.
- [ ] Draft timetable text states that reminders require review and confirmation.

## Slice 2: accounts and membership-backed patients

- [ ] A new account requires a display name, valid email and password of at least 12 characters.
- [ ] An existing account can sign in and an invalid password produces a useful error.
- [ ] Restarting the native app restores a valid session from secure storage.
- [ ] Signing out revokes the server session and returns to the authentication screen.
- [ ] A new account sees a directed empty state rather than synthetic patient data.
- [ ] Creating a patient immediately opens that patient's Today context.
- [ ] “Add person” creates another patient and “Change person” switches between authorized profiles.
- [ ] Restarting the API does not remove accounts, sessions or patient profiles.
- [ ] Stopping the API produces a useful connection error and a working retry action.
- [ ] Signing in as a second account does not expose the first account's patients.
- [ ] A revoked caregiver no longer sees the patient on the next request.
- [ ] A physical device connects through the computer's LAN address without exposing PostgreSQL itself.

## Slice 3: confirmed medicines and schedules

- [ ] An owner sees "Add medicine" for the active patient and an unprivileged caregiver does not.
- [ ] Medicine entry follows Details, Schedule, then Review and confirm, with the active person's name visible on every step.
- [ ] Name, strength value/unit, dose quantity/unit, form and route remain visibly separate.
- [ ] Leaving strength, form or route blank produces a review warning and never a guessed value.
- [ ] Fixed times use native time selection, allow adding/removing individual reminders and require at least one time.
- [ ] Repeating intervals accept only whole values from 1 to 24 hours and use native selection for the first time.
- [ ] Meal scheduling shows breakfast, lunch and dinner with before/after choice, native reminder selection and progressively disclosed custom windows.
- [ ] "Every day" is the default; choosing specific weekdays exposes accessible checkbox states and requires at least one day.
- [ ] Start and optional end dates use native date selection and reject an end before the start.
- [ ] Review shows every medicine detail, every meal window, source wording, notes and the person receiving the medicine.
- [ ] Confirming closes the editor, highlights the medicine and announces person-specific success.
- [ ] Editing and confirming creates version 2 and immediately shows the new current details.
- [ ] Closing an edited form asks whether to keep editing or discard changes.
- [ ] Archiving asks for confirmation, shows pending state, removes the medicine from the active list and offers a working Undo action.
- [ ] Switching patients changes the medicine list with the identity card; no medicine leaks between patients.
- [ ] Closing the editor before confirmation creates no active medicine or schedule.
- [ ] Restarting the API preserves confirmed medicines and their current versions.

## Slice 4: Today care log and navigation

- [ ] The bottom navigation shows only Home, Today and Medicines, with the current destination announced as selected.
- [ ] Today lists confirmed doses in chronological order with time, medicine, dose and a text status.
- [ ] An untouched entry says "Not recorded" and no interface calls it missed.
- [ ] Taken and Skip ask for confirmation before creating a permanent care-history entry.
- [ ] Snooze offers exactly 15, 30 and 60 minutes and updates the due time.
- [ ] A saved action shows the caregiver's display name and recorded time after refresh.
- [ ] Repeated tapping while a write is pending does not create duplicate records.
- [ ] A second taken/skipped action for the same occurrence is rejected and the existing history remains visible.
- [ ] Editing today's medicine after the timeline loads does not rewrite today's materialized dose details.
- [ ] Switching people replaces the timeline and medicine list together.

## Slice 5: local reminders

- [ ] Reminders are initially off and no permission prompt appears before tapping Turn on.
- [ ] Denying notification permission leaves reminders off and provides a device-settings route.
- [ ] Enabling reminders schedules only future, non-terminal occurrences for the next seven days.
- [ ] Lock-screen text contains no patient name, medicine name or dose.
- [ ] Reopening Today does not create duplicate scheduled notifications.
- [ ] Snoozing replaces the occurrence's old time; recording taken or skipped removes its pending reminder on sync.
- [ ] Turning reminders off cancels pending local reminders for that patient.
- [ ] Reminder preferences remain separate when switching accounts or patients on one device.

## Interface hardening

- [ ] The intentional synthetic-data notice is the only development-scope language in the caregiver interface.
- [ ] The Today layout remains centered and readable on a tablet instead of stretching edge to edge.
- [ ] At large system text sizes, patient actions wrap and medicine fields stack instead of clipping.
- [ ] Schedule patterns, before/after choices, weekdays, end-date state and patient selection announce their selected state to VoiceOver and TalkBack.
- [ ] No medicine, schedule or warning label is smaller than 13sp.
- [ ] Medicine and patient search appears once the corresponding list becomes long.
- [ ] Confirmed, warning and error states remain understandable without relying on color.

## Milestone 5.5: Home

- [ ] Creating, selecting or accepting access to a patient opens Home for that person.
- [ ] Home names the active person before showing care information.
- [ ] The next upcoming dose is understandable at a glance without hiding its medicine or quantity.
- [ ] A passed scheduled or snoozed time without a final event says it needs a care record and never claims it was missed.
- [ ] Today's recorded count includes taken and skipped events and updates after a Today action.
- [ ] Open Today and Manage/View medicines lead to the correct destination.
- [ ] Home remains a single calm reading flow at large text sizes and on a tablet, without becoming a repeated card grid.
- [ ] The compact patient selector remains visible before care content without dominating the screen.
- [ ] Care-circle membership and invitation controls stay collapsed until the caregiver chooses Manage.

## Slice 6: caregiver invitations and shared attention

- [ ] A signed-in account with no patients sees matching pending invitations before the first-patient prompt.
- [ ] An owner can invite a normalized caregiver email and choose whether medicine management is allowed.
- [ ] The interface states that invitation email is not sent and tells the owner how the caregiver will find it.
- [ ] An unrelated signed-in account cannot see or accept another email's invitation.
- [ ] Accepting adds the patient to the caregiver account and opens that person's Home context.
- [ ] Declining adds no patient access.
- [ ] A pending invitation can be cancelled by the owner.
- [ ] The owner sees active members and can revoke a caregiver after confirmation.
- [ ] Revocation removes the patient on the caregiver's next request while earlier dose records retain attribution.
- [ ] A caregiver without medicine-manager permission can view medicines but cannot add, edit or archive them.
- [ ] A caregiver with medicine-manager permission can perform the confirmed medicine workflow.
- [ ] Owner-only care-circle data and actions are unavailable to caregivers and unrelated accounts.
- [ ] An accepted caregiver sees the same overdue-without-final-record attention on Home; no remote escalation is implied.

## Slice 8: seven-day history and archive browsing

- [ ] Today exposes Today and Past 7 days as accessible tabs without adding another bottom-navigation destination.
- [ ] Past 7 days names the active person and presents the newest available care day first.
- [ ] History remains read-only and shows scheduled time, medicine, dose, status, actor, recorded time and correction reason when available.
- [ ] Opening History does not invent occurrences for old days that Alaga never materialized.
- [ ] Recording or correcting a Today entry refreshes History without waiting for the normal query stale time.
- [ ] An archived medicine disappears from active medicines and creates no new care entries.
- [ ] Archived medicines remain behind a collapsed control with an announced expanded state.
- [ ] An authorized medicine manager can restore an archived medicine; an ordinary caregiver cannot.
- [ ] Recorded care history remains visible after its medicine is archived.
- [ ] An unrelated account cannot query either the seven-day history or archived-medicine list.
