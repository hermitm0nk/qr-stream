# QR Stream

Transfer files and text between devices by displaying an animated sequence of QR codes and reading it with a camera. No network, no Bluetooth, no cables — just light.

**Live demo:** [https://230590.xyz/hermes-web-demos/qr-transfer/](https://230590.xyz/hermes-web-demos/qr-transfer/)

---

## Installation

### npm

```bash
npm install -g qr-stream
```

### Bun

```bash
bun install -g qr-stream
```

You can also run it directly without installing:

```bash
npx qr-stream [file]
bunx qr-stream [file]
```

---

## CLI Usage

### Encode text or a file into a looping QR sequence

```bash
# Read from file
qr-stream document.pdf

# Read from stdin
echo "Hello, world!" | qr-stream

# Pipe file contents
base64 image.png | qr-stream
```

The terminal clears, enters an alternate screen buffer, and displays the QR frames in a loop at 10 FPS. Press **q** or **Ctrl-C** to quit.

### Start the web app preview server

```bash
qr-stream --serve
```

Serves the built web UI on `http://localhost:3000` (default). Change the port with the `PORT` environment variable:

```bash
PORT=8080 qr-stream --serve
```

The server resolves the `dist/` directory automatically, so it works from both the bundled CLI and a local checkout.

### CLI flags

| Flag | Description |
|------|-------------|
| `-h`, `--help` | Show usage information |
| `-s`, `--serve` | Start the web preview server |

---

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) (optional, for faster installs)

### Install dependencies

```bash
npm install
```

### Start the dev server

```bash
npm run dev
```

Starts Vite with hot reload on `http://localhost:5173`.

### Build

```bash
npm run build
```

Produces:
- `dist/index.html` and `dist/assets/*` — the web app
- `dist/qr-stream.js` — the self-contained CLI bundle

### Preview the production build

```bash
npm run preview
```

Serves the contents of `dist/` locally exactly as it will run in production.

### Run tests

```bash
npm test
```

Runs the full test suite (57 tests) via Vitest.

### Run the CLI from source

```bash
bun run src/cli/qr-stream.ts
# or
npm run cli
```

### Build the CLI only

```bash
npm run build:cli
```

---

## How It Works

1. **Sender** compresses your data, splits it into chunks, and wraps each chunk in a QR code.
2. The QR codes are shown as an animated sequence (in the terminal or as a GIF in the browser).
3. **Receiver** scans the sequence with a camera or uploads a GIF, decodes the frames, and reassembles the original file or text.

The protocol uses fountain coding (RLNC over GF(256)) so the transfer survives frame loss, glare, and partial obstructions without needing every single frame.

For a deep dive into the packet format, algorithms, and design decisions, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## License

MIT — built for fun and utility.
