# Self-tracking uses a marked Self Profile, not a merged account/patient

Accounts and patients stay separate entities (see `docs/prototype-architecture.md`), so a person tracking their own medicines owns a Care Circle whose Patient is a **Self Profile** explicitly linked to their account. We chose an explicit marker over an unmarked patient with the user's name because the interface must address the person as "you" rather than by name, and retrofitting the marker after unmarked self-profiles exist would require guessing which profiles are the account holder.

## Consequences

- A Self Profile can still gain other caregivers through normal Care Circle invitations.
- An account has at most one Self Profile.
