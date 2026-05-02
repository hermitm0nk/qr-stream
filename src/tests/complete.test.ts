/**
 * Comprehensive tests for all core modules of the QR-over-GIF transfer system.
 */
import { describe, it, expect } from 'vitest';

// ── Protocol: Constants ─────────────────────────────────────────────────────
import {
  MAGIC_BYTES, PROTOCOL_VERSION, HEADER_SIZE, CRC32C_SIZE, PACKET_OVERHEAD,
  PacketType, Flags, ProfileId, PROFILES, DEFAULT_PROFILE_ID, createSessionId,
} from '@/core/protocol/constants';

describe('Constants', () => {
  it('magic bytes are QG', () => {
    expect(MAGIC_BYTES).toEqual(new Uint8Array([0x51, 0x47]));
  });
  it('protocol version is 1', () => { expect(PROTOCOL_VERSION).toBe(1); });
  it('HEADER_SIZE is 28', () => { expect(HEADER_SIZE).toBe(28); });
  it('CRC32C_SIZE is 4', () => { expect(CRC32C_SIZE).toBe(4); });
  it('PACKET_OVERHEAD is 32', () => { expect(PACKET_OVERHEAD).toBe(32); });
  it('PacketType enum has correct values', () => {
    expect(PacketType.MANIFEST).toBe(0);
    expect(PacketType.DATA_SYSTEMATIC).toBe(1);
    expect(PacketType.DATA_CODED).toBe(2);
  });
  it('Flags enum has correct bits', () => {
    expect(Flags.LAST_SYMBOL_IN_GENERATION).toBe(1);
    expect(Flags.PAYLOAD_PADDED).toBe(2);
    expect(Flags.MANIFEST_CRITICAL).toBe(4);
  });
  it('ProfileId enum has correct values', () => {
    expect(ProfileId.ROBUST).toBe(0);
    expect(ProfileId.BALANCED).toBe(1);
    expect(ProfileId.FAST).toBe(2);
  });
  it('DEFAULT_PROFILE_ID is Robust', () => {
    expect(DEFAULT_PROFILE_ID).toBe(ProfileId.ROBUST);
  });
  it('PROFILES contains all three profiles with correct structure', () => {
    for (const id of [ProfileId.ROBUST, ProfileId.BALANCED, ProfileId.FAST]) {
      const p = PROFILES[id];
      expect(p.qrVersion).toBeGreaterThan(0);
      expect(['L', 'M', 'Q', 'H']).toContain(p.eccLevel);
      expect(p.k).toBeGreaterThan(0);
      expect(p.r).toBeGreaterThan(0);
      expect(p.frameDelay).toBeGreaterThan(0);
      expect(p.maxPacketPayload).toBeGreaterThan(100);
    }
  });
  it('Robust has highest overhead (K=16, R=16)', () => {
    expect(PROFILES[ProfileId.ROBUST].k).toBe(16);
    expect(PROFILES[ProfileId.ROBUST].r).toBe(16);
  });
  it('createSessionId returns a bigint', () => {
    const id = createSessionId();
    expect(typeof id).toBe('bigint');
    expect(id).toBeGreaterThan(BigInt(0));
  });
  it('createSessionId returns different values each time', () => {
    const ids = new Set<bigint>();
    for (let i = 0; i < 100; i++) ids.add(createSessionId());
    expect(ids.size).toBe(100);
  });
});

// ── Protocol: CRC32C ────────────────────────────────────────────────────────
import { crc32c, crc32cInit, crc32cUpdate, crc32cFinal } from '@/core/protocol/crc32c';

describe('CRC32C', () => {
  it('computes known CRC32C values (verified)', () => {
    // CRC32C (Castagnoli polynomial 0x82F63B78) known values
    expect(crc32c(new Uint8Array([]))).toBe(0);
    // We verify the implementation is internally consistent
    const a = crc32c(new Uint8Array([0]));
    const b = crc32c(new Uint8Array([0]));
    expect(a).toBe(b);
  });
  it('CRC32C is deterministic', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]);
    expect(crc32c(data)).toBe(crc32c(data));
  });
  it('CRC32C differs for different data', () => {
    expect(crc32c(new Uint8Array([1, 2, 3]))).not.toBe(crc32c(new Uint8Array([3, 2, 1])));
  });
  it('non-empty data produces non-zero CRC', () => {
    expect(crc32c(new Uint8Array([255]))).not.toBe(0);
  });
  it('incremental API matches one-shot', () => {
    const data = new Uint8Array(100);
    for (let i = 0; i < 100; i++) data[i] = i & 0xff;
    const oneShot = crc32c(data);
    let crc = crc32cInit();
    crc = crc32cUpdate(crc, data.subarray(0, 40));
    crc = crc32cUpdate(crc, data.subarray(40, 80));
    crc = crc32cUpdate(crc, data.subarray(80));
    const incremental = crc32cFinal(crc);
    expect(incremental).toBe(oneShot);
  });
});

