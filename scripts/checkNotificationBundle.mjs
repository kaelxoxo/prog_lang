import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundleDirectory = resolve(process.cwd(), 'dist');
const forbiddenTerms = [
  'warnOfExpoGoPushUsage',
  'addPushTokenListener',
  'DevicePushTokenAutoRegistration',
];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return files.flat();
}

const files = await filesBelow(bundleDirectory);
const matches = [];

for (const path of files) {
  const contents = await readFile(path);
  for (const term of forbiddenTerms) {
    if (contents.includes(Buffer.from(term))) {
      matches.push(`${term} in ${path}`);
    }
  }
}

if (matches.length) {
  throw new Error(`Android notification regression detected:\n${matches.join('\n')}`);
}

process.stdout.write('Android bundle contains no forbidden Expo Go push-registration imports.\n');
