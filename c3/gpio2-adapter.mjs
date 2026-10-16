// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

export const GPIO2 = 2;
export const GPIO2_MASK = 1 << GPIO2;
export const C3_REGISTERS = Object.freeze({
  OUT: 0x60004004,
  OUT_W1TS: 0x60004008,
  OUT_W1TC: 0x6000400c,
  ENABLE: 0x60004020,
  ENABLE_W1TS: 0x60004024,
  ENABLE_W1TC: 0x60004028,
  FUNC2_OUT_SEL: 0x6000455c,
  IO_MUX_GPIO2: 0x6000900c,
});

const VALID_ADDRESSES = new Set(Object.values(C3_REGISTERS));
const GPIO_OUTPUT_SIGNAL = 128;
const MATRIX_OEN_FROM_GPIO_ENABLE = 1 << 9;
const IO_MUX_MCU_SEL_SHIFT = 12;
const IO_MUX_MCU_SEL_MASK = 0x7;
const IO_MUX_GPIO_FUNCTION = 1;

function cleanState(epoch) {
  return {
    epoch,
    outputLatch: 0,
    outputEnable: 0,
    outputMatrix: 0x80,
    ioMux: 0,
    writes: 0,
  };
}

export class ProjectOwnedC3Gpio2Adapter {
  #state;
  #generation;

  constructor({ generation = 1, epoch = 1 } = {}) {
    if (!Number.isSafeInteger(generation) || generation < 1) throw new TypeError('GPIO_GENERATION_INVALID');
    this.#generation = generation;
    this.#state = cleanState(epoch);
  }