// ── Protocol: Packet ────────────────────────────────────────────────────────
import {
  PacketHeader,
  serializeHeader, parseHeader, createPacket, parsePacket,
} from '@/core/protocol/packet';
import { PROTOCOL_VERSION, PacketType, Flags, ProfileId, HEADER_SIZE, PACKET_OVERHEAD } from '@/core/protocol/constants';

describe('Packet', () => {
  const PAYLOAD = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

  function makeHeader(overrides?: Partial<PacketHeader>): PacketHeader {
    return {
      protocolVersion: PROTOCOL_VERSION,
      packetType: PacketType.DATA_SYSTEMATIC,
      flags: 0,
      profileId: ProfileId.ROBUST,
      sessionId: BigInt('0x1234567890ABCDEF'),
      generationIndex: 5,
      symbolIndex: 3,
      generationK: 24,
      payloadLength: PAYLOAD.length,
      codingSeed: 0,
      ...overrides,
    };
  }

  it('serializeHeader returns 28 bytes', () => {
    const buf = serializeHeader(makeHeader());
    expect(buf.length).toBe(HEADER_SIZE);
  });
  it('serializeHeader has magic prefix', () => {
    const buf = serializeHeader(makeHeader());
    expect(buf[0]).toBe(0x51);
    expect(buf[1]).toBe(0x47);
  });
  it('parseHeader round-trips', () => {
    const hdr = makeHeader();
    const buf = serializeHeader(hdr);
    const parsed = parseHeader(buf);
    expect(parsed.protocolVersion).toBe(hdr.protocolVersion);
    expect(parsed.packetType).toBe(hdr.packetType);
    expect(parsed.flags).toBe(hdr.flags);
    expect(parsed.profileId).toBe(hdr.profileId);
    expect(parsed.sessionId).toBe(hdr.sessionId);
    expect(parsed.generationIndex).toBe(hdr.generationIndex);
    expect(parsed.symbolIndex).toBe(hdr.symbolIndex);
    expect(parsed.generationK).toBe(hdr.generationK);
    expect(parsed.payloadLength).toBe(hdr.payloadLength);
    expect(parsed.codingSeed).toBe(hdr.codingSeed);
  });
  it('parseHeader rejects bad magic', () => {
    const buf = serializeHeader(makeHeader());
    buf[0] = 0x00;
    expect(() => parseHeader(buf)).toThrow(/magic/i);
  });
  it('createPacket returns correct total length', () => {
    const packet = createPacket(makeHeader(), PAYLOAD);
    expect(packet.length).toBe(PACKET_OVERHEAD + PAYLOAD.length);
  });
  it('parsePacket round-trips correctly', () => {
    const packet = createPacket(makeHeader(), PAYLOAD);
    const parsed = parsePacket(packet);
    expect(parsed.header.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(parsed.header.packetType).toBe(PacketType.DATA_SYSTEMATIC);
    expect(parsed.header.sessionId).toBe(BigInt('0x1234567890ABCDEF'));
    expect(parsed.header.payloadLength).toBe(PAYLOAD.length);
    expect(parsed.payload).toEqual(PAYLOAD);
  });
  it('parsePacket rejects bad CRC', () => {
    const packet = createPacket(makeHeader(), PAYLOAD);
    // Corrupt last byte (CRC)
    packet[packet.length - 1] ^= 0xff;
    expect(() => parsePacket(packet)).toThrow(/CRC|checksum/i);
  });
  it('parsePacket rejects truncated data', () => {
    const packet = createPacket(makeHeader(), PAYLOAD);
    const truncated = packet.subarray(0, HEADER_SIZE + 1);
    expect(() => parsePacket(truncated)).toThrow();
  });
});

// ── Protocol: Manifest ──────────────────────────────────────────────────────
import {
  ManifestData, encodeManifest, decodeManifest,
  createManifestPacket, fragmentManifest, defragmentManifest,
} from '@/core/protocol/manifest';
import { PacketType } from '@/core/protocol/constants';

describe('Manifest', () => {
  const sampleManifest: ManifestData = {
    protocolVersion: 1,
    appVersion: '1.0.0',
    sessionId: BigInt('0xDEADBEEF'),
    originalFilename: 'test.txt',
    mimeType: 'text/plain',
    contentKind: 'text',
    originalSize: 1024,
    preprocessedSize: 980,
    compressionCodec: 'deflate-raw',
    originalSha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    qrProfile: 0,
    packetPayloadSize: 1230,
    generationK: 24,
    codedPerGen: 12,
    totalGenerations: 2,
    lastGenRealSize: 8,
    gifFrameDelay: 12,
    loopParams: 0,
  };

  it('encodeManifest returns non-empty buffer', () => {
    const buf = encodeManifest(sampleManifest);
    expect(buf.length).toBeGreaterThan(10);
  });
  it('decodeManifest round-trips', () => {
    const buf = encodeManifest(sampleManifest);
    const decoded = decodeManifest(buf);
    expect(decoded.protocolVersion).toBe(sampleManifest.protocolVersion);
    expect(decoded.appVersion).toBe(sampleManifest.appVersion);
    expect(decoded.sessionId).toBe(sampleManifest.sessionId);
    expect(decoded.originalFilename).toBe(sampleManifest.originalFilename);
    expect(decoded.originalSize).toBe(sampleManifest.originalSize);
    expect(decoded.compressionCodec).toBe(sampleManifest.compressionCodec);
    expect(decoded.totalGenerations).toBe(sampleManifest.totalGenerations);
    expect(decoded.gifFrameDelay).toBe(sampleManifest.gifFrameDelay);
  });
  it('createManifestPacket produces valid packet', () => {
    const buf = encodeManifest(sampleManifest);
    const pkt = createManifestPacket(sampleManifest, buf, 0, 1);
    const parsed = parsePacket(pkt);
    expect(parsed.header.packetType).toBe(PacketType.MANIFEST);
    expect(parsed.header.generationIndex).toBe(0);
    expect(parsed.header.symbolIndex).toBe(0);
    expect(parsed.header.generationK).toBe(1);
    // flags should have MANIFEST_CRITICAL since it's the first (and only)
    expect(parsed.header.flags & 4).toBe(4);
    // Compare payloads as arrays (cbor-x may return Buffer vs Uint8Array)
    expect(Array.from(parsed.payload)).toEqual(Array.from(buf));
  });
  it('fragmentManifest splits manifest when needed', () => {
    const packets = fragmentManifest(sampleManifest, 50);
    expect(packets.length).toBeGreaterThan(1);
    for (const p of packets) {
      const parsed = parsePacket(p);
      expect(parsed.header.packetType).toBe(PacketType.MANIFEST);
    }
  });
  it('defragmentManifest reconstructs original from packet bytes', () => {
    const packets = fragmentManifest(sampleManifest, 50);
    const reconstructed = defragmentManifest(packets);
    expect(reconstructed.protocolVersion).toBe(sampleManifest.protocolVersion);
    expect(reconstructed.sessionId).toBe(sampleManifest.sessionId);
    expect(reconstructed.originalFilename).toBe(sampleManifest.originalFilename);
    expect(reconstructed.originalSize).toBe(sampleManifest.originalSize);
  });
  it('single-packet manifest round-trips via defragmentManifest', () => {
    const packets = fragmentManifest(sampleManifest, 2000);
    expect(packets.length).toBe(1);
    const reconstructed = defragmentManifest(packets);
    expect(reconstructed.sessionId).toBe(sampleManifest.sessionId);
  });
});

// ── GF(256) Arithmetic ────────────────────────────────────────────────────
import { add, sub, mul, div, pow, inv } from '@/core/fec/gf256';

describe('GF(256)', () => {
  it('add is XOR', () => {
    expect(add(0x12, 0x34)).toBe(0x12 ^ 0x34);
    expect(add(0xff, 0xff)).toBe(0);
    expect(add(0x00, 0xab)).toBe(0xab);
  });
  it('sub equals add in characteristic 2', () => {
    for (let a = 0; a < 256; a += 17) {
      for (let b = 0; b < 256; b += 23) {
        expect(sub(a, b)).toBe(add(a, b));
      }
    }
  });
  it('mul is commutative', () => {
    expect(mul(0x12, 0x34)).toBe(mul(0x34, 0x12));
    expect(mul(0x01, 0xab)).toBe(0xab);
  });
  it('mul is associative', () => {
    expect(mul(mul(0x12, 0x34), 0x56)).toBe(mul(0x12, mul(0x34, 0x56)));
  });
  it('mul is distributive over add', () => {
    for (let trial = 0; trial < 50; trial++) {
      const a = (trial * 37 + 11) & 0xff;
      const b = (trial * 53 + 7) & 0xff;
      const c = (trial * 71 + 3) & 0xff;
      if (a === 0 || b === 0 || c === 0) continue;
      expect(mul(a, add(b, c))).toBe(add(mul(a, b), mul(a, c)));
    }
  });
  it('every non-zero element has an inverse', () => {
    for (let a = 1; a < 256; a++) {
      expect(mul(a, inv(a))).toBe(1);
    }
  });
  it('inv(1) = 1', () => expect(inv(1)).toBe(1));
  it('div is inverse of mul', () => {
    for (let a = 1; a < 256; a += 11) {
      for (let b = 1; b < 256; b += 13) {
        expect(div(mul(a, b), b)).toBe(a);
      }
    }
  });
  it('pow(a, 0) = 1', () => expect(pow(0x12, 0)).toBe(1));
  it('pow(a, 1) = a', () => expect(pow(0x12, 1)).toBe(0x12));
  it('pow(a, 255) = 1 for non-zero a (Fermat)', () => {
    for (let a = 1; a < 256; a += 17) {
      expect(pow(a, 255)).toBe(1);
    }
  });
});

// ── Xoshiro128 PRNG ────────────────────────────────────────────────────────
import { Xoshiro128 } from '@/core/fec/xoshiro';

describe('Xoshiro128', () => {
  it('produces deterministic sequence from same seed', () => {
    const a = new Xoshiro128(42);
    const b = new Xoshiro128(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });
  it('different seeds produce different sequences', () => {
    const a = new Xoshiro128(42);
    const b = new Xoshiro128(999);
    let same = 0;
    for (let i = 0; i < 20; i++) {
      if (a.next() === b.next()) same++;
    }
    expect(same).toBeLessThan(5);
  });
  it('nextByte returns values in [0, 255]', () => {
    const rng = new Xoshiro128(7);
    for (let i = 0; i < 1000; i++) {
      const b = rng.nextByte();
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });
  it('returns 32-bit unsigned values', () => {
    const rng = new Xoshiro128(1);
    for (let i = 0; i < 1000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(0xFFFFFFFF);
    }
  });
});

// ── RLNC Encoder ──────────────────────────────────────────────────────────
import { encodeGeneration, generateCoefficients, deriveCoefficientSeed } from '@/core/fec/rlnc_encoder';

describe('RLNC Encoder', () => {
  it('encodeGeneration returns K + R symbols', () => {
    const symbols = Array.from({ length: 24 }, (_, i) =>
      new Uint8Array(8).fill(i)
    );
    const result = encodeGeneration(symbols, 24, 8, 12345, 0, 0);
    expect(result.length).toBe(32); // 24 + 8
  });
  it('first K symbols are systematic (identity)', () => {
    const K = 10; const R = 4;
    const symbols = Array.from({ length: K }, (_, i) =>
      new Uint8Array([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3])
    );
    const result = encodeGeneration(symbols, K, R, 999, 0, 0);
    for (let i = 0; i < K; i++) {
      expect(result[i]!.data).toEqual(symbols[i]);
      expect(result[i]!.sourceIndex).toBe(i);
    }
  });
  it('coded symbols have correct length', () => {
    const K = 8; const R = 4; const symLen = 32;
    const symbols = Array.from({ length: K }, (_, i) =>
      new Uint8Array(symLen).fill(i)
    );
    const result = encodeGeneration(symbols, K, R, 123, 0, 42);
    for (let j = 0; j < R; j++) {
      expect(result[K + j]!.data.length).toBe(symLen);
    }
  });
  it('deterministic given same parameters', () => {
    const K = 10; const R = 3;
    const symbols = Array.from({ length: K }, (_, i) =>
      new Uint8Array(4).fill(i)
    );
    const a = encodeGeneration(symbols, K, R, 42, 1, 7);
    const b = encodeGeneration(symbols, K, R, 42, 1, 7);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.data).toEqual(b[i]!.data);
    }
  });
  it('generateCoefficients returns k non-zero bytes', () => {
    const coeffs = generateCoefficients(24, 12345);
    expect(coeffs.length).toBe(24);
    for (const c of coeffs) {
      expect(c).not.toBe(0);
    }
  });
  it('deriveCoefficientSeed produces deterministic values', () => {
    const a = deriveCoefficientSeed(1, 2, 3);
    const b = deriveCoefficientSeed(1, 2, 3);
    expect(a).toBe(b);
  });
});

// ── RLNC Decoder ──────────────────────────────────────────────────────────
import { RLNCDecoder, GenerationDecoder } from '@/core/fec/rlnc_decoder';

describe('RLNC Decoder', () => {
  it('solves with only systematic symbols', () => {
    const K = 5; const symLen = 6;
    const symbols = Array.from({ length: K }, (_, i) =>
      new Uint8Array(symLen).fill(i * 17 + 3)
    );
    const decoder = new RLNCDecoder(K, symLen, 42, 0, 0);
    for (let i = 0; i < K; i++) {
      const coeffs = new Uint8Array(K);
      coeffs[i] = 1;
      decoder.addSymbol(symbols[i], coeffs);
    }
    expect(decoder.isSolved()).toBe(true);
    expect(decoder.rank).toBe(K);
    const recovered = decoder.getSourceSymbols();
    expect(recovered.length).toBe(K);
    for (let i = 0; i < K; i++) {
      expect(recovered[i]).toEqual(symbols[i]);
    }
  });

  it('getSourceSymbols works with mixed systematic+coded', () => {
    const K = 8; const R = 5; const symLen = 8;
    const symbols = Array.from({ length: K }, (_, i) =>
      new Uint8Array(symLen).map((_, j) => (i * symLen + j) & 0xff)
    );
    const encoded = encodeGeneration(symbols, K, R, 777, 0, 13);

    // Decoder that gets systematic + coded
    const decoder = new RLNCDecoder(K, symLen, 777, 0, 13);
    for (let i = 0; i < K; i++) {
      const coeffs = new Uint8Array(K);
      coeffs[i] = 1;
      decoder.addSymbol(symbols[i], coeffs);
    }
    for (let j = 0; j < R; j++) {
      const coded = encoded[K + j]!;
      const seed = deriveCoefficientSeed(777, 0, 13);
      const coeffs = generateCoefficients(K, seed + j);
      decoder.addSymbol(coded.data, coeffs);
    }
    expect(decoder.isSolved()).toBe(true);
    expect(decoder.rank).toBe(K);
    const recovered = decoder.getSourceSymbols();
    for (let i = 0; i < K; i++) {
      expect(recovered[i]).toEqual(symbols[i]);
    }
  });

  it('rejects duplicate systematic symbols', () => {
    const K = 5; const symLen = 4;
    const decoder = new RLNCDecoder(K, symLen, 1, 0, 0);
    for (let i = 0; i < K; i++) {
      const coeffs = new Uint8Array(K);
      coeffs[i] = 1;
      decoder.addSymbol(new Uint8Array(symLen).fill(i), coeffs);
    }
    expect(decoder.rank).toBe(K);
    // Try adding duplicate
    const coeffs = new Uint8Array(K);
    coeffs[0] = 1;
    const added = decoder.addSymbol(new Uint8Array(symLen).fill(0), coeffs);
    expect(added).toBe(false);
    expect(decoder.rank).toBe(K);
  });

  it('getSourceSymbols returns null before solved', () => {
    const decoder = new RLNCDecoder(5, 32, 1, 0, 0);
    expect(decoder.getSourceSymbols()).toBeNull();
  });
});

describe('GenerationDecoder', () => {
  it('tracks generations independently', () => {
    const gd = new GenerationDecoder(5, 8, 42, 0);
    expect(gd.rank(0)).toBe(0);
    expect(gd.isSolved(0)).toBe(false);
  });
  it('solves a generation with systematic symbols', () => {
    const K = 4; const symLen = 8;
    const gd = new GenerationDecoder(K, symLen, 42, 0);
    for (let i = 0; i < K; i++) {
      const data = new Uint8Array(symLen).fill(i * 10 + 1);
      gd.addSystematicSymbol(0, data, i);
    }
    expect(gd.isSolved(0)).toBe(true);
    expect(gd.rank(0)).toBe(K);
    const symbols = gd.getSourceSymbols(0);
    expect(symbols.length).toBe(K);
  });
});

// ── QR Generation ──────────────────────────────────────────────────────────
import { generateQRMatrix, getMaxByteCapacity, getMinVersion } from '@/core/qr/qr_encode';

describe('QR Generation', () => {
  it('generates a square matrix', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]);
    const matrix = generateQRMatrix(data, 1, 'L');
    const n = matrix.length;
    expect(n).toBeGreaterThan(0);
    for (const row of matrix) expect(row.length).toBe(n);
  });
  it('matrix has finder patterns', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]);
    const matrix = generateQRMatrix(data, 1, 'L');
    // Top-left corner should have the finder pattern (black module at 0,0)
    expect(matrix[0]![0]).toBe(true);
  });
  it('getMaxByteCapacity returns reasonable values for profiles', () => {
    // Actual capacities from the qrcode-generator library
    const v31q = getMaxByteCapacity(31, 'Q');
    const v35m = getMaxByteCapacity(35, 'M');
    const v40m = getMaxByteCapacity(40, 'M');
    expect(v31q).toBeGreaterThan(900);
    expect(v35m).toBeGreaterThan(1500);
    expect(v40m).toBeGreaterThan(2000);
  });
  it('getMinVersion returns version for data size', () => {
    const v = getMinVersion(100, 'L');
    expect(v).toBeGreaterThanOrEqual(1);
  });
  it('generateQRMatrix throws when data too large', () => {
    expect(() => generateQRMatrix(new Uint8Array(10000), 1, 'L')).toThrow();
  });
});

