// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  AVR_PROFILE,
  ESP32C3_PROFILE,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
} from './compile-targets.mjs';

export const X42_CAPTURE_SCHEMA = 'intent-mcu-x42-digital-edge-capture@1';
export const X42_PROFILE = AVR_PROFILE;
export const X42_PRE_EDGE_COUNT = 16;
export const X42_POST_EDGE_COUNT = 16;
export const X42_CAPTURE_ROW_LIMIT = 33;
export const X42_OBSERVED_AFTER_ARM_LIMIT = 4_096;
export const X42_SOURCE_ROW_LIMIT = 100_000;
export const X42_UPDATE_ROW_LIMIT = 8_192;
export const X42_OBSERVER_INTERVAL_MS = 50;

const SUMMARY_SCHEMA = 'intent-mcu-shared-instrument-summary@1';
const LIFECYCLE_SCHEMA = 'intent-mcu-lifecycle@1';
const EDGES = Object.freeze(['rising', 'falling']);
const TERMINAL = new Set(['captured', 'not-triggered', 'incomplete', 'invalidated']);
const SUMMARY_KEYS = Object.freeze(['artifactIdentity', 'channels', 'profile', 'provenance', 'revision', 'schema', 'state']);
const CHANNEL_KEYS = Object.freeze(['gpio', 'input', 'logic', 'serial']);
const LOGIC_KEYS = Object.freeze(['classification', 'provenance', 'retention', 'time', 'value']);
const TIME_KEYS = Object.freeze(['basis', 'cycle', 'virtualMilliseconds']);
const RETENTION_KEYS = Object.freeze(['dropped', 'limit', 'retained']);
const VALUE_KEYS = Object.freeze(['channels', 'transitions']);
const ROW_KEYS = Object.freeze(['cycle', 'level', 'pin']);

const clone = (value) => structuredClone(value);
const sortedKeys = (value) => Object.keys(value ?? {}).sort();
const exactKeys = (value, expected, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(sortedKeys(value)) !== JSON.stringify([...expected].sort())) {
    throw Object.assign(new Error(code), { code });
  }
};
const integer = (value, code) => {
  if (!Number.isSafeInteger(value) || value < 0) throw Object.assign(new Error(code), { code });
  return value;
};
const text = (value, code) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
    throw Object.assign(new Error(code), { code });
  }
  return value;
};
const rowEqual = (left, right) => left?.cycle === right?.cycle
  && left?.pin === right?.pin && left?.level === right?.level;
const rowsEqual = (left, right) => left.length === right.length
  && left.every((row, index) => rowEqual(row, right[index]));
const unavailableReason = (profile) => {
  if (profile === RP2040_PROFILE) return 'deferred-retention-boundary';
  if (profile === ESP32C3_PROFILE) return 'unavailable-project-model-not-native-waveform';
  if (profile === STM32F429ZI_PROFILE) return 'unavailable-final-observation-not-waveform';
  return 'unavailable-no-current-avr-runtime';
};

