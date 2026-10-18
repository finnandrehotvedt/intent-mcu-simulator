// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import { THERMOSTAT_EXPERIMENT_ID, THERMOSTAT_SCENARIOS } from './thermostat-experiment-contract.mjs';
import { completedExperimentOutcome } from './experiment-outcomes.mjs';

export const SCENARIO_TIMELINE_SCHEMA = 'intent-mcu-scenario-timeline@1';
export const SCENARIO_TIMELINE_PROFILE = 'board.atmega328p-16mhz-v1';
export const SCENARIO_TIMELINE_LIMITS = Object.freeze({
  scenarios: 8, eventsPerScenario: 24, textBytes: 80,
  inputMilliseconds: Object.freeze({ minimum: 0, maximum: 300 }),
  observationMilliseconds: Object.freeze({ minimum: 160, maximum: 350 }),
  temperatureC: Object.freeze({ minimum: -50, maximum: 150 }),
  settlingMilliseconds: 1,
});

const EVENT_KINDS = Object.freeze([
  'input.temperature-c', 'input.button-pressed', 'expect.pin-level',
]);
const EVENT_PRIORITY = Object.freeze({
  'input.temperature-c': 0, 'input.button-pressed': 1, 'expect.pin-level': 2,
});
const ID = /^[A-Z][A-Z0-9_-]{1,39}$/u;
const clone = (value) => structuredClone(value);
const failure = (code, details = []) => ({ ok: false, code, details });

function boundedText(value, path) {
  if (typeof value !== 'string' || value !== value.trim() || !value
      || new TextEncoder().encode(value).length > SCENARIO_TIMELINE_LIMITS.textBytes) {
    throw Object.assign(new Error('SCENARIO_TEXT'), { details: [path] });
  }
  return value;
}

function stableId(value, path) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw Object.assign(new Error('SCENARIO_ID'), { details: [path] });
  }
  return value;
}

function milliseconds(value, range, path) {
  if (!Number.isSafeInteger(value) || value < range.minimum || value > range.maximum) {
    throw Object.assign(new Error('SCENARIO_TIME_RANGE'), { details: [path] });
  }
  return value;
}

function normalizeEvent(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !EVENT_KINDS.includes(value.kind)) {
    throw Object.assign(new Error('SCENARIO_EVENT_SHAPE'), { details: [path] });
  }
  const common = {
    id: stableId(value.id, `${path}.id`),
    atMilliseconds: milliseconds(value.atMilliseconds,
      value.kind === 'expect.pin-level'
        ? SCENARIO_TIMELINE_LIMITS.observationMilliseconds
        : SCENARIO_TIMELINE_LIMITS.inputMilliseconds,
      `${path}.atMilliseconds`),
    kind: value.kind,
  };
  if (value.kind === 'input.temperature-c') {
    if (!exactKeys(value, ['id', 'atMilliseconds', 'kind', 'componentId', 'valueC'])
        || value.componentId !== 'temperature-sensor-1'
        || !Number.isInteger(value.valueC)
        || value.valueC < SCENARIO_TIMELINE_LIMITS.temperatureC.minimum
        || value.valueC > SCENARIO_TIMELINE_LIMITS.temperatureC.maximum) {
      throw Object.assign(new Error('SCENARIO_TEMPERATURE_EVENT'), { details: [path] });
    }
    return { ...common, componentId: value.componentId, valueC: value.valueC };
  }
  if (value.kind === 'input.button-pressed') {
    if (!exactKeys(value, ['id', 'atMilliseconds', 'kind', 'componentId', 'pressed'])
        || value.componentId !== 'enable-button-1' || typeof value.pressed !== 'boolean') {
      throw Object.assign(new Error('SCENARIO_BUTTON_EVENT'), { details: [path] });
    }
    return { ...common, componentId: value.componentId, pressed: value.pressed };
  }
  if (!exactKeys(value, ['id', 'atMilliseconds', 'throughMilliseconds', 'kind', 'pin', 'level'])
      || value.pin !== 'D13' || typeof value.level !== 'boolean'
      || !Number.isSafeInteger(value.throughMilliseconds)
      || value.throughMilliseconds < value.atMilliseconds
      || value.throughMilliseconds > SCENARIO_TIMELINE_LIMITS.observationMilliseconds.maximum) {
    throw Object.assign(new Error('SCENARIO_EXPECTATION_EVENT'), { details: [path] });
  }
  return { ...common, throughMilliseconds: value.throughMilliseconds,
    pin: value.pin, level: value.level };
}

