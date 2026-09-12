export type ScheduleKind = 'exact' | 'interval' | 'meal';

export type MedicationSchedule = {
  id: string;
  kind: ScheduleKind;
  timeOfDay: string;
  intervalHours: number | null;
  weekdays: number[];
  mealName: 'breakfast' | 'lunch' | 'dinner' | null;
  mealRelation: 'before' | 'after' | null;
  windowStart: string | null;
  windowEnd: string | null;
  startOn: string;
  endOn: string | null;
  timeZone: 'Asia/Manila';
};

export type Medication = {
  id: string;
  archivedAt: string | null;
  versionId: string;
  versionNumber: number;
  displayName: string;
  genericName: string | null;
  brandName: string | null;
  strengthValue: number | null;
  strengthUnit: string | null;
  doseQuantity: number;
  doseUnit: string;
  medicineForm: string | null;
  route: string | null;
  prescriber: string | null;
  reason: string | null;
  originalInstructions: string | null;
  notes: string | null;
  sourceKind: 'manual' | 'label_photo' | 'timetable_photo';
  status: 'confirmed';
  confirmedAt: string;
  schedules: MedicationSchedule[];
};

export type MedicationInput = {
  displayName: string;
  genericName: string;
  brandName: string;
  strengthValue: number | null;
  strengthUnit: string;
  doseQuantity: number;
  doseUnit: string;
  medicineForm: string;
  route: string;
  prescriber: string;
  reason: string;
  originalInstructions: string;
  notes: string;
  sourceKind: Medication['sourceKind'];
  schedules: Array<{
    kind: ScheduleKind;
    timeOfDay: string;
    intervalHours?: number;
    weekdays: number[];
    mealName?: 'breakfast' | 'lunch' | 'dinner';
    mealRelation?: 'before' | 'after';
    windowStart?: string;
    windowEnd?: string;
    startOn: string;
    endOn: string;
    timeZone: 'Asia/Manila';
  }>;
};

export type MedicationOcrDraft = {
  confidence: number;
  displayName: string;
  genericName?: string;
  brandName?: string;
  doseQuantity: number | null;
  doseUnit: string;
  exactTimes: string[];
  medicineForm: string;
  originalInstructions: string;
  rawText: string;
  route: string;
  sourceKind: 'label_photo' | 'timetable_photo';
  strengthUnit: string;
  strengthValue: number | null;
  warnings: string[];
  suggestedScheduleKind?: 'exact' | 'interval' | 'meal';
  detectedMeals?: Array<'breakfast' | 'lunch' | 'dinner'>;
  mealRelation?: 'before' | 'after';
  intervalHours?: number | null;
  timingClarification?: string | null;
  isAsNeeded?: boolean;
  pndfVerified?: boolean;
  pndfGenericName?: string;
  lasaWarning?: string | null;
};
