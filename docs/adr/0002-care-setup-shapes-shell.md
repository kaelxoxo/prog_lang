# Care Setup shapes the app shell but never permissions

Each account records a **Care Setup** (Caring for myself / for family), chosen during post-signup onboarding and changeable in Settings. The setup controls onboarding steps and presentation; the app shell is otherwise the same for both: the person chips (a single "You" chip plus "+ Add someone" for a lone Self Profile) and the **Family** tab are always present, and a Caring-for-myself account with nobody else in its Care Circle sees "Share your care log with family" there. We chose this over a setup that only drives onboarding copy so that self-trackers get onboarding that fits them from day one. Permissions stay exclusively on Care Circle membership (owner/caregiver, medicine-manager grant), so changing the setup never changes data or access.

Amended 2026-11-07: the third option, Caring professionally (which always showed the selector), was removed. Existing `professional` accounts became `family`, and accepting an invitation during onboarding records `family` instead of asking.

Amended 2026-11-07 (Family tab): the Care Circle moved out of Home and Settings into a dedicated Family tab for every setup, and the person selector became always-visible chips. Caring for myself no longer hides either.

## Consequences

- Changing the Care Setup is presentation-only; existing patients, Self Profiles and memberships are untouched.
- An account that joined a circle without choosing a setup gets the family shell.
- The person chips are always shown, with the Self Profile labelled "You"; a second patient (e.g. after accepting an invitation) simply adds a chip, so no setup can make another patient's doses unreachable.
