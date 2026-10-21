// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { createThermostatExperiment } from '../src/thermostat-experiment.mjs';
import { AVR_PROFILE } from '../src/compile-targets.mjs';
import {
  captureX49PublicAuthority,
  expectedX49BuildInputIdentity,
  prepareX49PublicBuild,
  X49_PUBLIC_TOOLCHAIN_IDENTITY,
  X49_PUBLIC_TOOLCHAIN_IMAGE,
} from '../src/x49-public-run-contract.mjs';

export const hash = (value) => createHash('sha256').update(value).digest('hex');

export function x49PublicState() {
  return {
    compilerTarget: AVR_PROFILE,
    compileAvailable: true,
    revision: 7,
    lifecycle: { phase: 'dirty', projectGeneration: 9 },
    buildState: 'dirty',
    project: createThermostatExperiment().project,
  };
}

export async function x49ProbeElf() {
  const target = 'intent_x49_probe_v1'; const encoder = new TextEncoder();
  const records = [{ name: target, value: 0x800100, size: 4, bind: 1, type: 1, section: 1 }];
  const names = ['', target]; const strings = encoder.encode(`${names.join('\0')}\0`);
  const offsets = new Map(); let cursor = 0;
  for (const name of names) { offsets.set(name, cursor); cursor += encoder.encode(name).length + 1; }
  const sectionStart = 52; const stringStart = sectionStart + 4 * 40;
  const symbolStart = stringStart + strings.length; const bytes = new Uint8Array(symbolStart + 32);
  const view = new DataView(bytes.buffer); bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]);
  view.setUint16(18, 83, true); view.setUint32(32, sectionStart, true);
  view.setUint16(46, 40, true); view.setUint16(48, 4, true);
  const section = (index, type, address, offset, size, link = 0, entryBytes = 0) => {
    const base = sectionStart + index * 40; view.setUint32(base + 4, type, true);
    view.setUint32(base + 12, address, true); view.setUint32(base + 16, offset, true);
    view.setUint32(base + 20, size, true); view.setUint32(base + 24, link, true);
    view.setUint32(base + 36, entryBytes, true);
  };
  section(1, 1, 0x800000, 0, 0x2000); section(2, 3, 0, stringStart, strings.length);
  section(3, 2, 0, symbolStart, 32, 2, 16); bytes.set(strings, stringStart);
  const base = symbolStart + 16; view.setUint32(base, offsets.get(target), true);
  view.setUint32(base + 4, records[0].value, true); view.setUint32(base + 8, 4, true);
  view.setUint8(base + 12, 0x11); view.setUint16(base + 14, 1, true);
  return { elfBase64: Buffer.from(bytes).toString('base64'), elfSha256: hash(bytes) };
}

export async function x49ExpectedBuildInputIdentity() {
  const authority = await captureX49PublicAuthority(x49PublicState());
  return expectedX49BuildInputIdentity(await prepareX49PublicBuild(authority));
}

export async function x49BuildResult(inputIdentity = null) {
  const effectiveInputIdentity = inputIdentity ?? await x49ExpectedBuildInputIdentity();
  const hex = ':00000001FF'; const elf = await x49ProbeElf();
  const artifact = { hex, hexSha256: hash(hex), ...elf };
  const artifactIdentity = hash(JSON.stringify({ inputIdentity: effectiveInputIdentity,
    hexSha256: artifact.hexSha256, elfSha256: artifact.elfSha256 }));
  return {
    code: 'BUILD_OK', inputIdentity: effectiveInputIdentity, artifactIdentity, artifact,
    toolchainImageId: X49_PUBLIC_TOOLCHAIN_IMAGE,
    toolchainIdentitySha256: X49_PUBLIC_TOOLCHAIN_IDENTITY,
  };
}
