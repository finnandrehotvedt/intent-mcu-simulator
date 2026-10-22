#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assessContributionAdmission, canonicalContributionReport, checkContributionManifest } from '../src/contribution-review.mjs';
import { parseStrictJson } from '../src/strict-json.mjs';

const [command, ...args] = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const required = (name) => option(name) || (() => { throw new Error(`MISSING_${name.slice(2).toUpperCase()}`); })();

try {
  if (command === 'check') {
    const manifestPath = resolve(required('--manifest'));
    const checkout = resolve(option('--checkout') || '.');
    const output = resolve(required('--out'));
    const report = await checkContributionManifest(await readFile(manifestPath, 'utf8'), checkout);
    await writeFile(output, canonicalContributionReport(report), { flag: 'wx' });
    process.stdout.write(`checked ${report.candidateSha256} ${report.files.length} files\n`);
  } else if (command === 'admit') {
    const report = parseStrictJson(await readFile(resolve(required('--report')), 'utf8'));
    const admission = assessContributionAdmission(report,
      await readFile(resolve(required('--review')), 'utf8'),
      await readFile(resolve(required('--conformance')), 'utf8'));
    await writeFile(resolve(required('--out')), `${JSON.stringify(admission, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`${admission.admitted ? 'admitted' : 'blocked'} ${admission.candidateSha256}${admission.blockers.length ? ` ${admission.blockers.join(',')}` : ''}\n`);
    if (!admission.admitted) process.exitCode = 2;
  } else {
    throw new Error('USAGE: contribution-review.mjs check|admit with fixed file options');
  }
} catch (error) {
  process.stderr.write(`${error.code || error.message}\n`);
  process.exitCode = 1;
}
