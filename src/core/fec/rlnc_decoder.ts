/**
 * Incremental RLNC decoder using Gaussian elimination over GF(256).
 *
 * Maintains per-generation matrix state and incrementally incorporates
 * new coded/systematic symbols. When enough linearly independent symbols
 * have been received (rank K), performs back-substitution to reconstruct
 * the original source symbols.
 *
 * Coefficient vector derivation is kept in sync with the encoder
 * (same xoshiro128** PRNG seeded from session/generation/coding triple).
 *
 * @module
 */

import { add, sub, mul, div, inv } from './gf256';
import { Xoshiro128 } from './xoshiro';
import { deriveCoefficientSeed, generateCoefficients } from './rlnc_encoder';

/**
 * Internal representation of a single row in the augmented matrix.
 * Each row has a coefficient vector (length K) over GF(256) and
 * the corresponding coded symbol data bytes (length L).
 */
interface MatrixRow {
  /** Coefficient vector for this row (length K) */
  coeffs: Uint8Array;
  /** Data bytes (the RHS of the linear system) */
  data: Uint8Array;
}

/**
 * Incremental RLNC decoder using Gaussian elimination over GF(256).
 *
 * Manages one generation: receives symbols (systematic or coded) and
 * incrementally reduces the coefficient matrix to row-reduced echelon form.
 * Once rank reaches K, the source symbols can be read out.
 */
export class RLNCDecoder {
  /** Number of source symbols in this generation */
  readonly k: number;
  /** Length of each symbol in bytes */
  readonly symbolLength: number;
  /** Session identifier (for coefficient derivation) */
  readonly sessionId: number;
  /** Generation index within the session */
  readonly generationIndex: number;
  /** Coding seed (for coefficient derivation) */
  readonly codingSeed: number;

  /** Rows currently in the reduced row-echelon matrix, sorted by pivot column */
  private rows: MatrixRow[] = [];
  /** Mapping from column index → row index (or -1 if column is not a pivot) */
  private pivotForColumn: number[];
  /** Current rank (number of linearly independent rows) */
  private _rank: number = 0;
  /** Whether the system is fully solved (rank === K) */
  private _solved: boolean = false;
  /** Reconstructed source symbols (valid only when solved) */
  private _sourceSymbols: Uint8Array[] | null = null;

  constructor(
    k: number,
    symbolLength: number,
    sessionId: number,
    generationIndex: number,
    codingSeed: number
  ) {
    this.k = k;
    this.symbolLength = symbolLength;
    this.sessionId = sessionId;
    this.generationIndex = generationIndex;
    this.codingSeed = codingSeed;
    this.pivotForColumn = new Array(k).fill(-1);
  }

  /**
   * Current rank of the received coefficient matrix.
   * When rank reaches K, the system can be solved.
   */
  get rank(): number {
    return this._rank;
  }

  /**
   * Whether the linear system has full rank and source symbols
   * have been reconstructed.
   */
  isSolved(): boolean {
    return this._solved;
  }

