import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { ensureAndroidUsbConnection } from './checkAndroidExpoGo.mjs';

const apiPort = Number(process.env.SERVER_PORT || 4000);
const isWindows = process.platform === 'win32';
const services = [
  {
    name: 'API',
    command: isWindows ? 'npm.cmd' : 'npm',
    args: ['run', 'server'],
    url: `http://127.0.0.1:${apiPort}/health`,
    validate: (body) => JSON.parse(body).ok === true,
  },
  {
    name: 'Expo/Metro',
    command: isWindows ? 'npx.cmd' : 'npx',
    args: ['expo', 'start'],
    url: 'http://127.0.0.1:8081/status',
    validate: (body) => body.includes('packager-status:running'),
  },
];

async function isHealthy(service) {
  try {
    const response = await fetch(service.url, { signal: AbortSignal.timeout(2_000) });
    return response.ok && service.validate(await response.text());
  } catch {
    return false;
  }
}

function start(service) {
  console.log(`Starting Alaga ${service.name}...`);
  service.child = spawn(service.command, service.args, {
    shell: isWindows,
    stdio: 'inherit',
    windowsHide: true,
  });
  service.child.once('exit', () => {
    service.child = undefined;
  });
}

async function ensureService(service) {
  if (await isHealthy(service)) {
    return;
  }

  if (!service.child) {
    start(service);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(500);
    if (await isHealthy(service)) {
      return;
    }
  }

  throw new Error(`${service.name} did not become healthy at ${service.url}`);
}

let maintaining = false;
let firstRun = true;
let lastAndroidMessage = '';

async function maintain() {
  if (maintaining) {
    return;
  }

  maintaining = true;
  try {
    for (const service of services) {
      await ensureService(service);
    }

    const android = await ensureAndroidUsbConnection({ openExpoGo: firstRun });
    firstRun = false;
    if (android.message !== lastAndroidMessage) {
      console[android.ok ? 'log' : 'error'](android.message);
      lastAndroidMessage = android.message;
    }
  } catch (error) {
    console.error(`Alaga USB runtime: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    maintaining = false;
  }
}

function stop() {
  for (const service of services) {
    service.child?.kill();
  }
  process.exit();
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

console.log('Alaga USB runtime is active. Keep this terminal open; press Ctrl+C to stop it.');
await maintain();
setInterval(maintain, 5_000);
