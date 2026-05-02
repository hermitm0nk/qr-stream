/**
 * Frame scheduler — creates the final ordered frame sequence.
 *
 * Per the protocol specification (§11), the output GIF frame sequence
 * is structured as:
 *
 *   1. **Preamble** — All manifest fragments (one QR frame per fragment).
 *   2. **Body Phase A (Systematic interleaving)** — Systematic symbols
 *      are emitted across generations in a permuted order, one symbol
 *      per generation at a time.
 *   3. **Body Phase B (Coded interleaving)** — Coded repair symbols are
 *      likewise emitted in the same permuted generation order.
 *
 * The generation permutation is deterministic (Fisher-Yates seeded from
 * the lower 32 bits of the session ID) so that the receiver can reproduce
 * the expected arrival order.
 *
 * Every 7 data frames a manifest reinsertion occurs, providing a decoding
 * entry point for receivers that join mid-transmission.
 *
 * @module
 */

import { PacketType } from '@/core/protocol/constants';
import { parseHeader } from '@/core/protocol/packet';
import { fragmentManifest, type ManifestData } from '@/core/protocol/manifest';
import { Xoshiro128 } from '@/core/fec/xoshiro';

// ─── Seeded Fisher-Yates Shuffle ─────────────────────────────────────────────

/**
 * Deterministically shuffle an array using a seeded xoshiro128** PRNG.
 *
 * The same seed always produces the same permutation.
 *
 * @param arr  - Input array (not mutated)
 * @param seed - 32-bit seed for the PRNG
 * @returns A new array with elements permuted
 */
function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const rng = new Xoshiro128(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.next() % (i + 1);
    // Swap
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

// ─── FrameScheduler ──────────────────────────────────────────────────────────

/**
 * Creates the final ordered frame sequence for QR-over-GIF transmission.
 *
 * The scheduler takes the raw data packets produced by {@link SenderPacketizer}
 * together with the session manifest, and produces an ordered list of
 * serialised packet bytes that the QR/GIF pipeline encodes frame-by-frame.
 */
export class FrameScheduler {
  /**
   * Build the complete frame sequence.
   *
   * @param packets  - Serialised data packets (systematic + coded) from
   *                   {@link SenderPacketizer.getPackets}
   * @param manifest - The session manifest produced by
   *                   {@link SenderPacketizer.getManifest}
   * @returns Ordered array of serialised packet bytes, each representing
   *          one QR frame in the output GIF
   */
  schedule(
    packets: Uint8Array[],
    manifest: ManifestData,
  ): Uint8Array[] {
    // ── 0. Fragment manifest into preamble packets ─────────────────────────
    const manifestPackets = fragmentManifest(manifest, manifest.packetPayloadSize);

    // ── 1. Separate packets by type and group by generation ─────────────────
    const genSys: Map<number, Uint8Array[]> = new Map();
    const genCoded: Map<number, Uint8Array[]> = new Map();

    // Also sort packets within each generation by symbolIndex so they are
    // emitted in a deterministic order.
    const sysSymbols: Map<number, Map<number, Uint8Array>> = new Map();
    const codedSymbols: Map<number, Map<number, Uint8Array>> = new Map();

    for (const pkt of packets) {
      // parseHeader only reads the first 28 bytes — no CRC validation,
      // which is fine since we built these packets ourselves.
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

    // Convert the inner maps to sorted arrays
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

    // ── 2. Generate generation permutation ─────────────────────────────────
    const genIndices: number[] = [];
    for (let i = 0; i < manifest.totalGenerations; i++) {
      genIndices.push(i);
    }

    // Mix both halves of the 64-bit session ID for a more distributed seed
    const seed =
      (Number(manifest.sessionId & 0xffffffffn) >>> 0) ^
      (Number((manifest.sessionId >> 32n) & 0xffffffffn) >>> 0);
    const permutedGens = seededShuffle(genIndices, seed);

    // ── 3. Build frame sequence ────────────────────────────────────────────
    const frames: Uint8Array[] = [];
    let dataFrameCount = 0;

    /**
     * Helper: push a manifest reinsertion when due.
     *
     * Every 7 data frames (after the preamble) we re-emit all manifest
     * fragments so late-joining receivers can decode.
     */
    const maybeInsertManifest = (): void => {
      if (dataFrameCount > 0 && dataFrameCount % 7 === 0) {
        for (const mp of manifestPackets) {
          frames.push(mp);
        }
      }
    };

    // ── Preamble ───────────────────────────────────────────────────────────
    for (const mp of manifestPackets) {
      frames.push(mp);
    }

    // ── Body Phase A: Systematic interleaving ──────────────────────────────
    const k = manifest.generationK;
    for (let symIdx = 0; symIdx < k; symIdx++) {
      for (const genIdx of permutedGens) {
        const genPkts = genSys.get(genIdx);
        if (!genPkts || symIdx >= genPkts.length) continue;

        maybeInsertManifest();
        frames.push(genPkts[symIdx]!);
        dataFrameCount++;
      }
    }

    // ── Body Phase B: Coded interleaving ───────────────────────────────────
    const r = manifest.codedPerGen;
    for (let symIdx = 0; symIdx < r; symIdx++) {
      for (const genIdx of permutedGens) {
        const genPkts = genCoded.get(genIdx);
        if (!genPkts || symIdx >= genPkts.length) continue;

        maybeInsertManifest();
        frames.push(genPkts[symIdx]!);
        dataFrameCount++;
      }
    }

    return frames;
  }
}
