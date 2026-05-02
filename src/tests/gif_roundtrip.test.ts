/**
 * End-to-end: encode → QR → GIF → parse GIF → decode QR → reconstruct.
 * Separate from complete.test.ts to avoid module state interactions.
 */
import { describe, it, expect } from 'vitest';
import { SenderPacketizer } from '@/core/sender/packetizer';
import { FrameScheduler } from '@/core/sender/scheduler';
import { generateQRMatrix } from '@/core/qr/qr_encode';
import { rasterizeQR } from '@/core/qr/frame_raster';
import { createQRGif } from '@/core/gif/gif_render';
import { parseGif, gifFrameToRgba } from '@/core/gif/gif_parser';
import { decodeQRFromBuffer } from '@/core/qr/qr_decode';
import { parsePacket } from '@/core/protocol/packet';
import { PacketType } from '@/core/protocol/constants';
import { GenerationDecoder } from '@/core/fec/rlnc_decoder';
import { assemblePayload } from '@/core/reconstruct/assemble';

describe('GIF roundtrip', () => {
  it('should encode lorem ipsum, create GIF, parse and reconstruct', async () => {
    const text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
    const data = new TextEncoder().encode(text);

    const sp = new SenderPacketizer();
    await sp.initialize(data, 'lorem.txt', 'text/plain');
    const manifest = sp.getManifest();
    const packets = sp.getPackets();
    const scheduler = new FrameScheduler();
    const schedule = scheduler.schedule(packets, manifest);
    expect(schedule.length).toBeGreaterThan(0);

    // QR frames
    const scale = 3;
    const qrFrames: Uint8Array[] = [];
    let fw = 0, fh = 0;
    for (const p of schedule) {
      const matrix = generateQRMatrix(p, 20, 'Q');
      const rgba = rasterizeQR(matrix, scale);
      if (fw === 0) { fw = rgba.width; fh = rgba.height; }
      qrFrames.push(new Uint8Array(rgba.data.buffer));
    }

    // GIF
    const gifBytes = createQRGif(qrFrames, 300, fw, fh);
    const gifData = parseGif(gifBytes);
    expect(gifData.frames.length).toBe(schedule.length);

    // Decode frames
    const decoded: Uint8Array[] = [];
    for (const frame of gifData.frames) {
      const rgba = gifFrameToRgba(frame);
      const gray = new Uint8Array(frame.width * frame.height);
      for (let p = 0; p < frame.width * frame.height; p++) {
        gray[p] = rgba[p * 4]! < 128 ? 0 : 255;
      }
      const qr = decodeQRFromBuffer(gray, frame.width, frame.height);
      if (qr) {
        const bytes = new Uint8Array(qr.length);
        for (let j = 0; j < qr.length; j++) bytes[j] = qr.charCodeAt(j) & 0xff;
        decoded.push(bytes);
      }
    }
    expect(decoded.length).toBeGreaterThan(0);

    // RLNC decode
    const maxPl = manifest.packetPayloadSize;
    const sid = Number(manifest.sessionId & BigInt('0xFFFFFFFF'));
    const gd = new GenerationDecoder(manifest.generationK, maxPl, sid, 0);

    for (const bytes of decoded) {
      try {
        const p = parsePacket(bytes);
        if (p.header.packetType === PacketType.DATA_SYSTEMATIC) {
          const pl = p.payload;
          const padded = pl.length < maxPl
            ? (() => { const p2 = new Uint8Array(maxPl); p2.set(pl); return p2; })()
            : pl;
          gd.addSystematicSymbol(p.header.generationIndex, padded, p.header.symbolIndex);
        }
      } catch { /* skip */ }
    }

    let ok = true;
    for (let g = 0; g < manifest.totalGenerations; g++) {
      if (!gd.isSolved(g)) { ok = false; break; }
    }
    expect(ok).toBe(true);

    const gens = new Map<number, Uint8Array[]>();
    for (let g = 0; g < manifest.totalGenerations; g++) {
      gens.set(g, gd.getSourceSymbols(g)!);
    }
    const payload = assemblePayload(gens, manifest.totalGenerations, manifest.lastGenRealSize);
    expect(payload.slice(0, data.length)).toEqual(data);
  });
});