function normalizeScenario(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['id', 'name', 'events']) || !Array.isArray(value.events)
      || value.events.length < 3 || value.events.length > SCENARIO_TIMELINE_LIMITS.eventsPerScenario) {
    throw Object.assign(new Error('SCENARIO_SHAPE'), { details: [path] });
  }
  const events = value.events.map((event, index) => normalizeEvent(event, `${path}.events[${index}]`));
  const ids = new Set();
  for (const [index, event] of events.entries()) {
    if (ids.has(event.id)) throw Object.assign(new Error('SCENARIO_EVENT_ID_DUPLICATE'), { details: [event.id] });
    ids.add(event.id);
    if (index && event.atMilliseconds < events[index - 1].atMilliseconds) {
      throw Object.assign(new Error('SCENARIO_EVENT_ORDER'), { details: [event.id] });
    }
    if (index && event.atMilliseconds === events[index - 1].atMilliseconds
        && EVENT_PRIORITY[event.kind] < EVENT_PRIORITY[events[index - 1].kind]) {
      throw Object.assign(new Error('SCENARIO_EVENT_ORDER'), { details: [event.id] });
    }
  }
  const expectations = events.filter((event) => event.kind === 'expect.pin-level');
  if (expectations.length !== 1 || events.at(-1).kind !== 'expect.pin-level') {
    throw Object.assign(new Error('SCENARIO_EXPECTATION_REQUIRED'), { details: [path] });
  }
  const observationTime = expectations[0].atMilliseconds;
  const inputSlots = new Set();
  for (const event of events.filter((candidate) => candidate.kind.startsWith('input.'))) {
    const slot = `${event.atMilliseconds}:${event.componentId}:${event.kind}`;
    if (inputSlots.has(slot)) {
      throw Object.assign(new Error('SCENARIO_INPUT_CONFLICT'), { details: [event.id] });
    }
    inputSlots.add(slot);
    if (event.atMilliseconds > observationTime - SCENARIO_TIMELINE_LIMITS.settlingMilliseconds) {
      throw Object.assign(new Error('SCENARIO_SETTLING_INTERVAL'), { details: [event.id] });
    }
  }
  if (!events.some((event) => event.kind === 'input.temperature-c' && event.atMilliseconds <= observationTime)
      || !events.some((event) => event.kind === 'input.button-pressed' && event.atMilliseconds <= observationTime)) {
    throw Object.assign(new Error('SCENARIO_INPUTS_REQUIRED'), { details: [path] });
  }
  return { id: stableId(value.id, `${path}.id`), name: boundedText(value.name, `${path}.name`), events };
}

export function normalizeScenarioTimeline(value, profile = SCENARIO_TIMELINE_PROFILE) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'profile', 'experimentId', 'scenarios'])
      || value.schema !== SCENARIO_TIMELINE_SCHEMA
      || value.profile !== SCENARIO_TIMELINE_PROFILE || value.profile !== profile
      || value.experimentId !== THERMOSTAT_EXPERIMENT_ID
      || !Array.isArray(value.scenarios) || value.scenarios.length < 1
      || value.scenarios.length > SCENARIO_TIMELINE_LIMITS.scenarios) {
    throw Object.assign(new Error(profile === SCENARIO_TIMELINE_PROFILE
      ? 'SCENARIO_TIMELINE_SHAPE' : 'SCENARIO_TIMELINE_PROFILE'), { details: ['$scenarioTimeline'] });
  }
  const scenarios = value.scenarios.map((scenario, index) => normalizeScenario(
    scenario, `$scenarioTimeline.scenarios[${index}]`,
  ));
  const ids = new Set();
  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) throw Object.assign(new Error('SCENARIO_ID_DUPLICATE'), { details: [scenario.id] });
    ids.add(scenario.id);
  }
  return { schema: SCENARIO_TIMELINE_SCHEMA, profile: value.profile,
    experimentId: value.experimentId, scenarios };
}

