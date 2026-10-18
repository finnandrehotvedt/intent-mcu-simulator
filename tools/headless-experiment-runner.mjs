#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { lstat, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PROJECT_ENVELOPE_LIMIT } from '../src/project-envelope.mjs';
import { runSavedHeadlessExperiment } from '../src/headless-experiment-runner.mjs';

export async function runHeadlessExperimentCli(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || typeof argv[0] !== 'string' || !argv[0]) {
    throw Object.assign(new Error('Usage: headless-experiment-runner.mjs <saved-project.intent-mcu.json>'), {
      code: 'HEADLESS_FILE_ARGUMENT_REQUIRED',
    });
  }
  const status = await lstat(argv[0]);
  if (!status.isFile() || status.isSymbolicLink() || status.size > PROJECT_ENVELOPE_LIMIT) {
    throw Object.assign(new Error('HEADLESS_FILE_INVALID'), { code: 'HEADLESS_FILE_INVALID' });
  }
  const projectText = await readFile(argv[0], 'utf8');
  const result = await runSavedHeadlessExperiment(projectText);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok || result.status === 'failed') process.exitCode = result.ok ? 2 : 1;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runHeadlessExperimentCli().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error.code ?? error.message ?? 'HEADLESS_CLI_FAILED' })}\n`);
    process.exitCode = 1;
  });
}
