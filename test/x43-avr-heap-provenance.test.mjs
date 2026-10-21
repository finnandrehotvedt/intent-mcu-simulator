// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AVR_ALLOCATOR_ARCHIVE, AVR_ALLOCATOR_ARCHIVE_SHA256, AVR_ALLOCATOR_MEMBER,
  AVR_ALLOCATOR_MEMBER_SHA256, AVR_ALLOCATOR_SYMBOLS, createAvrAllocatorProvenance,
  normalizeAvrAllocatorProvenance,
} from '../compiler/avr-allocator-provenance.mjs';
import { BuildCoordinator } from '../compiler/build-coordinator.mjs';
import { BUILD_REQUEST_SCHEMA, sha256 } from '../compiler/build-protocol.mjs';

const ELF = 'a'.repeat(64);
const exactOwner = `${AVR_ALLOCATOR_ARCHIVE}(${AVR_ALLOCATOR_MEMBER})`;
const trace = (ownerFor = () => exactOwner) => AVR_ALLOCATOR_SYMBOLS
  .map((symbol) => `${ownerFor(symbol)}: definition of ${symbol}`).join('\n');

test('only the exact pinned archive member definition set creates supported provenance', () => {
  const supported = createAvrAllocatorProvenance({ linkerText: trace(), elfSha256: ELF,
    archiveSha256: AVR_ALLOCATOR_ARCHIVE_SHA256, memberSha256: AVR_ALLOCATOR_MEMBER_SHA256 });
  assert.equal(supported.state, 'supported');
  assert.deepEqual(supported.symbols, [...AVR_ALLOCATOR_SYMBOLS]);
  assert.equal(normalizeAvrAllocatorProvenance(supported, ELF).state, 'supported');

  const userOverride = createAvrAllocatorProvenance({
    linkerText: trace((symbol) => symbol === 'malloc' ? '/workspace/build/sketch/main.ino.cpp.o' : exactOwner),
    elfSha256: ELF, archiveSha256: AVR_ALLOCATOR_ARCHIVE_SHA256,
    memberSha256: AVR_ALLOCATOR_MEMBER_SHA256,
  });
  assert.equal(userOverride.state, 'unavailable');
  assert.equal(userOverride.reason, 'allocator-linker-definition-unproven');
  const duplicate = createAvrAllocatorProvenance({
    linkerText: `${trace()}\n/workspace/build/sketch/main.ino.cpp.o: definition of free`,
    elfSha256: ELF, archiveSha256: AVR_ALLOCATOR_ARCHIVE_SHA256,
    memberSha256: AVR_ALLOCATOR_MEMBER_SHA256,
  });
  assert.equal(duplicate.state, 'unavailable');
  assert.equal(createAvrAllocatorProvenance({ linkerText: trace(), elfSha256: ELF,
    archiveSha256: 'b'.repeat(64), memberSha256: AVR_ALLOCATOR_MEMBER_SHA256 }).reason,
  'allocator-toolchain-archive-untrusted');
});

test('missing, malformed, unknown allocator and cross-ELF metadata normalize unavailable', () => {
  assert.equal(normalizeAvrAllocatorProvenance(null, ELF).reason, 'allocator-provenance-missing');
  assert.equal(normalizeAvrAllocatorProvenance({ state: 'supported' }, ELF).reason,
    'allocator-provenance-untrusted');
  const supported = createAvrAllocatorProvenance({ linkerText: trace(), elfSha256: ELF,
    archiveSha256: AVR_ALLOCATOR_ARCHIVE_SHA256, memberSha256: AVR_ALLOCATOR_MEMBER_SHA256 });
  assert.equal(normalizeAvrAllocatorProvenance({ ...supported, allocator: 'unknown@1' }, ELF).reason,
    'allocator-provenance-untrusted');
  assert.equal(normalizeAvrAllocatorProvenance(supported, 'c'.repeat(64)).reason,
    'allocator-provenance-untrusted');
});

test('ordinary valid AVR build result stays succeeded when optional heap metadata is absent or malformed', async () => {
  const hex = ':00000001FF';
  const elfBase64 = Buffer.from('ordinary-compiler-elf').toString('base64');
  const elfSha256 = sha256(Buffer.from(elfBase64, 'base64'));
  const imageLock = { imageId: `sha256:${'d'.repeat(64)}`, toolchainManifestSha256: 'e'.repeat(64) };
  for (const allocatorProvenance of [undefined, { schema: 'hostile', state: 'supported' }]) {
    const artifact = { hex, hexSha256: sha256(hex), elfBase64, elfSha256,
      ...(allocatorProvenance === undefined ? {} : { allocatorProvenance }) };
    const coordinator = new BuildCoordinator({ broker: { async compile() {
      return { status: 'succeeded', code: 'BUILD_OK', artifact, diagnostics: [], text: '', isolation: {} };
    } }, imageLock, identityLockFor: () => imageLock });
    const claim = coordinator.submit(JSON.stringify({ schema: BUILD_REQUEST_SCHEMA,
      board: 'board.atmega328p-16mhz-v1', files: [{ name: 'main.ino', content: 'void setup(){} void loop(){}' }] }),
    '198.51.100.43');
    let status;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      status = coordinator.status(claim.jobId, claim.capability, '198.51.100.43');
      if (status.status !== 'building') break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(status.status, 'succeeded');
    assert.equal(status.result.artifact.allocatorProvenance.state, 'unavailable');
  }
});

test('async optional heap parsing rechecks current build and source identity before accepting', async () => {
  const source = await readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  assert.match(source, /await parseX43AvrHeapSymbols\([\s\S]+if \(!currentBuildBinding\(binding\) \|\| buildInputIdentity\(\) !== inputAtSubmit\) return;[\s\S]+type: 'build\.succeeded'/u);
});
