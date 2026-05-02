/**
 * Core protocol constants, enums, and profile definitions for the
 * QR-over-GIF transfer system.
 *
 * @module
 */

// ─── Magic Bytes & Version ───────────────────────────────────────────────────

/** Magic identifier bytes: 'QG' (0x51, 0x47). */
export const MAGIC_BYTES = new Uint8Array([0x51, 0x47]);

/** Current protocol version. */
export const PROTOCOL_VERSION = 1;

// ─── Packet Geometry ─────────────────────────────────────────────────────────

/** Size of the fixed packet header in bytes (offsets 0–27). */
export const HEADER_SIZE = 28;

/** Size of the CRC32C trailer in bytes. */
export const CRC32C_SIZE = 4;

/** Total overhead per packet: header + CRC32C (28 + 4 = 32). */
export const PACKET_OVERHEAD = HEADER_SIZE + CRC32C_SIZE;

// ─── Packet Type Enum ────────────────────────────────────────────────────────

/** Packet type identifiers. */
export enum PacketType {
  /** Manifest / metadata packet. */
  MANIFEST = 0,
  /** Systematic (uncoded) data symbol. */
  DATA_SYSTEMATIC = 1,
  /** Fountain-coded (repaired) data symbol. */
  DATA_CODED = 2,
}

// ─── Flag Bits ───────────────────────────────────────────────────────────────

/** Flag bit masks for the packet flags byte. */
export enum Flags {
  /** No flags set. */
  NONE = 0,
  /** Marks the last symbol in a generation. */
  LAST_SYMBOL_IN_GENERATION = 1 << 0,
  /** Payload contains padding bytes at the end. */
  PAYLOAD_PADDED = 1 << 1,
  /** Manifest is critical / first fragment. */
  MANIFEST_CRITICAL = 1 << 2,
}

// ─── Profile IDs ─────────────────────────────────────────────────────────────

/** QR profile identifiers. */
export enum ProfileId {
  /** Robust profile: QR V31, ECC Q, K=24, R=12. */
  ROBUST = 0,
  /** Balanced profile: QR V35, ECC M, K=24, R=8. */
  BALANCED = 1,
  /** Fast profile: QR V40, ECC M, K=32, R=8. */
  FAST = 2,
}

// ─── Profile Config ──────────────────────────────────────────────────────────

/** ECC level type for QR code generation. */
export type EccLevel = 'L' | 'M' | 'Q' | 'H';

/** Configuration for a QR transfer profile. */
export interface ProfileConfig {
  /** QR code version (1–40). */
  qrVersion: number;
  /** Error correction level. */
  eccLevel: EccLevel;
  /** Number of source symbols per generation. */
  k: number;
  /** Number of coded (repaired) symbols per generation. */
  r: number;
  /** Inter-frame delay in centiseconds (cs). */
  frameDelay: number;
  /** Approximate maximum payload per packet in bytes. */
  maxPacketPayload: number;
}

/** Lookup of all defined profiles by their ProfileId. */
export const PROFILES: Record<ProfileId, ProfileConfig> = {
  [ProfileId.ROBUST]: {
    qrVersion: 31,
    eccLevel: 'Q',
    k: 24,
    r: 12,
    frameDelay: 30,
    maxPacketPayload: 1230,
  },
  [ProfileId.BALANCED]: {
    qrVersion: 35,
    eccLevel: 'M',
    k: 24,
    r: 8,
    frameDelay: 20,
    maxPacketPayload: 1770,
  },
  [ProfileId.FAST]: {
    qrVersion: 40,
    eccLevel: 'M',
    k: 32,
    r: 8,
    frameDelay: 15,
    maxPacketPayload: 2290,
  },
};

/** Default profile (Robust, for robustness-priority). */
export const DEFAULT_PROFILE_ID = ProfileId.ROBUST;

/**
 * Generate a random 64-bit session identifier.
 *
 * Uses `crypto.getRandomValues` to produce 8 cryptographically
 * random bytes, then interprets them as a little-endian unsigned
 * 64-bit bigint.
 *
 * @returns A random 64-bit session ID
 */
export function createSessionId(): bigint {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let val = 0n;
  for (let i = 0; i < 8; i++) {
    val |= BigInt(buf[i]) << BigInt(i * 8);
  }
  return val;
}
