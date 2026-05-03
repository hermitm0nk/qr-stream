/**
 * Sender page — text/file input, GIF generation preview.
 */
import { useState, useCallback, useRef } from 'preact/hooks';

// ─── Types ───────────────────────────────────────────────────────────────────

type InputMode = 'text' | 'file';

interface GifResult {
  gifData: ArrayBuffer;
  width: number;
  height: number;
  frameCount: number;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

type CSSProps = Record<string, string | number>;

const S = {
  section: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  } as CSSProps,
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#8b949e',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  row: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  btn: {
    background: '#238636',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 24px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProps,
  btnSecondary: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 6,
    padding: '10px 24px',
    fontSize: 15,
    cursor: 'pointer',
  } as CSSProps,
  textarea: {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: '#0d1117',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    fontFamily: 'monospace',
    resize: 'vertical' as const,
    minHeight: 120,
  },
  preview: {
    background: '#000',
    borderRadius: 8,
    imageRendering: 'pixelated' as const,
    maxWidth: '100%',
    display: 'block',
    margin: '12px 0',
  } as CSSProps,
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    fontSize: 13,
  } as CSSProps,
  infoLabel: { color: '#8b949e' },
  infoValue: { color: '#f0f6fc', fontFamily: 'monospace' },
  warn: {
    background: '#3d2600',
    border: '1px solid #bb8009',
    borderRadius: 6,
    padding: '10px 14px',
    color: '#d29922',
    fontSize: 13,
    marginTop: 8,
  },
  toggleGroup: {
    display: 'flex',
    gap: 4,
    background: '#0d1117',
    borderRadius: 6,
    padding: 2,
  } as CSSProps,
  toggleBtn: (active: boolean): CSSProps => ({
    padding: '6px 14px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    background: active ? '#1f2937' : 'transparent',
    color: active ? '#f0f6fc' : '#8b949e',
    transition: 'all 0.15s',
  }),
  spinner: {
    width: 20,
    height: 20,
    border: '2px solid #30363d',
    borderTopColor: '#58a6ff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    display: 'inline-block',
    verticalAlign: 'middle',
    marginRight: 8,
  } as CSSProps,
};

// ─── Component ───────────────────────────────────────────────────────────────────

