import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const warningText = 'Cannot connect to Expo CLI';
const launcherText = ['recently opened', 'scan qr code', 'enter url manually'];
const requiredPorts = [4000, 8081];

export function parseAdbDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/, 2))
    .filter(([serial, state]) => serial && state)
    .map(([serial, state]) => ({ serial, state }));
}

export function evaluateExpoGoUi(xml) {
  if (xml.includes(warningText)) {
    return 'Expo Go shows “Cannot connect to Expo CLI”. Restart Expo, reapply the USB reverse routes, and reopen the app.';
  }

  if (launcherText.some((text) => xml.toLowerCase().includes(text))) {
    return 'Expo Go is running, but Alaga is not open. Open the local Alaga project and run the check again.';
  }

  if (!xml.includes('package="host.exp.exponent"')) {
    return 'Expo Go is not foreground on the connected Android device, so the live app could not be validated.';
  }

  return null;
}

function resolveAdb() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined,
  ].filter(Boolean);

  const installed = sdkRoots
    .map((root) => join(root, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'))
    .find(existsSync);

  return installed || 'adb';
}

async function adb(adbPath, args) {
  const androidUserHome = process.env.ANDROID_USER_HOME
    || (process.env.USERPROFILE ? join(process.env.USERPROFILE, '.android') : undefined);

  return execFileAsync(adbPath, args, {
    encoding: 'utf8',
    env: androidUserHome ? { ...process.env, ANDROID_USER_HOME: androidUserHome } : process.env,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 10_000,
    windowsHide: true,
  });
}

function selectTargetDevices(allDevices) {
  const targetSerial = process.env.ANDROID_SERIAL
    || (allDevices.length > 1 ? allDevices.find((d) => d.serial.startsWith('emulator-'))?.serial : undefined);
  return targetSerial ? allDevices.filter(({ serial }) => serial === targetSerial) : allDevices;
}

export async function ensureAndroidUsbConnection({
  adbPath = resolveAdb(),
  openExpoGo = false,
  runAdb = adb,
} = {}) {
  let devicesOutput;

  try {
    ({ stdout: devicesOutput } = await runAdb(adbPath, ['devices']));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ok: true, message: 'Android USB recovery: skipped (ADB not installed or not on PATH)' };
    }
    return { ok: false, message: `Android USB recovery: FAIL (${error.message})` };
  }

  const allDevices = parseAdbDevices(devicesOutput);
  const devices = selectTargetDevices(allDevices);
  if (devices.length === 0) {
    return { ok: true, message: 'Android USB recovery: waiting for a connected device' };
  }

  const unavailable = devices.filter(({ state }) => state !== 'device');
  if (unavailable.length > 0) {
    const detail = unavailable.map(({ serial, state }) => `${serial}: ${state}`).join(', ');
    return { ok: false, message: `Android USB recovery: FAIL (${detail})` };
  }

  let restoredRoutes = 0;

  try {
    for (const { serial } of devices) {
      const prefix = ['-s', serial];
      const { stdout: reverseOutput } = await runAdb(adbPath, [...prefix, 'reverse', '--list']);
      const missingPorts = requiredPorts.filter((port) => !reverseOutput.includes(`tcp:${port} tcp:${port}`));

      for (const port of missingPorts) {
        await runAdb(adbPath, [...prefix, 'reverse', `tcp:${port}`, `tcp:${port}`]);
        restoredRoutes += 1;
      }

      if (openExpoGo || missingPorts.length > 0) {
        await runAdb(adbPath, [
          ...prefix,
          'shell',
          'am',
          'start',
          '-a',
          'android.intent.action.VIEW',
          '-d',
          'exp://127.0.0.1:8081',
          'host.exp.exponent',
        ]);
      }
    }
  } catch (error) {
    return { ok: false, message: `Android USB recovery: FAIL (${error.message})` };
  }

  const routeMessage = restoredRoutes > 0 ? `; restored ${restoredRoutes} USB route${restoredRoutes === 1 ? '' : 's'}` : '';
  return {
    ok: true,
    message: `Android USB recovery: ready (${devices.length} authorized device${devices.length === 1 ? '' : 's'}${routeMessage})`,
  };
}

export async function checkAndroidExpoGo() {
  const adbPath = resolveAdb();
  let devicesOutput;

  try {
    ({ stdout: devicesOutput } = await adb(adbPath, ['devices']));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ok: true, message: 'Android device health: skipped (ADB not installed or not on PATH)' };
    }
    return { ok: false, message: `Android device health: FAIL (${error.message})` };
  }

  const allDevices = parseAdbDevices(devicesOutput);
  const devices = selectTargetDevices(allDevices);
  if (devices.length === 0) {
    return { ok: true, message: 'Android device health: skipped (no connected device)' };
  }

  const unavailable = devices.filter(({ state }) => state !== 'device');
  if (unavailable.length > 0) {
    const detail = unavailable.map(({ serial, state }) => `${serial}: ${state}`).join(', ');
    return { ok: false, message: `Android device health: FAIL (${detail})` };
  }

  for (const { serial } of devices) {
    const prefix = ['-s', serial];
    const dumpPath = '/sdcard/alaga-runtime-check.xml';

    try {
      const { stdout: reverseOutput } = await adb(adbPath, [...prefix, 'reverse', '--list']);
      const missingPorts = requiredPorts.filter((port) => !reverseOutput.includes(`tcp:${port} tcp:${port}`));
      if (missingPorts.length > 0) {
        return {
          ok: false,
          message: `Android device health: FAIL (${serial} is missing adb reverse for ${missingPorts.map((port) => `tcp:${port}`).join(', ')})`,
        };
      }

      await adb(adbPath, [...prefix, 'shell', 'uiautomator', 'dump', dumpPath]);
      const { stdout: xml } = await adb(adbPath, [...prefix, 'exec-out', 'cat', dumpPath]);
      const uiProblem = evaluateExpoGoUi(xml);
      if (uiProblem) {
        return { ok: false, message: `Android device health: FAIL (${serial}: ${uiProblem})` };
      }
    } catch (error) {
      return { ok: false, message: `Android device health: FAIL (${serial}: ${error.message})` };
    } finally {
      try {
        await adb(adbPath, [...prefix, 'shell', 'rm', '-f', dumpPath]);
      } catch {
        // The check result matters more than cleanup of this disposable device-side dump.
      }
    }
  }

  return { ok: true, message: `Android device health: pass (${devices.length} authorized device${devices.length === 1 ? '' : 's'})` };
}
