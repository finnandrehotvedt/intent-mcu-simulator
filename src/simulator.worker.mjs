import { RuntimeKernel } from './runtime-kernel.mjs';
import {
  RP2040_EXPERIMENTAL_PROFILE,
  Rp2040ExperimentalRuntime,
} from './rp2040-experimental-runtime.mjs';
import {
  MODEL_RUNTIME_BINDING_SCHEMA, createWorkerRuntimeIdentity, runtimeInitBinding,
} from './runtime-identity.mjs';
import { modelLibraryExecutionIdentity } from './model-library.mjs';

let kernel = null;
let rp2040 = null;
let running = false;
let generation = 0;
let initialization = 0;
let runtimeIdentity = null;

const identityFields = () => runtimeIdentity ? { runtimeIdentity: structuredClone(runtimeIdentity) } : {};
const emit = (message) => postMessage({ ...message, ...identityFields() });

function isRp2040() { return rp2040 !== null; }

function status(kind = 'status') {
  if (isRp2040()) {
    emit(rp2040.snapshot(kind));
    return;
  }
  const snapshot = kernel.snapshot();
  emit({ kind, ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
}

function stopped(kind, error) {
  if (isRp2040()) {
    const snapshot = rp2040.snapshot(kind);
    emit({ ...snapshot, paused: true, message: error instanceof Error ? error.message : String(error) });
    return;
  }
  const snapshot = kernel?.snapshot() ?? { cycle: 0, instructions: 0, paused: true, circuit: { leds: [] } };
  emit({
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
  runtimeIdentity = null;
}

function pump(activeGeneration) {
  if (!running || activeGeneration !== generation) return;
  try {
    if (isRp2040()) emit(rp2040.runSlice());
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
      const binding = data.runtimeBinding ? runtimeInitBinding(data.runtimeBinding) : null;
      runtimeIdentity = binding ? createWorkerRuntimeIdentity(binding, currentInitialization) : null;
      if (data.x34Probe && (!binding || data.x34Probe.artifactIdentity !== binding.artifactIdentity)) {
        throw new Error('X34_RUNTIME_ARTIFACT_BINDING_MISMATCH');
      }
      if (data.x35Probe && (!binding || data.x35Probe.artifactIdentity !== binding.artifactIdentity)) {
        throw new Error('X35_RUNTIME_ARTIFACT_BINDING_MISMATCH');
      }
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
      if (binding?.schema === MODEL_RUNTIME_BINDING_SCHEMA) {
        if (!data.modelLibraryLock) throw new Error('MODEL_LIBRARY_EXECUTION_CONTEXT_MISSING');
        const modelLibrary = modelLibraryExecutionIdentity(data.modelLibraryLock);
        if (!modelLibrary.ok) throw new Error(modelLibrary.code);
        if (modelLibrary.identity.implementationSha256 !== binding.modelImplementationSha256
            || data.modelImplementationSha256 !== binding.modelImplementationSha256
            || data.modelExecutionContextSha256 !== binding.modelExecutionContextSha256) {
          throw new Error('MODEL_LIBRARY_EXECUTION_CONTEXT_MISMATCH');
        }
        if (!modelLibrary.manifest.runtimeContracts.includes('avr8js@0.21.1')) {
          throw new Error('MODEL_LIBRARY_RUNTIME_CONTRACT_UNAVAILABLE');
        }
        kernel = modelLibrary.implementation.createAvrRuntimeKernel(data.hex, data.circuit, {
          ...(data.instruments ?? {}),
          modelLibraryLock: data.modelLibraryLock,
          modelExecutionContextSha256: data.modelExecutionContextSha256,
          ...(data.x34Probe ? { x34Probe: data.x34Probe } : {}),
          ...(data.x35Probe ? { x35Probe: data.x35Probe } : {}),
        });
      } else {
        // Legacy diagnostic workers predate the production model-binding
        // contract. New production runs always take the branch above.
        kernel = new RuntimeKernel(data.hex, data.circuit, {
          ...(data.instruments ?? {}),
          ...(data.x34Probe ? { x34Probe: data.x34Probe } : {}),
          ...(data.x35Probe ? { x35Probe: data.x35Probe } : {}),
        });
      }
      for (const input of data.digitalInputs ?? []) applyDigitalInput(input);
      status('ready');
      return;
    }
    if (data.command === 'dispose') {
      const profile = isRp2040() ? RP2040_EXPERIMENTAL_PROFILE : 'board.atmega328p-16mhz-v1';
      const disposedIdentity = runtimeIdentity ? structuredClone(runtimeIdentity) : null;
      disposeRuntime();
      postMessage({ kind: 'disposed', profile, paused: true, cycle: 0, instructions: 0,
        ...(disposedIdentity ? { runtimeIdentity: disposedIdentity } : {}) });
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
    } else if (data.command === 'sample') {
      if (isRp2040()) {
        emit({ kind: 'sample-rejected', code: 'SAMPLE_PROFILE_UNSUPPORTED' });
      } else if (running) {
        emit({ kind: 'sample-rejected', code: 'SAMPLE_REQUIRES_PAUSED_RUNTIME' });
      } else {
        const snapshot = kernel.sample();
        emit({ kind: 'sample', ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
      }
    } else if (data.command === 'step') {
      running = false;
      generation++;
      if (isRp2040()) emit(rp2040.step());
      else {
        kernel.pause();
        const step = kernel.step();
        const snapshot = kernel.snapshot();
        emit({ kind: 'stepped', step, ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
      }
    } else if (data.command === 'reset') {
      running = false;
      generation++;
      if (isRp2040()) emit(rp2040.reset());
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
      if (isRp2040()) emit(rp2040.queueUartRx(data.value));
      else {
        kernel.queueUartRx(data.value);
        status('uart-rx');
      }
    } else if (data.command === 'x23-usart-response') {
      if (isRp2040()) throw new Error('X23_USART_PROFILE_UNSUPPORTED');
      const serial = kernel.adapter.serial;
      const requests = serial.filter((entry) => entry.direction === 'tx' && entry.value === 0x3f);
      const priorRx = serial.some((entry) => entry.direction === 'rx-request');
      if (requests.length !== 1 || priorRx || ![0x41, 0x42].includes(data.value)
          || data.delayCycles !== 20) throw new Error('X23_USART_RESPONSE_REJECTED');
      kernel.queueUartRxAfterCycles(data.value, data.delayCycles);
      status('x23-usart-response');
    } else if (data.command === 'x23-usart-run-to-request') {
      if (isRp2040()) throw new Error('X23_USART_PROFILE_UNSUPPORTED');
      let remaining = 400_000;
      while (!kernel.adapter.serial.some((entry) => entry.direction === 'tx' && entry.value === 0x3f)
          && remaining > 0) { kernel.step(); remaining -= 1; }
      if (remaining === 0) throw new Error('X23_USART_REQUEST_MISSING');
      status('x23-usart-request');
    } else if (data.command === 'x23-usart-run-to-consumer') {
      if (isRp2040()) throw new Error('X23_USART_PROFILE_UNSUPPORTED');
      let remaining = 400_000;
      const consumed = () => {
        const text = kernel.adapter.serial.filter((entry) => entry.direction === 'tx' && entry.value !== 0x3f)
          .map((entry) => String.fromCharCode(entry.value)).join('');
        return text.includes('OK\n') || text.includes('ERR\n');
      };
      while (!consumed() && remaining > 0) { kernel.step(); remaining -= 1; }
      if (remaining === 0) throw new Error('X23_USART_CONSUMER_MISSING');
      status('x23-usart-consumer');
    } else if (data.command === 'adc-input') {
      if (!isRp2040()) throw new Error('ADC_INPUT_PROFILE_UNSUPPORTED');
      running = false;
      generation++;
      emit(rp2040.sampleAdc0(data.rawCode));
    } else if (data.command === 'serial-clear') {
      if (isRp2040()) emit(rp2040.clearSerialView());
      else {
        kernel.clearSerialView();
        status('serial-clear');
      }
    } else if (data.command === 'logic-channels') {
      if (isRp2040()) emit(rp2040.setLogicChannels(data.channels));
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
