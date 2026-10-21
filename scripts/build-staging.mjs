// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import {
  canonicalReleaseChangesText,
  parseReleaseChangeRegistryText,
  parseReleaseChangesText,
} from '../src/release-changes.mjs';
import {
  OFFLINE_SUPPORT_MATRIX,
  canonicalOfflineSupportMatrixText,
  offlineSupportMatrixHtml,
} from '../src/offline-support-matrix.mjs';
import { RELEASE_VERSION } from '../src/release-metadata.mjs';

const dist = new URL('../dist/', import.meta.url);
const [releaseChangesSource, releaseChangeRegistrySource, releaseChangesModuleSource] = await Promise.all([
  readFile(new URL('../release-changes.source.json', import.meta.url), 'utf8'),
  readFile(new URL('../release-change-registry.json', import.meta.url), 'utf8'),
  readFile(new URL('../src/release-changes.mjs', import.meta.url), 'utf8'),
]);
const registry = parseReleaseChangeRegistryText(releaseChangeRegistrySource);
const implementationSha256 = createHash('sha256').update(releaseChangesModuleSource).digest('hex');
const releaseChanges = parseReleaseChangesText(releaseChangesSource, {
  currentVersion: RELEASE_VERSION, implementationSha256, registry,
});
const releaseChangesText = canonicalReleaseChangesText(releaseChanges, {
  currentVersion: RELEASE_VERSION, implementationSha256, registry,
});
const offlineSupportMatrixText = canonicalOfflineSupportMatrixText(OFFLINE_SUPPORT_MATRIX);
const supportSource = await readFile(new URL('../staging/support.html', import.meta.url), 'utf8');
const supportToken = '<!-- X86_OFFLINE_SUPPORT_MATRIX -->';
if (supportSource.split(supportToken).length !== 2) throw new Error('OFFLINE_SUPPORT_MATRIX_TOKEN');
const supportHtml = supportSource.replace(supportToken, offlineSupportMatrixHtml(OFFLINE_SUPPORT_MATRIX));
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
  cp(new URL('../staging/controllers.html', import.meta.url), new URL('controllers.html', dist)),
  cp(new URL('../staging/components.html', import.meta.url), new URL('components.html', dist)),
  cp(new URL('../staging/examples.html', import.meta.url), new URL('examples.html', dist)),
  writeFile(new URL('support.html', dist), supportHtml),
  cp(new URL('../staging/physical-checklist.html', import.meta.url), new URL('physical-checklist.html', dist)),
  writeFile(new URL('release-changes.json', dist), releaseChangesText),
  writeFile(new URL('offline-support-matrix.json', dist), offlineSupportMatrixText),
  build({ entryPoints: [new URL('../staging/main.mjs', import.meta.url).pathname], outfile: new URL('main.js', dist).pathname, bundle: true, format: 'esm', platform: 'browser', minifyWhitespace: true, legalComments: 'eof' }),
  build({ entryPoints: [new URL('../staging/physical-checklist-page.mjs', import.meta.url).pathname], outfile: new URL('physical-checklist.js', dist).pathname, bundle: true, format: 'esm', platform: 'browser', minifyWhitespace: true, legalComments: 'eof' }),
  build({ entryPoints: [new URL('../src/simulator.worker.mjs', import.meta.url).pathname], outfile: new URL('simulator.worker.js', dist).pathname, bundle: true, format: 'esm', platform: 'browser', minifyWhitespace: true, legalComments: 'eof' }),
  build({ entryPoints: [new URL('../src/x49-private.worker.mjs', import.meta.url).pathname], outfile: new URL('x49-offset.worker.js', dist).pathname, bundle: true, format: 'esm', platform: 'browser', minifyWhitespace: true, legalComments: 'eof' }),
]);
await Promise.all((await readdir(dist)).map((entry) => chmod(new URL(entry, dist), 0o644)));
