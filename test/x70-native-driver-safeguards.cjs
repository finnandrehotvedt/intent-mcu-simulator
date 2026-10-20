// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

'use strict';

const ACTIVE_EXPORT_REJECTION_STATUS =
  'Pause the current AVR/Pico runtime or wait for C3/STM32 completion before exporting a stable measurement snapshot.';
const POSITIVE_EXPORT_STATUS =
  'Accessible SVG downloaded locally · authored graph, named pins and current observation-only runtime measurements included.';
const EXPECTED_PICO_NATIVE_IDENTITY = Object.freeze({
  profile: 'board.rp2040-pico-v1',
  modelLibrary: Object.freeze({
    version: '2.0.0-pico-presentation.1-current',
    manifestSha256: '567aebbbf1885d31f9401fa3cf1ae98b7263d1b32f22a6b7886ec686b3c0dac3',
    implementationSha256: '02df48f026feddb9e9af5630d162a76be8660f618d31388b5df53839184125f1',
    implementationId: 'intent-mcu-model-bundle-current-pico-presentation-1@3',
  }),
  runtimeEngine: Object.freeze({
    id: 'rp2040js', version: '1.4.0',
    sha256: 'ac5cb5a2cac7c759ce26c83b92b85f33510b10b4dd7825b02b23b6aed7fdbbbd',
  }),
});

class DriverDeadlineError extends Error {
  constructor(label, timeoutMs) {
    super(`${label} exceeded ${timeoutMs} ms`);
    this.name = 'DriverDeadlineError';
    this.code = 'X70_DRIVER_DEADLINE';
    this.timeoutMs = timeoutMs;
  }
}

function hardDeadline(operation, timeoutMs, label = 'driver operation') {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('X70_DRIVER_TIMEOUT');
  const pending = Promise.resolve().then(operation);
  // A renderer RPC can remain pending after the wall deadline. Keep a rejection
  // handler attached so later target cleanup cannot create an unhandled rejection.
  pending.catch(() => {});
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DriverDeadlineError(label, timeoutMs)), timeoutMs);
  });
  return Promise.race([pending, deadline]).finally(() => clearTimeout(timer));
}

let observerSequence = 0;

async function armExactText(page, selector, expected, { timeoutMs = 5_000 } = {}) {
  const token = `x70-${process.pid}-${Date.now()}-${++observerSequence}`;
  const installed = await hardDeadline(() => page.evaluate(({ target, text, id }) => {
    const node = document.querySelector(target);
    if (!node) throw new Error(`X70_STATUS_TARGET_MISSING:${target}`);
    const registry = window.__X70_PREARMED_STATUS__ ??= Object.create(null);
    const exact = () => (node.textContent ?? '').trim() === text;
    const record = { matched: exact(), matchedInitially: exact(), mutations: 0 };
    registry[id] = record;
    if (!record.matched) {
      const observer = new MutationObserver(() => {
        record.mutations += 1;
        if (!exact()) return;
        record.matched = true;
        observer.disconnect();
      });
      observer.observe(node, { childList: true, characterData: true, subtree: true });
      record.observer = observer;
    }
    return { matchedInitially: record.matchedInitially };
  }, { target: selector, text: expected, id: token }), timeoutMs, `arm exact status ${selector}`);

  let disposed = false;
  return {
    token,
    matchedInitially: installed.matchedInitially,
    async wait() {
      if (disposed) throw new Error('X70_STATUS_OBSERVER_DISPOSED');
      await hardDeadline(() => page.waitForFunction((id) =>
        window.__X70_PREARMED_STATUS__?.[id]?.matched === true,
      token, { timeout: timeoutMs }), timeoutMs + 100, `wait exact status ${selector}`);
      return hardDeadline(() => page.evaluate((id) => {
        const record = window.__X70_PREARMED_STATUS__?.[id];
        return { matchedInitially: record?.matchedInitially === true, mutations: record?.mutations ?? 0 };
      }, token), Math.min(timeoutMs, 1_000), `read exact status ${selector}`);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await hardDeadline(() => page.evaluate((id) => {
        const record = window.__X70_PREARMED_STATUS__?.[id];
        record?.observer?.disconnect();
        if (window.__X70_PREARMED_STATUS__) delete window.__X70_PREARMED_STATUS__[id];
      }, token), Math.min(timeoutMs, 500), `dispose exact status ${selector}`).catch(() => {});
    },
  };
}

