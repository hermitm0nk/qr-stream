/**
 * Debug: dump GIF structure byte by byte.
 */
import { describe, it, expect } from 'vitest';
import { SenderPacketizer } from '@/core/sender/packetizer';
import { FrameScheduler } from '@/core/sender/scheduler';
import { generateQRMatrix } from '@/core/qr/qr_encode';
import { rasterizeQR } from '@/core/qr/frame_raster';
import { createQRGif } from '@/core/gif/gif_render';
import { parseGif, renderGifFrame, gifFrameToRgba } from '@/core/gif/gif_parser';
import { decodeQRFromCanvas } from '@/core/qr/qr_decode';

describe('gif structure debug', () => {
  it('dump GIF header, palette, and frame details', async () => {
    const data = new TextEncoder().encode('Hello test');
    const sp = new SenderPacketizer();
    await sp.initialize(data, 'test.txt', 'text/plain');
    const manifest = sp.getManifest();
    const packets = sp.getPackets();
    const scheduler = new FrameScheduler();
    const schedule = scheduler.schedule(packets, manifest);

    const scale = 3;
    const frames: Uint8Array[] = [];
    let fw = 0, fh = 0;
    for (const p of schedule) {
      const matrix = generateQRMatrix(p, 20, 'Q');
      const rgba = rasterizeQR(matrix, scale);
      if (fw === 0) { fw = rgba.width; fh = rgba.height; }
      frames.push(new Uint8Array(rgba.data.buffer));
    }

    const gifBytes = createQRGif(frames, 100, fw, fh);

    // Dump GIF header
    const header = new TextDecoder().decode(gifBytes.subarray(0, 6));
    console.log('Header:', header);
    const width = gifBytes[6]! | (gifBytes[7]! << 8);
    const height = gifBytes[8]! | (gifBytes[9]! << 8);
    const packed = gifBytes[10]!;
    console.log(`LSD: ${width}x${height}, packed=0x${packed.toString(16)}`);
    console.log(`  Global palette: ${!!(packed & 0x80)}, color res: ${(packed >> 4) & 0x07}, sort: ${!!(packed & 0x08)}, size field: ${packed & 0x07}`);
    
    const paletteSize = (packed & 0x07) + 1;
    const paletteEntryCount = 1 << paletteSize;
    console.log(`  Palette entries: ${paletteEntryCount}`);
    
    const gifPaletteOffset = 13; // after bg color index + pixel aspect ratio
    const gifPalette: number[][] = [];
    for (let i = 0; i < paletteEntryCount; i++) {
      const off = gifPaletteOffset + i * 3;
      gifPalette.push([gifBytes[off]!, gifBytes[off + 1]!, gifBytes[off + 2]!]);
    }
    console.log('GIF palette:', gifPalette.map((c, i) => `${i}: rgb(${c.join(',')})`).join('\n  '));

    // Parse with our parser
    const gifData = parseGif(gifBytes);
    console.log('\nParsed frames:', gifData.frames.length);
    console.log('Global palette:', gifData.globalPalette?.map((c,i)=>`${i}: rgb(${c.join(',')})`).join('\n  '));

    // Check each frame
    for (let i = 0; i < Math.min(gifData.frames.length, 5); i++) {
      const f = gifData.frames[i]!;
      console.log(`\nFrame ${i}:`);
      console.log(`  Size: ${f.width}x${f.height}, data.len: ${f.data.length}, expected: ${f.width * f.height}`);
      console.log(`  Palette:`, f.palette.map((c,i)=>`${i}: rgb(${c.join(',')})`).join(' '));
      console.log(`  Delay: ${f.delay}, disposal: ${f.disposal}, left: ${f.left}, top: ${f.top}`);

      // Check if data length matches
      const expected = f.width * f.height;
      if (f.data.length !== expected) {
        console.log(`  ⚠ DATA LENGTH MISMATCH: ${f.data.length} vs ${expected}`);
      }

      // Sample pixel values
      const sample = Array.from(f.data.slice(0, 20));
      console.log(`  First 20 pixel indices:`, sample.join(','));

      // Try rendering and decode
      const rgba = gifFrameToRgba(f);
      const blackPixels = countBlack(rgba, f.width, f.height);
      console.log(`  Black pixels: ${blackPixels}/${expected} (${(blackPixels/expected*100).toFixed(1)}%)`);

      const canvas = renderGifFrame(gifData, i);
      const blackCanvas = countBlack(canvas, gifData.width, gifData.height);
      console.log(`  Canvas black: ${blackCanvas}/${gifData.width*gifData.height} (${(blackCanvas/(gifData.width*gifData.height)*100).toFixed(1)}%)`);

      const imageData = new ImageData(canvas, gifData.width, gifData.height);
      const qr = decodeQRFromCanvas(imageData);
      console.log(`  QR decode: ${qr ? `OK (${qr.length} bytes)` : 'FAIL'}`);
    }
  });
});

function countBlack(rgba: Uint8ClampedArray, w: number, h: number): number {
  let black = 0;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4]! < 128) black++;
  }
  return black;
}
