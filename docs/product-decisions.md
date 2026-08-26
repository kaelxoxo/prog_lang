# Alaga product decisions

This note records confirmed product decisions and later planning handoffs. It is the reference for subsequent design and implementation work; proposals are labelled explicitly until approved.

## Side-project boundary

On 2026-08-26, the product owner confirmed that Alaga remains a student side project. There is no family pilot, public beta or hosted production service in the current scope.

- Use synthetic accounts, people, medicines, schedules, invitations and images only.
- Keep the local API and PostgreSQL architecture; do not add paid hosting or promise access across unrelated networks.
- Android Expo Go on a shared LAN is the primary physical-device path. Android Emulator and USB debugging are the dependable local fallbacks.
- Optimize for a polished portfolio application with a sound future product foundation, without taking on production operations prematurely.
- Defer verified identity, real invitation delivery, remote push, offline writes, production monitoring and legal/clinical deployment controls.

The next work order is repository and local-development reliability, physical-device UX validation, seven-day history and archive browsing, synthetic photo/OCR experimentation, English/Filipino settings, then portfolio documentation and an Android demonstration build.

## First-release audience

Alaga is ultimately intended for three groups:

1. A family member caring for a parent or another older adult.
2. A professional caregiver managing several patients.
3. A person living independently who wants to track their own medicines.

Any future real release would prioritize a family member caring for their parents. The data model and product language should still support all three groups from the beginning, without forcing professional workflow complexity into the primary family experience.

## Language

- The interface will support English and Filipino, selected by the user.
- English is the initial implementation language, especially for timetable and medicine fields commonly written in English in the Philippines.
- Imported text is preserved exactly as extracted. Translation is a separate later step, so the source wording is never silently replaced.

## Medicine input

The intended product supports manual entry, a medicine-label photo, and a printed-timetable photo. Photo extraction is a draft only and belongs to a later milestone. Milestone 3 implements the trusted manual and confirmation foundation first.

Medicine identity separates name, generic name, brand, strength value/unit, dose quantity/unit, form, route, prescriber, reason, original instructions, and care notes. Strength, form, and route may be omitted, but Alaga displays a review warning rather than guessing them.

## Scheduling

All three interpretations are supported:

- Fixed clock times for exact instructions or professional routines.
- Repeating intervals such as every eight hours, anchored to a first time.
- Flexible meal windows for informal family care, including before or after breakfast, lunch, and dinner.

Instructions such as "three times daily after meals" are represented as three meal-linked schedule rows. A caregiver reviews the suggested reminder times and windows before confirmation. Alaga does not infer a medical schedule without that confirmation.

## Confirmation and editing

The medicine flow is Details, Schedule, then Review and confirm. Only confirmed schedules become active. Editing a confirmed medicine creates a new immutable version; archiving removes it from the active list but preserves its history.

Owners can manage medicines. A caregiver can manage them only when explicitly granted medicine-manager permission. Any active member may record a scheduled dose as taken, skipped or snoozed; every event stores the actor and timestamp. Untouched entries remain "not recorded" and are never automatically labelled missed.

## Today and reminders

The first app shell exposes only Today and Medicines. Today is the operational care log; medicine setup remains a separate destination so the primary daily workflow stays calm and focused.

For Milestone 5, patient reminders are opt-in and local to the device. Alaga schedules a rolling seven-day window, keeps one notification per dose occurrence and removes stale or completed reminders during sync. Lock-screen wording is generic and contains no patient name, medicine name or dose. Cloud push and remote caregiver escalation remain later decisions.

## Home and interface priority

The two-destination shell was a prototype constraint, not a decision that Today is the final home experience. On 2026-08-25, the product owner identified the missing dashboard and insufficiently friendly interface as the main visible gaps after Milestone 5.

Milestone 5.5 was approved and implemented on 2026-08-26 before caregiver invitations. The three-destination shell adds a warm family-care Home that makes the active person, next dose, items needing attention, today's progress and safe quick actions immediately understandable. The final hardening pass replaced the oversized dark patient block with a compact, always-first patient selector; flattened reminders and care lists; collapsed care-circle administration; and reserved Android/iOS safe areas around the shell. It follows the kitchen-table care-log direction in `DESIGN.md` instead of a generic corporate healthcare dashboard or dense card grid.

## Care-circle invitations

Milestone 6 uses in-app invitations tied to a normalized account email. An owner chooses whether the caregiver may also manage medicines. The invited account can accept or decline; an owner can cancel a pending invitation or revoke an accepted caregiver without deleting attributed history.

The local prototype does not send invitation email and account emails are not yet externally verified. Shared “not recorded” escalation means every accepted caregiver sees overdue items on Home when they open Alaga. Remote notifications, verified identity and household rules remain later decisions.

## AI and testing

No cloud AI provider is required for Milestone 3. Free or local OCR/model options may be used for experiments with synthetic data, but they are testing tools rather than the production architecture. ChatGPT Pro does not include OpenAI API usage; any later production API integration needs separate provider credentials, consent, retention rules, and cost controls.
