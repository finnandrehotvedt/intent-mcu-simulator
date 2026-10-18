// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { normalizeBuildRequestValue, sha256, sourceDigest } from '../compiler/build-protocol.mjs';
import { RuntimeKernel } from './runtime-kernel.mjs';
import { prepareProjectEnvelope } from './project-envelope.mjs';
import { domainRequest, executeDomainRequest } from './shared-domain-engine.mjs';
import { compileHeadlessAvr } from './headless-compiler-client.mjs';
import {
  THERMOSTAT_PROJECT_ADAPTER, isThermostatExperimentProject, thermostatFirmwareVariant,
} from './thermostat-experiment.mjs';
import {
  THERMOSTAT_EXPERIMENT_ID, THERMOSTAT_SCENARIOS, THERMOSTAT_TIME, thermostatScenarioControls,
} from './thermostat-experiment-contract.mjs';
import { scenarioTimelineRuntimeEvents } from './scenario-timeline.mjs';
import {
  aggregateExperimentOutcomes, interruptedExperimentOutcome, jobStatusFromCode,
  unsupportedExperimentOutcome,
} from './experiment-outcomes.mjs';

export const HEADLESS_EXPERIMENT_RESULT_SCHEMA = 'intent-mcu-headless-experiment-result@1';
export const HEADLESS_SUPPORTED_PROFILES = Object.freeze(['board.atmega328p-16mhz-v1']);
export const HEADLESS_UNAVAILABLE_PROFILES = Object.freeze({
  'board.rp2040-pico-v1': 'HEADLESS_RUNTIME_NOT_IMPLEMENTED',
  'board.esp32-c3-devmodule-v1': 'HEADLESS_RUNTIME_NOT_IMPLEMENTED',
  'board.stm32f429zi-nucleo144-v1': 'HEADLESS_RUNTIME_NOT_IMPLEMENTED',
});
const AVR_PROFILE = HEADLESS_SUPPORTED_PROFILES[0];
const SHA256 = /^[a-f0-9]{64}$/u;
const adapters = Object.freeze({ [AVR_PROFILE]: THERMOSTAT_PROJECT_ADAPTER });
const clone = (value) => structuredClone(value);

const failure = (code, details = []) => {
  const unsupported = code.includes('UNSUPPORTED');
  const jobStatus = code.includes('CANCEL') || code.includes('TIMEOUT')
    ? jobStatusFromCode(code) : 'not-started';
  const outcome = unsupported ? unsupportedExperimentOutcome(code)
    : interruptedExperimentOutcome(jobStatus, code);
  return {
    schema: HEADLESS_EXPERIMENT_RESULT_SCHEMA, ok: false, code, details,
    executed: false, browserUsed: false, authorityRestoredFromFile: false,
    jobStatus: outcome.jobStatus, status: outcome.academicStatus, outcome,
  };
};
const runtimeFailure = (code, details = []) => {
  const outcome = interruptedExperimentOutcome(jobStatusFromCode(code), code);
  return { ...failure(code, details), jobStatus: outcome.jobStatus,
    status: outcome.academicStatus, outcome };
};

export async function prepareSavedHeadlessExperiment(projectText) {
  const prepared = prepareProjectEnvelope(projectText, adapters);
  if (!prepared.ok) {
    const unsupported = prepared.code === 'PROJECT_ENVELOPE_PROFILE'
      && prepared.details?.some((profile) => Object.hasOwn(HEADLESS_UNAVAILABLE_PROFILES, profile));
    return failure(unsupported ? 'HEADLESS_PROFILE_UNSUPPORTED' : 'HEADLESS_PROJECT_REJECTED',
      [prepared.code, ...(prepared.details ?? [])]);
  }
  if (prepared.profile !== AVR_PROFILE) return failure('HEADLESS_PROFILE_UNSUPPORTED', [prepared.profile]);
  if (!isThermostatExperimentProject(prepared.project)) {
    return failure('HEADLESS_EXPERIMENT_UNSUPPORTED', [prepared.profile]);
  }
  const firmwareVariant = thermostatFirmwareVariant(prepared.project);
  if (!['correct', 'known-bad-equality'].includes(firmwareVariant)) {
    return failure('HEADLESS_EXPERIMENT_SOURCE_MODIFIED', [firmwareVariant]);
  }
  const files = prepared.project?.project?.source?.files;
  if (!Array.isArray(files)) return failure('HEADLESS_SOURCE_REQUIRED');
  const buildRequest = normalizeBuildRequestValue({
    schema: 'teach-lab-build-request@1', board: AVR_PROFILE,
    files: files.map(({ name, content }) => ({ name, content })),
  });
  return {
    ok: true, code: 'HEADLESS_PROJECT_ACCEPTED', profile: AVR_PROFILE,
    experimentId: THERMOSTAT_EXPERIMENT_ID, firmwareVariant,
    project: clone(prepared.project), canonicalProjectText: prepared.canonical,
    runtimeProject: clone(prepared.prepared.runtimeProject),
    scenarioTimeline: clone(prepared.scenarioTimeline),
    projectSha256: sha256(prepared.canonical),
    sourceDigest: sourceDigest(buildRequest), buildRequest,
    authorityRestoredFromFile: false,
  };
}

