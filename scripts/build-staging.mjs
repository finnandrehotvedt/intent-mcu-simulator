// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { build } from 'esbuild';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
await mkdir(dist, { recursive: true });
for (const entry of await readdir(dist)) await rm(new URL(entry, dist), { recursive: true, force: true });
await Promise.all([
  cp(new URL('../staging/index.html', import.meta.url), new URL('index.html', dist)),
  cp(new URL('../staging/styles.css', import.meta.url), new URL('styles.css', dist)),
  build({ entryPoints: [new URL('../staging/main.mjs', import.meta.url).pathname], outfile: new URL('main.js', dist).pathname, bundle: true, format: 'esm', platform: 'browser', legalComments: 'eof' }),
  build({ entryPoints: [new URL('../src/simulator.worker.mjs', import.meta.url).pathname], outfile: new URL('simulator.worker.js', dist).pathname, bundle: true, format: 'esm', platform: 'browser', legalComments: 'eof' }),
]);
