/**
 * QR code decoding wrapper (receiver-side tests).
 *
 * Uses the `jsQR` library to extract QR payloads from raw pixel data.
 */

import jsQR from 'jsqr';

/**
 * Decode a QR code from an `ImageData` object (e.g. from a `<canvas>`).
 *
 * @param imageData  RGBA pixel data from a canvas (width × height × 4 bytes)
 * @returns The decoded string, or `null` if no QR code could be found/decoded.
 */
export function decodeQRFromCanvas(imageData: ImageData): string | null {
  const result = jsQR(
    imageData.data,
    imageData.width,
    imageData.height,
    { inversionAttempts: 'attemptBoth' },
  );
  return result?.data ?? null;
}

/**
 * Decode a QR code from a grayscale byte buffer.
 *
 * jsQR expects RGBA data, so each grayscale byte is replicated into
 * an RGBA pixel (R = G = B = gray, A = 255).
 *
 * @param grayBuffer  Flat luma array, length = width × height
 * @param width       Image width in pixels
 * @param height      Image height in pixels
 * @returns The decoded string, or `null` if no QR code could be found/decoded.
 */
export function decodeQRFromBuffer(
  grayBuffer: Uint8Array,
  width: number,
  height: number,
): string | null {
  if (grayBuffer.length !== width * height) {
    throw new Error(
      `Buffer size mismatch: expected ${width}×${height} = ${width * height} ` +
      `grayscale pixels, got ${grayBuffer.length}`,
    );
  }

  // Build RGBA buffer where each grayscale value becomes an identical R/G/B
  // with full opacity.
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < grayBuffer.length; i++) {
    const g = grayBuffer[i];
    const off = i * 4;
    rgba[off]     = g;  // R
    rgba[off + 1] = g;  // G
    rgba[off + 2] = g;  // B
    rgba[off + 3] = 255; // A
  }

  const result = jsQR(rgba, width, height, {
    inversionAttempts: 'attemptBoth',
  });
  return result?.data ?? null;
}
