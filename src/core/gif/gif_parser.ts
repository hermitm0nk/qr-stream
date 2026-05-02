/**
 * Minimal GIF frame extractor for QR-over-GIF transfer system.
 *
 * Parses GIF87a/GIF89a format and extracts individual frame pixel data.
 * Handles the specific kind of GIFs we generate:
 *   - 2-colour palette (black & white)
 *   - Non-interlaced
 *   - Full-frame images (no partial deltas)
 *
 * Uses a hand-written LZW decoder for the GIF variant.
 *
 * @module
 */

// ─── LZW Decoder (GIF variant) ─────────────────────────────────────────────

/**
 * Decompress GIF LZW data.
 *
 * Reference: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
 * Implements the standard GIF LZW algorithm with variable-length codes.
 */
function lzwDecode(data: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let maxCode = (1 << codeSize) - 1;

  // Initialize dictionary with single-byte entries
  const table: number[][] = [];
  for (let i = 0; i < clearCode; i++) table.push([i]);
  table.push([]); // clearCode
  table.push([]); // eoiCode

  const output: number[] = [];

  // Bit reading state
  let buf = 0;
  let bits = 0;
  let pos = 0;

  function readCodeRaw(): number {
    while (bits < codeSize) {
      if (pos >= data.length) return eoiCode;
      buf |= data[pos]! << bits;
      pos++;
      bits += 8;
    }
    const val = buf & ((1 << codeSize) - 1);
    buf >>= codeSize;
    bits -= codeSize;
    return val;
  }

  let code = readCodeRaw();
  if (code === eoiCode) return new Uint8Array(output);
  if (code === clearCode) code = readCodeRaw();
  if (code === eoiCode) return new Uint8Array(output);

  // First code
  let entry = table[code];
  let prevEntry = entry;
  if (entry) output.push(...entry);

  let nextEntry = clearCode + 2;

  while (true) {
    code = readCodeRaw();
    if (code === eoiCode) break;

    if (code === clearCode) {
      // Reset
      table.length = clearCode + 2;
      for (let i = 0; i < clearCode; i++) table[i] = [i];
      table[clearCode] = [];
      table[clearCode + 1] = [];
      nextEntry = clearCode + 2;
      codeSize = minCodeSize + 1;
      maxCode = (1 << codeSize) - 1;
      buf = 0; bits = 0;

      code = readCodeRaw();
      if (code === eoiCode) break;
      entry = table[code]!;
      prevEntry = entry;
      output.push(...entry);
      continue;
    }

    if (code < table.length) {
      entry = table[code]!;
      output.push(...entry);
      // Add prevEntry + first byte of entry to dictionary
      const newEntry = [...prevEntry, entry[0]!];
      if (nextEntry <= 4095) {
        table.push(newEntry);
        nextEntry++;
      }
    } else if (code === table.length) {
      // Special case: code == next available entry
      const newEntry = [...prevEntry, prevEntry[0]!];
      output.push(...newEntry);
      if (nextEntry <= 4095) {
        table.push(newEntry);
        nextEntry++;
      }
      entry = newEntry;
    } else {
      break; // Invalid code
    }

    // Increase code size if needed
    if (nextEntry > maxCode && codeSize < 12) {
      codeSize++;
      maxCode = (1 << codeSize) - 1;
    }

    prevEntry = entry ?? prevEntry;
  }

  return new Uint8Array(output);
}

// ─── GIF Parser ─────────────────────────────────────────────────────────────

/** A single extracted frame from a GIF. */
export interface GifFrame {
  /** Indexed pixel data (palette indices) */
  data: Uint8Array;
  /** Frame width in pixels */
  width: number;
  /** Frame height in pixels */
  height: number;
  /** Frame delay in centiseconds (from Graphics Control Extension) */
  delay: number;
  /** Palette for this frame (local or global) */
  palette: number[][];
  /** X offset of this frame within the canvas */
  left: number;
  /** Y offset of this frame within the canvas */
  top: number;
  /** Disposal method: 0=unspecified, 1=keep, 2=restore bg, 3=restore prev */
  disposal: number;
  /** Whether this frame is interlaced */
  interlaced: boolean;
}

/** Parsed GIF metadata and frames. */
export interface GifData {
  width: number;
  height: number;
  frames: GifFrame[];
  globalPalette: number[][] | null;
}

/**
 * Parse a GIF file and extract all frames.
 *
 * @param buffer - Raw GIF file bytes
 * @returns Parsed GIF data with frames
 */
