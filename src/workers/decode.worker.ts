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
import { K, MAX_PAYLOAD_SIZE, sourceGenerationsFromTotal } from '@/core/protocol/constants';
import { GenerationDecoder } from '@/core/fec/rlnc_decoder';
import { assemblePayload } from '@/core/reconstruct/assemble';

// ─── State ───────────────────────────────────────────────────────────────────

interface DecodeState {
  decoder: GenerationDecoder;
  dedup: Set<string>;
  receivedPackets: number;
  solvedGenerations: Set<number>;
  totalGenerations: number;
  sourceGenerations: number;
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

// ─── Worker handler ───────────────────────────────────────────────────────────

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

// ─── Frame handling ───────────────────────────────────────────────────────────

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

  // Start fresh on first valid packet
  if (!current) {
    const sourceGens = sourceGenerationsFromTotal(h.totalGenerations);
    current = {
      decoder: new GenerationDecoder(K, MAX_PAYLOAD_SIZE),
      dedup: new Set(),
      receivedPackets: 0,
      solvedGenerations: new Set(),
      totalGenerations: h.totalGenerations,
      sourceGenerations: sourceGens,
      dataLength: h.dataLength,
      isText: h.isText,
      isCompressed: h.compressed,
      completed: false,
      stats: { totalFrames: 0, framesWithQR: 0, acceptedPackets: 0 },
    };
  }

  if (current.completed) return;

  // Update metadata from header
  current.totalGenerations = h.totalGenerations;
  current.sourceGenerations = sourceGenerationsFromTotal(h.totalGenerations);
  current.dataLength = h.dataLength;
  current.isText = h.isText;
  current.isCompressed = h.compressed;

  current.stats.totalFrames++;

  // Dedup: generationIndex:symbolIndex
  const dedupKey = `${h.generationIndex}:${h.symbolIndex}`;
  if (current.dedup.has(dedupKey)) return;
  current.dedup.add(dedupKey);
  current.stats.framesWithQR++;

  // Feed to decoder
  const gen = h.generationIndex;
  let accepted = false;
  const isSystematic = h.symbolIndex < K;

  if (isSystematic) {
    accepted = current.decoder.addSystematicSymbol(gen, packet.payload, h.symbolIndex);
  } else {
    accepted = current.decoder.addCodedSymbol(gen, packet.payload, h.symbolIndex - K);
  }

  if (accepted) {
    current.stats.acceptedPackets++;
    current.receivedPackets++;

    if (current.decoder.isSolved(gen)) {
      current.solvedGenerations.add(gen);

      // We only need sourceGenerations generations solved (any mix of source + parity)
      if (current.solvedGenerations.size >= current.sourceGenerations) {
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

// ─── Reconstruct original data from all source symbols ────────────────────────

function reconstructData(state: DecodeState): void {
  const decoder = state.decoder;

  // Build solved generations map for assemblePayload
  const solvedMap = new Map<number, Uint8Array[]>();
  for (const genIdx of Array.from(state.solvedGenerations)) {
    const symbols = decoder.getSourceSymbols(genIdx);
    if (!symbols) {
      self.postMessage({
        type: 'error',
        message: `Generation ${genIdx} reported solved but has no source symbols`,
      });
      return;
    }
    solvedMap.set(genIdx, symbols.map((s) => new Uint8Array(s)));
  }

  // Use assemblePayload which handles outer RS recovery
  let preprocessed: Uint8Array;
  try {
    preprocessed = assemblePayload(solvedMap, state.totalGenerations, state.dataLength);
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      message: `Reassembly failed: ${err.message ?? String(err)}`,
    });
    return;
  }

  // Decompress if needed
  let finalData: Uint8Array;
  if (state.isCompressed) {
    try {
      finalData = inflateSync(preprocessed);
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: 'Decompression failed — data may be corrupted',
      });
      return;
    }
  } else {
    finalData = preprocessed;
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
      autoStop: true,
    });
  } else {
    self.postMessage(
      {
        type: 'complete',
        isText: false,
        data: finalData.buffer,
        filename: filename || `recovered-${Date.now().toString(36)}`,
        mime: mime || 'application/octet-stream',
        autoStop: true,
      },
      { transfer: [finalData.buffer as ArrayBuffer] },
    );
  }

  state.completed = true;
}

// ─── Progress reporting ──────────────────────────────────────────────────────────

function reportProgress(state: DecodeState): void {
  const totalGens = state.totalGenerations;
  const solvedGens = state.solvedGenerations.size;
  const needed = state.sourceGenerations > 0 ? K * state.sourceGenerations : 0;

  self.postMessage({
    type: 'progress',
    totalFrames: state.stats.totalFrames,
    framesWithQR: state.stats.framesWithQR,
    acceptedPackets: state.stats.acceptedPackets,
    neededPackets: needed,
    receivedPackets: state.receivedPackets,
    solvedGenerations: solvedGens,
    totalGenerations: totalGens,
    sourceGenerations: state.sourceGenerations,
    dataLength: state.dataLength,
    status: totalGens > 0
      ? `Receiving (${solvedGens}/${state.sourceGenerations} gens)`
      : 'Receiving…',
  });
}
