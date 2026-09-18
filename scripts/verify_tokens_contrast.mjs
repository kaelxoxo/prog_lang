import fs from 'node:fs';
import path from 'node:path';

// 1. Math utilities for WCAG relative luminance & contrast ratio
function parseHex(hex) {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return [r, g, b];
  }
  throw new Error(`Unsupported hex length: ${hex}`);
}

function relativeLuminance(r, g, b) {
  const a = [r, g, b].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function calculateContrast(hex1, hex2) {
  const [r1, g1, b1] = parseHex(hex1);
  const [r2, g2, b2] = parseHex(hex2);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// 2. Load tokens directly from source
const tokensFilePath = path.resolve(process.cwd(), 'src/theme/tokens.ts');
const tokensRaw = fs.readFileSync(tokensFilePath, 'utf8');

function extractObjectBlock(source, objectName) {
  const regex = new RegExp(`export const ${objectName}[^=]*=\\s*({[\\s\\S]*?\\})\\s*(?:as const)?;`);
  const match = source.match(regex);
  if (!match) {
    throw new Error(`Could not find ${objectName} in tokens.ts`);
  }
  // Convert JS object literal string into evaluatable JS object
  const cleaned = match[1]
    .replace(/\/\/.*/g, '') // remove line comments
    .replace(/\s+/g, ' ');
  return Function(`"use strict"; return (${cleaned});`)();
}

const lightColors = extractObjectBlock(tokensRaw, 'lightColors');
const darkColors = extractObjectBlock(tokensRaw, 'darkColors');
const spacing = extractObjectBlock(tokensRaw, 'spacing');
const radii = extractObjectBlock(tokensRaw, 'radii');

console.log('================================================================');
console.log('EMPIRICAL VERIFICATION: WARM BOTANICAL DESIGN TOKENS & CONTRAST');
console.log('================================================================\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failureDetails = [];

function assertContrast(name, foreground, background, minRatio, level = 'AA') {
  totalChecks++;
  const ratio = calculateContrast(foreground, background);
  const passed = ratio >= minRatio;
  if (passed) {
    passedChecks++;
    console.log(`[PASS] ${name}: ${ratio.toFixed(2)}:1 (Req >= ${minRatio}:1 [${level}])`);
  } else {
    failedChecks++;
    const msg = `[FAIL] ${name}: ${ratio.toFixed(2)}:1 (FAILED req >= ${minRatio}:1 [${level}])`;
    console.error(msg);
    failureDetails.push(msg);
  }
  return { name, foreground, background, ratio, passed, minRatio, level };
}

console.log('--- 1. LIGHT MODE CONTRAST CHECKS ---');
const lightResults = [
  assertContrast('light.ink on light.canvas', lightColors.ink, lightColors.canvas, 7.0, 'AAA'),
  assertContrast('light.ink on light.white', lightColors.ink, lightColors.white, 7.0, 'AAA'),
  assertContrast('light.ink on light.surfaceElevated', lightColors.ink, lightColors.surfaceElevated, 7.0, 'AAA'),
  assertContrast('light.successDark on light.canvas', lightColors.successDark, lightColors.canvas, 4.5, 'AA'),
  assertContrast('light.successDark on light.white', lightColors.successDark, lightColors.white, 4.5, 'AA'),
  assertContrast('light.primary on light.white', lightColors.primary, lightColors.white, 4.5, 'AA'),
  assertContrast('light.primary on light.canvas', lightColors.primary, lightColors.canvas, 4.5, 'AA'),
  assertContrast('light.primary on light.surfaceElevated', lightColors.primary, lightColors.surfaceElevated, 4.5, 'AA'),
  assertContrast('light.muted on light.white', lightColors.muted, lightColors.white, 4.5, 'AA'),
  assertContrast('light.muted on light.canvas', lightColors.muted, lightColors.canvas, 4.5, 'AA'),
];

console.log('\n--- 2. DARK MODE CONTRAST CHECKS ---');
const darkResults = [
  assertContrast('dark.ink on dark.canvas', darkColors.ink, darkColors.canvas, 7.0, 'AAA'),
  assertContrast('dark.ink on dark.white', darkColors.ink, darkColors.white, 7.0, 'AAA'),
  assertContrast('dark.ink on dark.surfaceElevated', darkColors.ink, darkColors.surfaceElevated, 7.0, 'AAA'),
  assertContrast('dark.successDark on dark.canvas', darkColors.successDark, darkColors.canvas, 4.5, 'AA'),
  assertContrast('dark.successDark on dark.white', darkColors.successDark, darkColors.white, 4.5, 'AA'),
  assertContrast('dark.primary on dark.canvas', darkColors.primary, darkColors.canvas, 4.5, 'AA'),
  assertContrast('dark.primary on dark.white', darkColors.primary, darkColors.white, 4.5, 'AA'),
  assertContrast('dark.muted on dark.canvas', darkColors.muted, darkColors.canvas, 4.5, 'AA'),
];

console.log('\n--- 3. TOKEN KEY PARITY (lightColors vs darkColors) ---');
totalChecks++;
const lightKeys = Object.keys(lightColors).sort();
const darkKeys = Object.keys(darkColors).sort();

const missingInDark = lightKeys.filter((k) => !darkKeys.includes(k));
const missingInLight = darkKeys.filter((k) => !lightKeys.includes(k));

if (missingInDark.length === 0 && missingInLight.length === 0) {
  passedChecks++;
  console.log(`[PASS] Token Key Parity: Perfect match (${lightKeys.length} keys in both lightColors and darkColors).`);
} else {
  failedChecks++;
  const msg = `[FAIL] Token Key Parity Mismatch! Missing in dark: ${missingInDark.join(', ') || 'none'}, Missing in light: ${missingInLight.join(', ') || 'none'}`;
  console.error(msg);
  failureDetails.push(msg);
}

console.log('\n--- 4. STRUCTURAL SCALE INTEGRITY ---');
totalChecks++;
const requiredRadii = ['xs', 'sm', 'md', 'squircle', 'lg', 'xl', 'full'];
const missingRadii = requiredRadii.filter((r) => radii[r] === undefined);
if (missingRadii.length === 0) {
  passedChecks++;
  console.log(`[PASS] Radii Scale: All ${requiredRadii.length} tokens defined, including Emil Kowalski 'squircle' (18dp).`);
} else {
  failedChecks++;
  const msg = `[FAIL] Radii tokens missing: ${missingRadii.join(', ')}`;
  console.error(msg);
  failureDetails.push(msg);
}

totalChecks++;
const requiredSpacing = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'];
const missingSpacing = requiredSpacing.filter((s) => spacing[s] === undefined);
if (missingSpacing.length === 0) {
  passedChecks++;
  console.log(`[PASS] Spacing Scale: All ${requiredSpacing.length} tokens defined.`);
} else {
  failedChecks++;
  const msg = `[FAIL] Spacing tokens missing: ${missingSpacing.join(', ')}`;
  console.error(msg);
  failureDetails.push(msg);
}

console.log('\n--- 5. REPOSITORY-WIDE TOKEN USAGE & REFERENCE INTEGRITY ---');
const srcDir = path.resolve(process.cwd(), 'src');
const allColorsKeys = new Set(lightKeys);
const allRadiiKeys = new Set(Object.keys(radii));
const allSpacingKeys = new Set(Object.keys(spacing));

let brokenTokenReferences = 0;
const referenceIssues = [];

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const relPath = path.relative(process.cwd(), fullPath);

      // Check colors.<prop>
      const colorMatches = content.matchAll(/\bcolors\.([a-zA-Z0-9_]+)\b/g);
      for (const m of colorMatches) {
        const prop = m[1];
        if (!allColorsKeys.has(prop)) {
          brokenTokenReferences++;
          referenceIssues.push(`${relPath}: Unknown color token 'colors.${prop}'`);
        }
      }

      // Check radii.<prop>
      const radiiMatches = content.matchAll(/\bradii\.([a-zA-Z0-9_]+)\b/g);
      for (const m of radiiMatches) {
        const prop = m[1];
        if (!allRadiiKeys.has(prop)) {
          brokenTokenReferences++;
          referenceIssues.push(`${relPath}: Unknown radius token 'radii.${prop}'`);
        }
      }

      // Check spacing.<prop>
      const spacingMatches = content.matchAll(/\bspacing\.([a-zA-Z0-9_]+)\b/g);
      for (const m of spacingMatches) {
        const prop = m[1];
        if (!allSpacingKeys.has(prop)) {
          brokenTokenReferences++;
          referenceIssues.push(`${relPath}: Unknown spacing token 'spacing.${prop}'`);
        }
      }
    }
  }
}

scanDirectory(srcDir);

totalChecks++;
if (brokenTokenReferences === 0) {
  passedChecks++;
  console.log(`[PASS] Token Reference Integrity: Scanned all files in src/. 0 broken token references found!`);
} else {
  failedChecks++;
  const msg = `[FAIL] Found ${brokenTokenReferences} broken token reference(s):\n  ` + referenceIssues.join('\n  ');
  console.error(msg);
  failureDetails.push(msg);
}

console.log('\n================================================================');
console.log(`VERIFICATION SUMMARY: ${passedChecks}/${totalChecks} PASSED (${((passedChecks / totalChecks) * 100).toFixed(1)}%)`);
if (failedChecks === 0) {
  console.log('VERDICT: ALL BOTANICAL TOKEN INVARIANTS SATISFIED (APPROVED)');
} else {
  console.log(`VERDICT: ${failedChecks} INVARIANT VIOLATION(S) DETECTED (REQUEST_CHANGES)`);
}
console.log('================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
}
