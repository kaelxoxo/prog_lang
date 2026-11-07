import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import sharp from 'sharp';

const ROOT_DIR = path.resolve(__dirname, '../..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const ANIMATIONS = ['idle', 'attention', 'thinking', 'celebrate'] as const;

type SpriteSheet = {
  image: string;
  frameWidth: number;
  frameHeight: number;
  gutter: number;
  width: number;
  height: number;
  animations: Record<string, { frames: { col: number; row: number; duration: number }[] }>;
};

for (const variant of ['bust', 'full'] as const) {
  test(`Bantay ${variant} sprite sheet: every animation plays real frames that lie inside the sheet`, async () => {
    const sheet = JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, 'bantay', `${variant}.json`), 'utf8')) as SpriteSheet;
    const imagePath = path.join(ASSETS_DIR, 'bantay', sheet.image);
    const meta = await sharp(imagePath).metadata();

    assert.equal(meta.width, sheet.width, 'JSON width matches the PNG');
    assert.equal(meta.height, sheet.height, 'JSON height matches the PNG');
    assert.ok(sheet.width <= 4096 && sheet.height <= 4096, 'sheet fits mobile texture limits');
    assert.ok(fs.statSync(imagePath).size < 2 * 1024 * 1024, 'sheet stays under 2 MB');
    assert.ok(meta.hasAlpha, 'sheet is transparent so Bantay sits on any paper');

    for (const name of ANIMATIONS) {
      const frames = sheet.animations[name]?.frames ?? [];
      assert.ok(frames.length >= 1, `${name} has at least one frame`);
      for (const frame of frames) {
        assert.ok(Number.isFinite(frame.duration) && frame.duration > 0, `${name} frame durations are positive`);
        const x = frame.col * (sheet.frameWidth + sheet.gutter);
        const y = frame.row * (sheet.frameHeight + sheet.gutter);
        assert.ok(frame.col >= 0 && frame.row >= 0, `${name} cell indices are non-negative`);
        assert.ok(x + sheet.frameWidth <= sheet.width && y + sheet.frameHeight <= sheet.height, `${name} cell ${frame.col},${frame.row} is inside the sheet`);
      }
    }

    // The first frame is the reduced-motion still: it must not be blank.
    const first = sheet.animations.idle.frames[0];
    const { data } = await sharp(imagePath)
      .extract({ left: first.col * (sheet.frameWidth + sheet.gutter), top: first.row * (sheet.frameHeight + sheet.gutter), width: sheet.frameWidth, height: sheet.frameHeight })
      .extractChannel('alpha')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const opaque = data.reduce((count, alpha) => count + (alpha > 0 ? 1 : 0), 0);
    assert.ok(opaque > data.length * 0.2, 'idle still frame shows Bantay');
  });
}

test('adaptive icon foreground keeps Bantay inside the 66% safe zone', async () => {
  const { data, info } = await sharp(path.join(ASSETS_DIR, 'android-icon-foreground.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1024);
  assert.equal(info.height, 1024);
  const inset = Math.floor((info.width * (1 - 0.66)) / 2);
  let outside = 0;
  let inside = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      const safe = x >= inset && x < info.width - inset && y >= inset && y < info.height - inset;
      if (alpha > 0) {
        if (safe) inside += 1;
        else outside += 1;
      }
    }
  }
  assert.equal(outside, 0, 'no foreground pixels outside the safe zone');
  assert.ok(inside > 0, 'foreground draws Bantay');
});

test('app icon is an opaque 1024 square and the monochrome icon is a single colour', async () => {
  const icon = await sharp(path.join(ASSETS_DIR, 'icon.png')).metadata();
  assert.equal(icon.width, 1024);
  assert.equal(icon.height, 1024);
  const iconStats = await sharp(path.join(ASSETS_DIR, 'icon.png')).ensureAlpha().stats();
  assert.equal(iconStats.channels[3].min, 255, 'iOS icons must not be transparent');

  const { data, info } = await sharp(path.join(ASSETS_DIR, 'android-icon-monochrome.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] === 0) continue;
    assert.ok(data[i] === data[i + 1] && data[i + 1] === data[i + 2], 'monochrome pixels carry no hue');
  }
});

test('app.json only references image files that exist', () => {
  const config = fs.readFileSync(path.join(ROOT_DIR, 'app.json'), 'utf8');
  const references = [...config.matchAll(/"(\.\/assets\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(references.length > 0);
  for (const reference of references) {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, reference)), `${reference} exists`);
  }
});
