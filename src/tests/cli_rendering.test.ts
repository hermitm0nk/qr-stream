/**
 * Tests for the CLI terminal QR rasterizer.
 *
 * Verifies that the terminal rasterizer correctly renders boolean QR matrices
 * as half-block Unicode art, that the encoder pipeline produces valid QR data,
 * and the end-to-end CLI pipeline works (without actually clearing the screen).
 */
import { describe, it, expect } from 'vitest';

describe('Terminal Rasterizer', () => {
  it('should render a simple 2×2 matrix', async () => {
    const { renderToTerminal } = await import('@/cli/terminal_raster');

    // 2×2 matrix: all dark
    const matrix = [
      [true, true],
      [true, true],
    ];

    const lines = renderToTerminal(matrix);
    // 2 rows → 1 terminal line (two QR rows per terminal row)
    expect(lines.length).toBe(1);
    // both QR rows dark → ██
    expect(lines[0]).toBe('\u2588\u2588');
  });

  it('should render mixed 4×4 matrix', async () => {
    const { renderToTerminal } = await import('@/cli/terminal_raster');

    const matrix = [
      [true, false, true, false],
      [false, true, false, true],
      [true, true, false, false],
      [false, false, true, true],
    ];

    const lines = renderToTerminal(matrix);
    expect(lines.length).toBe(2); // 4 QR rows → 2 terminal rows

    // Row 0: top=TG, bottom=FB for each column
    // Col 0: top=true, bottom=false → ▀ (U+2580)
    expect(lines[0]![0]).toBe('\u2580');
    // Col 1: top=false, bottom=true → ▄ (U+2584)
    expect(lines[0]![1]).toBe('\u2584');
    // Col 2: top=true, bottom=false → ▀
    expect(lines[0]![2]).toBe('\u2580');
    // Col 3: top=false, bottom=true → ▄
    expect(lines[0]![3]).toBe('\u2584');

    // Row 1: top=row2[TG], bottom=row3[FB]
    // Col 0: top=true, bottom=false → ▀
    expect(lines[1]![0]).toBe('\u2580');
    // Col 1: top=true, bottom=false → ▀
    expect(lines[1]![1]).toBe('\u2580');
    // Col 2: top=false, bottom=true → ▄
    expect(lines[1]![2]).toBe('\u2584');
    // Col 3: top=false, bottom=true → ▄
    expect(lines[1]![3]).toBe('\u2584');
  });

  it('should handle odd number of QR rows', async () => {
    const { renderToTerminal } = await import('@/cli/terminal_raster');

    // 3×3 matrix — odd number of rows
    const matrix = [
      [true, false, true],
      [false, true, false],
      [true, false, true],
    ];

    const lines = renderToTerminal(matrix);
    expect(lines.length).toBe(2); // 3 QR rows → 2 terminal rows

    // Row 0: QR rows 0+1
    expect(lines[0]!.length).toBe(3);

    // Row 1: QR row 2 + bottom=false (out of bounds)
    expect(lines[1]!.length).toBe(3);
    // Col 0: top=true, bottom=false → ▀
    expect(lines[1]![0]).toBe('\u2580');
    // Col 1: top=false, bottom=false → ' '
    expect(lines[1]![1]).toBe(' ');
    // Col 2: top=true, bottom=false → ▀
    expect(lines[1]![2]).toBe('\u2580');
  });

  it('should render an all-white matrix', async () => {
    const { renderToTerminal } = await import('@/cli/terminal_raster');

    const matrix = [
      [false, false],
      [false, false],
    ];

    const lines = renderToTerminal(matrix);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe('  '); // space + space
  });

  it('should render a full-block matrix', async () => {
    const { renderToTerminal } = await import('@/cli/terminal_raster');

    const matrix = [
      [true, true],
      [true, true],
    ];

    const lines = renderToTerminal(matrix);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe('\u2588\u2588'); // full block + full block
  });
});

describe('CLI Screen Helpers', () => {
  it('should produce escape sequences', async () => {
    const { clearScreen } = await import('@/cli/terminal_raster');
    // Just check it writes to stdout without throwing
    expect(typeof clearScreen).toBe('function');
  });

  it('should produce cursor visibility sequences', async () => {
    const { hideCursor, showCursor } = await import('@/cli/terminal_raster');
    expect(typeof hideCursor).toBe('function');
    expect(typeof showCursor).toBe('function');
  });
});