  reset({ generation = this.#generation, epoch = this.#state.epoch + 1 } = {}) {
    if (!Number.isSafeInteger(generation) || generation < this.#generation
      || !Number.isSafeInteger(epoch) || epoch <= this.#state.epoch) {
      return Object.freeze({ accepted: false, code: 'GPIO_RESET_STALE' });
    }
    this.#generation = generation;
    this.#state = cleanState(epoch);
    return Object.freeze({ accepted: true, state: this.snapshot() });
  }

  write(event, { generation = this.#generation } = {}) {
    if (!event || event.epoch !== this.#state.epoch || generation !== this.#generation) {
      return Object.freeze({ accepted: false, code: 'GPIO_EVENT_STALE' });
    }
    if (!VALID_ADDRESSES.has(event.address) || event.width !== 4
      || !Number.isSafeInteger(event.value) || event.value < 0 || event.value > 0xffffffff) {
      return Object.freeze({ accepted: false, code: 'GPIO_WRITE_UNSUPPORTED' });
    }
    const value = event.value >>> 0;
    switch (event.address) {
      case C3_REGISTERS.OUT: this.#state.outputLatch = value; break;
      case C3_REGISTERS.OUT_W1TS: this.#state.outputLatch = (this.#state.outputLatch | value) >>> 0; break;
      case C3_REGISTERS.OUT_W1TC: this.#state.outputLatch = (this.#state.outputLatch & ~value) >>> 0; break;
      case C3_REGISTERS.ENABLE: this.#state.outputEnable = value; break;
      case C3_REGISTERS.ENABLE_W1TS: this.#state.outputEnable = (this.#state.outputEnable | value) >>> 0; break;
      case C3_REGISTERS.ENABLE_W1TC: this.#state.outputEnable = (this.#state.outputEnable & ~value) >>> 0; break;
      case C3_REGISTERS.FUNC2_OUT_SEL: this.#state.outputMatrix = value; break;
      case C3_REGISTERS.IO_MUX_GPIO2: this.#state.ioMux = value; break;
      default: throw new Error('GPIO_ADAPTER_INTERNAL_ADDRESS');
    }
    this.#state.writes += 1;
    return Object.freeze({ accepted: true, state: this.snapshot() });
  }

  snapshot() {
    const enabled = Boolean(this.#state.outputEnable & GPIO2_MASK);
    const high = Boolean(this.#state.outputLatch & GPIO2_MASK);
    const matrixSignal = this.#state.outputMatrix & 0xff;
    const matrixUsesEnable = Boolean(this.#state.outputMatrix & MATRIX_OEN_FROM_GPIO_ENABLE);
    const ioMuxFunction = (this.#state.ioMux >>> IO_MUX_MCU_SEL_SHIFT) & IO_MUX_MCU_SEL_MASK;
    // ESP32-C3 SIG_GPIO_OUT_IDX (128) is the HAL's special default route from
    // GPIO_OUT/GPIO_ENABLE. gpio_ll_matrix_out_default writes exactly 128; it
    // deliberately does not set OEN_SEL. Other peripheral routes need the
    // explicit OEN_SEL bit before GPIO_ENABLE can control the pad.
    const outputEnableFromGpioRegister = matrixSignal === GPIO_OUTPUT_SIGNAL || matrixUsesEnable;
    const muxConfigured = matrixSignal === GPIO_OUTPUT_SIGNAL
      && ioMuxFunction === IO_MUX_GPIO_FUNCTION;
    const driven = enabled && muxConfigured;
    return Object.freeze({
      schema: 'intent-mcu-project-c3-gpio2-state@1',
      generation: this.#generation,
      epoch: this.#state.epoch,
      writes: this.#state.writes,
      outputLatchHigh: high,
      outputEnabled: enabled,
      outputMatrixSignal: matrixSignal,
      outputEnableFromGpioRegister,
      ioMuxFunction,
      muxConfigured,
      drive: driven ? (high ? 'high' : 'low') : 'high-impedance',
      volts: driven ? (high ? 3.3 : 0) : null,
      provenance: Object.freeze({
        cpuExecution: 'Espressif QEMU esp32c3 actual executed stores',
        peripheralModel: 'IntentForce project-owned register adapter',
        qemuPinStateObserved: false,
      }),
    });
  }
}

export const VALIDATED_LED_CIRCUIT = Object.freeze({
  schema: 'intent-mcu-c3-gpio2-led-circuit@1',
  supplyVolts: 3.3,
  gpio: 2,
  resistorOhms: 220,
  ledForwardVolts: 2.0,
  connections: Object.freeze([
    Object.freeze(['gpio2', 'resistor.a']),
    Object.freeze(['resistor.b', 'led.anode']),
    Object.freeze(['led.cathode', 'gnd']),
  ]),
});

function edgeKey(edge) { return [...edge].sort().join('|'); }

export function validateGpio2LedCircuit(value) {
  const expectedEdges = new Set(VALIDATED_LED_CIRCUIT.connections.map(edgeKey));
  const observedEdges = Array.isArray(value?.connections)
    ? new Set(value.connections.filter((edge) => Array.isArray(edge) && edge.length === 2).map(edgeKey))
    : new Set();
  const topologyValid = observedEdges.size === expectedEdges.size
    && [...expectedEdges].every((edge) => observedEdges.has(edge));
  const electricalValid = value?.schema === VALIDATED_LED_CIRCUIT.schema
    && value.supplyVolts === 3.3 && value.gpio === GPIO2
    && Number.isFinite(value.resistorOhms) && value.resistorOhms >= 150
    && value.resistorOhms <= 1000 && Number.isFinite(value.ledForwardVolts)
    && value.ledForwardVolts >= 1.6 && value.ledForwardVolts <= 2.4;
  const milliamps = electricalValid
    ? ((value.supplyVolts - value.ledForwardVolts) / value.resistorOhms) * 1000 : null;
  const safeCurrent = milliamps !== null && milliamps > 0 && milliamps <= 12;
  const accepted = topologyValid && electricalValid && safeCurrent;
  return Object.freeze({
    schema: 'intent-mcu-c3-gpio2-led-validation@1',
    accepted,
    code: accepted ? 'CIRCUIT_ACCEPTED' : !topologyValid ? 'CIRCUIT_DISCONNECTED'
      : !electricalValid ? 'CIRCUIT_ELECTRICAL_INVALID' : 'CIRCUIT_OVERCURRENT',
    milliamps: milliamps === null ? null : Number(milliamps.toFixed(3)),
  });
}

export function resolveLed(adapterState, circuit) {
  const validation = validateGpio2LedCircuit(circuit);
  if (!validation.accepted) return Object.freeze({ on: false, code: validation.code, validation });
  if (adapterState?.drive === 'high-impedance') {
    return Object.freeze({ on: false, code: 'GPIO_WRONG_MODE', validation });
  }
  if (!adapterState || !['high', 'low'].includes(adapterState.drive)) {
    return Object.freeze({ on: false, code: 'GPIO_STATE_INVALID', validation });
  }
  return Object.freeze({
    on: adapterState.drive === 'high',
    code: adapterState.drive === 'high' ? 'LED_ON' : 'LED_OFF',
    validation,
  });
}

export function interpretObservation(observation, { generation = 1 } = {}) {
  if (observation?.schema !== 'intent-mcu-c3-executed-register-writes@1'
    || observation.qemuPinStateObserved !== false || !Array.isArray(observation.events)) {
    throw new TypeError('GPIO_OBSERVATION_INVALID');
  }
  const epochs = [];
  const adapter = new ProjectOwnedC3Gpio2Adapter({ generation, epoch: 1 });
  for (let epoch = 1; epoch <= observation.epochs; epoch += 1) {
    if (epoch > 1) adapter.reset({ generation, epoch });
    for (const event of observation.events.filter((entry) => entry.epoch === epoch)) {
      const result = adapter.write(event, { generation });
      if (!result.accepted && result.code !== 'GPIO_WRITE_UNSUPPORTED') {
        throw new Error(result.code);
      }
    }
    epochs.push(adapter.snapshot());
  }
  return Object.freeze(epochs);
}
