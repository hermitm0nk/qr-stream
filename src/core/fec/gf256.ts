/**
 * GF(256) finite field arithmetic module.
 *
 * Uses the irreducible polynomial 0x11d (x^8 + x^4 + x^3 + x^2 + 1)
 * which is the same polynomial used in AES. Pre-computed log and antilog
 * (exp) tables enable fast multiplication, division, and inversion.
 *
 * GF(256) elements are represented as numbers 0..255.
 * Addition is XOR (same as subtraction).
 *
 * @module
 */

/** Size of the field (2^8 = 256 elements). */
const GF_SIZE = 256;

/** Length of the log/exp tables (2 * GF_SIZE - 2 = 510 for simplification). */
const GF_TABLE_SIZE = 512;

/** The irreducible polynomial: x^8 + x^4 + x^3 + x^2 + 1 = 0x11d. */
const IRREDUCIBLE_POLY = 0x11d;

/**
 * Log table: log[value] = discrete logarithm (exponent) in GF(256).
 * log[0] is undefined (0 has no log); we set it to 0 for convenience.
 */
const logTable = new Uint8Array(GF_SIZE);

/**
 * Antilog (exponential) table: exp[power] = field element.
 * Sized larger than GF_SIZE to avoid modulo operations during multiplication.
 */
const expTable = new Uint8Array(GF_TABLE_SIZE);

/**
 * Initialize the log and antilog tables for the GF(256) field.
 * Builds the field by starting with generator 2 (α = 0x02) and
 * multiplying repeatedly, wrapping through the irreducible polynomial.
 */
function initTables(): void {
  let x = 1;
  // Index 0 is special: log[0] is undefined, but we set it to 0
  // We'll fill starting from index 1
  for (let i = 0; i < GF_SIZE - 1; i++) {
    expTable[i] = x;
    logTable[x] = i;
    // Multiply x by 2 (the generator α = 0x02) in GF(256)
    x = x << 1;
    if (x >= GF_SIZE) {
      x ^= IRREDUCIBLE_POLY;
    }
  }

  // Duplicate the exp table for the remainder (GF_TABLE_SIZE entries)
  // This lets mul(a,b) = exp[log[a] + log[b]] without a modulo check
  for (let i = GF_SIZE - 1; i < GF_TABLE_SIZE; i++) {
    expTable[i] = expTable[i - (GF_SIZE - 1)];
  }

  // Fill log[0] — we'll leave it as 0, and mul/div will handle 0 specially
  logTable[0] = 0;
}

// Initialize tables at module load time
initTables();

/**
 * Add two elements in GF(256). Addition is XOR.
 * Alias: sub(a, b) === add(a, b).
 *
 * @param a - Field element (0..255)
 * @param b - Field element (0..255)
 * @returns a ⊕ b (XOR)
 */
export function add(a: number, b: number): number {
  return (a ^ b) >>> 0;
}

/**
 * Subtract two elements in GF(256). Subtraction is same as addition (XOR).
 *
 * @param a - Field element (0..255)
 * @param b - Field element (0..255)
 * @returns a ⊕ b (XOR)
 */
export function sub(a: number, b: number): number {
  return add(a, b);
}

/**
 * Multiply two elements in GF(256).
 * Uses pre-computed log/antilog tables for O(1) multiplication.
 *
 * @param a - Field element (0..255)
 * @param b - Field element (0..255)
 * @returns a * b in GF(256)
 */
export function mul(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  // logTable[a] + logTable[b] in Z_255
  const sum = logTable[a] + logTable[b];
  // expTable[sum] works because we duplicated the table
  return expTable[sum];
}

/**
 * Divide a by b in GF(256).
 *
 * @param a - Numerator field element (0..255)
 * @param b - Denominator field element (0..255), must not be 0
 * @returns a / b in GF(256)
 * @throws {RangeError} If b is 0 (division by zero)
 */
export function div(a: number, b: number): number {
  if (b === 0) {
    throw new RangeError('GF(256) division by zero');
  }
  if (a === 0) {
    return 0;
  }
  // logTable[a] - logTable[b] in Z_255, add 255 to avoid negative
  const diff = (logTable[a] - logTable[b] + 255) % 255;
  return expTable[diff];
}

/**
 * Raise a field element to a non-negative integer power.
 *
 * @param a - Field element (0..255)
 * @param n - Non-negative integer exponent
 * @returns a^n in GF(256)
 */
export function pow(a: number, n: number): number {
  if (n === 0) {
    return 1;
  }
  if (a === 0) {
    return 0;
  }
  // (log[a] * n) mod 255
  const idx = (logTable[a] * n) % 255;
  return expTable[idx];
}

/**
 * Compute the multiplicative inverse of a field element.
 * inv(0) is undefined but we return 0 for convenience.
 *
 * @param a - Field element (0..255)
 * @returns a^{-1} in GF(256), or 0 if a === 0
 */
export function inv(a: number): number {
  if (a === 0) {
    return 0; // 0 has no inverse, return 0
  }
  // By Fermat's Little Theorem in GF(256): a^{-1} = a^{254}
  // Or equivalently: exp[255 - log[a]]
  return expTable[255 - logTable[a]];
}

/**
 * Generate a random non-zero field element using the provided RNG.
 *
 * @param nextByte - Function that returns a random byte (0..255)
 * @returns A random non-zero GF(256) element
 */
export function randomNonZero(nextByte: () => number): number {
  let v: number;
  do {
    v = nextByte();
  } while (v === 0);
  return v;
}
