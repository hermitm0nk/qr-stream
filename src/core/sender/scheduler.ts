/**
 * Frame scheduler — creates the final ordered frame sequence.
 *
 * Uses **optimal interleaved scheduling**: symbols are round-robined across
 * all generations so that symbols from the same generation are maximally
 * spaced apart. This gives the best resilience to burst frame loss and the
 * most uniform sampling for late joiners.
 *
 * Order per symbol index: systematic symbols (0–15) first, then coded
 * symbols (16–23). For each symbol index, we emit one symbol from each
 * generation (in shuffled order) before moving to the next symbol index.
 *
 * @module
 */

import { K, R } from '@/core/protocol/constants';
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
 * Interleaves all symbols round-robin across generations. Systematic
 * symbols for all generations are sent before coded symbols.
 *
 * @param packets          All data packets from packetizer
 * @param totalGenerations Total number of generations (source + parity)
 * @returns Ordered array of serialised packet bytes
 */
export function scheduleFrames(
  packets: Uint8Array[],
  totalGenerations: number,
): Uint8Array[] {
  // Group packets by generation, then by symbol index
  const byGenAndSymbol = new Map<number, Map<number, Uint8Array>>();

  for (const pkt of packets) {
    const header = parseHeader(pkt);
    let genMap = byGenAndSymbol.get(header.generationIndex);
    if (!genMap) {
      genMap = new Map();
      byGenAndSymbol.set(header.generationIndex, genMap);
    }
    genMap.set(header.symbolIndex, pkt);
  }

  // Shuffle generation order deterministically
  const genIndices: number[] = [];
  for (let i = 0; i < totalGenerations; i++) genIndices.push(i);
  const permutedGens = seededShuffle(genIndices, totalGenerations);

  // Build frame sequence: round-robin across generations for each symbol index
  const frames: Uint8Array[] = [];

  // First all systematic symbols (indices 0..K-1)
  for (let symIdx = 0; symIdx < K; symIdx++) {
    for (const genIdx of permutedGens) {
      const genMap = byGenAndSymbol.get(genIdx);
      const pkt = genMap?.get(symIdx);
      if (pkt) frames.push(pkt);
    }
  }

  // Then all coded symbols (indices K..K+R-1)
  for (let symIdx = K; symIdx < K + R; symIdx++) {
    for (const genIdx of permutedGens) {
      const genMap = byGenAndSymbol.get(genIdx);
      const pkt = genMap?.get(symIdx);
      if (pkt) frames.push(pkt);
    }
  }

  return frames;
}