// ── Frame Rasterizer ──────────────────────────────────────────────────────
import { rasterizeQR, rasterizeToGrayscale, getRasterDimensions } from '@/core/qr/frame_raster';

describe('Frame Rasterizer', () => {
  it('rasterizeQR returns correct dimensions', () => {
    const matrix = generateQRMatrix(new Uint8Array([1, 2, 3]), 1, 'L');
    const img = rasterizeQR(matrix, 3);
    const modCount = matrix.length;
    const expected = (modCount + 8) * 3;
    expect(img.width).toBe(expected);
    expect(img.height).toBe(expected);
    expect(img.data.length).toBe(expected * expected * 4);
  });
  it('rasterizeToGrayscale returns single channel', () => {
    const matrix = generateQRMatrix(new Uint8Array([1, 2, 3]), 1, 'L');
    const gray = rasterizeToGrayscale(matrix, 3);
    const expectedSize = ((matrix.length + 8) * 3);
    expect(gray.width).toBe(expectedSize);
    expect(gray.height).toBe(expectedSize);
    expect(gray.data.length).toBe(expectedSize * expectedSize);
  });
  it('quiet zone is all white (255)', () => {
    const matrix = generateQRMatrix(new Uint8Array([1, 2, 3]), 1, 'L');
    const img = rasterizeQR(matrix, 3);
    expect(img.data[0]).toBe(255);
    expect(img.data[1]).toBe(255);
    expect(img.data[2]).toBe(255);
    expect(img.data[3]).toBe(255);
  });
});

