# QR-over-GIF Transfer

Transfer files and text between devices by displaying an animated GIF of QR codes and reading it with a camera. No network, no Bluetooth, no cables — just light.

Live demo: `https://230590.xyz/hermes-web-demos/qr-transfer/`

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [High-Level Architecture](#high-level-architecture)
3. [Project Structure](#project-structure)
4. [Dependencies](#dependencies)
5. [The Protocol](#the-protocol)
6. [Algorithms](#algorithms)
7. [Data Flow](#data-flow)
8. [Development](#development)
9. [Design Decisions](#design-decisions)
10. [Common Pitfalls](#common-pitfalls)

---

## What It Does

- **Sender**: You paste text or pick a file. The app compresses the data, splits it into chunks, encodes each chunk as a QR code, and renders an animated GIF that flips through the codes.
- **Receiver**: You point your camera at the GIF (or upload the GIF file). The app decodes each frame, reassembles the original data, and offers it for download or shows it as text.

The transfer survives frame loss, glare, reflections, and partial obstructions thanks to fountain coding (RLNC over GF(256)).

---

## High-Level Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Sender UI     │────▶│  Encode Worker  │────▶│   GIF Worker    │
│  (Preact hooks) │     │  (Web Worker)   │     │  (Web Worker)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                 ┌──────────────┐
                                                 │  .gif file   │
                                                 │  (animated)  │
                                                 └──────────────┘
                                                        │
┌─────────────────┐     ┌─────────────────┐            │
│   Receiver UI   │◀────│  Decode Worker  │◀───────────┘
│  (Preact hooks) │     │  (Web Worker)   │    camera / file
└─────────────────┘     └─────────────────┘
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
│   │   ├── compress.ts      # (legacy) deflate helpers
│   │   └── hash.ts          # (legacy) hash helpers
│   ├── protocol/
│   │   ├── constants.ts     # Protocol version, K/R, sizes, flags
│   │   ├── crc32c.ts        # CRC32-C (Castagnoli) with lookup table
│   │   └── packet.ts        # 18-byte fixed header + payload + CRC
│   ├── qr/
│   │   ├── qr_encode.ts     # QR matrix generation (qrcode-generator)
│   │   ├── qr_decode.ts     # QR decoding wrapper (jsQR)
│   │   └── frame_raster.ts  # Matrix → RGBA raster (scale, quiet zone)
│   ├── reconstruct/
│   │   ├── assemble.ts      # Concatenate generations, trim padding
│   │   └── verify.ts        # (legacy) verification helpers
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
├── index.html               # Single-page app entry
└── main.tsx                 # Renders <App/> into #root
```

---

## Dependencies

### Runtime

| Library | Purpose |
|---------|---------|
| **preact** | UI framework (React-compatible, 10 KB) |
| **qrcode-generator** | QR matrix generation (versions 1–40, all ECC levels) |
| **jsqr** | QR decoding from `ImageData` (grayscale + adaptive thresholding internally) |
| **gifenc** | Animated GIF encoder (2-colour palette, LZW compression) |
| **fflate** | Fast deflate/inflate (compression for large payloads) |
| **cbor-x** | *(unused in current protocol; legacy dependency)* |

### Dev / Build

| Tool | Purpose |
|------|---------|
| **vite** | Build tool, dev server, worker bundling |
| **@preact/preset-vite** | Preact JSX transform for Vite |
| **vitest** | Test runner |
| **happy-dom** | DOM environment for headless tests |
| **typescript** | Type checking |

---

## The Protocol

There is **one hardcoded profile** — no negotiation, no manifest.

### Profile Constants

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| QR Version | **V10** | 57×57 modules; good balance of density and readability |
| ECC Level | **M** (~15% correction) | Survives minor blur/glare |
| Source symbols per generation (`K`) | **16** | Decoding latency vs. generation count tradeoff |
| Repair symbols per generation (`R`) | **8** | 50% overhead; handles ~33% frame loss |
| Symbol payload | **191 bytes** | V10-M capacity (213 B) minus 18 B header minus 4 B CRC |
| Max packet size | **213 bytes** | Fits exactly in V10-M byte mode |
| Frame delay | **150 ms** | ~6.7 fps; readable by most cameras |
| Protocol version | **2** | Current revision |

### Packet Format (fixed 18-byte header)

All multi-byte fields are **little-endian**.

```
Offset  Size  Field
─────────────────────────────────────────────────────
 0      2     Magic: 'QG' (0x51, 0x47)
 2      1     Protocol version (2)
 3      1     Flags: IS_TEXT(1), COMPRESSED(2), LAST_GENERATION(4)
 4      4     Session ID (random 32-bit)
 8      2     Generation index (0-based)
10      2     Total generations
12      1     Symbol index
13      1     Packet type: 0=SYSTEMATIC, 1=CODED
14      4     Data length (preprocessed size, before padding)
18      191   Payload (zero-padded to 191 B)
209     4     CRC32-C over bytes 0–208
```

Total: **213 bytes** → fits in a V10-M QR code.

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

**Encoder (`rlnc_encoder.ts`)**:
- Given `K` source symbols, output `K` systematic + `R` coded symbols.
- Systematic symbols are the original data (identity coefficient vector).
- Each coded symbol is a random linear combination:  
  `C_j = Σ coeff[i] · S_i`  (multiplication and addition in GF(256)).
- Coefficients are deterministically derived from `(sessionId, generationIndex, codingSeed)` via a xoshiro128** PRNG.

**Decoder (`rlnc_decoder.ts`)**:
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
- Default delay: 150 ms per frame.

### 6. Frame Scheduling (`scheduler.ts`)

- Systematic symbols are interleaved across generations first, then coded symbols.
- Generation order is deterministically shuffled using the session ID as a seed.
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
Split into 191-byte symbols
    │
    ▼
Group into generations of K=16
    │
    ▼
RLNC encode each generation → 16 systematic + 8 coded symbols
    │
    ▼
Build packets (18-byte header + payload + CRC32C)
    │
    ▼
Schedule frames (interleave systematic, then coded, shuffle generations)
    │
    ▼
Rasterize each packet to QR code (V10-M, scale=3, 4-module quiet zone)
    │
    ▼
Encode frames into animated GIF (2-colour palette, 150 ms delay)
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
Deduplicate by (generation, type, symbolIndex)
    │
    ▼
Feed to RLNC decoder
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

## Development

```bash
# Install dependencies
npm install

# Dev server (Vite, Preact, hot reload)
npm run dev

# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Production build (outputs to dist/)
npm run build

# Preview production build locally
npm run preview
```

### Deploying

The project is built as a static SPA and served via nginx:

```bash
npm run build
cp -r dist/* /var/www/html/hermes-web-demos/qr-transfer/
```

Clean old hashed assets after copying:

```bash
cd /var/www/html/hermes-web-demos/qr-transfer
for f in assets/*; do
  if ! grep -q "$(basename $f)" index.html; then
    rm "$f"
  fi
done
```

---

## Design Decisions

### Why a single hardcoded profile?

Sender and receiver are the same codebase. There is no need for profile negotiation, manifest parsing, or version selection. Removing the manifest simplified the packet format from variable-length CBOR to a fixed 18-byte header.

### Why RLNC instead of simple repetition?

Simple repetition (send every packet N times) is easy but wasteful. RLNC means **any K linearly independent symbols** decode a generation — you don't need specific ones. This maximizes the information content of every received frame.

### Why V10 instead of larger versions?

Larger QR codes (V31, V40) hold more data but require higher camera resolution and sharper focus. V10 is small enough to be readable by average phone cameras at screen distance while still carrying 213 bytes per frame.

### Why GIF instead of MP4/WebM?

GIF is universally supported, requires no codecs, and every frame is a full still image (no inter-frame compression artifacts). The 2-colour palette gives excellent LZW compression (~10:1 vs raw RGBA).

### Why Web Workers?

- **Encode worker**: packetization + scheduling is CPU-bound and blocks the main thread for large files.
- **GIF worker**: GIF encoding (LZW) is CPU-bound.
- **Decode worker**: RLNC Gaussian elimination and QR decoding run at 6–7 fps and must not freeze the UI.

---

## Common Pitfalls

### Swapped arguments to `generateCoefficients`

```ts
// WRONG — causes massive array allocation and browser hang
generateCoefficients(seed, 16)

// CORRECT
generateCoefficients(16, seed)
```

### Stale blob URLs in the sender

If `gifUrl` (a `blob:` URL) is not revoked with `URL.revokeObjectURL()` before generating a new GIF, the browser throws an "object error" when the old `<img>` tries to re-render with a revoked URL. Always call `revokeObjectURL()` in a reset helper.

### Wrong dimensions passed to `createQRGif()`

`createQRGif()` expects the actual image width/height in pixels, **not** the raw buffer byte length. A common bug is passing `rgba.length` (which is `width × height × 4`) as the width parameter.

### Deterministic vs random frame loss in tests

Never use `Math.random()` for frame-loss simulation in tests — it causes flaky failures due to shared RNG state across test files. Use a deterministic pattern like `(i + 1) % 5 !== 0`.

### `transfer` list type mismatch

When passing `ArrayBuffer` via `postMessage` with a transfer list, TypeScript may complain about `ArrayBufferLike` vs `ArrayBuffer`. Cast explicitly: `finalData.buffer as ArrayBuffer`.

---

## License

MIT — built for fun and utility.
