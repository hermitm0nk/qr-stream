/**
 * Sender-side packetizer.
 *
 * Orchestrates the full encoding pipeline:
 *   1. Compress raw data (deflate-raw, with heuristic)
 *   2. Compute SHA-256 hash of original data
 *   3. Split preprocessed data into source symbols
 *   4. Group symbols into generations of K
 *   5. Encode each generation with RLNC (K systematic + R coded symbols)
 *   6. Create serialised transport packets for every symbol
 *   7. Build the session manifest
 *
 * The resulting data packets (accessible via {@link getPackets}) are then
 * handed to {@link FrameScheduler} for final interleaving and manifest
 * preamble insertion.
 *
 * @module
 */

import {
  createSessionId,
  DEFAULT_PROFILE_ID,
  PacketType,
  ProfileId,
  PROFILES,
  PROTOCOL_VERSION,
  type ProfileConfig,
} from '@/core/protocol/constants';
import { createPacket, type PacketHeader } from '@/core/protocol/packet';
import type { ManifestData } from '@/core/protocol/manifest';
import { encodeGeneration } from '@/core/fec/rlnc_encoder';
import { compress, shouldCompress } from '@/core/preprocess/compress';
import { sha256Hex } from '@/core/preprocess/hash';

// ─── Default Coding Seed ─────────────────────────────────────────────────────

/**
 * Fixed coding seed used for RLNC coefficient derivation on the sender side.
 *
 * A fixed value is acceptable because per-generation uniqueness is provided
 * by the combination of `sessionId`, `generationIndex`, and the per-symbol
 * index mixing — see `deriveCoefficientSeed` and the encoder loop.
 */
const DEFAULT_CODING_SEED = 42;

// ─── Exports ─────────────────────────────────────────────────────────────────

export interface PacketizerProgress {
  totalPackets: number;
  currentPacket: number;
}

/**
 * Sender-side packetizer.
 *
 * Usage:
 * ```ts
 * const pktz = new SenderPacketizer(ProfileId.BALANCED);
 * await pktz.initialize(data, 'photo.jpg', 'image/jpeg');
 * const manifest = pktz.getManifest();
 * const packets  = pktz.getPackets();
 * ```
 */
export class SenderPacketizer {
  private readonly profileId: ProfileId;
  private readonly profileConfig: ProfileConfig;
  private readonly sessionId: bigint;

  private _initialized = false;
  private _manifest: ManifestData | null = null;
  private _packets: Uint8Array[] = [];
  private _totalPackets = 0;
  private _currentPacket = 0;

  /**
   * @param profileId - QR transfer profile (defaults to {@link DEFAULT_PROFILE_ID})
   */
  constructor(profileId: ProfileId = DEFAULT_PROFILE_ID) {
    this.profileId = profileId;
    this.profileConfig = PROFILES[profileId];
    this.sessionId = createSessionId();
  }

