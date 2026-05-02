/**
 * GIF generation worker — receives packets, generates QR matrices,
 * rasterizes them, and creates an animated GIF.
 *
 * @module
 */

import { generateQRMatrix } from '@/core/qr/qr_encode';
import { rasterizeQR } from '@/core/qr/frame_raster';
import { createQRGif } from '@/core/gif/gif_render';
import type { ProfileConfig } from '@/core/protocol/constants';
import type { ManifestData } from '@/core/protocol/manifest';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GenerateInput {
  type: 'generate';
  packets: Uint8Array[];
  manifest: ManifestData;
  profile: ProfileConfig;
}

interface GifOutput {
  type: 'gifReady';
  gifData: ArrayBuffer;
  width: number;
  height: number;
  frameCount: number;
}

interface ErrorOutput {
  type: 'error';
  message: string;
}

// ─── Worker handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<GenerateInput>) => {
  const msg = e.data;
  if (msg.type !== 'generate') return;

  try {
    const result = handleGenerate(msg);
    // Transfer the GIF buffer to avoid extra copy
    self.postMessage(result, [result.gifData]);
  } catch (err: any) {
    self.postMessage({ type: 'error', message: err.message ?? String(err) } satisfies ErrorOutput);
  }
};

function handleGenerate(input: GenerateInput): GifOutput {
  const { packets, manifest, profile } = input;
  const { qrVersion, eccLevel, frameDelay } = profile;

  // QR module count for this version
  const moduleCount = qrVersion * 4 + 17;

  // Determine optimal scale: aim for ~300-400 px width
  const targetPx = 360;
  const quietModules = 8; // 4 on each side
  const totalModules = moduleCount + quietModules;
  const scale = Math.max(2, Math.round(targetPx / totalModules));

  // ── Generate QR matrix for each packet ──────────────────────────────────
  const frames: Uint8Array[] = [];
  let width = 0;
  let height = 0;

  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i]!;

    // Generate QR code matrix from raw packet bytes
    const matrix = generateQRMatrix(packet, qrVersion, eccLevel);

    // Rasterize to RGBA pixel data
    const imageData = rasterizeQR(matrix, scale);
    if (i === 0) {
      width = imageData.width;
      height = imageData.height;
    }

    frames.push(new Uint8Array(imageData.data.buffer));
  }

  // ── Create animated GIF ─────────────────────────────────────────────────
  // frameDelay from profile is in centiseconds; gifenc expects milliseconds
  const delayMs = frameDelay * 10; // cs → ms
  const gifBytes = createQRGif(frames, delayMs, width, height);

  return {
    type: 'gifReady',
    gifData: gifBytes.buffer.slice(gifBytes.byteOffset, gifBytes.byteOffset + gifBytes.byteLength),
    width,
    height,
    frameCount: frames.length,
  };
}
