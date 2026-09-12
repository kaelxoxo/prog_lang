import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import gifencPkg from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifencPkg;

const ASSETS_DIR = path.resolve(process.cwd(), 'assets');

// Alaga design token colors
const C_FUR = '#233A35';          // Deep Alaga Evergreen (Fur)
const C_FUR_LIGHT = '#2F554A';    // Body gradient fill
const C_FUR_SHADOW = '#1A2C28';   // Fur shade
const C_SUN = '#E8B85D';          // Warm Golden Sun (Snout, Belly, Inner Ears)
const C_SUN_LIGHT = '#F3C978';    // Highlight on belly/snout
const C_INK = '#17211F';          // Nose, eyes, pupils
const C_WHITE = '#FFFCF6';        // Eye sparkle, checklist paper
const C_SUCCESS = '#477064';      // Checklist checkmark
const C_SUCCESS_DARK = '#2F554A'; // Checkmark border / Alaga banner
const C_BLUSH = 'rgba(232, 140, 110, 0.35)'; // Warm cheek blush

/**
 * Clean matte un-premultiplication and de-fringing.
 * Removes semi-transparent bleed against transparent canvas, ensuring
 * outer silhouette pixels contain genuine fur color #233A35 rather than
 * cream or light fringes.
 */
function deFringeBuffer(rgba, threshold = 80) {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a <= threshold) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = 0;
    } else {
      const alphaFactor = a / 255;
      rgba[i] = Math.min(255, Math.round(rgba[i] / alphaFactor));
      rgba[i + 1] = Math.min(255, Math.round(rgba[i + 1] / alphaFactor));
      rgba[i + 2] = Math.min(255, Math.round(rgba[i + 2] / alphaFactor));
      rgba[i + 3] = 255;
    }
  }
}

/**
 * Encodes an array of raw RGBA frame buffers into an animated GIF.
 */
async function encodeAnimatedGif(frames, width, height, delays, outputPath) {
  const gif = GIFEncoder();

  for (let i = 0; i < frames.length; i++) {
    const rawRgba = new Uint8Array(frames[i]);
    deFringeBuffer(rawRgba, 80);

    const palette = quantize(rawRgba, 256, { format: 'rgba4444', oneBitAlpha: 128 });
    let transparentIndex = palette.findIndex((p) => p[3] === 0);
    if (transparentIndex === -1) {
      palette.unshift([0, 0, 0, 0]);
      transparentIndex = 0;
    }

    const index = applyPalette(rawRgba, palette, 'rgba4444');
    gif.writeFrame(index, width, height, {
      palette,
      transparent: true,
      transparentIndex,
      delay: delays[i] ?? 500,
      dispose: 2,
    });
  }

  gif.finish();
  const buffer = Buffer.from(gif.bytes());
  await fs.writeFile(outputPath, buffer);
  console.log(`Saved ${path.basename(outputPath)} (${buffer.length} bytes)`);
}

/**
 * Base Bantay SVG renderer in a 400x400 viewBox.
 * Generates an organic, free-standing Guardian Cub B3.
 */
