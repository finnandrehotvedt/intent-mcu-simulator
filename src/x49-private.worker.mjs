// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createWorkerRuntimeIdentity } from './runtime-identity.mjs';
import {
  validateX49PrivateCommand, validateX49PrivateInit, x49PrivateTerminal,
  X49_PRIVATE_SLICE_INSTRUCTIONS,
} from './x49-private-runtime-contract.mjs';
import { X49PrivateInstrumentedRuntime } from './x49-private-instrumented-runtime.mjs';
import trustedPrivateManifest from './x49-private-runtime-manifest.json' with { type: 'json' };

export function createX49PrivateWorkerController({ emit, schedule, close,
  runtimeFactory = (value) => new X49PrivateInstrumentedRuntime(value),
  cryptoImpl = globalThis.crypto, trustedManifest = trustedPrivateManifest } = {}) {
  if (typeof emit !== 'function' || typeof schedule !== 'function' || typeof close !== 'function'
      || typeof runtimeFactory !== 'function') throw new Error('X49_PRIVATE_WORKER_HOST_INVALID');
  let runtime = null; let identity = null; let receiptNonce = null;
  let experimentBinding = null;
  let initialization = 0; let epoch = 0; let terminalSent = false; let disposed = false;
  let initializing = false; let pendingReceiptNonce = null; let disposeToken = null;

  const identityFields = () => identity ? { runtimeIdentity: structuredClone(identity) } : {};
  const publish = (value) => emit({ ...value, ...identityFields() });
  const publishTerminal = (result) => {
    if (terminalSent || !result?.terminal) return false;
    terminalSent = true;
    publish({ kind: 'terminal', terminal: x49PrivateTerminal({ receiptNonce,
      runtimeIdentity: identity, experimentBinding, ...result.terminal }) });
    return true;
  };
  const fail = (error) => {
    if (runtime && !terminalSent) publishTerminal(runtime.cancel('infrastructure-failure'));
    else if (!terminalSent) publish({ kind: 'error', code: error.code ?? error.message ?? 'X49_PRIVATE_ERROR' });
  };
  const pump = (activeEpoch) => {
    if (disposed || activeEpoch !== epoch || !runtime || terminalSent) return;
    try {
      const terminal = runtime.runSlice(X49_PRIVATE_SLICE_INSTRUCTIONS);
      if (terminal) { publishTerminal({ terminal, newlyTerminal: true }); return; }
      schedule(() => pump(activeEpoch));
    } catch (error) { fail(error); }
  };

  return Object.freeze({
    async handle(value) {
      try {
        if (value?.command === 'init') {
          if (runtime || initializing || disposed) throw Object.assign(new Error('X49_PRIVATE_ALREADY_INITIALIZED'),
            { code: 'X49_PRIVATE_ALREADY_INITIALIZED' });
          const claimed = structuredClone(value); const activeEpoch = ++epoch;
          initializing = true; pendingReceiptNonce = claimed.receiptNonce ?? null;
          try {
            const accepted = await validateX49PrivateInit(claimed, cryptoImpl, trustedManifest);
            if (disposed || !initializing || activeEpoch !== epoch) return;
            identity = createWorkerRuntimeIdentity(accepted.runtimeBinding, ++initialization, cryptoImpl);
            receiptNonce = accepted.receiptNonce;
            experimentBinding = structuredClone(accepted.experimentBinding);
            runtime = runtimeFactory({ hex: accepted.hex, probe: accepted.probe,
              caseId: accepted.caseId });
            initializing = false; pendingReceiptNonce = null;
            publish({ kind: 'ready', receiptNonce, caseId: accepted.caseId,
              inputIdentity: accepted.expected.inputIdentity });
          } catch (error) {
            if (activeEpoch === epoch) { initializing = false; pendingReceiptNonce = null; }
            throw error;
          }
          return;
        }
        const command = validateX49PrivateCommand(value);
        if (command.command === 'dispose' && disposed) {
          if (command.disposeToken !== disposeToken) throw Object.assign(
            new Error('X49_PRIVATE_DISPOSE_TOKEN_STALE'), { code: 'X49_PRIVATE_DISPOSE_TOKEN_STALE' });
          publish({ kind: 'disposed', disposeToken, terminalAlready: terminalSent, idempotent: true });
          return;
        }
        if (initializing && !runtime) {
          if (command.command === 'cancel') {
            if (command.receiptNonce !== pendingReceiptNonce) throw Object.assign(
              new Error('X49_PRIVATE_RECEIPT_STALE'), { code: 'X49_PRIVATE_RECEIPT_STALE' });
            epoch += 1; initializing = false; pendingReceiptNonce = null;
            publish({ kind: 'cancel-ack', terminalAlready: false, initializationRetired: true });
            return;
          }
          if (command.command === 'dispose') {
            epoch += 1; initializing = false; pendingReceiptNonce = null;
            disposed = true; disposeToken = command.disposeToken;
            publish({ kind: 'disposed', disposeToken, terminalAlready: false, idempotent: false });
            close();
            return;
          }
        }
        if (!runtime || disposed) throw Object.assign(new Error('X49_PRIVATE_NOT_INITIALIZED'),
          { code: 'X49_PRIVATE_NOT_INITIALIZED' });
        if (command.command !== 'dispose' && command.receiptNonce !== receiptNonce) {
          throw Object.assign(new Error('X49_PRIVATE_RECEIPT_STALE'), { code: 'X49_PRIVATE_RECEIPT_STALE' });
        }
        if (command.command === 'observe-first') {
          if (terminalSent) { publish({ kind: 'observe-ack', terminalAlready: true }); return; }
          const activeEpoch = ++epoch;
          schedule(() => pump(activeEpoch));
          publish({ kind: 'observe-ack', terminalAlready: false });
          return;
        }
        if (command.command === 'cancel') {
          epoch += 1;
          const result = runtime.cancel('cancelled');
          const emitted = publishTerminal(result);
          publish({ kind: 'cancel-ack', terminalAlready: !emitted });
          return;
        }
        epoch += 1;
        const result = runtime.dispose();
        publishTerminal(result);
        disposed = true; disposeToken = command.disposeToken;
        publish({ kind: 'disposed', disposeToken: command.disposeToken,
          terminalAlready: terminalSent, idempotent: false });
        runtime = null;
        close();
      } catch (error) { fail(error); }
    },
    snapshot() { return { initialized: Boolean(runtime), initializing, disposed, epoch, terminalSent,
      receiptNonce, runtimeIdentity: identity ? structuredClone(identity) : null } },
  });
}

if (typeof globalThis.self === 'object' && typeof globalThis.self?.addEventListener === 'function'
    && typeof globalThis.self?.postMessage === 'function') {
  const controller = createX49PrivateWorkerController({
    emit: (value) => globalThis.self.postMessage(value),
    schedule: (callback) => setTimeout(callback, 0),
    close: () => globalThis.self.close(),
  });
  globalThis.self.addEventListener('message', ({ data }) => { void controller.handle(data); });
}
