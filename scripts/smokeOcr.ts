import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { recognizeMedicationImage } from '../server/src/ocr';

async function main() {
  const image = await readFile(resolve(process.cwd(), 'assets', 'icon.png'));
  const draft = await recognizeMedicationImage(image, 'label_photo');

  process.stdout.write(
    `Local OCR worker completed on the non-sensitive app icon (${draft.rawText.length} characters recognized).\n`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
