// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { DEFAULT_CIRCUIT } from './default-circuit.mjs';
import { RuntimeKernel } from './runtime-kernel.mjs';
import { Rp2040ExperimentalRuntime } from './rp2040-experimental-runtime.mjs';
import { createRuntimeCommand } from '../expansion-drafts/controller-runtime-bridge-v1.mjs';

let runtime = null; let participantId = null; let owner = null; let disposed = false;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const reply = (requestId, ok, value) => postMessage(ok ? { requestId, ok, value }
  : { requestId, ok, code: value.code ?? value.message ?? 'X37_ORDINARY_WORKER_FAILED' });
const snapshot = () => typeof runtime.x37ProbeSnapshot === 'function' ? runtime.x37ProbeSnapshot() : runtime.snapshot();
const pinState = (value) => value.pins.find(({ pin }) => pin === (participantId === 'avr' ? 'D13' : 'GPIO0'));

async function initialize(value, id) {
  if (runtime || disposed || !['avr', 'rp'].includes(id)) fail('X37_ORDINARY_WORKER_INIT_INVALID');
  participantId = id; owner = { participantId: id, projectGeneration: value.projectGeneration, runtimeGeneration: value.runtimeGeneration };
  runtime = id === 'avr' ? new RuntimeKernel(value.artifact.hex, DEFAULT_CIRCUIT, { logicChannels: ['D13', 'D2'] })
    : await Rp2040ExperimentalRuntime.create({ format: value.artifact.format,
      bytes: new Uint8Array(value.artifact.bytes), expectedSha256: value.artifact.expectedSha256 });
  const state = snapshot(); return { owner, cycle: state.cycle };
}

function advance(value) {
  if (!runtime || disposed || typeof value.inputLevel !== 'boolean') fail('X37_ORDINARY_WORKER_ADVANCE_INVALID');
  if (participantId === 'avr') runtime.queueDigitalSequence([{ offsetCycles: 1, pin: 2, level: value.inputLevel }]);
  else {
    const targetCycle = runtime.adapter.machineSnapshot().cycle;
    runtime.requestId += 1; runtime.adapter.handle(createRuntimeCommand(runtime.requestId, 'digital-input', {
      pin: 'GPIO1', level: value.inputLevel, targetCycle,
    }));
  }
  const before = snapshot(); const beforePin = pinState(before); let steps = 0; let state = before;
  while (steps < Math.min(value.instructionLimit, 32_768)) {
    if (typeof runtime.x37Step === 'function') runtime.x37Step(); else runtime.step();
    steps += 1; state = snapshot(); const pin = pinState(state);
    if (pin?.mode !== beforePin?.mode || pin?.level !== beforePin?.level) break;
  }
  runtime.x37CommitAdvanceProgress?.(); const pin = pinState(state);
  const mode = ['OUTPUT', 'DIGITAL_PWM'].includes(pin?.mode) ? 'DRIVE' : 'RELEASE';
  return { complete: Boolean(state.halted), observations: [{ participantId, pin: participantId === 'avr' ? 'D13' : 'GPIO0',
    localCycle: state.cycle, mappedTick: value.turn, mode, ...(mode === 'DRIVE' ? { level: pin.level } : {}) }] };
}

self.addEventListener('message', async ({ data }) => {
  if (data?.schema !== 'intent-mcu-x37-worker-rpc@1' || typeof data.requestId !== 'string') return;
  try {
    let value;
    if (data.command === 'init') value = await initialize(data.value, data.participantId);
    else if (data.command === 'advance') value = advance(data.value);
    else if (data.command === 'pause') { runtime?.pause(); value = { paused: true }; }
    else if (data.command === 'reset') { value = runtime?.reset(); }
    else if (data.command === 'dispose') { runtime?.pause(); runtime?.dispose?.(); runtime = null; disposed = true; value = { disposed: true }; }
    else fail('X37_ORDINARY_WORKER_COMMAND_INVALID');
    reply(data.requestId, true, value);
  } catch (error) { reply(data.requestId, false, error); }
});