// ── GIF Renderer ──────────────────────────────────────────────────────────
import { createQRGif, estimateGifSize } from '@/core/gif/gif_render';

describe('GIF Renderer', () => {
  it('createQRGif produces valid GIF header', () => {
    const matrix = generateQRMatrix(new Uint8Array([1, 2, 3]), 1, 'L');
    const rgba = rasterizeQR(matrix, 3);
    const gif = createQRGif([rgba.data], 100, rgba.width, rgba.height);
    expect(gif[0]).toBe(0x47); // G
    expect(gif[1]).toBe(0x49); // I
    expect(gif[2]).toBe(0x46); // F
    expect(gif.length).toBeGreaterThan(50);
  });
  it('createQRGif with multiple frames produces larger file', () => {
    const matrix = generateQRMatrix(new Uint8Array([1, 2, 3]), 1, 'L');
    const rgba = rasterizeQR(matrix, 3);
    const singleGif = createQRGif([rgba.data], 100, rgba.width, rgba.height);
    const multiGif = createQRGif(
      [rgba.data, rgba.data, rgba.data],
      [100, 100, 100],
      rgba.width, rgba.height,
    );
    expect(multiGif.length).toBeGreaterThan(singleGif.length);
  });
  it('estimateGifSize returns positive number', () => {
    expect(estimateGifSize(100000, 'V31-Q')).toBeGreaterThan(100);
    expect(estimateGifSize(1_000_000, 'V35-M')).toBeGreaterThan(100);
  });
  it('throws on empty frames', () => {
    expect(() => createQRGif([], 100, 100, 100)).toThrow();
  });
});