async function clickAndWaitExact({ page, selector, expected, click, timeoutMs = 5_000 }) {
  const observer = await armExactText(page, selector, expected, { timeoutMs });
  const started = Date.now();
  try {
    await hardDeadline(click, timeoutMs, `click before exact status ${selector}`);
    const observed = await observer.wait();
    return { ...observed, elapsedMs: Date.now() - started, exact: expected };
  } finally {
    await observer.dispose();
  }
}

function observeDownloads(page) {
  const records = [];
  const listener = (download) => records.push({
    suggestedFilename: download.suggestedFilename(),
    observedAt: new Date().toISOString(),
  });
  page.on('download', listener);
  return {
    records,
    count: () => records.length,
    stop: () => page.off('download', listener),
  };
}

async function installPicoDriverInstrumentation(context) {
  await context.addInitScript(() => {
    const metrics = window.__X70_PICO_DRIVER_METRICS__ = {
      workerPresentationMessages: 0,
      picoStatePublications: 0,
      lastPresentation: null,
    };
    const NativeWorker = window.Worker;
    window.Worker = class X70ObservedWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          if (data?.presentation?.schema !== 'intent-mcu-rp2040-presentation@1') return;
          metrics.workerPresentationMessages += 1;
          metrics.lastPresentation = structuredClone(data.presentation);
        });
      }
    };
    let picoState;
    Object.defineProperty(window, '__RP2040_PUBLIC_STATE__', {
      configurable: true,
      get: () => picoState,
      set: (value) => {
        picoState = value;
        if (value?.runtime?.presentation?.schema === 'intent-mcu-rp2040-presentation@1') {
          metrics.picoStatePublications += 1;
        }
      },
    });
  });
}

async function picoMetrics(page, timeoutMs) {
  return hardDeadline(() => page.evaluate(() => structuredClone(
    window.__X70_PICO_DRIVER_METRICS__ ?? {
      workerPresentationMessages: 0, picoStatePublications: 0, lastPresentation: null,
    },
  )), timeoutMs, 'read Pico driver metrics');
}

function assertPicoNativeIdentity(state) {
  const expected = EXPECTED_PICO_NATIVE_IDENTITY;
  const artifactIdentity = state?.artifact?.artifactIdentity;
  if (state?.profile !== expected.profile || !/^[0-9a-f]{64}$/u.test(artifactIdentity ?? '')
      || state?.runtime?.artifactIdentity !== artifactIdentity) {
    throw new Error('X70_PICO_NATIVE_ARTIFACT_IDENTITY');
  }
  for (const [key, value] of Object.entries(expected.modelLibrary)) {
    if (state.modelLibrary?.[key] !== value) throw new Error(`X70_PICO_MODEL_IDENTITY_${key}`);
  }
  for (const [key, value] of Object.entries(expected.runtimeEngine)) {
    if (state.runtime?.runtimeEngine?.[key] !== value) throw new Error(`X70_PICO_RUNTIME_IDENTITY_${key}`);
  }
  const presentation = state.runtime?.presentation;
  if (presentation?.schema !== 'intent-mcu-rp2040-presentation@1'
      || presentation.artifactIdentity !== artifactIdentity
      || !Number.isSafeInteger(presentation.generation) || presentation.generation < 1
      || !Number.isSafeInteger(presentation.sequence) || presentation.sequence < 1) {
    throw new Error('X70_PICO_PRESENTATION_IDENTITY');
  }
  if (!Number.isSafeInteger(state.runtime.cycle) || state.runtime.cycle < 0
      || !Number.isSafeInteger(state.runtime.instructions) || state.runtime.instructions < 0) {
    throw new Error('X70_PICO_RUNTIME_COUNTERS');
  }
  return { artifactIdentity, modelLibrary: structuredClone(state.modelLibrary),
    runtimeEngine: structuredClone(state.runtime.runtimeEngine),
    presentation: structuredClone(presentation), cycle: state.runtime.cycle,
    instructions: state.runtime.instructions };
}

