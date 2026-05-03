/**
 * Frame scheduler — creates the final ordered frame sequence.
 *
 * Simply interleaves systematic symbols across generations,
 * then coded symbols across generations. No manifest preamble.
 *
 * @module
 */

import { PacketType } from '@/core/protocol/constants';
import { parseHeader } from '@/core/protocol/packet';
import { Xoshiro128 } from '@/core/fec/xoshiro';

function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const rng = new Xoshiro128(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.next() % (i + 1);
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

/**
 * Creates the final ordered frame sequence for QR-over-GIF transmission.
 *
 * @param packets          All data packets from packetizer
 * @param totalGenerations Total number of generations
 * @param sessionId        Session identifier (for deterministic shuffle)
 * @returns Ordered array of serialised packet bytes
 */
export function scheduleFrames(
  packets: Uint8Array[],
  totalGenerations: number,
  sessionId: number,
): Uint8Array[] {
  // Separate by type and group by generation
  const sysSymbols = new Map<number, Map<number, Uint8Array>>();
  const codedSymbols = new Map<number, Map<number, Uint8Array>>();

  for (const pkt of packets) {
    const header = parseHeader(pkt);
    if (header.packetType === PacketType.DATA_SYSTEMATIC) {
      let genMap = sysSymbols.get(header.generationIndex);
      if (!genMap) {
        genMap = new Map();
        sysSymbols.set(header.generationIndex, genMap);
      }
      genMap.set(header.symbolIndex, pkt);
    } else if (header.packetType === PacketType.DATA_CODED) {
      let genMap = codedSymbols.get(header.generationIndex);
      if (!genMap) {
        genMap = new Map();
        codedSymbols.set(header.generationIndex, genMap);
      }
      genMap.set(header.symbolIndex, pkt);
    }
  }

  // Convert to sorted arrays per generation
  const genSys = new Map<number, Uint8Array[]>();
  const genCoded = new Map<number, Uint8Array[]>();

  for (const [genIdx, symMap] of sysSymbols) {
    const sorted = Array.from(symMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, pkt]) => pkt);
    genSys.set(genIdx, sorted);
  }
  for (const [genIdx, symMap] of codedSymbols) {
    const sorted = Array.from(symMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, pkt]) => pkt);
    genCoded.set(genIdx, sorted);
  }

  // Generation permutation
  const genIndices: number[] = [];
  for (let i = 0; i < totalGenerations; i++) genIndices.push(i);
  const permutedGens = seededShuffle(genIndices, sessionId);

  // Build frame sequence
  const frames: Uint8Array[] = [];

  // Phase A: Systematic interleaving
  for (let symIdx = 0; symIdx < 16; symIdx++) {
    for (const genIdx of permutedGens) {
      const genPkts = genSys.get(genIdx);
      if (!genPkts || symIdx >= genPkts.length) continue;
      frames.push(genPkts[symIdx]!);
    }
  }

  // Phase B: Coded interleaving
  for (let symIdx = 0; symIdx < 8; symIdx++) {
    for (const genIdx of permutedGens) {
      const genPkts = genCoded.get(genIdx);
      if (!genPkts || symIdx >= genPkts.length) continue;
      frames.push(genPkts[symIdx]!);
    }
  }

  return frames;
}
