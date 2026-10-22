// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../', import.meta.url).pathname;

test('X57 to X89 actual-file CLI journey exports, reopens and remains local-only', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'intent-mcu-x57-x89-'));
  const reportPath = path.join(output, 'contribution-report.json');
  const checked = await run(process.execPath, ['tools/contribution-review.mjs', 'check',
    '--manifest', 'examples/contribution-review/manifest.json', '--checkout', '.', '--out', reportPath],
  { cwd: root });
  assert.match(checked.stdout, /^checked [a-f0-9]{64} 1 files/u);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const reviewPath = path.join(output, 'source-review.json');
  const conformancePath = path.join(output, 'conformance.json');
  await writeFile(reviewPath, JSON.stringify({ schema: 'intent-mcu-source-review@1',
    candidateSha256: report.candidateSha256, reviewer: 'integrated-trusted-review', result: 'accepted' }));
  await writeFile(conformancePath, JSON.stringify({ schema: 'intent-mcu-conformance-result@1',
    candidateSha256: report.candidateSha256, fixtureIdentity: report.manifest.fixtureIdentity,
    suite: 'project-owned-x57-v1', result: 'passed' }));
  const admissionPath = path.join(output, 'admission.json');
  const admitted = await run(process.execPath, ['tools/contribution-review.mjs', 'admit',
    '--report', reportPath, '--review', reviewPath, '--conformance', conformancePath, '--out', admissionPath],
  { cwd: root });
  assert.match(admitted.stdout, /^admitted /u);
  assert.equal(JSON.parse(await readFile(admissionPath, 'utf8')).authority.execute, false);

  const readinessPath = path.join(output, 'readiness.json');
  await assert.rejects(run(process.execPath, ['tools/local-readiness.mjs', 'assess', '--checkout', '.',
    '--fixture', 'examples/local-readiness/incomplete.fixture.json', '--out', readinessPath], { cwd: root }),
  (error) => error.code === 2 && /LOCAL_LOCK_MISSING:avr/u.test(error.stdout));
  const readiness = JSON.parse(await readFile(readinessPath, 'utf8'));
  assert.equal(readiness.status.configurationAssessed, 'blocked');
  assert.equal(readiness.status.serviceHealthy, 'not-checked');
  assert.equal(readiness.boundaries.secretsCollected, false);
  const reopened = await run(process.execPath, ['tools/local-readiness.mjs', 'reopen', '--checkout', '.',
    '--fixture', 'examples/local-readiness/incomplete.fixture.json', '--report', readinessPath], { cwd: root });
  assert.match(reopened.stdout, /^current [a-f0-9]{64}/u);
});
