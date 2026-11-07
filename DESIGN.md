---
name: Alaga
description: The family care notebook. Paper, ink and narra; serif titles; ruled sections; quiet motion; Bantay the guard dog.
colors:
  paper: "#F6F1E7"
  paper-shaded: "#EFE8DA"
  paper-raised: "#FBF8F1"
  ink: "#1F1B16"
  ink-muted: "#675D52"
  rule: "#E3DACB"
  narra: "#8A3B22"
  narra-dark: "#6E2E1A"
  narra-tint: "#F1E1D6"
  ochre: "#8A5E0F"
  ochre-tint: "#F5E9CC"
  danger: "#A63A2A"
  bantay-cap: "#2D6A4F"
  night-paper: "#17140F"
  night-raised: "#211D17"
  night-ink: "#F3EDE2"
  night-narra: "#E39A78"
typography:
  hero:
    fontFamily: "Source Serif 4 Bold"
    fontSize: "30px"
    lineHeight: 1.2
  title:
    fontFamily: "Source Serif 4 SemiBold"
    fontSize: "24px"
    lineHeight: 1.25
  section:
    fontFamily: "Source Serif 4 SemiBold"
    fontSize: "20px"
    lineHeight: 1.3
  body:
    fontFamily: "System"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "System"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
motion:
  durations:
    feedback: "140ms"
    state-change: "200ms"
    drawer: "280ms"
  easing:
    out: "cubic-bezier(0.23, 1, 0.32, 1)"
    in-out: "cubic-bezier(0.77, 0, 0.175, 1)"
    drawer: "cubic-bezier(0.32, 0.72, 0, 1)"
  scales:
    button-press: 0.97
    card-press: 0.98
---

# Design System: Alaga

Source of truth for values is `src/theme/tokens.ts`; this document explains the intent.

## 1. North Star: the family care notebook

Alaga looks like the shared notebook (*kuwaderno*) a family keeps by the medicine shelf: paper, ink, a few ruled lines, and handwriting-calm structure. It must not look like a template dashboard, a hospital system, or a wellness toy (see `PRODUCT.md` anti-references).

- One signature colour: **narra**, the red-brown of Philippine hardwood furniture. Everything else is paper and ink.
- Green appears only on Bantay's caregiver cap.
- Typography carries hierarchy, not tinted boxes.

## 2. Colour

| Role | Light | Night ink |
|---|---|---|
| Paper (canvas) | `#F6F1E7` | `#17140F` |
| Raised paper (sheets, the few boxes) | `#FBF8F1` / `#FFFDF8` | `#211D17` / `#2A251E` |
| Ink (text) | `#1F1B16` | `#F3EDE2` |
| Muted ink | `#675D52` | `#B3A898` |
| Ruled line | `#E3DACB` | `#332D24` |
| Narra (primary actions, active tab) | `#8A3B22` | `#E39A78` |
| Ochre (Not Recorded) | `#8A5E0F` | `#E2B65A` |
| Danger (errors only) | `#A63A2A` | `#EE8B78` |

Rules:
- **Recorded** doses read as ink: an ink checkmark, never a green fill.
- **Not Recorded** reads as ochre text plus a marker; never red, never the word "overdue" or "missed".
- No pastel tint blobs behind icons. A tint is allowed only behind text that needs it (e.g. a selected chip).
- Never hardcode a colour in a component; contrast is checked by `node scripts/verify_tokens_contrast.mjs`.

## 3. Typography

- **Source Serif 4** (loaded in `App.tsx`) for screen titles (`typography.hero`, `title1`) and section titles (`sectionTitle`). The weight lives in the family name; never set `fontWeight` on a serif style.
- The platform font for everything else, so large system text keeps working.
- Sentence case everywhere. No uppercase eyebrow labels.
- **One title per section or card.** Numbers and readouts are content, not titles.
- Medicine names, strengths and times are never all-caps or under 14px.

## 4. Layout: ruled sections, not cards

- Content sits on the paper in sections separated by hairline ruled lines.
- A box (raised paper, 1px rule border) only for an item that needs action, a form field, or a sheet.
- Zero drop shadows.
- Touch targets at least 48dp; primary buttons at least 52dp tall.

