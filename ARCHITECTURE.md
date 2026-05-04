# QR Stream - Architecture

This document describes the internal design, wire format, and algorithms used by QR Stream. For user-facing installation and usage instructions, see [README.md](README.md).

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Project Structure](#project-structure)
3. [Dependencies](#dependencies)
4. [The Protocol](#the-protocol)
5. [Algorithms](#algorithms)
6. [Data Flow](#data-flow)
7. [Design Decisions](#design-decisions)
8. [Common Pitfalls](#common-pitfalls)

---

## High-Level Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Sender UI     │──────▶│  Encode Worker  │──────▶│   GIF Worker     │
│  (Preact hooks) │     │  (Web Worker)   │     │  (Web Worker)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                     │
                                                     ▼
                                              ┌────────────┐
                                              │  .gif file   │
                                              │  (animated)  │
                                              └────────────┘
                                                     │
┌─────────────────┐     ┌─────────────────┐            │
│   Receiver UI   │◀──────│  Decode Worker  │◀──────├──────── camera / file
│  (Preact hooks) │     │  (Web Worker)   │            │
└─────────────────┘     └─────────────────┘            └──────────────────────────┘
```

Everything heavy (compression, RLNC encoding, GIF encoding, QR decoding) runs in dedicated Web Workers so the UI stays responsive.

---

## Project Structure

```
src/
├── app/
│   ├── app.tsx              # App shell with hash-based tab routing
│   └── routes/
│       ├── sender.tsx       # Text/file input, GIF preview, download
│       └── receiver.tsx     # Camera scanner, GIF upload, results
├── core/
│   ├── fec/                 # Forward Error Correction (RLNC)
│   │   ├── gf256.ts         # GF(256) arithmetic (log/antilog tables)
│   │   ├── rlnc_encoder.ts  # Systematic RLNC encoder
│   │   ├── rlnc_decoder.ts  # Incremental Gaussian-elimination decoder
│   │   └── xoshiro.ts       # xoshiro128** PRNG for deterministic coeffs
│   ├── gif/
│   │   ├── gif_parser.ts    # GIF decoding (LZW, frame extraction)
│   │   └── gif_render.ts    # GIF encoding (2-colour palette, gifenc)
│   ├── preprocess/
│   │   └── compress.ts      # (legacy) deflate helpers
│   ├── protocol/
│   │   ├── constants.ts     # Protocol constants: K/R, sizes, flags
│   │   ├── crc32c.ts        # CRC32-C (Castagnoli) with lookup table
│   │   └── packet.ts        # 8-byte fixed header + payload + CRC
│   ├── qr/
│   │   ├── qr_encode.ts     # QR matrix generation (qrcode-generator)
│   │   ├── qr_decode.ts     # QR decoding wrapper (jsQR)
│   │   └── frame_raster.ts  # Matrix → RGBA raster (scale, quiet zone)
│   ├── reconstruct/
│   │   └── assemble.ts      # Concatenate generations, trim padding
│   └── sender/
│       ├── packetizer.ts    # Data → packets: compress, split, wrap metadata
│       └── scheduler.ts     # Interleave systematic/coded symbols into frames
├── workers/
│   ├── encode.worker.ts     # Orchestrates packetizer + scheduler
│   ├── decode.worker.ts     # Feeds frames to RLNC decoder, reassembles
│   └── gif.worker.ts        # Rasters packets → RGBA → GIF via gifenc
├── tests/
│   ├── complete.test.ts     # Unit tests for all core modules
│   ├── frame_decode.test.ts # QR encode→decode roundtrip per frame
│   ├── gif_roundtrip.test.ts# Full GIF encode→parse→decode roundtrip
│   ├── prod_roundtrip.test.ts# Deterministic frame-loss recovery test
│   ├── test_qr_modules.test.ts# QR capacity, raster, GIF render tests
│   └── setup.ts             # happy-dom test environment setup
├── types/
│   └── gifenc.d.ts          # Type declarations for gifenc
├── cli/
│   ├── qr-stream.ts         # CLI entry point (terminal QR display)
│   │                           # stdin  → isText=true (text mode)
│   │                           # <file> → isText=false, embeds filename+MIME
│   ├── terminal_raster.ts   # Half-block Unicode renderer
│   └── static_server.ts     # Built-in preview server (--serve)
├── index.html               # Single-page app entry
└── main.tsx                 # Renders <App/> into #root
```

---

## Dependencies

### Runtime

- **preact** - UI framework (React-compatible, ~10 KB)
- **qrcode-generator** - QR matrix generation (versions 1–40, all ECC levels)
- **jsqr** - QR decoding from `ImageData` (grayscale + adaptive thresholding internally)
- **gifenc** - Animated GIF encoder (2-colour palette, LZW compression)
- **fflate** - Fast deflate/inflate (compression for large payloads)

### Dev / Build

- **vite** - Build tool, dev server, worker bundling
- **@preact/preset-vite** - Preact JSX transform for Vite
- **vitest** - Test runner
- **happy-dom** - DOM environment for headless tests
- **typescript** - Type checking
- **esbuild** - CLI bundle (via `build:cli` script)

---

## The Protocol

There is **one hardcoded profile** - no negotiation, no manifest, no session IDs.

### Profile Constants

- **QR Version:** V10 (57×57 modules)
- **ECC Level:** M (~15% correction)
- **Source symbols per generation (K):** 16
- **Repair symbols per generation (R):** 8
- **Symbol payload:** 201 bytes
- **Max packet size:** 213 bytes (fits exactly in V10-M)
- **Frame delay:** 200 ms (5 fps)
- **Max file size:** ~8 MB

### Packet Format (fixed 8-byte header)

All multi-byte fields are **little-endian**.

```
Offset  Size  Field
─────────────────────────────────────────────────────────────────────────────────
 0      1     Magic: 0x51 ('Q')
 1      4     Packed word (32 bits):
              ├─ bits 0–11   : generation index (0–4095)
              ├─ bits 12–23  : total generations (0–4095)
              ├─ bits 24–28  : symbol index (0–31)
              ├─ bit 29      : isText flag (1 = text, 0 = file)
              ├─ bit 30      : isLastGeneration flag
              └─ bit 31      : compressed flag
 5      3     Data length (preprocessed size, 24-bit, 0–16,777,215)
 8      201   Payload (zero-padded to 201 B)
209     4     CRC32-C over bytes 0–208
```

Total: **213 bytes** → fits in a V10-M QR code.

**Symbol index convention:**
- `0–15` = systematic symbol (`sourceIndex = symbolIndex`)
- `16–23` = coded repair symbol (`codedSymbolIndex = symbolIndex − 16`)
- `24–31` = reserved

### File Metadata Wrapping

For file transfers (not text), the raw file bytes are prefixed with a tiny metadata envelope before compression:

```
[1 byte: filename length (0–255)]
[N bytes: filename UTF-8]
[1 byte: MIME type length (0–255)]
[M bytes: MIME type UTF-8]
[rest: actual file data]
```

This lets the receiver restore the original filename and MIME type on download.

---

## Algorithms

### 1. RLNC over GF(256)

We use **Random Linear Network Coding** with a systematic encoding.

**Encoder (`rlnc_encoder.ts`):**
- Given `K` source symbols, output `K` systematic + `R` coded symbols.
- Systematic symbols are the original data (identity coefficient vector).
- Each coded symbol is a random linear combination: `C_j = Σ coeff[i] · S_i` (multiplication and addition in GF(256)).
- Coefficients are deterministically derived from `(generationIndex, codedSymbolIndex)` via a xoshiro128** PRNG.

**Decoder (`rlnc_decoder.ts`):**
- Maintains an augmented coefficient matrix in **reduced row-echelon form (RREF)**.
- Each incoming symbol is forward-eliminated against existing pivots, then if it has a new pivot:
  1. Scale the row so pivot = 1
  2. Eliminate the new pivot from all existing rows
  3. Insert maintaining pivot-column order
- When `rank == K`, the matrix is identity and the RHS data is the reconstructed source symbols.

### 2. GF(256) Arithmetic (`gf256.ts`)

- Irreducible polynomial: `x^8 + x^4 + x^3 + x^2 + 1` (0x11d, same as AES).
- Pre-computed **log/antilog tables** at module load time for O(1) multiply/divide/inverse.
- Addition/subtraction = XOR (same operation in characteristic-2 fields).

### 3. QR Code Generation (`qr_encode.ts`, `frame_raster.ts`)

- Uses `qrcode-generator` library to produce boolean module matrices.
- Capacity is computed from an embedded RS block table (versions 1–40, all ECC levels).
- `rasterizeQR()` scales each module to `scale × scale` pixels and adds a 4-module white quiet zone.
- Output is pure black/white RGBA `ImageData`.

### 4. QR Decoding (`qr_decode.ts`)

- Thin wrapper around `jsQR`.
- `jsQR` internally converts RGBA → grayscale and applies adaptive thresholding (8×8 regions with 5×5 averaging). No external preprocessing is needed.
- For camera scanning we pass `inversionAttempts: 'attemptBoth'` (handles glare/reflections). For GIF file mode we use `'dontInvert'` (our QRs are black-on-white, giving ~50% speedup).

### 5. GIF Encoding (`gif_render.ts`)

- Uses `gifenc` with a **2-colour global palette** (white, black).
- Each frame is converted from RGBA to indexed (threshold at 50% brightness).
- The NETSCAPE 2.0 extension sets loop count to infinity.
- Default delay: 200 ms per frame (5 fps).

### 6. Frame Scheduling (`scheduler.ts`)

- Systematic symbols are interleaved across generations first, then coded symbols.
- Generation order is deterministically shuffled using `totalGenerations` as a seed.
- This spreads redundancy evenly: if you watch any prefix of the GIF, you see some symbols from every generation.

---

## Data Flow

### Sender

```
Text or File
    │
    ▼
[Wrap metadata if file]
    │
    ▼
[Optional deflate compression (fflate)]
    │
    ▼
Split into 201-byte symbols
    │
    ▼
Group into generations of K=16
    │
    ▼
RLNC encode each generation → 16 systematic + 8 coded symbols
    │
    ▼
Build packets (8-byte header + payload + CRC32C)
    │
    ▼
Schedule frames (interleave systematic, then coded, shuffle generations)
    │
    ▼
Rasterize each packet to QR code (V10-M, scale=3, 4-module quiet zone)
    │
    ▼
Encode frames into animated GIF (2-colour palette, 200 ms delay)
    │
    ▼
Blob URL → <img> preview + download
```

### Receiver

```
Camera frames or GIF file
    │
    ▼
[If camera: software crop center 50% (2× zoom), optional camera zoom API]
    │
    ▼
Decode QR with jsQR → raw bytes
    │
    ▼
Parse packet (verify magic, verify CRC32C)
    │
    ▼
Deduplicate by (generationIndex, symbolIndex)
    │
    ▼
Feed to RLNC decoder (systematic or coded based on symbolIndex)
    │
    ▼
When rank == K for a generation → mark solved
    │
    ▼
When all generations solved:
    │
    ├── Text mode → decompress → TextDecoder → show in <textarea>
    │
    └── File mode → decompress → strip metadata → Blob + download link
```

---

## Design Decisions

### Why a single hardcoded profile?

Sender and receiver are the same codebase. There is no need for profile negotiation, manifest parsing, or version selection. Removing the manifest and session ID simplified the packet format to a compact 8-byte header.

### Why RLNC instead of simple repetition?

Simple repetition (send every packet N times) is easy but wasteful. RLNC means **any K linearly independent symbols** decode a generation - you don't need specific ones. This maximizes the information content of every received frame.

### Why V10 instead of larger versions?

Larger QR codes (V31, V40) hold more data but require higher camera resolution and sharper focus. V10 is small enough to be readable by average phone cameras at screen distance while still carrying 213 bytes per frame.

### Why GIF instead of MP4/WebM?

GIF is universally supported, requires no codecs, and every frame is a full still image (no inter-frame compression artifacts). The 2-colour palette gives excellent LZW compression (~10:1 vs raw RGBA).

### Why Web Workers?

- **Encode worker:** packetization + scheduling is CPU-bound and blocks the main thread for large files.
- **GIF worker:** GIF encoding (LZW) is CPU-bound.
- **Decode worker:** RLNC Gaussian elimination and QR decoding run at 5 fps and must not freeze the UI.

### Why floor(3%) for outer RS instead of always having parity?

Outer RS overhead is `Math.floor(sourceGenerations × 0.03)`:
- **G ≤ 33:** 0 parity generations - small files recover fast (no wasted round-robin slots).
- **G ≥ 34:** 1+ parity generations - protects against whole-generation loss (e.g. a camera burst-drop at the wrong moment).

Using `Math.floor` (not `Math.ceil`) ensures small files genuinely get zero parity. At G=34 the overhead is ~3% as intended.

### Why neededPackets = K × totalGenerations instead of K × sourceGenerations?

The frame scheduler interleaves symbols round-robin across **all** generations (source + parity). You can't receive packets selectively - every cycle of the GIF gives one symbol to each generation. So the practical minimum to decode is `K × totalGenerations`, which accounts for the interleaving overhead. This makes the progress indicator match reality (e.g. 2 source + 1 parity = 48 needed, not 32).

---

## Common Pitfalls

### Swapped arguments to `generateCoefficients`

```ts
// WRONG - causes massive array allocation and browser hang
generateCoefficients(seed, 16)

// CORRECT
generateCoefficients(16, seed)
```

### Stale blob URLs in the sender

If `gifUrl` (a `blob:` URL) is not revoked with `URL.revokeObjectURL()` before generating a new GIF, the browser throws an "object error" when the old `<img>` tries to re-render with a revoked URL. Always call `revokeObjectURL()` in a reset helper.

### Wrong dimensions passed to `createQRGif()`

`createQRGif()` expects the actual image width/height in pixels, **not** the raw buffer byte length. A common bug is passing `rgba.length` (which is `width × height × 4`) as the width parameter.

### Deterministic vs random frame loss in tests

Never use `Math.random()` for frame-loss simulation in tests - it causes flaky failures due to shared RNG state across test files. Use a deterministic pattern like `(i + 1) % 5 !== 0`.

### `transfer` list type mismatch

When passing `ArrayBuffer` via `postMessage` with a transfer list, TypeScript may complain about `ArrayBufferLike` vs `ArrayBuffer`. Cast explicitly: `finalData.buffer as ArrayBuffer`.
