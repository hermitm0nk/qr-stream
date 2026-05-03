/**
 * Transport packet serialization and deserialization.
 *
 * Fixed 18-byte header (all multi-byte fields are little-endian):
 *
 * | Offset | Size | Field              | Description                          |
 * |--------|------|--------------------|--------------------------------------|
 * | 0      | 2    | magic              | 'QG' (0x51, 0x47)                    |
 * | 2      | 1    | protocol_version   | 2                                    |
 * | 3      | 1    | flags              | IS_TEXT, COMPRESSED, LAST_GEN        |
 * | 4      | 4    | session_id         | random 32-bit                        |
 * | 8      | 2    | generation_index   | 16-bit unsigned                      |
 * | 10     | 2    | total_generations  | 16-bit unsigned                      |
 * | 12     | 1    | symbol_index       | 8-bit unsigned                       |
 * | 13     | 1    | packet_type        | 0=SYSTEMATIC, 1=CODED                |
 * | 14     | 4    | data_length        | 32-bit unsigned (preprocessed size)  |
 * | 18     | N    | payload            | fixed 191 bytes (zero-padded)        |
 * | 18+N   | 4    | packet_crc32c      | CRC32C over bytes 0–17 + payload     |
 *
 * @module
 */

import {
  MAGIC_BYTES,
  PROTOCOL_VERSION,
  HEADER_SIZE,
  CRC32C_SIZE,
  PacketType,
  MAX_PAYLOAD_SIZE,
} from './constants';
import { crc32c } from './crc32c';

// ─── Read/Write helpers (Little-Endian) ────────────────────────────────

function writeUint16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
  data[offset + 2] = (value >>> 16) & 0xff;
  data[offset + 3] = (value >>> 24) & 0xff;
}

function readUint16LE(data: Uint8Array, offset: number): number {
  return (data[offset]! | (data[offset + 1]! << 8)) >>> 0;
}

function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    ((data[offset + 3]! << 24) >>> 0)
  ) >>> 0;
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Decoded packet header fields. */
export interface PacketHeader {
  protocolVersion: number;
  flags: number;
  sessionId: number;
  generationIndex: number;
  totalGenerations: number;
  symbolIndex: number;
  packetType: PacketType;
  dataLength: number;
}

/** A fully parsed packet with header and payload. */
export interface Packet {
  header: PacketHeader;
  payload: Uint8Array;
}

// ─── Serialization ─────────────────────────────────────────────────────────

/**
 * Serialize a PacketHeader into an 18-byte fixed header buffer.
 */
export function serializeHeader(header: PacketHeader): Uint8Array {
  const buf = new Uint8Array(HEADER_SIZE);
  buf[0] = MAGIC_BYTES[0]!;
  buf[1] = MAGIC_BYTES[1]!;
  buf[2] = header.protocolVersion;
  buf[3] = header.flags;
  writeUint32LE(buf, 4, header.sessionId);
  writeUint16LE(buf, 8, header.generationIndex);
  writeUint16LE(buf, 10, header.totalGenerations);
  buf[12] = header.symbolIndex;
  buf[13] = header.packetType;
  writeUint32LE(buf, 14, header.dataLength);
  return buf;
}

/**
 * Deserialize an 18-byte header buffer into a PacketHeader.
 */
export function parseHeader(data: Uint8Array): PacketHeader {
  if (data.length < HEADER_SIZE) {
    throw new Error(
      `Packet too short for header: ${data.length} bytes, need ${HEADER_SIZE}`
    );
  }
  if (data[0] !== MAGIC_BYTES[0] || data[1] !== MAGIC_BYTES[1]) {
    throw new Error(
      `Invalid magic bytes: expected 'QG' (0x51 0x47), got 0x${data[0]!.toString(16)} 0x${data[1]!.toString(16)}`
    );
  }
  return {
    protocolVersion: data[2]!,
    flags: data[3]!,
    sessionId: readUint32LE(data, 4),
    generationIndex: readUint16LE(data, 8),
    totalGenerations: readUint16LE(data, 10),
    symbolIndex: data[12]!,
    packetType: data[13]! as PacketType,
    dataLength: readUint32LE(data, 14),
  };
}

/**
 * Serialize a complete transport packet (header + payload + CRC32C trailer).
 *
 * Payload is always padded to exactly MAX_PAYLOAD_SIZE bytes before
 * QR encoding, but the actual meaningful bytes are dataLength worth.
 */
export function createPacket(header: PacketHeader, payload: Uint8Array): Uint8Array {
  const headerBytes = serializeHeader(header);
  const totalLen = HEADER_SIZE + payload.length + CRC32C_SIZE;
  const packet = new Uint8Array(totalLen);
  packet.set(headerBytes, 0);
  packet.set(payload, HEADER_SIZE);

  const crcInput = new Uint8Array(HEADER_SIZE + payload.length);
  crcInput.set(headerBytes, 0);
  crcInput.set(payload, HEADER_SIZE);
  writeUint32LE(packet, HEADER_SIZE + payload.length, crc32c(crcInput));

  return packet;
}

/**
 * Deserialize and validate a complete transport packet.
 */
export function parsePacket(data: Uint8Array): Packet {
  if (data.length < HEADER_SIZE + CRC32C_SIZE) {
    throw new Error(
      `Packet too short: ${data.length} bytes, need at least ${HEADER_SIZE + CRC32C_SIZE}`
    );
  }

  const header = parseHeader(data);
  const payloadLen = data.length - HEADER_SIZE - CRC32C_SIZE;
  const payload = data.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);

  // Verify CRC32C
  const storedCrc = readUint32LE(data, HEADER_SIZE + payloadLen);
  const crcInput = new Uint8Array(HEADER_SIZE + payloadLen);
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
