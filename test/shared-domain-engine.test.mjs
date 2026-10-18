// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';
import { createRp2040PicoCircuitDraft, validateRp2040PicoCircuit } from '../src/rp2040-pico-circuit.mjs';
import { normalizeRp2040PublicProject, RP2040_PUBLIC_PROJECT_SCHEMA, RP2040_PUBLIC_SOURCE } from '../src/rp2040-public-workbench.mjs';
import { CONTACT_PERSISTENCE_SCHEMA } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createThermostatExperiment, openThermostatExperiment } from '../src/thermostat-experiment.mjs';
import { THERMOSTAT_SCENARIOS, thermostatExpectedSerialLine, thermostatScenarioControls } from '../src/thermostat-experiment-contract.mjs';
import { DOMAIN_REQUEST_SCHEMA, SHARED_DOMAIN_ENGINE_SCHEMA, domainRequest, executeDomainRequest } from '../src/shared-domain-engine.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const PICO = 'board.rp2040-pico-v1'; const AVR = 'board.atmega328p-16mhz-v1';
const picoAdapters = Object.freeze({
  [PICO]: Object.freeze({ schemas: Object.freeze([RP2040_PUBLIC_PROJECT_SCHEMA]),
    prepare: (value) => ({ project: normalizeRp2040PublicProject(value) }),
    electrical: (prepared) => validateRp2040PicoCircuit(prepared.project.circuit) }),
});
const picoProject = () => ({ schema: RP2040_PUBLIC_PROJECT_SCHEMA, name: 'X07 Pico', profile: PICO,
  source: RP2040_PUBLIC_SOURCE, circuit: createRp2040PicoCircuitDraft() });
const picoEnvelope = () => canonicalProjectEnvelope(PICO, picoProject(), picoAdapters, emptyProjectBrief());

const thermostatAdapters = Object.freeze({
  [AVR]: Object.freeze({ schemas: Object.freeze([CONTACT_PERSISTENCE_SCHEMA]),
    prepare(value) {
      const opened = openThermostatExperiment(JSON.stringify(value));
      if (!opened.ok) throw Object.assign(new Error(opened.code), { code: opened.code, details: opened.details ?? [] });
      return { project: JSON.parse(opened.session.saveText()), prepared: opened.session };
    },
    electrical: (prepared) => prepared.prepared.runnable }),
});

function snapshotFor(scenario, { d13 = scenario.expectedD13, serial = true } = {}) {
  const controls = thermostatScenarioControls(scenario.id).map((control, index) => ({ sequence: index + 1,
    targetCycle: 0, type: 'control', componentId: control.componentId, key: control.key, value: control.value }));
  return { cycle: 2_560_000, pins: [{ pin: 'D13', mode: 'OUTPUT', level: d13 }],
    eventLog: { pending: [], log: controls, dropped: 0 }, instruments: { serial: { dropped: 0,
      text: serial ? `${thermostatExpectedSerialLine(scenario.id)}\n` : 'LED ON PASSED\n' } } };
}

test('X07 UI and agent project admission use the same project and electrical owners', async () => {
  const request = domainRequest('validate-project', picoEnvelope());
  const ui = await executeDomainRequest(request, picoAdapters, PICO, 'ui');
  const agent = await executeDomainRequest(request, picoAdapters, PICO, 'agent');
  assert.equal(ui.ok, true); assert.equal(agent.ok, true); assert.equal(ui.engine, SHARED_DOMAIN_ENGINE_SCHEMA);
  assert.equal(ui.projectSha256, agent.projectSha256); assert.deepEqual(ui.stages, agent.stages);
  assert.equal(ui.stages.project, 'prepareProjectEnvelope');
  assert.equal(ui.stages.electrical, 'OK'); assert.equal(ui.mutation, false); assert.equal(ui.buildAuthority, false);
  assert.deepEqual({ ...ui, caller: null }, { ...agent, caller: null });
});

test('X07 UI and agent delegate exact thermostat evidence to the same test engine', async () => {
  const experiment = createThermostatExperiment();
  const text = canonicalProjectEnvelope(AVR, experiment.project, thermostatAdapters, emptyProjectBrief());
  const scenario = THERMOSTAT_SCENARIOS.scenarios[0];
  const request = domainRequest('evaluate-thermostat-observation', text,
    { scenarioId: scenario.id, snapshot: snapshotFor(scenario) });
  const ui = await executeDomainRequest(request, thermostatAdapters, AVR, 'ui');
  const agent = await executeDomainRequest(request, thermostatAdapters, AVR, 'agent');
  assert.equal(ui.observation.status, 'passed'); assert.deepEqual(ui.observation, agent.observation);
  assert.equal(ui.stages.tests, 'evaluateThermostatObservation');
  const serialOnly = JSON.parse(request); serialOnly.snapshot.pins = [];
  const rejectedClaim = await executeDomainRequest(JSON.stringify(serialOnly), thermostatAdapters, AVR, 'agent');
  assert.equal(rejectedClaim.observation.status, 'failed');
  assert.equal(rejectedClaim.observation.checks.primaryExecutedPin, false);
  assert.equal(rejectedClaim.observation.checks.corroboratingSerial, true);
});

test('X07 strict requests reject unknown fields actions profiles and authority-bearing projects', async () => {
  const text = picoEnvelope();
  assert.equal((await executeDomainRequest(JSON.stringify({ schema: DOMAIN_REQUEST_SCHEMA,
    action: 'validate-project', projectText: text, bypass: true }), picoAdapters, PICO, 'agent')).code,
  'DOMAIN_REQUEST_SHAPE');
  assert.equal((await executeDomainRequest(domainRequest('build', text), picoAdapters, PICO, 'agent')).code,
  'DOMAIN_ACTION_UNSUPPORTED');
  assert.equal((await executeDomainRequest(domainRequest('validate-project', text), picoAdapters,
    AVR, 'agent')).code, 'DOMAIN_PROFILE_MISMATCH');
  const authority = JSON.parse(text); authority.project.runtime = { verdict: 'passed' };
  assert.equal((await executeDomainRequest(domainRequest('validate-project', JSON.stringify(authority)),
    picoAdapters, PICO, 'agent')).code, 'DOMAIN_PROJECT_REJECTED');
  const duplicate = domainRequest('validate-project', text).replace(`"schema":"${DOMAIN_REQUEST_SCHEMA}"`,
    `"schema":"${DOMAIN_REQUEST_SCHEMA}","schema":"${DOMAIN_REQUEST_SCHEMA}"`);
  assert.notEqual((await executeDomainRequest(duplicate, picoAdapters, PICO, 'agent')).ok, true);
});

test('X07 invalid electrical projects reject before any test evaluator', async () => {
  const invalidAdapters = { [PICO]: { ...picoAdapters[PICO], electrical: () => ({ ok: false, code: 'WIRE_OPEN' }) } };
  const result = await executeDomainRequest(domainRequest('validate-project', picoEnvelope()), invalidAdapters, PICO, 'agent');
  assert.equal(result.code, 'DOMAIN_ELECTRICAL_REJECTED'); assert.equal(result.evaluated, false);
  assert.equal(result.buildAuthority, false);
});
