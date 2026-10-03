# Care Setup shapes the app shell but never permissions

Each account records a **Care Setup** (Caring for myself / for family / professionally), chosen during post-signup onboarding and changeable in Settings. The setup controls onboarding steps and presentation: Caring for myself hides the person selector while the account has only its Self Profile and moves the Care Circle into Settings, Caring professionally always shows the selector, and Caring for family (or no recorded setup) keeps the default shell. We chose this over a setup that only drives onboarding copy so that self-trackers and professionals get a shell that fits them from day one. Permissions stay exclusively on Care Circle membership (owner/caregiver, medicine-manager grant), so changing the setup never changes data or access.

## Consequences

- Changing the Care Setup is presentation-only; existing patients, Self Profiles and memberships are untouched.
- An account that joined a circle without choosing a setup gets the family shell.
- The selector reappears for a Caring-for-myself account as soon as it has more than one patient (e.g. after accepting an invitation), with the Self Profile listed first as "You"; hiding it would make the other patient's doses unreachable.