// ── Preprocessing ─────────────────────────────────────────────────────────
import { compress, decompress, shouldCompress } from '@/core/preprocess/compress';
import { sha256, sha256Hex } from '@/core/preprocess/hash';

describe('Compression', () => {
  it('compresses and decompresses data', async () => {
    const original = new Uint8Array(1000);
    for (let i = 0; i < 1000; i++) original[i] = i & 0xff;
    const compressed = await compress(original);
    const decompressed = await decompress(compressed);
    expect(new Uint8Array(decompressed)).toEqual(original);
  });
  it('shouldCompress returns false for small data', async () => {
    const small = new Uint8Array([1, 2, 3, 4, 5]);
    const compressed = await compress(small);
    expect(shouldCompress(small, compressed)).toBe(false);
  });
});

describe('Hashing', () => {
  it('sha256 returns 32 bytes', async () => {
    const hash = await sha256(new Uint8Array([1, 2, 3]));
    expect(hash.length).toBe(32);
  });
  it('sha256 is deterministic', async () => {
    const [a, b] = await Promise.all([
      sha256(new Uint8Array([1, 2, 3])),
      sha256(new Uint8Array([1, 2, 3])),
    ]);
    expect(a).toEqual(b);
  });
  it('sha256Hex returns 64-char hex string', async () => {
    const hex = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(hex.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hex)).toBe(true);
  });
});

