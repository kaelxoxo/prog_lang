export type OcrImageMimeType = 'image/jpeg' | 'image/png';

/**
 * Detects the image type from the base64 payload itself. The picker's reported
 * mimeType/URI describe the source file, but Android re-encodes base64 as JPEG
 * whenever quality < 1, so only the bytes are trustworthy.
 */
export function imageMimeTypeFromBase64(base64: string): OcrImageMimeType | null {
  if (base64.startsWith('/9j/')) return 'image/jpeg'; // FF D8 FF
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png'; // 89 50 4E 47 0D 0A 1A 0A
  return null;
}
