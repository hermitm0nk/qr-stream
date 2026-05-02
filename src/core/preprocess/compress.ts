/**
 * Compression utilities using deflate-raw.
 *
 * Uses the native CompressionStream API (available in modern browsers,
 * Bun, and Deno) when available, with a fallback to the fflate library
 * for environments without native support.
 *
 * Note: fflate's `deflate` / `inflate` emit raw DEFLATE (RFC 1951),
 * which is the same format produced by `CompressionStream('deflate-raw')`.
 *
 * @module
 */

import { deflate as fflateDeflate, inflate as fflateInflate } from 'fflate';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Drain a readable stream into a single Uint8Array.
 */
async function drainStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((a, c) => a + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// ─── Compression ─────────────────────────────────────────────────────────────

/**
 * Compress data using deflate-raw (RFC 1951).
 *
 * Uses the native `CompressionStream` API when available, falling back
 * to fflate's `deflate` for environments without it.
 *
 * @param data - Raw uncompressed bytes
 * @returns Deflate-raw compressed bytes
 */
export async function compress(data: Uint8Array): Promise<Uint8Array> {
  // Check for native CompressionStream API
  if (
    typeof CompressionStream !== 'undefined' &&
    typeof CompressionStream === 'function'
  ) {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    // Re-create from ArrayBuffer to satisfy TS 5.7+ stricter BufferSource types
    await writer.write(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength));
    await writer.close();
    const reader = cs.readable.getReader();
    return drainStream(reader);
  }

  // Fallback: fflate deflate (raw DEFLATE, same format)
  return new Promise((resolve, reject) => {
    fflateDeflate(data, (err: Error | null, result: Uint8Array) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// ─── Decompression ───────────────────────────────────────────────────────────

/**
 * Decompress data that was compressed with deflate-raw.
 *
 * Uses the native `DecompressionStream` API when available, falling back
 * to fflate's `inflate`.
 *
 * @param data         - Deflate-raw compressed bytes
 * @param _originalSize - Original uncompressed size (reserved for future
 *                        pre-allocation hints; currently unused)
 * @returns Decompressed bytes
 */
export async function decompress(
  data: Uint8Array,
  _originalSize: number,
): Promise<Uint8Array> {
  // Check for native DecompressionStream API
  if (
    typeof DecompressionStream !== 'undefined' &&
    typeof DecompressionStream === 'function'
  ) {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    // Re-create from ArrayBuffer to satisfy TS 5.7+ stricter BufferSource types
    await writer.write(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength));
    await writer.close();
    const reader = ds.readable.getReader();
    return drainStream(reader);
  }

  // Fallback: fflate inflate (raw DEFLATE, same format)
  return new Promise((resolve, reject) => {
    fflateInflate(data, (err: Error | null, result: Uint8Array) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// ─── Compression Heuristic ──────────────────────────────────────────────────

/**
 * Determine whether the compression is worthwhile.
 *
 * Returns true if the compressed representation is at least 3 % smaller
 * than the original, indicating meaningful space savings.
 *
 * @param original   - Original uncompressed bytes
 * @param compressed - Compressed bytes
 * @returns `true` if compression saves >= 3 %
 */
export function shouldCompress(
  original: Uint8Array,
  compressed: Uint8Array,
): boolean {
  if (original.length === 0) return false;
  const saving = 1 - compressed.length / original.length;
  return saving >= 0.03;
}
