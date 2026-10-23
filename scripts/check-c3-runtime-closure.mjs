#!/usr/bin/env node
// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const STATIC_IMPORT = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/gu;

export async function resolveC3RuntimeClosure({ root, entry = 'c3/qemu-runner.mjs', load = readFile }) {
  if (!path.isAbsolute(root)) throw new TypeError('C3_RUNTIME_CLOSURE_ROOT_ABSOLUTE_REQUIRED');
  const pending = [entry];
  const members = new Set();
  const edges = [];
  while (pending.length) {
    const member = path.normalize(pending.shift());
    if (member.startsWith('..') || path.isAbsolute(member)) throw new Error('C3_RUNTIME_CLOSURE_PATH_ESCAPE');
    if (members.has(member)) continue;
    let source;
    try { source = await load(path.join(root, member), 'utf8'); }
    catch (error) { throw new Error(`C3_RUNTIME_CLOSURE_MISSING:${member}`, { cause: error }); }
    members.add(member);
    STATIC_IMPORT.lastIndex = 0;
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const specifier = match[1] ?? match[2];
      if (!specifier.startsWith('.')) continue;
      const target = path.normalize(path.join(path.dirname(member), specifier));
      if (target.startsWith('..') || path.isAbsolute(target)) throw new Error('C3_RUNTIME_CLOSURE_PATH_ESCAPE');
      edges.push(Object.freeze({ from: member, to: target }));
      pending.push(target);
    }
  }
  return Object.freeze({ entry, members: Object.freeze([...members].sort()),
    edges: Object.freeze(edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`))) });
}

function option(name) {
  const prefix = `--${name}=`;
  const joined = process.argv.find((value) => value.startsWith(prefix));
  if (joined) return joined.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const closure = await resolveC3RuntimeClosure({ root: option('root'), entry: option('entry') ?? undefined });
    process.stdout.write(`${JSON.stringify({ schema: 'intent-mcu-c3-runtime-closure@1', ...closure })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
