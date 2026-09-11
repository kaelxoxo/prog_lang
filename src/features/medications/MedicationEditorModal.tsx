import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import {
  AccessibilityInfo,
  Alert,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/api';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import type { Patient } from '../patients/types';
import type { Medication, MedicationInput, MedicationOcrDraft, ScheduleKind } from './types';

type Props = {
  draft?: MedicationOcrDraft | null;
  medication: Medication | null;
  onClose: () => void;
  onSave: (input: MedicationInput) => Promise<unknown>;
  patient: Patient;
  visible: boolean;
};

type Step = 'details' | 'schedule' | 'review';
type MealName = 'breakfast' | 'lunch' | 'dinner';
type MealTime = { time: string; windowStart: string; windowEnd: string };
type DetailErrors = { displayName?: string; dose?: string; strength?: string };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const MEALS: Array<{ key: MealName; label: string }> = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];

function todayInManila() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function emptyMealTimes(): Record<MealName, MealTime> {
  return {
    breakfast: { time: '08:00', windowStart: '07:00', windowEnd: '09:00' },
    lunch: { time: '12:00', windowStart: '11:00', windowEnd: '13:00' },
    dinner: { time: '18:00', windowStart: '17:00', windowEnd: '19:00' },
  };
}

function calculateIntervalTimes(intervalHours: number, startHour = 6): string[] {
  const times: string[] = [];
  const count = Math.min(6, Math.floor(24 / Math.max(1, intervalHours)));
  for (let i = 0; i < count; i++) {
    const hour = (startHour + i * intervalHours) % 24;
    times.push(`${String(hour).padStart(2, '0')}:00`);
  }
  return times.length > 0 ? times : ['08:00'];
}

function mealTimesFromMeals(meals: MealName[], isBedtime = false): string[] {
  const result: string[] = [];
  if (meals.includes('breakfast')) result.push('08:00');
  if (meals.includes('lunch')) result.push('12:00');
  if (meals.includes('dinner')) result.push(isBedtime ? '21:00' : '18:00');
  return result.length > 0 ? result : ['08:00'];
}