function normalizeObservation(summary, lifecycle) {
  if (!summary || summary.schema !== SUMMARY_SCHEMA) {
    throw Object.assign(new Error('X42_SUMMARY_SCHEMA'), { code: 'X42_SUMMARY_SCHEMA' });
  }
  exactKeys(summary, SUMMARY_KEYS, 'X42_SUMMARY_KEYS');
  if (summary.profile !== X42_PROFILE) {
    throw Object.assign(new Error(unavailableReason(summary.profile)), { code: unavailableReason(summary.profile) });
  }
  if (summary.state !== 'current-runtime') throw Object.assign(new Error('X42_RUNTIME_NOT_CURRENT'), { code: 'X42_RUNTIME_NOT_CURRENT' });
  if (!Number.isSafeInteger(summary.revision) || summary.revision < 0) {
    throw Object.assign(new Error('X42_REVISION'), { code: 'X42_REVISION' });
  }
  if (!/^[0-9a-f]{64}$/u.test(summary.artifactIdentity ?? '')) {
    throw Object.assign(new Error('X42_ARTIFACT_IDENTITY'), { code: 'X42_ARTIFACT_IDENTITY' });
  }
  exactKeys(summary.channels, CHANNEL_KEYS, 'X42_CHANNEL_KEYS');
  const logic = summary.channels.logic;
  exactKeys(logic, LOGIC_KEYS, 'X42_LOGIC_KEYS');
  exactKeys(logic.time, TIME_KEYS, 'X42_TIME_KEYS');
  exactKeys(logic.retention, RETENTION_KEYS, 'X42_RETENTION_KEYS');
  exactKeys(logic.value, VALUE_KEYS, 'X42_VALUE_KEYS');
  if (logic.classification !== 'recorded-runtime') throw Object.assign(new Error('X42_CLASSIFICATION'), { code: 'X42_CLASSIFICATION' });
  if (logic.time.basis !== 'virtual-cycle') throw Object.assign(new Error('X42_TIME_BASIS'), { code: 'X42_TIME_BASIS' });
  const sourceCycle = integer(logic.time.cycle, 'X42_SOURCE_CYCLE');
  const retained = integer(logic.retention.retained, 'X42_RETAINED');
  const dropped = integer(logic.retention.dropped, 'X42_DROPPED');
  if (logic.retention.limit !== X42_SOURCE_ROW_LIMIT) throw Object.assign(new Error('X42_SOURCE_LIMIT'), { code: 'X42_SOURCE_LIMIT' });
  if (!Array.isArray(logic.value.channels) || !logic.value.channels.length
      || logic.value.channels.some((channel) => typeof channel !== 'string' || !channel.length)
      || new Set(logic.value.channels).size !== logic.value.channels.length) {
    throw Object.assign(new Error('X42_CHANNELS'), { code: 'X42_CHANNELS' });
  }
  if (!Array.isArray(logic.value.transitions) || logic.value.transitions.length > X42_SOURCE_ROW_LIMIT
      || retained !== logic.value.transitions.length) {
    throw Object.assign(new Error('X42_SOURCE_ROWS'), { code: 'X42_SOURCE_ROWS' });
  }
  let priorCycle = -1;
  const rows = logic.value.transitions.map((row, sourceOrdinal) => {
    exactKeys(row, ROW_KEYS, 'X42_ROW_KEYS');
    const cycle = integer(row.cycle, 'X42_ROW_CYCLE');
    if (cycle < priorCycle) throw Object.assign(new Error('X42_CYCLE_REGRESSION'), { code: 'X42_CYCLE_REGRESSION' });
    priorCycle = cycle;
    const pin = text(row.pin, 'X42_ROW_PIN');
    if (!logic.value.channels.includes(pin) || typeof row.level !== 'boolean') {
      throw Object.assign(new Error('X42_ROW_VALUE'), { code: 'X42_ROW_VALUE' });
    }
    return { cycle, pin, level: row.level, sourceOrdinal };
  });
  if (rows.length && rows.at(-1).cycle > sourceCycle) throw Object.assign(new Error('X42_SOURCE_TIME'), { code: 'X42_SOURCE_TIME' });
  if (!lifecycle || lifecycle.schema !== LIFECYCLE_SCHEMA) throw Object.assign(new Error('X42_LIFECYCLE_SCHEMA'), { code: 'X42_LIFECYCLE_SCHEMA' });
  const projectGeneration = integer(lifecycle.projectGeneration, 'X42_PROJECT_GENERATION');
  const runtimeGeneration = integer(lifecycle.runtimeGeneration, 'X42_RUNTIME_GENERATION');
  const runtimeBinding = lifecycle.runtimeBinding;
  if (!runtimeBinding || runtimeBinding.projectGeneration !== projectGeneration
      || runtimeBinding.runtimeGeneration !== runtimeGeneration
      || runtimeBinding.artifactIdentity !== summary.artifactIdentity) {
    throw Object.assign(new Error('X42_RUNTIME_BINDING'), { code: 'X42_RUNTIME_BINDING' });
  }
  return {
    profile: summary.profile,
    revision: summary.revision,
    artifactIdentity: summary.artifactIdentity,
    projectGeneration,
    runtimeGeneration,
    sourceCycle,
    provenance: text(logic.provenance, 'X42_PROVENANCE'),
    retained,
    dropped,
    limit: logic.retention.limit,
    channels: [...logic.value.channels],
    rows,
  };
}

