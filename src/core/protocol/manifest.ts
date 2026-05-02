/**
 * Manifest schema, serialization, and fragmentation support.
 *
 * The manifest carries session-level metadata encoded in CBOR (via the
 * `cbor-x` library). If the serialized manifest exceeds a single packet's
 * payload capacity it is fragmented across multiple MANIFEST-type packets.
 *
 * Fragments use the following packet header conventions:
 * - `generation_index` = 0 (reserved for manifest)
 * - `symbol_index`     = fragment ordinal (0, 1, 2, …)
 * - `generation_k`     = total number of manifest fragments
 * - `flags`            = MANIFEST_CRITICAL on first fragment,
 *                        LAST_SYMBOL_IN_GENERATION on last fragment
 *
 * @module
 */

import { encode, decode } from 'cbor-x';
import {
  PacketType,
  Flags,
  ProfileId,
  PROTOCOL_VERSION,
  HEADER_SIZE,
  CRC32C_SIZE,
} from './constants';
import { PacketHeader, createPacket, parsePacket } from './packet';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Content kind conveyed by this session. */
export type ContentKind = 'text' | 'file';

/** Compression codec identifier. */
export type CompressionCodec = 'none' | 'deflate-raw';

/** Decoded manifest metadata. */
export interface ManifestData {
  /** Protocol version. */
  protocolVersion: number;
  /** Application version string. */
  appVersion: string;
  /** Unique 64-bit session identifier. */
  sessionId: bigint;
  /** Original file name (empty for text). */
  originalFilename: string;
  /** MIME type of the content. */
  mimeType: string;
  /** Kind of content: 'text' or 'file'. */
  contentKind: ContentKind;
  /** Size of the original data in bytes. */
  originalSize: number;
  /** Size after preprocessing (before framing) in bytes. */
  preprocessedSize: number;
  /** Compression codec applied during preprocessing. */
  compressionCodec: CompressionCodec;
  /** SHA-256 hex digest of the original data. */
  originalSha256: string;
  /** QR profile identifier used for this session. */
  qrProfile: ProfileId;
  /** Packet payload size in bytes. */
  packetPayloadSize: number;
  /** Number of source symbols per generation (K). */
  generationK: number;
  /** Number of coded symbols generated per generation (R). */
  codedPerGen: number;
  /** Total number of generations in the session. */
  totalGenerations: number;
  /** Actual size (in symbols) of the last generation. */
  lastGenRealSize: number;
  /** GIF frame delay in centiseconds. */
  gifFrameDelay: number;
  /** Loop parameters (0 = loop forever, >0 = repeat count). */
  loopParams: number;
}

// ─── CBOR Field Names (short keys for compactness) ──────────────────────────

interface ManifestEncoded {
  pv: number;       // protocolVersion
  av: string;       // appVersion
  si: string;       // sessionId (as decimal string for CBOR safety)
  of: string;       // originalFilename
  mt: string;       // mimeType
  ck: ContentKind;  // contentKind
  os: number;       // originalSize
  ps: number;       // preprocessedSize
  cc: CompressionCodec; // compressionCodec
  oh: string;       // originalSha256
  qp: number;       // qrProfile
  pp: number;       // packetPayloadSize
  gk: number;       // generationK
  cg: number;       // codedPerGen
  tg: number;       // totalGenerations
  lr: number;       // lastGenRealSize
  fd: number;       // gifFrameDelay
  lp: number;       // loopParams
}

// ─── Serialization ───────────────────────────────────────────────────────────

/**
 * Serialize a ManifestData structure into CBOR-encoded bytes.
 *
 * Field names are shortened to 2-letter keys for compactness.
 * The sessionId (bigint) is stored as a decimal string so it
 * round-trips safely through any CBOR decoder.
 *
 * @param manifest - The manifest data to encode
 * @returns CBOR-encoded Uint8Array
 */
export function encodeManifest(manifest: ManifestData): Uint8Array {
  const obj: ManifestEncoded = {
    pv: manifest.protocolVersion,
    av: manifest.appVersion,
    si: manifest.sessionId.toString(),
    of: manifest.originalFilename,
    mt: manifest.mimeType,
    ck: manifest.contentKind,
    os: manifest.originalSize,
    ps: manifest.preprocessedSize,
    cc: manifest.compressionCodec,
    oh: manifest.originalSha256,
    qp: manifest.qrProfile,
    pp: manifest.packetPayloadSize,
    gk: manifest.generationK,
    cg: manifest.codedPerGen,
    tg: manifest.totalGenerations,
    lr: manifest.lastGenRealSize,
    fd: manifest.gifFrameDelay,
    lp: manifest.loopParams,
  };
  return encode(obj);
}

