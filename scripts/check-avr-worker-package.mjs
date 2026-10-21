// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'compiler/build-worker.mjs';

const relativeImports = (source) => [...source.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]|\bimport\s*['"](\.[^'"]+)['"]/gu)]
  .map((match) => match[1] ?? match[2]);

export async function discoverWorkerClosure(root = ROOT, entry = ENTRY) {
  const pending = [entry];
  const found = new Set();
  while (pending.length) {
    const relative = pending.pop();
    if (found.has(relative)) continue;
    found.add(relative);
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error('AVR_WORKER_IMPORT_ESCAPES_ROOT');
    const source = await readFile(absolute, 'utf8');
    for (const specifier of relativeImports(source)) {
      const imported = path.relative(root, path.resolve(path.dirname(absolute), specifier))
        .split(path.sep).join('/');
      if (!imported.endsWith('.mjs')) throw new Error(`AVR_WORKER_IMPORT_UNSUPPORTED:${imported}`);
      pending.push(imported);
    }
  }
  return [...found].sort();
}

export function imagePathFor(relative) {
  const [owner, ...rest] = relative.split('/');
  if (owner === 'compiler') return `/opt/teach-lab/${rest.join('/')}`;
  if (owner === 'src') return `/opt/src/${rest.join('/')}`;
  throw new Error(`AVR_WORKER_PACKAGE_OWNER_UNSUPPORTED:${relative}`);
}

export function validateDockerfileClosure(dockerfile, closure) {
  for (const relative of closure) {
    const expected = `COPY ${relative} ${imagePathFor(relative)}`;
    if (!dockerfile.split(/\r?\n/u).includes(expected)) {
      throw new Error(`AVR_WORKER_PACKAGE_MISSING:${expected}`);
    }
  }
  return Object.freeze({ entry: ENTRY, closure: [...closure], files: closure.length });
}

export async function checkAvrWorkerPackage(root = ROOT) {
  const [dockerfile, closure] = await Promise.all([
    readFile(path.join(root, 'Dockerfile.toolchain'), 'utf8'),
    discoverWorkerClosure(root),
  ]);
  return validateDockerfileClosure(dockerfile, closure);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.stdout.write(`${JSON.stringify(await checkAvrWorkerPackage())}\n`);
}
