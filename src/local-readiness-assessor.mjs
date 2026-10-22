// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const LOCAL_READINESS_FIXTURE_SCHEMA = 'intent-mcu-local-readiness-fixture@1';
export const LOCAL_READINESS_REPORT_SCHEMA = 'intent-mcu-local-readiness-report@1';
const FIXTURE_KEYS = ['schema', 'runtime', 'installedImages'];
const IMAGE_KEYS = ['avr', 'rp2040', 'stm32Builder', 'stm32Runtime'];
const HASH = /^sha256:[a-f0-9]{64}$/u;
const FILES = Object.freeze({
  compose: 'compose.yaml', package: 'package.json', broker: 'compiler/docker-broker.mjs',
  avr: 'compiler/local-image-lock.json', rp2040: 'compiler/local-rp2040-image-lock.json',
  stm32Builder: 'stm32/builder-image-lock.json', stm32Runtime: 'stm32/runtime-image-lock.json',
});
const fail = (code, details = []) => { throw Object.assign(new Error(code), { code, details }); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;

function parseFixture(source) {
  const value = parseStrictJson(source, 16 * 1024);
  if (!exactKeys(value, FIXTURE_KEYS) || value.schema !== LOCAL_READINESS_FIXTURE_SCHEMA
      || !['docker-available', 'runtime-missing'].includes(value.runtime)
      || !exactKeys(value.installedImages, IMAGE_KEYS)) fail('LOCAL_READINESS_FIXTURE_INVALID');
  for (const entry of Object.values(value.installedImages)) {
    if (entry !== null && !HASH.test(entry)) fail('LOCAL_READINESS_IMAGE_ID_INVALID');
  }
  return value;
}

function inspectCompose(source) {
  const local = source.match(/\n  local-compiler:\n([\s\S]*)$/u)?.[1] || '';
  const value = (expression) => expression.test(local);
  const host = /STAGING_HOST:\s*([^\n]+)/u.exec(local)?.[1]?.replaceAll('"', '').trim() || null;
  return {
    profile: value(/profiles:\s*\["local-compiler"\]/u),
    loopbackOnly: host === '127.0.0.1', host,
    readOnly: value(/\n    read_only:\s*true/u), restartDisabled: value(/\n    restart:\s*"no"/u),
    dockerSocketReadOnly: value(/\/var\/run\/docker\.sock:\/var\/run\/docker\.sock:ro/u),
    gatewayLimits: {
      cpus: /\n    cpus:\s*2\.0/u.test(local) ? 2 : null,
      memoryMiB: /\n    mem_limit:\s*512m/u.test(local) ? 512 : null,
      pids: /\n    pids_limit:\s*128/u.test(local) ? 128 : null,
    },
    lockBindings: {
      avr: /COMPILER_IMAGE_LOCK:\s*\/workspace\/compiler\/local-image-lock\.json/u.test(local),
      rp2040: /RP2040_COMPILER_IMAGE_LOCK:\s*\/workspace\/compiler\/local-rp2040-image-lock\.json/u.test(local),
      stm32Builder: /STM32_BUILDER_IMAGE_LOCK:\s*\/workspace\/stm32\/builder-image-lock\.json/u.test(local),
      stm32Runtime: /STM32_RUNTIME_IMAGE_LOCK:\s*\/workspace\/stm32\/runtime-image-lock\.json/u.test(local),
    },
  };
}

function inspectBroker(source) {
  return {
    networkNone: source.includes("'--network', 'none'"), readOnly: source.includes("'--read-only'"),
    noPrivileges: source.includes("'no-new-privileges:true'"), capabilitiesDropped: source.includes("'--cap-drop', 'ALL'"),
    pids: source.includes("'--pids-limit', '64'") ? 64 : null,
    memoryMiB: source.includes("'--memory', '256m'") && source.includes("'--memory-swap', '256m'") ? 256 : null,
    cpus: source.includes("'--cpus', '1.0'") ? 1 : null,
    ephemeralWrites: source.includes("'--tmpfs', '/workspace:rw,noexec,nosuid,nodev,size=32m")
      && source.includes("'--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m"),
  };
}

function parseLock(source, name) {
  const value = parseStrictJson(source, 16 * 1024);
  if (!value || value.schema !== 'teach-lab-compiler-image-lock@1' || !HASH.test(value.imageId)
      || typeof value.image !== 'string' || !value.image) fail('LOCAL_READINESS_LOCK_INVALID', [name]);
  return { image: value.image, imageId: value.imageId };
}

async function optionalRead(filename) {
  try { return await readFile(filename, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function assessLocalReadiness(checkoutRoot, fixtureSource) {
  const fixture = parseFixture(fixtureSource);
  const root = path.resolve(checkoutRoot);
  const [composeSource, packageSource, brokerSource] = await Promise.all([
    readFile(path.join(root, FILES.compose), 'utf8'), readFile(path.join(root, FILES.package), 'utf8'),
    readFile(path.join(root, FILES.broker), 'utf8'),
  ]);
  const packageValue = parseStrictJson(packageSource, 512 * 1024);
  const compose = inspectCompose(composeSource);
  const broker = inspectBroker(brokerSource);
  const blockers = [];
  if (!compose.profile || !compose.loopbackOnly) blockers.push('LOCAL_BIND_NOT_LOOPBACK');
  if (!compose.readOnly || !compose.restartDisabled || !compose.dockerSocketReadOnly) blockers.push('LOCAL_GATEWAY_BOUNDARY_INVALID');
  if (compose.gatewayLimits.cpus !== 2 || compose.gatewayLimits.memoryMiB !== 512 || compose.gatewayLimits.pids !== 128) blockers.push('LOCAL_GATEWAY_LIMIT_INVALID');
  if (!broker.networkNone || !broker.readOnly || !broker.noPrivileges || !broker.capabilitiesDropped
      || !broker.ephemeralWrites || broker.cpus !== 1 || broker.memoryMiB !== 256 || broker.pids !== 64) {
    blockers.push('LOCAL_CHILD_BOUNDARY_INVALID');
  }
  const expectedScripts = {
    build: 'node scripts/build-staging.mjs', setupAvr: 'sh scripts/setup-local-toolchain.sh',
    setupRp2040: 'sh scripts/setup-rp2040-toolchain.sh', setupStm32: 'sh scripts/setup-stm32-public-images.sh',
  };
  if (packageValue.scripts?.build !== expectedScripts.build
      || packageValue.scripts?.['setup:toolchain'] !== expectedScripts.setupAvr
      || packageValue.scripts?.['setup:rp2040-toolchain'] !== expectedScripts.setupRp2040
      || packageValue.scripts?.['setup:stm32-public-images'] !== expectedScripts.setupStm32) {
    blockers.push('LOCAL_RECIPE_MISMATCH');
  }
  const locks = {}; const lockHashes = {};
  for (const name of IMAGE_KEYS) {
    if (!compose.lockBindings[name]) { blockers.push(`LOCAL_LOCK_BINDING_MISSING:${name}`); continue; }
    const source = await optionalRead(path.join(root, FILES[name]));
    if (source === null) { blockers.push(`LOCAL_LOCK_MISSING:${name}`); continue; }
    locks[name] = parseLock(source, name); lockHashes[name] = sha256(source);
    const installed = fixture.installedImages[name];
    if (installed === null) blockers.push(`LOCAL_IMAGE_MISSING:${name}`);
    else if (installed !== locks[name].imageId) blockers.push(`LOCAL_IMAGE_MISMATCH:${name}`);
  }
  if (fixture.runtime !== 'docker-available') blockers.push('LOCAL_RUNTIME_MISSING:docker');
  const configurationSha256 = sha256(canonical({
    compose: sha256(composeSource), package: sha256(packageSource), broker: sha256(brokerSource), locks: lockHashes,
  }));
  return Object.freeze({
    schema: LOCAL_READINESS_REPORT_SCHEMA, configurationSha256,
    source: Object.freeze({ composeSha256: sha256(composeSource), packageSha256: sha256(packageSource),
      brokerSha256: sha256(brokerSource), lockSha256: Object.freeze(lockHashes) }),
    profiles: Object.freeze({ avr: locks.avr ? 'assessed' : 'unavailable', rp2040: locks.rp2040 ? 'assessed' : 'unavailable',
      stm32: locks.stm32Builder && locks.stm32Runtime ? 'assessed' : 'unavailable',
      esp32c3: 'unavailable-separate-licensed-images' }),
    status: Object.freeze({ configurationAssessed: blockers.length ? 'blocked' : 'ready',
      serviceHealthy: 'not-checked', compilerRuntimeReady: 'not-checked', realFirmwareExecutionTested: 'not-tested' }),
    blockers: Object.freeze(blockers),
    boundaries: Object.freeze({ loopbackOnly: compose.loopbackOnly, childNetwork: 'none', childReadOnly: broker.readOnly,
      childCpu: broker.cpus, childMemoryMiB: broker.memoryMiB, childPids: broker.pids,
      storage: 'ephemeral-tmpfs', secretsCollected: false, remoteRegistration: false }),
    nextCommands: Object.freeze([
      'npm ci --ignore-scripts --no-audit --no-fund', 'npm run build', 'npm run setup:toolchain',
      'npm run setup:rp2040-toolchain', 'npm run setup:stm32-public-images',
      'DOCKER_GID=$(stat -c %g /var/run/docker.sock) docker compose --profile local-compiler up --build -d local-compiler',
    ]),
    distribution: 'Toolchain images and licensed runtime assets are local prerequisites, not project release artifacts.',
  });
}

export function canonicalLocalReadinessReport(report) { return canonical(report); }

export async function reopenLocalReadinessReport(reportSource, checkoutRoot, fixtureSource) {
  const saved = parseStrictJson(reportSource, 128 * 1024);
  if (!saved || saved.schema !== LOCAL_READINESS_REPORT_SCHEMA || typeof saved.configurationSha256 !== 'string') {
    fail('LOCAL_READINESS_REPORT_INVALID');
  }
  const current = await assessLocalReadiness(checkoutRoot, fixtureSource);
  return Object.freeze({ sameConfiguration: saved.configurationSha256 === current.configurationSha256,
    savedConfigurationSha256: saved.configurationSha256, currentConfigurationSha256: current.configurationSha256 });
}