async function executeCompiledThermostat(prepared, artifact) {
  const observations = [];
  const authored = prepared.scenarioTimeline?.scenarios ?? null;
  for (const scenario of authored ?? THERMOSTAT_SCENARIOS.scenarios) {
    const runtime = new RuntimeKernel(artifact.artifact.hex, prepared.runtimeProject.circuit, {
      speed: 'maximum', logicChannels: ['D2', 'D13'], selectedPin: 'D13',
    });
    const controls = authored ? scenarioTimelineRuntimeEvents(scenario)
      : thermostatScenarioControls(scenario.id).map((control) => ({ ...control, targetCycle: 0 }));
    for (const control of controls.filter((item) => item.command === 'fault')) {
      runtime.queueFaultAtCycle(control.event, control.targetCycle);
    }
    for (const control of controls.filter((item) => item.command !== 'fault')) {
      runtime.runUntilCycle(control.targetCycle);
      runtime.queueControlAtCycle(control.componentId, control.key, control.value, control.targetCycle);
    }
    const observationMilliseconds = authored ? scenario.events.at(-1).atMilliseconds
      : THERMOSTAT_TIME.observeAtOrAfterMilliseconds;
    runtime.runUntilCycle(observationMilliseconds * 16_000);
    const snapshot = runtime.snapshot();
    const evaluated = await executeDomainRequest(domainRequest(
      authored ? 'evaluate-scenario-timeline-observation' : 'evaluate-thermostat-observation', prepared.canonicalProjectText,
      { scenarioId: scenario.id, snapshot: {
        cycle: snapshot.cycle, pins: snapshot.pins, eventLog: snapshot.eventLog,
        faultEvents: snapshot.faultEvents,
        instruments: { serial: snapshot.instruments.serial },
      } },
    ), adapters, AVR_PROFILE, 'agent');
    if (!evaluated.ok || !evaluated.observation) {
      throw Object.assign(new Error('HEADLESS_SCENARIO_EVALUATION_FAILED'), {
        code: 'HEADLESS_SCENARIO_EVALUATION_FAILED', details: [scenario.id, evaluated.code],
      });
    }
    observations.push(evaluated.observation);
  }
  return observations;
}

export async function runSavedHeadlessExperiment(projectText, {
  compile = compileHeadlessAvr, execute = executeCompiledThermostat, signal,
} = {}) {
  try {
    const prepared = await prepareSavedHeadlessExperiment(projectText);
    if (!prepared.ok) return prepared;
    const artifact = await compile(prepared.buildRequest, { signal });
    if (!SHA256.test(artifact?.inputIdentity) || !SHA256.test(artifact?.artifactIdentity)
        || typeof artifact?.artifact?.hex !== 'string') return runtimeFailure('HEADLESS_BUILD_RESULT_INVALID');
    const observations = await execute(prepared, artifact);
    const expectedObservationCount = prepared.scenarioTimeline?.scenarios.length
      ?? THERMOSTAT_SCENARIOS.scenarios.length;
    if (!Array.isArray(observations) || observations.length !== expectedObservationCount) {
      return runtimeFailure('HEADLESS_OBSERVATION_SET_INVALID');
    }
    const outcome = aggregateExperimentOutcomes(observations);
    const primaryObservation = observations.find((item) => item.status === 'failed')
      ?? observations.find((item) => item.status === 'indeterminate')
      ?? observations.find((item) => item.status === 'unsupported') ?? observations.at(-1);
    return {
      schema: HEADLESS_EXPERIMENT_RESULT_SCHEMA,
      ok: true,
      code: 'HEADLESS_EXPERIMENT_COMPLETED',
      executed: true,
      browserUsed: false,
      authorityRestoredFromFile: false,
      compiledFresh: true,
      jobStatus: outcome.jobStatus,
      profile: prepared.profile,
      experimentId: prepared.experimentId,
      firmwareVariant: prepared.firmwareVariant,
      status: outcome.academicStatus,
      outcome,
      association: {
        projectSha256: prepared.projectSha256,
        sourceDigest: prepared.sourceDigest,
        scenarioTimelineSha256: prepared.scenarioTimeline
          ? sha256(JSON.stringify(prepared.scenarioTimeline)) : null,
        compilerInputIdentity: artifact.inputIdentity,
        artifactIdentity: artifact.artifactIdentity,
      },
      primaryObservation: clone(primaryObservation),
      observations: clone(observations),
    };
  } catch (error) {
    const code = error.code ?? error.message ?? 'HEADLESS_EXPERIMENT_FAILED';
    return runtimeFailure(code, error.details ?? []);
  }
}
