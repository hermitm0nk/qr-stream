/**
 * Frame decode test: verify QR encode -> decode roundtrip at the packet level.
 */
import { describe, it, expect } from 'vitest';
import { packetize } from '@/core/sender/packetizer';
import { scheduleFrames } from '@/core/sender/scheduler';
import { generateQRMatrix } from '@/core/qr/qr_encode';
import { rasterizeQR } from '@/core/qr/frame_raster';
import { decodeQRFromCanvas } from '@/core/qr/qr_decode';
import { parsePacket } from '@/core/protocol/packet';
import { QR_VERSION, ECC_LEVEL } from '@/core/protocol/constants';

describe('Frame Decode', () => {
  it('should decode every frame in a small transmission', async () => {
    const text = 'Frame decode roundtrip test!';
    const data = new TextEncoder().encode(text);
    const result = packetize(data, false, false);
    const frames = scheduleFrames(result.packets, result.totalGenerations, result.sessionId);

    expect(frames.length).toBeGreaterThan(0);

    for (let i = 0; i < frames.length; i++) {
      const originalPacket = frames[i]!;

      // Encode as QR
      const matrix = generateQRMatrix(originalPacket, QR_VERSION, ECC_LEVEL);
      const imageData = rasterizeQR(matrix, 4);

      // Decode QR
      const decodedBytes = decodeQRFromCanvas(imageData);
      expect(decodedBytes, `Frame ${i} failed to decode`).not.toBeNull();

      // Parse and verify header fields match
      const decoded = parsePacket(decodedBytes!);
      const original = parsePacket(originalPacket);

      expect(decoded.header.protocolVersion).toBe(original.header.protocolVersion);
      expect(decoded.header.sessionId).toBe(original.header.sessionId);
      expect(decoded.header.generationIndex).toBe(original.header.generationIndex);
      expect(decoded.header.symbolIndex).toBe(original.header.symbolIndex);
      expect(decoded.header.packetType).toBe(original.header.packetType);
      expect(decoded.header.totalGenerations).toBe(original.header.totalGenerations);
      expect(decoded.header.dataLength).toBe(original.header.dataLength);
      expect(decoded.header.flags).toBe(original.header.flags);
      expect(decoded.payload).toEqual(original.payload);
    }
  });
});
