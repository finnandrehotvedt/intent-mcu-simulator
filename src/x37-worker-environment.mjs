// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { webcrypto } from 'node:crypto';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export async function ensureX37WorkerEnvironment() {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
  const input = new Uint8Array([0x78, 0x33, 0x37]);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input));
  const rp2040js = await import('rp2040js');
  if (digest.byteLength !== 32 || !(input instanceof Uint8Array)
      || typeof rp2040js.RP2040 !== 'function'
      || process.execArgv.some((value) => value.startsWith('--input-type'))) {
    fail('X37_WORKER_ENVIRONMENT_INVALID');
  }
  return Object.freeze({ node: process.version, webCryptoSubtle: true, typedArray: true,
    rp2040jsModule: true, execArgv: [...process.execArgv] });
}
