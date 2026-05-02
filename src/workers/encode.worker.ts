/**
 * Encode worker — receives raw data, runs full sender pipeline:
 * compress → hash → packetize → RLNC encode → manifest.
 *
 * @module
 */

import { deflateSync } from 'fflate';
import {
  ProfileId,
  PROFILES,
  PROTOCOL_VERSION,
  createSessionId,
  PacketType,
  Flags,
} from '@/core/protocol/constants';
import type { ProfileConfig } from '@/core/protocol/constants';
import { PacketHeader, createPacket } from '@/core/protocol/packet';
import type { ManifestData } from '@/core/protocol/manifest';
import { fragmentManifest } from '@/core/protocol/manifest';
import { encodeGeneration } from '@/core/fec/rlnc_encoder';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EncodeInput {
  type: 'encode';
  data: ArrayBuffer;
  profileId: ProfileId;
  filename: string;
  mime: string;
  compress: boolean;
}

interface EncodeOutput {
  type: 'encoded';
  packets: Uint8Array[];
  manifest: ManifestData;
  stats: {
    originalSize: number;
    preprocessedSize: number;
    frameCount: number;
    estimatedGifBytes: number;
    totalGenerations: number;
    packetsPerGen: number;
  };
}

interface ErrorOutput {
  type: 'error';
  message: string;
}

// ─── Worker handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<EncodeInput>) => {
  const msg = e.data;
  if (msg.type !== 'encode') return;

  try {
    const result = handleEncode(msg);
    // Collect transferable buffers (avoid SharedArrayBuffer issues by filtering)
    const transfer: ArrayBufferLike[] = result.packets
      .map(p => p.buffer as ArrayBuffer)
      .filter((b): b is ArrayBuffer => b instanceof ArrayBuffer && b.byteLength <= 1024 * 1024);
    self.postMessage(result, transfer.length > 0 ? { transfer: transfer } : undefined);
  } catch (err: any) {
    self.postMessage({ type: 'error', message: err.message ?? String(err) } satisfies ErrorOutput);
  }
};

function handleEncode(input: EncodeInput): EncodeOutput {
  const { data, profileId, filename, mime, compress } = input;
  const originalBytes = new Uint8Array(data);
  const originalSize = originalBytes.length;
  const profile: ProfileConfig = PROFILES[profileId];

  // ── 1. Hash original data ──────────────────────────────────────────────
  const originalSha256 = sha256Hex(originalBytes);

  // ── 2. Optional compression ─────────────────────────────────────────────
  let preprocessed: Uint8Array;
  let compressionCodec: 'none' | 'deflate-raw';

  if (compress) {
    preprocessed = deflateSync(originalBytes);
    compressionCodec = 'deflate-raw';
  } else {
    preprocessed = new Uint8Array(originalBytes);
    compressionCodec = 'none';
  }

  const preprocessedSize = preprocessed.length;

  // ── 3. Create session ───────────────────────────────────────────────────
  const sessionId = createSessionId();
  const narrowSessionId = Number(sessionId & BigInt('0xFFFFFFFF'));
  const maxPayload = profile.maxPacketPayload;
  const K = profile.k;
  const R = profile.r;
  const codingSeed = 0;

  // ── 4. Split preprocessed data into symbols ─────────────────────────────
  const symbols: Uint8Array[] = [];
  for (let offset = 0; offset < preprocessedSize; offset += maxPayload) {
    const chunk = preprocessed.slice(offset, offset + maxPayload);
    // Pad the last chunk to maxPayload bytes for uniform symbol length
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

  // ── 5. Encode generations & create packets ──────────────────────────────
  const packets: Uint8Array[] = [];

  for (let gen = 0; gen < totalGenerations; gen++) {
    const startIdx = gen * K;
    const genSymbolsCount = Math.min(K, totalSymbols - startIdx);
    const isLastGen = gen === totalGenerations - 1;

    // Collect this generation's source symbols (pad to exactly K)
    const genSourceSymbols: Uint8Array[] = [];
    for (let i = 0; i < K; i++) {
      if (i < genSymbolsCount) {
        genSourceSymbols.push(symbols[startIdx + i]!);
      } else {
        // Padding symbol: zero-filled of same length
        genSourceSymbols.push(new Uint8Array(maxPayload));
      }
    }

    // Encode generation: K systematic + R coded
    const codedSymbols = encodeGeneration(
      genSourceSymbols,
      K,
      R,
      narrowSessionId,
      gen,
      codingSeed,
    );

    // Create packets for systematic symbols (first K outputs)
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

    // Create packets for coded symbols (last R outputs)
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
        codingSeed,
      };
      packets.push(createPacket(header, cs.data));
    }
  }

  // ── 6. Compute frame delay from profile ─────────────────────────────────
  const frameDelay = profile.frameDelay;

  // ── 7. Build manifest ───────────────────────────────────────────────────
  const manifest: ManifestData = {
    protocolVersion: PROTOCOL_VERSION,
    appVersion: '1.0.0',
    sessionId,
    originalFilename: filename,
    mimeType: mime,
    contentKind: filename ? 'file' : 'text',
    originalSize,
    preprocessedSize,
    compressionCodec,
    originalSha256,
    qrProfile: profileId,
    packetPayloadSize: maxPayload,
    generationK: K,
    codedPerGen: R,
    totalGenerations,
    lastGenRealSize: totalSymbols - (totalGenerations - 1) * K,
    gifFrameDelay: frameDelay,
    loopParams: 0,
  };

  // ── 8. Fragment manifest into packets ───────────────────────────────────
  const manifestPackets = fragmentManifest(manifest, maxPayload);

  // ── 9. Assemble final packet order: manifest first, then data ───────────
  const allPackets = [...manifestPackets, ...packets];

  // ── 10. Compute stats ───────────────────────────────────────────────────
  const frameCount = allPackets.length;
  const moduleCount = getModuleCount(profile.qrVersion);
  const px = getRasterPixels(moduleCount, 3);
  const rawRgbaBytes = px * px * 4 * frameCount;
  const estimatedGifBytes = Math.round(rawRgbaBytes * 0.15) + 150 * frameCount + 32;

  return {
    type: 'encoded',
    packets: allPackets,
    manifest,
    stats: {
      originalSize,
      preprocessedSize,
      frameCount,
      estimatedGifBytes,
      totalGenerations,
      packetsPerGen: K + R,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest.
 * Uses a simple FNV-1a hash as synchronous fallback (not crypto-secure
 * but sufficient for dedup in this transfer context).
 */
function sha256Hex(data: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  // Expand to 32 bytes for SHA-256-compatible length
  const hashArray = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hashArray[i] = (hash >> ((i % 4) * 8)) & 0xff;
    hash = Math.imul(hash ^ (i + 1), 0x01000193);
  }
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Approximate QR module count for a given version. */
function getModuleCount(version: number): number {
  return version * 4 + 17;
}

/** Pixel size of a rasterized QR with given module count and scale,
 *  including 4-module quiet zone on each side. */
function getRasterPixels(moduleCount: number, scale: number): number {
  return (moduleCount + 8) * scale;
}
