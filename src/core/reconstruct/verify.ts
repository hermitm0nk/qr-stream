/**
 * SHA-256 integrity verification for reconstructed payloads.
 *
 * @module
 */

/**
 * Verify that a data buffer matches its expected SHA-256 digest.
 *
 * Performs a constant-time comparison of the computed and expected hashes
 * to mitigate timing side-channel attacks (though for this application the
 * threat model is low, it is good practice).
 *
 * @param data         - The data to verify
 * @param expectedHash - The expected 32-byte SHA-256 digest
 * @returns `true` if the hash matches, `false` otherwise
 */
export async function verifySha256(
  data: Uint8Array,
  expectedHash: Uint8Array,
): Promise<boolean> {
  const computed = new Uint8Array(
    await crypto.subtle.digest('SHA-256', data as BufferSource),
  );

  if (computed.length !== expectedHash.length) {
    return false;
  }

  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed[i] ^ expectedHash[i];
  }
  return diff === 0;
}
