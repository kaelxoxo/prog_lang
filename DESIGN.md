---
name: Alaga
description: A warm, low-stress care log for families managing medicines together.
colors:
  table-paper: "#F6F1E7"
  warm-surface: "#FFFCF6"
  family-evergreen: "#233A35"
  evergreen-raised: "#304B44"
  clay-action: "#9C4F35"
  clay-pressed: "#753724"
  clay-tint: "#F4E4DA"
  confirmed-sage: "#477064"
  confirmed-deep: "#2F554A"
  confirmed-tint: "#E4EFEA"
  window-sun: "#E8B85D"
  supporting-ink: "#626E69"
  warm-line: "#DED8CC"
  warm-mist: "#ECE7DD"
  warning-ink: "#785710"
  warning-tint: "#FFF1CC"
  error-ink: "#9A352F"
  error-tint: "#F8E3DE"
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
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.25
  body:
    fontFamily: "System"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "System"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.45
rounded:
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.family-evergreen}"
    textColor: "{colors.warm-surface}"
    rounded: "{rounded.md}"
    height: "54px"
    padding: "8px 16px"
  button-care-action:
    backgroundColor: "{colors.clay-action}"
    textColor: "{colors.warm-surface}"
    rounded: "{rounded.xl}"
    height: "48px"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.warm-surface}"
    textColor: "{colors.family-evergreen}"
    rounded: "{rounded.md}"
    height: "54px"
    padding: "8px 16px"
  patient-context:
    backgroundColor: "{colors.warm-surface}"
    textColor: "{colors.family-evergreen}"
    borderColor: "{colors.warm-line}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  confirmed-notice:
    backgroundColor: "{colors.confirmed-tint}"
    textColor: "{colors.confirmed-deep}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Alaga

## Overview

**Creative North Star: "The Kitchen-Table Care Log"**

Alaga should feel like a trusted family notebook made clearer and safer by software. Warm paper, quiet evergreen structure, and sparse clay actions evoke care at home without becoming nostalgic or decorative. The interface stays calm when the task is consequential: the person remains named, source wording remains visible, and confirmation ends with reassurance.

The system is restrained and mostly flat. A compact patient selector anchors each care view through position, a sunlight identity marker, and clear naming rather than a large dark block. Other information uses spacing, dividers, and tonal fields before reaching for another card.

**Key Characteristics:**

- Warm, low-glare surfaces
- One unmistakable but compact patient context
- Plain-language safety states
- Progressive disclosure for complex medicine information
- Large-text and one-handed mobile resilience

## Colors

The palette combines warm household neutrals with evergreen structure, clay action, sage confirmation, and a small sunlight accent.

### Primary

- **Family Evergreen** (`#233A35`): patient context, primary confirmation buttons, and strongest text.
- **Clay Action** (`#9C4F35`): scarce action emphasis, selection, and navigation progress.

### Secondary

- **Confirmed Sage** (`#477064`): successful, confirmed, and restored states.
- **Window Sun** (`#E8B85D`): patient identity marker and rare attention cue.

### Neutral

- **Table Paper** (`#F6F1E7`): application canvas.
- **Warm Surface** (`#FFFCF6`): fields and elevated working surfaces. Never replace it with pure white.
- **Supporting Ink** (`#626E69`): secondary text.
- **Warm Line** (`#DED8CC`): dividers and input boundaries.
- **Warm Mist** (`#ECE7DD`): quiet schedule summaries and pressed surfaces.

**The Scarce Clay Rule.** Clay identifies action or current choice. It does not decorate inactive content.

## Typography

**Display Font:** Native system sans
**Body Font:** Native system sans
**Label Font:** Native system sans

**Character:** Familiar and platform-native. Weight and spacing create confidence without introducing a branded display face that would compete with medicine information.

### Hierarchy