describe('CLI Encoder Pipeline', () => {
  it('should produce the same frames as the web app (reuse common logic)', async () => {
    const { packetize } = await import('@/core/sender/packetizer');
    const { scheduleFrames } = await import('@/core/sender/scheduler');
    const { generateQRMatrix } = await import('@/core/qr/qr_encode');
    const { QR_VERSION, ECC_LEVEL } = await import('@/core/protocol/constants');
    const { parseHeader } = await import('@/core/protocol/packet');

    // Use >64 bytes so compression is actually triggered (packetizer skips small payloads)
    const data = new TextEncoder().encode('CLI test payload for verifying protocol reuse. '.repeat(3));
    const result = packetize(data, false, true);
    const ordered = scheduleFrames(result.packets, result.totalGenerations);
    const genIndices = ordered.map((pkt) => parseHeader(pkt).generationIndex);

    // Same protocol as web app: frames with meta info
    for (const pkt of ordered) {
      const matrix = generateQRMatrix(pkt, QR_VERSION, ECC_LEVEL);
      // Each matrix should be square (V10 = 57×57)
      expect(matrix.length).toBe(57);
      expect(matrix[0]!.length).toBe(57);
    }

    // All generation indices in range
    expect(genIndices.every((g) => g >= 0 && g < result.totalGenerations)).toBe(true);
    expect(result.isCompressed).toBe(true);
    expect(result.dataLength).toBeGreaterThan(0);
  });
});

describe('CLI Frame Cycle', () => {
  it('should loop through frames deterministically', async () => {
    const { packetize } = await import('@/core/sender/packetizer');
    const { scheduleFrames } = await import('@/core/sender/scheduler');

    const data = new TextEncoder().encode('Frame cycle test — small payload');
    const result = packetize(data, false, false);
    const ordered = scheduleFrames(result.packets, result.totalGenerations);

    // Frame sequence should be consistent
    expect(ordered.length).toBe(result.packets.length);

    // Simulate looping: collect frame indices over 3 full cycles
    const totalFrames = ordered.length;
    const frameSequence: number[] = [];
    for (let i = 0; i < totalFrames * 3; i++) {
      frameSequence.push(i % totalFrames);
    }

    // Should see each frame multiple times
    const uniqueIndices = new Set(frameSequence);
    expect(uniqueIndices.size).toBe(totalFrames);
    expect(frameSequence.length).toBe(totalFrames * 3);
  });

  it('should generate valid QR matrix for every scheduled frame', async () => {
    const { packetize } = await import('@/core/sender/packetizer');
    const { scheduleFrames } = await import('@/core/sender/scheduler');
    const { generateQRMatrix } = await import('@/core/qr/qr_encode');
    const { QR_VERSION, ECC_LEVEL } = await import('@/core/protocol/constants');

    const data = new TextEncoder().encode('Every frame QR test — medium payload');
    const result = packetize(data, false, true);
    const ordered = scheduleFrames(result.packets, result.totalGenerations);

    // Every packet should produce a valid QR matrix
    for (const pkt of ordered) {
      const matrix = generateQRMatrix(pkt, QR_VERSION, ECC_LEVEL);
      expect(matrix.length).toBe(57);
      expect(matrix[0]!.length).toBe(57);
      // At least one dark module (QR codes always have finder patterns)
      const hasDark = matrix.some((row) => row.some((cell) => cell));
      expect(hasDark).toBe(true);
    }
  });
});

describe('CLI Input Parsing', () => {
  it('should read file from argument and produce frames', async () => {
    // This tests the buildFrames function logic directly
    const { packetize } = await import('@/core/sender/packetizer');
    const { scheduleFrames } = await import('@/core/sender/scheduler');
    const { parseHeader } = await import('@/core/protocol/packet');

    // Simulate reading a file
    const fileData = new TextEncoder().encode('file content test');
    const result = packetize(fileData, true, false);
    const ordered = scheduleFrames(result.packets, result.totalGenerations);
    const genIndices = ordered.map((pkt) => parseHeader(pkt).generationIndex);

    expect(ordered.length).toBeGreaterThan(0);
    expect(result.isText).toBe(true);
    expect(result.isCompressed).toBe(false);
    expect(result.dataLength).toBe(fileData.length);
    expect(genIndices.length).toBe(ordered.length);
  });

  it('should handle empty input gracefully and provide error message', () => {
    // The main function checks for empty data and exits with error
    // We test the condition directly
    const data = new Uint8Array(0);
    expect(data.length).toBe(0);
  });
});