  /**
   * Run the full encoding pipeline.
   *
   * Steps:
   * 1. Compress the input with deflate-raw and decide (via
   *    {@link shouldCompress}) whether to keep the compressed version.
   * 2. Compute the SHA-256 hex digest of the **original** data for integrity.
   * 3. Split the preprocessed bytes into fixed-size source symbols of
   *    `maxPacketPayload` bytes (final symbol is zero-padded).
   * 4. Group symbols into generations of K and pad the last generation
   *    with zero symbols if it is short.
   * 5. Encode each generation with RLNC to produce K systematic + R coded
   *    symbols.
   * 6. Serialise every symbol as a transport packet.
   * 7. Construct the session manifest.
   *
   * @param data     - Raw bytes to transmit
   * @param filename - Optional file name (stored in manifest)
   * @param mime     - Optional MIME type (stored in manifest)
   */
  async initialize(
    data: Uint8Array,
    filename?: string,
    mime?: string,
  ): Promise<void> {
    // ── 1. Compression ────────────────────────────────────────────────────
    const compressed = await compress(data);
    const useCompression = shouldCompress(data, compressed);
    const preprocessed = useCompression ? compressed : data;
    const compressionCodec = useCompression ? 'deflate-raw' : 'none';

    // ── 2. Hash original ──────────────────────────────────────────────────
    const hashHex = await sha256Hex(data);

    // ── 3. Split into fixed-size source symbols ───────────────────────────
    const symbolSize = this.profileConfig.maxPacketPayload;
    const numDataSymbols = Math.max(
      1,
      Math.ceil(preprocessed.length / symbolSize),
    );
    const sourceSymbols: Uint8Array[] = [];

    for (let i = 0; i < numDataSymbols; i++) {
      const offset = i * symbolSize;
      const sym = new Uint8Array(symbolSize); // zero-filled

      if (offset < preprocessed.length) {
        const end = Math.min(offset + symbolSize, preprocessed.length);
        sym.set(preprocessed.subarray(offset, end), 0);
      }
      // Remaining bytes stay zero (padding for the last symbol)
      sourceSymbols.push(sym);
    }

    // ── 4. Group into generations ─────────────────────────────────────────
    const k = this.profileConfig.k;
    const r = this.profileConfig.r;
    const totalGenerations = Math.max(
      1,
      Math.ceil(numDataSymbols / k),
    );
    const lastGenRealSize =
      numDataSymbols % k === 0 ? k : numDataSymbols % k;

    // Narrow the 64-bit session ID to 32 bits for the RLNC encoder
    // (deriveCoefficientSeed only uses the lower 32 bits).
    const sessionIdNum = Number(this.sessionId & 0xffffffffn);
    const codingSeed = DEFAULT_CODING_SEED;

    // ── 5 + 6. Encode each generation, build packets ──────────────────────
    const dataPackets: Uint8Array[] = [];

    for (let gen = 0; gen < totalGenerations; gen++) {
      const startIdx = gen * k;
      const endIdx = Math.min(startIdx + k, numDataSymbols);

      // Collect this generation's source symbols (or empty if beyond payload)
      const genSource: Uint8Array[] = [];
      for (let i = startIdx; i < endIdx; i++) {
        genSource.push(sourceSymbols[i]);
      }
      // Pad the last generation with zero symbols if needed
      while (genSource.length < k) {
        genSource.push(new Uint8Array(symbolSize));
      }

      // RLNC encode → K systematic + R coded symbols
      const encoded = encodeGeneration(
        genSource,
        k,
        r,
        sessionIdNum,
        gen,
        codingSeed,
      );

      // Serialise each symbol as a transport packet
      for (let symIdx = 0; symIdx < encoded.length; symIdx++) {
        const cs = encoded[symIdx];

        let packetType: PacketType;
        let symbolIndex: number;
        let seed: number;

        if (cs.isSystematic) {
          packetType = PacketType.DATA_SYSTEMATIC;
          symbolIndex = cs.sourceIndex; // 0 … K-1
          seed = 0;
        } else {
          packetType = PacketType.DATA_CODED;
          symbolIndex = symIdx - k; // 0 … R-1
          seed = codingSeed;
        }

        const header: PacketHeader = {
          protocolVersion: PROTOCOL_VERSION,
          packetType,
          flags: 0,
          profileId: this.profileId,
          sessionId: this.sessionId,
          generationIndex: gen,
          symbolIndex,
          generationK: k,
          payloadLength: cs.data.length,
          codingSeed: seed,
        };

        dataPackets.push(createPacket(header, cs.data));
      }

      this._currentPacket = dataPackets.length;
    }

    // ── 7. Build manifest ─────────────────────────────────────────────────
    this._manifest = {
      protocolVersion: PROTOCOL_VERSION,
      appVersion: '1.0.0',
      sessionId: this.sessionId,
      originalFilename: filename ?? '',
      mimeType: mime ?? 'application/octet-stream',
      contentKind: filename ? 'file' : 'text',
      originalSize: data.length,
      preprocessedSize: preprocessed.length,
      compressionCodec,
      originalSha256: hashHex,
      qrProfile: this.profileId,
      packetPayloadSize: symbolSize,
      generationK: k,
      codedPerGen: r,
      totalGenerations,
      lastGenRealSize,
      gifFrameDelay: this.profileConfig.frameDelay,
      loopParams: 0,
    };

    this._packets = dataPackets;
    this._totalPackets = dataPackets.length;
    this._initialized = true;
  }

  // ─── Accessors ───────────────────────────────────────────────────────────

  /**
   * The constructed session manifest.
   *
   * @throws {Error} If called before {@link initialize}
   */
  getManifest(): ManifestData {
    if (!this._initialized || !this._manifest) {
      throw new Error('SenderPacketizer: not initialized');
    }
    return this._manifest;
  }

  /**
   * All data packets (systematic + coded), serialised as complete transport
   * packets ready for QR encoding.
   *
   * Does **not** include manifest packets — those are produced separately
   * via `fragmentManifest()` in the scheduler.
   *
   * @throws {Error} If called before {@link initialize}
   */
  getPackets(): Uint8Array[] {
    if (!this._initialized) {
      throw new Error('SenderPacketizer: not initialized');
    }
    return this._packets;
  }

  /**
   * Encoding progress.
   *
   * `totalPackets` is the total number of data packets that will be
   * produced; `currentPacket` reflects how many have been built so far
   * (equal to `totalPackets` once {@link initialize} completes).
   */
  getProgress(): PacketizerProgress {
    return {
      totalPackets: this._totalPackets,
      currentPacket: this._currentPacket,
    };
  }
}
