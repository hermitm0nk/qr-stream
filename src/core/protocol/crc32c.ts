/**
 * CRC32C (Castagnoli) implementation for packet integrity.
 *
 * Uses polynomial 0x82F63B78 (reflected form of 0x1EDC6F41)
 * with a pre-computed 256-entry lookup table.
 *
 * @module
 */

/** Pre-computed CRC32C lookup table (256 entries). */
const TABLE = new Uint32Array(256);

/** Whether the lookup table has been built. */
let tableBuilt = false;

/**
 * Build the CRC32C lookup table using the reflected polynomial.
 *
 * Polynomial: 0x82F63B78 (Castagnoli, reflected)
 * Each table entry is computed by shifting the index byte and
 * XOR-ing with the polynomial when the LSB is set.
 */
function buildTable(): void {
  const poly = 0x82f63b78 >>> 0;
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ poly;
      } else {
        crc >>>= 1;
      }
    }
    TABLE[i] = crc >>> 0;
  }
  tableBuilt = true;
}

/**
 * Ensure the lookup table has been initialized.
 * Called lazily on first CRC computation.
 */
function ensureTable(): void {
  if (!tableBuilt) {
    buildTable();
  }
}

/**
 * Compute the CRC32C checksum over a byte array.
 *
 * Uses the reflected Castagnoli polynomial (0x82F63B78) with
 * the standard CRC algorithm: initialize to 0xFFFFFFFF, process
 * each byte through the lookup table, and XOR the final result
 * with 0xFFFFFFFF.
 *
 * @param data   - Input bytes
 * @param initial - Initial CRC value (for chunked computation, default 0)
 * @returns The 32-bit CRC32C value (unsigned)
 */
export function crc32c(data: Uint8Array, initial: number = 0): number {
  ensureTable();
  let crc = (initial ^ 0xffffffff) >>> 0;
  const len = data.length;
  for (let i = 0; i < len; i++) {
    const idx = (crc ^ data[i]) & 0xff;
    crc = (TABLE[idx] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Initialize a CRC32C computation.
 *
 * @returns Initial CRC state (0xFFFFFFFF)
 */
export function crc32cInit(): number {
  ensureTable();
  return 0xffffffff >>> 0;
}

/**
 * Update an in-progress CRC32C computation with additional data.
 *
 * @param crc  - Current CRC state
 * @param data - Additional bytes to incorporate
 * @returns Updated CRC state
 */
export function crc32cUpdate(crc: number, data: Uint8Array): number {
  ensureTable();
  let state = crc >>> 0;
  const len = data.length;
  for (let i = 0; i < len; i++) {
    const idx = (state ^ data[i]) & 0xff;
    state = (TABLE[idx] ^ (state >>> 8)) >>> 0;
  }
  return state;
}

/**
 * Finalize a CRC32C computation.
 *
 * @param crc - Final CRC state
 * @returns The completed CRC32C value
 */
export function crc32cFinal(crc: number): number {
  return ((crc >>> 0) ^ 0xffffffff) >>> 0;
}
