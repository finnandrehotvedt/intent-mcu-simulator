import { RuntimeKernel } from './runtime-kernel.mjs';
import {
  RP2040_EXPERIMENTAL_PROFILE,
  Rp2040ExperimentalRuntime,
} from './rp2040-experimental-runtime.mjs';

let kernel = null;
let rp2040 = null;
let running = false;
let generation = 0;
let initialization = 0;

function isRp2040() { return rp2040 !== null; }

function status(kind = 'status') {
  if (isRp2040()) {
    postMessage(rp2040.snapshot(kind));
    return;
  }
  const snapshot = kernel.snapshot();
  postMessage({ kind, ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
}

function stopped(kind, error) {
  if (isRp2040()) {
    const snapshot = rp2040.snapshot(kind);
    postMessage({ ...snapshot, paused: true, message: error instanceof Error ? error.message : String(error) });
    return;
  }
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

function applyDigitalInput(value) {
  if (!value || !Number.isInteger(value.pin) || value.pin < 0 || value.pin > 13
      || typeof value.level !== 'boolean') throw new Error('INVALID_DIGITAL_INPUT');
  kernel.adapter.setDigitalPin(value.pin, value.level);
}

function disposeRuntime() {
  running = false;
  generation++;
  initialization++;
  rp2040?.dispose();
  rp2040 = null;
  kernel = null;
}

function pump(activeGeneration) {
  if (!running || activeGeneration !== generation) return;
  try {
    if (isRp2040()) postMessage(rp2040.runSlice());
    else {
      kernel.runInstructions(instructionBudget());
      status();
    }
    setTimeout(() => pump(activeGeneration), 0);
  } catch (error) {
    running = false;
    generation++;
    stopped('stopped-error', error);
  }
}

async function handleMessage(data) {
  try {
    if (data.command === 'init') {
      disposeRuntime();
      const currentInitialization = ++initialization;
      if (data.runtimeProfile === RP2040_EXPERIMENTAL_PROFILE) {
        const candidate = await Rp2040ExperimentalRuntime.create(data.firmware ?? null);
        if (currentInitialization !== initialization) {
          candidate.dispose();
          return;
        }
        rp2040 = candidate;
        status('ready');
        return;
      }
      if (data.runtimeProfile && data.runtimeProfile !== 'board.atmega328p-16mhz-v1') {
        throw new Error('RUNTIME_PROFILE_UNSUPPORTED');
      }
      kernel = new RuntimeKernel(data.hex, data.circuit, data.instruments ?? {});
      for (const input of data.digitalInputs ?? []) applyDigitalInput(input);
      status('ready');
      return;
    }
    if (data.command === 'dispose') {
      const profile = isRp2040() ? RP2040_EXPERIMENTAL_PROFILE : 'board.atmega328p-16mhz-v1';
      disposeRuntime();
      postMessage({ kind: 'disposed', profile, paused: true, cycle: 0, instructions: 0 });
      close();
      return;
    }
    if (!kernel && !rp2040) throw new Error('Worker is not initialized');
    if (data.command === 'test-stall') {
      running = false;
      generation++;
      return;
    }
    if (data.command === 'run') {
      if (!running) {
        running = true;
        if (isRp2040()) rp2040.run(); else kernel.run();
        generation++;
        pump(generation);
      }
    } else if (data.command === 'pause') {
      running = false;
      generation++;
      if (isRp2040()) rp2040.pause(); else kernel.pause();
      status('paused');
    } else if (data.command === 'step') {
      running = false;
      generation++;
      if (isRp2040()) postMessage(rp2040.step());
      else {
        kernel.pause();
        const step = kernel.step();
        const snapshot = kernel.snapshot();
        postMessage({ kind: 'stepped', step, ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
      }
    } else if (data.command === 'reset') {
      running = false;
      generation++;
      if (isRp2040()) postMessage(rp2040.reset());
      else {
        kernel.reset();
        status('reset');
      }
    } else if (data.command === 'control') {
      if (isRp2040()) throw new Error('RP2040_CONTROL_UNSUPPORTED');
      if (data.targetCycle === undefined) kernel.queueControl(data.componentId, data.key, data.value);
      else kernel.queueControlAtCycle(data.componentId, data.key, data.value, data.targetCycle);
      status('control');
    } else if (data.command === 'digital-input') {
      if (isRp2040()) throw new Error('RP2040_DIGITAL_INPUT_UNSUPPORTED');
      applyDigitalInput(data);
      status('digital-input');
    } else if (data.command === 'fault') {
      if (isRp2040()) throw new Error('FAULT_INJECTION_PROFILE_UNSUPPORTED');
      kernel.queueFaultAtCycle(data.event, data.targetCycle);
      status('fault-request');
    } else if (data.command === 'digital-sequence') {
      if (isRp2040()) throw new Error('RP2040_DIGITAL_INPUT_UNSUPPORTED');
      kernel.queueDigitalSequence(data.events);
      status('digital-sequence');
    } else if (data.command === 'uart-rx') {
      if (isRp2040()) postMessage(rp2040.queueUartRx(data.value));
      else {
        kernel.queueUartRx(data.value);
        status('uart-rx');
      }
    } else if (data.command === 'adc-input') {
      if (!isRp2040()) throw new Error('ADC_INPUT_PROFILE_UNSUPPORTED');
      running = false;
      generation++;
      postMessage(rp2040.sampleAdc0(data.rawCode));
    } else if (data.command === 'serial-clear') {
      if (isRp2040()) postMessage(rp2040.clearSerialView());
      else {
        kernel.clearSerialView();
        status('serial-clear');
      }
    } else if (data.command === 'logic-channels') {
      if (isRp2040()) postMessage(rp2040.setLogicChannels(data.channels));
      else {
        kernel.setLogicChannels(data.channels);
        status('logic-channels');
      }
    } else if (data.command === 'speed') {
      if (isRp2040()) throw new Error('RP2040_SPEED_CONTROL_UNSUPPORTED');
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
}

self.onmessage = ({ data }) => { void handleMessage(data); };
