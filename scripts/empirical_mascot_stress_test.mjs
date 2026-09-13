import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ASSETS_DIR = path.resolve(process.cwd(), 'assets');

const ASSETS = [
  { name: 'mascot.png', format: 'png', pages: 1, expectedWidth: 512, expectedHeight: 512 },
  { name: 'mascot-welcome.gif', format: 'gif', pages: 5, expectedWidth: 360, expectedHeight: 360 },
  { name: 'mascot-medicine.gif', format: 'gif', pages: 5, expectedWidth: 360, expectedHeight: 360 },
  { name: 'mascot-heart.gif', format: 'gif', pages: 5, expectedWidth: 360, expectedHeight: 360 },
];

const BACKGROUNDS = [
  { name: 'Light Canvas (#F6F1E7)', hex: '#F6F1E7', rgb: [246, 241, 231] },
  { name: 'Dark Canvas (#17211F)', hex: '#17211F', rgb: [23, 33, 31] },
  { name: 'Pure Black (#000000)', hex: '#000000', rgb: [0, 0, 0] },
  { name: 'Pure White (#FFFFFF)', hex: '#FFFFFF', rgb: [255, 255, 255] },
  { name: 'Alaga Evergreen (#233A35)', hex: '#233A35', rgb: [35, 58, 53] },
];

