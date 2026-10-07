// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { BuildProtocolError, BUILD_LIMITS } from './build-protocol.mjs';

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'], ['.xml', 'application/xml; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
]);

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self' 'sha256-uNefJRhc0C5fsmC2Ig0BsuGqp6EqLaFQiUlCWzU6jVE='; style-src 'self'; connect-src 'self'; worker-src 'self'; img-src 'self'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), serial=()',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

function json(response, status, value) {
  response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(value)}\n`);
}

function bearer(request) {
  const match = /^Bearer ([A-Za-z0-9_-]{40,80})$/.exec(request.headers.authorization ?? '');
  if (!match) throw new BuildProtocolError('JOB_NOT_FOUND', 'Build job not found', 404);
  return match[1];
}

async function readBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > BUILD_LIMITS.requestBytes) throw new BuildProtocolError('REQUEST_LIMIT', 'Build request is too large', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function requireMutationContext(request, configuredOrigin) {
  const expected = configuredOrigin ?? `http://${request.headers.host}`;
  if (request.headers.origin !== expected || request.headers['x-teach-lab-build'] !== '1') {
    throw new BuildProtocolError('REQUEST_CONTEXT_REJECTED', 'Build request context rejected', 403);
  }
}

function requestOrigin(request, trustProxy) {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = value?.split(',')[0].trim();
    if (first && /^[0-9a-f:.]{3,64}$/i.test(first)) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function normalizeConfiguredOrigin(value) {
  if (!value) return null;
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) {
    throw new TypeError('PUBLIC_ORIGIN must be an exact HTTP(S) origin');
  }
  return parsed.origin;
}

export function createRequestHandler({
  coordinator,
  root,
  publicOrigin = null,
  trustProxy = false,
  deploymentScope = 'non-public-m13',
  readiness = () => ({ ready: true, code: 'READY' }),
}) {
  const staticRoot = path.resolve(root);
  const configuredOrigin = normalizeConfiguredOrigin(publicOrigin);
  return async function requestHandler(request, response) {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);
      if (url.pathname === '/api/build') {
        if (request.method !== 'POST') {
          response.writeHead(405, { ...SECURITY_HEADERS, Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' });
          response.end('{"code":"METHOD_NOT_ALLOWED"}\n');
          return;
        }
        requireMutationContext(request, configuredOrigin);
        if ((request.headers['content-type'] ?? '').split(';')[0].trim() !== 'application/json') {
          throw new BuildProtocolError('CONTENT_TYPE_REQUIRED', 'JSON content type required', 415);
        }
        const submitted = coordinator.submit(await readBody(request), requestOrigin(request, trustProxy));
        json(response, 202, submitted);
        return;
      }
      const jobMatch = /^\/api\/build\/([0-9a-f]{24})$/.exec(url.pathname);
      if (jobMatch) {
        const capability = bearer(request);
        const origin = requestOrigin(request, trustProxy);
        if (request.method === 'GET') {
          json(response, 200, coordinator.status(jobMatch[1], capability, origin));
          return;
        }
        if (request.method === 'DELETE') {
          requireMutationContext(request, configuredOrigin);
          json(response, 200, coordinator.cancel(jobMatch[1], capability, origin));
          return;
        }
        response.writeHead(405, { ...SECURITY_HEADERS, Allow: 'GET, DELETE', 'Content-Type': 'application/json; charset=utf-8' });
        response.end('{"code":"METHOD_NOT_ALLOWED"}\n');
        return;
      }
      if (['/health', '/healthz'].includes(url.pathname) && request.method === 'GET') {
        json(response, 200, { status: 'ok', scope: deploymentScope });
        return;
      }
      if (url.pathname === '/readyz' && request.method === 'GET') {
        const compiler = readiness();
        json(response, compiler.ready ? 200 : 503, {
          status: compiler.ready ? 'ready' : 'unavailable', scope: deploymentScope, compiler: compiler.code,
        });
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { ...SECURITY_HEADERS, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Method not allowed');
        return;
      }
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(staticRoot, relative);
      if (file !== staticRoot && !file.startsWith(`${staticRoot}${path.sep}`)) throw new BuildProtocolError('NOT_FOUND', 'Not found', 404);
      if (!(await stat(file)).isFile()) throw new BuildProtocolError('NOT_FOUND', 'Not found', 404);
      const content = await readFile(file);
      response.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES.get(path.extname(file)) ?? 'application/octet-stream' });
      if (request.method === 'HEAD') response.end(); else response.end(content);
    } catch (error) {
      const status = error instanceof BuildProtocolError ? error.httpStatus : 404;
      const code = error instanceof BuildProtocolError ? error.code : 'NOT_FOUND';
      json(response, status, { code });
    }
  };
}