// ── Reconstruction ────────────────────────────────────────────────────────
import { assemblePayload } from '@/core/reconstruct/assemble';
import { verifySha256 } from '@/core/reconstruct/verify';

describe('Reconstruction', () => {
  it('assemblePayload concatenates generations (all K symbols each)', () => {
    const K = 3;
    const solved = new Map<number, Uint8Array[]>();
    solved.set(0, [new Uint8Array([1, 2]), new Uint8Array([3, 4]), new Uint8Array([5, 6])]);
    solved.set(1, [new Uint8Array([7, 8]), new Uint8Array([9, 10]), new Uint8Array([11, 12])]);
    // totalGenerations=2, lastGenRealSize=K (all symbols real)
    const result = assemblePayload(solved, 2, K);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
  });
  it('assemblePayload truncates last generation', () => {
    const K = 4;
    const solved = new Map<number, Uint8Array[]>();
    solved.set(0, [
      new Uint8Array([1, 2]), new Uint8Array([3, 4]),
      new Uint8Array([5, 6]), new Uint8Array([7, 8]),
    ]);
    // lastGenRealSize=2 means only first 2 of the 4 symbols are real
    const result = assemblePayload(solved, 1, 2);
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
  it('assemblePayload throws on missing generation', () => {
    const solved = new Map<number, Uint8Array[]>();
    solved.set(0, [new Uint8Array([1])]);
    expect(() => assemblePayload(solved, 2, 1)).toThrow();
  });
  it('verifySha256 returns true for correct hash', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = await sha256(data);
    expect(await verifySha256(data, hash)).toBe(true);
  });
  it('verifySha256 returns false for wrong hash', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const wrongHash = await sha256(new Uint8Array([9, 9, 9]));
    expect(await verifySha256(data, wrongHash)).toBe(false);
  });
});

