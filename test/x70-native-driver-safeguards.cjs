// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

'use strict';

const ACTIVE_EXPORT_REJECTION_STATUS =
  'Pause the current AVR/Pico runtime or wait for C3/STM32 completion before exporting a stable measurement snapshot.';
const POSITIVE_EXPORT_STATUS =
  'Accessible SVG downloaded locally · authored graph, named pins and current observation-only runtime measurements included.';

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
  while (Date.now() - started < durationMs) {
    const heartbeatStarted = Date.now();
    const value = await hardDeadline(() => page.evaluate(() => ({
      ready: document.readyState,
      state: document.querySelector('#pico-state')?.textContent?.trim() ?? null,
      presentation: window.__RP2040_PUBLIC_STATE__?.runtime?.presentation ?? null,
    })), heartbeatDeadlineMs, 'Pico page heartbeat');
    heartbeats.push({ elapsedMs: Date.now() - heartbeatStarted, ...value });
    const remaining = durationMs - (Date.now() - started);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve,
      Math.min(heartbeatIntervalMs, remaining)));
  }
  const final = await picoMetrics(page, heartbeatDeadlineMs);
  const observedMs = Date.now() - started;
  const messages = final.workerPresentationMessages - baseline.workerPresentationMessages;
  const publications = final.picoStatePublications - baseline.picoStatePublications;
  const ceiling = Math.ceil(observedMs / presentationIntervalMs) + 10;
  if (heartbeats.some(({ elapsedMs }) => elapsedMs > heartbeatDeadlineMs)) {
    throw new Error('X70_PICO_HEARTBEAT_BUDGET');
  }
  if (messages > ceiling || publications > ceiling) throw new Error('X70_PICO_PRESENTATION_CADENCE');
  if (requireRuntime && (messages < 1 || publications < 1)) throw new Error('X70_PICO_PRESENTATION_MISSING');
  return { durationMs: observedMs, heartbeatDeadlineMs, heartbeats: heartbeats.length,
    maximumHeartbeatMs: Math.max(0, ...heartbeats.map(({ elapsedMs }) => elapsedMs)),
    presentationIntervalMs, messageCeiling: ceiling, presentationMessages: messages,
    statePublications: publications, lastPresentation: final.lastPresentation };
}

async function pausePicoWithObservation(page, click, { timeoutMs = 2_000 } = {}) {
  const observed = await clickAndWaitExact({
    page, selector: '#pico-state', expected: 'paused', click, timeoutMs,
  });
  const state = await hardDeadline(() => page.evaluate(() => ({
    phase: window.__RP2040_PUBLIC_STATE__?.phase ?? null,
    paused: window.__RP2040_PUBLIC_STATE__?.runtime?.paused ?? null,
    presentation: window.__RP2040_PUBLIC_STATE__?.runtime?.presentation ?? null,
  })), Math.min(timeoutMs, 500), 'read paused Pico state');
  if (state.phase !== 'paused' || state.paused !== true || state.presentation?.final !== true) {
    throw new Error('X70_PICO_FINAL_PAUSE_INVALID');
  }
  return { ...observed, state };
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
  POSITIVE_EXPORT_STATUS,
  DriverDeadlineError,
  armExactText,
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
