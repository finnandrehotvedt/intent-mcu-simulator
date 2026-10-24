#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { createBrowserSessionHttpHandler } from '../src/browser-session-http.mjs';
import { createBrowserSessionRelay } from '../src/browser-session-relay.mjs';

const host = '127.0.0.1'; const port = Number(process.env.API_PREVIEW_PORT ?? 18769);
const root = path.resolve(process.env.API_PREVIEW_ROOT ?? new URL('../dist', import.meta.url).pathname);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const relay = createBrowserSessionRelay(); const origin = `http://${host}:${port}`;
const api = createBrowserSessionHttpHandler(relay, { publicOrigin: origin });
const sweep = setInterval(() => relay.sweep(), 5_000); sweep.unref();
const server = createServer(async (request, response) => {
  if (await api(request, response)) return;
  const pathname = new URL(request.url, origin).pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (relative.includes('..')) { response.writeHead(400); response.end(); return; }
  const file = path.join(root, relative);
  try {
    if (!(await stat(file)).isFile()) throw new Error('not-file');
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store' }); createReadStream(file).pipe(response);
  } catch { response.writeHead(404); response.end(); }
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
server.listen(port, host, () => process.stdout.write(`Private API preview: ${origin}\n`));
