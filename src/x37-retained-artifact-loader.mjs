// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export async function loadX37RetainedArtifact({ evidenceDirectory, participantId,
  expected, expectedBytes, expectedSha256 }) {
  if (typeof evidenceDirectory !== 'string' || !evidenceDirectory.startsWith('/')
      || !['avr', 'rp'].includes(participantId) || !expected
      || !Number.isSafeInteger(expectedBytes) || expectedBytes < 1
      || typeof expectedSha256 !== 'string') fail('X37_RETAINED_ARTIFACT_CONFIGURATION');
  const bytesPath = `${evidenceDirectory}/${participantId}.firmware.bin`;
  const metadataPath = `${evidenceDirectory}/${participantId}.firmware.json`;
  const [bytes, metadataText, bytesStat, metadataStat] = await Promise.all([
    readFile(bytesPath), readFile(metadataPath, 'utf8'), stat(bytesPath), stat(metadataPath),
  ]);
  const metadata = JSON.parse(metadataText);
  if ((bytesStat.mode & 0o777) !== 0o600 || (metadataStat.mode & 0o777) !== 0o600
      || metadata.schema !== 'intent-mcu-x37-private-artifact-evidence@1'
      || metadata.participantId !== participantId || metadata.bytes !== bytes.length
      || bytes.length !== expectedBytes || metadata.sha256 !== sha256(bytes)
      || metadata.sha256 !== expectedSha256
      || ['requestSha256', 'sourceSha256', 'imageId', 'toolchainManifestSha256']
        .some((key) => metadata[key] !== expected[key])) fail('X37_RETAINED_ARTIFACT_IDENTITY');
  return participantId === 'avr'
    ? { hex: bytes.toString('utf8'), hexSha256: metadata.sha256 }
    : { uf2: { base64: bytes.toString('base64'), sha256: metadata.sha256 } };
}

export async function loadX37RetainedArtifacts({ evidenceDirectory, expected, expectedBytes, expectedSha256 }) {
  if (typeof evidenceDirectory !== 'string' || !evidenceDirectory.startsWith('/')
      || !expected || Object.keys(expected).sort().join(',') !== 'avr,rp'
      || !expectedBytes || !expectedSha256) fail('X37_RETAINED_ARTIFACT_CONFIGURATION');
  const result = {};
  for (const participantId of ['avr', 'rp']) {
    result[participantId] = await loadX37RetainedArtifact({ evidenceDirectory, participantId,
      expected: expected[participantId], expectedBytes: expectedBytes[participantId],
      expectedSha256: expectedSha256[participantId] });
  }
  return result;
}
