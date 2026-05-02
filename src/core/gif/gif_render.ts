/**
 * Animated GIF generation for QR-frame sequences.
 *
 * Uses the `gifenc` library to assemble indexed-colour GIFs from raw RGBA
 * frames produced by the frame rasterizer.  Each frame is a full image
 * (not partial deltas) with a 2-colour global palette (white, black).
 * The loop count is set to infinity via the NETSCAPE 2.0 extension.
 */

import { GIFEncoder } from 'gifenc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 2-colour palette: white → index 0, black → index 1 */
const PALETTE: number[][] = [
  [255, 255, 255], // white (background / quiet zone)
  [0,   0,   0  ], // black (QR modules)
];

/** Default inter-frame delay in milliseconds (100 ms = 10 fps) */
const DEFAULT_DELAY_MS = 100;

// ---------------------------------------------------------------------------
// RGBA → indexed conversion
// ---------------------------------------------------------------------------

/**
 * Convert an RGBA pixel buffer into a palette-indexed buffer.
 *
 * Pixels are classified as black (index 1) if their RGB value is darker
 * than the mid-point threshold; everything else becomes white (index 0).
 * The alpha channel is ignored for classification.
 *
 * @param rgba  Flat RGBA data (4 bytes per pixel)
 * @returns     Uint8Array where each byte is 0 (white) or 1 (black)
 */
function rgbaToIndexed(rgba: Uint8Array): Uint8Array {
  const pixelCount = rgba.length / 4;
  const indexed = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    // Sum R+G+B to determine brightness (0 = black, 765 = white)
    const brightness = rgba[off]! + rgba[off + 1]! + rgba[off + 2]!;
    // Mid-point threshold at 50 % (382.5)
    indexed[i] = brightness < 384 ? 1 : 0;
  }

  return indexed;
}

// ---------------------------------------------------------------------------
// GIF creation
// ---------------------------------------------------------------------------

/**
 * Build an animated GIF from a sequence of QR-code frames.
 *
 * @param frames   Array of RGBA pixel buffers (from `rasterizeQR().data`)
 * @param delays   Per-frame delay in **milliseconds** (default: 100 ms).
 *                 If a single value is passed, it is used for all frames.
 * @param width    Frame width in pixels (must be uniform across all frames)
 * @param height   Frame height in pixels
 * @returns        Complete GIF file as a `Uint8Array`
 */
type PixelData = Uint8Array | Uint8ClampedArray;

export function createQRGif(
  frames: PixelData[],
  delays: number | number[] = DEFAULT_DELAY_MS,
  width: number,
  height: number,
): Uint8Array {
  if (frames.length === 0) {
    throw new Error('At least one frame is required');
  }

  // Normalise delays
  const delayArr: number[] =
    typeof delays === 'number'
      ? new Array(frames.length).fill(delays)
      : delays;

  if (delayArr.length !== frames.length) {
    throw new Error(
      `Delay array length (${delayArr.length}) must match frame count (${frames.length})`,
    );
  }

  const encoder = GIFEncoder({ auto: true });

  for (let i = 0; i < frames.length; i++) {
    const indexed = rgbaToIndexed(new Uint8Array(frames[i]!.buffer, frames[i]!.byteOffset, frames[i]!.byteLength));
    const isFirst = i === 0;

    encoder.writeFrame(indexed, width, height, {
      palette: isFirst ? PALETTE : undefined,
      delay: delayArr[i]!,
      repeat: isFirst ? 0 : undefined,    // 0 = loop forever (NETSCAPE)
    });
  }

  encoder.finish();
  return encoder.bytes();
}

// ---------------------------------------------------------------------------
// Size estimation heuristic
// ---------------------------------------------------------------------------

/**
 * Estimate the size (in bytes) of an animated QR GIF.
 *
 * Heuristic formula (≈15 % of raw RGBA size + fixed overhead):
 *   size ≈ rawSize × 0.15 + 150 × frameCount
 *
 * The compression ratio for pure black-and-white QR images with LZW in a
 * 2-colour palette is very high (often > 10:1).
 *
 * @param rawSize   Total RGBA data size in bytes (width × height × 4 × frames)
 * @param profile   Profile identifier (e.g. "V31-Q", "V35-M", "V40-M"),
 *                  used for potential future tuning; currently unused.
 * @returns         Estimated GIF file size in bytes
 */
export function estimateGifSize(rawSize: number, _profile: string): number {
  // Derive frame count and dimensions from rawSize (approximate)
  // Assume roughly scale=3 → moduleCount = dimension/3 - 8
  // This is a rough heuristic, so we keep it simple.
  const compressedData = Math.round(rawSize * 0.15);
  const overheadPerFrame = 150; // header + GCE + image descriptor + LZW tables
  const frameCount = Math.max(1, Math.round(rawSize / (250_000))); // rough guess

  return compressedData + overheadPerFrame * frameCount + 32; // trailer
}
