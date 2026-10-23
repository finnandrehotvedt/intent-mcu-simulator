// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AggregatePageViewCounter, createPageViewHandler } from '../src/page-view-counter.mjs';

async function temporaryStore(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'intent-page-views-'));
  try { await run(path.join(directory, 'aggregate.json')); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('concurrent page views are serialized without lost increments and survive restart', async () => {
  await temporaryStore(async (file) => {
    const now = () => new Date('2026-10-23T21:30:00.000Z');
    const counter = new AggregatePageViewCounter({ file, now });
    const results = await Promise.all(Array.from({ length: 120 }, () => counter.increment()));
    assert.deepEqual(results.map((item) => item.total).sort((a, b) => a - b),
      Array.from({ length: 120 }, (_, index) => index + 1));
    assert.deepEqual(await new AggregatePageViewCounter({ file, now }).read(), {
      schema: 'intent-mcu-aggregate-page-views@1', dayUtc: '2026-10-23',
      displayDay: '23 Oct 2026', timeZone: 'Europe/Oslo', today: 120, total: 120,
      startedAt: '2026-10-23T21:30:00.000Z', uniqueVisitors: false,
    });
    assert.equal(JSON.parse(await readFile(file, 'utf8')).days['2026-10-23'], 120);
  });
});

test('UTC storage rolls over deliberately while Europe/Oslo display date remains explicit', async () => {
  await temporaryStore(async (file) => {
    let current = new Date('2026-10-23T23:59:59.000Z');
    const counter = new AggregatePageViewCounter({ file, now: () => current });
    const first = await counter.increment(); current = new Date('2026-10-24T00:00:01.000Z');
    const second = await counter.increment();
    assert.equal(first.dayUtc, '2026-10-23'); assert.equal(first.displayDay, '24 Oct 2026');
    assert.equal(second.dayUtc, '2026-10-24'); assert.equal(second.today, 1); assert.equal(second.total, 2);
  });
});

test('persistence failure returns unavailable and does not expose request metadata', async () => {
  const failure = Object.assign(new Error('disk unavailable'), { code: 'EIO' });
  const counter = new AggregatePageViewCounter({ file: '/private/page-views.json', fs: {
    readFile: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    mkdir: async () => {}, writeFile: async () => { throw failure; }, rename: async () => {},
  } });
  const handler = createPageViewHandler(counter); const headers = {};
  const response = { writeHead(code, value) { this.code = code; Object.assign(headers, value); }, end(value) { this.body = value; } };
  assert.equal(await handler({ method: 'POST', url: '/api/page-views', headers: {
    'user-agent': 'not-retained', 'x-forwarded-for': '192.0.2.1',
    'content-length': '0',
  } }, response), true);
  assert.equal(response.code, 503); assert.equal(response.body, '{"status":"unavailable"}\n');
  assert.equal(headers['Cache-Control'], 'no-store');
});

test('GET is non-incrementing and unsupported methods fail closed', async () => {
  await temporaryStore(async (file) => {
    const counter = new AggregatePageViewCounter({ file, now: () => new Date('2026-10-23T12:00:00Z') });
    await counter.increment(); const handler = createPageViewHandler(counter);
    const invoke = async (method) => { const response = { writeHead(code) { this.code = code; }, end(body) { this.body = body; } };
      await handler({ method, url: '/api/page-views', headers: { 'content-length': '0' } }, response); return response; };
    assert.equal(JSON.parse((await invoke('GET')).body).total, 1);
    assert.equal(JSON.parse((await invoke('GET')).body).total, 1);
    assert.equal((await invoke('PUT')).code, 405);
  });
});

test('configured public origin rejects cross-site and body-bearing increments', async () => {
  await temporaryStore(async (file) => {
    const counter = new AggregatePageViewCounter({ file });
    const handler = createPageViewHandler(counter, { publicOrigin: 'https://lab.example' });
    const invoke = async (headers) => { const response = { writeHead(code) { this.code = code; }, end(body) { this.body = body; } };
      await handler({ method: 'POST', url: '/api/page-views', headers }, response); return response; };
    assert.equal((await invoke({ origin: 'https://other.example', 'content-length': '0' })).code, 400);
    assert.equal((await invoke({ origin: 'https://lab.example', 'content-length': '3' })).code, 400);
    assert.equal((await invoke({ origin: 'https://lab.example', 'content-length': '0' })).code, 200);
    assert.equal((await counter.read()).total, 1);
  });
});
