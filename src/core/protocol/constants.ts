/**
 * Core protocol constants for the QR-over-GIF transfer system.
 *
 * Single hardcoded profile: V10, ECC M, K=16, R=8.
 * No profile selection — sender and receiver are the same codebase.
 *
 * @module
 */

// ─── Magic Bytes & Version ───────────────────────────────────────────────────

/** Magic identifier bytes: 'QG' (0x51, 0x47). */
export const MAGIC_BYTES = new Uint8Array([0x51, 0x47]);

/** Current protocol version. */
export const PROTOCOL_VERSION = 2;

// ─── Packet Geometry ─────────────────────────────────────────────────────────

/** Size of the fixed packet header in bytes. */
export const HEADER_SIZE = 18;

/** Size of the CRC32C trailer in bytes. */
export const CRC32C_SIZE = 4;

/** Total overhead per packet: header + CRC32C. */
export const PACKET_OVERHEAD = HEADER_SIZE + CRC32C_SIZE;

/** Max payload that fits in a V10-M QR code with our header. */
export const MAX_PAYLOAD_SIZE = 191;

/** Max total packet size that fits in a V10-M QR code. */
export const MAX_PACKET_SIZE = 213;

// ─── Packet Type Enum ────────────────────────────────────────────────────────

/** Packet type identifiers. */
export enum PacketType {
  /** Systematic (uncoded) data symbol. */
  DATA_SYSTEMATIC = 0,
  /** Fountain-coded (repair) data symbol. */
  DATA_CODED = 1,
}

// ─── Flag Bits ───────────────────────────────────────────────────────────────

/** Flag bit masks for the packet flags byte. */
export enum Flags {
  /** No flags set. */
  NONE = 0,
  /** Payload is plain text (not a file). */
  IS_TEXT = 1 << 0,
  /** Payload is deflate-raw compressed. */
  COMPRESSED = 1 << 1,
  /** This packet belongs to the last generation. */
  LAST_GENERATION = 1 << 2,
}

// ─── Single Hardcoded Profile ────────────────────────────────────────────────

/** Number of source symbols per generation. */
export const K = 16;

/** Number of coded repair symbols per generation. */
export const R = 8;

/** QR code version. */
export const QR_VERSION = 10;

/** QR error correction level. */
export const ECC_LEVEL = 'M' as const;

/** Inter-frame delay in centiseconds (300 ms). */
export const FRAME_DELAY = 30;

// ─── Session ID ──────────────────────────────────────────────────────────────

/**
 * Generate a random 32-bit session identifier.
 *
 * Uses `crypto.getRandomValues` for 4 random bytes.
 *
 * @returns A random 32-bit unsigned integer
 */
export function createSessionId(): number {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return (
    (buf[0]! | (buf[1]! << 8) | (buf[2]! << 16) | (buf[3]! << 24)) >>> 0
  );
}