/**
 * Deserialize CBOR-encoded bytes into a ManifestData structure.
 *
 * @param data - CBOR-encoded manifest bytes
 * @returns The decoded manifest data
 */
export function decodeManifest(data: Uint8Array): ManifestData {
  const obj = decode(data) as ManifestEncoded;
  return {
    protocolVersion: obj.pv,
    appVersion: obj.av,
    sessionId: BigInt(obj.si),
    originalFilename: obj.of,
    mimeType: obj.mt,
    contentKind: obj.ck,
    originalSize: obj.os,
    preprocessedSize: obj.ps,
    compressionCodec: obj.cc,
    originalSha256: obj.oh,
    qrProfile: obj.qp as ProfileId,
    packetPayloadSize: obj.pp,
    generationK: obj.gk,
    codedPerGen: obj.cg,
    totalGenerations: obj.tg,
    lastGenRealSize: obj.lr,
    gifFrameDelay: obj.fd,
    loopParams: obj.lp,
  };
}

// ─── Fragmentation ───────────────────────────────────────────────────────────

/**
 * Build a single MANIFEST-type packet for one fragment of the manifest.
 *
 * @param manifest      - The full manifest (used for header fields)
 * @param fragmentData  - This fragment's CBOR byte slice
 * @param fragmentIndex - Zero-based fragment index
 * @param totalFragments - Total number of fragments
 * @returns A complete transport packet (ready for QR encoding)
 */
export function createManifestPacket(
  manifest: ManifestData,
  fragmentData: Uint8Array,
  fragmentIndex: number,
  totalFragments: number,
): Uint8Array {
  const isFirst = fragmentIndex === 0;
  const isLast = fragmentIndex === totalFragments - 1;

  let flags = 0;
  if (isFirst) flags |= Flags.MANIFEST_CRITICAL;
  if (isLast) flags |= Flags.LAST_SYMBOL_IN_GENERATION;

  const header: PacketHeader = {
    protocolVersion: PROTOCOL_VERSION,
    packetType: PacketType.MANIFEST,
    flags,
    profileId: manifest.qrProfile,
    sessionId: manifest.sessionId,
    generationIndex: 0, // Manifest uses generation index 0
    symbolIndex: fragmentIndex,
    generationK: totalFragments,
    payloadLength: fragmentData.length,
    codingSeed: 0, // Not used for manifest packets
  };

  return createPacket(header, fragmentData);
}

/**
 * Fragment a serialized manifest into multiple transport packets.
 *
 * Each fragment's payload fits within `maxPayloadSize` bytes, and the
 * fragment metadata (fragment index, total count) is carried in the
 * packet header fields (`symbol_index`, `generation_k`).
 *
 * @param manifest       - The manifest to fragment
 * @param maxPayloadSize - Maximum payload per packet (typically the
 *                         profile's maxPacketPayload)
 * @returns An array of complete transport packets
 */
export function fragmentManifest(
  manifest: ManifestData,
  maxPayloadSize: number,
): Uint8Array[] {
  const encoded = encodeManifest(manifest);
  const totalFragments = Math.max(
    1,
    Math.ceil(encoded.length / maxPayloadSize),
  );
  const fragments: Uint8Array[] = [];

  for (let i = 0; i < totalFragments; i++) {
    const start = i * maxPayloadSize;
    const end = Math.min(start + maxPayloadSize, encoded.length);
    const chunk = encoded.slice(start, end);
    fragments.push(createManifestPacket(manifest, chunk, i, totalFragments));
  }

  return fragments;
}

/**
 * Reassemble and decode a manifest from its fragmented transport packets.
 *
 * Accepts an array of raw packet bytes, parses them, sorts by
 * `symbolIndex`, concatenates the payloads in order, and decodes
 * the CBOR manifest.
 *
 * @param packetBytes - Array of raw MANIFEST transport packets
 * @returns The reassembled and decoded manifest
 * @throws {Error} If no packets are provided or reassembly fails
 */
export function defragmentManifest(packetBytes: Uint8Array[]): ManifestData {
  if (packetBytes.length === 0) {
    throw new Error('No manifest packets to defragment');
  }

  // Parse and sort by symbol index
  const parsed = packetBytes.map((pb) => parsePacket(pb));
  parsed.sort((a, b) => a.header.symbolIndex - b.header.symbolIndex);

  // Concatenate payloads in order
  const totalSize = parsed.reduce((sum, p) => sum + p.payload.length, 0);
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const p of parsed) {
    combined.set(p.payload, offset);
    offset += p.payload.length;
  }

  return decodeManifest(combined);
}
