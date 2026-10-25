import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { createAppServer } from '../src/app';
import { databasePool } from '../src/database';

const server = createAppServer(databasePool);
let baseUrl = '';

type ApiResult<T> = { status: number; body: T };
type Inventory = { onHandQuantity: number; unit: string; lastCountedAt: string };
type Dose = { id: string; medicationName: string };

function manilaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function api<T>(
  path: string,
  options: { body?: unknown; method?: 'GET' | 'POST'; token?: string } = {},
): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: (await response.json()) as T };
}

before(async () => {
  const listening = Promise.withResolvers<void>();
  server.once('error', listening.reject);
  server.listen(0, '127.0.0.1', listening.resolve);
  await listening.promise;
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  const closed = Promise.withResolvers<void>();
  server.close(() => closed.resolve());
  await closed.promise;
  await databasePool.end();
});

test('Medicine stock counts, refills, taken-dose deductions, and correction reversals', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const careDate = manilaDate();
  const owner = await api<{ token: string }>('/auth/register', {
    method: 'POST',
    body: { displayName: 'Stock Owner', email: `stock-owner-${suffix}@example.test`, password: 'local-test-password-123' },
  });
  assert.equal(owner.status, 201);
  const token = owner.body.token;
  const patient = await api<{ patient: { id: string } }>('/patients', {
    method: 'POST',
    token,
    body: { displayName: 'Stock Patient' },
  });
  assert.equal(patient.status, 201);
  const patientId = patient.body.patient.id;

  async function addMedicine(displayName: string, doseUnit: string) {
    const saved = await api<{ medicationId: string }>(`/patients/${patientId}/medications`, {
      method: 'POST',
      token,
      body: {
        displayName,
        doseQuantity: 1,
        doseUnit,
        schedules: [{ kind: 'exact', timeOfDay: '06:00', weekdays: [0, 1, 2, 3, 4, 5, 6], startOn: careDate }],
      },
    });
    assert.equal(saved.status, 201);
    const today = await api<{ timeline: Dose[] }>(`/patients/${patientId}/today?date=${careDate}`, { token });
    const dose = today.body.timeline.find((entry) => entry.medicationName === displayName);
    assert.ok(dose);
    return { medicationId: saved.body.medicationId, doseId: dose.id };
  }

  function changeStock(medicationId: string, kind: 'count' | 'refill', quantity: number, clientActionId: string = randomUUID()) {
    return api<{ inventory: Inventory; error?: string }>(`/patients/${patientId}/medications/${medicationId}/inventory`, {
      method: 'POST',
      token,
      body: { kind, quantity, clientActionId },
    });
  }

  async function recordDose(doseId: string, kind: 'taken' | 'skipped', correctsEventId?: string) {
    const result = await api<{ event: { id: string } }>(`/patients/${patientId}/doses/${doseId}/events`, {
      method: 'POST',
      token,
      body: {
        kind,
        clientActionId: randomUUID(),
        ...(correctsEventId ? { correctsEventId, reason: 'Recorded on the wrong dose' } : {}),
      },
    });
    assert.equal(result.status, 201);
    return result.body.event.id;
  }

  async function onHand(medicationId: string) {
    const list = await api<{ medications: Array<{ id: string; inventory: Inventory | null }> }>(
      `/patients/${patientId}/medications`,
      { token },
    );
    return list.body.medications.find((medication) => medication.id === medicationId)?.inventory?.onHandQuantity ?? null;
  }

  const syrup = await addMedicine('Stock Syrup', 'mL');
  assert.equal((await changeStock(syrup.medicationId, 'count', 100)).status, 400, 'liquid doses cannot be counted');

  const tracked = await addMedicine('Stock Tablet', 'tablets');
  assert.equal((await changeStock(tracked.medicationId, 'refill', 10)).status, 400, 'a refill needs a prior count');

  const countAction = randomUUID();
  assert.equal((await changeStock(tracked.medicationId, 'count', 30, countAction)).body.inventory.onHandQuantity, 30);
  const replay = await changeStock(tracked.medicationId, 'count', 30, countAction);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.inventory.onHandQuantity, 30);
  assert.equal((await changeStock(tracked.medicationId, 'count', 31, countAction)).status, 409, 'a reused action ID with different input conflicts');

  const refillAction = randomUUID();
  assert.equal((await changeStock(tracked.medicationId, 'refill', 10, refillAction)).body.inventory.onHandQuantity, 40);
  assert.equal((await changeStock(tracked.medicationId, 'refill', 10, refillAction)).body.inventory.onHandQuantity, 40, 'a retried refill is applied once');

  const taken = await recordDose(tracked.doseId, 'taken');
  assert.equal(await onHand(tracked.medicationId), 39);
  const skipped = await recordDose(tracked.doseId, 'skipped', taken);
  assert.equal(await onHand(tracked.medicationId), 40, 'correcting a deducted dose restores it');
  await recordDose(tracked.doseId, 'taken', skipped);
  assert.equal(await onHand(tracked.medicationId), 39, 'correcting back to taken deducts again');

  const precount = await addMedicine('Precount Tablet', 'tablet');
  const precountTaken = await recordDose(precount.doseId, 'taken');
  await changeStock(precount.medicationId, 'count', 30);
  await recordDose(precount.doseId, 'skipped', precountTaken);
  assert.equal(await onHand(precount.medicationId), 30, 'a dose recorded before tracking began is never credited back');

  const recounted = await addMedicine('Recounted Tablet', 'tablet');
  await changeStock(recounted.medicationId, 'count', 30);
  const recountedTaken = await recordDose(recounted.doseId, 'taken');
  await changeStock(recounted.medicationId, 'count', 29);
  await recordDose(recounted.doseId, 'skipped', recountedTaken);
  assert.equal(await onHand(recounted.medicationId), 29, 'a later physical count already reflects the corrected dose');
});