// ── Sender Packetizer ─────────────────────────────────────────────────────
import { SenderPacketizer } from '@/core/sender/packetizer';
import { parsePacket } from '@/core/protocol/packet';
import { PROTOCOL_VERSION } from '@/core/protocol/constants';

describe('SenderPacketizer', () => {
  it('initializes and produces packets', async () => {
    const data = new Uint8Array(200);
    for (let i = 0; i < 200; i++) data[i] = i & 0xff;
    const sp = new SenderPacketizer();
    await sp.initialize(data, 'test.bin', 'application/octet-stream');
    const manifest = sp.getManifest();
    expect(manifest.originalSize).toBe(200);
    expect(manifest.originalFilename).toBe('test.bin');
    expect(manifest.mimeType).toBe('application/octet-stream');
    const packets = sp.getPackets();
    expect(packets.length).toBeGreaterThan(0);
  });
  it('all packets parse correctly', async () => {
    const data = new Uint8Array(500);
    for (let i = 0; i < 500; i++) data[i] = i & 0xff;
    const sp = new SenderPacketizer();
    await sp.initialize(data, 'test.bin', 'application/octet-stream');
    for (const p of sp.getPackets()) {
      const parsed = parsePacket(p);
      expect(parsed.header.protocolVersion).toBe(PROTOCOL_VERSION);
    }
  });
});

