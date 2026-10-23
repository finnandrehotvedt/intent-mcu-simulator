// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

const SCHEMA = 'intent-mcu-aggregate-page-views@1';
const MAX_DAYS = 400;
const utcDay = (date) => date.toISOString().slice(0, 10);
const safeInteger = (value) => Number.isSafeInteger(value) && value >= 0;

function emptyState(startedAt) {
  return { schema: SCHEMA, startedAt: startedAt.toISOString(), total: 0, days: {} };
}

function parseState(source) {
  const value = JSON.parse(source);
  if (value?.schema !== SCHEMA || typeof value.startedAt !== 'string' || !safeInteger(value.total)
      || !value.days || Array.isArray(value.days) || typeof value.days !== 'object') throw new Error('PAGE_VIEW_STORE_INVALID');
  for (const [day, count] of Object.entries(value.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(day) || !safeInteger(count)) throw new Error('PAGE_VIEW_STORE_INVALID');
  }
  return value;
}

function publicSnapshot(state, now) {
  const dayUtc = utcDay(now);
  return Object.freeze({ schema: SCHEMA, dayUtc, displayDay: new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Oslo',
  }).format(now), timeZone: 'Europe/Oslo', today: state.days[dayUtc] ?? 0,
  total: state.total, startedAt: state.startedAt, uniqueVisitors: false });
}

export class AggregatePageViewCounter {
  #file; #now; #fs; #state = null; #queue = Promise.resolve(); #sequence = 0;
  constructor({ file, now = () => new Date(), fs = { mkdir, readFile, rename, writeFile } }) {
    if (!path.isAbsolute(file)) throw new Error('PAGE_VIEW_STORE_ABSOLUTE_PATH_REQUIRED');
    this.#file = file; this.#now = now; this.#fs = fs;
  }
  async #load() {
    if (this.#state) return this.#state;
    try { this.#state = parseState(await this.#fs.readFile(this.#file, 'utf8')); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.#state = emptyState(this.#now());
    }
    return this.#state;
  }
  #serialize(operation) {
    const result = this.#queue.then(operation);
    this.#queue = result.catch(() => {});
    return result;
  }
  read() { return this.#serialize(async () => publicSnapshot(await this.#load(), this.#now())); }
  increment() {
    return this.#serialize(async () => {
      const now = this.#now(); const current = await this.#load(); const day = utcDay(now);
      const days = { ...current.days, [day]: (current.days[day] ?? 0) + 1 };
      const retained = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-MAX_DAYS));
      const next = { ...current, total: current.total + 1, days: retained };
      await this.#fs.mkdir(path.dirname(this.#file), { recursive: true, mode: 0o700 });
      const temporary = `${this.#file}.${process.pid}.${this.#sequence += 1}.tmp`;
      await this.#fs.writeFile(temporary, `${JSON.stringify(next)}\n`, { encoding: 'utf8', mode: 0o600 });
      await this.#fs.rename(temporary, this.#file);
      this.#state = next;
      return publicSnapshot(next, now);
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