export function parseGif(buffer: Uint8Array): GifData {
  if (buffer.length < 6) throw new Error('Invalid GIF: too short');
  const header = new TextDecoder().decode(buffer.subarray(0, 6));
  if (header !== 'GIF87a' && header !== 'GIF89a') {
    throw new Error(`Invalid GIF header: ${header}`);
  }

  let offset = 6;

  // Logical Screen Descriptor
  if (offset + 7 > buffer.length) throw new Error('Invalid GIF: truncated LSD');
  const width = buffer[offset]! | (buffer[offset + 1]! << 8);
  const height = buffer[offset + 2]! | (buffer[offset + 3]! << 8);
  const packed = buffer[offset + 4]!;
  const bgColorIndex = buffer[offset + 5]!;
  const hasGlobalPalette = !!(packed & 0x80);
  const globalPaletteSize = hasGlobalPalette ? (3 * (1 << ((packed & 0x07) + 1))) : 0;
  offset += 7;

  // Global Color Table
  let globalPalette: number[][] | null = null;
  if (hasGlobalPalette) {
    if (offset + globalPaletteSize > buffer.length) throw new Error('Invalid GIF: truncated global palette');
    globalPalette = [];
    for (let i = 0; i < globalPaletteSize; i += 3) {
      globalPalette.push([buffer[offset + i]!, buffer[offset + i + 1]!, buffer[offset + i + 2]!]);
    }
    offset += globalPaletteSize;
  }

  const frames: GifFrame[] = [];
  let pendingDelay = 0;
  let pendingDisposal = 0;
  let transparentIndex = -1;

  // Block processing loop
  while (offset < buffer.length) {
    const blockType = buffer[offset]!;
    offset++;

    if (blockType === 0x3B) {
      // Trailer
      break;
    } else if (blockType === 0x21) {
      // Extension Introducer
      if (offset >= buffer.length) break;
      const label = buffer[offset]!;
      offset++;

      if (label === 0xF9) {
        // Graphics Control Extension
        if (offset + 1 >= buffer.length) break;
        const blockSize = buffer[offset]!;
        if (offset + 1 + blockSize > buffer.length) break;
        const gcePacked = buffer[offset + 1]!;
        pendingDisposal = (gcePacked >> 2) & 0x07;
        pendingDelay = buffer[offset + 2]! | (buffer[offset + 3]! << 8);
        if (gcePacked & 0x01) {
          transparentIndex = buffer[offset + 4]!;
        } else {
          transparentIndex = -1;
        }
        offset += 1 + blockSize;
        // Read block terminator
        if (offset < buffer.length && buffer[offset] === 0x00) offset++;
      } else {
        // Skip other extensions: read sub-blocks until 0x00
        while (offset < buffer.length) {
          const subSize = buffer[offset]!;
          offset++;
          if (subSize === 0) break;
          offset += subSize;
        }
      }
    } else if (blockType === 0x2C) {
      // Image Descriptor
      if (offset + 9 > buffer.length) throw new Error('Invalid GIF: truncated image descriptor');
      const imgLeft = buffer[offset]! | (buffer[offset + 1]! << 8);
      const imgTop = buffer[offset + 2]! | (buffer[offset + 3]! << 8);
      const imgWidth = buffer[offset + 4]! | (buffer[offset + 5]! << 8);
      const imgHeight = buffer[offset + 6]! | (buffer[offset + 7]! << 8);
      const imgPacked = buffer[offset + 8]!;
      const localPaletteFlag = !!(imgPacked & 0x80);
      const interlaced = !!(imgPacked & 0x40);
      const localPaletteSize = localPaletteFlag ? (3 * (1 << ((imgPacked & 0x07) + 1))) : 0;
      offset += 9;

      // Local Color Table
      let palette = globalPalette;
      if (localPaletteFlag) {
        if (offset + localPaletteSize > buffer.length) throw new Error('Invalid GIF: truncated local palette');
        const localPalette: number[][] = [];
        for (let i = 0; i < localPaletteSize; i += 3) {
          localPalette.push([buffer[offset + i]!, buffer[offset + i + 1]!, buffer[offset + i + 2]!]);
        }
        palette = localPalette;
        offset += localPaletteSize;
      }

      // LZW Minimum Code Size
      if (offset >= buffer.length) break;
      const minCodeSize = buffer[offset]!;
      offset++;

      // Read sub-blocks of image data
      const subBlockData: number[] = [];
      while (offset < buffer.length) {
        const subSize = buffer[offset]!;
        offset++;
        if (subSize === 0) break;
        for (let i = 0; i < subSize && offset < buffer.length; i++) {
          subBlockData.push(buffer[offset]!);
          offset++;
        }
      }

      // Decompress LZW data
      const indexedData = lzwDecode(new Uint8Array(subBlockData), minCodeSize);

      // De-interlace if needed
      let finalData: Uint8Array;
      if (interlaced && imgHeight > 0) {
        const deinterlaced = new Uint8Array(imgWidth * imgHeight);
        const rowStride = imgWidth;
        let srcPos = 0;
        // Pass 1: rows 0, 8, 16, ...
        for (let r = 0; r < imgHeight; r += 8) {
          if (srcPos >= indexedData.length) break;
          deinterlaced.set(indexedData.subarray(srcPos, srcPos + rowStride), r * rowStride);
          srcPos += rowStride;
        }
        // Pass 2: rows 4, 12, 20, ...
        for (let r = 4; r < imgHeight; r += 8) {
          if (srcPos >= indexedData.length) break;
          deinterlaced.set(indexedData.subarray(srcPos, srcPos + rowStride), r * rowStride);
          srcPos += rowStride;
        }
        // Pass 3: rows 2, 6, 10, ...
        for (let r = 2; r < imgHeight; r += 4) {
          if (srcPos >= indexedData.length) break;
          deinterlaced.set(indexedData.subarray(srcPos, srcPos + rowStride), r * rowStride);
          srcPos += rowStride;
        }
        // Pass 4: rows 1, 3, 5, ...
        for (let r = 1; r < imgHeight; r += 2) {
          if (srcPos >= indexedData.length) break;
          deinterlaced.set(indexedData.subarray(srcPos, srcPos + rowStride), r * rowStride);
          srcPos += rowStride;
        }
        finalData = deinterlaced;
      } else {
        finalData = indexedData;
      }

      frames.push({
        data: finalData,
        width: imgWidth,
        height: imgHeight,
        delay: pendingDelay,
        palette: palette ?? [],
        left: imgLeft,
        top: imgTop,
        disposal: pendingDisposal,
        interlaced,
      });

      // Reset pending values
      pendingDelay = 0;
      pendingDisposal = 0;
    } else {
      // Unknown block — skip sub-blocks
      while (offset < buffer.length) {
        const subSize = buffer[offset]!;
        offset++;
        if (subSize === 0) break;
        offset += subSize;
      }
    }
  }

  return { width, height, frames, globalPalette };
}

