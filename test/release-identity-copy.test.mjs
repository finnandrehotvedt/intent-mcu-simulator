// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PRODUCT_VERSION } from '../src/capability-discovery.mjs';
import { RELEASE_VERSION } from '../src/release-metadata.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('one release authority matches package capability and dynamic OCI projection', async () => {
  const [release, packageValue, lockValue, dockerfile] = await Promise.all([
    readJson('../release.json'), readJson('../package.json'), readJson('../package-lock.json'),
    readFile(new URL('../Dockerfile.production', import.meta.url), 'utf8'),
  ]);
  assert.deepEqual(Object.keys(release).sort(), ['schema', 'version']);
  assert.equal(release.schema, 'intent-mcu-release@1');
  assert.equal(release.version, '1.1.0-rc.111');
  assert.equal(RELEASE_VERSION, release.version);
  assert.equal(PRODUCT_VERSION, release.version);
  assert.equal(packageValue.version, release.version);
  assert.equal(lockValue.version, release.version);
  assert.equal(lockValue.packages[''].version, release.version);
  assert.match(dockerfile, /ARG RELEASE_VERSION/u);
  assert.match(dockerfile, /org\.opencontainers\.image\.version="\$\{RELEASE_VERSION\}"/u);
  assert.doesNotMatch(dockerfile, /org\.opencontainers\.image\.version="1\.1\.0-rc\./u);
});

test('footer, four-case helper and exact seed accessibility are coherent without semantic changes', async () => {
  const [html, main, suite] = await Promise.all([
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8'),
    import('../src/seeded-property-suite.mjs'),
  ]);
  assert.match(html, /id="release-version"/u);
  assert.doesNotMatch(html, /1\.1\.0-rc\.4[145] public release/u);
  assert.match(main, /releaseversion\.textContent = RELEASE_VERSION/u);
  assert.match(html, /Run 4 boundary tests/u);
  assert.match(main, /four boundary scenarios/u);
  assert.match(main, /current authored timeline or the four fixed boundary scenarios/u);
  assert.doesNotMatch(main, /Build it fresh, then run the same \$\{THERMOSTAT_SCENARIOS\.scenarios\.length\} scenarios/u);
  assert.doesNotMatch(main, /three boundary scenarios/u);
  assert.match(html, /value="305419896" aria-describedby="seeded-property-exact-value"/u);
  assert.match(html, /Exact seed value: 305419896/u);
  assert.equal(suite.seededPropertySuite(305419896).seed, 305419896);
  assert.match(html, /separate bounded AVR USART0 response fixture covers one declared response fault/u);
  assert.match(html, /not a generic bus, named device, I2C\/TWI, SPI/u);
  assert.match(html, /The reviewed X23 report is transient/u);
  assert.doesNotMatch(html, /Transient private evidence only/u);
  assert.match(html, /two independently reviewed producer reports/u);
  assert.match(main, /Independently reviewed reports: 8 passed \/ 8 completed/u);
  assert.doesNotMatch(html, /completed private producer reports/u);
  assert.match(html, /Compiled AVR runtime state — independently reviewed/u);
  assert.match(html, /The independently reviewed X33 report is transient/u);
  assert.doesNotMatch(html, /Compiled AVR runtime state — private proof/u);
  assert.match(html, /Failure location — independently reviewed/u);
  assert.match(html, /Reviewed historical observation/u);
  assert.match(html, /This independently reviewed X39 locator is transient/u);
  assert.doesNotMatch(html, />Failure location<\/h3>/u);
  assert.match(html, /X40 · INDEPENDENTLY REVIEWED CURRENT PRODUCER EVIDENCE/u);
  assert.match(html, /Shared event timeline — independently reviewed/u);
  assert.match(html, /This independently reviewed X40 projection is transient current-worker evidence only/u);
  assert.doesNotMatch(html, /X40 · CURRENT PRODUCER EVIDENCE/u);
});
