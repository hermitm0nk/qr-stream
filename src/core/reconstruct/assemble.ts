/**
 * Payload reassembly from decoded RLNC generations.
 *
 * After all generations have been solved, concatenates the source symbols
 * in generation order and trims the result to the exact data length.
 *
 * @module
 */

/**
 * Assemble the original preprocessed payload from solved RLNC generations.
 *
 * @param solvedGenerations - Map from generation index to the array of K source symbols
 * @param totalGenerations  - Total number of generations in the session
 * @param dataLength        - Exact preprocessed size in bytes
 * @returns Concatenated payload bytes, trimmed to dataLength
 * @throws {Error} If a required generation is missing from the map
 */
export function assemblePayload(
  solvedGenerations: Map<number, Uint8Array[]>,
  totalGenerations: number,
  dataLength: number,
): Uint8Array {
  if (totalGenerations === 0) {
    return new Uint8Array(0);
  }

  const parts: Uint8Array[] = [];

  for (let g = 0; g < totalGenerations; g++) {
    const symbols = solvedGenerations.get(g);
    if (!symbols || symbols.length === 0) {
      throw new Error(
        `assemblePayload: generation ${g} has no solved symbols`
      );
    }
    for (const sym of symbols) {
      parts.push(sym);
    }
  }

  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }

  return combined.slice(0, dataLength);
}
