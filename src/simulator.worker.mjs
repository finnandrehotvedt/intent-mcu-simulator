import { RuntimeKernel } from './runtime-kernel.mjs';
import {
  RP2040_EXPERIMENTAL_PROFILE,
  Rp2040ExperimentalRuntime,
} from './rp2040-experimental-runtime.mjs';
import { Rp2040SnapshotPacer } from './rp2040-snapshot-pacer.mjs';
import {
  MODEL_RUNTIME_BINDING_SCHEMA, createWorkerRuntimeIdentity, runtimeInitBinding,
} from './runtime-identity.mjs';
import { modelLibraryExecutionIdentity } from './model-library.mjs';
import { exactKeys } from './strict-json.mjs';
import { validateX47RepeatableApplyRequest } from './x47-repeatable-inputs.mjs';

let kernel = null;
let rp2040 = null;
let rp2040Pacer = null;
let running = false;
let generation = 0;
let initialization = 0;
let runtimeIdentity = null;
let validatedModelExecutionContextSha256 = null;
let x47RepeatableAuthority = null;
let x47RepeatablePending = null;

const identityFields = () => runtimeIdentity ? {
  runtimeIdentity: structuredClone(runtimeIdentity),
  ...(validatedModelExecutionContextSha256 ? {
    modelExecutionContextSha256: validatedModelExecutionContextSha256,
  } : {}),
} : {};
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

function acknowledgeX47Cancellation(reason, disposeToken = null) {
  const receipts = kernel?.cancelX47Transactions?.(reason) ?? [];
  if (receipts.length) emit({ kind: 'x47-cancelled', reason, receipts,
    ...(disposeToken ? { disposeToken } : {}) });
  return receipts;
}

function x48Retention(snapshot) {
  return {
    inputDrops: snapshot.eventLog?.dropped ?? -1,
    logicDrops: snapshot.retentionDrops?.logic ?? -1,
    serialDrops: snapshot.retentionDrops?.serial ?? -1,
    adcDrops: snapshot.retentionDrops?.adc ?? -1,
    unsupportedDrops: snapshot.retentionDrops?.unsupported ?? -1,
  };
}

function x48ApplyControl(componentId, key, value, cycle) {
  const before = kernel.adapter.cpu.cycles;
  const queued = kernel.queueControlAtCycle(componentId, key, value, cycle);
  const after = kernel.adapter.cpu.cycles;
  const applied = kernel.inputs.snapshot().applied.find((item) => item.sequence === queued.sequence);
  if (before !== cycle || after !== cycle || applied?.targetCycle !== cycle
      || applied?.appliedCycle !== cycle) throw new Error('X48_INPUT_CAUSALITY_INVALID');
  return applied;
}

function cancelX48(reason, kind = 'x48-cancelled') {
  x48Epoch += 1;
  if (!x48Operation) return null;
  const operation = x48Operation;
  x48Operation = null;
  const result = validateX48Result(indeterminateX48Run(operation.state, reason), operation.state.binding);
  const snapshot = kernel?.snapshot();
  if (snapshot) emit({ kind, result, ...snapshot,
    led: snapshot.circuit.leds.some((item) => item.on) });
  return result;
}

