// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const releaseUrl = new URL('release.json', root);
const packageUrl = new URL('package.json', root);
const lockUrl = new URL('package-lock.json', root);
const moduleUrl = new URL('src/release-metadata.mjs', root);
const release = JSON.parse(await readFile(releaseUrl, 'utf8'));
const exactKeys = Object.keys(release).sort().join('|') === 'schema|version';
if (!exactKeys || release.schema !== 'intent-mcu-release@1'
    || !/^1\.1\.0-rc\.[1-9][0-9]*$/u.test(release.version)) throw new Error('RELEASE_METADATA_INVALID');

const generated = `// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
// Generated projection of release.json by scripts/sync-release-version.mjs.

export const RELEASE_VERSION = '${release.version}';
`;
const packageValue = JSON.parse(await readFile(packageUrl, 'utf8'));
const lockValue = JSON.parse(await readFile(lockUrl, 'utf8'));

if (process.argv[2] === '--write') {
  packageValue.version = release.version;
  lockValue.version = release.version;
  lockValue.packages[''].version = release.version;
  await Promise.all([
    writeFile(packageUrl, `${JSON.stringify(packageValue, null, 2)}\n`),
    writeFile(lockUrl, `${JSON.stringify(lockValue, null, 2)}\n`),
    writeFile(moduleUrl, generated),
  ]);
} else {
  const currentModule = await readFile(moduleUrl, 'utf8');
  if (packageValue.version !== release.version || lockValue.version !== release.version
      || lockValue.packages?.['']?.version !== release.version || currentModule !== generated) {
    throw new Error('RELEASE_PROJECTION_MISMATCH: run npm run release:sync');
  }
}
