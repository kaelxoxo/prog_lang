# Onboarding and sign-up edge cases

Stress test of the sign-up screen, the welcome story, the post-signup Care Setup onboarding and the "Add first medicine" handoff, run on 2026-09-28.

- **Web**: Expo web build at `localhost:8081`, Chromium 412×915.
- **Android**: `Alaga_API_36` emulator in Expo Go, with `adb reverse` for ports 8081 and 4000.
- **Accounts**: synthetic, created through `POST /auth/register`.

Status values:

- **pass**: worked as expected on the first run.
- **fixed**: failed first, was corrected, then re-run. Before and after results are shown.
- **open**: not fixed in this pass.

## Sign-up screen and welcome story

| # | Case | Platform | Status | Evidence |
|---|------|----------|--------|----------|
| 1 | "Meet Bantay & see how Alaga works" appears above the account form | Web, Android | fixed | Before: the link sat below the demo button, at the bottom of the form. After: it sits between the feature list and the "Create your account" card (web text order 356 < 392; Android screenshot). |
| 2 | Sparkle icons and the "Hello! I'm Bantay" sparkle greeting pill are removed | Web, Android | fixed | Before: sparkle icons appeared on the greeting pill, the demo button, the story link, the last slide's button and Settings' welcome-story card. After: `sparkle` search in AuthScreen, WelcomingMascot, AnimatedFeaturePills, OnboardingSlideshow and OnboardingMascotStage returns 0 hits. Settings now uses `book-open` and `rotate-ccw` icons. |
| 3 | Opening the story from sign-up, then Skip, returns to sign-up | Web | pass | Skip returned to "Create your account". |
| 4 | Android back inside the story returns to the previous slide, and on the first slide closes the story | Android | fixed | Before: back while replaying the story left the app. After: slide 2 → back → slide 1 → back → the screen the story was opened from. |
| 5 | Closing a replayed story keeps the user's place and anything already typed | Android | fixed | Before: a replay from Settings came back to Home, with the Settings screen reset. After: the story opens over the current screen. Back returns to Settings at the same scroll position, and a half-typed name on sign-up is still there. |
| 6 | Registering with an email that already has an account | Web | pass | "An account with this email already exists." |
| 7 | API unreachable while registering | Web | pass | "Alaga cannot reach its service. Keep the service running on this computer…" |
| 8 | Android back on the sign-up screen | Android | pass | Leaves the app, like any first screen on Android. |

## Care Setup onboarding