function x48Terminal(kind, result) {
  const accepted = validateX48Result(result, x48Operation?.state.binding);
  x48Operation = null;
  const snapshot = kernel.snapshot();
  emit({ kind, result: accepted, ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
}

function advanceX48(activeEpoch) {
  const operation = x48Operation;
  if (!operation || operation.epoch !== activeEpoch || activeEpoch !== x48Epoch) return;
  try {
    const tick = operation.state.rows.length + 1;
    const nominalTargetCycle = tick * X48_NOMINAL_TICK_CYCLES;
    let instructions = 0;
    while (kernel.adapter.cpu.cycles < nominalTargetCycle
        && instructions < X48_SLICE_INSTRUCTIONS) {
      const completed = kernel.step();
      if (!Number.isSafeInteger(completed?.cycles) || completed.cycles < 1 || completed.cycles > 6) {
        throw new Error('X48_BOUNDARY_STEP_UNSUPPORTED');
      }
      instructions += 1;
    }
    if (kernel.adapter.cpu.cycles < nominalTargetCycle) {
      setTimeout(() => advanceX48(activeEpoch), 0);
      return;
    }
    const sampled = kernel.sample();
    const actualSampleCycle = sampled.cycle;
    if (actualSampleCycle - nominalTargetCycle > X48_MAX_BOUNDARY_LATENESS_CYCLES) {
      x48Terminal('x48-indeterminate', indeterminateX48Run(
        operation.state, 'X48_BOUNDARY_LATENESS_UNSUPPORTED',
      ));
      return;
    }
    const pin = sampled.pins.find((item) => item.pin === 'D13');
    if (!pin || pin.mode !== 'OUTPUT' || typeof pin.level !== 'boolean') {
      x48Terminal('x48-indeterminate', indeterminateX48Run(
        operation.state, 'X48_D13_INDETERMINATE',
      ));
      return;
    }
    const nextMilliC = x48PlantStep(operation.state.currentMilliC,
      { mode: pin.mode, level: pin.level }).nextMilliC;
    const applied = x48ApplyControl('temperature-sensor-1', 'position',
      x48TemperaturePosition(nextMilliC), actualSampleCycle);
    const row = appendX48Observation(operation.state, {
      tick,
      nominalTargetCycle,
      actualSampleCycle,
      pin: { mode: pin.mode, level: pin.level },
      inputTargetCycle: applied.targetCycle,
      inputAppliedCycle: applied.appliedCycle,
      retention: x48Retention(kernel.snapshot()),
    });
    const progress = kernel.snapshot();
    emit({ kind: 'x48-progress', row, result: structuredClone(operation.state), ...progress,
      led: progress.circuit.leds.some((item) => item.on) });
    if (tick === X48_TICK_COUNT) {
      x48Terminal('x48-complete', finishX48Run(operation.state));
      return;
    }
    setTimeout(() => advanceX48(activeEpoch), 0);
  } catch (error) {
    const reason = /^X48_[A-Z0-9_]+$/u.test(error.code ?? error.message)
      ? (error.code ?? error.message) : 'X48_RUNTIME_ERROR';
    x48Terminal('x48-indeterminate', indeterminateX48Run(operation.state, reason));
  }
}

function startX48(binding) {
  if (!x48CurrentModel) throw new Error('X48_CURRENT_MODEL_REQUIRED');
  if (!x48TrustedAuthority) throw new Error('X48_TRUSTED_INIT_AUTHORITY_REQUIRED');
  if (x48Operation) throw new Error('X48_OPERATION_ACTIVE');
  if (running || !kernel.adapter.paused || kernel.adapter.cpu.cycles !== 0) {
    throw new Error('X48_FRESH_PAUSED_RUNTIME_REQUIRED');
  }
  validateX48ThermostatGraph(kernel.circuit.graph);
  const acceptedBinding = validateX48Binding(binding, runtimeIdentity, x48TrustedAuthority);
  const state = createX48RunState(acceptedBinding);
  const temperature = x48ApplyControl('temperature-sensor-1', 'position',
    x48TemperaturePosition(state.currentMilliC), 0);
  const enable = x48ApplyControl('enable-button-1', 'pressed', true, 0);
  const epoch = ++x48Epoch;
  x48Operation = { epoch, state };
  const snapshot = kernel.snapshot();
  emit({ kind: 'x48-started', result: structuredClone(state), initialInputs: {
    temperature: { targetCycle: temperature.targetCycle, appliedCycle: temperature.appliedCycle },
    enable: { targetCycle: enable.targetCycle, appliedCycle: enable.appliedCycle },
  }, ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
  setTimeout(() => advanceX48(epoch), 0);
}

function disposeRuntime(x47CancellationReceipts = []) {
  x48Epoch += 1;
  x48Operation = null;
  const disposedIdentity = runtimeIdentity ? structuredClone(runtimeIdentity) : null;
  running = false;
  generation++;
  initialization++;
  rp2040Pacer?.cancel();
  rp2040Pacer = null;
  rp2040?.dispose();
  rp2040 = null;
  kernel = null;
  runtimeIdentity = null;
  validatedModelExecutionContextSha256 = null;
  x47RepeatableAuthority = null;
  x47RepeatablePending = null;
  return { disposedIdentity, x47CancellationReceipts };
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

function presentationGeneration(data) {
  if (!Number.isSafeInteger(data.presentationGeneration) || data.presentationGeneration < 1) {
    throw new Error('RP2040_PRESENTATION_GENERATION_INVALID');
  }
  return data.presentationGeneration;
}

function x43StackCommand(data) {
  if (!exactKeys(data, ['command', 'token', 'artifactIdentity', 'runtimeGeneration', 'workerInstanceNonce'])
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(data.token ?? '')
      || data.artifactIdentity !== runtimeIdentity?.artifactIdentity
      || data.runtimeGeneration !== runtimeIdentity?.runtimeGeneration
      || data.workerInstanceNonce !== runtimeIdentity?.workerInstanceNonce) {
    throw new Error('X43_STACK_COMMAND_STALE');
  }
  return data.token;
}

function createRp2040Pacer(runtime) {
  return new Rp2040SnapshotPacer({
    artifactIdentity: runtime.artifactIdentity,
    advance: () => runtime.advanceSlice(),
    snapshot: (kind) => runtime.snapshot(kind),
    emit,
    onError(error) {
      running = false;
      generation++;
      runtime.pause();
      stopped('stopped-error', error);
    },
  });
}

async function handleMessage(data) {
  try {
    if (data.command === 'init') {
      disposeRuntime(acknowledgeX47Cancellation('DISPOSE'));
      const currentInitialization = ++initialization;
      const binding = data.runtimeBinding ? runtimeInitBinding(data.runtimeBinding) : null;
      runtimeIdentity = binding ? createWorkerRuntimeIdentity(binding, currentInitialization) : null;
      x47RepeatableAuthority = data.x47RuntimeAuthority ? structuredClone(data.x47RuntimeAuthority) : null;
      x47RepeatablePending = null;
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
        rp2040Pacer = createRp2040Pacer(candidate);
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
        x48CurrentModel = !modelLibrary.identity.retained;
        x48TrustedAuthority = data.x48Authority
          ? validateX48Authority(data.x48Authority, runtimeIdentity) : null;
        if (data.x47RuntimeAuthority && modelLibrary.identity.retained) {
          throw new Error('X47_CURRENT_MODEL_REQUIRED');
        }
        const candidate = modelLibrary.implementation.createAvrRuntimeKernel(data.hex, data.circuit, {
          ...(data.instruments ?? {}),
          modelLibraryLock: data.modelLibraryLock,
          modelExecutionContextSha256: data.modelExecutionContextSha256,
          ...(data.x34Probe ? { x34Probe: data.x34Probe } : {}),
          ...(data.x35Probe ? { x35Probe: data.x35Probe } : {}),
          ...(data.x47RuntimeAuthority ? { x47RuntimeAuthority: data.x47RuntimeAuthority,
            runtimeIdentity } : {}),
        });
        kernel = candidate;
        validatedModelExecutionContextSha256 = binding.modelExecutionContextSha256;
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
      if (!exactKeys(data, data.disposeToken === undefined ? ['command'] : ['command', 'disposeToken'])
          || (data.disposeToken !== undefined
            && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(data.disposeToken))) {
        throw new Error('X47_DISPOSE_COMMAND_INVALID');
      }
      if (x48Operation) cancelX48('X48_DISPOSED');
      const profile = isRp2040() ? RP2040_EXPERIMENTAL_PROFILE : 'board.atmega328p-16mhz-v1';
      const x47CancellationReceipts = acknowledgeX47Cancellation('DISPOSE', data.disposeToken ?? null);
      const { disposedIdentity } = disposeRuntime(x47CancellationReceipts);
      postMessage({ kind: 'disposed', profile, paused: true, cycle: 0, instructions: 0,
        ...(data.disposeToken ? { disposeToken: data.disposeToken } : {}),
        ...(x47CancellationReceipts.length ? { x47CancellationReceipts } : {}),
        ...(disposedIdentity ? { runtimeIdentity: disposedIdentity } : {}) });
      close();
      return;
    }
    if (!kernel && !rp2040) throw new Error('Worker is not initialized');
    if (x48Operation && !['x48-cancel', 'reset', 'dispose'].includes(data.command)) {
      throw new Error('X48_OPERATION_ACTIVE');
    }
    if (data.command === 'snapshot-ack') {
      if (isRp2040()) rp2040Pacer.acknowledge(data);
      return;
    }
    if (data.command === 'test-stall') {
      running = false;
      generation++;
      rp2040Pacer?.cancel();
      return;
    }
    if (data.command === 'run') {
      if (!running) {
        running = true;
        if (isRp2040()) {
          rp2040.run();
          rp2040Pacer.start(presentationGeneration(data));
        } else kernel.run();
        generation++;
        if (!isRp2040()) pump(generation);
      }
    } else if (data.command === 'pause') {
      running = false;
      generation++;
      if (isRp2040()) {
        rp2040.pause();
        rp2040Pacer.publishFinal(presentationGeneration(data), 'paused');
      } else {
        kernel.pause();
        status('paused');
      }
    } else if (data.command === 'sample') {
      if (isRp2040()) {
        emit({ kind: 'sample-rejected', code: 'SAMPLE_PROFILE_UNSUPPORTED' });
      } else if (running) {
        emit({ kind: 'sample-rejected', code: 'SAMPLE_REQUIRES_PAUSED_RUNTIME' });
      } else {
        const snapshot = kernel.sample();
        emit({ kind: 'sample', ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
      }
    } else if (data.command === 'x43-stack-start') {
      if (isRp2040()) throw new Error('X43_STACK_PROFILE_UNAVAILABLE');
      const snapshot = kernel.startX43StackObservation(x43StackCommand(data));
      emit({ kind: 'x43-stack-started', ...snapshot,
        led: snapshot.circuit.leds.some((item) => item.on) });
    } else if (data.command === 'x43-stack-capture') {
      if (isRp2040()) throw new Error('X43_STACK_PROFILE_UNAVAILABLE');
      const snapshot = kernel.captureX43StackObservation(x43StackCommand(data));
      emit({ kind: 'x43-stack-captured', ...snapshot,
        led: snapshot.circuit.leds.some((item) => item.on) });
    } else if (data.command === 'step') {
      running = false;
      generation++;
      if (isRp2040()) {
        rp2040Pacer.cancel();
        emit(rp2040.step());
      }
      else {
        kernel.pause();
        const step = kernel.step();
        const snapshot = kernel.snapshot();
        emit({ kind: 'stepped', step, ...snapshot, led: snapshot.circuit.leds.some((item) => item.on) });
      }
    } else if (data.command === 'reset') {
      if (x48Operation) cancelX48('X48_RESET');
      running = false;
      generation++;
      if (isRp2040()) {
        const reset = rp2040.reset();
        rp2040Pacer.publishFinal(presentationGeneration(data), 'reset', reset);
      }
      else {
        const x47CancellationReceipts = acknowledgeX47Cancellation('RESET');
        const snapshot = kernel.reset();
        x47RepeatablePending = null;
        x47RepeatableAuthority = null;
        emit({ kind: 'reset', ...snapshot,
          ...(x47CancellationReceipts.length ? { x47CancellationReceipts } : {}),
          led: snapshot.circuit.leds.some((item) => item.on) });
      }
    } else if (data.command === 'control') {
      if (isRp2040()) throw new Error('RP2040_CONTROL_UNSUPPORTED');
      if (data.targetCycle === undefined) kernel.queueControl(data.componentId, data.key, data.value);
      else kernel.queueControlAtCycle(data.componentId, data.key, data.value, data.targetCycle);
      status('control');
    } else if (data.command === 'x48-run') {
      if (!exactKeys(data, ['command', 'binding'])) throw new Error('X48_RUN_COMMAND_INVALID');
      if (isRp2040()) throw new Error('X48_PROFILE_UNAVAILABLE');
      startX48(data.binding);
    } else if (data.command === 'x48-cancel') {
      if (!exactKeys(data, ['command'])) throw new Error('X48_CANCEL_COMMAND_INVALID');
      if (!x48Operation) throw new Error('X48_OPERATION_UNAVAILABLE');
      cancelX48('X48_USER_CANCELLED');
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
    } else if (data.command === 'x47-apply') {
      if (isRp2040()) throw new Error('X47_PROFILE_UNAVAILABLE');
      if (!exactKeys(data, ['command', 'request'])) throw new Error('X47_APPLY_COMMAND_INVALID');
      const receipt = kernel.queueX47Transaction(data.request);
      emit({ kind: 'x47-accepted', receipt, executionReceipt:
        kernel.x47ExecutionReceipt(receipt.transactionId) });
    } else if (data.command === 'x47-repeatable-apply') {
      const transactionId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(
        data.request?.transactionId ?? '',
      ) ? data.request.transactionId : null;
      const canonicalScheduleSha256 = /^[a-f0-9]{64}$/u.test(
        data.request?.canonicalScheduleSha256 ?? '',
      ) ? data.request.canonicalScheduleSha256 : null;
      try {
        if (isRp2040() || !kernel || !x47RepeatableAuthority || !runtimeIdentity) {
          throw new Error('X47_REPEATABLE_RUNTIME_UNAVAILABLE');
        }
        if (!exactKeys(data, ['command', 'request'])) throw new Error('X47_REPEATABLE_COMMAND_INVALID');
        const request = validateX47RepeatableApplyRequest(
          data.request, x47RepeatableAuthority, runtimeIdentity,
        );
        const currentCycle = kernel.adapter.cpu.cycles;
        if (!kernel.adapter.paused || request.expectedBaseCycle !== currentCycle) {
          throw new Error('X47_REPEATABLE_PAUSED_BASE_REQUIRED');
        }
        if (x47RepeatablePending && currentCycle <= x47RepeatablePending.endCycle) {
          throw new Error('X47_REPEATABLE_OVERLAP');
        }
        const graphTarget = kernel.circuit.graph.components.find(
          (item) => item.id === 'temperature-sensor-1',
        );
        if (graphTarget?.type !== 'potentiometer.linear-v1'
            || !Number.isFinite(graphTarget.controls?.position)) {
          throw new Error('X47_REPEATABLE_RUNTIME_GRAPH');
        }
        const before = kernel.inputs.snapshot();
        if (before.pending.length || before.log.length + request.schedule.length > before.retention.limit) {
          throw new Error('X47_REPEATABLE_INPUT_CONFLICT');
        }
        const accepted = request.schedule.map((event, eventIndex) => {
          const targetCycle = request.expectedBaseCycle + event.offsetCycles;
          const position = event.positionNumerator / event.positionDenominator;
          const queued = kernel.queueControlAtCycle(event.componentId, event.key, position, targetCycle);
          return { eventIndex, offsetCycles: event.offsetCycles, targetCycle,
            temperatureC: event.temperatureC, positionNumerator: event.positionNumerator,
            positionDenominator: event.positionDenominator, queueSequence: queued.sequence };
        });
        x47RepeatablePending = { transactionId: request.transactionId,
          endCycle: accepted.at(-1).targetCycle };
        emit({ kind: 'x47-repeatable-accepted', schema: 'intent-mcu-x47-repeatable-queue@1',
          transactionId: request.transactionId,
          canonicalScheduleSha256: request.canonicalScheduleSha256,
          binding: request.binding, baseCycle: request.expectedBaseCycle,
          events: accepted, retained: accepted.length, dropped: 0 });
      } catch (error) {
        const snapshot = kernel?.snapshot() ?? { cycle: 0, instructions: 0, paused: true,
          circuit: { leds: [] } };
        emit({ kind: 'x47-repeatable-rejected', ...snapshot,
          transactionId, canonicalScheduleSha256,
          reason: error instanceof Error ? error.message : String(error),
          led: snapshot.circuit.leds.some((item) => item.on) });
      }
    } else if (data.command === 'x47-cancel') {
      if (isRp2040()) throw new Error('X47_PROFILE_UNAVAILABLE');
      if (!exactKeys(data, ['command', 'transactionId', 'binding'])) {
        throw new Error('X47_CANCEL_COMMAND_INVALID');
      }
      const receipts = kernel.cancelX47Transactions(
        'EXPLICIT_CANCEL', data.transactionId, data.binding,
      );
      emit({ kind: 'x47-cancelled', reason: 'EXPLICIT_CANCEL', receipts });
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
      rp2040Pacer.cancel();
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
