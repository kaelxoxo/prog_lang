# E2E Test Infra: In-App Mascot AI Care Assistant ("Ask Bantay")

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Derived strictly from `ORIGINAL_REQUEST.md` (R1–R5), independent of internal implementation details.
- **Methodology**: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Real-World Caregiver Workloads.
- **Progressive Testability**: Tier 1 tests verify fundamental contracts and endpoints; Tier 2 stresses boundaries and error recovery; Tier 3 exercises pairwise interactions; Tier 4 validates end-to-end caregiver journeys.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|----------------------|:------:|:------:|:------:|
| F1 | Persistent Floating Avatar (FAB) & Beacon | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| F2 | Expandable Bottom Sheet & Stream UI | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| F3 | Hybrid Dual-Engine (Local Rules + Gemini) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F4 | Attributable In-Stream Dose Cards | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| F5 | Dynamic Mascot Expressions & Motion | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| F6 | Bilingual Localization & Design Invariants | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**: Node.js test runner (`node:test`) executing via `npm.cmd run test:server`.
- **Test File**: `server/tests/assistant.test.ts` & `test/e2e/assistant_e2e.test.ts`.
- **Pass/Fail Semantics**: All test suites must complete with exit code 0, 0 failures, and 0 skipped.
- **Coverage Thresholds**:
  - Tier 1: ≥30 feature tests (≥5 per feature)
  - Tier 2: ≥30 boundary/edge tests (≥5 per feature)
  - Tier 3: ≥6 cross-feature interaction tests
  - Tier 4: ≥5 real-world caregiver workflow scenarios
  - Total Target: ≥70 test cases

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Morning Routine Caregiver Journey (Next Dose -> Record Dose -> Cache Sync) | F1, F2, F3, F4, F5 | High |
| 2 | Attributed Dual-Caregiver Handoff ("Who gave Lola Rosa her morning Amlodipine?") | F3, F4, F6 | Medium |
| 3 | Overdue Medicine Review & Status Beacon Clearance | F1, F2, F4, F5 | High |
| 4 | Bilingual Safety Invariant Guard (Prescription alteration query in Filipino and English) | F3, F6 | High |
| 5 | All Doses Taken Today Celebration Loop (Mascot Celebration state & congratulatory summary) | F2, F3, F5 | Medium |

## Publication Contract
Once all Tier 1–4 tests are created and ready, publish `TEST_READY.md` at project root with runner instructions and coverage verification.
