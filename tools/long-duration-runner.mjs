// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { writeFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { buildInputIdentity, normalizeBuildRequestValue, sha256 } from '../compiler/build-protocol.mjs';
import { DockerBuildBroker, loadImageLock } from '../compiler/docker-broker.mjs';
import { executeLongDurationSuite, longDurationReportPassed } from '../src/long-duration-runner.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const output = option('--output');
const imageLock = await loadImageLock();
const broker = new DockerBuildBroker({ imageLock, deadlineMs: 30_000 });

const report = await executeLongDurationSuite({ compile: async (source) => {
  const request = normalizeBuildRequestValue({
    schema: 'teach-lab-build-request@1', board: 'board.atmega328p-16mhz-v1',
    files: [{ name: 'main.ino', content: source }],
  });
  const result = await broker.compile(request);
  if (result.status !== 'succeeded') throw Object.assign(new Error(result.code), { code: result.code });
  const inputIdentity = buildInputIdentity(request, imageLock);
  return {
    hex: result.artifact.hex,
    artifactSha256: sha256(JSON.stringify({ inputIdentity,
      hexSha256: result.artifact.hexSha256, elfSha256: result.artifact.elfSha256 })),
  };
} });

const text = `${JSON.stringify(report, null, 2)}\n`;
if (output) await writeFile(output, text, { encoding: 'utf8', mode: 0o600 });
process.stdout.write(text);
if (!longDurationReportPassed(report)) process.exitCode = 1;