async function observeSustainedPico(page, {
  durationMs = 10_000,
  heartbeatIntervalMs = 100,
  heartbeatDeadlineMs = 500,
  presentationIntervalMs = 50,
  requireRuntime = true,
} = {}) {
  const baseline = await picoMetrics(page, heartbeatDeadlineMs);
  const started = Date.now();
  const heartbeats = [];
  let identity = null;
  let prior = null;
  while (Date.now() - started < durationMs) {
    const heartbeatStarted = Date.now();
    const value = await hardDeadline(() => page.evaluate(() => ({
      ready: document.readyState,
      state: document.querySelector('#pico-state')?.textContent?.trim() ?? null,
      native: structuredClone(window.__RP2040_PUBLIC_STATE__ ?? null),
    })), heartbeatDeadlineMs, 'Pico page heartbeat');
    let native = null;
    if (requireRuntime) {
      native = assertPicoNativeIdentity(value.native);
      if (value.state !== 'running' || value.native?.phase !== 'running'
          || value.native?.runtime?.paused !== false || native.presentation.final !== false) {
        throw new Error('X70_PICO_SUSTAINED_NOT_RUNNING');
      }
      if (!identity) identity = native;
      if (native.artifactIdentity !== identity.artifactIdentity
          || native.presentation.generation !== identity.presentation.generation) {
        throw new Error('X70_PICO_SUSTAINED_IDENTITY_DRIFT');
      }
      if (prior && (native.presentation.sequence < prior.presentation.sequence
          || native.cycle < prior.cycle || native.instructions < prior.instructions)) {
        throw new Error('X70_PICO_SUSTAINED_COUNTER_REGRESSION');
      }
      prior = native;
    }
    heartbeats.push({ elapsedMs: Date.now() - heartbeatStarted, ready: value.ready,
      state: value.state, cycle: native?.cycle ?? null, instructions: native?.instructions ?? null,
      generation: native?.presentation.generation ?? null,
      sequence: native?.presentation.sequence ?? null });
    const remaining = durationMs - (Date.now() - started);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve,
      Math.min(heartbeatIntervalMs, remaining)));
  }
  const final = await picoMetrics(page, heartbeatDeadlineMs);
  const observedMs = Date.now() - started;
  const messages = final.workerPresentationMessages - baseline.workerPresentationMessages;
  const publications = final.picoStatePublications - baseline.picoStatePublications;
  const messageCeiling = Math.ceil(observedMs / presentationIntervalMs) + 10;
  const publicationCeiling = Math.ceil(observedMs / presentationIntervalMs) + 20;
  if (heartbeats.some(({ elapsedMs }) => elapsedMs > heartbeatDeadlineMs)) {
    throw new Error('X70_PICO_HEARTBEAT_BUDGET');
  }
  if (messages > messageCeiling || publications > publicationCeiling) {
    throw new Error('X70_PICO_PRESENTATION_CADENCE');
  }
  if (requireRuntime && (messages < 1 || publications < 1)) throw new Error('X70_PICO_PRESENTATION_MISSING');
  if (requireRuntime && (!identity || !prior || prior.cycle <= identity.cycle
      || prior.instructions <= identity.instructions
      || prior.presentation.sequence <= identity.presentation.sequence)) {
    throw new Error('X70_PICO_SUSTAINED_NO_PROGRESS');
  }
  return { durationMs: observedMs, heartbeatDeadlineMs, heartbeats: heartbeats.length,
    maximumHeartbeatMs: Math.max(0, ...heartbeats.map(({ elapsedMs }) => elapsedMs)),
    presentationIntervalMs, messageCeiling, publicationCeiling, presentationMessages: messages,
    statePublications: publications, first: identity, last: prior,
    lastPresentation: final.lastPresentation };
}

