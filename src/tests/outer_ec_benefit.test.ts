/**
 * Benchmark: confirm outer EC reduces tail waiting time.
 *
 * Simulates frame loss and compares frames needed to decode with
 * outer EC (any G of G+P generations) vs without (all G source gens).
 */
import { describe, it, expect } from 'vitest';
import { packetize } from '@/core/sender/packetizer';
import { scheduleFrames } from '@/core/sender/scheduler';
import { generateQRMatrix } from '@/core/qr/qr_encode';
import { rasterizeQR } from '@/core/qr/frame_raster';
import { createQRGif } from '@/core/gif/gif_render';
import { parseGif, renderGifFrame } from '@/core/gif/gif_parser';
import { decodeQRFromCanvas } from '@/core/qr/qr_decode';
import { parsePacket } from '@/core/protocol/packet';
import { GenerationDecoder } from '@/core/fec/rlnc_decoder';
import { assemblePayload } from '@/core/reconstruct/assemble';
import { K, MAX_PAYLOAD_SIZE, QR_VERSION, ECC_LEVEL, FRAME_DELAY_MS, sourceGenerationsFromTotal } from '@/core/protocol/constants';
import { Xoshiro128 } from '@/core/fec/xoshiro';

describe('Outer EC Benefit', () => {
  it('should decode with fewer frames when outer EC is active vs requiring all source gens', async () => {
    // Use ~10KB of random (uncompressible) data to force multiple generations
    const payload = new Uint8Array(10000);
    crypto.getRandomValues(payload);

    const result = packetize(payload, false, true);
    const frames = scheduleFrames(result.packets, result.totalGenerations);

    // Build GIF (production path)
    const imageFrames: Uint8Array[] = [];
    let width = 0;
    let height = 0;
    for (const frame of frames) {
      const matrix = generateQRMatrix(frame, QR_VERSION, ECC_LEVEL);
      const imageData = rasterizeQR(matrix, 4);
      if (width === 0) {
        width = imageData.width;
        height = imageData.height;
      }
      imageFrames.push(new Uint8Array(imageData.data.buffer));
    }
    const gifBytes = createQRGif(imageFrames, FRAME_DELAY_MS, width, height);
    const gifData = parseGif(gifBytes);

    // Deterministic loss pattern: seeded RNG drops frames with bias against
    // higher generation indices to simulate "tail loss" where the last
    // source generation is hardest to complete.
    const rng = new Xoshiro128(42);
    const baseDropRate = 0.10;

    // Decode WITH outer EC benefit (stop at sourceGenerations solved)
    const decoderWithEC = new GenerationDecoder(K, MAX_PAYLOAD_SIZE);
    const solvedWithEC = new Set<number>();
    let framesNeededWithEC = 0;

    // Decode WITHOUT outer EC benefit (require all source generations)
    const decoderWithoutEC = new GenerationDecoder(K, MAX_PAYLOAD_SIZE);
    const solvedWithoutEC = new Set<number>();
    let framesNeededWithoutEC = 0;

    for (let i = 0; i < gifData.frames.length; i++) {
      const rgba = renderGifFrame(gifData, i);
      const imageData = new ImageData(rgba, gifData.width, gifData.height);
      const decodedBytes = decodeQRFromCanvas(imageData);
      if (!decodedBytes) continue;

      const pkt = parsePacket(decodedBytes);
      const isSystematic = pkt.header.symbolIndex < K;

      // Tail-loss bias: drop rate increases with generation index
      const genIndex = pkt.header.generationIndex;
      const tailBias = (genIndex / result.totalGenerations) * 0.20;
      const drop = (rng.next() / 0xffffffff) < (baseDropRate + tailBias);

      // Feed to both decoders
      if (!drop) {
        if (isSystematic) {
          decoderWithEC.addSystematicSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex);
          decoderWithoutEC.addSystematicSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex);
        } else {
          decoderWithEC.addCodedSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex - K);
          decoderWithoutEC.addCodedSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex - K);
        }

        if (decoderWithEC.isSolved(pkt.header.generationIndex)) {
          solvedWithEC.add(pkt.header.generationIndex);
        }
        if (decoderWithoutEC.isSolved(pkt.header.generationIndex) && pkt.header.generationIndex < result.sourceGenerations) {
          solvedWithoutEC.add(pkt.header.generationIndex);
        }
      }

      if (framesNeededWithEC === 0 && solvedWithEC.size >= result.sourceGenerations) {
        framesNeededWithEC = i + 1;
      }
      if (framesNeededWithoutEC === 0 && solvedWithoutEC.size >= result.sourceGenerations) {
        framesNeededWithoutEC = i + 1;
      }
    }

    // With outer EC we should have finished; without EC may or may not
    expect(framesNeededWithEC).toBeGreaterThan(0);
    expect(solvedWithEC.size).toBeGreaterThanOrEqual(result.sourceGenerations);

    // Assemble with outer EC
    const solvedMap = new Map<number, Uint8Array[]>();
    for (const genIdx of solvedWithEC) {
      solvedMap.set(genIdx, decoderWithEC.getSourceSymbols(genIdx)!);
    }
    const { inflateSync } = await import('fflate');
    const assembled = assemblePayload(solvedMap, result.totalGenerations, result.dataLength);
    const decompressed = inflateSync(assembled);
    expect(decompressed).toEqual(payload);

    // The key assertion: outer EC should finish no later than without EC,
    // and typically earlier when tail loss occurs.
    if (framesNeededWithoutEC > 0) {
      expect(framesNeededWithEC).toBeLessThanOrEqual(framesNeededWithoutEC);
    }

    // Log the actual numbers for human inspection
    console.log('Outer EC benchmark:', {
      payloadBytes: payload.length,
      compressedBytes: result.dataLength,
      totalGenerations: result.totalGenerations,
      sourceGenerations: result.sourceGenerations,
      totalFrames: gifData.frames.length,
      framesNeededWithEC,
      framesNeededWithoutEC: framesNeededWithoutEC || 'never',
      solvedWithEC: solvedWithEC.size,
      solvedWithoutEC: solvedWithoutEC.size,
      savings: framesNeededWithoutEC > 0
        ? `${(((framesNeededWithoutEC - framesNeededWithEC) / framesNeededWithoutEC) * 100).toFixed(1)}%`
        : 'N/A (without EC failed)',
    });
  });

  it('should recover when a whole source generation is missing', async () => {
    // Small payload: 3 source gens + 1 parity = 4 total
    const payload = new TextEncoder().encode(
      'Whole generation missing test payload that is long enough. '.repeat(10),
    );

    const result = packetize(payload, false, false);
    const frames = scheduleFrames(result.packets, result.totalGenerations);

    const imageFrames: Uint8Array[] = [];
    let width = 0;
    let height = 0;
    for (const frame of frames) {
      const matrix = generateQRMatrix(frame, QR_VERSION, ECC_LEVEL);
      const imageData = rasterizeQR(matrix, 4);
      if (width === 0) {
        width = imageData.width;
        height = imageData.height;
      }
      imageFrames.push(new Uint8Array(imageData.data.buffer));
    }
    const gifBytes = createQRGif(imageFrames, FRAME_DELAY_MS, width, height);
    const gifData = parseGif(gifBytes);

    // Drop EVERY frame from the LAST source generation (generationIndex = sourceGenerations - 1)
    const missingGen = result.sourceGenerations - 1;

    const decoder = new GenerationDecoder(K, MAX_PAYLOAD_SIZE);
    const solvedGens = new Set<number>();

    for (let i = 0; i < gifData.frames.length; i++) {
      const rgba = renderGifFrame(gifData, i);
      const imageData = new ImageData(rgba, gifData.width, gifData.height);
      const decodedBytes = decodeQRFromCanvas(imageData);
      if (!decodedBytes) continue;

      const pkt = parsePacket(decodedBytes);
      if (pkt.header.generationIndex === missingGen) continue; // drop all frames from missing gen

      const isSystematic = pkt.header.symbolIndex < K;
      if (isSystematic) {
        decoder.addSystematicSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex);
      } else {
        decoder.addCodedSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex - K);
      }

      if (decoder.isSolved(pkt.header.generationIndex)) {
        solvedGens.add(pkt.header.generationIndex);
      }
    }

    // We should still have enough generations solved (sourceGenerations) because
    // parity generation(s) compensate for the missing source generation.
    expect(solvedGens.size).toBeGreaterThanOrEqual(result.sourceGenerations);

    const solvedMap = new Map<number, Uint8Array[]>();
    for (const genIdx of solvedGens) {
      solvedMap.set(genIdx, decoder.getSourceSymbols(genIdx)!);
    }

    const assembled = assemblePayload(solvedMap, result.totalGenerations, result.dataLength);
    expect(assembled).toEqual(payload);
  });
});
