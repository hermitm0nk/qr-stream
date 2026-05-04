import { createServer, type Server } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { extname, join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

function findWebRoot(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  let dir = dirname(scriptPath);

  // If we are inside dist/ (bundled), serve from dist/
  if (basename(dir) === 'dist') {
    return dir;
  }

  // Otherwise search upward for dist/index.html
  while (dir !== dirname(dir)) {
    const candidate = join(dir, 'dist');
    if (existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
    dir = dirname(dir);
  }

  throw new Error(
    'Could not find built web assets (dist/index.html). ' +
      'Run `npm run build` first.'
  );
}

/**
 * Create a static HTTP server for the built web app.
 * Uses relative asset paths (base: './' in vite.config.ts) so all
 * requests resolve directly against the dist/ directory.
 *
 * @param port TCP port to listen on
 * @param host Host address to bind to (default: '0.0.0.0')
 */
export function startServer(port: number, host?: string): Server {
  const root = findWebRoot();

  const server = createServer((req, res) => {
    let pathname = req.url ?? '/';
    // Strip query string
    const qIdx = pathname.indexOf('?');
    if (qIdx !== -1) pathname = pathname.slice(0, qIdx);

    // Security: prevent directory traversal
    const safePath = pathname.replace(/\.{2,}/g, '');
    let filePath = join(root, safePath);

    if (!existsSync(filePath) || !filePath.startsWith(root)) {
      // SPA fallback: serve index.html for non-asset paths
      const ext = extname(safePath);
      if (!ext || ext === '.html') {
        filePath = join(root, 'index.html');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
    }

    // If the resolved path is a directory, serve index.html from it
    if (statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
    });
    res.end(content);
  });

  server.listen(port, host ?? '0.0.0.0', () => {
    const addr = host ?? '0.0.0.0';
    console.log(`QR Stream web app serving at http://${addr}:${port}`);
  });

  return server;
}
