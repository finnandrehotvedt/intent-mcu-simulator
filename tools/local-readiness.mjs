#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assessLocalReadiness, canonicalLocalReadinessReport, reopenLocalReadinessReport } from '../src/local-readiness-assessor.mjs';

const [command, ...args] = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const required = (name) => option(name) || (() => { throw new Error(`MISSING_${name.slice(2).toUpperCase()}`); })();

try {
  const checkout = resolve(option('--checkout') || '.');
  const fixture = await readFile(resolve(required('--fixture')), 'utf8');
  if (command === 'assess') {
    const report = await assessLocalReadiness(checkout, fixture);
    await writeFile(resolve(required('--out')), canonicalLocalReadinessReport(report), { flag: 'wx' });
    process.stdout.write(`${report.status.configurationAssessed} ${report.configurationSha256}${report.blockers.length ? ` ${report.blockers.join(',')}` : ''}\n`);
    if (report.blockers.length) process.exitCode = 2;
  } else if (command === 'reopen') {
    const result = await reopenLocalReadinessReport(await readFile(resolve(required('--report')), 'utf8'), checkout, fixture);
    process.stdout.write(`${result.sameConfiguration ? 'current' : 'stale'} ${result.currentConfigurationSha256}\n`);
    if (!result.sameConfiguration) process.exitCode = 2;
  } else throw new Error('USAGE: local-readiness.mjs assess|reopen with fixed file options');
} catch (error) {
  process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1;
}
