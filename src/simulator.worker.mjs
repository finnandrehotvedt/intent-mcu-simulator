// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { RuntimeKernel } from './runtime-kernel.mjs';

let kernel = null;
let running = false;
let generation = 0;

function status(kind = 'status') {
  const snapshot = kernel.snapshot();
  postMessage({ kind, ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
}

function stopped(kind, error) {
  const snapshot = kernel?.snapshot() ?? { cycle: 0, instructions: 0, paused: true, circuit: { leds: [] } };
  postMessage({
    kind,
    ...snapshot,
    paused: true,
    led: snapshot.circuit.leds.some((item) => item.on),
    message: error instanceof Error ? error.message : String(error),
  });
}

function instructionBudget() {
  if (kernel.adapter.speed === 'maximum') return 100_000;
  return Math.max(500, Math.round(10_000 * kernel.adapter.speed));
}

function pump(activeGeneration) {
  if (!running || activeGeneration !== generation) return;
  try {
    kernel.runInstructions(instructionBudget());
    status();
    setTimeout(() => pump(activeGeneration), 0);
  } catch (error) {
    running = false;
    generation++;
    stopped('stopped-error', error);
  }
}

self.onmessage = ({ data }) => {
  try {
    if (data.command === 'init') {
      running = false;
      generation++;
      kernel = new RuntimeKernel(data.hex, data.circuit, data.instruments ?? {});
      status('ready');
      return;
    }
    if (!kernel) throw new Error('Worker is not initialized');
    if (data.command === 'test-stall') {
      running = false;
      generation++;
      return;
    }
    if (data.command === 'run') {
      if (!running) {
        running = true;
        kernel.run();
        generation++;
        pump(generation);
      }
    } else if (data.command === 'pause') {
      running = false;
      generation++;
      kernel.pause();
      status('paused');
    } else if (data.command === 'step') {
      running = false;
      generation++;
      kernel.pause();
      const step = kernel.step();
      const snapshot = kernel.snapshot();
      postMessage({ kind: 'stepped', step, ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
    } else if (data.command === 'reset') {
      running = false;
      generation++;
      kernel.reset();
      status('reset');
    } else if (data.command === 'control') {
      kernel.queueControl(data.componentId, data.key, data.value);
      status('control');
    } else if (data.command === 'uart-rx') {
      kernel.queueUartRx(data.value);
      status('uart-rx');
    } else if (data.command === 'serial-clear') {
      kernel.clearSerialView();
      status('serial-clear');
    } else if (data.command === 'logic-channels') {
      kernel.setLogicChannels(data.channels);
      status('logic-channels');
    } else if (data.command === 'speed') {
      kernel.setSpeed(data.speed);
      status('speed');
    } else {
      throw new Error(`Unknown worker command: ${data.command}`);
    }
  } catch (error) {
    running = false;
    generation++;
    stopped('error', error);
  }
};
