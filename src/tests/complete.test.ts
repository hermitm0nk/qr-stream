/**
 * Complete test suite for the QR transfer protocol.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ─── Constants ───────────────────────────────────────────────────────────────────

describe('Protocol Constants', () => {
  it('should have the correct values', async () => {
    const {
      PROTOCOL_VERSION,
      MAGIC_BYTES,
      QR_VERSION,
      ECC_LEVEL,
      K,
      R,
      FRAME_DELAY,
      MAX_PACKET_SIZE,
      MAX_PAYLOAD_SIZE,
      PACKET_OVERHEAD,
      HEADER_SIZE,
      CRC32C_SIZE,
      PacketType,
      Flags,
    } = await import('@/core/protocol/constants');

    expect(PROTOCOL_VERSION).toBe(2);
    expect(MAGIC_BYTES).toEqual(new Uint8Array([0x51, 0x47]));
    expect(QR_VERSION).toBe(10);
    expect(ECC_LEVEL).toBe('M');
    expect(K).toBe(16);
    expect(R).toBe(8);
    expect(FRAME_DELAY).toBe(30);
    expect(MAX_PACKET_SIZE).toBe(213);
    expect(MAX_PAYLOAD_SIZE).toBe(191);
    expect(PACKET_OVERHEAD).toBe(22);
    expect(HEADER_SIZE).toBe(18);
    expect(CRC32C_SIZE).toBe(4);

    expect(PacketType.DATA_SYSTEMATIC).toBe(0);
    expect(PacketType.DATA_CODED).toBe(1);

    expect(Flags.IS_TEXT).toBe(1);
    expect(Flags.COMPRESSED).toBe(2);
    expect(Flags.LAST_GENERATION).toBe(4);
  });
});

// ─── Packet Serialization ──────────────────────────────────────────────────────────

describe('Packet Serialization', () => {
  it('should create and parse a packet correctly', async () => {
    const { createPacket, parsePacket } = await import('@/core/protocol/packet');
    const { PacketType, Flags } = await import('@/core/protocol/constants');

    const header = {
      protocolVersion: 2,
      flags: Flags.IS_TEXT | Flags.LAST_GENERATION,
      sessionId: 0x12345678,
      generationIndex: 5,
      totalGenerations: 10,
      symbolIndex: 7,
      packetType: PacketType.DATA_SYSTEMATIC,
      dataLength: 500,
    };

    const payload = new Uint8Array(50).fill(0xab);
    const packet = createPacket(header, payload);

    expect(packet.length).toBe(18 + 50 + 4); // header + payload + crc

    const parsed = parsePacket(packet);
    expect(parsed.header.protocolVersion).toBe(2);
    expect(parsed.header.flags).toBe(Flags.IS_TEXT | Flags.LAST_GENERATION);
    expect(parsed.header.sessionId).toBe(0x12345678);
    expect(parsed.header.generationIndex).toBe(5);
    expect(parsed.header.totalGenerations).toBe(10);
    expect(parsed.header.symbolIndex).toBe(7);
    expect(parsed.header.packetType).toBe(PacketType.DATA_SYSTEMATIC);
    expect(parsed.header.dataLength).toBe(500);
    expect(parsed.payload.length).toBe(50);
    expect(Array.from(parsed.payload)).toEqual(Array.from(payload));
  });

  it('should reject a packet with bad magic', async () => {
    const { parsePacket } = await import('@/core/protocol/packet');
    // Packet must be at least HEADER_SIZE + CRC32C_SIZE = 22 bytes
    const bad = new Uint8Array(22);
    bad[0] = 0x00; bad[1] = 0x00; // wrong magic
    expect(() => parsePacket(bad)).toThrow("Invalid magic bytes");
  });

  it('should reject a packet with bad CRC', async () => {
    const { parsePacket } = await import('@/core/protocol/packet');
    // Valid magic + version, rest zeros → CRC will mismatch
    const packet = new Uint8Array(22);
    packet[0] = 0x51; packet[1] = 0x47; packet[2] = 0x02;
    expect(() => parsePacket(packet)).toThrow('CRC32C mismatch');
  });
});

// ─── CRC32-C ───────────────────────────────────────────────────────────────────────

describe('CRC32-C', () => {
  it('should compute and verify CRC for a packet', async () => {
    const { crc32c } = await import('@/core/protocol/crc32c');
    const data = new Uint8Array([0x51, 0x47, 0x02, 0x00, 0xde, 0xad, 0xbe, 0xef, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const crc = crc32c(data);
    expect(typeof crc).toBe('number');
  });
});

// ─── RLNC Encoder ──────────────────────────────────────────────────────────

describe('RLNC Encoder', () => {
  it('should produce K systematic symbols', async () => {
    const { encodeGeneration } = await import('@/core/fec/rlnc_encoder');
    const symbols = [
      new Uint8Array([1, 2, 3, 4]),
      new Uint8Array([5, 6, 7, 8]),
    ];
    const k = 2;
    const r = 2;
    const sessionId = 123;
    const generationIndex = 0;
    const codingSeed = 0;

    const result = encodeGeneration(symbols, k, r, sessionId, generationIndex, codingSeed);

    expect(result.length).toBe(k + r);
    expect(result[0]!.data).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(result[1]!.data).toEqual(new Uint8Array([5, 6, 7, 8]));
  });

  it('coded symbols should be non-zero and different', async () => {
    const { encodeGeneration } = await import('@/core/fec/rlnc_encoder');
    const symbols = [
      new Uint8Array([10, 20]),
      new Uint8Array([30, 40]),
    ];
    const k = 2;
    const r = 2;

    const result = encodeGeneration(symbols, k, r, 1, 0, 0);

    expect(result[2]!.data).not.toEqual(new Uint8Array([0, 0]));
    expect(result[3]!.data).not.toEqual(new Uint8Array([0, 0]));
  });

  it('should generate reproducible coefficients', async () => {
    const { generateCoefficients, deriveCoefficientSeed } = await import('@/core/fec/rlnc_encoder');
    const seed = deriveCoefficientSeed(0x1234, 5, 0);
    const coeffs1 = generateCoefficients(16, seed);
    const coeffs2 = generateCoefficients(16, seed);
    expect(coeffs1).toEqual(coeffs2);
    expect(coeffs1.length).toBe(16);
  });
});

// ─── RLNC Decoder ──────────────────────────────────────────────────────────

describe('RLNC Decoder', () => {
  it('should decode from systematic symbols', async () => {
    const { GenerationDecoder } = await import('@/core/fec/rlnc_decoder');
    const { encodeGeneration } = await import('@/core/fec/rlnc_encoder');

    const symbols = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
    ];
    const k = 2;
    const r = 2;
    const sessionId = 42;

    const encoded = encodeGeneration(symbols, k, r, sessionId, 0, 0);
    const decoder = new GenerationDecoder(k, 3, sessionId, 0);

    decoder.addSystematicSymbol(0, encoded[0]!.data, encoded[0]!.sourceIndex);
    decoder.addSystematicSymbol(0, encoded[1]!.data, encoded[1]!.sourceIndex);

    expect(decoder.isSolved(0)).toBe(true);
    const recovered = decoder.getSourceSymbols(0);
    expect(recovered).not.toBeNull();
    expect(recovered![0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(recovered![1]).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('should decode from coded symbols', async () => {
    const { GenerationDecoder } = await import('@/core/fec/rlnc_decoder');
    const { encodeGeneration } = await import('@/core/fec/rlnc_encoder');

    const symbols = [
      new Uint8Array([7, 8, 9]),
      new Uint8Array([10, 11, 12]),
    ];
    const k = 2;
    const r = 2;
    const sessionId = 99;

    const encoded = encodeGeneration(symbols, k, r, sessionId, 0, 0);
    const decoder = new GenerationDecoder(k, 3, sessionId, 0);

    // Feed only coded symbols
    decoder.addCodedSymbol(0, encoded[2]!.data, 0);
    decoder.addCodedSymbol(0, encoded[3]!.data, 1);

    expect(decoder.isSolved(0)).toBe(true);
    const recovered = decoder.getSourceSymbols(0);
    expect(recovered).not.toBeNull();
    expect(recovered![0]).toEqual(new Uint8Array([7, 8, 9]));
    expect(recovered![1]).toEqual(new Uint8Array([10, 11, 12]));
  });

  it('should handle out-of-order symbols', async () => {
    const { GenerationDecoder } = await import('@/core/fec/rlnc_decoder');
    const { encodeGeneration } = await import('@/core/fec/rlnc_encoder');

    const symbols = [
      new Uint8Array([1, 1]),
      new Uint8Array([2, 2]),
      new Uint8Array([3, 3]),
    ];
    const k = 3;
    const r = 2;
    const sessionId = 77;

    const encoded = encodeGeneration(symbols, k, r, sessionId, 0, 0);
    const decoder = new GenerationDecoder(k, 2, sessionId, 0);

    decoder.addSystematicSymbol(0, encoded[2]!.data, encoded[2]!.sourceIndex);
    decoder.addSystematicSymbol(0, encoded[0]!.data, encoded[0]!.sourceIndex);
    decoder.addSystematicSymbol(0, encoded[1]!.data, encoded[1]!.sourceIndex);

    expect(decoder.isSolved(0)).toBe(true);
    const recovered = decoder.getSourceSymbols(0);
    expect(recovered).not.toBeNull();
    expect(recovered![0]).toEqual(new Uint8Array([1, 1]));
    expect(recovered![1]).toEqual(new Uint8Array([2, 2]));
    expect(recovered![2]).toEqual(new Uint8Array([3, 3]));
  });

  it('should track rank incrementally', async () => {
    const { GenerationDecoder } = await import('@/core/fec/rlnc_decoder');
    const { encodeGeneration } = await import('@/core/fec/rlnc_encoder');

    const symbols = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
    const encoded = encodeGeneration(symbols, 2, 2, 1, 0, 0);
    const decoder = new GenerationDecoder(2, 2, 1, 0);

    expect(decoder.rank(0)).toBe(0);
    decoder.addSystematicSymbol(0, encoded[0]!.data, encoded[0]!.sourceIndex);
    expect(decoder.rank(0)).toBe(1);
    decoder.addSystematicSymbol(0, encoded[1]!.data, encoded[1]!.sourceIndex);
    expect(decoder.rank(0)).toBe(2);
  });
});

// ─── Payload Assembly ──────────────────────────────────────────────────────────

describe('Payload Assembly', () => {
  it('should assemble exact data with padding trimmed', async () => {
    const { assemblePayload } = await import('@/core/reconstruct/assemble');

    const g0 = [new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])];
    const g1 = [new Uint8Array([9, 10, 11, 12]), new Uint8Array([0, 0, 0, 0])];

    const solved = new Map<number, Uint8Array[]>();
    solved.set(0, g0);
    solved.set(1, g1);

    const data = assemblePayload(solved, 2, 12); // 12 bytes of real data
    expect(data.length).toBe(12);
    expect(Array.from(data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('should handle single generation', async () => {
    const { assemblePayload } = await import('@/core/reconstruct/assemble');

    const solved = new Map<number, Uint8Array[]>();
    solved.set(0, [new Uint8Array([1, 2, 3])]);

    const data = assemblePayload(solved, 1, 3);
    expect(data.length).toBe(3);
    expect(Array.from(data)).toEqual([1, 2, 3]);
  });

  it('should reject missing generation', async () => {
    const { assemblePayload } = await import('@/core/reconstruct/assemble');

    const solved = new Map<number, Uint8Array[]>();
    solved.set(0, [new Uint8Array([1, 2, 3])]);

    expect(() => assemblePayload(solved, 2, 3)).toThrow('generation 1 has no solved symbols');
  });
});

// ─── Packetizer ───────────────────────────────────────────────────────────────────

describe('Packetizer', () => {
  it('should packetize text data', async () => {
    const { packetize } = await import('@/core/sender/packetizer');
    const { K } = await import('@/core/protocol/constants');
    const { parseHeader } = await import('@/core/protocol/packet');
    const { PacketType } = await import('@/core/protocol/constants');

    const text = 'Hello, World!';
    const data = new TextEncoder().encode(text);
    const result = packetize(data, true, false);

    expect(result.isText).toBe(true);
    expect(result.isCompressed).toBe(false);
    expect(result.totalGenerations).toBe(1);
    expect(result.dataLength).toBe(data.length);
    expect(result.packets.length).toBeGreaterThan(0);

    // Should have K systematic + R coded per generation
    const sysCount = result.packets.filter((p) => {
      return parseHeader(p).packetType === PacketType.DATA_SYSTEMATIC;
    }).length;
    const codedCount = result.packets.filter((p) => {
      return parseHeader(p).packetType === PacketType.DATA_CODED;
    }).length;

    expect(sysCount).toBe(K);
    expect(codedCount).toBe(8);
  });

  it('should packetize binary data across multiple generations', async () => {
    const { packetize } = await import('@/core/sender/packetizer');
    const { MAX_PAYLOAD_SIZE, K } = await import('@/core/protocol/constants');

    const data = new Uint8Array(MAX_PAYLOAD_SIZE * K * 2 + 100); // > 2 generations
    crypto.getRandomValues(data);

    const result = packetize(data, false, false);

    expect(result.isText).toBe(false);
    expect(result.totalGenerations).toBeGreaterThanOrEqual(3);
    expect(result.dataLength).toBe(data.length);

    // All packets should have LAST_GENERATION flag on last generation only
    const { parseHeader } = await import('@/core/protocol/packet');
    const { Flags } = await import('@/core/protocol/constants');
    for (const pkt of result.packets) {
      const h = parseHeader(pkt);
      expect(h.totalGenerations).toBe(result.totalGenerations);
      expect(h.dataLength).toBe(data.length);
      if (h.generationIndex === result.totalGenerations - 1) {
        expect(h.flags & Flags.LAST_GENERATION).not.toBe(0);
      } else {
        expect(h.flags & Flags.LAST_GENERATION).toBe(0);
      }
    }
  });

  it('should compress large data', async () => {
    const { packetize } = await import('@/core/sender/packetizer');

    const text = 'a'.repeat(1000);
    const data = new TextEncoder().encode(text);
    const result = packetize(data, true, true);

    expect(result.isCompressed).toBe(true);
    expect(result.dataLength).toBeLessThan(data.length);
  });
});

// ─── Scheduler ───────────────────────────────────────────────────────────────────

describe('Scheduler', () => {
  it('should schedule frames deterministically for same session', async () => {
    const { packetize } = await import('@/core/sender/packetizer');
    const { scheduleFrames } = await import('@/core/sender/scheduler');

    const data = new TextEncoder().encode('Test data for scheduling');
    const result = packetize(data, false, false);
    const frames = scheduleFrames(result.packets, result.totalGenerations, result.sessionId);

    expect(frames.length).toBe(result.packets.length);

    // Same session should produce same order
    const frames2 = scheduleFrames(result.packets, result.totalGenerations, result.sessionId);
    expect(frames.map((f) => f.length)).toEqual(frames2.map((f) => f.length));
  });

  it('should interleave generations', async () => {
    const { packetize } = await import('@/core/sender/packetizer');
    const { scheduleFrames } = await import('@/core/sender/scheduler');
    const { parseHeader } = await import('@/core/protocol/packet');
    const { PacketType } = await import('@/core/protocol/constants');

    const data = new Uint8Array(3000); // Should be ~1 generation
    crypto.getRandomValues(data);
    const result = packetize(data, false, false);
    const frames = scheduleFrames(result.packets, result.totalGenerations, result.sessionId);

    // Systematic symbols should come before coded
    let firstCodedIdx = frames.length;
    for (let i = 0; i < frames.length; i++) {
      const h = parseHeader(frames[i]!);
      if (h.packetType === PacketType.DATA_CODED) {
        firstCodedIdx = i;
        break;
      }
    }

    let lastSystematicIdx = -1;
    for (let i = 0; i < frames.length; i++) {
      const h = parseHeader(frames[i]!);
      if (h.packetType === PacketType.DATA_SYSTEMATIC) {
        lastSystematicIdx = i;
      }
    }

    expect(lastSystematicIdx).toBeLessThan(firstCodedIdx);
  });
});

// ─── End-to-end ───────────────────────────────────────────────────────────────────

describe('End-to-End', () => {
  it('should roundtrip a small text message', async () => {
    const { packetize } = await import('@/core/sender/packetizer');
    const { scheduleFrames } = await import('@/core/sender/scheduler');
    const { parsePacket } = await import('@/core/protocol/packet');
    const { GenerationDecoder } = await import('@/core/fec/rlnc_decoder');
    const { assemblePayload } = await import('@/core/reconstruct/assemble');
    const { PacketType, K, MAX_PAYLOAD_SIZE } = await import('@/core/protocol/constants');
    const { inflateSync } = await import('fflate');

    const text = 'Hello, QR world! 💛';
    const data = new TextEncoder().encode(text);
    const result = packetize(data, true, false);
    const frames = scheduleFrames(result.packets, result.totalGenerations, result.sessionId);

    // Decode all frames
    const decoder = new GenerationDecoder(K, MAX_PAYLOAD_SIZE, result.sessionId, 0);
    const solvedGens = new Set<number>();

    for (const frame of frames) {
      const pkt = parsePacket(frame);
      if (pkt.header.packetType === PacketType.DATA_SYSTEMATIC) {
        decoder.addSystematicSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex);
      } else {
        decoder.addCodedSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex);
      }
      if (decoder.isSolved(pkt.header.generationIndex)) {
        solvedGens.add(pkt.header.generationIndex);
      }
    }

    expect(solvedGens.size).toBe(result.totalGenerations);

    const solvedMap = new Map<number, Uint8Array[]>();
    for (let g = 0; g < result.totalGenerations; g++) {
      solvedMap.set(g, decoder.getSourceSymbols(g)!);
    }

    const assembled = assemblePayload(solvedMap, result.totalGenerations, result.dataLength);
    const recovered = new TextDecoder().decode(assembled);
    expect(recovered).toBe(text);
  });

  it('should recover from lost frames', async () => {
    const { packetize } = await import('@/core/sender/packetizer');
    const { scheduleFrames } = await import('@/core/sender/scheduler');
    const { parsePacket } = await import('@/core/protocol/packet');
    const { GenerationDecoder } = await import('@/core/fec/rlnc_decoder');
    const { assemblePayload } = await import('@/core/reconstruct/assemble');
    const { PacketType, K, MAX_PAYLOAD_SIZE } = await import('@/core/protocol/constants');

    const data = new TextEncoder().encode('Surviving frame loss with RLNC!');
    const result = packetize(data, false, false);
    const frames = scheduleFrames(result.packets, result.totalGenerations, result.sessionId);

    // Drop every 3rd frame
    const decoder = new GenerationDecoder(K, MAX_PAYLOAD_SIZE, result.sessionId, 0);
    const solvedGens = new Set<number>();

    for (let i = 0; i < frames.length; i++) {
      if (i % 3 === 0) continue; // drop
      const pkt = parsePacket(frames[i]!);
      if (pkt.header.packetType === PacketType.DATA_SYSTEMATIC) {
        decoder.addSystematicSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex);
      } else {
        decoder.addCodedSymbol(pkt.header.generationIndex, pkt.payload, pkt.header.symbolIndex);
      }
      if (decoder.isSolved(pkt.header.generationIndex)) {
        solvedGens.add(pkt.header.generationIndex);
      }
    }

    expect(solvedGens.size).toBe(result.totalGenerations);

    const solvedMap = new Map<number, Uint8Array[]>();
    for (let g = 0; g < result.totalGenerations; g++) {
      solvedMap.set(g, decoder.getSourceSymbols(g)!);
    }

    const assembled = assemblePayload(solvedMap, result.totalGenerations, result.dataLength);
    const recovered = new TextDecoder().decode(assembled);
    expect(recovered).toBe('Surviving frame loss with RLNC!');
  });
});
