---
name: Alaga
description: A modern, low-stress Filipino family care log with Bantay 2.0, emerald and mint palette, and Emil Kowalski craft invariants.
colors:
  canvas: "#F4F8F5"
  canvas-subtle: "#EAF2ED"
  card-surface: "#FFFFFF"
  primary-evergreen: "#1B4D3E"
  primary-dark: "#12352B"
  primary-light: "#52B788"
  mint-tint: "#D8F3DC"
  mint-wash: "#E8F5E9"
  secondary-emerald: "#2D6A4F"
  accent-flame: "#FF7A00"
  flame-light: "#FF9E00"
  sun-warm: "#FF9E00"
  text-ink: "#122620"
  muted-forest: "#5C7168"
  border-line: "#E2ECE5"
  mist-fill: "#EAF2ED"
  warning: "#D97706"
  warning-tint: "#FEF3C7"
  danger: "#DC2626"
  danger-tint: "#FEE2E2"
  dark-canvas: "#0D1F18"
  dark-surface: "#142E24"
  dark-border: "#1E4234"
  dark-ink: "#E8F5E9"
typography:
  display:
    fontFamily: "System"
    fontSize: "31px"
    fontWeight: 800
    lineHeight: 1.23
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "System"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "System"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.25
  body:
    fontFamily: "System"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "System"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  xs: "6px"
  sm: "10px"
  md: "14px"
  squircle: "18px"
  lg: "22px"
  xl: "30px"
  full: "9999px"
motion:
  durations:
    instant: "100ms"
    feedback: "150ms"
    state-change: "260ms"
    drawer: "320ms"
  scales:
    card-press: 0.98
    button-press: 0.96
    icon-press: 0.92
  springs:
    tight:
      tension: 180
      friction: 12
    gentle:
      tension: 140
      friction: 7
    snappy:
      tension: 220
      friction: 14
components:
  button-primary:
    backgroundColor: "{colors.primary-evergreen}"
    textColor: "{colors.card-surface}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "8px 18px"
  button-action:
    backgroundColor: "{colors.secondary-emerald}"
    textColor: "{colors.card-surface}"
    rounded: "{rounded.xl}"
    height: "48px"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.text-ink}"
    borderColor: "{colors.border-line}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "8px 16px"
  card-elevation:
    backgroundColor: "{colors.card-surface}"
    borderColor: "{colors.border-line}"
    rounded: "{rounded.lg}"
    padding: "16px"
  squircle-action:
    backgroundColor: "{colors.card-surface}"
    borderColor: "{colors.border-line}"
    rounded: "{rounded.squircle}"
    padding: "14px"
---

# Design System: Alaga

## 1. Overview & Creative North Star

**Creative North Star: "The Reassuring Kitchen-Table Care Log"**

Alaga is designed for family members, caregivers, and elders managing daily medicines together. The interface pairs clinical-grade precision with the comfort of a trusted family notebook. In this evolution, the system adopts a crisp, modern **Emerald & Mint healthcare palette**, an expressive **Bantay 2.0 companion identity**, a unified **4-tab floating navigation dock**, high-frequency **6-item squircle actions**, and **Emil Kowalski craft invariants**.

The experience eliminates medical alarmism:
- The cared-for person remains named at all times.
- Information hierarchy favors immediate comprehension over visual noise.
- Interactions are tactile, responsive, and grounded in physical spring dynamics.
- Visual clarity is established through crisp edge definition and border elevation rather than heavy, muddy drop shadows.

---

## 2. Color Architecture: Emerald & Mint Healthcare Palette

The palette anchors on deep forest evergreen structure, luminous emerald reassurance, soothing mint washes, and a focused flame accent for streaks and urgency cues.

