// Renders Bantay (src/features/assistant/BantayMascotSvg.tsx) into the sprite sheets in assets/bantay/
// and the app icon, adaptive icon, splash image and favicon in assets/.
// Run: npm run mascot:sprites (preloads scripts/bantaySvgShimHooks.mjs so react-native-svg renders as plain SVG).
import fs from 'node:fs/promises';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';

import {
  BantayMascotSvg,
  bantayPalette,
  type BantayExpression,
  type BantayPose,
  type BantayVariant,
} from '../src/features/assistant/BantayMascotSvg';

const ASSETS = path.join(process.cwd(), 'assets');

const PAPER = '#F6F1E7';
const PAPER_SHADE = '#EFE8DA';
const GUTTER = 2;
const COLUMNS = 10;
const FRAME_SIZE: Record<BantayVariant, number> = { bust: 224, full: 288 };

type Key = Partial<BantayPose> & { ms: number };
type AnimationName = 'idle' | 'attention' | 'thinking' | 'celebrate';
const EXPRESSION: Record<AnimationName, BantayExpression> = {
  idle: 'idle',
  attention: 'attention',
  thinking: 'thinking',
  celebrate: 'celebration',
};

const blink = (rest: Partial<BantayPose> = {}): Key[] => [
  { ...rest, eyes: 'half', ms: 50 },
  { ...rest, eyes: 'closed', ms: 90 },
  { ...rest, eyes: 'half', ms: 50 },
];

/** One breath in and out, 2.4 s. */
const BREATH = [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25];

function animations(variant: BantayVariant): Record<AnimationName, Key[]> {
  const full = variant === 'full';
  // The bust has no tail; its ears flick around `ears` instead.
  const wag = (swing: number, ms: number, rest: Partial<BantayPose> = {}, ears = 0): Key[] =>
    [1, -1, 1, -1, 1, -1].map((side) =>
      full
        ? { ...rest, tail: side * swing, ms }
        : { ...rest, earLeft: ears + (side > 0 ? swing * 0.5 : 0), earRight: ears + (side < 0 ? swing * 0.5 : 0), ms },
    );

  return {
    // Slow breathing, a blink every 4.8 s, one tail wag (ear flick on the bust) per loop.
    idle: [
      ...BREATH.slice(0, 7).map((breath) => ({ breath, ms: 300 })),
      ...blink({ breath: 0.25 }),
      { breath: 0.25, ms: 110 },
      ...BREATH.slice(0, 5).map((breath) => ({ breath, ms: 300 })),
      ...(full ? wag(16, 110, { breath: 0.75 }) : [{ breath: 0.75, earLeft: 8, ms: 120 }, { breath: 0.75, ms: 120 }]),
      { breath: 0.5, ms: 300 },
      { breath: 0.25, ms: 300 },
    ],
    // Ears up, head tilted toward the list; a listening twitch and a lean.
    attention: [
      { ms: 900 },
      { earRight: 20, ms: 90 },
      { ms: 90 },
      { breath: 0.5, ms: 600 },
      ...blink({ breath: 0.5 }),
      { breath: 0.5, ms: 300 },
      { headTilt: 11, lookX: 1, earLeft: 18, earRight: 18, ms: 700 },
      ...(full ? [{ headTilt: 11, lookX: 1, earLeft: 18, earRight: 18, tail: 10, ms: 120 }, { headTilt: 11, lookX: 1, earLeft: 18, earRight: 18, tail: -6, ms: 120 }] : []),
      { headTilt: 9.5, lookX: 0.85, earLeft: 16, earRight: 16, ms: 120 },
      { breath: 0.25, ms: 500 },
    ],
    // Paw at the chin, eyes up, head tilted; glances across and taps the chin.
    thinking: [
      { ms: 800 },
      { lookX: 0.6, lookY: -1, headTilt: -8.5, ms: 700 },
      { lookX: 0.6, lookY: -1, headTilt: -8.5, pawRaise: 0.9, ms: 140 },
      { lookX: 0.6, lookY: -1, headTilt: -8.5, ms: 140 },
      { lookX: 0.6, lookY: -1, headTilt: -8.5, pawRaise: 0.9, ms: 140 },
      { lookX: 0.6, lookY: -1, headTilt: -8.5, ms: 400 },
      ...blink({ headTilt: -8.5 }),
      { breath: 0.5, ms: 700 },
      { breath: 0.25, earRight: -2, ms: 400 },
    ],
    // Small hop with a fast tail wag, then a happy, closed-eye rest.
    celebrate: [
      { ms: 400 },
      { squash: 0.8, ms: 90 },
      { hop: 3, squash: -0.6, ms: 70 },
      { hop: 7, squash: -0.3, ms: 80 },
      { hop: 8, ms: 90 },
      { hop: 5, ms: 70 },
      { squash: 0.7, ms: 80 },
      ...wag(22, 70, {}, 10),
      { breath: 0.5, ms: 500 },
      { breath: 1, ms: 500 },
      { breath: 0.5, ms: 500 },
      ...wag(22, 70, { breath: 0.25 }, 10),
      { ms: 600 },
    ],
  };
}

