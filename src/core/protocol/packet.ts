/**
 * Transport packet serialization and deserialization.
 *
 * Packet format (all multi-byte fields are little-endian):
 *
 * | Offset | Size | Field              | Description                          |
 * |--------|------|--------------------|--------------------------------------|
 * | 0      | 2    | magic              | 'QG' (0x51, 0x47)                    |
 * | 2      | 1    | protocol_version   | 1                                    |
 * | 3      | 1    | packet_type        | 0=MANIFEST, 1=DATA_SYSTEMATIC, 2=CODED |
 * | 4      | 1    | flags              | bit flags                            |
 * | 5      | 1    | profile_id         | 0=Robust, 1=Balanced, 2=Fast         |
 * | 6      | 8    | session_id         | random 64-bit                        |
 * | 14     | 4    | generation_index   | 32-bit                               |
 * | 18     | 2    | symbol_index       | 16-bit                               |
 * | 20     | 2    | generation_k       | number of source symbols             |
 * | 22     | 2    | payload_length     | 16-bit                               |
 * | 24     | 4    | coding_seed        | 0 for systematic                     |
 * | 28     | N    | payload            | variable-length payload               |
 * | 28+N   | 4    | packet_crc32c      | CRC32C over bytes 0–27 + payload     |
 *
 * @module
 */

import {
  MAGIC_BYTES,
  PROTOCOL_VERSION,
  HEADER_SIZE,
  CRC32C_SIZE,
  PacketType,
  ProfileId,
} from './constants';
import { crc32c } from './crc32c';

// ─── Read/Write helpers (Little-Endian) ──────────────────────────────────────

/** Write a 16-bit unsigned value in little-endian format. */
function writeUint16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
}

/** Write a 32-bit unsigned value in little-endian format. */
function writeUint32LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
  data[offset + 2] = (value >>> 16) & 0xff;
  data[offset + 3] = (value >>> 24) & 0xff;
}

/** Write a 64-bit unsigned bigint in little-endian format. */
function writeBigUint64LE(data: Uint8Array, offset: number, value: bigint): void {
  const lo = Number(value & 0xffffffffn);
  const hi = Number((value >> 32n) & 0xffffffffn);
  writeUint32LE(data, offset, lo);
  writeUint32LE(data, offset + 4, hi);
}

/** Read a 16-bit unsigned value in little-endian format. */
function readUint16LE(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8)) >>> 0;
}

/** Read a 32-bit unsigned value in little-endian format. */
function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0)
  ) >>> 0;
}