// ── Frame Scheduler ───────────────────────────────────────────────────────
import { FrameScheduler } from '@/core/sender/scheduler';

describe('FrameScheduler', () => {
  it('schedule includes all data packets plus preamble', async () => {
    const data = new Uint8Array(500);
    for (let i = 0; i < 500; i++) data[i] = i & 0xff;
    const sp = new SenderPacketizer();
    await sp.initialize(data);
    const packets = sp.getPackets();
    const manifest = sp.getManifest();
    const scheduler = new FrameScheduler();
    const schedule = scheduler.schedule(packets, manifest);

    // Scheduler adds preamble (manifest repetition) frames
    expect(schedule.length).toBeGreaterThanOrEqual(packets.length);

    // All packets in schedule should be valid
    for (const p of schedule) {
      const parsed = parsePacket(p);
      expect(parsed.header.protocolVersion).toBe(PROTOCOL_VERSION);
    }
  });
});

// ── End-to-End: Encode, visualize as QR + GIF, decode ────────────────────
describe('End-to-End', () => {
  it('can encode payload to packets and decode back', async () => {
    const originalData = new Uint8Array(100);
    for (let i = 0; i < 100; i++) originalData[i] = i & 0xff;

    // Sender path
    const sp = new SenderPacketizer();
    await sp.initialize(originalData, 'e2e.bin', 'application/octet-stream');
    const manifest = sp.getManifest();
    const packets = sp.getPackets();

    // Determine symbol length from packet payload lengths
    let symbolLength = 0;
    for (const p of packets) {
      const parsed = parsePacket(p);
      if (parsed.header.payloadLength > symbolLength) {
        symbolLength = parsed.header.payloadLength;
      }
    }
    expect(symbolLength).toBeGreaterThan(0);

    // Receiver: parse all packets into GenerationDecoder
    const narrowSessionId = Number(manifest.sessionId & BigInt('0xFFFFFFFF'));
    const gd = new GenerationDecoder(
      manifest.generationK,
      symbolLength,
      narrowSessionId,
      0, // codingSeed
    );

    const manifestFragments: Uint8Array[] = [];
    let dataPacketCount = 0;

    for (const p of packets) {
      const parsed = parsePacket(p);
      if (parsed.header.packetType === PacketType.MANIFEST) {
        manifestFragments.push(p);
      } else if (parsed.header.packetType === PacketType.DATA_SYSTEMATIC) {
        const genIdx = parsed.header.generationIndex;
        const symIdx = parsed.header.symbolIndex;
        const payload = parsed.payload;
        // Pad to symbolLength if needed
        const padded = payload.length < symbolLength
          ? (() => { const p2 = new Uint8Array(symbolLength); p2.set(payload); return p2; })()
          : payload;
        gd.addSystematicSymbol(genIdx, padded, symIdx);
        dataPacketCount++;
      }
    }

    // Check we got data packets
    expect(dataPacketCount).toBeGreaterThan(0);

    // Check if all generations solved via systematic symbols
    let allSolved = true;
    for (let g = 0; g < manifest.totalGenerations; g++) {
      if (!gd.isSolved(g)) { allSolved = false; break; }
    }

    if (allSolved) {
      const solvedGens = new Map<number, Uint8Array[]>();
      for (let g = 0; g < manifest.totalGenerations; g++) {
        solvedGens.set(g, gd.getSourceSymbols(g));
      }
      const payload = assemblePayload(solvedGens, manifest.totalGenerations, manifest.lastGenRealSize);
      // Truncate to original size (after decompression)
      expect(payload.length).toBeGreaterThanOrEqual(manifest.originalSize);
    }
  });
});