function presetScenario(scenario) {
  return {
    id: scenario.id,
    name: scenario.id === 'THERM-SCENARIO-BELOW-ENABLED' ? 'Below · enabled'
      : scenario.id === 'THERM-SCENARIO-EQUALITY-ENABLED' ? 'Equality · enabled'
        : scenario.id === 'THERM-SCENARIO-ABOVE-ENABLED' ? 'Above · enabled' : 'Below · disabled',
    events: [
      { id: `${scenario.id}-TEMP`, atMilliseconds: 0, kind: 'input.temperature-c',
        componentId: 'temperature-sensor-1', valueC: scenario.sensorControlC },
      { id: `${scenario.id}-BUTTON`, atMilliseconds: 0, kind: 'input.button-pressed',
        componentId: 'enable-button-1', pressed: scenario.buttonPressed },
      { id: `${scenario.id}-D13`, atMilliseconds: 160, throughMilliseconds: 350,
        kind: 'expect.pin-level', pin: 'D13', level: scenario.expectedD13 },
    ],
  };
}

export function defaultThermostatScenarioTimeline() {
  return normalizeScenarioTimeline({
    schema: SCENARIO_TIMELINE_SCHEMA,
    profile: SCENARIO_TIMELINE_PROFILE,
    experimentId: THERMOSTAT_EXPERIMENT_ID,
    scenarios: THERMOSTAT_SCENARIOS.scenarios.map(presetScenario),
  });
}

export function scenarioTimelineControls(scenario) {
  const normalized = normalizeScenarioTimeline({
    schema: SCENARIO_TIMELINE_SCHEMA, profile: SCENARIO_TIMELINE_PROFILE,
    experimentId: THERMOSTAT_EXPERIMENT_ID, scenarios: [scenario],
  }).scenarios[0];
  return normalized.events.filter((event) => event.kind.startsWith('input.')).map((event) => ({
    command: 'control', targetCycle: event.atMilliseconds * 16_000,
    componentId: event.componentId,
    key: event.kind === 'input.temperature-c' ? 'position' : 'pressed',
    value: event.kind === 'input.temperature-c' ? (event.valueC + 50) / 200 : event.pressed,
    eventId: event.id,
  }));
}

export function evaluateScenarioTimelineObservation(scenario, snapshot) {
  const normalized = normalizeScenarioTimeline({
    schema: SCENARIO_TIMELINE_SCHEMA, profile: SCENARIO_TIMELINE_PROFILE,
    experimentId: THERMOSTAT_EXPERIMENT_ID, scenarios: [scenario],
  }).scenarios[0];
  const expectation = normalized.events.at(-1);
  const cycle = snapshot?.cycle;
  const virtualMilliseconds = Number.isSafeInteger(cycle) ? cycle / 16_000 : null;
  const pin = Array.isArray(snapshot?.pins)
    ? snapshot.pins.find((entry) => entry.pin === expectation.pin) ?? null : null;
  const logged = Array.isArray(snapshot?.eventLog?.log)
    ? snapshot.eventLog.log.filter((event) => event.type === 'control') : [];
  const required = scenarioTimelineControls(normalized);
  const inputsComplete = snapshot?.eventLog?.dropped === 0 && required.every((control) => logged.some(
    (event) => event.componentId === control.componentId && event.key === control.key
      && event.value === control.value && event.targetCycle === control.targetCycle,
  ));
  const captureWindow = {
    minimumMilliseconds: expectation.atMilliseconds,
    maximumMilliseconds: expectation.throughMilliseconds,
  };
  const timeInWindow = virtualMilliseconds !== null
    && virtualMilliseconds >= captureWindow.minimumMilliseconds
    && virtualMilliseconds <= captureWindow.maximumMilliseconds;
  const pinObserved = Boolean(pin) && typeof pin.level === 'boolean';
  const primaryExecutedPin = pin?.mode === 'OUTPUT' && pin.level === expectation.level;
  const outcome = completedExperimentOutcome({
    evidence: [
      { code: 'OBSERVATION_TIME_OUT_OF_WINDOW', complete: timeInWindow },
      { code: 'OBSERVATION_INPUTS_INCOMPLETE', complete: inputsComplete },
      { code: 'OBSERVATION_PIN_MISSING', complete: pinObserved },
    ],
    assertions: [{ code: 'EXPECTED_PIN_LEVEL_MISMATCH', passed: primaryExecutedPin }],
  });
  return {
    schema: 'intent-mcu-scenario-observation-result@1',
    scenarioId: normalized.id,
    status: outcome.academicStatus,
    outcome,
    virtualMilliseconds,
    expected: { eventId: expectation.id, pin: expectation.pin, level: expectation.level,
      observationWindow: { startMilliseconds: expectation.atMilliseconds,
        endMilliseconds: expectation.throughMilliseconds } },
    observed: { pin: expectation.pin, mode: pin?.mode ?? null,
      level: typeof pin?.level === 'boolean' ? pin.level : null,
      captureWindow,
      inputControls: logged.map(({ componentId, key, value, targetCycle }) => ({ componentId, key, value, targetCycle })) },
    checks: { timeInWindow, inputsComplete, pinObserved, primaryExecutedPin },
  };
}

