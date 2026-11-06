// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseStrictJson } from '../src/strict-json.mjs';
import {
  VISUINO_PRIVATE_MOUNT_PATH,
  VISUINO_WATER_TANK_MANIFEST_CONTRACT,
  VISUINO_WATER_TANK_MANIFEST_SHA256,
  VISUINO_WATER_TANK_POLICY_ID,
} from './visuino-private-policy.mjs';

const HASH = /^[0-9a-f]{64}$/u;
const SAFE_FILE = /^Mitov\/(?:library\.properties|src\/[A-Za-z0-9][A-Za-z0-9_.+/-]{0,239})$/u;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function decodedMountPoint(value) {
  return value.replace(/\\040/g, ' ').replace(/\\011/g, '\t').replace(/\\012/g, '\n').replace(/\\134/g, '\\');
}

async function mountIsReadOnly(mountPath) {
  const mountInfo = await readFile('/proc/self/mountinfo', 'utf8');
  return mountInfo.split('\n').some((line) => {
    const fields = line.split(' ');
    return fields.length > 6 && decodedMountPoint(fields[4]) === mountPath
      && fields[5].split(',').includes('ro');
  });
}

async function inventory(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  const directories = [];
  for (const entry of entries) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail('PRIVATE_DEPENDENCY_SYMLINK_REJECTED');
    if (entry.isDirectory()) {
      directories.push(name);
      const nested = await inventory(root, name);
      files.push(...nested.files);
      directories.push(...nested.directories);
    } else if (entry.isFile()) files.push(name);
    else fail('PRIVATE_DEPENDENCY_FILE_TYPE_REJECTED');
  }
  return { files, directories };
}

export async function verifyVisuinoPrivateDependency({
  policyId,
  mountPath = VISUINO_PRIVATE_MOUNT_PATH,
} = {}) {
  if (policyId !== VISUINO_WATER_TANK_POLICY_ID || mountPath !== VISUINO_PRIVATE_MOUNT_PATH) {
    fail('PRIVATE_DEPENDENCY_POLICY_REJECTED');
  }
  let raw;
  try { raw = await readFile(`${mountPath}/MANIFEST.json`); }
  catch { fail('PRIVATE_DEPENDENCY_UNAVAILABLE'); }
  if (raw.byteLength > 512 * 1024 || sha256(raw) !== VISUINO_WATER_TANK_MANIFEST_SHA256) {
    fail('PRIVATE_DEPENDENCY_MANIFEST_MISMATCH');
  }
  let manifest;
  try { manifest = parseStrictJson(raw.toString('utf8'), 512 * 1024); }
  catch { fail('PRIVATE_DEPENDENCY_MANIFEST_INVALID'); }
  const contract = VISUINO_WATER_TANK_MANIFEST_CONTRACT;
  if (!exactKeys(manifest, ['purpose', 'library', 'version', 'files'])
      || manifest.purpose !== contract.purpose || manifest.library !== contract.library
      || manifest.version !== contract.version || !Array.isArray(manifest.files)
      || manifest.files.length !== contract.files) fail('PRIVATE_DEPENDENCY_MANIFEST_INVALID');

  const expectedFiles = new Set(['MANIFEST.json']);
  const expectedDirectories = new Set(['Mitov']);
  for (const item of manifest.files) {
    if (!exactKeys(item, ['path', 'bytes', 'sha256']) || typeof item.path !== 'string'
        || !SAFE_FILE.test(item.path) || item.path !== path.posix.normalize(item.path)
        || item.path.split('/').some((segment) => segment === '.' || segment === '..')
        || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > 2 * 1024 * 1024
        || !HASH.test(item.sha256) || expectedFiles.has(item.path)) {
      fail('PRIVATE_DEPENDENCY_MANIFEST_INVALID');
    }
    expectedFiles.add(item.path);
    const parts = item.path.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      expectedDirectories.add(parts.slice(0, index).join('/'));
    }
  }

  const actual = await inventory(mountPath);
  const sorted = (values) => [...values].sort();
  if (JSON.stringify(sorted(actual.files)) !== JSON.stringify(sorted(expectedFiles))
      || JSON.stringify(sorted(actual.directories)) !== JSON.stringify(sorted(expectedDirectories))) {
    fail('PRIVATE_DEPENDENCY_TREE_MISMATCH');
  }
  for (const item of manifest.files) {
    const bytes = await readFile(path.join(mountPath, item.path));
    if (bytes.byteLength !== item.bytes || sha256(bytes) !== item.sha256) {
      fail('PRIVATE_DEPENDENCY_FILE_MISMATCH');
    }
  }
  if (!await mountIsReadOnly(mountPath)) fail('PRIVATE_DEPENDENCY_MOUNT_NOT_READ_ONLY');
  return Object.freeze({
    policyId,
    manifestSha256: VISUINO_WATER_TANK_MANIFEST_SHA256,
    library: manifest.library,
    version: manifest.version,
    files: manifest.files.length,
    mountReadOnly: true,
  });
}
