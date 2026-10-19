// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '00f4c58e4a99f594743df7aa56221d73ec74cdb8';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = path.join(ROOT, 'src/model-bundles/retained-rc72/source');
const SEEDS = Object.freeze([
  'src/component-catalog.mjs',
  'src/circuit-engine.mjs',
  'src/runtime-kernel.mjs',
  'src/candidate-project-session.mjs',
  'src/candidate-spdt-runtime.mjs',
  'src/candidate-existing-ui-adapter.mjs',
  'src/rp2040-pico-circuit.mjs',
  'src/rp2040-public-workbench.mjs',
  'src/esp32c3-public-circuit.mjs',
  'src/esp32c3-public-workbench.mjs',
  'src/stm32-public-circuit.mjs',
  'src/stm32-public-workbench.mjs',
  'expansion-drafts/project-v3-contact-persistence.mjs',
  'expansion-drafts/ground-reference-integration-v1.mjs',
  'expansion-drafts/toggle-switch-integration-v1.mjs',
  'expansion-drafts/switch-contact-graph-v1.mjs',
  'expansion-drafts/ideal-three-pin-analogue-module-v1.mjs',
  'expansion-drafts/light-analogue-sensor-v1.mjs',
  'expansion-drafts/temperature-analogue-sensor-v1.mjs',
  'expansion-drafts/digital-light-threshold-module-v1.mjs',
  'expansion-drafts/common-cathode-rgb-led-v1.mjs',
  'expansion-drafts/active-buzzer-module-v1.mjs',
  'expansion-drafts/seven-segment-common-cathode-v1.mjs',
  'expansion-drafts/character-lcd-16x2-4bit-v1.mjs',
  'expansion-drafts/rotary-encoder-quadrature-v1.mjs',
]);

function historical(relativePath) {
  return execFileSync('git', ['show', `${COMMIT}:${relativePath}`], {
    cwd: ROOT, encoding: null, maxBuffer: 16 * 1024 * 1024,
  });
}

function existsAtCommit(relativePath) {
  try {
    execFileSync('git', ['cat-file', '-e', `${COMMIT}:${relativePath}`], {
      cwd: ROOT, stdio: 'ignore',
    });
    return true;
  } catch { return false; }
}

function relativeImports(source) {
  const rows = [];
  const pattern = /(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/gu;
  for (const match of source.matchAll(pattern)) rows.push(match[1]);
  return rows;
}

function resolveImport(owner, request) {
  const raw = path.posix.normalize(path.posix.join(path.posix.dirname(owner), request));
  const candidates = path.posix.extname(raw) ? [raw] : [`${raw}.mjs`, `${raw}.js`, `${raw}.json`];
  const found = candidates.find(existsAtCommit);
  if (!found || found.startsWith('../')) throw new Error(`RETAINED_CLOSURE_IMPORT:${owner}:${request}`);
  return found;
}

const pending = [...SEEDS];
const sources = new Map();
while (pending.length) {
  const relativePath = pending.pop();
  if (sources.has(relativePath)) continue;
  const bytes = historical(relativePath);
  sources.set(relativePath, bytes);
  if (/\.(?:mjs|js)$/u.test(relativePath)) {
    for (const request of relativeImports(bytes.toString('utf8'))) {
      const dependency = resolveImport(relativePath, request);
      if (!sources.has(dependency)) pending.push(dependency);
    }
  }
}

await rm(OUTPUT, { recursive: true, force: true });
for (const [relativePath, bytes] of [...sources].sort(([left], [right]) => left.localeCompare(right))) {
  const target = path.join(OUTPUT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const members = [...sources].sort(([left], [right]) => left.localeCompare(right)).map(([relativePath, bytes]) => ({
  path: relativePath,
  sha256: createHash('sha256').update(bytes).digest('hex'),
}));
const closure = {
  schema: 'intent-mcu-retained-model-source-closure@1',
  commit: COMMIT,
  seeds: [...SEEDS],
  members,
  closureSha256: createHash('sha256').update(JSON.stringify(members)).digest('hex'),
};
await writeFile(path.join(OUTPUT, 'closure.json'), `${JSON.stringify(closure, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ commit: COMMIT, members: members.length,
  closureSha256: closure.closureSha256 })}\n`);