function svgMarkup(variant: BantayVariant, size: number, pose: Partial<BantayPose>, expression: BantayExpression = 'idle') {
  return renderToStaticMarkup(<BantayMascotSvg expression={expression} pose={pose} size={size} variant={variant} />);
}

const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();

async function buildSheet(variant: BantayVariant) {
  const size = FRAME_SIZE[variant];
  const cells = new Map<string, number>();
  const frames: string[] = [];
  const meta: Record<string, { frames: { col: number; row: number; duration: number }[] }> = {};

  for (const [name, keys] of Object.entries(animations(variant)) as [AnimationName, Key[]][]) {
    meta[name] = {
      frames: keys.map(({ ms, ...pose }) => {
        const svg = svgMarkup(variant, size, pose, EXPRESSION[name]);
        let cell = cells.get(svg);
        if (cell === undefined) {
          cell = frames.push(svg) - 1;
          cells.set(svg, cell);
        }
        return { col: cell % COLUMNS, row: Math.floor(cell / COLUMNS), duration: ms };
      }),
    };
  }

  const columns = Math.min(COLUMNS, frames.length);
  const rows = Math.ceil(frames.length / COLUMNS);
  const width = columns * size + (columns - 1) * GUTTER;
  const height = rows * size + (rows - 1) * GUTTER;
  const rendered = await Promise.all(frames.map(png));
  const sheet = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(rendered.map((input, cell) => ({
      input,
      left: (cell % COLUMNS) * (size + GUTTER),
      top: Math.floor(cell / COLUMNS) * (size + GUTTER),
    })))
    .png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
    .toBuffer();

  await fs.writeFile(path.join(ASSETS, 'bantay', `${variant}.png`), sheet);
  await fs.writeFile(
    path.join(ASSETS, 'bantay', `${variant}.json`),
    `${JSON.stringify({ image: `${variant}.png`, frameWidth: size, frameHeight: size, gutter: GUTTER, columns, rows, width, height, animations: meta }, null, 2)}\n`,
  );
  console.log(`assets/bantay/${variant}.png: ${frames.length} frames, ${width}×${height}, ${(sheet.length / 1024).toFixed(0)} KB`);
}

/** Bust at `size`, placed at (left, top) on a transparent 1024 canvas. */
async function bustOnCanvas(size: number, left: number, top: number, svg = svgMarkup('bust', size, {})) {
  return sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await png(svg), left, top }])
    .png()
    .toBuffer();
}

/** Android tints a monochrome icon by alpha: fills stay opaque, ink lines and eyes become cut-outs. */
async function monochrome(size: number, left: number, top: number) {
  const dark = new Set<string>([bantayPalette.ink, bantayPalette.eye, bantayPalette.brow, bantayPalette.mouth, bantayPalette.capCross, bantayPalette.stethoscope]);
  let svg = svgMarkup('bust', size, {});
  for (const colour of Object.values(bantayPalette)) svg = svg.split(colour).join(dark.has(colour) ? '#000000' : '#FFFFFF');
  const { data, info } = await sharp(await bustOnCanvas(size, left, top, svg)).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const luminance = data[i] / 255;
    data[i + 3] = Math.round(data[i + 3] * luminance);
    data[i] = data[i + 1] = data[i + 2] = 255;
  }
  return sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
}

async function buildIcons() {
  const write = (file: string, data: Buffer) => fs.writeFile(path.join(ASSETS, file), data);
  const paper = (size: number) => sharp({ create: { width: size, height: size, channels: 4, background: PAPER } });

  // iOS / store icon: the bust rises from the bottom edge of a paper square.
  await write('icon.png', await paper(1024).composite([{ input: await bustOnCanvas(820, 102, 204) }]).png({ compressionLevel: 9 }).toBuffer());

  // Adaptive icon: art inside the central 66% (safe zone 174..850); the launcher mask crops the shoulders.
  const safe = Math.round(1024 * 0.66);
  const inset = Math.round((1024 - safe) / 2);
  await write('android-icon-foreground.png', await bustOnCanvas(safe, inset, inset));
  await write('android-icon-background.png', await paper(1024).png().toBuffer());
  await write('android-icon-monochrome.png', await monochrome(safe, inset, inset));

  // Splash and favicon: the bust in a shaded paper medallion.
  const circle = (fill: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><circle cx="512" cy="512" r="500" fill="${fill}"/></svg>`);
  const clipped = await sharp(await bustOnCanvas(860, 82, 152)).composite([{ input: circle('#000'), blend: 'dest-in' }]).png().toBuffer();
  const medallion = await sharp(circle(PAPER_SHADE)).composite([{ input: clipped }]).png({ compressionLevel: 9 }).toBuffer();
  await write('splash-icon.png', medallion);
  await write('favicon.png', await sharp(medallion).resize(48, 48).png().toBuffer());
  console.log('assets/: icon.png, android-icon-{foreground,background,monochrome}.png, splash-icon.png, favicon.png');
}

async function main() {
  await fs.mkdir(path.join(ASSETS, 'bantay'), { recursive: true });
  await buildSheet('bust');
  await buildSheet('full');
  await buildIcons();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
