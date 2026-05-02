/**
 * SHA-256 hashing utilities using the Web Crypto API.
 *
 * @module
 */

/**
 * Compute the SHA-256 digest of arbitrary data.
 *
 * Uses `crypto.subtle.digest` which is available in modern browsers,
 * Bun, Deno, and Node.js (via the Web Crypto API).
 *
 * @param data - Input bytes to hash
 * @returns 32-byte SHA-256 digest
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    data as BufferSource,
  );
  return new Uint8Array(hashBuffer);
}

/**
 * Compute the hex-encoded SHA-256 digest of arbitrary data.
 *
 * @param data - Input bytes to hash
 * @returns Lower-case hex string of the SHA-256 digest (64 characters)
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await sha256(data);
  const hexParts: string[] = new Array(hash.length);
  for (let i = 0; i < hash.length; i++) {
    hexParts[i] = hash[i].toString(16).padStart(2, '0');
  }
  return hexParts.join('');
}
