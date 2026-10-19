// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  BOUNDED_ACTIONS, boundedActionRequest, createBoundedActionRouter,
} from '../../src/bounded-action-contracts.mjs';
import { externalClientResult } from '../../src/external-client-results.mjs';
import {
  THERMOSTAT_SCENARIOS, evaluateThermostatObservation, thermostatScenarioControls,
} from '../../src/thermostat-experiment-contract.mjs';
import { completedExperimentOutcome } from '../../src/experiment-outcomes.mjs';

const profile = 'board.atmega328p-16mhz-v1';
let now = 1_800_000_000_000;
const generation = 4;
let releaseBusy;
const busyWait = new Promise((resolve) => { releaseBusy = resolve; });
const handlers = Object.fromEntries(BOUNDED_ACTIONS.map((action) => [action, async () => ({
  ok: true, code: `${action.toUpperCase()}_OK`,
})]));
handlers['project.validate'] = async (_payload, { request, signal }) => {
  if (request.requestId === 'x11-busy-holder') { await busyWait; return { ok: true, code: 'VALIDATED' }; }
  if (request.requestId === 'x11-timeout-request') {
    await new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('fixture timeout')), { once: true });
    });
  }
  return { ok: true, code: 'VALIDATED' };
};
handlers['firmware.build'] = async (_payload, { signal }) => new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => reject(new Error('fixture cancellation')), { once: true });
});
const router = createBoundedActionRouter({ handlers,
  currentContext: () => ({ profile, generation }), now: () => now });
const request = (action, id, ttlMs = 5_000) => boundedActionRequest(action, profile, generation, {}, {
  now, ttlMs, requestId: id,
});
const envelope = (raw, id, action = 'project.validate') => externalClientResult(raw, {
  requestId: id, action, profile, expectedGeneration: generation,
}, { product: 'Intent MCU Simulator', version: 'controlled-test-fixture',
  source: 'https://github.com/finnandrehotvedt/intent-mcu-simulator', license: 'Apache-2.0', generated: false });

const outputs = [];
outputs.push(envelope(await router.execute(request('result.read', 'x11-success-request')), 'x11-success-request', 'result.read'));
outputs.push(envelope(await router.execute('{"schema":"bad"}'), 'x11-invalid-request'));
const unsupported = JSON.parse(request('result.read', 'x11-unsupported-request'));
unsupported.action = 'invented.action';
outputs.push(envelope(await router.execute(JSON.stringify(unsupported)), 'x11-unsupported-request', 'invented.action'));

const holder = router.execute(request('project.validate', 'x11-busy-holder'));
await new Promise((resolve) => setTimeout(resolve, 0));
const busyRaw = await router.execute(request('result.read', 'x11-busy-request'));
outputs.push(envelope(busyRaw, 'x11-busy-request', 'result.read'));
releaseBusy(); await holder;

const timeoutPromise = router.execute(request('project.validate', 'x11-timeout-request', 2));
await new Promise((resolve) => setTimeout(resolve, 5)); now += 5;
const timeoutRaw = await timeoutPromise;
outputs.push(envelope(timeoutRaw, 'x11-timeout-request'));

const cancelPromise = router.execute(request('firmware.build', 'x11-cancel-request'));
await new Promise((resolve) => setTimeout(resolve, 0));
router.cancel('x11-cancel-request');
const cancelRaw = await cancelPromise;
outputs.push(envelope(cancelRaw, 'x11-cancel-request', 'firmware.build'));

const scenario = THERMOSTAT_SCENARIOS.scenarios[1];
const controls = thermostatScenarioControls(scenario.id).map((control, index) => ({
  sequence: index + 1, targetCycle: 0, type: 'control',
  componentId: control.componentId, key: control.key, value: control.value,
}));
const observation = evaluateThermostatObservation(scenario.id, {
  cycle: 2_560_000,
  pins: [{ pin: 'D13', mode: 'OUTPUT', level: true }],
  eventLog: { pending: [], log: controls, dropped: 0 },
  instruments: { serial: { text: 'TEMP_C=30 BUTTON=PRESSED HEATER=ON STATE=HEAT\n', dropped: 0 } },
});
const completeFailureOutcome = completedExperimentOutcome({ assertions: [
  { code: 'EXPECTED_PIN_LEVEL_MISMATCH', passed: false },
] });
const completeFailure = {
  schema: 'intent-mcu-scenario-observation-result@1',
  sourceSha256: 'b'.repeat(64), artifactSha256: 'a'.repeat(64),
  scenarioId: scenario.id, status: 'failed', outcome: completeFailureOutcome,
  expected: { observationWindow: { startMilliseconds: 160, endMilliseconds: 350 } },
  observed: { level: false, captureWindow: { minimumMilliseconds: 160, maximumMilliseconds: 350 },
    inputControls: controls },
  checks: { pinObserved: true }, retention: { inputEventsDropped: 0, serialEventsDropped: 0 },
};
outputs.push(envelope({
  ok: false, schema: 'intent-mcu-bounded-action-result@1', code: 'ACTION_TEST_EVALUATED',
  action: 'result.read', executed: true,
  result: { ok: false, code: 'ACTION_TEST_EVALUATED', testEvidence: {
    schema: 'intent-mcu-bounded-test-evidence@1', experimentId: observation.experimentId,
    status: 'failed', outcome: completeFailureOutcome,
    artifactIdentity: 'a'.repeat(64), sourceIdentity: 'b'.repeat(64),
    primaryObservation: completeFailure, observations: [completeFailure],
  } },
}, 'x11-known-bad-request', 'result.read'));
outputs.push(envelope({ ok: false, code: 'BROKER_FAILED', executed: true }, 'x11-execution-failure'));

process.stdout.write(JSON.stringify({
  fixture: true,
  categories: outputs.map(({ category }) => category),
  busySourceCode: busyRaw.code,
  timeoutSourceCode: timeoutRaw.code,
  cancelSourceCode: cancelRaw.code,
  knownBadProducerStatus: observation.status,
  knownBadEvidenceKind: 'deterministic-evaluator-fixture',
  productionOverloadUsed: false,
  productionRuntimeClaimed: false,
}));
