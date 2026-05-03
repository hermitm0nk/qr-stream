/**
 * Decode worker — receives camera frames, decodes QR codes, parses
 * packets, routes to GenerationDecoder, tracks progress, and signals
 * when reconstruction is complete.
 *
 * Maintains state between messages (generation decoders, dedup sets,
 * manifest fragments).
 *
 * @module
 */

import { inflateSync } from 'fflate';
import { decodeQRFromCanvas } from '@/core/qr/qr_decode';
import { parsePacket } from '@/core/protocol/packet';
import type { Packet } from '@/core/protocol/packet';
import {
  PacketType,
  PROFILES,
} from '@/core/protocol/constants';
import type { ProfileConfig } from '@/core/protocol/constants';
import { defragmentManifest } from '@/core/protocol/manifest';
import type { ManifestData } from '@/core/protocol/manifest';
import { GenerationDecoder } from '@/core/fec/rlnc_decoder';

// ─── Session state ───────────────────────────────────────────────────────────

interface SessionState {
  sessionKey: string;
  manifest: ManifestData | null;
  manifestFragments: Uint8Array[];
  decoder: GenerationDecoder | null;
  dedup: Set<string>;
  receivedPackets: number;
  solvedGenerations: Set<number>;
  stats: {
    framesDecoded: number;
    framesWithQR: number;
  };
  profile: ProfileConfig | null;
  /** Set to true once reconstruction is done so late frames are ignored. */
  completed: boolean;
}

// Worker-global state (keyed by sessionId.toString())
const sessions = new Map<string, SessionState>();

// ─── Worker handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'reset') {
    sessions.clear();
    return;
  }

  if (msg.type === 'frame') {
    let imageData: ImageData | null = msg.imageData ?? msg.frameData ?? null;
    if (!imageData && msg.pixels && msg.width && msg.height) {
      try {
        imageData = new ImageData(
          new Uint8ClampedArray(msg.pixels),
          msg.width,
          msg.height,
        );
      } catch (e: any) {
        self.postMessage({ type: 'error', message: 'ImageData failed: ' + e.message });
        return;
      }
    }
    if (!imageData) return;
    try {
      handleFrame(imageData!);
    } catch (err: any) {
      self.postMessage({ type: 'error', message: `Frame error: ${err.message ?? String(err)}` });
    }
    return;
  }
};

// ─── Frame handling ──────────────────────────────────────────────────────────

function handleFrame(imageData: ImageData): void {
  // 1. Decode QR code from image
  const decoded = decodeQRFromCanvas(imageData);
  if (!decoded) return; // No QR code found in this frame

  // 2. Decoded is already Uint8Array (raw bytes from jsQR chunks)
  const bytes = decoded;

  // 3. Parse packet
  let packet: Packet;
  try {
    packet = parsePacket(bytes);
  } catch {
    return; // Invalid packet, skip silently
  }

  const h = packet.header;
  const sessionKey = h.sessionId.toString();

  // 4. Get or create session state
  let state = sessions.get(sessionKey);
  if (!state) {
    state = {
      sessionKey,
      manifest: null,
      manifestFragments: [],
      decoder: null,
      dedup: new Set(),
      receivedPackets: 0,
      solvedGenerations: new Set(),
      stats: { framesDecoded: 0, framesWithQR: 0 },
      profile: null,
      completed: false,
    };
    sessions.set(sessionKey, state);
  }

  // If this session is already reconstructed, ignore late frames
  if (state.completed) return;

  state.stats.framesDecoded++;

  // 5. Dedup: skip already-seen (sessionId:generationIndex:packetType:symbolIndex)
  // Include packetType so manifest fragments don't collide with data symbols.
  const dedupKey = `${sessionKey}:${h.generationIndex}:${h.packetType}:${h.symbolIndex}`;
  if (state.dedup.has(dedupKey)) return;
  state.dedup.add(dedupKey);
  state.stats.framesWithQR++;

  // 6. Route by packet type
  if (h.packetType === PacketType.MANIFEST) {
    handleManifestPacket(state, bytes);
  } else if (
    h.packetType === PacketType.DATA_SYSTEMATIC ||
    h.packetType === PacketType.DATA_CODED
  ) {
    handleDataPacket(state, packet);
  }

  // If reconstruction just completed, don't send a trailing progress message
  if (state.completed) return;

  // 7. Report progress back to main thread
  reportProgress(state);
}

// ─── Manifest packet — accumulate fragments, defrag when complete ────────────

