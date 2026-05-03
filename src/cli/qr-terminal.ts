#!/usr/bin/env bun
/**
 * QR Terminal Display
 *
 * Displays a sequence of QR codes in the terminal for text/file transfer.
 * Reads text from stdin or a file argument, encodes it using the same
 * protocol as the webapp, and loops through the QR sequence until
 * interrupted.
 *
 * Usage:
 *   bun run src/cli/qr-terminal.ts                    # read from stdin
 *   bun run src/cli/qr-terminal.ts /path/to/file.txt  # read from file
 *   node --import=tsx src/cli/qr-terminal.ts ...      # with tsx
 */

import { readFileSync, existsSync, openSync, closeSync } from 'fs';
import { ReadStream } from 'tty';
import { generateQRMatrix } from '../core/qr/qr_encode';
import { packetize } from '../core/sender/packetizer';
import { scheduleFrames } from '../core/sender/scheduler';
import { QR_VERSION, ECC_LEVEL } from '../core/protocol/constants';
import {
  enterAltBuffer,
  exitAltBuffer,
  clearScreen,
  hideCursor,
  showCursor,
  renderToTerminal,
  moveCursorUp,
} from './terminal_raster';

const FPS_MS = 100;

// ─────────────────────────────────────────────────────────────────────────────────
// Help text
// ─────────────────────────────────────────────────────────────────────────────────

const HELP_TEXT = `
QR Terminal Display – encode text or a file into a looping QR-code sequence.

Usage:
  qr-terminal [file]           read from file
  echo "text" | qr-terminal    read from stdin

Controls:
  q, Q         quit
  Ctrl-C       quit

The app uses the same V10-M QR protocol as the web transfer demo.
`;

function showHelp(): void {
  console.log(HELP_TEXT.trim());
}

// ─────────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────────

function readInput(): Uint8Array {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    const filePath = args[0]!;
    if (!existsSync(filePath)) {
      console.error(`Error: file not found: ${filePath}`);
      process.exit(1);
    }
    return new Uint8Array(readFileSync(filePath));
  }

  // Read from stdin (fd 0)
  try {
    return new Uint8Array(readFileSync(0));
  } catch (err: any) {
    console.error(`Error reading stdin: ${err.message ?? String(err)}`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// Encode pipeline (reuse webapp protocol)
// ─────────────────────────────────────────────────────────────────────────────────

function buildFrames(data: Uint8Array): Uint8Array[] {
  const result = packetize(data, false, true);
  return scheduleFrames(result.packets, result.totalGenerations);
}

// ─────────────────────────────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  let data: Uint8Array;
  try {
    data = readInput();
  } catch (err: any) {
    console.error(`Error reading input: ${err.message ?? String(err)}`);
    process.exit(1);
  }

  if (data.length === 0) {
    console.error('Error: no input data. Provide a file path or pipe text to stdin.');
    process.exit(1);
  }

  const packets = buildFrames(data);

  // Pre-render all QR matrices to terminal strings
  const frames: string[][] = [];
  for (const pkt of packets) {
    const matrix = generateQRMatrix(pkt, QR_VERSION, ECC_LEVEL);
    frames.push(renderToTerminal(matrix));
  }

  const termWidth = process.stdout.columns ?? 80;
  const termHeight = process.stdout.rows ?? 24;
  const qrWidth = frames[0]?.[0]?.length ?? 0;
  const qrHeight = frames[0]?.length ?? 0;
  const padLeft = Math.max(0, Math.floor((termWidth - qrWidth) / 2));
  const padTop = Math.max(0, Math.floor((termHeight - qrHeight) / 2));

  let running = true;
  let frameIdx = 0;
  let firstDraw = true;

  function draw() {
    if (!running) return;

    const frame = frames[frameIdx]!;
    const lines: string[] = [];

    if (firstDraw) {
      // Top vertical padding (only on first draw)
      for (let i = 0; i < padTop; i++) {
        lines.push('');
      }
    }

    // QR frame, horizontally centred
    for (const row of frame) {
      lines.push(' '.repeat(padLeft) + row);
    }

    if (firstDraw) {
      firstDraw = false;
    } else {
      // Move cursor back to the first QR line so we overwrite in-place
      moveCursorUp(qrHeight);
    }

    process.stdout.write(lines.join('\n'));
    frameIdx = (frameIdx + 1) % frames.length;
  }

  function cleanup() {
    running = false;
    clearInterval(interval);
    exitAltBuffer();
    showCursor();
    if (ttyFd !== null) {
      try { closeSync(ttyFd); } catch {}
    }
    console.log('QR terminal display stopped.');
    process.exit(0);
  }

  // Switch to alternate buffer and clear it before drawing
  enterAltBuffer();
  clearScreen();

  // Keyboard handling — try /dev/tty first so it works even when stdin is a pipe
  let ttyFd: number | null = null;
  try {
    ttyFd = openSync('/dev/tty', 'rs');
    const stream = new ReadStream(ttyFd);
    stream.setRawMode(true);
    stream.setEncoding('utf8');
    stream.on('data', (key: string) => {
      if (key === 'q' || key === 'Q' || key === '\u0003') {
        cleanup();
      }
    });
    stream.resume();
    hideCursor();
  } catch {
    ttyFd = null;
    if (process.stdin.isTTY) {
      hideCursor();
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (key: string) => {
        if (key === 'q' || key === 'Q' || key === '\u0003') {
          cleanup();
        }
      });
    }
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Start loop
  draw();
  const interval = setInterval(draw, FPS_MS);
}

main();
