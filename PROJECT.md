# Project: In-App Mascot AI Care Assistant ("Ask Bantay")

## Architecture
- **Presentation & Navigation**:
  - `FloatingAssistantFab`: Persistent 56x56dp circular avatar anchored at `{ position: 'absolute', bottom: 16, right: 20 }` inside `MainTabs.tsx` across Home, Today, and Medicines tabs, above bottom navigation bar. Includes soft status beacon (12dp) when `attention.length > 0`.
  - `AskBantayBottomSheet`: Full-screen modal conversation (edge-to-edge, safe-area padded, closes via header button or Android back) with dynamic greeting, suggestion chips, conversation stream, and text query input bar.
  - `ActionableDoseCard`: In-stream interactive dose card anchored with patient name, inline "Record Taken" action with caregiver attribution, and "View in Today" shortcut.
  - `AssistantMascot`: Animated mascot component rendering Idle (3.0s breathing float + blinks), Thinking (curious head tilt -5.0deg + sparkle pulse), and Celebration (embracing care heart and shield + spring hop). Gracefully falls back to static asset when `reduceMotion` is enabled.
- **Hybrid Dual-Engine Intelligence**:
  - **Tier 1 (Instant Local Rules)**: `src/features/assistant/rulesEngine.ts` runs 0ms offline client-side evaluation over in-memory React Query cache (`todayTimeline`, `activeMedications`, `activePatient`, `now`).
  - **Tier 2 (Gemini LLM Backend)**: `POST /patients/:patientId/assistant/query` in `server/src/app.ts` calling Google Generative Language REST API (`gemini-2.5-flash`) via `server/src/gemini-assistant.ts` with contextualized synthetic patient data, bilingual instructions, and strict medical safety invariants.
  - **Topic Scope Guardrail**: Bantay only answers about the patient's care in Alaga (recorded medicines, schedules, dose history, medication summaries, information about a recorded medicine, adding medicines, app help). `src/features/assistant/topicGuardrail.ts` declines code, essays/creative writing, role-play/impersonation, prompt-injection, personal and unrelated requests before any model call, both in Tier 1 and on the server (`model: 'topic_guardrail'`). Both Gemini system instructions carry the same scope rules for phrasings the patterns miss, and any model reply containing code is replaced with the scope decline.
- **State & Real-Time Synchronization**:
  - Inline dose recording calls `POST /patients/:patientId/doses/:occurrenceId/events` with caregiver token and `clientActionId`.
  - TanStack Query invalidation triggers immediate real-time update of `['today', patient.id, date]`, updating the Today screen and assistant cards synchronously.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Persistent Floating Assistant Avatar (FAB) | Circular 56x56dp avatar anchored in lower corner across Home, Today, Medicines with >= 48dp touch target | M5 | ORIGINAL_REQUEST R1 |
| 2 | Soft Status Beacon on FAB | 12dp visual beacon indicating actionable dose needing review (`attention.length > 0`) | M5 | ORIGINAL_REQUEST R1 |
| 3 | Screen Clearance Adjustment | Increase bottom scroll padding to 88dp across Home, Today, Medicines to prevent FAB occlusion | M5 | ORIGINAL_REQUEST R1 / Survey |
| 4 | Expandable Bottom Sheet Container | Smoothly expandable bottom sheet overlay with backdrop, drag handle, and dismiss | M4 | ORIGINAL_REQUEST R1 |
| 5 | Dynamic Contextual Greeting | Greeting customized with caregiver name, patient name, and next/pending dose status | M4 | ORIGINAL_REQUEST R1 |
| 6 | Quick-Action Suggestion Chips | Interactive chips for "What's due next?", "Did someone record Amlodipine?", "Today's summary", "Help with prescription" | M4 | ORIGINAL_REQUEST R1 |
| 7 | Conversation Stream & Input Bar | Accessible scrollable message stream and text query input bar with submit button | M4 | ORIGINAL_REQUEST R1 |
| 8 | Tier 1 Instant Local Rules Engine | 0ms offline client-side evaluation for canonical queries (next dose, summary, dose status, attribution) | M1 | ORIGINAL_REQUEST R2 |
| 9 | Tier 2 Gemini LLM Backend Endpoint | `POST /patients/:patientId/assistant/query` & `POST /api/assistant/query` using `gemini-2.5-flash` with 8s timeout | M1 | ORIGINAL_REQUEST R2 |
| 10 | Gemini Context Injection & Prompts | Injected non-real synthetic patient meds and 3-day history; prompt enforces EN/FIL, warm tone, zero hallucination | M1 | ORIGINAL_REQUEST R2 |
| 11 | Strict Medical Safety Invariants | Declines diagnosis, prescription alterations, ungrounded advice; advises consulting healthcare provider | M1 | ORIGINAL_REQUEST R2 |
| 12 | Attributable In-Stream Dose Card | Interactive card anchored with patient name, scheduled time, medicine strength, and caregiver attribution | M4 | ORIGINAL_REQUEST R3 |
| 13 | Inline "Record Taken" Mutation | One-tap dose recording calling `app_api.record_dose_event` with caregiver attribution and real-time cache sync | M4 | ORIGINAL_REQUEST R3 |
| 14 | "View in Today" Navigation Shortcut | Closes assistant sheet, sets focused dose, and navigates directly to Today tab | M4 | ORIGINAL_REQUEST R3 |
| 15 | Idle Mascot Animation State | 3.0s breathing float loop with periodic soft eye blinks | M2 | ORIGINAL_REQUEST R4 |
| 16 | Thinking Mascot Animation State | Curious head tilt (-5deg), alert stretch, and sparkle pulse glow during query processing | M2 | ORIGINAL_REQUEST R4 |
| 17 | Celebration Mascot Animation State | Embracing glowing care heart and shield with sparkles when all doses recorded | M2 | ORIGINAL_REQUEST R4 |
| 18 | Accessibility & ReduceMotion Fallback | High-resolution static asset with frozen transforms when reduceMotion enabled | M2 | ORIGINAL_REQUEST R4 |
| 19 | Bilingual Localization Parity | 1:1 translation keys across EN and FIL in `translations.ts` | M3 | ORIGINAL_REQUEST R5 |
| 20 | Verbatim Entity Name Preservation | Patient names and medicine terms preserved verbatim without translation | M3 | ORIGINAL_REQUEST R5 |
| 21 | Design Tokens Conformance | Flat tonal surfaces, 0 drop shadows, 48dp minimum touch targets, WCAG AA compliance | M3 | ORIGINAL_REQUEST R5 |
| 22 | Comprehensive Verification & Gates | 0 typecheck errors, 100% server tests pass, 21/21 expo-doctor, 0 forbidden push imports, check:runtime, live emulator verification | M6 | ORIGINAL_REQUEST Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven test suite (Tiers 1-4) published to `TEST_READY.md` | none | PLANNED |
| M1 | Assistant Domain Logic & Backend | Local rules engine, `POST /api/assistant/query`, Gemini adapter, server unit tests | none | PLANNED |
| M2 | Animated Mascot Expressions | `AssistantMascot` with Idle, Thinking, Celebration, and `reduceMotion` support | none | PLANNED |
| M3 | Translations & Design Tokens | Bilingual keys in `translations.ts` (EN/FIL), design token compliance checks | none | PLANNED |
| M4 | Bottom Sheet & Dose Cards | `AskBantayBottomSheet`, suggestion chips, `ActionableDoseCard`, inline recording | M1, M2, M3 | PLANNED |
| M5 | Persistent FAB & Screen Integration | `FloatingAssistantFab` in `MainTabs.tsx`, status beacon, screen bottom padding | M4 | PLANNED |
| M6 | Final Verification & Adversarial Hardening | Pass 100% E2E tests (T1-T4), Tier 5 adversarial tests, visual emulator verification | M5, E2E | PLANNED |

