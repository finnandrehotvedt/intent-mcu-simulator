// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const HASH = /^[0-9a-f]{64}$/u;

export async function persistX37CompilerArtifact({ evidenceDirectory, participantId, artifact, buildRecord }) {
  if (typeof evidenceDirectory !== 'string' || !evidenceDirectory.startsWith('/')
      || !['avr', 'rp'].includes(participantId) || !artifact || !buildRecord) {
    fail('X37_ARTIFACT_EVIDENCE_CONFIGURATION');
  }
  if (![buildRecord.requestSha256, buildRecord.sourceSha256,
    buildRecord.toolchainManifestSha256].every((value) => HASH.test(value ?? ''))
      || !/^sha256:[0-9a-f]{64}$/u.test(buildRecord.imageId ?? '')) {
    fail('X37_ARTIFACT_EVIDENCE_CONFIGURATION');
  }
  const format = participantId === 'avr' ? 'intel-hex' : 'uf2';
  const bytes = participantId === 'avr' ? Buffer.from(artifact.hex ?? '', 'utf8')
    : Buffer.from(artifact.uf2?.base64 ?? '', 'base64');
  const expectedSha256 = participantId === 'avr' ? artifact.hexSha256 : artifact.uf2?.sha256;
  if (!bytes.length || bytes.length > 2_000_000 || !HASH.test(expectedSha256 ?? '')
      || sha256(bytes) !== expectedSha256) fail('X37_ARTIFACT_EVIDENCE_IDENTITY');
  const bytesPath = `${evidenceDirectory}/${participantId}.firmware.bin`;
  const metadataPath = `${evidenceDirectory}/${participantId}.firmware.json`;
  const metadata = { schema: 'intent-mcu-x37-private-artifact-evidence@1', participantId,
    format, bytes: bytes.length, sha256: expectedSha256,
    requestSha256: buildRecord.requestSha256, sourceSha256: buildRecord.sourceSha256,
    imageId: buildRecord.imageId, toolchainManifestSha256: buildRecord.toolchainManifestSha256 };
  await writeFile(bytesPath, bytes, { flag: 'wx', mode: 0o600 });
  await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, { flag: 'wx', mode: 0o600 });
  await Promise.all([chmod(bytesPath, 0o600), chmod(metadataPath, 0o600)]);
  const [readback, metadataReadback] = await Promise.all([readFile(bytesPath), readFile(metadataPath, 'utf8')]);
  if (sha256(readback) !== expectedSha256 || JSON.stringify(JSON.parse(metadataReadback)) !== JSON.stringify(metadata)) {
    fail('X37_ARTIFACT_EVIDENCE_READBACK');
  }
  return { bytesPath, metadataPath, bytes: bytes.length, sha256: expectedSha256, mode: '0600' };
}
