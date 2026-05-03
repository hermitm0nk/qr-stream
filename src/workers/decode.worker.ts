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

// ─── State ───────────────────────────────────────────────────────────────────

interface DecodeState {
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
    totalFrames: number;
    framesWithQR: number;
    acceptedPackets: number;
  };
}

let current: DecodeState | null = null;

// ─── Worker handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'reset') {
    current = null;
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
  const decoded = decodeQRFromCanvas(imageData, { inversionAttempts: 'attemptBoth' });
  if (!decoded) return;

  let packet: Packet;
  try {
    packet = parsePacket(decoded);
  } catch {
    return;
  }

  const h = packet.header;
  const sessionId = h.sessionId;

  // Start fresh if this is a new session
  if (!current || current.sessionId !== sessionId) {
    current = {
      sessionId,
      decoder: new GenerationDecoder(K, MAX_PAYLOAD_SIZE, sessionId, 0),
      dedup: new Set(),
      receivedPackets: 0,
      solvedGenerations: new Set(),
      totalGenerations: h.totalGenerations,
      dataLength: h.dataLength,
      isText: (h.flags & 1) !== 0,
      isCompressed: (h.flags & 2) !== 0,
      completed: false,
      stats: { totalFrames: 0, framesWithQR: 0, acceptedPackets: 0 },
    };
  }

  if (current.completed) return;

  // Update metadata from header
  current.totalGenerations = h.totalGenerations;
  current.dataLength = h.dataLength;
  current.isText = (h.flags & 1) !== 0;
  current.isCompressed = (h.flags & 2) !== 0;

  current.stats.totalFrames++;

  // Dedup: generationIndex:packetType:symbolIndex
  const dedupKey = `${h.generationIndex}:${h.packetType}:${h.symbolIndex}`;
  if (current.dedup.has(dedupKey)) return;
  current.dedup.add(dedupKey);
  current.stats.framesWithQR++;

  // Feed to decoder
  const gen = h.generationIndex;
  let accepted = false;

  if (h.packetType === PacketType.DATA_SYSTEMATIC) {
    accepted = current.decoder.addSystematicSymbol(gen, packet.payload, h.symbolIndex);
  } else {
    accepted = current.decoder.addCodedSymbol(gen, packet.payload, h.symbolIndex);
  }

  if (accepted) {
    current.stats.acceptedPackets++;
    current.receivedPackets++;

    if (current.decoder.isSolved(gen)) {
      current.solvedGenerations.add(gen);

      if (current.solvedGenerations.size >= current.totalGenerations) {
        reconstructData(current);
        if (current.completed) {
          reportProgress(current);
          return;
        }
      }
    }
  }

  reportProgress(current);
}

// ─── Reconstruct original data from all source symbols ──────────────────────

function reconstructData(state: DecodeState): void {
  const decoder = state.decoder;

  // Collect preprocessed data from each generation's source symbols
  const preprocessedParts: Uint8Array[] = [];

  for (let gen = 0; gen < state.totalGenerations; gen++) {
    const symbols = decoder.getSourceSymbols(gen);
    if (!symbols) {
      self.postMessage({
        type: 'error',
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
        message: 'Decompression failed — data may be corrupted',
      });
      return;
    }
  } else {
    finalData = trimmed;
  }

  // Parse optional filename/mime metadata for file mode
  let filename = '';
  let mime = 'application/octet-stream';

  if (!state.isText) {
    try {
      if (finalData.length >= 2) {
        const filenameLen = finalData[0]!;
        if (finalData.length >= 2 + filenameLen) {
          const mimeLen = finalData[1 + filenameLen]!;
          const metaEnd = 2 + filenameLen + mimeLen;
          if (finalData.length >= metaEnd) {
            filename = new TextDecoder().decode(finalData.slice(1, 1 + filenameLen));
            mime = new TextDecoder().decode(finalData.slice(2 + filenameLen, metaEnd));
            finalData = finalData.slice(metaEnd);
          }
        }
      }
    } catch {
      // If metadata parsing fails, treat everything as raw data
    }
  }

  if (state.isText) {
    const text = new TextDecoder().decode(finalData);
    self.postMessage({
      type: 'complete',
      isText: true,
      text,
    });
  } else {
    self.postMessage(
      {
        type: 'complete',
        isText: false,
        data: finalData.buffer,
        filename: filename || `recovered-${state.sessionId.toString(16).padStart(8, '0')}`,
        mime: mime || 'application/octet-stream',
      },
      { transfer: [finalData.buffer as ArrayBuffer] },
    );
  }

  state.completed = true;
}

// ─── Progress reporting ──────────────────────────────────────────────────────

function reportProgress(state: DecodeState): void {
  const totalGens = state.totalGenerations;
  const solvedGens = state.solvedGenerations.size;
  const needed = totalGens > 0 ? K * totalGens : 0;

  self.postMessage({
    type: 'progress',
    totalFrames: state.stats.totalFrames,
    framesWithQR: state.stats.framesWithQR,
    acceptedPackets: state.stats.acceptedPackets,
    neededPackets: needed,
    receivedPackets: state.receivedPackets,
    solvedGenerations: solvedGens,
    totalGenerations: totalGens,
    status: totalGens > 0
      ? `Receiving (${solvedGens}/${totalGens} gens)`
      : 'Receiving…',
  });
}