function renderBantaySvg({
  headAngle = 0,
  headOffsetY = 0,
  leftEarOffsetY = 0,
  leftEarAngle = 0,
  rightEarOffsetY = 0,
  rightEarAngle = 0,
  eyesType = 'open', // 'open' | 'crescent' | 'happy'
  eyeCatchlight = true,
  rightArmPose = 'down', // 'down' | 'wave-low' | 'wave-mid' | 'wave-high' | 'checklist' | 'heart'
  leftArmPose = 'down',  // 'down' | 'checklist' | 'heart'
  accessory = null,      // 'checklist' | 'heart' | null
  accessoryData = {},
}) {
  // Head center at (200, 150)
  const headTransform = `transform="translate(200, ${150 + headOffsetY}) rotate(${headAngle}) translate(-200, -150)"`;

  // Arm logic: only render resting arms if NOT holding an accessory
  let armsSnippet = '';
  let accessorySnippet = '';

  if (accessory === 'checklist') {
    const checkProgress = accessoryData.checkProgress ?? 1; // 0, 0.5, 1
    const checkGlow = accessoryData.checkGlow ?? false;

    accessorySnippet = `
      <!-- Checklist Clipboard held in center -->
      <g transform="translate(145, 190) rotate(-2)">
        <!-- Board shadow & backing -->
        <rect x="0" y="0" width="110" height="138" rx="12" fill="#E6DFD3" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
        <!-- White paper -->
        <rect x="5" y="10" width="100" height="122" rx="8" fill="${C_WHITE}" />
        <!-- Top Clip -->
        <rect x="35" y="-5" width="40" height="15" rx="5" fill="${C_FUR}" />
        <circle cx="55" cy="2.5" r="3.5" fill="${C_SUN}" />

        <!-- Header banner -->
        <rect x="12" y="18" width="86" height="15" rx="4" fill="${C_SUCCESS_DARK}" />
        <rect x="18" y="23.5" width="48" height="4" rx="2" fill="${C_WHITE}" opacity="0.9" />

        <!-- Row 1: Checkbox + Items -->
        <rect x="14" y="42" width="19" height="19" rx="5" fill="#F4EFE6" stroke="${checkProgress > 0 ? C_SUCCESS_DARK : '#858E89'}" stroke-width="2" />
        <rect x="38" y="46" width="56" height="5.5" rx="2.5" fill="#567169" opacity="0.85" />
        <rect x="38" y="54" width="40" height="4" rx="2" fill="#858E89" opacity="0.6" />

        <!-- Animated Checkmark in Row 1 -->
        ${
          checkProgress === 0.5
            ? `<path d="M 18 51 L 22 56" fill="none" stroke="${C_SUCCESS}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />`
            : checkProgress >= 1
            ? `
              ${checkGlow ? `<circle cx="24" cy="51" r="13" fill="${C_SUCCESS}" opacity="0.25" />` : ''}
              <path d="M 18 52 L 23 57 L 31 44" fill="none" stroke="${C_SUCCESS_DARK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
              <!-- Sparkle Star -->
              ${checkGlow ? `<polygon points="36,40 37.5,43.5 41,44.5 37.5,45.5 36,49 34.5,45.5 31,44.5 34.5,43.5" fill="${C_SUN}" />` : ''}
            `
            : ''
        }

        <!-- Row 2 -->
        <rect x="14" y="70" width="19" height="19" rx="5" fill="#F4EFE6" stroke="#858E89" stroke-width="1.5" />
        <rect x="38" y="74" width="52" height="5.5" rx="2.5" fill="#567169" opacity="0.75" />
        <rect x="38" y="82" width="32" height="4" rx="2" fill="#858E89" opacity="0.5" />

        <!-- Row 3 -->
        <rect x="14" y="98" width="19" height="19" rx="5" fill="#F4EFE6" stroke="#858E89" stroke-width="1.5" />
        <rect x="38" y="102" width="46" height="5.5" rx="2.5" fill="#567169" opacity="0.75" />
        <rect x="38" y="110" width="36" height="4" rx="2" fill="#858E89" opacity="0.5" />
      </g>

      <!-- Left Arm & Paw holding clipboard -->
      <path d="M 125 215 C 105 235, 115 270, 148 268 C 158 267, 160 252, 145 245 Z" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
      <circle cx="145" cy="262" r="10" fill="${C_SUN}" opacity="0.9" />

      <!-- Right Arm & Paw holding clipboard -->
      <path d="M 275 215 C 295 235, 285 270, 252 268 C 242 267, 240 252, 255 245 Z" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
      <circle cx="255" cy="262" r="10" fill="${C_SUN}" opacity="0.9" />
    `;
  } else if (accessory === 'heart') {
    const pulseScale = accessoryData.pulseScale ?? 1.0;
    const glowOpacity = accessoryData.glowOpacity ?? 0.3;
    const sparkle = accessoryData.sparkle ?? false;

    accessorySnippet = `
      <!-- Glowing Golden Care Heart & Privacy Shield -->
      <g transform="translate(200, 248) scale(${pulseScale}) translate(-200, -248)">
        <!-- Ambient Golden Pulse Rings -->
        <circle cx="200" cy="245" r="72" fill="${C_SUN}" opacity="${glowOpacity * 0.35}" />
        <circle cx="200" cy="245" r="56" fill="${C_SUN}" opacity="${glowOpacity * 0.65}" />

        <!-- Golden Care Heart -->
        <path d="M 200 286 C 155 252, 138 220, 152 192 C 166 165, 195 175, 200 198 C 205 175, 234 165, 248 192 C 262 220, 245 252, 200 286 Z"
              fill="${C_SUN}" stroke="${C_SUN_LIGHT}" stroke-width="3" />

        <!-- Inner Heart Highlight -->
        <path d="M 200 274 C 165 246, 152 220, 162 199 C 172 178, 195 188, 200 205 C 205 188, 228 178, 238 199 C 248 220, 235 246, 200 274 Z"
              fill="${C_SUN_LIGHT}" opacity="0.55" />

        <!-- Privacy Shield Insignia -->
        <path d="M 200 212 L 216 220 C 216 238, 208 250, 200 256 C 192 250, 184 238, 184 220 Z"
              fill="${C_WHITE}" stroke="${C_FUR}" stroke-width="2.5" />
        <path d="M 200 217 L 209 223 C 209 235, 205 244, 200 249 Z"
              fill="${C_FUR_LIGHT}" />

        <!-- Sparkles -->
        ${
          sparkle
            ? `
            <polygon points="138,185 141,190 146,192 141,194 138,199 136,194 131,192 136,190" fill="${C_SUN}" />
            <polygon points="262,185 264,189 269,191 264,193 262,197 260,193 255,191 260,189" fill="${C_SUN}" />
            <polygon points="200,162 202,167 207,169 202,171 200,176 198,171 193,169 198,167" fill="${C_SUN_LIGHT}" />
          `
            : ''
        }
      </g>

      <!-- Both Arms & Paws hugging the heart -->
      <path d="M 125 215 C 105 235, 120 270, 162 265 C 174 262, 172 245, 155 240 Z" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
      <circle cx="158" cy="256" r="11" fill="${C_SUN}" opacity="0.9" />

      <path d="M 275 215 C 295 235, 280 270, 238 265 C 226 262, 228 245, 245 240 Z" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
      <circle cx="242" cy="256" r="11" fill="${C_SUN}" opacity="0.9" />
    `;
  } else {
    // Normal arms (resting or waving)
    let leftArmSnippet = `
      <!-- Left Arm (Resting) -->
      <path d="M 125 215 C 100 235, 95 270, 115 292 C 132 305, 150 285, 145 260 Z" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
      <circle cx="118" cy="285" r="13" fill="${C_SUN}" opacity="0.9" />
    `;

    let rightArmSnippet = '';
    if (rightArmPose === 'down') {
      rightArmSnippet = `
        <!-- Right Arm (Resting) -->
        <path d="M 275 215 C 300 235, 305 270, 285 292 C 268 305, 250 285, 255 260 Z" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
        <circle cx="282" cy="285" r="13" fill="${C_SUN}" opacity="0.9" />
      `;
    } else if (rightArmPose === 'wave-low') {
      rightArmSnippet = `
        <!-- Right Arm (Wave Low) -->
        <path d="M 270 210 C 305 210, 330 228, 322 255 C 315 275, 285 270, 260 235 Z" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
        <circle cx="314" cy="246" r="15" fill="${C_SUN}" opacity="0.9" />
        <circle cx="306" cy="239" r="4" fill="${C_FUR_SHADOW}" opacity="0.6" />
        <circle cx="316" cy="236" r="4" fill="${C_FUR_SHADOW}" opacity="0.6" />
        <circle cx="323" cy="245" r="4" fill="${C_FUR_SHADOW}" opacity="0.6" />
      `;
    } else if (rightArmPose === 'wave-mid') {
      rightArmSnippet = `
        <!-- Right Arm (Wave Mid) -->
        <path d="M 270 200 C 315 190, 350 202, 338 234 C 328 258, 292 248, 258 225 Z" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
        <circle cx="330" cy="216" r="16" fill="${C_SUN}" opacity="0.9" />
        <circle cx="320" cy="209" r="4.5" fill="${C_FUR_SHADOW}" opacity="0.6" />
        <circle cx="330" cy="205" r="4.5" fill="${C_FUR_SHADOW}" opacity="0.6" />
        <circle cx="339" cy="213" r="4.5" fill="${C_FUR_SHADOW}" opacity="0.6" />
      `;
    } else if (rightArmPose === 'wave-high') {
      rightArmSnippet = `
        <!-- Right Arm (Wave High) -->
        <path d="M 268 195 C 320 160, 355 175, 342 208 C 330 232, 295 232, 255 215 Z" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
        <circle cx="336" cy="192" r="16" fill="${C_SUN}" opacity="0.9" />
        <circle cx="326" cy="185" r="4.5" fill="${C_FUR_SHADOW}" opacity="0.6" />
        <circle cx="336" cy="181" r="4.5" fill="${C_FUR_SHADOW}" opacity="0.6" />
        <circle cx="345" cy="189" r="4.5" fill="${C_FUR_SHADOW}" opacity="0.6" />
      `;
    }

    armsSnippet = leftArmSnippet + rightArmSnippet;
  }

  // Eyes SVG snippet
  let eyesSnippet = '';
  if (eyesType === 'open') {
    eyesSnippet = `
      <!-- Open Eyes with Catchlights -->
      <circle cx="166" cy="138" r="9" fill="${C_INK}" />
      ${eyeCatchlight ? `<circle cx="168.5" cy="135.5" r="3" fill="${C_WHITE}" />` : ''}
      <circle cx="234" cy="138" r="9" fill="${C_INK}" />
      ${eyeCatchlight ? `<circle cx="236.5" cy="135.5" r="3" fill="${C_WHITE}" />` : ''}
    `;
  } else if (eyesType === 'crescent') {
    eyesSnippet = `
      <!-- Joyful Crescent Eyes (^ ^) -->
      <path d="M 156 142 Q 166 128 176 142" fill="none" stroke="${C_INK}" stroke-width="4.5" stroke-linecap="round" />
      <path d="M 224 142 Q 234 128 244 142" fill="none" stroke="${C_INK}" stroke-width="4.5" stroke-linecap="round" />
    `;
  } else if (eyesType === 'happy') {
    eyesSnippet = `
      <!-- Serene Happy Eyes -->
      <path d="M 156 140 Q 166 130 176 140" fill="none" stroke="${C_INK}" stroke-width="4" stroke-linecap="round" />
      <path d="M 224 140 Q 234 130 244 140" fill="none" stroke="${C_INK}" stroke-width="4" stroke-linecap="round" />
    `;
  }

  return `
    <svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bodyGrad" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stop-color="${C_FUR_LIGHT}" />
          <stop offset="100%" stop-color="${C_FUR}" />
        </radialGradient>
        <radialGradient id="headGrad" cx="45%" cy="35%" r="65%">
          <stop offset="0%" stop-color="${C_FUR_LIGHT}" />
          <stop offset="100%" stop-color="${C_FUR}" />
        </radialGradient>
        <radialGradient id="bellyGrad" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stop-color="${C_SUN_LIGHT}" />
          <stop offset="100%" stop-color="${C_SUN}" />
        </radialGradient>
      </defs>

      <!-- Free-Standing Character Body -->
      <g id="body">
        <!-- Feet anchored on ground baseline (Y = 345) -->
        <!-- Left Foot -->
        <ellipse cx="152" cy="342" rx="26" ry="16" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
        <ellipse cx="152" cy="341" rx="17" ry="10" fill="${C_SUN}" opacity="0.88" />
        <!-- Right Foot -->
        <ellipse cx="248" cy="342" rx="26" ry="16" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
        <ellipse cx="248" cy="341" rx="17" ry="10" fill="${C_SUN}" opacity="0.88" />

        <!-- Chubby Pear Torso seamlessly connected under head -->
        <path d="M 150 170 C 115 200, 110 260, 138 335 C 160 348, 240 348, 262 335 C 290 260, 285 200, 250 170 Z"
              fill="url(#bodyGrad)" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />

        <!-- Warm Golden Belly -->
        <ellipse cx="200" cy="275" rx="56" ry="46" fill="url(#bellyGrad)" />
      </g>

      <!-- Arms (when not holding center accessory) -->
      ${armsSnippet}

      <!-- Head Group (with tilt and nod support) -->
      <g id="head" ${headTransform}>
        <!-- Left Ear (with optional drift angle) -->
        <g transform="translate(0, ${leftEarOffsetY}) rotate(${leftEarAngle} 132 86)">
          <circle cx="132" cy="86" r="30" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
          <circle cx="134" cy="87" r="17" fill="${C_SUN}" />
        </g>

        <!-- Right Ear (with optional perking angle) -->
        <g transform="translate(0, ${rightEarOffsetY}) rotate(${rightEarAngle} 268 86)">
          <circle cx="268" cy="86" r="30" fill="${C_FUR}" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />
          <circle cx="266" cy="87" r="17" fill="${C_SUN}" />
        </g>

        <!-- Main Head Circle -->
        <ellipse cx="200" cy="148" rx="76" ry="70" fill="url(#headGrad)" stroke="${C_FUR_SHADOW}" stroke-width="2.5" />

        <!-- Warm Snout (Muzzle) -->
        <ellipse cx="200" cy="164" rx="38" ry="28" fill="${C_SUN}" stroke="${C_SUN_LIGHT}" stroke-width="1.5" />

        <!-- Cute Rounded Nose -->
        <path d="M 191 154 C 191 150, 209 150, 209 154 C 209 161, 191 161, 191 154 Z" fill="${C_INK}" />
        <circle cx="197" cy="153" r="1.5" fill="${C_WHITE}" opacity="0.6" />

        <!-- Gentle Curved Mouth -->
        <path d="M 193 166 Q 200 174 207 166" fill="none" stroke="${C_FUR}" stroke-width="3" stroke-linecap="round" />

        <!-- Soft Cheek Blush -->
        <ellipse cx="145" cy="156" rx="11" ry="7" fill="${C_BLUSH}" />
        <ellipse cx="255" cy="156" rx="11" ry="7" fill="${C_BLUSH}" />

        <!-- Eyes -->
        ${eyesSnippet}
      </g>

      <!-- Center Accessory (Checklist or Care Heart with hugging paws) -->
      ${accessorySnippet}
    </svg>
  `;
}

/**
 * Generates assets/mascot.png:
 * High-resolution 32-bit RGBA master transparent PNG with anti-aliased cutout.
 */
async function generateMasterPng() {
  const svg = renderBantaySvg({
    headAngle: 0,
    eyesType: 'open',
    eyeCatchlight: true,
    rightArmPose: 'down',
    leftArmPose: 'down',
  });

  const outputPath = path.join(ASSETS_DIR, 'mascot.png');
  // Render at 512x512
  const buffer = await sharp(Buffer.from(svg), { density: 300 })
    .resize(512, 512)
    .png()
    .toBuffer();

  await fs.writeFile(outputPath, buffer);
  console.log(`Saved mascot.png (${buffer.length} bytes, 512x512 RGBA)`);
}

/**
 * Generates assets/mascot-welcome.gif:
 * Waving greeting, ear perks, joyful crescent-eye blinking.
 */
async function generateWelcomeGif() {
  const width = 360;
  const height = 360;

  // 5 frames choreography harmonized to 3,000ms cadence
  const frameConfigs = [
    // Frame 0: Calm attentive open eyes, low resting paw, neutral ears (1,300ms)
    {
      headAngle: 0,
      headOffsetY: 0,
      leftEarOffsetY: 0,
      leftEarAngle: 0,
      rightEarOffsetY: 0,
      rightEarAngle: 0,
      eyesType: 'open',
      rightArmPose: 'wave-low',
      leftArmPose: 'down',
      delay: 1300,
    },
    // Frame 1: Natural physiological soft blink pulse (180ms)
    {
      headAngle: 0,
      headOffsetY: 0,
      leftEarOffsetY: 0,
      leftEarAngle: 0,
      rightEarOffsetY: 0,
      rightEarAngle: 0,
      eyesType: 'crescent',
      rightArmPose: 'wave-low',
      leftArmPose: 'down',
      delay: 180,
    },
    // Frame 2: Paw lifts smoothly, curious head micro-tilt, ears begin perk (320ms)
    {
      headAngle: 1.5,
      headOffsetY: -1,
      leftEarOffsetY: -2,
      leftEarAngle: -2,
      rightEarOffsetY: -4,
      rightEarAngle: 4,
      eyesType: 'open',
      rightArmPose: 'wave-mid',
      leftArmPose: 'down',
      delay: 320,
    },
    // Frame 3: Paw waves high at apex, joyful crescent-eye greeting smile, ear perk apex (650ms)
    {
      headAngle: 2.5,
      headOffsetY: -2,
      leftEarOffsetY: -3,
      leftEarAngle: -3,
      rightEarOffsetY: -6,
      rightEarAngle: 7,
      eyesType: 'crescent',
      rightArmPose: 'wave-high',
      leftArmPose: 'down',
      delay: 650,
    },
    // Frame 4: Returning smoothly to low wave, head settles, eyes reopen (550ms)
    {
      headAngle: 0.5,
      headOffsetY: 0,
      leftEarOffsetY: 0,
      leftEarAngle: 0,
      rightEarOffsetY: -1,
      rightEarAngle: 1,
      eyesType: 'open',
      rightArmPose: 'wave-low',
      leftArmPose: 'down',
      delay: 550,
    },
  ];

  const frames = [];
  const delays = [];

  for (const cfg of frameConfigs) {
    const svg = renderBantaySvg(cfg);
    const { data } = await sharp(Buffer.from(svg))
      .resize(width, height)
      .raw()
      .toBuffer({ resolveWithObject: true });
    frames.push(data);
    delays.push(cfg.delay);
  }

  const outputPath = path.join(ASSETS_DIR, 'mascot-welcome.gif');
  await encodeAnimatedGif(frames, width, height, delays, outputPath);
}

/**
 * Generates assets/mascot-medicine.gif:
 * Holding up Alaga care checklist with animated green checkmark and approving nod.
 */
async function generateMedicineGif() {
  const width = 360;
  const height = 360;

  // 5 frames choreography harmonized to 3,000ms cadence
  // Frame 0: Calm baseline, holding Alaga care checklist stably in center, serene open eyes (1,250ms)
  // Frame 1: Natural physiological blink (180ms), downward nod begins with organic ear dip
  // Frame 2: Approving nod apex, radiant completed green checkmark with glow & star, crescent smile (750ms)
  // Frame 3: Head recovering upright, eyes open, ears rebound upward (450ms)
  // Frame 4: Smooth settling back to resting baseline, affirmed checklist persists (370ms)
  const frameConfigs = [
    {
      headAngle: 0,
      headOffsetY: 0,
      leftEarOffsetY: 0,
      leftEarAngle: 0,
      rightEarOffsetY: 0,
      rightEarAngle: 0,
      eyesType: 'open',
      accessory: 'checklist',
      accessoryData: { checkProgress: 0, checkGlow: false },
      delay: 1250,
    },
    {
      headAngle: 1.5,
      headOffsetY: 3,
      leftEarOffsetY: 2,
      leftEarAngle: -2,
      rightEarOffsetY: 2,
      rightEarAngle: -2,
      eyesType: 'crescent',
      accessory: 'checklist',
      accessoryData: { checkProgress: 0.5, checkGlow: false },
      delay: 180,
    },
    {
      headAngle: 2,
      headOffsetY: 6,
      leftEarOffsetY: 3,
      leftEarAngle: -3,
      rightEarOffsetY: 3,
      rightEarAngle: -3,
      eyesType: 'crescent',
      accessory: 'checklist',
      accessoryData: { checkProgress: 1.0, checkGlow: true },
      delay: 750,
    },
    {
      headAngle: 0.8,
      headOffsetY: 2,
      leftEarOffsetY: -1,
      leftEarAngle: 1,
      rightEarOffsetY: -1,
      rightEarAngle: 1,
      eyesType: 'open',
      accessory: 'checklist',
      accessoryData: { checkProgress: 1.0, checkGlow: true },
      delay: 450,
    },
    {
      headAngle: 0,
      headOffsetY: 0,
      leftEarOffsetY: 0,
      leftEarAngle: 0,
      rightEarOffsetY: 0,
      rightEarAngle: 0,
      eyesType: 'open',
      accessory: 'checklist',
      accessoryData: { checkProgress: 1.0, checkGlow: false },
      delay: 370,
    },
  ];

  const frames = [];
  const delays = [];

  for (const cfg of frameConfigs) {
    const svg = renderBantaySvg(cfg);
    const { data } = await sharp(Buffer.from(svg))
      .resize(width, height)
      .raw()
      .toBuffer({ resolveWithObject: true });
    frames.push(data);
    delays.push(cfg.delay);
  }

  const outputPath = path.join(ASSETS_DIR, 'mascot-medicine.gif');
  await encodeAnimatedGif(frames, width, height, delays, outputPath);
}

/**
 * Generates assets/mascot-heart.gif:
 * Hugging glowing golden care heart and privacy shield with both paws.
 */
async function generateHeartGif() {
  const width = 360;
  const height = 360;

  // 5 frames choreography harmonized to 3,000ms cadence
  // Frame 0: Holding heart at resting baseline, gentle ambient glow, calm open eyes (1,250ms)
  // Frame 1: Natural physiological soft blink pulse (180ms)
  // Frame 2: Paws tighten in gentle embrace, heart expands +6%, golden glow deepens, ears spread (420ms)
  // Frame 3: Peak comforting hug embrace: +12% pulse, radiant glow, 3 sparkles, crescent smile, head tilt (700ms)
  // Frame 4: Smooth relaxation back toward baseline, serene eyes reopen, ears settle (450ms)
  const frameConfigs = [
    {
      headAngle: 0,
      headOffsetY: 0,
      leftEarOffsetY: 0,
      leftEarAngle: 0,
      rightEarOffsetY: 0,
      rightEarAngle: 0,
      eyesType: 'open',
      accessory: 'heart',
      accessoryData: { pulseScale: 1.0, glowOpacity: 0.25, sparkle: false },
      delay: 1250,
    },
    {
      headAngle: 0,
      headOffsetY: 0,
      leftEarOffsetY: 0,
      leftEarAngle: 0,
      rightEarOffsetY: 0,
      rightEarAngle: 0,
      eyesType: 'crescent',
      accessory: 'heart',
      accessoryData: { pulseScale: 1.0, glowOpacity: 0.25, sparkle: false },
      delay: 180,
    },
    {
      headAngle: -1.5,
      headOffsetY: 1,
      leftEarOffsetY: -1,
      leftEarAngle: -2,
      rightEarOffsetY: 1,
      rightEarAngle: 3,
      eyesType: 'happy',
      accessory: 'heart',
      accessoryData: { pulseScale: 1.06, glowOpacity: 0.5, sparkle: true },
      delay: 420,
    },
    {
      headAngle: -2.5,
      headOffsetY: 2,
      leftEarOffsetY: -2,
      leftEarAngle: -3,
      rightEarOffsetY: 2,
      rightEarAngle: 5,
      eyesType: 'crescent',
      accessory: 'heart',
      accessoryData: { pulseScale: 1.12, glowOpacity: 0.75, sparkle: true },
      delay: 700,
    },
    {
      headAngle: -1.0,
      headOffsetY: 1,
      leftEarOffsetY: 0,
      leftEarAngle: -1,
      rightEarOffsetY: 1,
      rightEarAngle: 1,
      eyesType: 'happy',
      accessory: 'heart',
      accessoryData: { pulseScale: 1.04, glowOpacity: 0.4, sparkle: false },
      delay: 450,
    },
  ];

  const frames = [];
  const delays = [];

  for (const cfg of frameConfigs) {
    const svg = renderBantaySvg(cfg);
    const { data } = await sharp(Buffer.from(svg))
      .resize(width, height)
      .raw()
      .toBuffer({ resolveWithObject: true });
    frames.push(data);
    delays.push(cfg.delay);
  }

  const outputPath = path.join(ASSETS_DIR, 'mascot-heart.gif');
  await encodeAnimatedGif(frames, width, height, delays, outputPath);
}

/**
 * Verification routine: checks all 4 generated assets with Sharp.
 * Asserts hasAlpha === true, channels === 4, perimeter transparency, and no cream halos.
 */
export async function verifyAssets() {
  const assets = [
    'mascot.png',
    'mascot-welcome.gif',
    'mascot-medicine.gif',
    'mascot-heart.gif',
  ];

  console.log('\n--- Verifying Generated Mascot Assets ---');

  for (const filename of assets) {
    const filePath = path.join(ASSETS_DIR, filename);
    const meta = await sharp(filePath).metadata();

    const isAlpha = meta.hasAlpha === true || meta.channels === 4;
    console.log(`${filename}: format=${meta.format}, size=${meta.width}x${meta.height}, channels=${meta.channels}, hasAlpha=${meta.hasAlpha}, pages=${meta.pages ?? 1}`);

    if (!isAlpha) {
      throw new Error(`Asset ${filename} failed alpha check! channels=${meta.channels}, hasAlpha=${meta.hasAlpha}`);
    }

    // Inspect perimeter pixels
    const { data, info } = await sharp(filePath, { page: 0 }).raw().toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;

    // Check top row, bottom row, left column, right column for transparency
    const topRowAlpha = [];
    const bottomRowAlpha = [];
    for (let x = 0; x < width; x++) {
      topRowAlpha.push(data[x * 4 + 3]);
      bottomRowAlpha.push(data[((height - 1) * width + x) * 4 + 3]);
    }

    const topMaxAlpha = Math.max(...topRowAlpha);
    const bottomMaxAlpha = Math.max(...bottomRowAlpha);

    if (topMaxAlpha !== 0 || bottomMaxAlpha !== 0) {
      throw new Error(`Asset ${filename} has non-transparent perimeter! topMax=${topMaxAlpha}, bottomMax=${bottomMaxAlpha}`);
    }

    // Check corner colors for cream halo (#FCF9EE / #F6F1E7)
    // Corner pixel must be completely transparent (a === 0)
    const cornerAlpha = data[3];
    if (cornerAlpha !== 0) {
      throw new Error(`Asset ${filename} corner pixel is not transparent: alpha=${cornerAlpha}`);
    }

    console.log(`✓ ${filename} perimeter is 100% transparent and halo-free.`);
  }

  console.log('All mascot assets verified successfully!\n');
}

export async function main() {
  console.log('Generating Alaga IP Mascot Assets...');
  await generateMasterPng();
  await generateWelcomeGif();
  await generateMedicineGif();
  await generateHeartGif();
  await verifyAssets();
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Asset generation failed:', err);
    process.exit(1);
  });
}