### Primary Structure & Canvas
- **Deep Forest Evergreen (`#1B4D3E`)**: The foundational brand anchor. Used for primary CTAs, active headers, patient identity framing, and hero containers.
- **Primary Dark (`#12352B`)**: Deepest forest evergreen for pressed states, high-contrast text, and dark-surface boundaries.
- **Background Canvas (`#F4F8F5`)**: An airy mint-tinted neutral foundation that prevents glare and softens reading fatigue without dimming contrast.
- **Card / Surface (`#FFFFFF`)**: Crisp white elevation for working cards, inputs, and medication tiles.

### Mint Accents & Washes
- **Primary Light / Mint Accent (`#52B788`)**: Fresh mint green for active progress rings, secondary highlights, and dark-mode brand contrast.
- **Mint Tint (`#D8F3DC`)**: Soft, clean mint wash for active pill capsules, taken dose confirmations, and badge fills.
- **Mint Wash (`#E8F5E9`)**: Subtle background tint for companion speech bubbles, alert banners, and selected states.

### Secondary & Accents
- **Secondary / Accent Emerald (`#2D6A4F`)**: Used for verified states, taken dose checkboxes, confirmed notifications, and secondary actions.
- **Accent Warm / Flame (`#FF7A00`)**: Vibrant streak flame and vital attention cue. Used sparingly to mark unbroken medication adherence streaks and critical warnings.
- **Sunlight Ochre (`#FF9E00`)**: Warm highlight for Bantay companion aura, identity markers, and celebratory milestones.

### Inks & Dividers (WCAG AA Compliance)
- **Deep Forest Ink (`#122620`)**: Deep slate pine for primary typography. Reaches > 14:1 contrast ratio against `#FFFFFF` and `#F4F8F5`, exceeding WCAG AAA standards.
- **Muted Forest Slate (`#5C7168`)**: Secondary text, metadata timestamps, and inactive iconography. Maintained above 4.5:1 contrast against `#FFFFFF` and `#F4F8F5` for full WCAG AA compliance.
- **Subtle Mint Line (`#E2ECE5`)**: 1px crisp divider and card boundary.
- **Mist (`#EAF2ED`)**: Subtle fill for quick action squircle backdrops and inactive chip buttons.

### System Semantic States
- **Success (`#2D6A4F`, tint `#D8F3DC`, border `#B7E4C7`)**: Dose logged, taken on time, prescription saved.
- **Warning (`#D97706`, tint `#FEF3C7`)**: Expiring supply, scheduled dose window nearing end.
- **Danger / Error (`#DC2626`, tint `#FEE2E2`)**: Missed dose, critical interaction conflict, invalid input.

### Dark Theme Architecture
Deep pine and midnight forest tones ensure high legibility and zero OLED glare:
- **Canvas**: `#0D1F18` (deep pine night canvas)
- **Surface / Cards**: `#142E24` (elevated pine surface)
- **Borders / Lines**: `#1E4234` (crisp pine divider)
- **Primary Ink**: `#E8F5E9` (crisp mint cream text, > 12:1 contrast against `#142E24`)
- **Muted Ink**: `#8EAA9D` (legible sage subtitle text, > 4.5:1 contrast)
- **Primary / Brand**: `#52B788` (luminous mint for dark mode visibility)

---

## 3. Elevation & Craft: Zero Drop Shadows

Alaga adheres strictly to the **Zero Drop Shadows** invariant:
- **No Muddy Shadows**: Drop shadows render inconsistently and create visual mud on mobile displays. Box shadows with blurs are replaced entirely by crisp structural borders.
- **Border Elevation**: Surfaces achieve separation using a crisp 1px border (`#E2ECE5` in light mode, `#1E4234` in dark mode) paired with `#FFFFFF` elevation over the `#F4F8F5` airy canvas.
- **Tonal Layering**: Nested components use tonal shifts (`#EAF2ED` mist or `#D8F3DC` mint tint) to communicate hierarchy without vertical elevation gimmicks.

---

## 4. Radii & Spatial Hierarchy

