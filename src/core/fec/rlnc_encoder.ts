/**
 * Systematic RLNC (Random Linear Network Coding) encoder per generation.
 *
 * Given K source symbols, generates R coded repair symbols where each
 * coded symbol is a linear combination of all source symbols with
 * coefficients drawn from GF(256). The coefficient vectors are
 * deterministically derived from (session_id, generation_index, coding_seed)
 * using the xoshiro128** PRNG.
 *
 * @module
 */

import { mul, add } from './gf256';
import { Xoshiro128 } from './xoshiro';

/**
 * A coded symbol with its coefficient vector.
 * The coefficients define the linear combination of source symbols
 * that produced this symbol.
 */
export interface CodedSymbol {
  /** The coefficient vector (length K), each element in GF(256) */
  coefficients: Uint8Array;
  /** The coded symbol data (same length as source symbols) */
  data: Uint8Array;
  /** Whether this is a systematic (original) symbol */
  isSystematic: boolean;
  /** Original index if systematic, -1 if coded */
  sourceIndex: number;
}

/**
 * A source symbol — raw data bytes with its index in the generation.
 */
export interface SourceSymbol {
  index: number;
  data: Uint8Array;
}

/**
 * Derive a deterministic 32-bit seed from session/generation/coding parameters.
 *
 * Uses a simple mixing function (xorshift32 on each component combined).
 *
 * @param sessionId - Session identifier (narrowed to 32 bits)
 * @param generationIndex - Index of this generation within the session
 * @param codingSeed - Extra coding seed parameter
 * @returns A 32-bit unsigned integer seed
 */
export function deriveCoefficientSeed(
  sessionId: number,
  generationIndex: number,
  codingSeed: number
): number {
  // Mix the three components using xorshift32-style operations
  let seed = (sessionId >>> 0) ^ ((generationIndex << 13) | (generationIndex >>> 19));
  seed = (seed ^ (seed >> 7)) * 0x9e3779b9;
  seed = seed ^ (seed >> 17) ^ codingSeed;
  seed = (seed ^ (seed >> 5)) * 0x85ebca6b;
  seed = seed ^ (seed >> 13);
  return seed >>> 0;
}

/**
 * Generate a non-zero coefficient vector of length K from a seed.
 *
 * Uses xoshiro128** seeded with the given seed to generate K random
 * bytes. If the resulting vector would be all-zero, re-rolls.
 *
 * @param k - Number of source symbols (length of coefficient vector)
 * @param seed - 32-bit seed for the PRNG
 * @returns A Uint8Array of length K with non-zero coefficients
 */
export function generateCoefficients(k: number, seed: number): Uint8Array {
  const rng = new Xoshiro128(seed);
  const coeffs = new Uint8Array(k);

  let allZero = true;
  let attempts = 0;
  const MAX_ATTEMPTS = 100;

  do {
    allZero = false;
    for (let i = 0; i < k; i++) {
      // Generate a random non-zero GF(256) element
      let v: number;
      do {
        v = rng.nextByte();
      } while (v === 0);
      coeffs[i] = v;
    }
    // Check if all zero (shouldn't happen given non-zero generation, but guard)
    allZero = true;
    for (let i = 0; i < k; i++) {
      if (coeffs[i] !== 0) {
        allZero = false;
        break;
      }
    }
    attempts++;
    if (attempts >= MAX_ATTEMPTS) {
      // Fallback: force at least one coefficient to 1
      coeffs[0] = 1;
      allZero = false;
    }
  } while (allZero);

  return coeffs;
}

/**
 * Encode a generation of K source symbols into K systematic + R coded symbols.
 *
 * The first K output symbols are the source symbols themselves (systematic
 * encoding). The remaining R symbols are random linear combinations of all
 * K source symbols over GF(256).
 *
 * @param sourceSymbols - Array of K source symbol data arrays (each Uint8Array of equal length)
 * @param k - Number of source symbols in the generation
 * @param r - Number of coded repair symbols to generate
 * @param sessionId - Session identifier for deterministic coefficient generation
 * @param generationIndex - Index of this generation within the session
 * @param codingSeed - Additional seed parameter for coefficient derivation
 * @returns Array of (k + r) CodedSymbols: k systematic followed by r coded
 * @throws {RangeError} If sourceSymbols length doesn't match k, or symbols have unequal lengths
 */
export function encodeGeneration(
  sourceSymbols: Uint8Array[],
  k: number,
  r: number,
  sessionId: number,
  generationIndex: number,
  codingSeed: number
): CodedSymbol[] {
  // Validate inputs
  if (sourceSymbols.length !== k) {
    throw new RangeError(
      `encodeGeneration: expected ${k} source symbols, got ${sourceSymbols.length}`
    );
  }

  if (k === 0) {
    return [];
  }

  const symbolLength = sourceSymbols[0].length;
  for (let i = 1; i < k; i++) {
    if (sourceSymbols[i].length !== symbolLength) {
      throw new RangeError(
        `encodeGeneration: symbol at index ${i} has length ${sourceSymbols[i].length}, ` +
        `expected ${symbolLength}`
      );
    }
  }

  const results: CodedSymbol[] = [];

  // 1. Systematic symbols: output the source symbols directly
  for (let i = 0; i < k; i++) {
    const coeffs = new Uint8Array(k);
    coeffs[i] = 1; // Only coefficient i is non-zero (identity vector)

    results.push({
      coefficients: coeffs,
      data: new Uint8Array(sourceSymbols[i]), // Copy to avoid mutation
      isSystematic: true,
      sourceIndex: i,
    });
  }

  // 2. Coded repair symbols: random linear combinations
  for (let j = 0; j < r; j++) {
    // Derive a unique seed for this repair symbol
    // Mix the repair index into the seed to get distinct vectors
    const symbolSeed =
      deriveCoefficientSeed(sessionId, generationIndex, codingSeed) ^
      ((j + 1) * 0x9e3779b9) >>> 0;

    const coeffs = generateCoefficients(k, symbolSeed);

    // Compute C = Σ coeff[i] * sourceSymbols[i] over GF(256)
    const codedData = new Uint8Array(symbolLength);

    for (let i = 0; i < k; i++) {
      const coeff = coeffs[i];
      if (coeff === 0) continue;

      // For each byte in the symbol: codedData[byte] += coeff * source[i][byte]
      const src = sourceSymbols[i];
      for (let b = 0; b < symbolLength; b++) {
        codedData[b] ^= mul(coeff, src[b]);  // mul then XOR (addition in GF(256))
      }
    }

    results.push({
      coefficients: coeffs,
      data: codedData,
      isSystematic: false,
      sourceIndex: -1,
    });
  }

  return results;
}