export function SenderPage() {
  const [mode, setMode] = useState<InputMode>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [gifResult, setGifResult] = useState<GifResult | null>(null);
  const [stats, setStats] = useState<{ originalSize: number; preprocessedSize: number; frameCount: number; totalGenerations: number } | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const gifUrlRef = useRef<string | null>(null);

  /** Wipe all output state and revoke any existing blob URL. */
  const resetOutput = useCallback(() => {
    setGifResult(null);
    setStats(null);
    setError('');
    setStatus('');
    if (gifUrlRef.current) {
      URL.revokeObjectURL(gifUrlRef.current);
      gifUrlRef.current = null;
    }
    setGifUrl(null);
  }, []);

  const handleModeChange = useCallback((newMode: InputMode) => {
    setMode(newMode);
    resetOutput();
  }, [resetOutput]);

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    if (gifUrlRef.current || gifResult || stats) {
      resetOutput();
    }
  }, [resetOutput, gifResult, stats]);

  const handleFile = useCallback((e: Event) => {
    const input = e.target as HTMLInputElement;
    const newFile = input.files?.[0] ?? null;
    setFile(newFile);
    resetOutput();
  }, [resetOutput]);

  const handleGenerate = useCallback(async () => {
    resetOutput();

    let data: ArrayBuffer;
    let isText: boolean;

    if (mode === 'text') {
      const trimmed = text.trim();
      if (!trimmed) { setError('Please enter some text.'); return; }
      data = new TextEncoder().encode(trimmed).buffer;
      isText = true;
    } else {
      if (!file) { setError('Please select a file.'); return; }
      if (file.size > 8 * 1024 * 1024) { setError('File too large. Maximum size is 8 MB.'); return; }
      data = await file.arrayBuffer();
      isText = false;
    }

    const compress = data.byteLength > 64;

    setBusy(true);
    setStatus('Encoding data…');

    try {
      // ── Step 1: Encode worker ─────────────────────────────────────
      const encodeWorker = new Worker(
        new URL('@/workers/encode.worker.ts', import.meta.url),
        { type: 'module' },
      );

      const encoded = await new Promise<{
        packets: Uint8Array[];
        totalGenerations: number;
        stats: { originalSize: number; preprocessedSize: number; frameCount: number };
      }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Encode worker timed out')), 120_000);
        encodeWorker.onmessage = (e: MessageEvent) => {
          clearTimeout(timeout);
          if (e.data.type === 'encoded') {
            resolve(e.data);
          } else if (e.data.type === 'error') {
            reject(new Error(e.data.message));
          }
        };
        encodeWorker.onerror = (err) => { clearTimeout(timeout); reject(err); };
        encodeWorker.postMessage(
          {
            type: 'encode',
            data,
            isText,
            compress,
            filename: mode === 'file' ? file?.name : undefined,
            mimeType: mode === 'file' ? file?.type : undefined,
          },
          [data],
        );
      });
      encodeWorker.terminate();

      setStats({
        originalSize: encoded.stats.originalSize,
        preprocessedSize: encoded.stats.preprocessedSize,
        frameCount: encoded.stats.frameCount,
        totalGenerations: encoded.totalGenerations,
      });
      setStatus(`Generating GIF (${encoded.stats.frameCount} frames)…`);

      // ── Step 2: GIF worker ─────────────────────────────────────────
      const gifWorker = new Worker(
        new URL('@/workers/gif.worker.ts', import.meta.url),
        { type: 'module' },
      );

      const gif = await new Promise<GifResult>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('GIF worker timed out')), 120_000);
        gifWorker.onmessage = (e: MessageEvent) => {
          clearTimeout(timeout);
          if (e.data.type === 'gifReady') {
            resolve({
              gifData: e.data.gifData,
              width: e.data.width,
              height: e.data.height,
              frameCount: e.data.frameCount,
            });
          } else if (e.data.type === 'error') {
            reject(new Error(e.data.message));
          }
        };
        gifWorker.onerror = (err) => { clearTimeout(timeout); reject(err); };
        const transfer: ArrayBufferLike[] = [];
        const transferPackets = encoded.packets.map((p) => {
          if (p.buffer.byteLength <= 1024 * 1024) transfer.push(p.buffer as ArrayBuffer);
          return p;
        });
        const transferList = transfer.length > 0 ? (transfer as ArrayBuffer[]) : [];
        gifWorker.postMessage(
          { type: 'generate', packets: transferPackets },
          transferList,
        );
      });
      gifWorker.terminate();

      // ── Step 3: show result ────────────────────────────────────────
      const url = URL.createObjectURL(new Blob([gif.gifData], { type: 'image/gif' }));
      gifUrlRef.current = url;
      setGifUrl(url);
      setGifResult(gif);
      setStatus('Done ✓');
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }, [mode, text, file, resetOutput]);

  const handleDownload = useCallback(() => {
    if (!gifResult) return;
    const blob = new Blob([gifResult.gifData], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-transfer-${stats?.totalGenerations ?? 0}g.gif`;
    a.click();
    URL.revokeObjectURL(url);
  }, [gifResult, stats]);

  return (
    <div>
      {/* ── Input mode toggle ───────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.row}>
          <span style={S.label}>Input mode</span>
          <div style={S.toggleGroup}>
            <button style={S.toggleBtn(mode === 'text')} onClick={() => handleModeChange('text')}>Text</button>
            <button style={S.toggleBtn(mode === 'file')} onClick={() => handleModeChange('file')}>File</button>
          </div>
        </div>

        {mode === 'text' ? (
          <textarea
            style={{ ...S.textarea, marginTop: 10 }}
            placeholder="Type or paste text to transfer…"
            value={text}
            onInput={(e) => handleTextChange((e.target as HTMLTextAreaElement).value)}
          />
        ) : (
          <div style={{ marginTop: 10 }}>
            <input type="file" onChange={handleFile} />
          </div>
        )}
      </div>

      {/* ── Generate ────────────────────────────────────────────────────── */}
      <div style={S.section}>
        <button
          style={busy ? { ...S.btn, opacity: 0.6, cursor: 'not-allowed' } : S.btn}
          disabled={busy}
          onClick={handleGenerate}
        >
          {busy ? (
            <>
              <span style={S.spinner} />
              {status || 'Processing…'}
            </>
          ) : (
            'Generate GIF'
          )}
        </button>
        {error && <div style={S.warn}>⚠ {error}</div>}
      </div>

      {/* ── Preview ──────────────────────────────────────────────────────────── */}
      {gifUrl && gifResult && (
        <div style={S.section}>
          <div style={S.label}>Preview</div>
          <img src={gifUrl} alt="QR transfer GIF" style={S.preview} />
          <div style={{ ...S.row, marginTop: 8 }}>
            <button style={S.btn} onClick={handleDownload}>
              ⬇ Download GIF ({Math.round(gifResult.gifData.byteLength / 1024)} KB)
            </button>
          </div>
        </div>
      )}

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      {stats && (
        <div style={S.section}>
          <div style={S.label}>Transfer Info</div>
          <div style={S.infoGrid}>
            <span style={S.infoLabel}>Original size</span>
            <span style={S.infoValue}>{formatBytes(stats.originalSize)}</span>
            <span style={S.infoLabel}>Preprocessed size</span>
            <span style={S.infoValue}>{formatBytes(stats.preprocessedSize)}</span>
            <span style={S.infoLabel}>Frame count</span>
            <span style={S.infoValue}>{stats.frameCount}</span>
            <span style={S.infoLabel}>Generations</span>
            <span style={S.infoValue}>{stats.totalGenerations}</span>
            <span style={S.infoLabel}>GIF size</span>
            <span style={S.infoValue}>{gifResult ? formatBytes(gifResult.gifData.byteLength) : '…'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}