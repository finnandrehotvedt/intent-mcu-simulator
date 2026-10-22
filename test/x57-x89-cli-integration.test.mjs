// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFile, cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../', import.meta.url).pathname;

test('X57 to X89 actual-file CLI journey exports, reopens and remains local-only', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'intent-mcu-x57-x89-'));
  const checkout = path.join(output, 'checkout');
  await mkdir(path.join(checkout, 'examples/contribution-review'), { recursive: true });
  await mkdir(path.join(checkout, 'src'), { recursive: true });
  for (const file of ['examples/contribution-review/simulated-thermistor-model.mjs',
    'examples/contribution-review/conformance-fixture.json', 'src/contribution-review.mjs',
    'src/contribution-conformance-suite.mjs']) {
    await cp(path.join(root, file), path.join(checkout, file));
  }
  const reportPath = path.join(output, 'contribution-report.json');
  const checked = await run(process.execPath, ['tools/contribution-review.mjs', 'check',
    '--manifest', 'examples/contribution-review/manifest.json', '--checkout', checkout, '--out', reportPath],
  { cwd: root });
  assert.match(checked.stdout, /^checked [a-f0-9]{64} 1 files/u);
  const reviewed = await run(process.execPath, ['tools/contribution-review.mjs', 'review',
    '--report', reportPath, '--checkout', checkout, '--reviewer', 'integrated-trusted-review',
    '--confirm-changedPaths', '--confirm-models', '--confirm-pins', '--confirm-parameters', '--confirm-versions'], { cwd: root });
  assert.match(reviewed.stdout, /^reviewed [a-f0-9]{64} integrated-trusted-review/u);
  const conformed = await run(process.execPath, ['tools/contribution-review.mjs', 'conform',
    '--report', reportPath, '--checkout', checkout], { cwd: root });
  assert.match(conformed.stdout, /^conformant [a-f0-9]{64} [a-f0-9]{64}/u);
  const checkedReport = JSON.parse(await readFile(reportPath, 'utf8'));
  const conformanceRecord = JSON.parse(await readFile(path.join(checkout, '.intent-mcu/trusted-contribution-evidence',
    `${checkedReport.candidateSha256}.conformance.json`), 'utf8'));
  assert.deepEqual(conformanceRecord.results.map(({ testId, tests, passed, failed, result }) => (
    { testId, tests, passed, failed, result }
  )), checkedReport.manifest.requiredTests.map((testId) => ({
    testId, tests: testId === 'model-library' ? 13 : testId === 'component-support-matrix' ? 5 : 2,
    passed: testId === 'model-library' ? 13 : testId === 'component-support-matrix' ? 5 : 2,
    failed: 0, result: 'passed',
  })));
  assert(conformanceRecord.results.every((result) => /^[a-f0-9]{64}$/u.test(result.testSourceSha256)
    && /^[a-f0-9]{64}$/u.test(result.outputSha256)));
  const admissionPath = path.join(output, 'admission.json');
  const admitted = await run(process.execPath, ['tools/contribution-review.mjs', 'admit',
    '--report', reportPath, '--checkout', checkout, '--out', admissionPath],
  { cwd: root });
  assert.match(admitted.stdout, /^admitted /u);
  assert.equal(JSON.parse(await readFile(admissionPath, 'utf8')).authority.execute, false);
  await appendFile(path.join(checkout, 'examples/contribution-review/simulated-thermistor-model.mjs'), ' ');
  await assert.rejects(run(process.execPath, ['tools/contribution-review.mjs', 'admit',
    '--report', reportPath, '--checkout', checkout, '--out', path.join(output, 'stale-admission.json')], { cwd: root }),
  (error) => error.code === 1 && /CONTRIBUTION_REPORT_STALE/u.test(error.stderr));

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
