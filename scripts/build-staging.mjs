// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { build } from 'esbuild';
import { chmod, cp, mkdir, readdir, rm } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
await mkdir(dist, { recursive: true });
for (const entry of await readdir(dist)) await rm(new URL(entry, dist), { recursive: true, force: true });
await Promise.all([
  cp(new URL('../staging/index.html', import.meta.url), new URL('index.html', dist)),
  cp(new URL('../staging/styles.css', import.meta.url), new URL('styles.css', dist)),
  cp(new URL('../staging/icon.svg', import.meta.url), new URL('icon.svg', dist)),
  cp(new URL('../staging/social-card.png', import.meta.url), new URL('social-card.png', dist)),
  cp(new URL('../staging/robots.txt', import.meta.url), new URL('robots.txt', dist)),
  cp(new URL('../staging/sitemap.xml', import.meta.url), new URL('sitemap.xml', dist)),
  cp(new URL('../staging/llms.txt', import.meta.url), new URL('llms.txt', dist)),
  build({ entryPoints: [new URL('../staging/main.mjs', import.meta.url).pathname], outfile: new URL('main.js', dist).pathname, bundle: true, format: 'esm', platform: 'browser', legalComments: 'eof' }),
  build({ entryPoints: [new URL('../src/simulator.worker.mjs', import.meta.url).pathname], outfile: new URL('simulator.worker.js', dist).pathname, bundle: true, format: 'esm', platform: 'browser', legalComments: 'eof' }),
]);
await Promise.all((await readdir(dist)).map((entry) => chmod(new URL(entry, dist), 0o644)));