/** Read a 64-bit unsigned bigint in little-endian format. */
function readBigUint64LE(data: Uint8Array, offset: number): bigint {
  const lo = BigInt(readUint32LE(data, offset));
  const hi = BigInt(readUint32LE(data, offset + 4));
  return (hi << 32n) | lo;
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Decoded packet header fields. */
export interface PacketHeader {
  /** Protocol version (expected: 1). */
  protocolVersion: number;
  /** Type of packet (MANIFEST / DATA_SYSTEMATIC / DATA_CODED). */
  packetType: PacketType;
  /** Bitfield of flag values (see Flags enum). */
  flags: number;
  /** Transfer profile identifier. */
  profileId: ProfileId;
  /** Unique 64-bit session identifier. */
  sessionId: bigint;
  /** Generation index within the session. */
  generationIndex: number;
  /** Symbol index within the generation. */
  symbolIndex: number;
  /** Number of source symbols in this generation (K). */
  generationK: number;
  /** Length of the payload in bytes. */
  payloadLength: number;
  /** Fountain coding seed (0 for systematic symbols). */
  codingSeed: number;
}

/** A fully parsed packet with header and payload. */
export interface Packet {
  /** Decoded header fields. */
  header: PacketHeader;
  /** Raw payload bytes (length = header.payloadLength). */
  payload: Uint8Array;
}

// ─── Serialization ───────────────────────────────────────────────────────────

/**
 * Serialize a PacketHeader into a 28-byte fixed header buffer.
 *
 * @param header - The header to serialize
 * @returns A new Uint8Array(28) containing the header bytes
 */
export function serializeHeader(header: PacketHeader): Uint8Array {
  const buf = new Uint8Array(HEADER_SIZE);

  // Magic
  buf[0] = MAGIC_BYTES[0];
  buf[1] = MAGIC_BYTES[1];

  buf[2] = header.protocolVersion;
  buf[3] = header.packetType;
  buf[4] = header.flags;
  buf[5] = header.profileId;

  writeBigUint64LE(buf, 6, header.sessionId);
  writeUint32LE(buf, 14, header.generationIndex);
  writeUint16LE(buf, 18, header.symbolIndex);
  writeUint16LE(buf, 20, header.generationK);
  writeUint16LE(buf, 22, header.payloadLength);
  writeUint32LE(buf, 24, header.codingSeed);

  return buf;
}

/**
 * Deserialize a 28-byte header buffer into a PacketHeader.
 *
 * @param data - Buffer containing at least 28 bytes
 * @returns The decoded header
 * @throws {Error} If the buffer is too short or magic bytes don't match
 */
export function parseHeader(data: Uint8Array): PacketHeader {
  if (data.length < HEADER_SIZE) {
    throw new Error(
      `Packet too short for header: ${data.length} bytes, need ${HEADER_SIZE}`
    );
  }
  if (data[0] !== MAGIC_BYTES[0] || data[1] !== MAGIC_BYTES[1]) {
    throw new Error(
      `Invalid magic bytes: expected 'QG' (0x51 0x47), got 0x${data[0].toString(16)} 0x${data[1].toString(16)}`
    );
  }

  return {
    protocolVersion: data[2],
    packetType: data[3] as PacketType,
    flags: data[4],
    profileId: data[5] as ProfileId,
    sessionId: readBigUint64LE(data, 6),
    generationIndex: readUint32LE(data, 14),
    symbolIndex: readUint16LE(data, 18),
    generationK: readUint16LE(data, 20),
    payloadLength: readUint16LE(data, 22),
    codingSeed: readUint32LE(data, 24),
  };
}

/**
 * Serialize a complete transport packet (header + payload + CRC32C trailer).
 *
 * @param header  - The packet header
 * @param payload - The payload bytes
 * @returns A complete packet buffer ready for transmission
 */
export function createPacket(header: PacketHeader, payload: Uint8Array): Uint8Array {
  const headerBytes = serializeHeader(header);
  const totalLen = HEADER_SIZE + payload.length + CRC32C_SIZE;
  const packet = new Uint8Array(totalLen);

  // Header
  packet.set(headerBytes, 0);
  // Payload
  packet.set(payload, HEADER_SIZE);

  // CRC32C over header (0–27) + payload
  const crcInput = new Uint8Array(HEADER_SIZE + payload.length);
  crcInput.set(headerBytes, 0);
  crcInput.set(payload, HEADER_SIZE);
  const crc = crc32c(crcInput);
  writeUint32LE(packet, HEADER_SIZE + payload.length, crc);

  return packet;
}

/**
 * Deserialize and validate a complete transport packet.
 *
 * Verifies the magic bytes and CRC32C checksum on decode.
 *
 * @param data - Raw packet buffer
 * @returns The decoded packet (header + payload)
 * @throws {Error} If the buffer is too short, magic is wrong, or CRC mismatches
 */
export function parsePacket(data: Uint8Array): Packet {
  if (data.length < HEADER_SIZE + CRC32C_SIZE) {
    throw new Error(
      `Packet too short: ${data.length} bytes, need at least ${HEADER_SIZE + CRC32C_SIZE}`
    );
  }

  const header = parseHeader(data);
  const payloadLength = header.payloadLength;

  // Guard: ensure the buffer is large enough for the declared payload
  if (HEADER_SIZE + payloadLength + CRC32C_SIZE > data.length) {
    throw new Error(
      `Packet truncated: declared payload ${payloadLength} bytes but buffer has ${data.length}`
    );
  }

  const payload = data.slice(HEADER_SIZE, HEADER_SIZE + payloadLength);

  // Verify CRC32C
  const storedCrc = readUint32LE(data, HEADER_SIZE + payloadLength);
  const crcInput = new Uint8Array(HEADER_SIZE + payloadLength);
  crcInput.set(data.slice(0, HEADER_SIZE), 0);
  crcInput.set(payload, HEADER_SIZE);
  const computedCrc = crc32c(crcInput);

  if (storedCrc !== computedCrc) {
    throw new Error(
      `CRC32C mismatch: stored 0x${storedCrc.toString(16)}, computed 0x${computedCrc.toString(16)}`
    );
  }

  return { header, payload };
}