async function pausePicoWithObservation(page, click, {
  timeoutMs = 2_000, stabilityMs = 300, priorObservation = null,
} = {}) {
  const observed = await clickAndWaitExact({
    page, selector: '#pico-state', expected: 'paused', click, timeoutMs,
  });
  const state = await hardDeadline(() => page.evaluate(() => structuredClone(
    window.__RP2040_PUBLIC_STATE__ ?? null)), Math.min(timeoutMs, 500), 'read paused Pico state');
  const identity = assertPicoNativeIdentity(state);
  if (state.phase !== 'paused' || state.runtime?.paused !== true || identity.presentation.final !== true) {
    throw new Error('X70_PICO_FINAL_PAUSE_INVALID');
  }
  if (priorObservation && (identity.artifactIdentity !== priorObservation.artifactIdentity
      || identity.presentation.generation <= priorObservation.presentation.generation)) {
    throw new Error('X70_PICO_FINAL_GENERATION_INVALID');
  }
  await new Promise((resolve) => setTimeout(resolve, stabilityMs));
  const stableState = await hardDeadline(() => page.evaluate(() => structuredClone(
    window.__RP2040_PUBLIC_STATE__ ?? null)), Math.min(timeoutMs, 500), 'read stable paused Pico state');
  const stable = assertPicoNativeIdentity(stableState);
  for (const key of ['artifactIdentity', 'cycle', 'instructions']) {
    if (stable[key] !== identity[key]) throw new Error(`X70_PICO_PAUSE_STABILITY_${key}`);
  }
  if (JSON.stringify(stable.presentation) !== JSON.stringify(identity.presentation)
      || stableState.phase !== 'paused' || stableState.runtime?.paused !== true) {
    throw new Error('X70_PICO_PAUSE_STALE_OVERWRITE');
  }
  return { ...observed, state: identity, stableAfterMs: stabilityMs, stable };
}

async function emergencyPauseStop(page, {
  pauseSelector = '#pico-pause',
  stopSelector = '#pico-stop',
  stateSelector = '#pico-state',
  pauseText = 'paused',
  stopText = 'editing',
  actionTimeoutMs = 750,
} = {}) {
  const result = { status: 'not-required', bounded: true, attempts: [] };
  if (!page || page.isClosed()) return result;
  try {
    const state = await hardDeadline(() => page.evaluate((selector) =>
      document.querySelector(selector)?.textContent?.trim() ?? null,
    stateSelector), Math.min(actionTimeoutMs, 250), 'read emergency runtime state');
    result.stateBefore = state;
    if (!['running', 'starting', 'pausing', 'resetting'].includes(state)) return result;
  } catch (error) {
    result.attempts.push({ action: 'read-state', ok: false, code: error.code ?? error.name });
  }
  let pauseObserver = null;
  try {
    pauseObserver = await armExactText(page, stateSelector, pauseText,
      { timeoutMs: actionTimeoutMs });
  } catch (error) {
    result.attempts.push({ action: 'arm-pause', ok: false, code: error.code ?? error.name });
  }
  try {
    await hardDeadline(() => page.locator(pauseSelector).click({ timeout: actionTimeoutMs,
      noWaitAfter: true }), actionTimeoutMs + 100, 'emergency Pause click');
    result.attempts.push({ action: 'pause', ok: true });
    if (pauseObserver) {
      const observed = await pauseObserver.wait();
      result.status = 'paused';
      result.pause = observed;
      return result;
    }
  } catch (error) {
    result.attempts.push({ action: 'pause', ok: false, code: error.code ?? error.name });
  } finally {
    await pauseObserver?.dispose();
  }

  let stopObserver = null;
  try {
    stopObserver = await armExactText(page, stateSelector, stopText,
      { timeoutMs: actionTimeoutMs });
  } catch (error) {
    result.attempts.push({ action: 'arm-stop', ok: false, code: error.code ?? error.name });
  }
  try {
    await hardDeadline(() => page.locator(stopSelector).click({ timeout: actionTimeoutMs,
      noWaitAfter: true }), actionTimeoutMs + 100, 'emergency Stop click');
    result.attempts.push({ action: 'stop', ok: true });
    if (stopObserver) {
      const observed = await stopObserver.wait();
      result.status = 'stopped';
      result.stop = observed;
      return result;
    }
  } catch (error) {
    result.attempts.push({ action: 'stop', ok: false, code: error.code ?? error.name });
  } finally {
    await stopObserver?.dispose();
  }
  result.status = 'failed-bounded';
  return result;
}

