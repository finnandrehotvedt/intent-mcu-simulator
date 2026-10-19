// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { resolveDigitalDrivers } from './circuit-engine.mjs';
import {
  X33_DIGITAL_STATE_SUITE, digitalStateOutcome, prepareDigitalStateEvidence,
  validateDigitalStateAnnotations,
} from './digital-state-contract.mjs';

function rowFor(plan) {
  const observed = new Set(plan.observedProducerIds);
  const annotations = plan.producers.filter((item) => observed.has(item.producerId));
  const prepared = prepareDigitalStateEvidence(plan, annotations);
  if (prepared.missingProducerIds.length) return {
    caseId: plan.caseId, netId: plan.netId, requirementId: plan.requirementId,
    producerAnnotations: prepared.annotations, missingProducerIds: prepared.missingProducerIds,
    resolution: { status: 'not-evaluated', state: null },
    validation: { status: 'not-run-incomplete', code: 'SIGNAL_EVIDENCE_MISSING' },
    disposition: 'unknown-evidence', outcome: digitalStateOutcome('unknown-evidence'),
  };
  const state = resolveDigitalDrivers(prepared.annotations.map((item) => item.level));
  const disposition = state === 'LOW' ? 'resolved-low' : state === 'HIGH_Z' ? 'high-impedance'
    : state === 'CONFLICT' ? 'conflict' : 'unsupported-state';
  if (disposition === 'unsupported-state') throw new Error('DIGITAL_STATE_RESOLUTION_UNEXPECTED');
  return {
    caseId: plan.caseId, netId: plan.netId, requirementId: plan.requirementId,
    producerAnnotations: prepared.annotations, missingProducerIds: [],
    resolution: { status: 'resolved', state },
    validation: state === 'CONFLICT'
      ? { status: 'rejected-before-execution', code: 'OUTPUT_CONTENTION' }
      : { status: 'accepted', code: 'OK' },
    disposition, outcome: digitalStateOutcome(disposition),
  };
}

export function runDigitalStateRepeat(repeat, suite = X33_DIGITAL_STATE_SUITE) {
  if (!suite.repeats.includes(repeat)) throw new Error('DIGITAL_STATE_REPEAT_UNKNOWN');
  const pullupAnnotations = validateDigitalStateAnnotations(suite.pullupCompanion.producers);
  const pullupState = resolveDigitalDrivers(pullupAnnotations.map((item) => item.level));
  return structuredClone({
    repeat,
    rows: suite.cases.map(rowFor),
    pullupCompanion: {
      caseId: suite.pullupCompanion.caseId, netId: suite.pullupCompanion.netId,
      producerAnnotations: pullupAnnotations, resolution: pullupState,
      status: pullupState === suite.pullupCompanion.expectedState ? 'completed-supported' : 'mismatch',
      code: pullupState === suite.pullupCompanion.expectedState ? 'OK' : 'PULLUP_MISMATCH',
    },
  });
}
