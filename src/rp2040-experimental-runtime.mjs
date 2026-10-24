import { createRuntimeCommand } from '../expansion-drafts/controller-runtime-bridge-v1.mjs';
import {
  RP2040JS_RUNTIME_IDENTITY,
  Rp2040RuntimeBridgeAdapter,
} from '../expansion-drafts/rp2040-runtime-bridge-adapter-v1.mjs';

export const RP2040_EXPERIMENTAL_PROFILE = 'board.rp2040-pico-v1';
export const RP2040_CYCLES_PER_MILLISECOND = 125_000;
const RUN_SLICE_CYCLES = 500;
const ADC_SAMPLE_BUDGET_CYCLES = 1_000;
const SERIAL_HISTORY_LIMIT = 512;

function byteText(value) {
  if (value === 10) return '\n';
  if (value === 13) return '\r';
  if (value >= 32 && value <= 126) return String.fromCharCode(value);
  return `\\x${value.toString(16).padStart(2, '0')}`;
}

function errorWithCode(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export class Rp2040ExperimentalRuntime {
  static async create(firmware = null) {
    if (!firmware || Object.keys(firmware).sort().join(',') !== 'bytes,expectedSha256,format'
      || firmware.format !== 'uf2' || !(firmware.bytes instanceof Uint8Array)
      || !/^[0-9a-f]{64}$/u.test(firmware.expectedSha256 ?? '')) {
      throw errorWithCode('RUNTIME_ARTIFACT_INVALID');
    }
    const adapter = await Rp2040RuntimeBridgeAdapter.createFromFirmwareArtifact({
      format: firmware.format,
      artifactBytes: new Uint8Array(firmware.bytes),
      expectedSha256: firmware.expectedSha256,
    });
    return new Rp2040ExperimentalRuntime(adapter, {
      artifactIdentity: firmware.expectedSha256,
      firmwareFormat: firmware.format,
      firmwareOrigin: 'public-bounded-source-build',
    });
  }

  constructor(adapter, { artifactIdentity, firmwareFormat, firmwareOrigin }) {
    this.adapter = adapter;
    this.artifactIdentity = artifactIdentity;
    this.firmwareFormat = firmwareFormat;
    this.firmwareOrigin = firmwareOrigin;
    this.capabilities = new Set(adapter.snapshot().descriptor.capabilities);
    this.requestId = 0;
    this.paused = true;
    this.disposed = false;
    this.serialClearIndex = 0;
    this.logicChannels = ['GPIO0'];
    this.adcInputRawCode = null;
  }

  #ensureActive() {
    if (this.disposed || !this.adapter) throw errorWithCode('RUNTIME_PROCESS_EXITED');
  }

  #command(type, fields = {}) {
    this.#ensureActive();
    return this.adapter.handle(createRuntimeCommand(++this.requestId, type, fields));
  }

  run() {
    this.#ensureActive();
    this.paused = false;
  }

  pause() {
    this.#ensureActive();
    this.paused = true;
  }

  runSlice() {
    if (this.paused) return this.snapshot('paused');
    this.advanceSlice();
    return this.snapshot('status');
  }

  advanceSlice() {
    this.#ensureActive();
    if (this.paused) return;
    const command = createRuntimeCommand(++this.requestId, 'advance', { budgetCycles: RUN_SLICE_CYCLES });
    this.adapter.handleWithoutSnapshot(command);
    const machine = this.adapter.machineStatus();
    if (machine.blocked) throw errorWithCode(machine.blockedCode ?? 'RUNTIME_CAPABILITY_UNSUPPORTED');
  }

  step() {
    this.paused = true;
    this.#command('advance', { budgetCycles: 1 });
    return this.snapshot('stepped');
  }

  x37Step() {
    this.#ensureActive(); this.paused = true;
    const command = createRuntimeCommand(++this.requestId, 'advance', { budgetCycles: 1 });
    this.adapter.handleWithoutSnapshot(command);
    const machine = this.adapter.machineStatus();
    if (machine.blocked) throw errorWithCode(machine.blockedCode ?? 'RUNTIME_CAPABILITY_UNSUPPORTED');
    return { cycle: machine.cycle, instructions: machine.instructions };
  }

  x37ProbeSnapshot() {
    this.#ensureActive(); const machine = this.adapter.x37ProbeSnapshot();
    const output = machine.gpio.at(-1) ?? { mode: 'input', level: false };
    return { cycle: machine.cycle, instructions: machine.instructions,
      pins: [{ pin: 'GPIO0', mode: output.mode === 'output' ? 'OUTPUT' : 'INPUT', level: output.level }],
      instruments: { logic: { transitions: machine.gpio.map(({ cycle, mode, level }) =>
        ({ cycle, pin: 'GPIO0', mode, level })), dropped: machine.gpioDropped } } };
  }

  reset() {
    this.paused = true;
    this.#command('reset');
    this.serialClearIndex = 0;
    this.adcInputRawCode = null;
    return this.snapshot('reset');
  }

  queueUartRx(value) {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw errorWithCode('RUNTIME_COMMAND_INVALID');
    const cycle = this.adapter.machineSnapshot().cycle;
    this.#command('uart-rx', { port: 'UART0', value, targetCycle: cycle });
    return this.snapshot('uart-rx');
  }

  sampleAdc0(rawCode) {
    if (!this.capabilities.has('adc')) throw errorWithCode('RUNTIME_CAPABILITY_UNSUPPORTED');
    if (!Number.isInteger(rawCode) || rawCode < 0 || rawCode > 4095) {
      throw errorWithCode('RUNTIME_COMMAND_INVALID');
    }
    this.paused = true;
    const cycle = this.adapter.machineSnapshot().cycle;
    this.#command('analog-input', { pin: 'GPIO26', rawCode, targetCycle: cycle });
    this.#command('uart-rx', { port: 'UART0', value: 0x3f, targetCycle: cycle });
    this.#command('advance', { budgetCycles: ADC_SAMPLE_BUDGET_CYCLES });
    this.adcInputRawCode = rawCode;
    return this.snapshot('adc-input');
  }

  clearSerialView() {
    this.#ensureActive();
    this.serialClearIndex = this.adapter.machineSnapshot().uart.length;
    return this.snapshot('serial-clear');
  }

  setLogicChannels(channels) {
    if (!Array.isArray(channels) || channels.some((item) => item !== 'GPIO0')
      || new Set(channels).size !== channels.length) throw errorWithCode('RUNTIME_COMMAND_INVALID');
    this.logicChannels = [...channels];
    return this.snapshot('logic-channels');
  }

  dispose() {
    if (this.disposed) return;
    this.paused = true;
    this.disposed = true;
    this.adapter = null;
  }

  snapshot(kind = 'status') {
    this.#ensureActive();
    const machine = this.adapter.machineSnapshot();
    const gpio = machine.gpio.filter((event) => event.pin === 'GPIO0' && event.mode === 'output');
    const output = gpio.at(-1) ?? { level: false, mode: 'input', cycle: machine.cycle };
    const trace = gpio.map(({ cycle, level, virtualNanos }) => ({
      cycle, pin: 'GPIO0', level, virtualNanos,
    }));
    const pwm = machine.pwm.at(-1) ?? null;
    const adc = machine.adc.at(-1) ?? null;
    const uart = machine.uart.slice(this.serialClearIndex, this.serialClearIndex + SERIAL_HISTORY_LIMIT);
    const serialRecords = uart.map(({ cycle, value }) => ({
      cycle,
      direction: 'tx',
      value,
      text: byteText(value),
      virtualMilliseconds: cycle / RP2040_CYCLES_PER_MILLISECOND,
    }));
    return {
      kind,
      profile: RP2040_EXPERIMENTAL_PROFILE,
      runtimeEngine: { ...RP2040JS_RUNTIME_IDENTITY },
      artifactIdentity: this.artifactIdentity,
      firmwareOrigin: this.firmwareOrigin,
      firmwareFormat: this.firmwareFormat,
      cycle: machine.cycle,
      instructions: machine.instructions,
      paused: this.paused,
      speed: 1,
      cyclesPerMillisecond: RP2040_CYCLES_PER_MILLISECOND,
      circuit: { leds: [] },
      trace,
      pins: [
        {
          pin: 'GPIO0',
          mode: pwm ? 'PWM' : output.mode === 'output' ? 'OUTPUT' : 'INPUT',
          level: output.level,
          voltage: output.level ? 3.3 : 0,
          pwm: pwm ? {
            duty: pwm.dutyCycle,
            frequencyHz: pwm.frequencyHz,
            periodNanos: pwm.periodNanos,
          } : null,
          adc: null,
          diagnostic: 'Actual rp2040js PWM GPIO0 output under the explicit virtual clock',
        },
        {
          pin: 'GPIO26',
          mode: 'ANALOG_INPUT',
          level: false,
          voltage: this.adcInputRawCode === null ? 0 : (this.adcInputRawCode / 4095) * 3.3,
          pwm: null,
          adc: adc?.rawCode ?? null,
          diagnostic: '12-bit virtual ADC0 code; 3.3 V is a nominal display mapping, not physical accuracy',
        },
      ],
      instruments: {
        serial: {
          records: serialRecords,
          text: serialRecords.map((record) => record.text).join(''),
          retained: serialRecords.length,
          dropped: Math.max(0, machine.uart.length - this.serialClearIndex - SERIAL_HISTORY_LIMIT),
          machineDropped: 0,
          viewDropped: 0,
        },
        logic: {
          channels: [...this.logicChannels],
          transitions: this.logicChannels.includes('GPIO0') ? trace : [],
          dropped: 0,
        },
        pin: null,
      },
      experimental: {
        gpio0: { level: output.level, mode: output.mode, lastCycle: output.cycle },
        pwm: pwm ? { ...pwm } : null,
        adc0: adc ? { ...adc, requestedRawCode: this.adcInputRawCode } : null,
        compiler: false,
        timerPwm: this.capabilities.has('timer-pwm'),
        adc: this.capabilities.has('adc'),
        physicalAccuracy: false,
        fullPicoSupport: false,
        publicBoundedSource: true,
      },
    };
  }
}
