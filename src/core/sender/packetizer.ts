/**
 * Sender-side packetizer — single profile, no manifest.
 *
 * Steps:
 *   1. Optional compression (deflate-raw)
 *   2. Split preprocessed data into 191-byte symbols
 *   3. Group into generations of K=16
 *   4. RLNC encode each generation (16 systematic + 8 coded)
 *   5. Build transport packets with metadata in every header
 *
 * @module
 */

import {
  PROTOCOL_VERSION,
  PacketType,
  Flags,
  K,
  R,
  MAX_PAYLOAD_SIZE,
  createSessionId,
} from '@/core/protocol/constants';
import { PacketHeader, createPacket } from '@/core/protocol/packet';
import { encodeGeneration } from '@/core/fec/rlnc_encoder';
import { deflateSync } from 'fflate';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PacketizerResult {
  packets: Uint8Array[];
  sessionId: number;
  totalGenerations: number;
  dataLength: number;
  isText: boolean;
  isCompressed: boolean;
}

// ─── Packetizer ──────────────────────────────────────────────────────────────────

/**
 * Encode raw data into transport packets.
 *
 * @param data       Raw bytes to transmit
 * @param isText     Whether the payload is plain text
 * @param compress   Whether to apply deflate-raw compression
 * @returns PacketizerResult containing all packets and metadata
 */
export function packetize(
  data: Uint8Array,
  isText: boolean,
  compress: boolean,
): PacketizerResult {
  // 1. Optional compression
  let preprocessed: Uint8Array;
  let isCompressed: boolean;

  if (compress && data.length > 64) {
    preprocessed = deflateSync(data);
    isCompressed = true;
  } else {
    preprocessed = new Uint8Array(data);
    isCompressed = false;
  }

  const dataLength = preprocessed.length;

  // 2. Split into fixed-size symbols
  const symbols: Uint8Array[] = [];
  for (let offset = 0; offset < dataLength; offset += MAX_PAYLOAD_SIZE) {
    const chunk = preprocessed.slice(offset, offset + MAX_PAYLOAD_SIZE);
    if (chunk.length < MAX_PAYLOAD_SIZE) {
      const padded = new Uint8Array(MAX_PAYLOAD_SIZE);
      padded.set(chunk);
      symbols.push(padded);
    } else {
      symbols.push(chunk);
    }
  }

  const totalSymbols = symbols.length;
  const totalGenerations = Math.max(1, Math.ceil(totalSymbols / K));
  const sessionId = createSessionId();
  const codingSeed = 0;

  // 3. Encode generations and build packets
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
        genSourceSymbols.push(new Uint8Array(MAX_PAYLOAD_SIZE));
      }
    }

    const codedSymbols = encodeGeneration(
      genSourceSymbols,
      K,
      R,
      sessionId,
      gen,
      codingSeed,
    );

    const flagsBase =
      (isText ? Flags.IS_TEXT : 0) |
      (isCompressed ? Flags.COMPRESSED : 0) |
      (isLastGen ? Flags.LAST_GENERATION : 0);

    // Systematic symbols
    for (let i = 0; i < K; i++) {
      const cs = codedSymbols[i]!;
      const header: PacketHeader = {
        protocolVersion: PROTOCOL_VERSION,
        flags: flagsBase,
        sessionId,
        generationIndex: gen,
        totalGenerations,
        symbolIndex: cs.sourceIndex,
        packetType: PacketType.DATA_SYSTEMATIC,
        dataLength,
      };
      packets.push(createPacket(header, cs.data));
    }

    // Coded symbols
    for (let j = 0; j < R; j++) {
      const cs = codedSymbols[K + j]!;
      const header: PacketHeader = {
        protocolVersion: PROTOCOL_VERSION,
        flags: flagsBase,
        sessionId,
        generationIndex: gen,
        totalGenerations,
        symbolIndex: j,
        packetType: PacketType.DATA_CODED,
        dataLength,
      };
      packets.push(createPacket(header, cs.data));
    }
  }

  return {
    packets,
    sessionId,
    totalGenerations,
    dataLength,
    isText,
    isCompressed,
  };
}
