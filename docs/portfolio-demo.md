# Alaga five-minute portfolio demo

This route uses deterministic synthetic data and demonstrates Alaga's safety and coordination model without presenting the prototype as a released medical product.

## Prepare

1. Reset the guarded development database:

   ```powershell
   npm.cmd run db:reset:synthetic -- --confirm-synthetic-reset
   ```

2. Start Alaga with `npm.cmd run dev:usb` for a USB-debugging Android phone, or run `npm.cmd run server` and `npm.cmd start` in separate terminals.
3. Require `npm.cmd run check:runtime` to pass before presenting a live device.
4. Sign in as `maya@example.test` with password `alaga-synthetic-only`.

## Walkthrough

### 1. Home: establish the care context

- Point out that `Lola Rosa (Synthetic)` is named before any medicine information.
- Show the next dose, items needing review, and today's recorded progress.
- Explain that Alaga says **not recorded** instead of assuming a dose was missed.

### 2. Today: record an attributable outcome

- Open Today and scan the chronological schedule.
- Choose Taken, Skip, or Snooze on a pending synthetic dose.
- Show the confirmation step before saving.
- Open Past 7 days and point out the actor, recorded time, and retained correction history.

### 3. Medicines: show trusted setup

- Open a confirmed medicine and review its separate strength, dose, route, and schedule fields.
- Explain that editing creates a new immutable version and archiving preserves history.
- Open the synthetic-photo import entry point, but use only a deliberately synthetic image.
- Show that OCR produces an editable draft, preserves raw wording, and requires the normal review-and-confirm flow.

### 4. Settings: demonstrate inclusion

- Open Settings from the current tab.
- Switch to Filipino and show the navigation, patient context, Home, Today/history, and medicine list updating immediately.
- Confirm that patient names, medicine wording, dose units, notes, and OCR text are not translated.
- Switch back to English if that is the preferred closing state.

### 5. Care circle: explain shared accountability

- Show the accepted caregiver relationship for Paolo Santos.
- Explain that caregiver access is membership-backed and revocation removes future access without deleting attributed history.
- State clearly that this local prototype does not verify or email invitation addresses.

## Screenshot set

Capture only after the runtime warning check and relevant large-text check pass. Use synthetic data and crop out unrelated device notifications.

1. Home with the patient selector, next dose, and progress visible.
2. Today with a populated chronological dose row and its three actions.
3. Past 7 days with attributable synthetic history.
4. Medicines with both confirmed medicines and the OCR experiment entry point.
5. Filipino Settings with the selected radio state.

Do not reuse diagnostic captures containing Expo connection warnings. Label web captures as web and Android captures as Android. Do not imply that an export or screenshot proves notification delivery, TalkBack behavior, or iOS runtime behavior.