Alaga uses a graduated continuous-curvature scale:
- **xs (`6px`)**: Small badge tags, notification dots, status chips.
- **sm (`10px`)**: Secondary action pills, metadata tags.
- **md (`14px`)**: Inputs, primary buttons, dosage items.
- **squircle (`18px`)**: Signature continuous-curvature radius for high-frequency action tiles, companion banners, and interactive drawers.
- **lg (`22px`)**: Main medication cards, hero care panels, modal containers.
- **xl (`30px`)**: Floating bottom navigation dock, large bottom sheets.
- **full (`9999px`)**: Circular FABs, avatars, active tab capsules, progress rings.

---

## 5. Bantay 2.0 Branding: The Family Healthcare Companion

"Bantay" (Tagalog for *guardian* or *sentinel*) is the warm, vigilant healthcare companion dog of Alaga.

### Companion Identity & Principles
1. **Empathetic Vigilance**: Bantay observes schedules and alerts caregivers with warmth, never clinical coldness or alarmist panic.
2. **Contextual Expressions**:
   - `idle`: Calm, observant companion ready to assist.
   - `celebration`: Joyful ears up and tail wag when doses are completed or streaks hit.
   - `thinking`: Attentive focus when reading prescription labels (OCR) or cross-referencing medicine safety.
   - `alert`: Gentle head tilt and focused posture when doses require caregiver attention.
3. **Companion Hero Card**:
   - Prominently anchored on the Home screen with a peeking bust illustration, subtle aura glow (`#FF9E00` / `#D8F3DC`), and a speech bubble delivering actionable, person-specific updates.
   - Speech bubble includes a directional tail, title row with live status, and one-tap interaction to open the full assistant sheet.
4. **Care Setup Scenes** (post-signup onboarding only, `SetupBantay`): the canonical full-body Bantay with scene-specific arms and flat props — `letter` (envelope opens, heart floats up), `self` (paw on chest, weekly pillbox), `family` (house-shaped heart held to the chest), `professional` (cap salute, clipboard), `waiting` (beside a mailbox, slow tail wag), `writing` (notebook; pen strokes as the user types), `sending` (paper plane thrown per invitation added), `stamp` (paw-print stamp on a checklist). Each has its own ≤500ms entrance and ambient loop; Bantay stays silent and has no tap reaction here. Reduce motion shows each scene's final frame; keyboard-open or large text crops to a bust framing.

---

## 6. Navigation: 4-Tab Floating Navigation Dock

Alaga consolidates primary navigation into a single **4-tab floating navigation dock**:
- **Anchored Floating Dock**:
  - Floats centered above the device safe area (`Math.max(insets.bottom, 12)`).
  - Rounded with `30px` radius (`xl`) and framed with a 1px border (`#E2ECE5`) on pure white background (`#FFFFFF`).
  - Zero drop shadow; separation is achieved through border contrast and background canvas differentiation.
- **4 Key Destinations & Controls**:
  1. **Home**: Care summary, Bantay companion hero card, streak counter, and squircle action grid.
  2. **Today**: Timeline of scheduled doses, adherence rings, and dosage logging controls.
  3. **Medicines**: Medicine cabinet, prescription management, supply counters, and dosage instructions.
  4. **Integrated '+' Action (Quick Action Drawer)**: A prominent circular FAB button (`48dp`, `full` radius) in `#1B4D3E` with white icon that triggers the 6-item squircle action drawer.
- **Interactive Feedback**:
  - Active tab displays an animated pill capsule (`#EAF2EC` in light mode, `#24342F` in dark mode) with `0.98` scale down on press and spring restoration.

---

## 7. Actions: 6-Item Squircle Action Grid

High-frequency care actions are structured into a clean **6-item squircle grid** (`18px` radius):
1. **Log Dose**: Instant dosage recording for scheduled or PRN (as-needed) medicines.
2. **Add Medicine**: Quick modal to add new medication manually with schedule recurrence.
3. **Scan Rx / Label**: Fast camera/photo OCR flow to parse prescription labels and packaging into drafted meds.
4. **Ask Bantay**: Immediate access to the conversational assistant for drug interactions, side effects, and guidance.
5. **View Timeline / Vitals**: Full daily care log, vitals recording, and historical dose compliance.
6. **Care Circle / Share**: Invite family members, coordinate shifts, and export doctor reports.

