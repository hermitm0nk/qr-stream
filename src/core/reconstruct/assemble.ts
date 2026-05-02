/**
 * Payload reassembly from decoded RLNC generations.
 *
 * After all generations have been solved by the RLNC decoder, this module
 * concatenates the source symbols in generation order and truncates the
 * result to the original payload size (the last generation may contain
 * fewer real symbols than K, and only `lastGenRealSize` symbols are taken
 * from it).
 *
 * @module
 */

/**
 * Assemble the original preprocessed payload from solved RLNC generations.
 *
 * Each generation contributes its K source symbols (Uint8Array values of
 * equal length). For all but the last generation, all K symbols are used.
 * For the last generation, only `lastGenRealSize` symbols are taken,
 * because the remainder were zero-padding artefacts.
 *
 * @param solvedGenerations - Map from generation index to the array of
 *                            K source symbols recovered by the decoder
 * @param totalGenerations  - Total number of generations in the session
 * @param lastGenRealSize   - Number of *actual* (non-padding) symbols in
 *                            the final generation (must be >= 1, <= K)
 * @returns Concatenated payload bytes, truncated to the exact
 *          preprocessed size
 * @throws {Error} If a required generation is missing from the map
 */
export function assemblePayload(
  solvedGenerations: Map<number, Uint8Array[]>,
  totalGenerations: number,
  lastGenRealSize: number,
): Uint8Array {
  if (totalGenerations === 0) {
    return new Uint8Array(0);
  }

  // First pass: validate inputs and compute total byte size
  let totalSize = 0;
  let symbolLength = 0;

  for (let g = 0; g < totalGenerations; g++) {
    const symbols = solvedGenerations.get(g);
    if (!symbols || symbols.length === 0) {
      throw new Error(
        `assemblePayload: generation ${g} has no solved symbols — ` +
          `ensure every generation has been decoded before assembly`,
      );
    }

    if (symbolLength === 0) {
      symbolLength = symbols[0].length;
    }

    const isLast = g === totalGenerations - 1;
    const count = isLast ? lastGenRealSize : symbols.length;

    if (count > symbols.length) {
      throw new Error(
        `assemblePayload: generation ${g} has ${symbols.length} symbols ` +
          `but request requires ${count} (lastGenRealSize=${lastGenRealSize})`,
      );
    }

    totalSize += symbolLength * count;
  }

  // Second pass: copy data
  const result = new Uint8Array(totalSize);
  let offset = 0;

  for (let g = 0; g < totalGenerations; g++) {
    const symbols = solvedGenerations.get(g)!;
    const isLast = g === totalGenerations - 1;
    const count = isLast ? lastGenRealSize : symbols.length;

    for (let s = 0; s < count; s++) {
      const sym = symbols[s];
      result.set(sym, offset);
      offset += sym.length;
    }
  }

  return result;
}
