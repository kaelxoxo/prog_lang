import type { Medication } from './types';

const COUNTABLE_UNITS = new Set(['tablet', 'tablets', 'capsule', 'capsules']);

export function normalizeInventoryUnit(unit: string) {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'tablets') return 'tablet';
  if (normalized === 'capsules') return 'capsule';
  return normalized;
}

export function supportsInventory(medication: Pick<Medication, 'doseUnit'>) {
  return COUNTABLE_UNITS.has(medication.doseUnit.trim().toLowerCase());
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekday(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function dosesPerDay(medication: Medication, localDate: string) {
  return medication.schedules.reduce((total, schedule) => {
    if (localDate < schedule.startOn || (schedule.endOn && localDate > schedule.endOn)) return total;
    if (!schedule.weekdays.includes(weekday(localDate))) return total;
    if (schedule.kind !== 'interval') return total + 1;

    const [hours, minutes] = schedule.timeOfDay.slice(0, 5).split(':').map(Number);
    const intervalMinutes = (schedule.intervalHours || 1) * 60;
    const remainingMinutes = 24 * 60 - (hours * 60 + minutes);
    return total + Math.ceil(remainingMinutes / intervalMinutes);
  }, 0);
}

/** Estimates remaining calendar days from the recorded count and the next seven days of the confirmed schedule. */
export function estimateInventoryDaysRemaining(medication: Medication, today: string) {
  const inventory = medication.inventory;
  if (!inventory || inventory.onHandQuantity < 0 || !supportsInventory(medication)) return null;
  if (normalizeInventoryUnit(inventory.unit) !== normalizeInventoryUnit(medication.doseUnit)) return null;

  let weeklyDoseQuantity = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    weeklyDoseQuantity += dosesPerDay(medication, addDays(today, offset)) * medication.doseQuantity;
  }

  if (weeklyDoseQuantity <= 0) return null;
  return Math.floor(inventory.onHandQuantity / (weeklyDoseQuantity / 7));
}