export class ScenarioTimelineEditor {
  constructor(value = defaultThermostatScenarioTimeline(), historyLimit = 32) {
    this.value = normalizeScenarioTimeline(value);
    this.historyLimit = historyLimit;
    this.undoStack = [];
    this.redoStack = [];
  }

  get timeline() { return clone(this.value); }

  dispatch(command) {
    if (command?.type === 'undo' || command?.type === 'redo') {
      const source = command.type === 'undo' ? this.undoStack : this.redoStack;
      const target = command.type === 'undo' ? this.redoStack : this.undoStack;
      if (!source.length) return failure(command.type === 'undo' ? 'SCENARIO_UNDO_EMPTY' : 'SCENARIO_REDO_EMPTY');
      target.push(this.value); this.value = source.pop();
      return { ok: true, code: command.type === 'undo' ? 'SCENARIO_UNDONE' : 'SCENARIO_REDONE', timeline: this.timeline };
    }
    const draft = this.timeline;
    try {
      if (command?.type === 'scenario.add') draft.scenarios.push(clone(command.scenario));
      else {
        const scenario = draft.scenarios.find((item) => item.id === command?.scenarioId);
        if (!scenario) throw Object.assign(new Error('SCENARIO_NOT_FOUND'), { details: [command?.scenarioId] });
        if (command.type === 'scenario.delete') draft.scenarios = draft.scenarios.filter((item) => item.id !== command.scenarioId);
        else if (command.type === 'scenario.rename') scenario.name = command.name;
        else if (command.type === 'event.add') scenario.events.splice(-1, 0, clone(command.event));
        else {
          const index = scenario.events.findIndex((item) => item.id === command?.eventId);
          if (index < 0) throw Object.assign(new Error('SCENARIO_EVENT_NOT_FOUND'), { details: [command?.eventId] });
          if (command.type === 'event.update') scenario.events[index] = clone(command.event);
          else if (command.type === 'event.delete') scenario.events.splice(index, 1);
          else throw new Error('SCENARIO_COMMAND_UNSUPPORTED');
        }
        if (['event.add', 'event.update'].includes(command.type)) {
          scenario.events.sort((left, right) => left.atMilliseconds - right.atMilliseconds
            || EVENT_PRIORITY[left.kind] - EVENT_PRIORITY[right.kind] || left.id.localeCompare(right.id));
        }
      }
      const accepted = normalizeScenarioTimeline(draft);
      this.undoStack.push(this.value);
      if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
      this.redoStack = [];
      this.value = accepted;
      return { ok: true, code: 'SCENARIO_TIMELINE_UPDATED', timeline: this.timeline };
    } catch (error) {
      return failure(error.code ?? error.message ?? 'SCENARIO_COMMAND_REJECTED', error.details ?? []);
    }
  }
}
