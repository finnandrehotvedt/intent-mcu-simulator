// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { normalizeBuildRequestValue, sourceDigest } from '../compiler/build-protocol.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope } from '../src/project-envelope.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { domainRequest, executeDomainRequest } from '../src/shared-domain-engine.mjs';
import { compileHeadlessAvr } from '../src/headless-compiler-client.mjs';
import {
  THERMOSTAT_PROJECT_ADAPTER, createThermostatExperiment, openThermostatExperiment,
} from '../src/thermostat-experiment.mjs';
import {
  THERMOSTAT_SCENARIOS, thermostatScenarioControls,
} from '../src/thermostat-experiment-contract.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const adapters = Object.freeze({ [AVR]: THERMOSTAT_PROJECT_ADAPTER });

function projectText(variant) {
  const experiment = createThermostatExperiment(variant);
  return canonicalProjectEnvelope(AVR, experiment.project, adapters, emptyProjectBrief());
}

async function compileVariant(variant) {
  const text = projectText(variant);
  const prepared = prepareProjectEnvelope(text, adapters);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const request = normalizeBuildRequestValue({
    schema: 'teach-lab-build-request@1', board: AVR,
    files: prepared.project.project.source.files.map(({ name, content }) => ({ name, content })),
  });
  const artifact = await compileHeadlessAvr(request);
  const scenarios = [];
  for (const scenario of THERMOSTAT_SCENARIOS.scenarios) {
    const runtime = new RuntimeKernel(artifact.artifact.hex, prepared.prepared.runtimeProject.circuit, {
      speed: 'maximum', logicChannels: ['D2', 'D13'], selectedPin: 'D13',
    });
    const initial = runtime.snapshot();
    assert.equal(initial.cycle, 0, scenario.id);
    assert.deepEqual(initial.eventLog.log, [], scenario.id);
    for (const control of thermostatScenarioControls(scenario.id)) runtime.queueControl(
      control.componentId, control.key, control.value,
    );
    runtime.runUntilCycle(160 * 16_000);
    const state = runtime.snapshot();
    const snapshot = {
      cycle: state.cycle, pins: state.pins, eventLog: state.eventLog,
      instruments: { serial: state.instruments.serial },
    };
    assert.equal(snapshot.eventLog.log.filter((event) => event.type === 'control').length, 2, scenario.id);
    const evaluated = await executeDomainRequest(domainRequest(
      'evaluate-thermostat-observation', text, { scenarioId: scenario.id, snapshot },
    ), adapters, AVR, 'agent');
    assert.equal(evaluated.ok, true, JSON.stringify(evaluated));
    scenarios.push({ id: scenario.id, initial: { cycle: initial.cycle, eventLog: initial.eventLog },
      snapshot, observation: evaluated.observation });
  }
  return { variant, text, request, artifact, scenarios };
}

const correct = await compileVariant('correct');
assert.equal(correct.scenarios.length, 4);
assert.equal(correct.scenarios.every((entry) => entry.observation.status === 'passed'), true);
const above = correct.scenarios.find((entry) => entry.id === 'THERM-SCENARIO-ABOVE-ENABLED');
assert.equal(above.observation.observed.d13, false);
assert.match(above.observation.observed.serialText, /TEMP_C=31.*HEATER=OFF STATE=HOLD/u);

const knownBad = await compileVariant('known-bad-equality');
const equality = knownBad.scenarios.find((entry) => entry.id === 'THERM-SCENARIO-EQUALITY-ENABLED');
assert.equal(equality.observation.status, 'failed');
assert.equal(equality.observation.observed.d13, true);
assert.equal(knownBad.scenarios.filter((entry) => entry.observation.status === 'passed').length, 3);

const experiment = createThermostatExperiment();
const expectedBreakCodes = new Map([
  ['net-thermostat-5v', 'PROJECT_CONTACT_TEMPERATURE_SENSOR_VCC_DISCONNECTED'],
  ['net-thermostat-ground', 'PROJECT_CONTACT_JUNCTION'],
  ['net-thermostat-temperature', 'PROJECT_CONTACT_TEMPERATURE_SENSOR_AOUT_DISCONNECTED'],
  ['net-thermostat-enable', 'PROJECT_CONTACT_BUTTON_UNSUPPORTED_PATH'],
  ['net-thermostat-heater-drive', 'PROJECT_CONTACT_LED_UNSUPPORTED_PATH'],
  ['net-thermostat-heater-led', 'PROJECT_CONTACT_LED_UNSUPPORTED_PATH'],
]);
const connectionBreaks = [];
for (const [netId, expectedCode] of expectedBreakCodes) {
  const broken = structuredClone(experiment.project);
  broken.candidateCircuit.nets = broken.candidateCircuit.nets.filter((net) => net.id !== netId);
  const result = openThermostatExperiment(JSON.stringify(broken));
  assert.equal(result.ok, false, netId); assert.equal(result.code, expectedCode, netId);
  connectionBreaks.push({ netId, code: result.code, admitted: result.ok });
}

const evidence = {
  schema: 'intent-mcu-x21-boundary-evidence@1', fixture: false,
  adcCountResolutionC: 200 / 1024,
  correct: { projectText: correct.text, sourceDigest: sourceDigest(correct.request), artifactIdentity: correct.artifact.artifactIdentity,
    scenarios: correct.scenarios },
  knownBad: { projectText: knownBad.text, sourceDigest: sourceDigest(knownBad.request), artifactIdentity: knownBad.artifact.artifactIdentity,
    scenarios: knownBad.scenarios },
  connectionBreaks,
  connectionBreakScope: 'pre-execution structural validation; no runtime physical-disconnection claim',
};
const outputPath = process.env.X21_EVIDENCE_PATH;
if (outputPath) await writeFile(outputPath, `${JSON.stringify(evidence)}\n`, { encoding: 'utf8', mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  status: 'pass', fixture: false, adcCountResolutionC: evidence.adcCountResolutionC,
  correct: { passed: correct.scenarios.length, sourceDigest: evidence.correct.sourceDigest,
    artifactIdentity: evidence.correct.artifactIdentity,
    observations: correct.scenarios.map((entry) => ({ id: entry.id, resetCycle: entry.initial.cycle,
      controls: entry.snapshot.eventLog.log.filter((event) => event.type === 'control').length,
      measured: entry.observation.observed.serialText.match(/TEMP_C=(-?\d+)/u)?.[1],
      d13: entry.observation.observed.d13, status: entry.observation.status })) },
  knownBad: { failedScenario: equality.id, failedD13: equality.observation.observed.d13,
    passedControls: knownBad.scenarios.filter((entry) => entry.observation.status === 'passed').length,
    sourceDigest: evidence.knownBad.sourceDigest, artifactIdentity: evidence.knownBad.artifactIdentity },
  connectionBreaks,
  outputPath: outputPath ?? null,
})}\n`);
