/**
 * xoshiro128** PRNG implementation.
 *
 * A 32-bit seed is expanded to a 128-bit state via splitmix64,
 * then the xoshiro128** algorithm generates high-quality 32-bit
 * unsigned integers. Used for deterministic coefficient generation
 * in the RLNC encoder/decoder.
 *
 * Reference: https://prng.di.unimi.it/xoshiro128starstar.c
 *
 * @module
 */

/** Internal 128-bit state as four 32-bit unsigned integers. */
export class Xoshiro128 {
  private s: Uint32Array;

  /**
   * Create a new xoshiro128** instance from a 32-bit seed.
   * The seed is expanded to a 128-bit state using splitmix64.
   *
   * @param seed - 32-bit integer seed
   */
  constructor(seed: number) {
    // Normalize to unsigned 32-bit
    const s = ((seed >>> 0) | 0) >>> 0;
    this.s = new Uint32Array(4);
    // Use splitmix64 to expand the 32-bit seed into 4 × 32-bit state words
    // splitmix64 generates two 64-bit outputs from a 64-bit state, but we
    // only have a 32-bit seed; we treat it as the initial splitmix64 state.
    let state: bigint = BigInt(s);
    for (let i = 0; i < 4; i++) {
      state = splitmix64Next(state);
      // Take lower 32 bits of each 64-bit output
      this.s[i] = Number(state & BigInt(0xffffffff)) >>> 0;
    }
  }

  /**
   * Generate the next 32-bit unsigned integer.
   * Uses the xoshiro128** algorithm.
   *
   * @returns A pseudo-random 32-bit unsigned integer (0..2^32-1)
   */
  next(): number {
    const result = xoshiro128StarStar(this.s);
    // Advance state
    const t = this.s[1] << 9;

    this.s[2] ^= this.s[0];
    this.s[3] ^= this.s[1];
    this.s[1] ^= this.s[2];
    this.s[0] ^= this.s[3];

    this.s[2] ^= t;

    // Rotate state[3] left by 11
    this.s[3] = rotl(this.s[3], 11);

    return result >>> 0;
  }

  /**
   * Get a random byte (0..255) from the current state.
   */
  nextByte(): number {
    return this.next() & 0xff;
  }
}

/**
 * Splitmix64 step: advance state and return 64-bit output.
 */
function splitmix64Next(state: bigint): bigint {
  state = (state + BigInt(0x9e3779b97f4a7c15)) & BigInt('0xffffffffffffffff');
  let z = state;
  z = (z ^ (z >> 30n)) * BigInt(0xbf58476d1ce4e5b9);
  z = (z ^ (z >> 27n)) & BigInt('0xffffffffffffffff');
  z = (z * BigInt(0x94d049bb133111eb)) & BigInt('0xffffffffffffffff');
  z = z ^ (z >> 31n);
  return z & BigInt('0xffffffffffffffff');
}

/**
 * xoshiro128** scrambler: s[0] * 5, rotate left 7, * 9
 */
function xoshiro128StarStar(s: Uint32Array): number {
  const result = Math.imul(
    rotl(Math.imul(s[1] >>> 0, 5) >>> 0, 7) >>> 0,
    9
  ) >>> 0;
  return result;
}

/**
 * Rotate a 32-bit unsigned integer left by k bits.
 */
function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