function handleManifestPacket(state: SessionState, packetBytes: Uint8Array): void {
  state.manifestFragments.push(packetBytes);
  if (state.manifest) return; // Already have full manifest

  try {
    const manifest = defragmentManifest(state.manifestFragments);
    state.manifest = manifest;
    state.profile = PROFILES[manifest.qrProfile];

    // Create GenerationDecoder with manifest parameters
    // sessionId is bigint; narrow to 32-bit number for RLNC
    const sessionIdNum = Number(manifest.sessionId & BigInt('0xFFFFFFFF'));
    state.decoder = new GenerationDecoder(
      manifest.generationK,
      manifest.packetPayloadSize,
      sessionIdNum,
      0, // codingSeed — matches encoder default
    );
  } catch {
    // Not all fragments collected yet; that's expected
  }
}

// ─── Data packet — feed to generation decoder ────────────────────────────────

function handleDataPacket(state: SessionState, packet: Packet): void {
  if (!state.decoder || !state.manifest) return;

  const h = packet.header;
  const gen = h.generationIndex;
  const decoder = state.decoder;

  let accepted = false;

  if (h.packetType === PacketType.DATA_SYSTEMATIC) {
    // Systematic: coefficient vector has a single 1 at sourceIndex
    accepted = decoder.addSystematicSymbol(gen, packet.payload, h.symbolIndex);
  } else {
    // Coded: derive coefficients from codedSymbolIndex (stored in symbolIndex)
    accepted = decoder.addCodedSymbol(gen, packet.payload, h.symbolIndex);
  }

  if (accepted) {
    state.receivedPackets++;

    if (decoder.isSolved(gen)) {
      state.solvedGenerations.add(gen);

      // Check if all generations solved
      if (state.solvedGenerations.size >= state.manifest.totalGenerations) {
        reconstructData(state);
      }
    }
  }
}

// ─── Reconstruct original data from all source symbols ──────────────────────

function reconstructData(state: SessionState): void {
  const manifest = state.manifest!;
  const decoder = state.decoder!;

  // Accumulate preprocessed data from each generation's source symbols
  const preprocessedParts: Uint8Array[] = [];
  const payloadSize = manifest.packetPayloadSize;
  const k = manifest.generationK;

  for (let gen = 0; gen < manifest.totalGenerations; gen++) {
    const symbols = decoder.getSourceSymbols(gen);
    if (!symbols) {
      self.postMessage({
        type: 'error',
        sessionId: state.sessionKey,
        message: `Generation ${gen} not solved — reconstruction aborted`,
      });
      return;
    }

    // Only take the real symbols (not padding)
    const isLastGen = gen === manifest.totalGenerations - 1;
    const realCount = isLastGen ? manifest.lastGenRealSize : k;

    for (let i = 0; i < realCount; i++) {
      const sym = symbols[i]!;
      preprocessedParts.push(new Uint8Array(sym)); // copy
    }
  }

  // Concatenate parts, respecting exact preprocessed size
  const totalSize = manifest.preprocessedSize;
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of preprocessedParts) {
    const remaining = totalSize - offset;
    if (remaining <= 0) break;
    const len = Math.min(part.length, remaining);
    combined.set(part.subarray(0, len), offset);
    offset += len;
  }

  // Handle compression
  let finalData: Uint8Array;
  if (manifest.compressionCodec === 'deflate-raw') {
    try {
      finalData = inflateSync(combined);
    } catch (err) {
      self.postMessage({
        type: 'error',
        sessionId: state.sessionKey,
        message: 'Decompression failed — data may be corrupted',
      });
      return;
    }
  } else {
    finalData = combined;
  }

  // Determine output filename
  const filename = manifest.originalFilename || `recovered-${state.sessionKey.slice(0, 8)}`;

  // Signal completion — use transferable
  self.postMessage(
    {
      type: 'complete',
      sessionId: state.sessionKey,
      data: finalData.buffer,
      filename,
      mime: manifest.mimeType,
    },
    { transfer: [finalData.buffer as ArrayBuffer] },
  );

  // Mark session completed so late frames are silently ignored
  state.completed = true;
}

// ─── Progress reporting ──────────────────────────────────────────────────────

function reportProgress(state: SessionState): void {
  const totalGens = state.manifest?.totalGenerations ?? 0;
  const solvedGens = state.solvedGenerations.size;

  self.postMessage({
    type: 'progress',
    sessionId: state.sessionKey,
    framesDecoded: state.stats.framesDecoded,
    framesWithQR: state.stats.framesWithQR,
    receivedPackets: state.receivedPackets,
    solvedGenerations: solvedGens,
    totalGenerations: totalGens,
    status: state.manifest
      ? solvedGens >= totalGens
        ? 'Reconstructing…'
        : `Receiving (${solvedGens}/${totalGens} gens)`
      : 'Receiving manifest…',
  });
}
