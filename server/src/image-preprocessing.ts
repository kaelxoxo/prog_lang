import sharp from 'sharp';

export type PreprocessingOptions = {
  maxDimension?: number;
  applyClahe?: boolean;
  applySharpen?: boolean;
  normalizeContrast?: boolean;
};

/**
 * Pre-processes pharmaceutical container and prescription images before OCR.
 * Applies Contrast Limited Adaptive Histogram Equalization (CLAHE),
 * luminance normalization, glare suppression, and edge sharpening.
 */
export async function preprocessOcrImage(
  imageBuffer: Buffer,
  options: PreprocessingOptions = {},
): Promise<Buffer> {
  const {
    maxDimension = 2048,
    applyClahe = true,
    applySharpen = true,
    normalizeContrast = true,
  } = options;

  try {
    let pipeline = sharp(imageBuffer, { failOn: 'none' })
      .rotate(); // Automatically orient using EXIF tags

    // Normalize size if the image exceeds optimal OCR processing dimensions
    pipeline = pipeline.resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Convert to grayscale to remove distracting pharmaceutical packaging hues
    pipeline = pipeline.grayscale();

    // Stretch luminance across the dynamic range to mitigate uneven camera lighting
    if (normalizeContrast) {
      pipeline = pipeline.normalize();
    }

    // Apply CLAHE to dramatically improve faint doctor ballpoint ink and low-contrast blister pack text
    if (applyClahe) {
      pipeline = pipeline.clahe({
        width: 32,
        height: 32,
        maxSlope: 3,
      });
    }

    // Apply subtle sharpening to crisp up blurred character boundaries
    if (applySharpen) {
      pipeline = pipeline.sharpen({
        sigma: 1.2,
        m1: 1.0,
        m2: 2.0,
      });
    }

    // Output as high-quality uncompressed PNG for optimal Tesseract / VLM ingestion
    return await pipeline.png({ compressionLevel: 6 }).toBuffer();
  } catch (error) {
    // Gracefully fall back to original buffer if image cannot be parsed by Sharp
    return imageBuffer;
  }
}