| # | Case | Platform | Status | Evidence |
|---|------|----------|--------|----------|
| 9 | API unreachable during the automatic invitation check | Web | pass | Shows "Could not check invitations" with Try again and "Continue without checking". Try again continues once the API is back. |
| 10 | Stale invitation list after switching accounts on the same device | Android, Web | fixed | Before: after signing out and signing in as an invited account, the check reused the previous account's empty cached list and skipped straight to "How will you use Alaga?". The same cache also backed Home's invitation inbox. After: sign-out clears all cached queries, the check always re-fetches, and the new account sees "…invited you to Lola Swap's Care Circle." |
| 11 | Name made only of spaces | Web | pass | "Enter a name to continue." |
| 12 | Name longer than the server's 80-character limit | Web | fixed | Before: the input accepted any length and the server rejected it with an error. After: the input is capped at 80 characters (measured length 80). |
| 13 | Fast repeated taps on Continue | Web | fixed | Before: three taps created the person, then the leftover taps hit Skip and "Go to Home", jumping past the invite and done screens. After: taps are ignored while the next screen animates in, and the flow stops on "Care is easier together." with exactly one person created. |
| 14 | Invalid invite email | Web | pass | "Enter a valid email address, such as name@example.com." |
| 15 | Inviting an email that already has a pending invitation (any letter case) | Web, server test | fixed | Before: the raw database error `duplicate key value violates unique constraint "patient_invitations_one_pending_email"`. After: "This email already has a pending invitation." Covered by `server/tests/care-setup.test.ts`. |
| 16 | Owner invites their own email | Web | pass | "This account is already in the care circle." |
| 17 | "Can also manage medicines" starts off and reports its state to screen readers | Web | fixed | Before: the checkbox and the Care Setup radio rows exposed no checked state (`aria-checked` = null). After: `aria-checked` is false by default and true after toggling, and the radios report `[false, true, false, false]`. |
| 18 | Accepting an invitation the Owner cancelled | Web | fixed | Before: only a generic error, and the cancelled invitation stayed in the list. After: "That invitation is no longer available…"; the list refreshes and only still-pending invitations remain. If none remain, the flow moves to the Care Setup question. |
| 19 | Decline on web | Web | fixed | Before: the confirmation used a native-only alert, so Decline did nothing on web. After: the browser confirm dialog appears; cancelling keeps the invitation and confirming declines it. |
| 20 | Decline on Android asks for confirmation | Android | pass | "Decline Liza Santos's invitation to Lolo Ben's Care Circle? … would need to invite you again." with Keep and Decline. |
| 21 | Professional → "Yes, I need an invitation" → Go back | Web | pass | Returns to "Did a family already set up Alaga for this person?" |
| 22 | Waiting → Check again with no invitation | Web | pass | "No new invitations yet. Ask the Owner to check the email address." |
| 23 | Professional → Waiting → invitation arrives → Check again → Decline | Web | pass | The invitation appears. After declining, the flow returns to "How will you use Alaga?" with no Care Setup saved. |
| 24 | Session expires during onboarding | Web | fixed | Before: only a generic error, with no way forward except "I'll decide later". After: "Your session has expired. Sign in again." with a "Sign in again" button that returns to the sign-up screen. |
| 25 | API unreachable while creating the person, then retry | Web | pass | Shows the connection message and stays on the name screen. The retry succeeds and exactly one person is created. |
| 26 | Leaving mid-path, then signing in again | Web | pass | No Care Setup is saved and onboarding shows again. Finishing it saves the setup together with the profile. |
| 27 | "I'll decide later", then relaunch | Web | pass | Onboarding shows again on the next launch. |
| 28 | Android back on the first onboarding screen | Android | fixed | Before: back was swallowed and the user could not leave the app from onboarding. After: the app goes to the launcher, and reopening resumes on the same screen. |
| 29 | Android back from name entry, the invite screen, the done screen, and after accepting an invitation | Android | fixed | Before: back did nothing on the invite, done and invited-role screens. After: name → the question; invite → done; done → Home; after accepting → Home, the same as Skip. |
| 30 | The mascot pose matches the current screen | Android | fixed | Before: "How will you use Alaga?" kept showing the invitation pose. The reduce-motion setting loading mid-crossfade cancelled the fade, so the new pose was never shown. After: a single crossfade effect, and the family pose shows correctly. |
| 31 | Keyboard open or 1.5× system text | Android | pass | Bantay switches to the bust framing, and the choice list scrolls with no content clipped. |

## Add first medicine

| # | Case | Platform | Status | Evidence |
|---|------|----------|--------|----------|
| 32 | Closing the editor with no changes | Web, Android | fixed | Before: closing landed on the Medicines tab. After: Close on web, and Android back, both land on Home. |
| 33 | Closing the editor with unsaved changes on web | Web | fixed | Before: the discard confirmation used a native-only alert, so Close did nothing and the user was stuck in the editor. After: a browser confirm. "Keep editing" keeps the typed "Losartan"; Discard returns to Home. |
| 34 | Back button between editor steps | Web | pass | The Schedule step shows Back and Close. |

## Open, outside this pass's scope

- Other native-only confirmations still do nothing on web: recording a dose, archiving a medicine, and removing a caregiver. The shared `confirmAction` helper in `src/lib/confirm.ts` is ready for them.
- Home still shows sparkle icons on the Bantay banner's celebration state and the "Today's care" card. Those are part of the uncommitted Home redesign and were left untouched.