## 5. Home, Today and Medicines

- **Patient chips** sit at the top of every tab (under the greeting on Home, under the header elsewhere): one chip per Patient in list order, the selected one filled with narra, "All people" when there are more than five, and "+ Add". They are the only way to change person; there is no combined "All" view.
- **Home hero** ("notebook margin"): one raised-paper box with a vertical narra margin line, Bantay standing full-body at its bottom-left. Bantay opens with a serif welcome to the caregiver ("Good afternoon, Maya!"), then the day's most urgent fact for the selected Patient (**8** not recorded / **6:00 PM** next / **All 14** recorded / **No doses** today), progress and the Care Streak, and a chat box ("Ask Bantay about Lola Rosa's medicines…"). No suggested-question chips on Home; the chat keeps its own. When everything is recorded the hero shrinks and Bantay celebrates once.
- Below the hero, Home answers "what do I do right now": **Due now** (Not Recorded doses grouped by Time Slot, plus anything within the next two hours), a collapsible **Recorded** line, a collapsible **Later today** row, and **Refill Horizon** rows only when stock runs out within seven days.
- **Today** shows the whole day under Morning / Afternoon / Evening, Time Slots inside; sections that are entirely Later Today start collapsed.
- Recording a Later Today dose asks for confirmation (early recording).

## 6. Bantay

Bantay (Tagalog: *guard*) is the family's caregiver dog: brown coat, green caregiver cap. He is drawn in code (`BantayMascotSvg.tsx`) and animated from sprite sheets rendered from that drawing (`npm run mascot:sprites`, output in `assets/bantay/`). The app icon and splash use the same bust.

Animations are character motion, never pop-in emoji or sparkles:

| State | Motion |
|---|---|
| idle | slow breathing, a blink every few seconds, an occasional tail wag |
| attention | ears perk, head tilts toward the list (doses to record) |
| thinking | head tilt, paw to chin (Ask Bantay is answering) |
| celebrate | small hop, fast tail wag, happy closed eyes (whole day recorded) |

The sprite sheets are stand-ins; final hand-drawn sheets replace the PNG and JSON in `assets/bantay/` without code changes.

Bantay is the way into the chat, so wherever he appears large he comes with an explicit chat affordance (a chat box); a mascot alone never has to signal "you can talk to me". He appears large only in the Home hero, where he also welcomes the caregiver; elsewhere the chat is reached from the + menu. The chat's opening line says the same thing as the hero.

## 7. Motion

Quiet and crisp, following Emil Kowalski's rules (`review-animations`, `animate-expo`):

- Press feedback: scale 0.97 over 140 ms, strong ease-out (`PressableScale`).
- Expanding a section: content fades in over 200 ms and what follows reflows on the strong ease-out curve (Reanimated layout transition, `Disclosure`).
- Recording a dose: the ink checkmark draws itself over 200 ms on the UI thread (`DrawnCheck`), with one success haptic on the same frame. Haptics are never the only feedback and never fire for skip or snooze.
- Celebrate only when the whole day is recorded.
- No bounce; springs in `tokens.ts` are critically damped. UI animations stay under 300 ms.
- Motion that runs while the app is busy (fetching, recording) runs on the UI thread via Reanimated; no `LayoutAnimation`.
- Reduced motion: fades only, sprites hold their first frame.
- Judge feel in a release build on a slow Android phone; Expo Go and the emulator are not performance environments.

## 8. Accessibility

- WCAG AA contrast for all text, verified by the contrast script.
- State is never conveyed by colour alone ("Not recorded" is always written).
- Text grows to 200% without clipping; rows reflow rather than truncate medicine names.

## 9. Do and don't

- **Do** name the person before showing their care information.
- **Do** keep one title per section, in serif.
- **Don't** add tinted icon squircles, card grids, gradients, or drop shadows.
- **Don't** use uppercase labels, emoji in copy, or alarmist red for routine reminders.
- **Don't** introduce a second accent colour; narra is the only one.
