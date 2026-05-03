/**
 * Incremental RLNC decoder using Gaussian elimination over GF(256).
 *
 * Maintains per-generation matrix state and incrementally incorporates
 * new coded/systematic symbols. When enough linearly independent symbols
 * have been received (rank K), performs back-substitution to reconstruct
 * the original source symbols.
 *
 * Coefficient vector derivation is kept in sync with the encoder
 * (same xoshiro128** PRNG seeded from generation/coded index pair).
 *
 * @module
 */

import { sub, mul, inv } from './gf256';
import { deriveCoefficientSeed, generateCoefficients } from './rlnc_encoder';

interface MatrixRow {
  coeffs: Uint8Array;
  data: Uint8Array;
}

/**
 * Incremental RLNC decoder for a single generation.
 */
export class RLNCDecoder {
  readonly k: number;
  readonly symbolLength: number;

  private rows: MatrixRow[] = [];
  private pivotForColumn: number[];
  private _rank: number = 0;
  private _solved: boolean = false;
  private _sourceSymbols: Uint8Array[] | null = null;

  constructor(k: number, symbolLength: number) {
    this.k = k;
    this.symbolLength = symbolLength;
    this.pivotForColumn = new Array(k).fill(-1);
  }

  get rank(): number {
    return this._rank;
  }

  isSolved(): boolean {
    return this._solved;
  }

  addSymbol(symbol: Uint8Array, coefficients: Uint8Array): boolean {
    if (symbol.length !== this.symbolLength) {
      throw new RangeError(
        `addSymbol: expected symbol length ${this.symbolLength}, got ${symbol.length}`,
      );
    }
    if (coefficients.length !== this.k) {
      throw new RangeError(
        `addSymbol: expected coefficient length ${this.k}, got ${coefficients.length}`,
      );
    }
    if (this._solved) {
      return false;
    }

    const row: MatrixRow = {
      coeffs: new Uint8Array(coefficients),
      data: new Uint8Array(symbol),
    };

    // Forward elimination
    for (let col = 0; col < this.k; col++) {
      const pivotRowIdx = this.pivotForColumn[col];
      if (pivotRowIdx < 0) continue;
      if (row.coeffs[col] === 0) continue;
      const pivotRow = this.rows[pivotRowIdx];
      const factor = row.coeffs[col];
      this.eliminateFromRow(row, pivotRow, factor, col);
    }

    // Find new pivot
    let pivotCol = -1;
    for (let col = 0; col < this.k; col++) {
      if (row.coeffs[col] !== 0) {
        pivotCol = col;
        break;
      }
    }

    if (pivotCol < 0) {
      return false;
    }

    // Scale pivot to 1
    const pivotValue = row.coeffs[pivotCol];
    if (pivotValue !== 1) {
      const scaleFactor = inv(pivotValue);
      for (let col = pivotCol; col < this.k; col++) {
        row.coeffs[col] = mul(row.coeffs[col], scaleFactor);
      }
      for (let b = 0; b < this.symbolLength; b++) {
        row.data[b] = mul(row.data[b], scaleFactor);
      }
    }

    // Eliminate from existing rows
    for (let i = 0; i < this.rows.length; i++) {
      const existingRow = this.rows[i];
      if (existingRow.coeffs[pivotCol] === 0) continue;
      const factor = existingRow.coeffs[pivotCol];
      this.eliminateFromRow(existingRow, row, factor, pivotCol);
    }

    // Insert maintaining pivot-column order
    let insertIdx = 0;
    while (insertIdx < this.rows.length) {
      const existingPivot = this.findPivot(this.rows[insertIdx]);
      if (existingPivot < 0) break;
      if (existingPivot < pivotCol) {
        insertIdx++;
      } else {
        break;
      }
    }

    this.pivotForColumn[pivotCol] = insertIdx;
    for (let col = 0; col < this.k; col++) {
      if (this.pivotForColumn[col] >= insertIdx && col !== pivotCol) {
        this.pivotForColumn[col]++;
      }
    }

    this.rows.splice(insertIdx, 0, row);
    this._rank++;

    if (this._rank === this.k) {
      this.solve();
    }

    return true;
  }

