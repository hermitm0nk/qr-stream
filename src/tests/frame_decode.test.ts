/**
 * Test that all frames in a generated GIF can be QR-decoded.
 * Reproduces the issue where receiver shows fewer frames than sent.
 */
import { describe, it, expect } from 'vitest';
import { SenderPacketizer } from '@/core/sender/packetizer';
import { FrameScheduler } from '@/core/sender/scheduler';
import { generateQRMatrix } from '@/core/qr/qr_encode';
import { rasterizeQR } from '@/core/qr/frame_raster';
import { createQRGif } from '@/core/gif/gif_render';
import { parseGif, renderGifFrame } from '@/core/gif/gif_parser';
import { decodeQRFromCanvas } from '@/core/qr/qr_decode';
import { ProfileId } from '@/core/protocol/constants';

describe('Frame decode reliability', () => {
  it('should decode all frames from a ~33 frame GIF', async () => {
    // Find a payload that generates ~33 frames with ROBUST profile
    // ROBUST: k=16, r=16, maxPayload=450
    // 1 gen = 32 data frames. With M=1 manifest: 1 + 32 + 4 = 37 frames.
    // Let's try a very small payload that might compress well and result
    // in fewer data frames somehow... but the encoder always produces k+r.
    // Actually, let's just test with 1 generation and verify ALL frames decode.
    const text = 'Hello world this is a test of the QR GIF system.';
    const data = new TextEncoder().encode(text);

    const sp = new SenderPacketizer(ProfileId.ROBUST);
    await sp.initialize(data, 'test.txt', 'text/plain');
    const manifest = sp.getManifest();
    const packets = sp.getPackets();
    const scheduler = new FrameScheduler();
    const schedule = scheduler.schedule(packets, manifest);

    console.log('Schedule length:', schedule.length);
    console.log('Generations:', manifest.totalGenerations);

    // Generate GIF
    const scale = 3;
    const qrFrames: Uint8Array[] = [];
    let fw = 0, fh = 0;
    for (const p of schedule) {
      const matrix = generateQRMatrix(p, manifest.qrProfile === ProfileId.ROBUST ? 20 :
        manifest.qrProfile === ProfileId.BALANCED ? 25 : 35,
        manifest.qrProfile === ProfileId.FAST ? 'M' : 'Q');
      const rgba = rasterizeQR(matrix, scale);
      if (fw === 0) { fw = rgba.width; fh = rgba.height; }
      qrFrames.push(new Uint8Array(rgba.data.buffer, rgba.data.byteOffset, rgba.data.byteLength));
    }

    const gifBytes = createQRGif(qrFrames, 300, fw, fh);
    const gifData = parseGif(gifBytes);

    expect(gifData.frames.length).toBe(schedule.length);
    console.log('GIF parsed frames:', gifData.frames.length);

    // Decode every frame
    let decodedCount = 0;
    const failures: number[] = [];
    for (let i = 0; i < gifData.frames.length; i++) {
      const rgba = renderGifFrame(gifData, i);
      const imageData = new ImageData(rgba, gifData.width, gifData.height);
      const qrResult = decodeQRFromCanvas(imageData);
      if (qrResult) {
        decodedCount++;
      } else {
        failures.push(i);
      }
    }

    console.log('Decoded:', decodedCount, '/', gifData.frames.length);
    console.log('Failures:', failures);
    expect(failures.length).toBe(0);
  });
});