Each squircle tile features:
- Solid `#FFFFFF` surface with 1px `#E2ECE5` border.
- Distinct mint/emerald tint icon wrap (`44x44` dp, `12px` radius).
- High-contrast title (`15px`, bold `#122620`) and secondary helper description (`12px`, `#5C7168`).
- Tactile press feedback (`0.98` scale with `gentleSpring`).

---

## 8. Emil Kowalski Motion & Interaction Craft Invariants

Alaga enforces Emil Kowalski's core principles of micro-interactions and motion craft:

### 1. The 100/300/500 Rule
- **100ms (Instant Micro-Feedback)**:
  - Button and card press-ins acknowledge touch in under 100ms (`Easing.out(Easing.quad)`).
  - Never leave a user wondering if their tap registered.
- **300ms (State Transitions & Modals)**:
  - In-page state switches, tab switches, and drawer reveals complete in under 300ms (feedback: 150ms, state change: 260ms, drawer enter: 320ms).
  - Sub-300ms ease-out transitions prevent the interface from feeling sluggish or heavy.
- **500ms (Complex Choreography)**:
  - Multi-stage layout shifts (e.g. OCR camera scan result transitions) are capped at 500ms total sequence time.

### 2. Micro-Interaction Press Scales
Every interactive touchpoint provides subtle tactile physical feedback:
- **`cardPress: 0.98`**: Subtle scale compression for medication cards, squircle tiles, and banners.
- **`buttonPress: 0.96`**: Pronounced scale compression for primary buttons and the floating navigation '+' FAB.
- **`iconPress: 0.92`**: Snappy compression for small icon buttons and close triggers.

### 3. Spring Dynamics
Transitions use calibrated spring physics instead of linear animations:
- **`tightSpring`** (`{ tension: 180, friction: 12 }`): For crisp toggle flips, small badges, and modal dismissals.
- **`gentleSpring`** (`{ tension: 140, friction: 7 }`): For press-out releases and card bounce-backs.
- **`snappySpring`** (`{ tension: 220, friction: 14 }`): For celebratory milestones, streak counters, and Bantay expression shifts.

### 4. Zero-Lag Handoff
- Animations run strictly on native driver threads (`useNativeDriver: true`).
- No heavy computations or blocking re-renders occur during active gesture tracking.

---

## 9. Accessibility & Inclusivity Invariants

1. **The Read-It-Once Rule**:
   - Medicine names, dosage strengths (e.g., "500 mg"), times (e.g., "8:00 AM"), and instructions never use low-contrast type, all-caps, or fonts under `14px`.
2. **WCAG AA Compliance**:
   - All text achieves at least 4.5:1 contrast against its background.
   - Critical icons (pill, check, alert) always pair with an accessible text label.
3. **One-Handed & Large Text Resilience**:
   - Primary action buttons maintain at least `52px` vertical touch height.
   - Text containers expand gracefully without clipping when system font size scales up to 200%.

---

## 10. Do's and Don'ts

### Do:
- **Do** name the patient explicitly before presenting or confirming dose actions.
- **Do** use crisp 1px borders (`#E2ECE5`) and white elevation rather than drop shadows.
- **Do** use `#1B4D3E` and `#2D6A4F` for reassuring clinical structure, reserving `#FF7A00` for streaks and urgent warnings.
- **Do** provide instant `100ms` press-in feedback with `0.98` or `0.96` scale on all touchables.
- **Do** keep drawer and modal transitions sub-300ms ease-out.

### Don't:
- **Don't** use muddy drop shadows or heavy blur layers.
- **Don't** use generic cold hospital blues or clinical gray palettes.
- **Don't** show alarmist red warning banners for standard reminders.
- **Don't** display decorative uppercase typography for critical prescription details.
- **Don't** omit the person's name on dose logging or review sheets.
