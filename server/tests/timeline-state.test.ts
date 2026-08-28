import assert from 'node:assert/strict';
import test from 'node:test';

import { actionableAt } from '../../src/features/today/types';

test('snoozed doses become actionable at the snoozed time', () => {
  assert.equal(actionableAt({
    dueAt: '2026-08-27T08:00:00.000Z',
    snoozedUntil: '2026-08-27T08:30:00.000Z',
    status: 'snoozed',
  }), '2026-08-27T08:30:00.000Z');

  assert.equal(actionableAt({
    dueAt: '2026-08-27T08:00:00.000Z',
    snoozedUntil: null,
    status: 'not_recorded',
  }), '2026-08-27T08:00:00.000Z');
});
