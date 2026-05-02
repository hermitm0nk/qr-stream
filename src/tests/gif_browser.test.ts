/**
 * Debug: match EXACTLY what the browser app does.
 */
import { describe, it, expect } from 'vitest';
import { SenderPacketizer } from '@/core/sender/packetizer';
import { generateQRMatrix } from '@/core/qr/qr_encode';
import { rasterizeQR } from '@/core/qr/frame_raster';
import { createQRGif } from '@/core/gif/gif_render';
import { parseGif, renderGifFrame } from '@/core/gif/gif_parser';
import { decodeQRFromCanvas } from '@/core/qr/qr_decode';

describe('browser-accurate pipeline', () => {
  it('uses raw packets (no FrameScheduler) like encode.worker.ts', async () => {
    const text = 'Hello world test 123';
    const data = new TextEncoder().encode(text);

    // Step 1: Packetize (exactly like encode.worker.ts)
    const sp = new SenderPacketizer();
    await sp.initialize(data, 'test.txt', 'text/plain');
    const manifest = sp.getManifest();
    const packets = sp.getPackets();

    // The browser app uses allPackets = [...manifestPackets, ...packets]
    // Just use packets directly for this test (includes manifest)
    console.log('Total packets:', packets.length);

    // Step 2: Generate QR (exactly like gif.worker.ts)
    const scale = 3;
    const qrVersion = 20;
    const eccLevel = 'Q';
    const frames: Uint8Array[] = [];
    let fw = 0, fh = 0;
    for (const packet of packets) {
      const matrix = generateQRMatrix(packet, qrVersion, eccLevel);
      const rgba = rasterizeQR(matrix, scale);
      if (fw === 0) { fw = rgba.width; fh = rgba.height; }
      frames.push(new Uint8Array(rgba.data.buffer));
    }
    console.log('QR frames:', frames.length, `size: ${fw}×${fh}`);

    // Step 3: Create GIF (exactly like gif.worker.ts)
    const delayMs = 100;
    const gifBytes = createQRGif(frames, delayMs, fw, fh);
    console.log('GIF size:', gifBytes.length, 'bytes');

    // Step 4: Parse GIF (exactly like receiver.tsx)
    const gifData = parseGif(gifBytes);
    console.log('Parsed frames:', gifData.frames.length);

    // Step 5: Render + decode each frame
    let decodedOk = 0;
    let badLen = 0;
    let badPixels = 0;

    for (let i = 0; i < gifData.frames.length; i++) {
      const frame = gifData.frames[i]!;
      const expectedPixels = frame.width * frame.height;

      if (frame.data.length !== expectedPixels) {
        badLen++;
        if (badLen <= 3) console.log(`  Frame ${i}: data len ${frame.data.length} vs ${expectedPixels}`);
        continue;
      }

      const rgba = renderGifFrame(gifData, i);
      const blackCount = countBlack(rgba, fw, fh);
      const pct = blackCount / (fw * fh) * 100;

      // Check if image is mostly black (broken) or reasonable
      if (pct > 80 || pct < 1) {
        badPixels++;
        if (badPixels <= 3) console.log(`  Frame ${i}: ${blackCount}/${fw*fh} black (${pct.toFixed(1)}%) — too extreme`);
        continue;
      }

      const imageData = new ImageData(rgba, fw, fh);
      const qr = decodeQRFromCanvas(imageData);
      if (qr) {
        decodedOk++;
      } else {
        if (badPixels + decodedOk <= 3) console.log(`  Frame ${i}: QR null, ${blackCount}/${fw*fh} black`);
      }
    }

    console.log(`\nResults: ${decodedOk}/${gifData.frames.length} decoded`);
    console.log(`  Bad data length: ${badLen}`);
    console.log(`  Bad pixels (extreme): ${badPixels}`);
    expect(decodedOk).toBe(gifData.frames.length);
  });
});

function countBlack(rgba: Uint8ClampedArray, w: number, h: number): number {
  let black = 0;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4]! < 128) black++;
  }
  return black;
}
