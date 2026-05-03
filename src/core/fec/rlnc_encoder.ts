/**
 * Systematic RLNC (Random Linear Network Coding) encoder per generation.
 *
 * Given K source symbols, generates R coded repair symbols where each
 * coded symbol is a linear combination of all source symbols with
 * coefficients drawn from GF(256). The coefficient vectors are
 * deterministically derived from (generation_index, coded_symbol_index)
 * using the xoshiro128** PRNG.
 *
 * @module
 */

import { mul, add } from './gf256';
import { Xoshiro128 } from './xoshiro';

/**
 * A coded symbol with its coefficient vector.
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
 * Derive a deterministic 32-bit seed from generation and coded-symbol index.
 *
 * @param generationIndex - Index of this generation
 * @param codedSymbolIndex - Index among coded symbols (0-based)
 * @returns A 32-bit unsigned integer seed
 */
export function deriveCoefficientSeed(
  generationIndex: number,
  codedSymbolIndex: number,
): number {
  const gen = generationIndex >>> 0;
  const idx = (codedSymbolIndex + 1) >>> 0;
  return ((gen * 0x9e3779b9) ^ (idx * 0x85ebca6b) ^ (gen >>> 16) ^ (idx << 16)) >>> 0;
}

/**
 * Generate a non-zero coefficient vector of length K from a seed.
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
      let v: number;
      do {
        v = rng.nextByte();
      } while (v === 0);
      coeffs[i] = v;
    }
    allZero = true;
    for (let i = 0; i < k; i++) {
      if (coeffs[i] !== 0) {
        allZero = false;
        break;
      }
    }
    attempts++;
    if (attempts >= MAX_ATTEMPTS) {
      coeffs[0] = 1;
      allZero = false;
    }
  } while (allZero);

  return coeffs;
}

/**
 * Encode a generation of K source symbols into K systematic + R coded symbols.
 *
 * @param sourceSymbols - Array of K source symbol data arrays
 * @param k - Number of source symbols in the generation
 * @param r - Number of coded repair symbols to generate
 * @param generationIndex - Index of this generation within the session
 * @returns Array of (k + r) CodedSymbols: k systematic followed by r coded
 */
export function encodeGeneration(
  sourceSymbols: Uint8Array[],
  k: number,
  r: number,
  generationIndex: number,
): CodedSymbol[] {
  if (sourceSymbols.length !== k) {
    throw new RangeError(
      `encodeGeneration: expected ${k} source symbols, got ${sourceSymbols.length}`,
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
        `expected ${symbolLength}`,
      );
    }
  }

  const results: CodedSymbol[] = [];

  // 1. Systematic symbols
  for (let i = 0; i < k; i++) {
    const coeffs = new Uint8Array(k);
    coeffs[i] = 1;

    results.push({
      coefficients: coeffs,
      data: new Uint8Array(sourceSymbols[i]),
      isSystematic: true,
      sourceIndex: i,
    });
  }

  // 2. Coded repair symbols
  for (let j = 0; j < r; j++) {
    const symbolSeed = deriveCoefficientSeed(generationIndex, j);
    const coeffs = generateCoefficients(k, symbolSeed);

    const codedData = new Uint8Array(symbolLength);
    for (let i = 0; i < k; i++) {
      const coeff = coeffs[i];
      if (coeff === 0) continue;
      const src = sourceSymbols[i];
      for (let b = 0; b < symbolLength; b++) {
        codedData[b] ^= mul(coeff, src[b]);
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