  /**
   * Add a received symbol (coded or systematic) to the decoder.
   *
   * @param symbol - The received symbol data bytes
   * @param coefficients - The coefficient vector (length K) over GF(256)
   * @returns true if the symbol was accepted (linearly independent), false if redundant
   */
  addSymbol(symbol: Uint8Array, coefficients: Uint8Array): boolean {
    if (symbol.length !== this.symbolLength) {
      throw new RangeError(
        `addSymbol: expected symbol length ${this.symbolLength}, got ${symbol.length}`
      );
    }
    if (coefficients.length !== this.k) {
      throw new RangeError(
        `addSymbol: expected coefficient length ${this.k}, got ${coefficients.length}`
      );
    }
    if (this._solved) {
      return false; // Already solved, ignore further symbols
    }

    // Working copy: the new row we're inserting
    const row: MatrixRow = {
      coeffs: new Uint8Array(coefficients),
      data: new Uint8Array(symbol),
    };

    // --- STEP 1: Forward elimination using existing pivots ---
    // For each existing pivot column (in order of increasing column),
    // eliminate that column from the new row.
    for (let col = 0; col < this.k; col++) {
      const pivotRowIdx = this.pivotForColumn[col];
      if (pivotRowIdx < 0) continue;
      if (row.coeffs[col] === 0) continue;

      // Eliminate: row = row - (coeff / pivot) * pivotRow
      const pivotRow = this.rows[pivotRowIdx];
      // pivotRow.coeffs[col] is always 1 (RREF invariant)
      const factor = row.coeffs[col]; // since pivot = 1, factor = coeff
      this.eliminateFromRow(row, pivotRow, factor, col);
    }

    // --- STEP 2: Find first non-zero coefficient (new pivot) ---
    let pivotCol = -1;
    for (let col = 0; col < this.k; col++) {
      if (row.coeffs[col] !== 0) {
        pivotCol = col;
        break;
      }
    }

    // If all-zero, the row is linearly dependent — discard
    if (pivotCol < 0) {
      return false;
    }

    // --- STEP 3: Scale row so pivot = 1 ---
    const pivotValue = row.coeffs[pivotCol];
    if (pivotValue !== 1) {
      const scaleFactor = inv(pivotValue);
      // Scale all remaining coefficients (pivot column and beyond)
      for (let col = pivotCol; col < this.k; col++) {
        row.coeffs[col] = mul(row.coeffs[col], scaleFactor);
      }
      // Scale data bytes
      for (let b = 0; b < this.symbolLength; b++) {
        row.data[b] = mul(row.data[b], scaleFactor);
      }
    }

    // --- STEP 4: Eliminate this new pivot from all existing rows ---
    // (to maintain RREF — both above and below)
    for (let i = 0; i < this.rows.length; i++) {
      const existingRow = this.rows[i];
      if (existingRow.coeffs[pivotCol] === 0) continue;

      const factor = existingRow.coeffs[pivotCol];
      this.eliminateFromRow(existingRow, row, factor, pivotCol);
    }

    // --- STEP 5: Insert the new row, maintaining pivot-column order ---
    // Find the correct insertion position (rows sorted by pivot column)
    let insertIdx = 0;
    while (insertIdx < this.rows.length) {
      const existingPivot = this.findPivot(this.rows[insertIdx]);
      if (existingPivot < 0) break; // shouldn't happen
      if (existingPivot < pivotCol) {
        insertIdx++;
      } else {
        break;
      }
    }

    // Update pivot mapping for the new row
    this.pivotForColumn[pivotCol] = insertIdx;
    // Shift existing pivot mappings for columns that moved
    for (let col = 0; col < this.k; col++) {
      if (this.pivotForColumn[col] >= insertIdx && col !== pivotCol) {
        this.pivotForColumn[col]++;
      }
    }

    this.rows.splice(insertIdx, 0, row);
    this._rank++;

    // --- STEP 6: Check if solved ---
    if (this._rank === this.k) {
      this.solve();
    }

    return true;
  }

  /**
   * Get reconstructed source symbols. Valid only when isSolved() returns true.
   *
   * @returns Array of K Uint8Arrays, each being a reconstructed source symbol,
   *          or null if not yet solved
   */
  getSourceSymbols(): Uint8Array[] | null {
    return this._sourceSymbols ? this._sourceSymbols.map(s => new Uint8Array(s)) : null;
  }

  /**
   * Find the pivot column of a matrix row (the first non-zero coefficient).
   */
  private findPivot(row: MatrixRow): number {
    for (let col = 0; col < this.k; col++) {
      if (row.coeffs[col] !== 0) return col;
    }
    return -1;
  }

  /**
   * Eliminate a factor-scaled version of `srcRow` from `targetRow`.
   * target = target - factor * srcRow
   * Both row coefficient vectors and data bytes are updated.
   */
  private eliminateFromRow(
    target: MatrixRow,
    srcRow: MatrixRow,
    factor: number,
    startCol: number
  ): void {
    // Eliminate coefficients from startCol onwards
    for (let col = startCol; col < this.k; col++) {
      target.coeffs[col] = sub(target.coeffs[col], mul(factor, srcRow.coeffs[col]));
    }
    // Eliminate data bytes
    for (let b = 0; b < this.symbolLength; b++) {
      target.data[b] = sub(target.data[b], mul(factor, srcRow.data[b]));
    }
  }

  /**
   * Solve the system once full rank is achieved.
   * After this, the RHS data contains the source symbols directly
   * (since the matrix is in RREF = identity).
   */
  private solve(): void {
    // Validate: rows should form an identity matrix in RREF
    // After incremental RREF maintenance, the first K columns should be identity
    // so the data already represents the source symbols.
    // But we verify and extract in order of pivot columns.

    // Sort rows by pivot column to ensure correct ordering
    this.rows.sort((a, b) => {
      const pa = this.findPivot(a);
      const pb = this.findPivot(b);
      return pa - pb;
    });

    // Update pivot mapping
    for (let col = 0; col < this.k; col++) {
      this.pivotForColumn[col] = -1;
    }
    for (let i = 0; i < this.rows.length; i++) {
      const p = this.findPivot(this.rows[i]);
      if (p >= 0) {
        this.pivotForColumn[p] = i;
      }
    }

    // Verify RREF structure: row i should have 1 at column i
    // Any deviation means we need to back-substitute
    const sourceSymbols: Uint8Array[] = new Array(this.k);

    // In a proper RREF with rank K, the first K rows should be identity
    // But our incremental algorithm maintains this invariant,
    // so we can just extract data directly from each pivot row.
    for (let col = 0; col < this.k; col++) {
      const rowIdx = this.pivotForColumn[col];
      if (rowIdx < 0) {
        throw new Error(
          `RLNCDecoder: internal error — no pivot row for column ${col} despite rank=${this.k}`
      );
      }
      const row = this.rows[rowIdx];
      sourceSymbols[col] = new Uint8Array(row.data);
    }

    this._sourceSymbols = sourceSymbols;
    this._solved = true;
  }
}

