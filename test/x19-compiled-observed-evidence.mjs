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
  THERMOSTAT_PROJECT_ADAPTER, createThermostatExperiment,
} from '../src/thermostat-experiment.mjs';
import {
  THERMOSTAT_SCENARIOS, thermostatScenarioControls,
} from '../src/thermostat-experiment-contract.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const adapters = Object.freeze({ [AVR]: THERMOSTAT_PROJECT_ADAPTER });
const scenario = THERMOSTAT_SCENARIOS.scenarios[0];

function projectText({ misleading = false } = {}) {
  const experiment = createThermostatExperiment('correct');
  if (misleading) {
    const file = experiment.project.project.source.files.find((item) => item.name === 'main.ino');
    file.content = file.content.replace(
      'digitalWrite(HEATER_LED_PIN, heating ? HIGH : LOW);',
      'digitalWrite(HEATER_LED_PIN, LOW); // X19 intentional observed-pin defect',
    ).replace(
      'Serial.print(" STATE="); Serial.println(!enabled ? "OFF" : heating ? "HEAT" : "HOLD");',
      'Serial.print(" STATE="); Serial.println(!enabled ? "OFF" : heating ? "HEAT" : "HOLD");\n  Serial.println("LED ON"); // intentionally misleading text-only claim',
    );
  }
  return canonicalProjectEnvelope(AVR, experiment.project, adapters, emptyProjectBrief());
}

async function compileAndObserve(text) {
  const prepared = prepareProjectEnvelope(text, adapters);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const files = prepared.project.project.source.files.map(({ name, content }) => ({ name, content }));
  const request = normalizeBuildRequestValue({ schema: 'teach-lab-build-request@1', board: AVR, files });
  const artifact = await compileHeadlessAvr(request);
  const runtime = new RuntimeKernel(artifact.artifact.hex, prepared.prepared.runtimeProject.circuit, {
    speed: 'maximum', logicChannels: ['D2', 'D13'], selectedPin: 'D13',
  });
  for (const control of thermostatScenarioControls(scenario.id)) {
    runtime.queueControl(control.componentId, control.key, control.value);
  }
  runtime.runUntilCycle(160 * 16_000);
  const state = runtime.snapshot();
  const snapshot = {
    cycle: state.cycle, pins: state.pins, eventLog: state.eventLog,
    instruments: { serial: state.instruments.serial },
  };
  const evaluated = await executeDomainRequest(domainRequest(
    'evaluate-thermostat-observation', text, { scenarioId: scenario.id, snapshot },
  ), adapters, AVR, 'agent');
  assert.equal(evaluated.ok, true, JSON.stringify(evaluated));
  return { text, request, artifact, snapshot, observation: evaluated.observation };
}

const correct = await compileAndObserve(projectText());
assert.equal(correct.observation.status, 'passed');
assert.equal(correct.observation.observed.d13, true);
assert.equal(correct.observation.checks.primaryExecutedPin, true);

const misleading = await compileAndObserve(projectText({ misleading: true }));
assert.equal(misleading.observation.status, 'failed');
assert.equal(misleading.observation.observed.d13, false);
assert.equal(misleading.observation.checks.primaryExecutedPin, false);
assert.equal(misleading.observation.checks.corroboratingSerial, true);
assert.match(misleading.observation.observed.serialText, /LED ON/u);
assert.notEqual(misleading.artifact.artifactIdentity, correct.artifact.artifactIdentity);

const missingSnapshot = structuredClone(misleading.snapshot); missingSnapshot.pins = [];
const missing = await executeDomainRequest(domainRequest(
  'evaluate-thermostat-observation', misleading.text,
  { scenarioId: scenario.id, snapshot: missingSnapshot },
), adapters, AVR, 'agent');
assert.equal(missing.observation.status, 'indeterminate');
assert.equal(missing.observation.outcome.reasons.includes('OBSERVATION_PIN_MISSING'), true);

const evidence = {
  schema: 'intent-mcu-x19-compiled-evidence@1',
  fixture: false,
  scenarioId: scenario.id,
  correct: {
    projectText: correct.text, snapshot: correct.snapshot, observation: correct.observation,
    sourceDigest: sourceDigest(correct.request), artifactIdentity: correct.artifact.artifactIdentity,
  },
  misleading: {
    projectText: misleading.text, snapshot: misleading.snapshot, observation: misleading.observation,
    sourceDigest: sourceDigest(misleading.request), artifactIdentity: misleading.artifact.artifactIdentity,
  },
  missing: { snapshot: missingSnapshot, observation: missing.observation },
};
const outputPath = process.env.X19_EVIDENCE_PATH;
if (outputPath) await writeFile(outputPath, `${JSON.stringify(evidence)}\n`, { encoding: 'utf8', mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  status: 'pass', fixture: false, scenarioId: scenario.id,
  correct: { academic: correct.observation.status, job: correct.observation.outcome.jobStatus,
    d13: correct.observation.observed.d13, serialMatched: correct.observation.checks.corroboratingSerial,
    virtualMilliseconds: correct.observation.virtualMilliseconds,
    sourceDigest: evidence.correct.sourceDigest, artifactIdentity: evidence.correct.artifactIdentity },
  misleading: { academic: misleading.observation.status, job: misleading.observation.outcome.jobStatus,
    d13: misleading.observation.observed.d13, serialMatched: misleading.observation.checks.corroboratingSerial,
    ledOnClaimObserved: /LED ON/u.test(misleading.observation.observed.serialText),
    virtualMilliseconds: misleading.observation.virtualMilliseconds,
    sourceDigest: evidence.misleading.sourceDigest, artifactIdentity: evidence.misleading.artifactIdentity },
  missingPin: { academic: missing.observation.status, job: missing.observation.outcome.jobStatus },
  outputPath: outputPath ?? null,
})}\n`);
