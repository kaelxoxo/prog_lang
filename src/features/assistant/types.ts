export type AssistantLocale = 'en' | 'fil';

export type DoseStatus = 'not_recorded' | 'taken' | 'skipped' | 'snoozed';

export interface AssistantQueryRequest {
  query: string;
  locale: AssistantLocale;
  currentLocalTime?: string;
  todayDate?: string;
}

export interface AssistantActionableDose {
  occurrenceId: string;
  medicationName: string;
  doseQuantity: number;
  doseUnit: string;
  strengthValue: number | null;
  strengthUnit: string | null;
  scheduledFor: string;
  dueAt: string;
  status: DoseStatus;
}

export interface AssistantMedicationDraft {
  id: string;
  displayName: string;
  genericName?: string;
  brandName?: string;
  strengthValue: number | null;
  strengthUnit: string;
  doseQuantity: number;
  doseUnit: string;
  medicineForm: string;
  scheduleKind: 'exact' | 'interval' | 'meal';
  times: string[];
  intervalHours?: number | null;
  weekdays: number[];
  mealName?: 'breakfast' | 'lunch' | 'dinner';
  mealRelation?: 'before' | 'after';
  route?: string;
  notes?: string;
  originalInstructions?: string;
  isDuplicate?: boolean;
  duplicateMedicationName?: string;
  confirmed?: boolean;
}

export type AssistantResponseSource = 'local_rules' | 'gemini' | 'fallback';

export interface AssistantQueryResponse {
  answer: string;
  source: AssistantResponseSource;
  model: string;
  actionableDose?: AssistantActionableDose | null;
  medicationDraft?: AssistantMedicationDraft | null;
  suggestedQuickReplies: string[];
}

export type MascotExpression = 'idle' | 'thinking' | 'celebration';

export interface AssistantMascotProps {
  expression: MascotExpression;
  size?: number; // default 64dp for sheet, 40dp for FAB
  accessibilityLabel?: string;
}

export interface AssistantPatientContext {
  id?: string;
  displayName: string;
  relationshipLabel?: string;
  role?: string;
  [key: string]: unknown;
}

export interface AssistantMedicationContext {
  id?: string;
  displayName: string;
  genericName?: string | null;
  brandName?: string | null;
  strengthValue?: number | null;
  strengthUnit?: string | null;
  doseQuantity?: number | null;
  doseUnit?: string;
  route?: string | null;
  originalInstructions?: string | null;
  notes?: string | null;
  schedules?: Array<{
    timeOfDay?: string;
    kind?: string;
    mealName?: string | null;
    mealRelation?: string | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface AssistantDoseContext {
  id: string;
  occurrenceId?: string;
  medicationName: string;
  doseQuantity?: number | null;
  doseUnit?: string | null;
  strengthValue?: number | null;
  strengthUnit?: string | null;
  scheduledFor: string | Date;
  dueAt: string | Date;
  status: DoseStatus;
  recordedByName?: string | null;
  recordedAt?: string | Date | null;
  snoozedUntil?: string | Date | null;
  reason?: string | null;
  [key: string]: unknown;
}

export interface LocalEvaluationContext {
  query: string;
  locale: AssistantLocale;
  patient: AssistantPatientContext;
  medications: AssistantMedicationContext[];
  timeline: AssistantDoseContext[];
  now: Date;
  canManageMedications?: boolean;
  primaryCareManagerName?: string;
  pendingDraftState?: AssistantMedicationDraft | null;
}

export interface LocalEvaluationResult {
  handled: boolean;
  answer?: string;
  actionableDose?: AssistantActionableDose | null;
  medicationDraft?: AssistantMedicationDraft | null;
  pendingDraft?: AssistantMedicationDraft | null;
  expression?: MascotExpression;
  suggestedQuickReplies?: string[];
  source?: 'local_rules';
}

export interface AssistantChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actionableDose?: AssistantActionableDose | null;
  medicationDraft?: AssistantMedicationDraft | null;
  canViewInSchedule?: boolean;
  source?: AssistantResponseSource;
}

export function toActionableDose(dose: AssistantDoseContext): AssistantActionableDose {
  return {
    occurrenceId: dose.occurrenceId || dose.id,
    medicationName: dose.medicationName,
    doseQuantity: typeof dose.doseQuantity === 'number' ? dose.doseQuantity : 1,
    doseUnit: dose.doseUnit || 'dose',
    strengthValue: typeof dose.strengthValue === 'number' ? dose.strengthValue : null,
    strengthUnit: dose.strengthUnit || null,
    scheduledFor: typeof dose.scheduledFor === 'string' ? dose.scheduledFor : dose.scheduledFor.toISOString(),
    dueAt: typeof dose.dueAt === 'string' ? dose.dueAt : dose.dueAt.toISOString(),
    status: dose.status,
  };
}
