/**
 * Terminal QR rasterizer.
 *
 * Renders a QR-code boolean matrix into compact terminal output using
 * half-block Unicode characters (U+2580 / U+2584 / U+2588 / space).
 * Each terminal row displays two QR rows, giving an approximately
 * square aspect ratio in typical monospace terminals.
 */

const BLOCK_FULL = '\u2588';
const BLOCK_UPPER = '\u2580';
const BLOCK_LOWER = '\u2584';
const BLOCK_EMPTY = ' ';

/**
 * Render a QR boolean matrix to terminal lines.
 * @param matrix 2-D array where true = dark module
 * @returns Array of terminal strings (one per screen row)
 */
export function renderToTerminal(matrix: boolean[][]): string[] {
  const size = matrix.length;
  const lines: string[] = [];

  for (let y = 0; y < size; y += 2) {
    let line = '';
    for (let x = 0; x < size; x++) {
      const top = matrix[y][x];
      const bottom = y + 1 < size ? matrix[y + 1][x] : false;

      if (top && bottom) {
        line += BLOCK_FULL;
      } else if (top) {
        line += BLOCK_UPPER;
      } else if (bottom) {
        line += BLOCK_LOWER;
      } else {
        line += BLOCK_EMPTY;
      }
    }
    lines.push(line);
  }

  return lines;
}

/**
 * Clear the terminal screen and move cursor to home position.
 */
export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

/**
 * Hide the terminal cursor.
 */
export function hideCursor(): void {
  process.stdout.write('\x1b[?25l');
}

/**
 * Show the terminal cursor.
 */
export function showCursor(): void {
  process.stdout.write('\x1b[?25h');
}