- **Display** (800, 31px, 1.23): first-run and empty-state questions.
- **Headline** (800, 26px, 1.2): patient name and major screen identity.
- **Title** (800, 22px, 1.25): medicines and review sections.
- **Body** (400, 16px, 1.5): instructions and care information, with a practical maximum line length near 65 characters.
- **Label** (700, 13px, 1.45): field labels and supporting state text. Sentence case is preferred.

**The Read-It-Once Rule.** Medicine names, doses, schedules, and warnings never use tiny type or decorative uppercase styling.

## Elevation

Alaga is flat by default and uses tonal layering instead of shadows. Dividers organize lists; tinted surfaces communicate selection, warning, and confirmation. The patient identity selector earns clear containment because it is the safety anchor, but it should not overpower the day's care task.

**The One Anchor Rule.** A care screen may have one dominant task surface. Patient identity stays first and unmistakable in a compact selector; supporting content stays structurally flatter.

## Components

### Buttons

- **Shape:** rounded rectangle for primary confirmation (`14px`), pill for compact add actions.
- **Primary:** Family Evergreen with Warm Surface text, at least `54px` high.
- **Pressed / Focus:** shift to Clay Pressed and retain a text label.
- **Secondary:** transparent with Clay Pressed text and a minimum `48px` touch target.

### Chips

- **Style:** use only for true selection or compact state, with sentence-case text at `13px` or larger.
- **State:** selected controls use Clay Tint plus a Clay Action border and expose selected state to assistive technology.

### Cards / Containers

- **Corner Style:** `20px` to `28px` only for identity, modal sheets, and focused empty states.
- **Background:** Warm Surface or Family Evergreen.
- **Shadow Strategy:** none.
- **Border:** one-pixel Warm Line. Never use colored side stripes.
- **Internal Padding:** `16px` to `24px`.

### Inputs / Fields

- **Style:** Warm Surface, one-pixel Warm Line, `14px` radius, at least `54px` high.
- **Focus:** platform focus behavior plus a clear boundary change.
- **Error / Disabled:** Error Ink and Error Tint; disabled controls retain readable text and explain pending state.

### Navigation

Navigation is shallow and explicit. The three primary destinations pair a Lucide icon with a visible label; the selected destination uses the scarce clay tint as a compact state field. Patient switching names the destination, multi-step care tasks show progress, and Back, Close, and discard recovery remain visible. Settings is a nested screen rather than a fourth destination, and account sign-out lives there instead of competing with care actions on every screen.

### Iconography

Use the MIT-licensed Lucide set through `@react-native-vector-icons/lucide` with Expo's dynamic font loading so Expo Go remains supported. Icons are normally `17px` to `24px`, use the same semantic color as their label, and remain decorative to assistive technology when a complete text label or accessibility label is present. Consequential actions retain visible wording; an icon never replaces Taken, Skip, Snooze, patient identity, or medicine information.

### Patient Context

Warm Surface contains a sunlight identity marker, the person's name, relationship, and an explicit full-width Change action. Add another person belongs inside the Change-person picker so the safety header presents one clear decision instead of competing actions. A compact form of this context remains present during every medicine step.

When the active person has no confirmed doses today, Home states that fact without completion language, names the person, and presents one medicine action. It never treats `0 of 0` as progress or says the caregiver is caught up.

## Do's and Don'ts

### Do:

- **Do** name the person before presenting or confirming their care information.
- **Do** use progressive disclosure for optional label details and custom schedule settings.
- **Do** retain at least `48px` touch targets and support large system text through wrapping and stacked fields.
- **Do** end consequential actions with person-specific confirmation and a recovery path.
- **Do** use sentence case and plain family-care language.

### Don't:

- **Don't** resemble cold hospital administration software, a generic corporate healthcare dashboard, or a childish wellness app.
- **Don't** use `border-left` or `border-right` greater than `1px` as a colored accent.
- **Don't** build repeated rounded card grids when dividers and spacing communicate the structure.
- **Don't** use pure white, tiny uppercase metadata, alarmist language, or decorative medical imagery.
- **Don't** hide the active person or omit values from a confirmation screen.