function timeAsDate(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function dateAsDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function valueFromDate(value: Date, mode: 'date' | 'time') {
  if (mode === 'time') {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function friendlyTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(timeAsDate(value));
}

function friendlyDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(dateAsDate(value));
}

function scheduleLabel(kind: ScheduleKind) {
  if (kind === 'exact') return 'Fixed times';
  if (kind === 'interval') return 'Every few hours';
  return 'Around meals';
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, error, inputRef }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  multiline?: boolean;
  error?: string;
  inputRef?: RefObject<TextInput | null>;
}) {
  const { colors, styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        keyboardType={keyboardType}
        maxLength={multiline ? 1000 : 120}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        ref={inputRef}
        style={[styles.input, multiline && styles.multilineInput, error && styles.inputError]}
        value={value}
      />
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function DateTimeField({ label, mode, value, onChange, minimumDate }: {
  label: string;
  mode: 'date' | 'time';
  value: string;
  onChange: (value: string) => void;
  minimumDate?: Date;
}) {
  const { styles } = useThemedStyles(createStyles);
  const [expanded, setExpanded] = useState(false);
  const dateValue = mode === 'time' ? timeAsDate(value) : dateAsDate(value);

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dateValue,
        mode,
        is24Hour: false,
        minimumDate,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) onChange(valueFromDate(selected, mode));
        },
      });
      return;
    }
    setExpanded((current) => !current);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityLabel={`${label}, ${mode === 'time' ? friendlyTime(value) : friendlyDate(value)}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={open}
        style={({ pressed }) => [styles.pickerButton, pressed && styles.pickerButtonPressed]}
      >
        <Text style={styles.pickerValue}>{mode === 'time' ? friendlyTime(value) : friendlyDate(value)}</Text>
        <Text style={styles.pickerAction}>Change</Text>
      </Pressable>
      {Platform.OS === 'ios' && expanded ? (
        <View style={styles.iosPicker}>
          <DateTimePicker
            display="spinner"
            minimumDate={minimumDate}
            mode={mode}
            onChange={(_event, selected) => selected && onChange(valueFromDate(selected, mode))}
            value={dateValue}
          />
          <Pressable accessibilityRole="button" onPress={() => setExpanded(false)} style={styles.pickerDone}>
            <Text style={styles.pickerDoneLabel}>Done</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewRowLabel}>{label}</Text>
      <Text style={styles.reviewRowValue}>{value || 'Not provided'}</Text>
    </View>
  );
}

export function MedicationEditorModal({ draft, medication, onClose, onSave, patient, visible }: Props) {
  const { styles } = useThemedStyles(createStyles);
  const { width, fontScale } = useWindowDimensions();
  const stackFields = width < 620 || fontScale > 1.15;
  const [step, setStep] = useState<Step>('details');
  const [displayName, setDisplayName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [strengthValue, setStrengthValue] = useState('');
  const [strengthUnit, setStrengthUnit] = useState('mg');
  const [doseQuantity, setDoseQuantity] = useState('1');
  const [doseUnit, setDoseUnit] = useState('tablet');
  const [medicineForm, setMedicineForm] = useState('');
  const [route, setRoute] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [reason, setReason] = useState('');
  const [originalInstructions, setOriginalInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('exact');
  const [exactTimes, setExactTimes] = useState(['08:00', '20:00']);
  const [intervalHours, setIntervalHours] = useState('8');
  const [intervalStart, setIntervalStart] = useState('06:00');
  const [mealRelation, setMealRelation] = useState<'before' | 'after'>('after');
  const [mealTimes, setMealTimes] = useState(emptyMealTimes);
  const [enabledMeals, setEnabledMeals] = useState<Record<MealName, boolean>>({ breakfast: true, lunch: true, dinner: true });
  const [customMealWindows, setCustomMealWindows] = useState<Record<MealName, boolean>>({ breakfast: false, lunch: false, dinner: false });
  const [everyDay, setEveryDay] = useState(true);
  const [weekdays, setWeekdays] = useState<number[]>(ALL_WEEKDAYS);
  const [startOn, setStartOn] = useState(todayInManila);
  const [endEnabled, setEndEnabled] = useState(false);
  const [endOn, setEndOn] = useState(todayInManila);
  const [detailErrors, setDetailErrors] = useState<DetailErrors>({});
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isDirty, setDirty] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const displayNameRef = useRef<TextInput>(null);
  const doseRef = useRef<TextInput>(null);
  const strengthRef = useRef<TextInput>(null);
  const scheduleErrorRef = useRef<View>(null);

  const change = <T,>(setter: Dispatch<SetStateAction<T>>) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  useEffect(() => {
    if (!visible) return;
    setStep('details');
    setDisplayName(medication?.displayName ?? draft?.displayName ?? '');
    setGenericName(medication?.genericName ?? draft?.genericName ?? '');
    setBrandName(medication?.brandName ?? draft?.brandName ?? '');
    setStrengthValue(medication?.strengthValue?.toString() ?? draft?.strengthValue?.toString() ?? '');
    setStrengthUnit(medication?.strengthUnit || draft?.strengthUnit || 'mg');
    setDoseQuantity(medication?.doseQuantity != null ? medication.doseQuantity.toString() : (draft?.doseQuantity != null ? draft.doseQuantity.toString() : '1'));
    setDoseUnit(medication?.doseUnit || draft?.doseUnit || 'tablet');
    setMedicineForm(medication?.medicineForm ?? draft?.medicineForm ?? '');
    setRoute(medication?.route ?? draft?.route ?? '');
    setPrescriber(medication?.prescriber ?? '');
    setReason(medication?.reason ?? '');
    setOriginalInstructions(medication?.originalInstructions ?? draft?.originalInstructions ?? '');
    setNotes(medication?.notes ?? '');
    setShowOptional(Boolean((medication && (medication.genericName || medication.brandName || medication.medicineForm || medication.route || medication.prescriber || medication.reason || medication.notes)) || draft));
    setDetailErrors({});
    setScheduleError(null);
    setServerError(null);

    const first = medication?.schedules[0];
    if (!first) {
      const suggestedKind = draft?.suggestedScheduleKind ?? 'exact';
      setScheduleKind(suggestedKind);
      setIntervalHours(draft?.intervalHours ? String(draft.intervalHours) : '8');
      setIntervalStart('06:00');
      setMealRelation(draft?.mealRelation ?? 'after');
      const isBedtime = Boolean(draft?.timingClarification?.toLowerCase().includes('bedtime'));
      const initialMealTimes = emptyMealTimes();
      if (isBedtime) {
        initialMealTimes.dinner = { time: '21:00', windowStart: '20:00', windowEnd: '22:00' };
      }
      setMealTimes(initialMealTimes);
      setCustomMealWindows({ breakfast: false, lunch: false, dinner: false });

      if (draft?.suggestedScheduleKind === 'meal' && draft.detectedMeals?.length) {
        const initialMeals: Record<MealName, boolean> = { breakfast: false, lunch: false, dinner: false };
        draft.detectedMeals.forEach((m) => { initialMeals[m] = true; });
        setEnabledMeals(initialMeals);
      } else {
        setEnabledMeals({ breakfast: true, lunch: true, dinner: true });
      }

      let initialExactTimes = ['08:00', '20:00'];
      if (draft?.exactTimes?.length) {
        initialExactTimes = draft.exactTimes;
      } else if (draft?.intervalHours) {
        initialExactTimes = calculateIntervalTimes(draft.intervalHours, 6);
      } else if (draft?.detectedMeals?.length) {
        initialExactTimes = mealTimesFromMeals(draft.detectedMeals, isBedtime);
      }
      setExactTimes(initialExactTimes);

      setEveryDay(true);
      setWeekdays(ALL_WEEKDAYS);
      setStartOn(todayInManila());
      setEndEnabled(false);
      setEndOn(todayInManila());
      setDirty(Boolean(draft));
      return;
    }

    setScheduleKind(first.kind);
    setExactTimes(medication.schedules.filter((item) => item.kind === 'exact').map((item) => item.timeOfDay));
    setIntervalHours(first.intervalHours?.toString() ?? '8');
    setIntervalStart(first.timeOfDay);
    setMealRelation(first.mealRelation ?? 'after');
    const restoredMeals = emptyMealTimes();
    const restoredCustom = { breakfast: false, lunch: false, dinner: false };
    const restoredEnabled: Record<MealName, boolean> = { breakfast: false, lunch: false, dinner: false };
    medication.schedules.forEach((item) => {
      if (item.kind === 'meal' && item.mealName) {
        restoredMeals[item.mealName] = {
          time: item.timeOfDay,
          windowStart: item.windowStart ?? item.timeOfDay,
          windowEnd: item.windowEnd ?? item.timeOfDay,
        };
        restoredCustom[item.mealName] = true;
        restoredEnabled[item.mealName] = true;
      }
    });
    setMealTimes(restoredMeals);
    setCustomMealWindows(restoredCustom);
    if (Object.values(restoredEnabled).some(Boolean)) {
      setEnabledMeals(restoredEnabled);
    } else {
      setEnabledMeals({ breakfast: true, lunch: true, dinner: true });
    }
    setEveryDay(first.weekdays.length === 7);
    setWeekdays(first.weekdays);
    setStartOn(first.startOn);
    setEndEnabled(Boolean(first.endOn));
    setEndOn(first.endOn ?? first.startOn);
    setDirty(false);
  }, [draft, medication, visible]);

  const requestClose = () => {
    if (isSaving) return;
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert('Discard your changes?', `Nothing for ${patient.displayName} will be saved.`, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  const validateDetails = () => {
    const problems: DetailErrors = {};
    if (!displayName.trim()) problems.displayName = 'Enter the medicine name from the label.';
    if (!Number.isFinite(Number(doseQuantity)) || Number(doseQuantity) <= 0 || !doseUnit.trim()) {
      problems.dose = 'Enter a positive dose and its unit, such as 1 tablet.';
    }
    if (strengthValue && (!Number.isFinite(Number(strengthValue)) || Number(strengthValue) <= 0 || !strengthUnit.trim())) {
      problems.strength = 'Enter a positive strength and its unit, or leave both blank.';
    }
    setDetailErrors(problems);
    const first = problems.displayName ? displayNameRef : problems.dose ? doseRef : problems.strength ? strengthRef : null;
    if (first) {
      scrollRef.current?.scrollTo({ animated: true, y: 0 });
      setTimeout(() => first.current?.focus(), 100);
    }
    return Object.keys(problems).length === 0;
  };

  const validateSchedule = () => {
    let problem: string | null = null;
    if (!everyDay && !weekdays.length) problem = 'Choose at least one day.';
    if (endEnabled && endOn < startOn) problem = 'The end date cannot be before the start date.';
    if (scheduleKind === 'exact' && !exactTimes.length) problem = 'Add at least one reminder time.';
    if (scheduleKind === 'interval') {
      const hours = Number(intervalHours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 24) problem = 'Choose a whole interval from 1 to 24 hours.';
    }
    if (scheduleKind === 'meal') {
      const activeMeals = MEALS.filter(({ key }) => enabledMeals[key]);
      if (!activeMeals.length) problem = 'Choose at least one meal (Breakfast, Lunch, or Dinner).';
      const invalidWindow = activeMeals.some(({ key }) => mealTimes[key].windowEnd <= mealTimes[key].windowStart);
      if (invalidWindow) problem = 'Each meal window must end after it starts.';
    }
    setScheduleError(problem);
    if (problem) {
      scrollRef.current?.scrollToEnd({ animated: true });
      setTimeout(() => {
        const node = findNodeHandle(scheduleErrorRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }, 100);
    }
    return !problem;
  };

  const updateMeal = (meal: MealName, field: keyof MealTime, value: string) => {
    setMealTimes((current) => ({ ...current, [meal]: { ...current[meal], [field]: value } }));
    setDirty(true);
  };

  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => current.includes(weekday) ? current.filter((item) => item !== weekday) : [...current, weekday].sort());
    setDirty(true);
  };

  const medicationInput = (): MedicationInput => {
    const selectedWeekdays = everyDay ? ALL_WEEKDAYS : weekdays;
    const common = { weekdays: selectedWeekdays, startOn, endOn: endEnabled ? endOn : '', timeZone: 'Asia/Manila' as const };
    const schedules = scheduleKind === 'exact'
      ? exactTimes.map((timeOfDay) => ({ kind: 'exact' as const, timeOfDay, ...common }))
      : scheduleKind === 'interval'
        ? [{ kind: 'interval' as const, timeOfDay: intervalStart, intervalHours: Number(intervalHours), ...common }]
        : MEALS.filter(({ key }) => enabledMeals[key]).map(({ key }) => ({
          kind: 'meal' as const,
          timeOfDay: mealTimes[key].time,
          mealName: key,
          mealRelation,
          windowStart: mealTimes[key].windowStart,
          windowEnd: mealTimes[key].windowEnd,
          ...common,
        }));

    return {
      displayName: displayName.trim(), genericName: genericName.trim(), brandName: brandName.trim(),
      strengthValue: strengthValue ? Number(strengthValue) : null,
      strengthUnit: strengthValue ? strengthUnit.trim() : '',
      doseQuantity: Number(doseQuantity), doseUnit: doseUnit.trim(), medicineForm: medicineForm.trim(),
      route: route.trim(), prescriber: prescriber.trim(), reason: reason.trim(),
      originalInstructions: originalInstructions.trim(), notes: notes.trim(),
      sourceKind: medication?.sourceKind ?? draft?.sourceKind ?? 'manual', schedules,
    };
  };

  const save = async () => {
    setSaving(true);
    setServerError(null);
    try {
      await onSave(medicationInput());
      setDirty(false);
      onClose();
    } catch (saveError) {
      setServerError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const goForward = () => {
    setServerError(null);
    if (step === 'details') {
      if (validateDetails()) setStep('schedule');
      return;
    }
    if (step === 'schedule') {
      if (validateSchedule()) setStep('review');
      return;
    }
    void save();
  };

  const activeMealNames = MEALS.filter(({ key }) => enabledMeals[key]).map((m) => m.label);
  const scheduleSummary = scheduleKind === 'exact'
    ? exactTimes.map(friendlyTime).join(', ')
    : scheduleKind === 'interval'
      ? `Every ${intervalHours} hours, starting ${friendlyTime(intervalStart)}`
      : `${mealRelation === 'after' ? 'After' : 'Before'} ${activeMealNames.join(', ') || 'meals'}`;

  return (
    <Modal animationType="slide" onRequestClose={requestClose} visible={visible}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerColumn}>
            <View accessibilityLabel={`Medicine for ${patient.displayName}`} accessible style={styles.patientContext}>
              <View style={styles.patientDot} />
              <Text style={styles.patientContextText}>Medicine for <Text style={styles.patientContextName}>{patient.displayName}</Text></Text>
            </View>
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" style={styles.title}>
                {step === 'details' ? 'Medicine details' : step === 'schedule' ? 'Set the schedule' : 'Check before confirming'}
              </Text>
              <Pressable accessibilityRole="button" onPress={requestClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><Text style={styles.closeLabel}>Close</Text></Pressable>
            </View>
            <View accessibilityLabel={`Step ${step === 'details' ? 1 : step === 'schedule' ? 2 : 3} of 3`} accessible style={styles.progress}>
              {(['details', 'schedule', 'review'] as Step[]).map((item, index) => (
                <View key={item} style={styles.progressItem}>
                  <View style={[styles.progressLine, (item === step || (step === 'review' && index < 2) || (step === 'schedule' && index === 0)) && styles.progressLineActive]} />
                  <Text style={[styles.progressLabel, item === step && styles.progressLabelActive]}>{index + 1}. {item === 'review' ? 'Confirm' : item[0].toUpperCase() + item.slice(1)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" ref={scrollRef}>
          {step === 'details' ? (
            <>
              <Text style={styles.helper}>Copy the essentials from the label first. You can add more detail only when it is available.</Text>
              <Field error={detailErrors.displayName} inputRef={displayNameRef} label="Medicine name" onChangeText={change(setDisplayName)} placeholder="Amlodipine" value={displayName} />
              <View style={[styles.fieldRow, stackFields && styles.fieldStack]}>
                <View style={styles.fieldColumn}><Field error={detailErrors.dose} inputRef={doseRef} keyboardType="decimal-pad" label="Dose quantity" onChangeText={change(setDoseQuantity)} value={doseQuantity} /></View>
                <View style={styles.fieldColumn}><Field error={detailErrors.dose} label="Dose unit" onChangeText={change(setDoseUnit)} placeholder="tablet" value={doseUnit} /></View>
              </View>
              <View style={[styles.fieldRow, stackFields && styles.fieldStack]}>
                <View style={styles.fieldColumn}><Field error={detailErrors.strength} inputRef={strengthRef} keyboardType="decimal-pad" label="Strength, if written" onChangeText={change(setStrengthValue)} placeholder="5" value={strengthValue} /></View>
                <View style={styles.fieldColumn}><Field error={detailErrors.strength} label="Strength unit" onChangeText={change(setStrengthUnit)} placeholder="mg" value={strengthUnit} /></View>
              </View>
              <Field label="Instructions exactly as written" multiline onChangeText={change(setOriginalInstructions)} placeholder="Three times daily after meals" value={originalInstructions} />

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showOptional }}
                onPress={() => setShowOptional((current) => !current)}
                style={styles.disclosure}
              >
                <View style={styles.disclosureCopy}>
                  <Text style={styles.disclosureTitle}>More label and care details</Text>
                  <Text style={styles.disclosureHint}>Generic or brand name, form, route, prescriber, reason, and notes</Text>
                </View>
                <Text style={styles.disclosureAction}>{showOptional ? 'Hide' : 'Add'}</Text>
              </Pressable>

              {showOptional ? (
                <View style={styles.optionalFields}>
                  <Field label="Generic name" onChangeText={change(setGenericName)} value={genericName} />
                  <Field label="Brand name" onChangeText={change(setBrandName)} value={brandName} />
                  <Field label="Form" onChangeText={change(setMedicineForm)} placeholder="Tablet, capsule, syrup" value={medicineForm} />
                  <Field label="Route" onChangeText={change(setRoute)} placeholder="By mouth" value={route} />
                  <Field label="Prescriber" onChangeText={change(setPrescriber)} placeholder="Dr. Reyes" value={prescriber} />
                  <Field label="Reason for taking" onChangeText={change(setReason)} placeholder="High blood pressure" value={reason} />
                  <Field label="Care notes" multiline onChangeText={change(setNotes)} value={notes} />
                </View>
              ) : null}
            </>
          ) : null}

          {step === 'schedule' ? (
            <>
              <Text style={styles.helper}>Choose the pattern that matches the written instruction. Alaga uses Philippine local time.</Text>

              {draft?.timingClarification ? (
                <View style={styles.clarificationBanner}>
                  <Text style={styles.clarificationTitle}>Prescription Timing Notice</Text>
                  <Text style={styles.clarificationText}>{draft.timingClarification}</Text>
                  <View style={styles.clarificationActions}>
                    {draft.suggestedScheduleKind === 'meal' ? (
                      scheduleKind === 'meal' ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            const isBedtime = Boolean(draft.timingClarification?.toLowerCase().includes('bedtime'));
                            const activeMeals = MEALS.filter(({ key }) => enabledMeals[key]).map(({ key }) => key);
                            const times = mealTimesFromMeals(activeMeals.length ? activeMeals : (draft.detectedMeals ?? ['breakfast']), isBedtime);
                            setExactTimes(times);
                            setScheduleKind('exact');
                            setDirty(true);
                            setScheduleError(null);
                          }}
                          style={styles.clarifyOptionButton}
                        >
                          <Text style={styles.clarifyOptionText}>
                            Clarify to fixed clock time ({mealTimesFromMeals(MEALS.filter(({ key }) => enabledMeals[key]).map(({ key }) => key), Boolean(draft.timingClarification?.toLowerCase().includes('bedtime'))).map(friendlyTime).join(', ')})
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setScheduleKind('meal');
                            setDirty(true);
                            setScheduleError(null);
                          }}
                          style={styles.clarifyOptionButton}
                        >
                          <Text style={styles.clarifyOptionText}>
                            Keep meal-based timing ({draft.mealRelation || 'after'} {draft.detectedMeals?.join(', ') || 'meals'})
                          </Text>
                        </Pressable>
                      )
                    ) : (draft.suggestedScheduleKind === 'interval' && draft.intervalHours) ? (
                      scheduleKind === 'interval' ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            const startHour = parseInt(intervalStart.split(':')[0], 10) || 6;
                            const times = calculateIntervalTimes(draft.intervalHours!, startHour);
                            setExactTimes(times);
                            setScheduleKind('exact');
                            setDirty(true);
                            setScheduleError(null);
                          }}
                          style={styles.clarifyOptionButton}
                        >
                          <Text style={styles.clarifyOptionText}>
                            Clarify to fixed clock times ({calculateIntervalTimes(draft.intervalHours, parseInt(intervalStart.split(':')[0], 10) || 6).map(friendlyTime).join(', ')})
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setScheduleKind('interval');
                            setDirty(true);
                            setScheduleError(null);
                          }}
                          style={styles.clarifyOptionButton}
                        >
                          <Text style={styles.clarifyOptionText}>
                            Keep interval timing (every {draft.intervalHours} hours)
                          </Text>
                        </Pressable>
                      )
                    ) : null}
                  </View>
                </View>
              ) : null}

              <View accessibilityRole="radiogroup" style={styles.choiceGroup}>
                {(['exact', 'interval', 'meal'] as ScheduleKind[]).map((kind) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: scheduleKind === kind }}
                    key={kind}
                    onPress={() => { setScheduleKind(kind); setDirty(true); setScheduleError(null); }}
                    style={[styles.choice, scheduleKind === kind && styles.choiceSelected]}
                  >
                    <Text style={[styles.choiceLabel, scheduleKind === kind && styles.choiceLabelSelected]}>{scheduleLabel(kind)}</Text>
                    <Text style={styles.choiceHint}>{kind === 'exact' ? 'Specific reminder times' : kind === 'interval' ? 'Repeat from a first time' : 'Breakfast, lunch, or dinner'}</Text>
                  </Pressable>
                ))}
              </View>

              {scheduleKind === 'exact' ? (
                <View style={styles.scheduleGroup}>
                  <Text style={styles.groupTitle}>Reminder times</Text>
                  {exactTimes.map((time, index) => (
                    <View key={index} style={[styles.timeRow, stackFields && styles.fieldStack]}>
                      <View style={styles.timeField}><DateTimeField label={`Time ${index + 1}`} mode="time" onChange={(value) => { setExactTimes((current) => current.map((item, itemIndex) => itemIndex === index ? value : item)); setDirty(true); }} value={time} /></View>
                      {exactTimes.length > 1 ? <Pressable accessibilityLabel={`Remove time ${index + 1}`} accessibilityRole="button" onPress={() => { setExactTimes((current) => current.filter((_item, itemIndex) => itemIndex !== index)); setDirty(true); }} style={styles.removeButton}><Text style={styles.removeLabel}>Remove</Text></Pressable> : null}
                    </View>
                  ))}
                  {exactTimes.length < 6 ? <Pressable accessibilityRole="button" onPress={() => { setExactTimes((current) => [...current, '12:00']); setDirty(true); }} style={styles.addTimeButton}><Text style={styles.addTimeLabel}>+ Add another time</Text></Pressable> : null}
                </View>
              ) : null}

              {scheduleKind === 'interval' ? (
                <View style={styles.scheduleGroup}>
                  <Field error={scheduleError ?? undefined} keyboardType="number-pad" label="Repeat every how many hours?" onChangeText={change(setIntervalHours)} value={intervalHours} />
                  <DateTimeField label="First time" mode="time" onChange={change(setIntervalStart)} value={intervalStart} />
                  <Text style={styles.inlineHelp}>Alaga will repeat from this first time. Check the pattern carefully on the next screen.</Text>
                </View>
              ) : null}

              {scheduleKind === 'meal' ? (
                <View style={styles.scheduleGroup}>
                  <Text style={styles.groupTitle}>Relation to meals</Text>
                  <View accessibilityRole="radiogroup" style={styles.inlineChoices}>
                    {(['after', 'before'] as const).map((relation) => (
                      <Pressable accessibilityRole="radio" accessibilityState={{ checked: mealRelation === relation }} key={relation} onPress={() => { setMealRelation(relation); setDirty(true); }} style={[styles.pill, mealRelation === relation && styles.pillSelected]}>
                        <Text style={[styles.pillLabel, mealRelation === relation && styles.pillLabelSelected]}>{relation === 'after' ? 'After meals' : 'Before meals'}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.groupTitle}>Meals to include</Text>
                  <View style={styles.mealChoices}>
                    {MEALS.map(({ key, label }) => (
                      <Pressable
                        accessibilityLabel={`${label} meal schedule`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: enabledMeals[key] }}
                        key={key}
                        onPress={() => {
                          setEnabledMeals((current) => ({ ...current, [key]: !current[key] }));
                          setDirty(true);
                        }}
                        style={[styles.mealPill, enabledMeals[key] && styles.mealPillSelected]}
                      >
                        <Text style={[styles.mealPillText, enabledMeals[key] && styles.mealPillTextSelected]}>
                          {enabledMeals[key] ? '✓ ' : ''}{label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {MEALS.filter(({ key }) => enabledMeals[key]).map(({ key, label }) => (
                    <View key={key} style={styles.mealRow}>
                      <View style={styles.mealHeading}>
                        <Text style={styles.mealTitle}>{label}</Text>
                        <Pressable accessibilityRole="button" accessibilityState={{ expanded: customMealWindows[key] }} onPress={() => setCustomMealWindows((current) => ({ ...current, [key]: !current[key] }))} style={styles.customizeButton}>
                          <Text style={styles.customizeLabel}>{customMealWindows[key] ? 'Use suggested window' : 'Customize window'}</Text>
                        </Pressable>
                      </View>
                      <DateTimeField label="Reminder" mode="time" onChange={(value) => updateMeal(key, 'time', value)} value={mealTimes[key].time} />
                      {customMealWindows[key] ? (
                        <View style={[styles.fieldRow, stackFields && styles.fieldStack]}>
                          <View style={styles.fieldColumn}><DateTimeField label="Window starts" mode="time" onChange={(value) => updateMeal(key, 'windowStart', value)} value={mealTimes[key].windowStart} /></View>
                          <View style={styles.fieldColumn}><DateTimeField label="Window ends" mode="time" onChange={(value) => updateMeal(key, 'windowEnd', value)} value={mealTimes[key].windowEnd} /></View>
                        </View>
                      ) : <Text style={styles.inlineHelp}>Suggested window: {friendlyTime(mealTimes[key].windowStart)} to {friendlyTime(mealTimes[key].windowEnd)}</Text>}
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.scheduleGroup}>
                <Text style={styles.groupTitle}>Days</Text>
                <View accessibilityRole="radiogroup" style={styles.inlineChoices}>
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: everyDay }} onPress={() => { setEveryDay(true); setWeekdays(ALL_WEEKDAYS); setDirty(true); }} style={[styles.pill, everyDay && styles.pillSelected]}><Text style={[styles.pillLabel, everyDay && styles.pillLabelSelected]}>Every day</Text></Pressable>
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: !everyDay }} onPress={() => { setEveryDay(false); setDirty(true); }} style={[styles.pill, !everyDay && styles.pillSelected]}><Text style={[styles.pillLabel, !everyDay && styles.pillLabelSelected]}>Choose days</Text></Pressable>
                </View>
                {!everyDay ? (
                  <View style={styles.weekdays}>
                    {WEEKDAYS.map((label, weekday) => (
                      <Pressable accessibilityLabel={label} accessibilityRole="checkbox" accessibilityState={{ checked: weekdays.includes(weekday) }} key={label} onPress={() => toggleWeekday(weekday)} style={[styles.weekday, weekdays.includes(weekday) && styles.weekdaySelected]}>
                        <Text style={[styles.weekdayLabel, weekdays.includes(weekday) && styles.weekdayLabelSelected]}>{label.slice(0, 3)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.scheduleGroup}>
                <DateTimeField label="Starts" mode="date" onChange={change(setStartOn)} value={startOn} />
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: endEnabled }} onPress={() => { setEndEnabled((current) => !current); setDirty(true); }} style={styles.checkRow}>
                  <View style={[styles.checkbox, endEnabled && styles.checkboxChecked]}><Text style={styles.checkmark}>{endEnabled ? '✓' : ''}</Text></View>
                  <Text style={styles.checkLabel}>This schedule has an end date</Text>
                </Pressable>
                {endEnabled ? <DateTimeField label="Ends" minimumDate={dateAsDate(startOn)} mode="date" onChange={change(setEndOn)} value={endOn} /> : null}
              </View>
              {scheduleError ? <View accessible accessibilityLiveRegion="assertive" ref={scheduleErrorRef} style={styles.errorBox}><Text style={styles.errorText}>{scheduleError}</Text></View> : null}
            </>
          ) : null}

          {step === 'review' ? (
            <>
              <Text style={styles.helper}>Compare every value below with the label or prescription. Only this confirmed version becomes active.</Text>
              <View style={styles.reviewSection}>
                <View style={styles.reviewHeading}><Text style={styles.reviewTitle}>Medicine</Text><Pressable accessibilityRole="button" onPress={() => setStep('details')} style={styles.editSection}><Text style={styles.editSectionLabel}>Edit details</Text></Pressable></View>
                <ReviewRow label="Name" value={displayName} />
                <ReviewRow label="Generic name" value={genericName} />
                <ReviewRow label="Brand name" value={brandName} />
                <ReviewRow label="Strength" value={strengthValue ? `${strengthValue} ${strengthUnit}` : ''} />
                <ReviewRow label="Dose" value={`${doseQuantity} ${doseUnit}`} />
                <ReviewRow label="Form" value={medicineForm} />
                <ReviewRow label="Route" value={route} />
                <ReviewRow label="Prescriber" value={prescriber} />
                <ReviewRow label="Reason" value={reason} />
                {(!strengthValue || !medicineForm || !route) ? <View style={styles.warning}><Text style={styles.warningText}>Strength, form, or route is not provided. Confirm only if you checked the source and this is intentional.</Text></View> : null}
              </View>

              <View style={styles.reviewSection}>
                <View style={styles.reviewHeading}><Text style={styles.reviewTitle}>Schedule</Text><Pressable accessibilityRole="button" onPress={() => setStep('schedule')} style={styles.editSection}><Text style={styles.editSectionLabel}>Edit schedule</Text></Pressable></View>
                <ReviewRow label="Pattern" value={scheduleLabel(scheduleKind)} />
                <ReviewRow label="Timing" value={scheduleSummary} />
                {scheduleKind === 'meal' ? MEALS.filter(({ key }) => enabledMeals[key]).map(({ key, label }) => <ReviewRow key={key} label={`${label} window`} value={`${friendlyTime(mealTimes[key].windowStart)} to ${friendlyTime(mealTimes[key].windowEnd)}, reminder ${friendlyTime(mealTimes[key].time)}`} />) : null}
                <ReviewRow label="Days" value={everyDay ? 'Every day' : weekdays.map((day) => WEEKDAYS[day]).join(', ')} />
                <ReviewRow label="Dates" value={`From ${friendlyDate(startOn)}${endEnabled ? ` through ${friendlyDate(endOn)}` : ', no end date'}`} />
                <ReviewRow label="Time zone" value="Philippine time" />
              </View>

              <View style={styles.reviewSection}>
                <View style={styles.reviewHeading}><Text style={styles.reviewTitle}>Source wording and notes</Text><Pressable accessibilityRole="button" onPress={() => setStep('details')} style={styles.editSection}><Text style={styles.editSectionLabel}>Edit</Text></Pressable></View>
                <ReviewRow label="Instructions as written" value={originalInstructions} />
                <ReviewRow label="Care notes" value={notes} />
              </View>

              <View style={styles.confirmationNote}>
                <View style={styles.confirmationDot} />
                <Text style={styles.confirmationText}>You are confirming this medicine for <Text style={styles.confirmationName}>{patient.displayName}</Text>.</Text>
              </View>
            </>
          ) : null}

          {serverError ? <View accessibilityLiveRegion="assertive" style={styles.errorBox}><Text style={styles.errorText}>{serverError}</Text></View> : null}
        </ScrollView>

        <View style={[styles.actions, stackFields && styles.actionsStack]}>
          {step !== 'details' ? <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => { setServerError(null); setStep(step === 'review' ? 'schedule' : 'details'); }} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryLabel}>Back</Text></Pressable> : null}
          <Pressable accessibilityRole="button" disabled={isSaving} onPress={goForward} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed, isSaving && styles.disabled]}>
            <Text style={styles.primaryLabel}>{step === 'review' ? (isSaving ? 'Confirming...' : `Confirm for ${patient.displayName}`) : 'Continue'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerColumn: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.sm },
  patientContext: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  patientDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sun },
  patientContextText: { flex: 1, color: colors.muted, fontSize: 14 },
  patientContextName: { color: colors.ink, fontWeight: '800' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, color: colors.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  closeButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  closeLabel: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  progress: { flexDirection: 'row', gap: spacing.sm },
  progressItem: { flex: 1, gap: 5 },
  progressLine: { height: 3, borderRadius: 2, backgroundColor: colors.line },
  progressLineActive: { backgroundColor: colors.primary },
  progressLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  progressLabelActive: { color: colors.primaryDark, fontWeight: '800' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxl },
  helper: { maxWidth: 620, color: colors.muted, fontSize: 16, lineHeight: 24 },
  field: { flex: 1, gap: spacing.sm },
  label: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.white, color: colors.ink, fontSize: 17, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  inputError: { borderColor: colors.error },
  multilineInput: { minHeight: 96, textAlignVertical: 'top' },
  fieldError: { color: colors.error, fontSize: 13, lineHeight: 19 },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  fieldStack: { flexDirection: 'column' },
  fieldColumn: { flex: 1, width: '100%' },
  disclosure: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: spacing.md },
  disclosureCopy: { flex: 1, gap: 3 },
  disclosureTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  disclosureHint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  disclosureAction: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  optionalFields: { gap: spacing.lg },
  clarificationBanner: { gap: spacing.xs, borderRadius: radii.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryTint, padding: spacing.md },
  clarificationTitle: { color: colors.primaryDark, fontSize: 14, fontWeight: '900' },
  clarificationText: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  clarificationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  clarifyOptionButton: { minHeight: 44, justifyContent: 'center', borderRadius: radii.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  clarifyOptionText: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  choiceGroup: { gap: spacing.sm },
  choice: { gap: 4, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.white, padding: spacing.md },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  choiceLabel: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  choiceLabelSelected: { color: colors.primaryDark },
  choiceHint: { color: colors.muted, fontSize: 14 },
  scheduleGroup: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg },
  groupTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  pickerButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  pickerButtonPressed: { backgroundColor: colors.mist },
  pickerValue: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' },
  pickerAction: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  iosPicker: { borderRadius: radii.md, backgroundColor: colors.white, paddingBottom: spacing.sm },
  pickerDone: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pickerDoneLabel: { color: colors.primaryDark, fontSize: 16, fontWeight: '800' },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  timeField: { flex: 1, width: '100%' },
  removeButton: { minHeight: 54, justifyContent: 'center', paddingHorizontal: spacing.sm },
  removeLabel: { color: colors.error, fontSize: 14, fontWeight: '700' },
  addTimeButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  addTimeLabel: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  inlineHelp: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  inlineChoices: { flexDirection: 'row', gap: spacing.sm },
  pill: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 24, backgroundColor: colors.white, paddingHorizontal: spacing.sm },
  pillSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  pillLabel: { color: colors.muted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  pillLabelSelected: { color: colors.primaryDark },
  mealChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealPill: { minHeight: 48, minWidth: 96, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 24, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  mealPillSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  mealPillText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  mealPillTextSelected: { color: colors.primaryDark, fontWeight: '900' },
  mealRow: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  mealHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  mealTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  customizeButton: { minHeight: 48, justifyContent: 'center' },
  customizeLabel: { color: colors.primaryDark, fontSize: 13, fontWeight: '800' },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weekday: { minWidth: 84, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 24, backgroundColor: colors.white, paddingHorizontal: spacing.sm },
  weekdaySelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  weekdayLabel: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  weekdayLabelSelected: { color: colors.white },
  checkRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 6, backgroundColor: colors.white },
  checkboxChecked: { borderColor: colors.ink, backgroundColor: colors.ink },
  checkmark: { color: colors.white, fontSize: 15, fontWeight: '900' },
  checkLabel: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '700' },
  reviewSection: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg },
  reviewHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.xs },
  reviewTitle: { flex: 1, color: colors.ink, fontSize: 21, fontWeight: '800' },
  editSection: { minHeight: 48, justifyContent: 'center' },
  editSectionLabel: { color: colors.primaryDark, fontSize: 14, fontWeight: '800' },
  reviewRow: { gap: 2, paddingVertical: 6 },
  reviewRowLabel: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  reviewRowValue: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  warning: { borderRadius: radii.sm, backgroundColor: colors.warningTint, padding: spacing.md },
  warningText: { color: colors.warning, fontSize: 14, lineHeight: 21 },
  confirmationNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.successTint, padding: spacing.md },
  confirmationDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.success },
  confirmationText: { flex: 1, color: colors.successDark, fontSize: 15, lineHeight: 22 },
  confirmationName: { fontWeight: '900' },
  errorBox: { borderRadius: radii.sm, backgroundColor: colors.errorTint, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.white, padding: spacing.md },
  actionsStack: { flexDirection: 'column' },
  secondaryButton: { minHeight: 54, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  secondaryLabel: { color: colors.primaryDark, fontSize: 16, fontWeight: '800' },
  primaryButton: { minHeight: 54, flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.ink, paddingHorizontal: spacing.md },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryLabel: { color: colors.white, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
});