async function runEmpiricalStressTests() {
  console.log('================================================================');
  console.log('EMPIRICAL STRESS-TEST: MASCOT ASSET TRANSPARENCY & BOUNDARY RENDERING');
  console.log('================================================================\n');

  const results = {
    summary: {
      totalAssets: ASSETS.length,
      totalFrames: 0,
      perimeterViolations: 0,
      haloViolations: 0,
      clippingViolations: 0,
    },
    assetDetails: [],
    groundShadowAnalysis: null,
  };

  // -------------------------------------------------------------
  // PART 1: Full Frame Extraction, Perimeter Pixels, and Alpha Profile
  // -------------------------------------------------------------
  for (const asset of ASSETS) {
    const assetPath = path.join(ASSETS_DIR, asset.name);
    const meta = await sharp(assetPath, { animated: true }).metadata();
    const actualPages = meta.pages || 1;
    console.log(`\n--- Inspecting ${asset.name} (${meta.format}, pages=${actualPages}) ---`);

    const assetReport = {
      name: asset.name,
      format: meta.format,
      pages: actualPages,
      frames: [],
    };

    for (let pageIdx = 0; pageIdx < actualPages; pageIdx++) {
      results.summary.totalFrames++;
      const { data, info } = await sharp(assetPath, { page: pageIdx })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height, channels } = info;
      const getPixel = (x, y) => {
        const idx = (y * width + x) * channels;
        return {
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          a: data[idx + 3],
        };
      };

      // 1. Perimeter pixels check (top, bottom, left, right borders)
      const perimeterPixels = [];
      // Top row: y = 0
      for (let x = 0; x < width; x++) perimeterPixels.push({ x, y: 0, ...getPixel(x, 0), side: 'top' });
      // Bottom row: y = height - 1
      for (let x = 0; x < width; x++) perimeterPixels.push({ x, y: height - 1, ...getPixel(x, height - 1), side: 'bottom' });
      // Left column: x = 0 (skip corners already added)
      for (let y = 1; y < height - 1; y++) perimeterPixels.push({ x: 0, y, ...getPixel(0, y), side: 'left' });
      // Right column: x = width - 1 (skip corners already added)
      for (let y = 1; y < height - 1; y++) perimeterPixels.push({ x: width - 1, y, ...getPixel(width - 1, y), side: 'right' });

      const nonZeroPerimeter = perimeterPixels.filter((p) => p.a > 0);
      const maxPerimeterAlpha = perimeterPixels.reduce((max, p) => Math.max(max, p.a), 0);

      if (nonZeroPerimeter.length > 0) {
        results.summary.perimeterViolations += nonZeroPerimeter.length;
        console.error(`  [FAIL] Frame ${pageIdx}: Found ${nonZeroPerimeter.length} non-transparent perimeter pixels! Max alpha: ${maxPerimeterAlpha}`);
      } else {
        console.log(`  [PASS] Frame ${pageIdx}: All ${perimeterPixels.length} perimeter pixels have 100% alpha transparency (alpha === 0).`);
      }

      // 2. Alpha channel statistics and bounding box
      let zeroAlphaCount = 0;
      let semiAlphaCount = 0;
      let fullAlphaCount = 0;
      let minX = width, maxX = -1, minY = height, maxY = -1;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = getPixel(x, y);
          if (p.a === 0) {
            zeroAlphaCount++;
          } else {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            if (p.a === 255) {
              fullAlphaCount++;
            } else {
              semiAlphaCount++;
            }
          }
        }
      }

      const totalPixels = width * height;
      const margin = {
        left: minX,
        right: width - 1 - maxX,
        top: minY,
        bottom: height - 1 - maxY,
      };

      console.log(`    Bounding box: [${minX}, ${minY}] to [${maxX}, ${maxY}] (size: ${maxX - minX + 1}x${maxY - minY + 1})`);
      console.log(`    Canvas margins: left=${margin.left}px, right=${margin.right}px, top=${margin.top}px, bottom=${margin.bottom}px`);
      console.log(`    Alpha profile: transparent=${((zeroAlphaCount/totalPixels)*100).toFixed(1)}%, semi=${((semiAlphaCount/totalPixels)*100).toFixed(1)}% (${semiAlphaCount} px), opaque=${((fullAlphaCount/totalPixels)*100).toFixed(1)}%`);

      // 3. Check for rectangular boundary clipping artifacts
      // If minX <= 0 or maxX >= width - 1 or minY <= 0 or maxY >= height - 1, character touches edge!
      const touchesEdge = minX <= 0 || maxX >= width - 1 || minY <= 0 || maxY >= height - 1;
      if (touchesEdge) {
        results.summary.clippingViolations++;
        console.error(`    [FAIL] Frame ${pageIdx}: Character silhouette touches or clips the canvas border!`);
      }

      // 4. Test compositing against 5 backgrounds and check edge pixels
      const backgroundTests = [];
      for (const bg of BACKGROUNDS) {
        // Find all edge pixels: pixels with alpha > 0 that have at least one 4-neighbor with alpha === 0
        const edgePixels = [];
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const p = getPixel(x, y);
            if (p.a > 0) {
              const isEdge =
                x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
                getPixel(x - 1, y).a === 0 ||
                getPixel(x + 1, y).a === 0 ||
                getPixel(x, y - 1).a === 0 ||
                getPixel(x, y + 1).a === 0;

              if (isEdge) {
                // Calculate composited pixel color
                const alphaNorm = p.a / 255;
                const cr = Math.round(p.r * alphaNorm + bg.rgb[0] * (1 - alphaNorm));
                const cg = Math.round(p.g * alphaNorm + bg.rgb[1] * (1 - alphaNorm));
                const cb = Math.round(p.b * alphaNorm + bg.rgb[2] * (1 - alphaNorm));
                edgePixels.push({ x, y, orig: p, comp: [cr, cg, cb] });
              }
            }
          }
        }

        // Detect white/cream halo on dark backgrounds
        // Cream background #FCF9EE has RGB approx (252, 249, 238), luminance > 240
        // On dark background #000000 or #17211F, if fur edge (normally #233A35) has composited luminance > 160 without being an accessory, suspect halo!
        let suspiciousHaloPixels = 0;
        if (bg.hex === '#000000' || bg.hex === '#17211F') {
          for (const ep of edgePixels) {
            // Check original pixel: if original pixel is semi-transparent with high brightness, check if it's near dark fur
            // Bantay's fur is dark green: R ~ 35, G ~ 58, B ~ 53.
            // If an edge pixel has high brightness R > 200, G > 200, B > 180, is it an accessory or cream halo?
            // In welcome gif or master PNG, only eye sparkle / stars / checklist / heart have light colors.
            // If original alpha is low (e.g. a < 150) and original RGB is light cream (r>230, g>230, b>210) while located on outer fur, that's a fringe halo.
            if (ep.orig.a < 200 && ep.orig.r > 220 && ep.orig.g > 220 && ep.orig.b > 200) {
              suspiciousHaloPixels++;
            }
          }
        }

        backgroundTests.push({
          bg: bg.name,
          edgePixelCount: edgePixels.length,
          suspiciousHaloPixels,
        });
      }

      const frameReport = {
        frame: pageIdx,
        dimensions: { width, height },
        perimeterCount: perimeterPixels.length,
        nonZeroPerimeterCount: nonZeroPerimeter.length,
        maxPerimeterAlpha,
        boundingBox: { minX, maxX, minY, maxY },
        margin,
        alphaProfile: { zeroAlphaCount, semiAlphaCount, fullAlphaCount },
        backgroundTests,
      };

      assetReport.frames.push(frameReport);
    }

    results.assetDetails.push(assetReport);
  }

  // -------------------------------------------------------------
  // PART 2: Ground Shadow Opacity & Dynamic Contrast Analysis
  // -------------------------------------------------------------
  console.log('\n--- Analyzing Ground Shadow Opacity & Dynamics ---');
  // From OnboardingMascotStage.tsx:
  // light mode canvas: #F6F1E7 (RGB: 246, 241, 231)
  // dark mode canvas: #17211F (RGB: 23, 33, 31)
  // shadow backgroundColor: light => rgba(0,0,0,0.22), dark => rgba(0,0,0,0.45)
  // shadowBaseOpacity = interpolate [0, 10, 30] => [0.26, 0.18, 0.08]
  // shadowSquashMult = interpolate [0.88, 1.0, 1.08] => [1.25, 1.0, 0.95]

  const shadowStates = [
    { name: 'Resting Baseline (Z=0, Squash=1.0)', Z: 0, baseOp: 0.26, squashMult: 1.0 },
    { name: 'Float Apex (Z=10, Squash=1.0)', Z: 10, baseOp: 0.18, squashMult: 1.0 },
    { name: 'Hop Takeoff Apex (Z=30, Squash=1.08)', Z: 30, baseOp: 0.08, squashMult: 0.95 },
    { name: 'Landing Impact Squash (Z=0, Squash=0.88)', Z: 0, baseOp: 0.26, squashMult: 1.25 },
  ];

  const shadowAnalysis = {
    lightCanvas: { hex: '#F6F1E7', rgb: [246, 241, 231], bgAlpha: 0.22, states: [] },
    darkCanvas: { hex: '#17211F', rgb: [23, 33, 31], bgAlpha: 0.45, states: [] },
  };

  for (const theme of [shadowAnalysis.lightCanvas, shadowAnalysis.darkCanvas]) {
    console.log(`\nTheme: ${theme.hex} (Shadow Base RGBA Alpha = ${theme.bgAlpha}):`);
    for (const state of shadowStates) {
      const viewOpacity = state.baseOp * state.squashMult;
      const effectiveAlpha = theme.bgAlpha * viewOpacity;

      // Compositing pure black rgba(0,0,0, effectiveAlpha) over theme RGB:
      const compR = Math.round(theme.rgb[0] * (1 - effectiveAlpha));
      const compG = Math.round(theme.rgb[1] * (1 - effectiveAlpha));
      const compB = Math.round(theme.rgb[2] * (1 - effectiveAlpha));

      // Calculate RGB Euclidean distance and relative luminance
      const deltaR = theme.rgb[0] - compR;
      const deltaG = theme.rgb[1] - compG;
      const deltaB = theme.rgb[2] - compB;
      const colorDiff = Math.sqrt(deltaR * deltaR + deltaG * deltaG + deltaB * deltaB);

      // Relative luminance calculation (sRGB)
      const lum = (r, g, b) => {
        const a = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      };

      const lumBg = lum(theme.rgb[0], theme.rgb[1], theme.rgb[2]);
      const lumComp = lum(compR, compG, compB);
      const contrastRatio = (Math.max(lumBg, lumComp) + 0.05) / (Math.min(lumBg, lumComp) + 0.05);

      const stateReport = {
        state: state.name,
        viewOpacity: viewOpacity.toFixed(4),
        effectiveAlpha: effectiveAlpha.toFixed(4),
        compositedRgb: [compR, compG, compB],
        colorDiff: colorDiff.toFixed(2),
        contrastRatio: contrastRatio.toFixed(3),
      };

      theme.states.push(stateReport);
      console.log(`  ${state.name}: ViewOp=${stateReport.viewOpacity}, EffAlpha=${(effectiveAlpha*100).toFixed(2)}%, CompRGB=[${compR},${compG},${compB}], Delta=${stateReport.colorDiff}, Contrast=${stateReport.contrastRatio}:1`);
    }
  }

  results.groundShadowAnalysis = shadowAnalysis;

  // -------------------------------------------------------------
  // Summary & Verdict
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('STRESS-TEST VERDICT DETERMINATION');
  console.log('================================================================');
  console.log(`Total Assets Checked: ${results.summary.totalAssets}`);
  console.log(`Total Frames Examined: ${results.summary.totalFrames}`);
  console.log(`Perimeter Alpha Violations: ${results.summary.perimeterViolations}`);
  console.log(`Rectangular Clipping Violations: ${results.summary.clippingViolations}`);
  console.log(`Halo Artifact Violations: ${results.summary.haloViolations}`);

  const verdict = (
    results.summary.perimeterViolations === 0 &&
    results.summary.clippingViolations === 0 &&
    results.summary.haloViolations === 0
  ) ? 'APPROVE' : 'REJECT';

  console.log(`\nFINAL VERDICT: [ ${verdict} ]\n`);
  return { results, verdict };
}

runEmpiricalStressTests()
  .then(({ results, verdict }) => {
    // Write detailed json output for reporting
    return fs.writeFile(
      path.resolve(process.cwd(), 'scripts/stress_test_results.json'),
      JSON.stringify({ results, verdict }, null, 2)
    );
  })
  .catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
