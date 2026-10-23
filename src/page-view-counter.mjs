// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import path from 'node:path';
import { mkdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';

const SCHEMA = 'intent-mcu-aggregate-page-views@1';
const MAX_DAYS = 400;
const MAX_STORE_BYTES = 64 * 1024;
const LOCK_ATTEMPTS = 1_000;
const osloDay = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Oslo',
}).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
const osloDayKey = (date) => { const value = osloDay(date); return `${value.year}-${value.month}-${value.day}`; };
const safeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const validDay = (value) => /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

function emptyState(startedAt) {
  return { schema: SCHEMA, startedAt: startedAt.toISOString(), total: 0, days: {} };
}

function parseState(source) {
  if (Buffer.byteLength(source) > MAX_STORE_BYTES) throw new Error('PAGE_VIEW_STORE_TOO_LARGE');
  const value = JSON.parse(source);
  if (value?.schema !== SCHEMA || typeof value.startedAt !== 'string'
      || new Date(value.startedAt).toISOString() !== value.startedAt || !safeInteger(value.total)
      || !value.days || Array.isArray(value.days) || typeof value.days !== 'object') throw new Error('PAGE_VIEW_STORE_INVALID');
  const entries = Object.entries(value.days);
  if (entries.length > MAX_DAYS) throw new Error('PAGE_VIEW_STORE_INVALID');
  let retainedTotal = 0;
  for (const [day, count] of entries) {
    if (!validDay(day) || !safeInteger(count) || retainedTotal > Number.MAX_SAFE_INTEGER - count) {
      throw new Error('PAGE_VIEW_STORE_INVALID');
    }
    retainedTotal += count;
  }
  if (retainedTotal > value.total) throw new Error('PAGE_VIEW_STORE_INVALID');
  return value;
}

function publicSnapshot(state, now) {
  const dayEuropeOslo = osloDayKey(now);
  return Object.freeze({ schema: SCHEMA, dayEuropeOslo, displayDay: new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Oslo',
  }).format(now), timeZone: 'Europe/Oslo', today: state.days[dayEuropeOslo] ?? 0,
  total: state.total, startedAt: state.startedAt, uniqueVisitors: false });
}

export class AggregatePageViewCounter {
  #file; #lock; #now; #fs; #queue = Promise.resolve(); #sequence = 0; #delay;
  constructor({ file, now = () => new Date(), fs = { mkdir, readFile, rename, rmdir, writeFile },
    delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) }) {
    if (!path.isAbsolute(file)) throw new Error('PAGE_VIEW_STORE_ABSOLUTE_PATH_REQUIRED');
    this.#file = file; this.#lock = `${file}.lock`; this.#now = now; this.#fs = fs; this.#delay = delay;
  }
  async #load(now) {
    try { return parseState(await this.#fs.readFile(this.#file, 'utf8')); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      return emptyState(now);
    }
  }
  async #acquire() {
    await this.#fs.mkdir(path.dirname(this.#file), { recursive: true, mode: 0o700 });
    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
      try { await this.#fs.mkdir(this.#lock, { mode: 0o700 }); return; }
      catch (error) { if (error?.code !== 'EEXIST') throw error; }
      await this.#delay(5);
    }
    throw new Error('PAGE_VIEW_STORE_BUSY');
  }
  #serialize(operation) {
    const result = this.#queue.then(operation);
    this.#queue = result.catch(() => {});
    return result;
  }
  read() { return this.#serialize(async () => { const now = this.#now(); return publicSnapshot(await this.#load(now), now); }); }
  increment() {
    return this.#serialize(async () => {
      await this.#acquire();
      try {
        const now = this.#now(); const current = await this.#load(now); const day = osloDayKey(now);
        const dayCount = current.days[day] ?? 0;
        if (current.total === Number.MAX_SAFE_INTEGER || dayCount === Number.MAX_SAFE_INTEGER) {
          throw new Error('PAGE_VIEW_STORE_OVERFLOW');
        }
        const days = { ...current.days, [day]: dayCount + 1 };
        const retained = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-MAX_DAYS));
        const next = { ...current, total: current.total + 1, days: retained };
        const temporary = `${this.#file}.${process.pid}.${this.#sequence += 1}.tmp`;
        await this.#fs.writeFile(temporary, `${JSON.stringify(next)}\n`, { encoding: 'utf8', mode: 0o600 });
        await this.#fs.rename(temporary, this.#file);
        return publicSnapshot(next, now);
      } finally { await this.#fs.rmdir(this.#lock); }
    });
  }
}

export function createPageViewHandler(counter, { publicOrigin = null } = {}) {
  return async (request, response) => {
    if (request.url !== '/api/page-views') return false;
    if (!['GET', 'POST'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, POST', 'Cache-Control': 'no-store' }); response.end(); return true;
    }
    if (request.method === 'POST' && ((publicOrigin && request.headers.origin !== publicOrigin)
        || request.headers['content-length'] !== '0' || request.headers['transfer-encoding'])) {
      response.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end('{"status":"unavailable"}\n'); return true;
    }
    try {
      const value = request.method === 'POST' ? await counter.increment() : await counter.read();
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(`${JSON.stringify({ status: 'available', ...value })}\n`);
    } catch {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('{"status":"unavailable"}\n');
    }
    return true;
  };
}
