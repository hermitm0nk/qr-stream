/**
 * Terminal QR rasterizer.
 *
 * Renders a QR-code boolean matrix into compact terminal output using
 * half-block Unicode characters (U+2580 / U+2584 / U+2588 / space).
 * Each terminal row displays two QR rows, giving an approximately
 * square aspect ratio in typical monospace terminals.
 *
 * Explicit ANSI colours (white bg / black fg) are applied so the QR
 * renders correctly on both light and dark terminal themes.
 */

const BLOCK_FULL = '\u2588';
const BLOCK_UPPER = '\u2580';
const BLOCK_LOWER = '\u2584';
const BLOCK_EMPTY = ' ';

/** White background, black foreground */
const QR_LINE_PREFIX = '\x1b[47m\x1b[30m';
/** Reset colours */
const QR_LINE_SUFFIX = '\x1b[0m';

/**
 * Render a QR boolean matrix to terminal lines.
 * @param matrix 2-D array where true = dark module
 * @param quietZone number of white modules to pad on each side (default 4)
 * @returns Array of terminal strings (one per screen row)
 */
export function renderToTerminal(matrix: boolean[][], quietZone: number = 4): string[] {
  const size = matrix.length;
  const totalWidth = size + quietZone * 2;
  const lines: string[] = [];

  // Top quiet zone — each terminal row covers 2 QR modules vertically
  const padRows = Math.ceil(quietZone / 2);
  for (let i = 0; i < padRows; i++) {
    lines.push(QR_LINE_PREFIX + ' '.repeat(totalWidth) + QR_LINE_SUFFIX);
  }

  for (let y = 0; y < size; y += 2) {
    let line = ' '.repeat(quietZone);
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
    line += ' '.repeat(quietZone);
    lines.push(QR_LINE_PREFIX + line + QR_LINE_SUFFIX);
  }

  // Bottom quiet zone
  for (let i = 0; i < padRows; i++) {
    lines.push(QR_LINE_PREFIX + ' '.repeat(totalWidth) + QR_LINE_SUFFIX);
  }

  return lines;
}

/**
 * Enter the alternate screen buffer (preserves normal buffer on exit).
 */
export function enterAltBuffer(): void {
  process.stdout.write('\x1b[?1049h');
}

/**
 * Exit the alternate screen buffer and restore the normal buffer.
 */
export function exitAltBuffer(): void {
  process.stdout.write('\x1b[?1049l');
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
 * Move cursor up n lines (stays in column 0 if already there).
 */
export function moveCursorUp(n: number): void {
  if (n > 0) {
    process.stdout.write(`\x1b[${n}A`);
  }
}

/**
 * Show the terminal cursor.
 */
export function showCursor(): void {
  process.stdout.write('\x1b[?25h');
}
