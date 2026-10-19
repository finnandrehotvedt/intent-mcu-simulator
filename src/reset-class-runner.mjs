// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { DEFAULT_CIRCUIT } from './default-circuit.mjs';
import { RuntimeKernel } from './runtime-kernel.mjs';
import { X31_RESET_CLASS_SUITE, evaluateResetClassExecution, validateResetClass } from './reset-class-contract.mjs';

function state(kernel, artifactSha256, priorResultPresent) {
  const snapshot = kernel.snapshot();
  return { artifactSha256, cpuCycles: snapshot.cycle, instructions: snapshot.instructions,
    volatileByte: kernel.adapter.cpu.data[X31_RESET_CLASS_SUITE.fixture.volatileAddress],
    controls: { potPosition: snapshot.circuit.controls['pot-1'].position,
      buttonPressed: snapshot.circuit.controls['button-1'].pressed },
    pending: snapshot.eventLog.pending.length, inputLog: snapshot.eventLog.log.length,
    trace: snapshot.trace.length, serial: snapshot.serial.length, faults: snapshot.faultEvents.length,
    priorResultPresent };
}
function dirty(kernel) {
  kernel.queueControlAtCycle('pot-1', 'position', 0.75, 0);
  kernel.queueControlAtCycle('button-1', 'pressed', true, 0);
  kernel.queueControlAtCycle('pot-1', 'position', 0.9, 1_000_000);
  kernel.adapter.cpu.data[X31_RESET_CLASS_SUITE.fixture.volatileAddress] = X31_RESET_CLASS_SUITE.fixture.dirtyValue;
  kernel.adapter.trace.push({ cycle: 17, pin: 13, level: true });
  kernel.adapter.serial.push({ direction: 'tx', cycle: 23, value: 88, baud: 9_600, frameCycles: 16_640 });
  kernel.adapter.faultEvents.push({ kind: 'x31-fixture-dirty', cycle: 29 });
}

export function executeResetClass({ hex, artifactSha256, resetClass, repeat,
  workerGenerationRetired = false }) {
  validateResetClass(resetClass);
  let kernel = new RuntimeKernel(hex, DEFAULT_CIRCUIT, { speed: 'maximum',
    logicChannels: ['D13', 'D2'], serialHistoryLimit: 512 });
  dirty(kernel);
  const before = state(kernel, artifactSha256, true);
  if (resetClass === 'cpu-reset') kernel.reset();
  else {
    kernel = new RuntimeKernel(hex, DEFAULT_CIRCUIT, { speed: 'maximum',
      logicChannels: ['D13', 'D2'], serialHistoryLimit: 512 });
    if (resetClass === 'experiment-restart') {
      kernel.queueControlAtCycle('pot-1', 'position', 0.25, 0);
      kernel.queueControlAtCycle('button-1', 'pressed', false, 0);
    }
  }
  const execution = { executionId: `X31-${resetClass.toUpperCase()}-${repeat}`,
    resetClass, repeat, before, after: state(kernel, artifactSha256, false),
    workerGenerationRetired, outcome: null,
    diagnostics: { fixtureOnlyMemoryAddress: X31_RESET_CLASS_SUITE.fixture.volatileAddress } };
  execution.outcome = evaluateResetClassExecution({ ...execution,
    outcome: { schema: 'intent-mcu-experiment-outcome@1', academicStatus: 'passed', jobStatus: 'completed' } });
  return structuredClone(execution);
}