  getSourceSymbols(): Uint8Array[] | null {
    return this._sourceSymbols ? this._sourceSymbols.map((s) => new Uint8Array(s)) : null;
  }

  private findPivot(row: MatrixRow): number {
    for (let col = 0; col < this.k; col++) {
      if (row.coeffs[col] !== 0) return col;
    }
    return -1;
  }

  private eliminateFromRow(
    target: MatrixRow,
    srcRow: MatrixRow,
    factor: number,
    startCol: number,
  ): void {
    for (let col = startCol; col < this.k; col++) {
      target.coeffs[col] = sub(target.coeffs[col], mul(factor, srcRow.coeffs[col]));
    }
    for (let b = 0; b < this.symbolLength; b++) {
      target.data[b] = sub(target.data[b], mul(factor, srcRow.data[b]));
    }
  }

  private solve(): void {
    this.rows.sort((a, b) => {
      const pa = this.findPivot(a);
      const pb = this.findPivot(b);
      return pa - pb;
    });

    for (let col = 0; col < this.k; col++) {
      this.pivotForColumn[col] = -1;
    }
    for (let i = 0; i < this.rows.length; i++) {
      const p = this.findPivot(this.rows[i]);
      if (p >= 0) {
        this.pivotForColumn[p] = i;
      }
    }

    const sourceSymbols: Uint8Array[] = new Array(this.k);
    for (let col = 0; col < this.k; col++) {
      const rowIdx = this.pivotForColumn[col];
      if (rowIdx < 0) {
        throw new Error(
          `RLNCDecoder: internal error — no pivot row for column ${col} despite rank=${this.k}`,
        );
      }
      sourceSymbols[col] = new Uint8Array(this.rows[rowIdx].data);
    }

    this._sourceSymbols = sourceSymbols;
    this._solved = true;
  }
}

/**
 * Per-generation decoder that tracks received systematic and coded packets.
 */
export class GenerationDecoder {
  private k: number;
  private symbolLength: number;
  private decoders: Map<number, RLNCDecoder> = new Map();

  constructor(k: number, symbolLength: number) {
    this.k = k;
    this.symbolLength = symbolLength;
  }

  addSymbol(
    generationIndex: number,
    symbol: Uint8Array,
    coefficients: Uint8Array,
  ): boolean {
    const decoder = this.getOrCreateDecoder(generationIndex);
    return decoder.addSymbol(symbol, coefficients);
  }

  addSystematicSymbol(
    generationIndex: number,
    symbol: Uint8Array,
    sourceIndex: number,
  ): boolean {
    const coeffs = new Uint8Array(this.k);
    coeffs[sourceIndex] = 1;
    return this.addSymbol(generationIndex, symbol, coeffs);
  }

  addCodedSymbol(
    generationIndex: number,
    symbol: Uint8Array,
    codedSymbolIndex: number,
  ): boolean {
    const seed = deriveCoefficientSeed(generationIndex, codedSymbolIndex);
    const coeffs = generateCoefficients(this.k, seed);
    return this.addSymbol(generationIndex, symbol, coeffs);
  }

  isSolved(generationIndex: number): boolean {
    const decoder = this.decoders.get(generationIndex);
    return decoder !== undefined && decoder.isSolved();
  }

  getSourceSymbols(generationIndex: number): Uint8Array[] | null {
    const decoder = this.decoders.get(generationIndex);
    return decoder ? decoder.getSourceSymbols() : null;
  }

  rank(generationIndex: number): number {
    const decoder = this.decoders.get(generationIndex);
    return decoder ? decoder.rank : 0;
  }

  private getOrCreateDecoder(generationIndex: number): RLNCDecoder {
    let decoder = this.decoders.get(generationIndex);
    if (!decoder) {
      decoder = new RLNCDecoder(this.k, this.symbolLength);
      this.decoders.set(generationIndex, decoder);
    }
    return decoder;
  }
}
