/**
 * Receiver page — camera preview, QR decode, GIF file upload mode, file download.
 */
import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { parseGif, renderGifFrame } from '@/core/gif/gif_parser';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionInfo {
  sessionId: string;
  progress: number;
  solvedGenerations: number;
  totalGenerations: number;
  framesDecoded: number;
  status: 'receiving' | 'complete' | 'error';
}

interface ReceivedFile {
  data: ArrayBuffer;
  filename: string;
  mime: string;
}

type InputMode = 'camera' | 'gif-file';

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  btnStop: {
    background: '#da3633',
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
  video: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 6,
    background: '#000',
    display: 'block',
    marginTop: 8,
  } as CSSProps,
  progressOuter: {
    width: '100%',
    height: 8,
    background: '#30363d',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  } as CSSProps,
  progressInner: (pct: number): CSSProps => ({
    width: `${Math.min(100, Math.max(0, pct))}%`,
    height: '100%',
    background: pct >= 100 ? '#3fb950' : '#58a6ff',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  }),
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
    marginTop: 8,
  } as CSSProps,
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    borderBottom: '1px solid #30363d',
    color: '#8b949e',
    fontWeight: 600,
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid #21262d',
    color: '#c9d1d9',
  },
  statusBadge: (status: string): CSSProps => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 600,
    background: status === 'complete' ? '#1b3a1b' : status === 'error' ? '#3d1a1a' : '#1f2937',
    color: status === 'complete' ? '#3fb950' : status === 'error' ? '#f85149' : '#8b949e',
  }),
  warn: {
    background: '#3d2600',
    border: '1px solid #bb8009',
    borderRadius: 6,
    padding: '10px 14px',
    color: '#d29922',
    fontSize: 13,
    marginTop: 8,
  },
  sp: {
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
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ReceiverPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);
  const scanningRef = useRef(false);

  const [inputMode, setInputMode] = useState<InputMode>('camera');
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [framesDecoded, setFramesDecoded] = useState(0);
  const [solvedGens, setSolvedGens] = useState(0);
  const [totalGens, setTotalGens] = useState(0);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null);
  const [error, setError] = useState('');

  // ── Create decode worker ──────────────────────────────────────────────────
  function createWorker(): Worker {
    const w = new Worker(
      new URL('@/workers/decode.worker.ts', import.meta.url),
      { type: 'module' },
    );

    w.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      switch (msg.type) {
        case 'progress': {
          setFramesDecoded(msg.framesDecoded);
          setSolvedGens(msg.solvedGenerations);
          setTotalGens(msg.totalGenerations);
          setProgress(msg.totalGenerations > 0 ? msg.solvedGenerations / msg.totalGenerations : 0);
          setStatus(msg.status);

          if (msg.sessionId) {
            setSessions((prev) => {
              const sid = msg.sessionId as string;
              const existing = prev.find((s) => s.sessionId === sid);
              if (existing) {
                return prev.map((s) =>
                  s.sessionId === sid
                    ? {
                        ...s,
                        progress: msg.totalGenerations > 0 ? msg.solvedGenerations / msg.totalGenerations : 0,
                        solvedGenerations: msg.solvedGenerations,
                        totalGenerations: msg.totalGenerations,
                        framesDecoded: msg.framesDecoded,
                        status: 'receiving' as const,
                      }
                    : s,
                );
              }
              return [
                ...prev,
                {
                  sessionId: sid,
                  progress: 0,
                  solvedGenerations: 0,
                  totalGenerations: msg.totalGenerations,
                  framesDecoded: 0,
                  status: 'receiving' as const,
                } as SessionInfo,
              ];
            });
          }
          break;
        }
        case 'complete': {
          setReceivedFile({
            data: msg.data as ArrayBuffer,
            filename: msg.filename ?? 'recovered',
            mime: msg.mime ?? 'application/octet-stream',
          });
          setStatus('Complete ✓');
          setProgress(1);
          setSessions((prev) =>
            prev.map((s) =>
              s.sessionId === msg.sessionId ? { ...s, status: 'complete' as const, progress: 1 } : s,
            ),
          );
          break;
        }
        case 'error': {
          setError(msg.message);
          setSessions((prev) =>
            prev.map((s) =>
              s.sessionId === msg.sessionId ? { ...s, status: 'error' as const } : s,
            ),
          );
          break;
        }
      }
    };

    w.onerror = (err) => {
      setError(`Worker error: ${err.message}`);
    };

    return w;
  }

  // ── Start camera scanning ─────────────────────────────────────────────────
  const startCameraScanning = useCallback(async () => {
    setError('');
    setReceivedFile(null);
    setSessions([]);
    setProgress(0);
    setFramesDecoded(0);
    setSolvedGens(0);
    setTotalGens(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const worker = createWorker();
      workerRef.current = worker;

      setScanning(true);
      scanningRef.current = true;
      setStatus('Scanning…');

      // rAF capture loop
      let lastCapture = 0;
      const CAPTURE_INTERVAL = 150;
      const loop = (time: number) => {
        if (!scanningRef.current) return;
        if (time - lastCapture >= CAPTURE_INTERVAL) {
          captureFrame();
          lastCapture = time;
        }
        animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    } catch (err: any) {
      setError(`Camera error: ${err.message ?? String(err)}`);
    }
  }, []);

  // ── Process GIF file ──────────────────────────────────────────────────────
  const handleGifFile = useCallback(async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setError('');
    setReceivedFile(null);
    setSessions([]);
    setProgress(0);
    setFramesDecoded(0);
    setSolvedGens(0);
    setTotalGens(0);

    const worker = createWorker();
    workerRef.current = worker;

    setScanning(true);
    scanningRef.current = true;
    setStatus('Parsing GIF frames…');

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const gifData = parseGif(bytes);

      if (gifData.frames.length === 0) {
        setError('No frames found in GIF');
        return;
      }

      setStatus(`Processing ${gifData.frames.length} frames…`);

      for (let i = 0; i < gifData.frames.length; i++) {
        if (!scanningRef.current) break;
        const rgba = renderGifFrame(gifData, i);
        // Send raw pixel buffer (ArrayBuffer) instead of ImageData to avoid
        // structured clone issues with ImageData in some browsers.
        const pixelBuf = rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength);
        worker.postMessage(
          { type: 'frame', pixels: pixelBuf, width: gifData.width, height: gifData.height },
          [pixelBuf],
        );
      }

      setStatus('GIF processed');
    } catch (err: any) {
      setError(`GIF error: ${err.message ?? String(err)}`);
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, []);

  // ── Stop scanning ────────────────────────────────────────────────────────
  const stopScanning = useCallback(() => {
    setScanning(false);
    scanningRef.current = false;
    cancelAnimationFrame(animRef.current);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setStatus('Stopped');
  }, []);

  // ── Capture frame from camera ────────────────────────────────────────────
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const worker = workerRef.current;
    if (!video || !canvas || !worker || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = Math.min(video.videoWidth || 640, 640);
    const ch = Math.min(video.videoHeight || 640, 640);
    canvas.width = cw;
    canvas.height = ch;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 640;
    const minDim = Math.min(vw, vh);
    const sx = (vw - minDim) / 2;
    const sy = (vh - minDim) / 2;

    ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, cw, ch);
    const imageData = ctx.getImageData(0, 0, cw, ch);

    worker.postMessage({ type: 'frame', imageData });
  }, []);

  // ── Download recovered file ──────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!receivedFile) return;
    const blob = new Blob([receivedFile.data], { type: receivedFile.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = receivedFile.filename || 'recovered-file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [receivedFile]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Input mode toggle ────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.label}>Input Mode</div>
        <div style={S.toggleGroup}>
          <button
            style={S.toggleBtn(inputMode === 'camera')}
            onClick={() => { stopScanning(); setInputMode('camera'); }}
          >
            📷 Camera
          </button>
          <button
            style={S.toggleBtn(inputMode === 'gif-file')}
            onClick={() => { stopScanning(); setInputMode('gif-file'); }}
          >
            🎞️ GIF File
          </button>
        </div>
      </div>

      {/* ── Camera preview ──────────────────────────────────────────────── */}
      {inputMode === 'camera' && (
        <div style={S.section}>
          <div style={S.label}>Camera</div>
          <video ref={videoRef} style={S.video} playsInline muted />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ ...S.row, marginTop: 10 }}>
            {!scanning ? (
              <button style={S.btn} onClick={startCameraScanning}>
                ▶ Start Scan
              </button>
            ) : (
              <button style={S.btnStop} onClick={stopScanning}>
                ■ Stop Scan
              </button>
            )}
          </div>
          {error && <div style={S.warn}>⚠ {error}</div>}
        </div>
      )}

      {/* ── GIF file upload ──────────────────────────────────────────────── */}
      {inputMode === 'gif-file' && (
        <div style={S.section}>
          <div style={S.label}>Upload GIF</div>
          <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 8 }}>
            Upload a QR-over-GIF file generated by the Sender. The receiver will decode frames directly from the GIF.
          </p>
          <input type="file" accept=".gif,image/gif" onChange={handleGifFile} />
          {error && <div style={{ ...S.warn, marginTop: 8 }}>⚠ {error}</div>}
        </div>
      )}

      {/* ── Status + progress ────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.label}>Status</div>
        <div style={{ ...S.row, gap: 16 }}>
          <span>
            <strong>Status:</strong> {status || 'Idle'}
          </span>
          <span>
            <strong>Frames:</strong> {framesDecoded}
          </span>
          <span>
            <strong>Generations:</strong> {solvedGens}/{totalGens}
          </span>
        </div>
        {totalGens > 0 && (
          <div style={S.progressOuter}>
            <div style={S.progressInner(progress * 100)} />
          </div>
        )}
        {scanning && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#8b949e' }}>
            <span style={S.sp} />{' '}
            {status || 'Working…'}
          </div>
        )}
      </div>

      {/* ── Sessions table ───────────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <div style={S.section}>
          <div style={S.label}>Sessions</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Session ID</th>
                <th style={S.th}>Progress</th>
                <th style={S.th}>Generations</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td style={S.td}>
                    {s.sessionId.length > 16
                      ? `${s.sessionId.slice(0, 16)}…`
                      : s.sessionId}
                  </td>
                  <td style={S.td}>
                    <div
                      style={{
                        ...S.progressOuter,
                        marginTop: 0,
                        width: 100,
                        display: 'inline-block',
                        verticalAlign: 'middle',
                      }}
                    >
                      <div style={S.progressInner(s.progress * 100)} />
                    </div>
                    <span style={{ marginLeft: 8, fontSize: 12 }}>
                      {Math.round(s.progress * 100)}%
                    </span>
                  </td>
                  <td style={S.td}>
                    {s.solvedGenerations}/{s.totalGenerations}
                  </td>
                  <td style={S.td}>
                    <span style={S.statusBadge(s.status)}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Download recovered file ──────────────────────────────────────── */}
      {receivedFile && (
        <div style={S.section}>
          <div style={S.label}>Recovered File</div>
          <p style={{ margin: '6px 0', fontSize: 14 }}>
            <strong>File:</strong> {receivedFile.filename || '(unnamed)'} &middot;{' '}
            {formatBytes(receivedFile.data.byteLength)} &middot;{' '}
            {receivedFile.mime}
          </p>
          <button style={S.btn} onClick={handleDownload}>
            ⬇ Download Recovered File
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
