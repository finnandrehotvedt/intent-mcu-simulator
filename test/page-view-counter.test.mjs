// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
      schema: 'intent-mcu-aggregate-page-views@1', dayEuropeOslo: '2026-10-23',
      displayDay: '23 Oct 2026', timeZone: 'Europe/Oslo', today: 120, total: 120,
      startedAt: '2026-10-23T21:30:00.000Z', uniqueVisitors: false,
    });
    assert.equal(JSON.parse(await readFile(file, 'utf8')).days['2026-10-23'], 120);
  });
});

test('Europe/Oslo storage rolls over at local midnight rather than 02:00', async () => {
  await temporaryStore(async (file) => {
    let current = new Date('2026-10-23T21:59:59.000Z');
    const counter = new AggregatePageViewCounter({ file, now: () => current });
    const first = await counter.increment(); current = new Date('2026-10-23T22:00:01.000Z');
    const second = await counter.increment();
    assert.equal(first.dayEuropeOslo, '2026-10-23'); assert.equal(first.displayDay, '23 Oct 2026');
    assert.equal(second.dayEuropeOslo, '2026-10-24'); assert.equal(second.today, 1); assert.equal(second.total, 2);
  });
});

test('Europe/Oslo day bucket remains correct across both DST transitions', async () => {
  await temporaryStore(async (file) => {
    for (const [before, after, expected] of [
      ['2026-03-28T22:59:59.000Z', '2026-03-28T23:00:01.000Z', ['2026-03-28', '2026-03-29']],
      ['2026-10-24T21:59:59.000Z', '2026-10-24T22:00:01.000Z', ['2026-10-24', '2026-10-25']],
    ]) {
      let current = new Date(before); const counter = new AggregatePageViewCounter({ file, now: () => current });
      assert.equal((await counter.increment()).dayEuropeOslo, expected[0]); current = new Date(after);
      assert.equal((await counter.increment()).dayEuropeOslo, expected[1]);
    }
  });
});

test('persistence failure returns unavailable and does not expose request metadata', async () => {
  const failure = Object.assign(new Error('disk unavailable'), { code: 'EIO' });
  const counter = new AggregatePageViewCounter({ file: '/private/page-views.json', fs: {
    readFile: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    mkdir: async () => {}, writeFile: async () => { throw failure; }, rename: async () => {}, rmdir: async () => {},
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

test('two real processes serialize increments against one file and restart reads the exact total', async () => {
  await temporaryStore(async (file) => {
    const child = path.resolve('test/fixtures/page-view-counter-child.mjs');
    const run = () => new Promise((resolve, reject) => {
      const childProcess = spawn(process.execPath, [child, file, '40'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = ''; childProcess.stderr.on('data', (chunk) => { stderr += chunk; });
      childProcess.once('error', reject); childProcess.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr)));
    });
    await Promise.all([run(), run()]);
    const value = await new AggregatePageViewCounter({ file,
      now: () => new Date('2026-10-23T12:00:00Z') }).read();
    assert.equal(value.total, 80); assert.equal(value.today, 80);
  });
});

test('invalid timestamps, calendar days, counts, overflow and oversized buckets reject', async () => {
  await temporaryStore(async (file) => {
    const base = { schema: 'intent-mcu-aggregate-page-views@1', startedAt: '2026-10-23T12:00:00.000Z', total: 1,
      days: { '2026-10-23': 1 } };
    const invalid = [
      { ...base, startedAt: 'not-a-date' }, { ...base, days: { '2026-02-30': 1 } },
      { ...base, total: -1 }, { ...base, total: 0 },
      { ...base, total: Number.MAX_SAFE_INTEGER, days: { '2026-10-23': Number.MAX_SAFE_INTEGER } },
      { ...base, total: 401, days: Object.fromEntries(Array.from({ length: 401 }, (_, index) => {
        const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10); return [date, 1];
      })) },
    ];
    for (const value of invalid) {
      await import('node:fs/promises').then(({ writeFile }) => writeFile(file, JSON.stringify(value)));
      const counter = new AggregatePageViewCounter({ file });
      await assert.rejects(() => value.total === Number.MAX_SAFE_INTEGER ? counter.increment() : counter.read());
    }
  });
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