const blank = (state = 'unavailable', reason = 'unavailable-no-current-avr-runtime') => ({
  schema: X42_CAPTURE_SCHEMA,
  state,
  reason,
  config: null,
  binding: null,
  bounds: {
    pre: X42_PRE_EDGE_COUNT,
    trigger: 1,
    post: X42_POST_EDGE_COUNT,
    captureRows: X42_CAPTURE_ROW_LIMIT,
    candidateEdges: X42_OBSERVED_AFTER_ARM_LIMIT,
    sourceRowsPerSnapshot: X42_SOURCE_ROW_LIMIT,
    newRowsPerUpdate: X42_UPDATE_ROW_LIMIT,
    observerMilliseconds: X42_OBSERVER_INTERVAL_MS,
  },
  source: null,
  observedCandidateEdges: 0,
  capture: null,
});

export function x42TriggerAvailability(summary, lifecycle) {
  try {
    const observation = normalizeObservation(summary, lifecycle);
    return { state: 'ready', reason: null, channels: [...observation.channels] };
  } catch (error) {
    return { state: 'unavailable', reason: error.code ?? 'X42_UNAVAILABLE', channels: [] };
  }
}

export function createX42DigitalEdgeTriggerCapture() {
  let view = blank();
  let prior = null;
  let channelHistory = [];
  let priorLevel = null;
  let captureRows = [];

  const publicView = () => clone(view);
  const stop = (state, reason) => {
    view.state = state;
    view.reason = reason;
    if (state !== 'captured') view.capture = null;
    if (['invalidated', 'incomplete'].includes(state)) {
      view.binding = null;
      view.source = null;
      view.config = null;
    }
    prior = null;
    channelHistory = [];
    priorLevel = null;
    captureRows = [];
    return publicView();
  };
  const invalidate = (reason = 'X42_INVALIDATED') => {
    if (view.state === 'triggered') return stop('incomplete', reason);
    if (!TERMINAL.has(view.state) || view.state === 'captured') return stop('invalidated', reason);
    return publicView();
  };
  const prepare = (summary, lifecycle) => {
    if (['armed', 'triggered', 'captured'].includes(view.state)) return publicView();
    const availability = x42TriggerAvailability(summary, lifecycle);
    view = blank(availability.state, availability.reason);
    if (availability.state === 'ready') view.channels = availability.channels;
    return publicView();
  };
  const arm = (summary, lifecycle, config) => {
    exactKeys(config, ['channel', 'edge'], 'X42_CONFIG_KEYS');
    if (!EDGES.includes(config.edge)) throw Object.assign(new Error('X42_EDGE'), { code: 'X42_EDGE' });
    const observation = normalizeObservation(summary, lifecycle);
    if (observation.dropped !== 0) throw Object.assign(new Error('X42_DROPPED_AT_ARM'), { code: 'X42_DROPPED_AT_ARM' });
    if (!observation.channels.includes(config.channel)) throw Object.assign(new Error('X42_CHANNEL'), { code: 'X42_CHANNEL' });
    const selected = observation.rows.filter((row) => row.pin === config.channel);
    channelHistory = selected.slice(-X42_PRE_EDGE_COUNT);
    priorLevel = selected.at(-1)?.level ?? null;
    captureRows = [];
    const anchor = observation.rows.slice(-Math.min(17, observation.rows.length));
    prior = { retained: observation.retained, sourceCycle: observation.sourceCycle, anchor };
    view = blank('armed', null);
    view.config = { channel: config.channel, edge: config.edge };
    view.binding = {
      profile: observation.profile,
      revision: observation.revision,
      projectGeneration: observation.projectGeneration,
      runtimeGeneration: observation.runtimeGeneration,
      artifactIdentity: observation.artifactIdentity,
      armCycle: observation.sourceCycle,
      armRetained: observation.retained,
      armFinalRow: observation.rows.length ? clone(observation.rows.at(-1)) : null,
    };
    view.source = {
      classification: 'recorded-runtime',
      provenance: observation.provenance,
      timeBasis: 'virtual-cycle',
      retained: observation.retained,
      dropped: observation.dropped,
      limit: observation.limit,
    };
    return publicView();
  };
  const observe = (summary, lifecycle) => {
    if (!['armed', 'triggered'].includes(view.state)) return publicView();
    let observation;
    try { observation = normalizeObservation(summary, lifecycle); } catch (error) { return invalidate(error.code ?? 'X42_OBSERVATION'); }
    const binding = view.binding;
    if (observation.profile !== binding.profile || observation.revision !== binding.revision
        || observation.projectGeneration !== binding.projectGeneration
        || observation.runtimeGeneration !== binding.runtimeGeneration
        || observation.artifactIdentity !== binding.artifactIdentity) return invalidate('X42_BINDING_CHANGED');
    if (observation.dropped !== 0 || observation.retained < prior.retained
        || observation.sourceCycle < prior.sourceCycle) return invalidate('X42_SOURCE_DISCONTINUITY');
    if (observation.retained === prior.retained && observation.sourceCycle === prior.sourceCycle) {
      const currentAnchor = observation.rows.slice(-prior.anchor.length);
      return rowsEqual(currentAnchor, prior.anchor) ? publicView() : invalidate('X42_STALE_SNAPSHOT_CHANGED');
    }
    const newCount = observation.retained - prior.retained;
    if (newCount < 0 || newCount > X42_UPDATE_ROW_LIMIT) return invalidate('X42_UPDATE_ROW_LIMIT');
    const overlapStart = prior.retained - prior.anchor.length;
    if (!rowsEqual(observation.rows.slice(overlapStart, prior.retained), prior.anchor)) {
      return invalidate('X42_OVERLAP_AMBIGUOUS');
    }
    const incoming = observation.rows.slice(prior.retained);
    prior = {
      retained: observation.retained,
      sourceCycle: observation.sourceCycle,
      anchor: observation.rows.slice(-Math.min(17, observation.rows.length)),
    };
    view.source.retained = observation.retained;
    for (const row of incoming) {
      if (row.pin !== view.config.channel) continue;
      if (view.state === 'triggered') {
        captureRows.push(row);
        if (captureRows.length === X42_CAPTURE_ROW_LIMIT) {
          const trigger = captureRows[X42_PRE_EDGE_COUNT];
          view.state = 'captured';
          view.reason = null;
          view.capture = {
            armedBeforeTrigger: true,
            startCycle: captureRows[0].cycle,
            triggerCycle: trigger.cycle,
            endCycle: captureRows.at(-1).cycle,
            virtualMilliseconds: {
              start: captureRows[0].cycle / 16_000,
              trigger: trigger.cycle / 16_000,
              end: captureRows.at(-1).cycle / 16_000,
            },
            rows: captureRows.map((item, index) => ({ ...clone(item), relativePosition: index - X42_PRE_EDGE_COUNT })),
          };
          prior = null; channelHistory = []; priorLevel = null; captureRows = [];
          break;
        }
        continue;
      }
      view.observedCandidateEdges += 1;
      const direction = priorLevel === false && row.level === true ? 'rising'
        : priorLevel === true && row.level === false ? 'falling' : null;
      const matched = direction === view.config.edge && channelHistory.length === X42_PRE_EDGE_COUNT;
      if (matched) {
        captureRows = [...channelHistory, row];
        view.state = 'triggered';
        view.reason = null;
      } else {
        channelHistory.push(row);
        if (channelHistory.length > X42_PRE_EDGE_COUNT) channelHistory.shift();
      }
      priorLevel = row.level;
      if (view.state === 'armed' && view.observedCandidateEdges === X42_OBSERVED_AFTER_ARM_LIMIT) {
        stop('not-triggered', 'X42_CANDIDATE_EDGE_LIMIT');
        break;
      }
    }
    return publicView();
  };
  return Object.freeze({ snapshot: publicView, prepare, arm, observe, invalidate });
}
