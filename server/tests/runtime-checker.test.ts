import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureAndroidUsbConnection,
  evaluateExpoGoUi,
  parseAdbDevices,
} from '../../scripts/checkAndroidExpoGo.mjs';

test('runtime checker rejects the stale Expo CLI warning shown on Android', () => {
  const xml = '<node package="host.exp.exponent" text="Cannot connect to Expo CLI. URL: 127.0.0.1:8081" />';

  assert.match(evaluateExpoGoUi(xml) || '', /Cannot connect to Expo CLI/);
});

test('runtime checker accepts a foreground Expo Go screen without the warning', () => {
  const xml = '<node package="host.exp.exponent" text="Alaga" />';

  assert.equal(evaluateExpoGoUi(xml), null);
});

test('runtime checker parses authorized and unauthorized adb devices', () => {
  const devices = parseAdbDevices('List of devices attached\n9903936d\tdevice\nother\tunauthorized\n\n');

  assert.deepEqual(devices, [
    { serial: '9903936d', state: 'device' },
    { serial: 'other', state: 'unauthorized' },
  ]);
});

test('USB recovery restores both Alaga routes and reopens Expo Go', async () => {
  const calls: string[][] = [];
  const runAdb = async (_adbPath: string, args: string[]) => {
    calls.push(args);

    if (args[0] === 'devices') {
      return { stdout: 'List of devices attached\n9903936d\tdevice\n\n', stderr: '' };
    }

    return { stdout: '', stderr: '' };
  };

  const result = await ensureAndroidUsbConnection({ adbPath: 'adb', runAdb });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['devices'],
    ['-s', '9903936d', 'reverse', '--list'],
    ['-s', '9903936d', 'reverse', 'tcp:4000', 'tcp:4000'],
    ['-s', '9903936d', 'reverse', 'tcp:8081', 'tcp:8081'],
    ['-s', '9903936d', 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:8081', 'host.exp.exponent'],
  ]);
});