/**
 * Convert a GIF frame's indexed pixel data to RGBA Uint8ClampedArray.
 * Uses the frame's palette (or fallback to black/white).
 *
 * @param frame - The GIF frame
 * @returns RGBA pixel data suitable for QR decoding
 */
export function gifFrameToRgba(frame: GifFrame): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(frame.width * frame.height * 4);
  const pal = frame.palette;

  for (let i = 0; i < frame.data.length; i++) {
    const idx = frame.data[i]!;
    const off = i * 4;
    if (idx < pal.length) {
      rgba[off] = pal[idx]![0]!;
      rgba[off + 1] = pal[idx]![1]!;
      rgba[off + 2] = pal[idx]![2]!;
    } else {
      rgba[off] = 255;
      rgba[off + 1] = 255;
      rgba[off + 2] = 255;
    }
    rgba[off + 3] = 255;
  }

  return rgba;
}

/**
 * Composite all GIF frames into a single RGBA canvas (handles disposal).
 *
 * For QR-over-GIF, each frame is a full image so compositing is simple:
 * each frame replaces the entire canvas.
 *
 * @param gif - Parsed GIF data
 * @param frameIndex - Which frame to render (0-based)
 * @returns RGBA pixel data for the composite frame
 */
export function renderGifFrame(gif: GifData, frameIndex: number): Uint8ClampedArray {
  if (frameIndex >= gif.frames.length) {
    throw new Error(`Frame ${frameIndex} out of range (${gif.frames.length} frames)`);
  }

  const frame = gif.frames[frameIndex]!;
  const canvas = new Uint8ClampedArray(gif.width * gif.height * 4);

  // Fill with background (white for our QR GIFs)
  for (let i = 0; i < gif.width * gif.height; i++) {
    const off = i * 4;
    canvas[off] = 255;
    canvas[off + 1] = 255;
    canvas[off + 2] = 255;
    canvas[off + 3] = 255;
  }

  // Apply this frame's pixels at its offset
  const rgba = gifFrameToRgba(frame);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const srcIdx = (y * frame.width + x) * 4;
      const dstX = frame.left + x;
      const dstY = frame.top + y;
      if (dstX >= gif.width || dstY >= gif.height) continue;
      const dstIdx = (dstY * gif.width + dstX) * 4;
      canvas[dstIdx] = rgba[srcIdx]!;
      canvas[dstIdx + 1] = rgba[srcIdx + 1]!;
      canvas[dstIdx + 2] = rgba[srcIdx + 2]!;
      canvas[dstIdx + 3] = rgba[srcIdx + 3]!;
    }
  }

  return canvas;
}
