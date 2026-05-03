/**
 * Production code path test: encode worker logic + gif worker logic.
 */
import { describe, it, expect } from 'vitest';
import { SenderPacketizer } from '@/core/sender/packetizer';
import { generateQRMatrix } from '@/core/qr/qr_encode';
import { rasterizeQR } from '@/core/qr/frame_raster';
import { createQRGif } from '@/core/gif/gif_render';
import { parseGif, renderGifFrame } from '@/core/gif/gif_parser';
import { decodeQRFromCanvas } from '@/core/qr/qr_decode';
import { ProfileId, PROFILES } from '@/core/protocol/constants';
import { fragmentManifest } from '@/core/protocol/manifest';
import { encodeGeneration } from '@/core/fec/rlnc_encoder';
import { createPacket, PacketHeader } from '@/core/protocol/packet';
import { PacketType, Flags, PROTOCOL_VERSION } from '@/core/protocol/constants';
import { deflateSync } from 'fflate';

describe('Production roundtrip', () => {
  it('should decode all frames using production code path', async () => {
    const text = 'Hello world this is a test of the QR GIF system with a bit more text to fill up some space.';
    const originalBytes = new TextEncoder().encode(text);
    const profileId = ProfileId.ROBUST;
    const profile = PROFILES[profileId];
    const compress = true;

    // --- Replicate encode.worker.ts logic ---
    let preprocessed: Uint8Array;
    if (compress) {
      preprocessed = deflateSync(originalBytes);
    } else {
      preprocessed = new Uint8Array(originalBytes);
    }

    const sessionId = 123456789n; // fixed for determinism
    const narrowSessionId = Number(sessionId & BigInt('0xFFFFFFFF'));
    const maxPayload = profile.maxPacketPayload;
    const K = profile.k;
    const R = profile.r;

    const symbols: Uint8Array[] = [];
    for (let offset = 0; offset < preprocessed.length; offset += maxPayload) {
      const chunk = preprocessed.slice(offset, offset + maxPayload);
      if (chunk.length < maxPayload) {
        const padded = new Uint8Array(maxPayload);
        padded.set(chunk);
        symbols.push(padded);
      } else {
        symbols.push(chunk);
      }
    }

    const totalSymbols = symbols.length;
    const totalGenerations = Math.max(1, Math.ceil(totalSymbols / K));

    const packets: Uint8Array[] = [];
    for (let gen = 0; gen < totalGenerations; gen++) {
      const startIdx = gen * K;
      const genSymbolsCount = Math.min(K, totalSymbols - startIdx);
      const isLastGen = gen === totalGenerations - 1;

      const genSourceSymbols: Uint8Array[] = [];
      for (let i = 0; i < K; i++) {
        if (i < genSymbolsCount) {
          genSourceSymbols.push(symbols[startIdx + i]!);
        } else {
          genSourceSymbols.push(new Uint8Array(maxPayload));
        }
      }

      const codedSymbols = encodeGeneration(genSourceSymbols, K, R, narrowSessionId, gen, 0);

      for (let i = 0; i < K; i++) {
        const cs = codedSymbols[i]!;
        const header: PacketHeader = {
          protocolVersion: PROTOCOL_VERSION,
          packetType: PacketType.DATA_SYSTEMATIC,
          flags: isLastGen && i >= genSymbolsCount ? Flags.PAYLOAD_PADDED : 0,
          profileId,
          sessionId,
          generationIndex: gen,
          symbolIndex: cs.sourceIndex,
          generationK: K,
          payloadLength: cs.data.length,
          codingSeed: 0,
        };
        packets.push(createPacket(header, cs.data));
      }

      for (let j = 0; j < R; j++) {
        const cs = codedSymbols[K + j]!;
        const header: PacketHeader = {
          protocolVersion: PROTOCOL_VERSION,
          packetType: PacketType.DATA_CODED,
          flags: isLastGen ? Flags.LAST_SYMBOL_IN_GENERATION : 0,
          profileId,
          sessionId,
          generationIndex: gen,
          symbolIndex: j,
          generationK: K,
          payloadLength: cs.data.length,
          codingSeed: 0,
        };
        packets.push(createPacket(header, cs.data));
      }
    }

    // Build manifest
    const manifest = {
      protocolVersion: PROTOCOL_VERSION,
      appVersion: '1.0.0',
      sessionId,
      originalFilename: 'test.txt',
      mimeType: 'text/plain',
      contentKind: 'file' as const,
      originalSize: originalBytes.length,
      preprocessedSize: preprocessed.length,
      compressionCodec: 'deflate-raw' as const,
      originalSha256: 'a'.repeat(64),
      qrProfile: profileId,
      packetPayloadSize: maxPayload,
      generationK: K,
      codedPerGen: R,
      totalGenerations,
      lastGenRealSize: totalSymbols - (totalGenerations - 1) * K,
      gifFrameDelay: profile.frameDelay,
      loopParams: 0,
    };

    const manifestPackets = fragmentManifest(manifest, maxPayload);
    const allPackets = [...manifestPackets, ...packets];

    console.log('Manifest fragments:', manifestPackets.length);
    console.log('Data packets:', packets.length);
    console.log('Total frames:', allPackets.length);

    // --- Replicate gif.worker.ts logic ---
    const qrVersion = profile.qrVersion;
    const eccLevel = profile.eccLevel;
    const moduleCount = qrVersion * 4 + 17;
    const targetPx = 360;
    const quietModules = 8;
    const totalModules = moduleCount + quietModules;
    const scale = Math.max(2, Math.round(targetPx / totalModules));

    const frames: Uint8Array[] = [];
    let width = 0, height = 0;
    for (const packet of allPackets) {
      const matrix = generateQRMatrix(packet, qrVersion, eccLevel);
      const imageData = rasterizeQR(matrix, scale);
      if (width === 0) { width = imageData.width; height = imageData.height; }
      frames.push(new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength));
    }

    const delayMs = profile.frameDelay * 10;
    const gifBytes = createQRGif(frames, delayMs, width, height);
    console.log('GIF size:', gifBytes.length);

    // --- Parse and decode ---
    const gifData = parseGif(gifBytes);
    console.log('Parsed frames:', gifData.frames.length);
    expect(gifData.frames.length).toBe(allPackets.length);

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
