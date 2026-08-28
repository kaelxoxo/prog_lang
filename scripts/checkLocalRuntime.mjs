import { networkInterfaces } from 'node:os';

import { checkAndroidExpoGo } from './checkAndroidExpoGo.mjs';

const apiPort = Number(process.env.SERVER_PORT || 4000);
const timeoutMs = 2_500;

async function request(url, validate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();

    if (!response.ok || !validate(body)) {
      return { ok: false, reason: `${response.status} ${body}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function isPrivateIpv4(address) {
  return address.startsWith('10.')
    || address.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

const addresses = [...new Set(
  Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal && isPrivateIpv4(entry.address))
    .map((entry) => entry.address),
)];

const healthResponse = (body) => {
  try {
    return JSON.parse(body).ok === true;
  } catch {
    return false;
  }
};

const localApi = await request(`http://127.0.0.1:${apiPort}/health`, healthResponse);
const lanApis = await Promise.all(
  addresses.map(async (address) => ({
    address,
    result: await request(`http://${address}:${apiPort}/health`, healthResponse),
  })),
);
const metro = await request('http://127.0.0.1:8081/status', (body) => body.includes('packager-status:running'));
const android = await checkAndroidExpoGo();

if (localApi.ok) {
  console.log('API loopback health: pass');
} else {
  console.error(`API loopback health: FAIL (${localApi.reason})`);
}

const reachableLan = lanApis.find(({ result }) => result.ok);
if (reachableLan) {
  console.log(`API LAN health: pass (http://${reachableLan.address}:${apiPort}/health)`);
} else {
  const detail = addresses.length
    ? lanApis.map(({ address, result }) => `${address}: ${result.reason}`).join('; ')
    : 'no private LAN IPv4 address found';
  console.error(`API LAN health: FAIL (${detail})`);
}

if (metro.ok) {
  console.log('Expo/Metro health: pass');
} else {
  console.error(`Expo/Metro health: FAIL (${metro.reason})`);
}

if (android.ok) {
  console.log(android.message);
} else {
  console.error(android.message);
}

if (!localApi.ok || !reachableLan || !metro.ok || !android.ok) {
  console.error('For a USB-connected Android phone, run `npm.cmd run dev:usb`. Otherwise start the API and Expo, then run this check again.');
  process.exitCode = 1;
}