async function boundedPageCapture(page, payload, { timeoutMs = 1_000 } = {}) {
  try {
    const value = await hardDeadline(() => page.evaluate((input) => ({
      ...input,
      url: location.href,
      profile: document.querySelector('#board-select')?.value ?? null,
      quickState: document.querySelector('#quick-state')?.textContent ?? null,
      controllerStatus: document.querySelector('#controller-status')?.textContent ?? null,
      picoMessage: document.querySelector('#pico-message')?.textContent ?? null,
      workerState: document.querySelector('#worker-state')?.textContent ?? null,
      accessibleSvgStatus: document.querySelector('#accessible-svg-status')?.textContent ?? null,
      sharedSummary: window.__SHARED_INSTRUMENT_SUMMARY__ ?? null,
      avrState: window.__M6_STATE__ ?? null,
      picoState: window.__RP2040_PUBLIC_STATE__ ?? null,
    }), payload), timeoutMs, 'failure state capture');
    return { ok: true, value };
  } catch (error) {
    return { ok: false, value: { ...payload, captureError: String(error.message ?? error) } };
  }
}

async function boundedBrowserCleanup({ pages = [], contexts = [], browser = null, timeoutMs = 1_000 } = {}) {
  const outcomes = [];
  for (const page of pages) {
    if (!page || page.isClosed()) continue;
    try {
      await hardDeadline(() => page.close({ runBeforeUnload: false }), timeoutMs, 'page cleanup');
      outcomes.push({ target: 'page', ok: true });
    } catch (error) { outcomes.push({ target: 'page', ok: false, code: error.code ?? error.name }); }
  }
  for (const context of contexts) {
    if (!context) continue;
    try {
      await hardDeadline(() => context.close(), timeoutMs, 'context cleanup');
      outcomes.push({ target: 'context', ok: true });
    } catch (error) { outcomes.push({ target: 'context', ok: false, code: error.code ?? error.name }); }
  }
  if (browser) {
    try {
      await hardDeadline(() => browser.close(), timeoutMs, 'browser cleanup');
      outcomes.push({ target: 'browser', ok: true });
    } catch (error) { outcomes.push({ target: 'browser', ok: false, code: error.code ?? error.name }); }
  }
  return { bounded: true, outcomes };
}

module.exports = {
  ACTIVE_EXPORT_REJECTION_STATUS,
  EXPECTED_PICO_NATIVE_IDENTITY,
  POSITIVE_EXPORT_STATUS,
  DriverDeadlineError,
  armExactText,
  assertPicoNativeIdentity,
  boundedBrowserCleanup,
  boundedPageCapture,
  clickAndWaitExact,
  emergencyPauseStop,
  hardDeadline,
  installPicoDriverInstrumentation,
  observeDownloads,
  observeSustainedPico,
  pausePicoWithObservation,
};
