// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createRequestHandler } from '../compiler/http-gateway.mjs';

const capability = 'a'.repeat(43);
const coordinator = {
  submit(raw, origin) { return { jobId: '1'.repeat(24), capability, status: 'building', inputIdentity: '2'.repeat(64), rawBytes: raw.length, origin }; },
  status(jobId, supplied, origin) {
    if (supplied !== capability) throw new Error('unexpected capability');
    return { jobId, status: 'building', phase: 'queued', origin };
  },
  cancel(jobId, supplied) { return { jobId, status: supplied === capability ? 'cancelled' : 'failed' }; },
};

async function withServer(run, options = {}) {
  const server = http.createServer(createRequestHandler({
    coordinator,
    root: new URL('../dist', import.meta.url).pathname,
    ...options,
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}

test('same-origin gateway rejects cross-origin and untyped mutation requests', async () => withServer(async (base) => {
  const body = JSON.stringify({ schema: 'teach-lab-build-request@1', board: 'board.atmega328p-16mhz-v1', files: [] });
  for (const headers of [
    { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
    { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1', Origin: 'https://attacker.invalid' },
    { 'Content-Type': 'text/plain', 'X-Teach-Lab-Build': '1', Origin: base },
  ]) {
    const response = await fetch(`${base}/api/build`, { method: 'POST', headers, body });
    assert.ok([403, 415].includes(response.status));
    assert.equal(response.headers.get('set-cookie'), null);
  }
  const accepted = await fetch(`${base}/api/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1', Origin: base },
    body,
  });
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).jobId, '1'.repeat(24));
}));

test('configured HTTPS origin, health alias and trusted proxy identity support public reverse proxying', async () => {
  const publicOrigin = 'https://lab.teachthecompany.com';
  await withServer(async (base) => {
    const body = JSON.stringify({ schema: 'teach-lab-build-request@1', board: 'board.atmega328p-16mhz-v1', files: [] });
    const accepted = await fetch(`${base}/api/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Teach-Lab-Build': '1',
        'X-Forwarded-For': '203.0.113.42, 10.0.0.1',
        Origin: publicOrigin,
      },
      body,
    });
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).origin, '203.0.113.42');

    const rejected = await fetch(`${base}/api/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Teach-Lab-Build': '1',
        Origin: base,
      },
      body,
    });
    assert.equal(rejected.status, 403);

    const health = await fetch(`${base}/healthz`);
    assert.deepEqual(await health.json(), { status: 'ok', scope: 'public' });
  }, { publicOrigin, trustProxy: true, deploymentScope: 'public' });
});

test('compiler readiness is distinct from gateway liveness and exposes only stable codes', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    const response = await fetch(`${base}/readyz`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: 'unavailable', scope: 'non-public-m13', compiler: 'TOOLCHAIN_IMAGE_UNAVAILABLE',
    });
  }, { readiness: () => ({ ready: false, code: 'TOOLCHAIN_IMAGE_UNAVAILABLE' }) });
});

test('job capability and restrictive self-hosted headers protect status/cancel routes', async () => withServer(async (base) => {
  const missing = await fetch(`${base}/api/build/${'1'.repeat(24)}`);
  assert.equal(missing.status, 404);
  const status = await fetch(`${base}/api/build/${'1'.repeat(24)}`, { headers: { Authorization: `Bearer ${capability}` } });
  assert.equal(status.status, 200);
  assert.match(status.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(status.headers.get('content-security-policy'), /worker-src 'self'/);
  assert.equal(status.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(status.headers.get('set-cookie'), null);
  const crossCancel = await fetch(`${base}/api/build/${'1'.repeat(24)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${capability}`, 'X-Teach-Lab-Build': '1', Origin: 'https://attacker.invalid' },
  });
  assert.equal(crossCancel.status, 403);
  const cancel = await fetch(`${base}/api/build/${'1'.repeat(24)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${capability}`, 'X-Teach-Lab-Build': '1', Origin: base },
  });
  assert.equal(cancel.status, 200);
  assert.equal((await cancel.json()).status, 'cancelled');
}));

test('discovery files and project-owned social assets use crawler-safe content types', async () => withServer(async (base) => {
  const expected = new Map([
    ['/robots.txt', 'text/plain; charset=utf-8'],
    ['/sitemap.xml', 'application/xml; charset=utf-8'],
    ['/llms.txt', 'text/plain; charset=utf-8'],
    ['/icon.svg', 'image/svg+xml'],
    ['/social-card.png', 'image/png'],
  ]);
  for (const [pathname, contentType] of expected) {
    const response = await fetch(`${base}${pathname}`);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('content-type'), contentType, pathname);
  }
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Disallow: \/api\//);
  assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /https:\/\/lab\.teachthecompany\.com\//);
  assert.match(await (await fetch(`${base}/llms.txt`)).text(), /no hosted AI API/i);
}));
