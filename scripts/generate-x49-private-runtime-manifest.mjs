// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  X49_PRIVATE_EXTERNAL_CONTRACTS, X49_PRIVATE_IMPLEMENTATION_ID,
  X49_PRIVATE_IMPLEMENTATION_VERSION, X49_PRIVATE_MANIFEST_SCHEMA,
  X49_PRIVATE_RUNTIME_MEMBERS, X49_PRIVATE_TOOL_MEMBERS,
} from '../src/x49-private-runtime-contract.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(repository, 'src/x49-private-runtime-manifest.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};
const canonical = (value) => JSON.stringify(stable(value));

async function importsFor(path) {
  const source = await readFile(resolve(repository, path), 'utf8');
  const imports = [];
  for (const match of source.matchAll(/^import[\s\S]*?from\s+['"]([^'"]+)['"];?/gmu)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) {
      if (specifier !== 'avr8js') throw new Error(`X49_PRIVATE_EXTERNAL_IMPORT:${specifier}`);
      continue;
    }
    imports.push(relative(repository, resolve(repository, dirname(path), specifier)).replaceAll('\\', '/'));
  }
  if (/\bimport\s*\(/u.test(source)) throw new Error(`X49_PRIVATE_DYNAMIC_IMPORT:${path}`);
  return imports;
}

async function closure() {
  const pending = ['src/x49-private.worker.mjs']; const seen = new Set();
  while (pending.length) {
    const path = pending.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    pending.push(...await importsFor(path));
  }
  const actual = [...seen].sort(); const expected = [...X49_PRIVATE_RUNTIME_MEMBERS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`X49_PRIVATE_CLOSURE_MISMATCH:${JSON.stringify({ actual, expected })}`);
  }
  return Promise.all(X49_PRIVATE_RUNTIME_MEMBERS.map(async (path) =>
    ({ path, sha256: sha256(await readFile(resolve(repository, path))) })));
}

const runtimeMembers = await closure();
const evidenceToolMembers = await Promise.all(X49_PRIVATE_TOOL_MEMBERS.map(async (path) =>
  ({ path, sha256: sha256(await readFile(resolve(repository, path))) })));
const implementationSha256 = sha256(canonical({ runtimeMembers,
  externalContracts: X49_PRIVATE_EXTERNAL_CONTRACTS }));
const evidenceToolSha256 = sha256(canonical({ evidenceToolMembers }));
const semantic = { schema: X49_PRIVATE_MANIFEST_SCHEMA,
  implementationId: X49_PRIVATE_IMPLEMENTATION_ID, version: X49_PRIVATE_IMPLEMENTATION_VERSION,
  runtimeMembers, evidenceToolMembers,
  externalContracts: [...X49_PRIVATE_EXTERNAL_CONTRACTS], implementationSha256,
  evidenceToolSha256 };
const manifest = { ...semantic, semanticSha256: sha256(canonical(semantic)) };
const output = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes('--write')) await writeFile(outputPath, output);
else {
  let existing = ''; try { existing = await readFile(outputPath, 'utf8'); } catch { /* absent */ }
  if (existing !== output) throw new Error('X49_PRIVATE_MANIFEST_STALE');
}
console.log(JSON.stringify({ implementationSha256, evidenceToolSha256,
  semanticSha256: manifest.semanticSha256, runtimeMembers: runtimeMembers.length,
  evidenceToolMembers: evidenceToolMembers.length }));
