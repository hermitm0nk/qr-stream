/**
 * Decode worker — receives camera/GIF frames, decodes QR codes, parses
 * packets, routes to GenerationDecoder, and signals completion.
 *
 * @module
 */

import { inflateSync } from 'fflate';
import { decodeQRFromCanvas } from '@/core/qr/qr_decode';
import { parsePacket } from '@/core/protocol/packet';
import type { Packet } from '@/core/protocol/packet';
import { PacketType, K, MAX_PAYLOAD_SIZE } from '@/core/protocol/constants';
import { GenerationDecoder } from '@/core/fec/rlnc_decoder';

// ─── Session state ───────────────────────────────────────────────────────────

interface SessionState {
  sessionId: number;
  decoder: GenerationDecoder;
  dedup: Set<string>;
  receivedPackets: number;
  solvedGenerations: Set<number>;
  totalGenerations: number;
  dataLength: number;
  isText: boolean;
  isCompressed: boolean;
  completed: boolean;
  stats: {
    framesDecoded: number;
    framesWithQR: number;
  };
}

// Worker-global state (keyed by sessionId)
const sessions = new Map<number, SessionState>();

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
      handleFrame(imageData);
    } catch (err: any) {
      self.postMessage({ type: 'error', message: `Frame error: ${err.message ?? String(err)}` });
    }
    return;
  }
};

// ─── Frame handling ──────────────────────────────────────────────────────────

function handleFrame(imageData: ImageData): void {
  const decoded = decodeQRFromCanvas(imageData);
  if (!decoded) return;

  const bytes = decoded;

  let packet: Packet;
  try {
    packet = parsePacket(bytes);
  } catch {
    return;
  }

  const h = packet.header;
  const sid = h.sessionId;

  // Get or create session state
  let state = sessions.get(sid);
  if (!state) {
    state = {
      sessionId: sid,
      decoder: new GenerationDecoder(K, MAX_PAYLOAD_SIZE, sid, 0),
      dedup: new Set(),
      receivedPackets: 0,
      solvedGenerations: new Set(),
      totalGenerations: h.totalGenerations,
      dataLength: h.dataLength,
      isText: (h.flags & 1) !== 0,
      isCompressed: (h.flags & 2) !== 0,
      completed: false,
      stats: { framesDecoded: 0, framesWithQR: 0 },
    };
    sessions.set(sid, state);
  }

  if (state.completed) return;

  // Update metadata from header (in case first packet was incomplete)
  state.totalGenerations = h.totalGenerations;
  state.dataLength = h.dataLength;
  state.isText = (h.flags & 1) !== 0;
  state.isCompressed = (h.flags & 2) !== 0;

  state.stats.framesDecoded++;

  // Dedup: sessionId:generationIndex:packetType:symbolIndex
  const dedupKey = `${sid}:${h.generationIndex}:${h.packetType}:${h.symbolIndex}`;
  if (state.dedup.has(dedupKey)) return;
  state.dedup.add(dedupKey);
  state.stats.framesWithQR++;

  // Feed to decoder
  const gen = h.generationIndex;
  let accepted = false;

  if (h.packetType === PacketType.DATA_SYSTEMATIC) {
    accepted = state.decoder.addSystematicSymbol(gen, packet.payload, h.symbolIndex);
  } else {
    accepted = state.decoder.addCodedSymbol(gen, packet.payload, h.symbolIndex);
  }

  if (accepted) {
    state.receivedPackets++;

    if (state.decoder.isSolved(gen)) {
      state.solvedGenerations.add(gen);

      if (state.solvedGenerations.size >= state.totalGenerations) {
        reconstructData(state);
        if (state.completed) return;
      }
    }
  }

  reportProgress(state);
}

// ─── Reconstruct original data from all source symbols ──────────────────────

function reconstructData(state: SessionState): void {
  const decoder = state.decoder;

  // Collect preprocessed data from each generation's source symbols
  const preprocessedParts: Uint8Array[] = [];

  for (let gen = 0; gen < state.totalGenerations; gen++) {
    const symbols = decoder.getSourceSymbols(gen);
    if (!symbols) {
      self.postMessage({
        type: 'error',
        sessionId: state.sessionId,
        message: `Generation ${gen} not solved — reconstruction aborted`,
      });
      return;
    }
    for (const sym of symbols) {
      preprocessedParts.push(new Uint8Array(sym));
    }
  }

  // Concatenate and trim to exact dataLength
  const totalSize = preprocessedParts.reduce((s, p) => s + p.length, 0);
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of preprocessedParts) {
    combined.set(part, offset);
    offset += part.length;
  }
  const trimmed = combined.slice(0, state.dataLength);

  // Decompress if needed
  let finalData: Uint8Array;
  if (state.isCompressed) {
    try {
      finalData = inflateSync(trimmed);
    } catch (err) {
      self.postMessage({
        type: 'error',
        sessionId: state.sessionId,
        message: 'Decompression failed — data may be corrupted',
      });
      return;
    }
  } else {
    finalData = trimmed;
  }

  if (state.isText) {
    const text = new TextDecoder().decode(finalData);
    self.postMessage({
      type: 'complete',
      sessionId: state.sessionId,
      isText: true,
      text,
    });
  } else {
    self.postMessage(
      {
        type: 'complete',
        sessionId: state.sessionId,
        isText: false,
        data: finalData.buffer,
        filename: `recovered-${state.sessionId.toString(16).padStart(8, '0')}`,
        mime: 'application/octet-stream',
      },
      { transfer: [finalData.buffer as ArrayBuffer] },
    );
  }

  state.completed = true;
}

// ─── Progress reporting ──────────────────────────────────────────────────────

function reportProgress(state: SessionState): void {
  const totalGens = state.totalGenerations;
  const solvedGens = state.solvedGenerations.size;

  self.postMessage({
    type: 'progress',
    sessionId: state.sessionId,
    framesDecoded: state.stats.framesDecoded,
    framesWithQR: state.stats.framesWithQR,
    receivedPackets: state.receivedPackets,
    solvedGenerations: solvedGens,
    totalGenerations: totalGens,
    status: totalGens > 0
      ? `Receiving (${solvedGens}/${totalGens} gens)`
      : 'Receiving…',
  });
}