## Interface Contracts

### 1. Backend Endpoint: `POST /patients/:patientId/assistant/query` (Alias: `POST /api/assistant/query`)
- **Headers**: `Authorization: Bearer <sessionToken>`, `Content-Type: application/json`
- **Request Body**:
  ```ts
  export interface AssistantQueryRequest {
    query: string;
    locale: 'en' | 'fil';
    currentLocalTime?: string;
    todayDate?: string;
  }
  ```
- **Response Body**:
  ```ts
  export interface AssistantQueryResponse {
    answer: string;
    source: 'local_rules' | 'gemini' | 'fallback';
    model: string;
    actionableDose?: {
      occurrenceId: string;
      medicationName: string;
      doseQuantity: number;
      doseUnit: string;
      strengthValue: number | null;
      strengthUnit: string | null;
      scheduledFor: string;
      dueAt: string;
      status: 'not_recorded' | 'taken' | 'skipped' | 'snoozed';
    } | null;
    suggestedQuickReplies: string[];
  }
  ```

### 2. Client-Side Rules Engine: `evaluateLocalQuery(...)`
```ts
export interface LocalEvaluationContext {
  query: string;
  locale: 'en' | 'fil';
  patient: PatientRow;
  medications: MedicationRow[];
  timeline: DoseTimelineItem[];
  now: Date;
}

export interface LocalEvaluationResult {
  handled: boolean;
  answer?: string;
  actionableDose?: DoseTimelineItem | null;
  expression?: 'idle' | 'thinking' | 'celebration';
  suggestedQuickReplies?: string[];
}
```

### 3. Mascot Expression Controller: `AssistantMascotProps`
```ts
export type MascotExpression = 'idle' | 'thinking' | 'celebration';

export interface AssistantMascotProps {
  expression: MascotExpression;
  size?: number; // default 64dp for sheet, 40dp for FAB
  accessibilityLabel?: string;
}
```

### 4. Attributable Dose Recording Contract
- Endpoint: `POST /patients/:patientId/doses/:occurrenceId/events`
- Body: `{ kind: 'taken', clientActionId: string }`
- Cache invalidation: `['today', patientId, date]`, `['history', patientId]`, `['reminders', patientId]`

## Code Layout
- `server/src/gemini-assistant.ts`: Gemini REST API adapter with system prompt, medical invariants, and context injection.
- `server/src/app.ts`: Endpoint routing for `POST /patients/:patientId/assistant/query` and `POST /api/assistant/query`.
- `server/tests/assistant.test.ts`: Server test suite covering local rules, Gemini queries, fallback, and medical invariants.
- `src/features/assistant/types.ts`: Shared TypeScript interfaces for queries, responses, mascot states, and cards.
- `src/features/assistant/rulesEngine.ts`: Tier 1 instant local rules engine.
- `src/features/assistant/AssistantMascot.tsx`: Dynamic animated mascot component (Idle, Thinking, Celebration).
- `src/features/assistant/FloatingAssistantFab.tsx`: Persistent FAB with touch target >= 48dp and soft status beacon.
- `src/features/assistant/AskBantayBottomSheet.tsx`: Full-screen conversation modal with greeting, chips, message stream, and input bar.
- `src/features/assistant/ActionableDoseCard.tsx`: Attributable dose card with inline "Record Taken" and "View in Today".
- `src/features/navigation/MainTabs.tsx`: Integration of FAB above bottom navigation across Home, Today, Medicines.
- `src/i18n/translations.ts`: Bilingual copy keys in 1:1 parity (EN/FIL).
- `test/e2e/assistant_e2e.test.ts`: Dual-track E2E test suite covering Tiers 1–4.