/**
 * Per-generation decoder that tracks received systematic and coded packets.
 *
 * Manages a mapping from generation index to RLNCDecoder instances.
 * Coefficient derivation matches the encoder (same PRNG seeded from
 * session ID, generation index, and coding seed).
 */
export class GenerationDecoder {
  /** Session identifier */
  private sessionId: number;
  /** Coding seed parameter */
  private codingSeed: number;
  /** Number of source symbols per generation */
  private k: number;
  /** Length of each symbol in bytes */
  private symbolLength: number;
  /** Map from generation index → RLNCDecoder */
  private decoders: Map<number, RLNCDecoder> = new Map();

  constructor(
    k: number,
    symbolLength: number,
    sessionId: number,
    codingSeed: number
  ) {
    this.k = k;
    this.symbolLength = symbolLength;
    this.sessionId = sessionId;
    this.codingSeed = codingSeed;
  }

  /**
   * Add a received symbol to a specific generation.
   *
   * @param generationIndex - The generation this symbol belongs to
   * @param symbol - The received symbol data bytes
   * @param coefficients - The coefficient vector for this symbol (length K)
   * @returns true if the symbol was accepted as linearly independent
   */
  addSymbol(
    generationIndex: number,
    symbol: Uint8Array,
    coefficients: Uint8Array
  ): boolean {
    const decoder = this.getOrCreateDecoder(generationIndex);

    // Handle systematic symbols: coefficients should have a single 1
    // and the rest 0. The decoder's Gaussian elimination handles this
    // correctly regardless.
    return decoder.addSymbol(symbol, coefficients);
  }

  /**
   * Add a systematic symbol (where only one coefficient is non-zero).
   * This is a convenience wrapper.
   *
   * @param generationIndex - The generation this symbol belongs to
   * @param symbol - The received symbol data bytes
   * @param sourceIndex - The index of the source symbol (0..K-1)
   * @returns true if the symbol was accepted
   */
  addSystematicSymbol(
    generationIndex: number,
    symbol: Uint8Array,
    sourceIndex: number
  ): boolean {
    const coeffs = new Uint8Array(this.k);
    coeffs[sourceIndex] = 1;
    return this.addSymbol(generationIndex, symbol, coeffs);
  }

  /**
   * Add a coded (non-systematic) symbol. The coefficient vector is
   * derived deterministically from the generation parameters and the
   * coding symbol index.
   *
   * @param generationIndex - The generation this symbol belongs to
   * @param symbol - The received coded symbol data bytes
   * @param codedSymbolIndex - Index among coded symbols (0..R-1)
   * @returns true if the symbol was accepted
   */
  addCodedSymbol(
    generationIndex: number,
    symbol: Uint8Array,
    codedSymbolIndex: number
  ): boolean {
    // Derive coefficient seed matching the encoder
    const baseSeed = deriveCoefficientSeed(
      this.sessionId,
      generationIndex,
      this.codingSeed
    );
    const symbolSeed = (baseSeed ^ ((codedSymbolIndex + 1) * 0x9e3779b9)) >>> 0;
    const coeffs = generateCoefficients(this.k, symbolSeed);

    return this.addSymbol(generationIndex, symbol, coeffs);
  }

  /**
   * Check if a specific generation has been fully decoded.
   */
  isSolved(generationIndex: number): boolean {
    const decoder = this.decoders.get(generationIndex);
    return decoder !== undefined && decoder.isSolved();
  }

  /**
   * Get the reconstructed source symbols for a generation.
   *
   * @param generationIndex - The generation to get symbols for
   * @returns Array of K source symbol byte arrays, or null if not yet solved
   */
  getSourceSymbols(generationIndex: number): Uint8Array[] | null {
    const decoder = this.decoders.get(generationIndex);
    return decoder ? decoder.getSourceSymbols() : null;
  }

  /**
   * Get the current rank for a generation.
   */
  rank(generationIndex: number): number {
    const decoder = this.decoders.get(generationIndex);
    return decoder ? decoder.rank : 0;
  }

  /**
   * Get or create an RLNCDecoder for a generation.
   */
  private getOrCreateDecoder(generationIndex: number): RLNCDecoder {
    let decoder = this.decoders.get(generationIndex);
    if (!decoder) {
      decoder = new RLNCDecoder(
        this.k,
        this.symbolLength,
        this.sessionId,
        generationIndex,
        this.codingSeed
      );
      this.decoders.set(generationIndex, decoder);
    }
    return decoder;
  }
}
