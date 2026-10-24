import { GPIOPinState, RP2040 } from 'rp2040js';
import {
  RUNTIME_DESCRIPTOR_SCHEMA,
  RUNTIME_EVENT_SCHEMA,
  RuntimeEventLedger,
  validateRuntimeCommand,
} from './controller-runtime-bridge-v1.mjs';
import {
  RP2040_FIXTURE_PROFILE,
  RP2040_FLASH_START,
  validateRp2040ConformanceFixture,
} from './rp2040-conformance-fixtures-v1.mjs';
import {
  loadRp2040FirmwareArtifact,
  RP2040_SUPPORTED_MEMORY_MAP,
} from './rp2040-firmware-artifact-v1.mjs';

export const RP2040JS_RUNTIME_IDENTITY = Object.freeze({
  id: 'rp2040js',
  version: '1.4.0',
  // SHA-256 of sorted records: relative-path NUL byte-length NUL file-sha256 LF.
  sha256: 'ac5cb5a2cac7c759ce26c83b92b85f33510b10b4dd7825b02b23b6aed7fdbbbd',
});

const GPIO_PIN = /^GPIO(?:[0-9]|[12][0-9])$/u;
const MAX_INSTRUCTIONS_PER_ADVANCE = 5_000_000;
const GPIO_FUNCTION_PWM = 4;
const PWM_BASE = 0x40050000;
const PWM_CHANNEL_BYTES = 0x14;
const PWM_CSR_OFFSET = 0x00;
const PWM_ENABLE = 1;
const TRUSTED_GPIO_UART_ARTIFACTS = new Set([
  'a6d160c486a21994c58b1b44bc4883e90d5c3102ced62cd5e3eb9e7367835fdc',
  '6ca94212620f0b1b2ae1726af3ffa36c5163cb0f73a84af792f0f9e167b5d47b',
  '7f038f0aa55307f786987e3abc541876f1d56f17cc71f52a5109bce60a3cf684',
]);
const TRUSTED_PWM_ADC_ARTIFACTS = new Set([
  '16a48d258fdc74a2d838d7c5730e2217026eebb8be2594d5adca77a7b710dc51',
  '8f58949e167b05e17953e5d3325e7b2e7f8d5c2ea7cbcd50086d40b872f511db',
  'b78b0aa8bc881890de28927eb554290139f2b6ea59ec8c9e69f6b91619c75251',
]);
export const RP2040_UNSUPPORTED_PERIPHERALS = Object.freeze([
  { start: 0x4003c000, end: 0x40044000, peripheral: 'spi' },
  { start: 0x40044000, end: 0x4004c000, peripheral: 'i2c' },
  { start: 0x50000000, end: 0x50004000, peripheral: 'dma' },
  { start: 0x50100000, end: 0x50114000, peripheral: 'usb' },
  { start: 0x50200000, end: 0x50400000, peripheral: 'pio' },
  { start: 0xd0000050, end: 0xd0000060, peripheral: 'multicore-fifo' },
  { start: 0xd0000100, end: 0xd0000180, peripheral: 'multicore-spinlock' },
].map(Object.freeze));

function errorWithCode(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function runtimeDescriptor(artifactSha256) {
  const extended = TRUSTED_PWM_ADC_ARTIFACTS.has(artifactSha256);
  // Public firmware reaches this worker only through the exact bounded source
  // compiler contract. GPIO0/UART0 are therefore the baseline capability for
  // every accepted source-bound UF2; the pinned fixtures add PWM/ADC proof.
  const baseline = true;
  return {
    schema: RUNTIME_DESCRIPTOR_SCHEMA,
    profile: RP2040_FIXTURE_PROFILE,
    role: 'controller-runtime',
    engine: { ...RP2040JS_RUNTIME_IDENTITY },
    artifactSha256,
    capabilities: extended ? ['gpio', 'uart', 'timer-pwm', 'adc']
      : baseline ? ['gpio', 'uart'] : [],
    sandbox: {
      network: 'none',
      readOnlyRoot: 'not-applicable-browser-worker',
      capDropAll: true,
      noNewPrivileges: true,
      watchdog: true,
      ephemeralWorkspace: true,
    },
    deterministic: true,
    conformance: {
      gpio: extended || baseline,
      uart: extended || baseline,
      timerPwm: extended,
      resetReplay: true,
      unsupportedFailClosed: true,
    },
  };
}

function pinEvent(pin, state) {
  if (state === GPIOPinState.High) return { pin: `GPIO${pin}`, level: true, mode: 'output' };
  if (state === GPIOPinState.Low) return { pin: `GPIO${pin}`, level: false, mode: 'output' };
  if (state === GPIOPinState.InputPullUp) {
    return { pin: `GPIO${pin}`, level: true, mode: 'input-pullup' };
  }
  return { pin: `GPIO${pin}`, level: false, mode: 'input' };
}

export class Rp2040RuntimeBridgeAdapter {
  static async create({
    artifactDescriptor,
    executableImage,
    maxEvents = 100_000,
    maxInstructionsPerAdvance = MAX_INSTRUCTIONS_PER_ADVANCE,
  } = {}) {
    if (!await validateRp2040ConformanceFixture(artifactDescriptor, executableImage)) {
      throw errorWithCode('RUNTIME_ARTIFACT_INVALID');
    }
    return new Rp2040RuntimeBridgeAdapter({
      artifactDescriptor,
      artifactSha256: artifactDescriptor.executable.sha256,
      entryPoint: artifactDescriptor.executable.entryPoint,
      initialStackPointer: null,
      loadSegments: [{
        region: 'flash',
        address: RP2040_FLASH_START,
        data: new Uint8Array(executableImage),
      }],
      maxEvents,
      maxInstructionsPerAdvance,
    });
  }

  static async createFromFirmwareArtifact({
    format,
    artifactBytes,
    expectedSha256,
    maxEvents = 100_000,
    maxInstructionsPerAdvance = MAX_INSTRUCTIONS_PER_ADVANCE,
  } = {}) {
    // Strict parsing and hash validation happen before the constructor creates an engine.
    const loaded = await loadRp2040FirmwareArtifact({
      format,
      bytes: artifactBytes,
      expectedSha256,
    });
    return new Rp2040RuntimeBridgeAdapter({
      artifactDescriptor: loaded.descriptor,
      artifactSha256: loaded.descriptor.container.sha256,
      entryPoint: loaded.descriptor.entryPoint,
      initialStackPointer: loaded.descriptor.initialStackPointer,
      loadSegments: loaded.loadSegments,
      maxEvents,
      maxInstructionsPerAdvance,
    });
  }

  constructor({
    artifactDescriptor,
    artifactSha256,
    entryPoint,
    initialStackPointer,
    loadSegments,
    maxEvents,
    maxInstructionsPerAdvance,
  }) {
    if (!Number.isInteger(maxInstructionsPerAdvance) || maxInstructionsPerAdvance < 1
      || maxInstructionsPerAdvance > MAX_INSTRUCTIONS_PER_ADVANCE) {
      throw errorWithCode('RUNTIME_ARTIFACT_INVALID', 'invalid instruction watchdog');
    }
    this.artifactDescriptor = structuredClone(artifactDescriptor);
    this.artifactSha256 = artifactSha256;
    this.entryPoint = entryPoint;
    this.initialStackPointer = initialStackPointer;
    this.loadSegments = loadSegments.map((segment) => ({
      region: segment.region,
      address: segment.address,
      data: new Uint8Array(segment.data),
    }));
    this.maxInstructionsPerAdvance = maxInstructionsPerAdvance;
    this.ledger = new RuntimeEventLedger({ profile: RP2040_FIXTURE_PROFILE, maxEvents });
    this.lastRequestId = 0;
    this.nextPendingSequence = 1;
    this.pending = [];
    this.stopped = false;
    this.epochInstructions = 0;
    this.#createMachine();
    this.#emit('ready', {
      descriptor: runtimeDescriptor(artifactSha256),
    }, 0);
  }

  #createMachine() {
    this.machine = new RP2040();
    for (const segment of this.loadSegments) {
      if (segment.region === 'flash') {
        this.machine.flash.set(
          segment.data,
          segment.address - RP2040_SUPPORTED_MEMORY_MAP.flash.start,
        );
      } else if (segment.region === 'sram') {
        this.machine.sram.set(
          segment.data,
          segment.address - RP2040_SUPPORTED_MEMORY_MAP.sram.start,
        );
      } else {
        throw errorWithCode('RUNTIME_ARTIFACT_INVALID', 'unsupported load region');
      }
    }
    if (this.initialStackPointer !== null) this.machine.core.SP = this.initialStackPointer;
    this.machine.core.PC = this.entryPoint;
    this.machineEvents = [];
    this.machineEventOrder = 0;
    this.gpioHistory = [];
    this.uartHistory = [];
    this.pwmHistory = [];
    this.adcHistory = [];
    this.blocked = false;
    this.blockedCode = null;
    this.blockedPeripheral = null;

    for (const pin of this.machine.gpio) {
      pin.addListener((state) => {
        const event = {
          cycle: this.machine.core.cycles,
          virtualNanos: Math.round(this.machine.clock.nanos),
          order: this.machineEventOrder++,
          type: 'gpio',
          fields: pinEvent(pin.index, state),
        };
        this.machineEvents.push(event);
        this.gpioHistory.push({
          cycle: event.cycle, virtualNanos: event.virtualNanos, ...event.fields,
        });
      });
    }
    this.machine.uart[0].onByte = (value) => {
      const event = {
        cycle: this.machine.core.cycles,
        order: this.machineEventOrder++,
        type: 'uart-tx',
        fields: { port: 'UART0', value },
      };
      this.machineEvents.push(event);
      this.uartHistory.push({ cycle: event.cycle, ...event.fields });
    };
    const completeADCRead = this.machine.adc.completeADCRead.bind(this.machine.adc);
    this.machine.adc.completeADCRead = (value, error) => {
      const channel = this.machine.adc.currentChannel;
      completeADCRead(value, error);
      if (!error && channel >= 0 && channel <= 3) {
        const fields = {
          pin: `GPIO${channel + 26}`,
          channel,
          rawCode: value,
          resolutionBits: this.machine.adc.resolution,
          sampleTimeMicros: this.machine.adc.sampleTime,
          virtualNanos: Math.round(this.machine.clock.nanos),
        };
        const event = {
          cycle: this.machine.core.cycles,
          order: this.machineEventOrder++,
          type: 'adc',
          fields,
        };
        this.machineEvents.push(event);
        this.adcHistory.push({ cycle: event.cycle, ...fields });
      }
    };
    this.#installUnsupportedGuards();
  }

  #capturePwmConfiguration(address, value) {
    const normalized = address >>> 0;
    if (normalized < PWM_BASE || normalized >= PWM_BASE + PWM_CHANNEL_BYTES * 8
      || (normalized - PWM_BASE) % PWM_CHANNEL_BYTES !== PWM_CSR_OFFSET
      || !(value & PWM_ENABLE)) return;
    const index = Math.floor((normalized - PWM_BASE) / PWM_CHANNEL_BYTES);
    const channel = this.machine.pwm.channels[index];
    const pinIndex = channel.pinA1;
    if (this.machine.gpio[pinIndex].functionSelect !== GPIO_FUNCTION_PWM) return;
    const topTicks = channel.top + 1;
    const compareTicks = channel.cc & 0xffff;
    const frequencyHz = channel.timer.frequency / channel.timer.prescaler / topTicks;
    const fields = {
      pin: `GPIO${pinIndex}`,
      dutyCycle: Math.min(1, compareTicks / topTicks),
      frequencyHz,
      periodNanos: 1e9 / frequencyHz,
      virtualNanos: Math.round(this.machine.clock.nanos),
    };
    const event = {
      cycle: this.machine.core.cycles,
      order: this.machineEventOrder++,
      type: 'pwm',
      fields,
    };
    this.machineEvents.push(event);
    this.pwmHistory.push({ cycle: event.cycle, ...fields });
  }

  #installUnsupportedGuards() {
    const guard = (address, operation) => {
      const normalized = address >>> 0;
      const blocked = RP2040_UNSUPPORTED_PERIPHERALS.find(
        (range) => normalized >= range.start && normalized < range.end,
      );
      if (!blocked) return;
      this.blockedPeripheral = blocked.peripheral;
      throw errorWithCode(
        'RUNTIME_CAPABILITY_UNSUPPORTED',
        `${operation}:${blocked.peripheral}:0x${normalized.toString(16)}`,
      );
    };
    const readUint8 = this.machine.readUint8.bind(this.machine);
    const readUint16 = this.machine.readUint16.bind(this.machine);
    const readUint32 = this.machine.readUint32.bind(this.machine);
    const writeUint8 = this.machine.writeUint8.bind(this.machine);
    const writeUint16 = this.machine.writeUint16.bind(this.machine);
    const writeUint32 = this.machine.writeUint32.bind(this.machine);
    this.machine.readUint8 = (address) => {
      guard(address, 'read8');
      return readUint8(address);
    };
    this.machine.readUint16 = (address) => {
      guard(address, 'read16');
      return readUint16(address);
    };
    this.machine.readUint32 = (address) => {
      guard(address, 'read');
      return readUint32(address);
    };
    this.machine.writeUint8 = (address, value) => {
      guard(address, 'write8');
      return writeUint8(address, value);
    };
    this.machine.writeUint16 = (address, value) => {
      guard(address, 'write16');
      return writeUint16(address, value);
    };
    this.machine.writeUint32 = (address, value) => {
      guard(address, 'write');
      const result = writeUint32(address, value);
      this.#capturePwmConfiguration(address, value);
      return result;
    };
  }

  #emit(type, fields = {}, cycle = this.machine.core.cycles, epoch = this.ledger.epoch) {
    return this.ledger.ingest({
      schema: RUNTIME_EVENT_SCHEMA,
      sequence: this.ledger.sequence + 1,
      epoch,
      cycle,
      type,
      ...fields,
    });
  }

  #flushMachineEvents() {
    this.machineEvents.sort((left, right) => left.cycle - right.cycle || left.order - right.order);
    for (const event of this.machineEvents) this.#emit(event.type, event.fields, event.cycle);
    this.machineEvents = [];
  }

  #failClosed(error) {
    this.#flushMachineEvents();
    this.blocked = true;
    this.blockedCode = ['RUNTIME_CAPABILITY_UNSUPPORTED', 'RUNTIME_SLICE_LIMIT'].includes(error?.code)
      ? error.code : 'RUNTIME_CAPABILITY_UNSUPPORTED';
    this.#emit('error', {
      code: this.blockedCode,
      message: String(error?.message ?? error).slice(0, 240),
    });
  }

  #runTo(targetCycle) {
    let sliceInstructions = 0;
    try {
      while (this.machine.core.cycles < targetCycle) {
        const instructionCycles = this.machine.core.executeInstruction();
        this.machine.clock.tick(instructionCycles * 1e9 / this.machine.clkSys);
        this.epochInstructions++;
        sliceInstructions++;
        if (sliceInstructions >= this.maxInstructionsPerAdvance) {
          throw errorWithCode('RUNTIME_SLICE_LIMIT', 'instruction slice limit');
        }
      }
      this.#flushMachineEvents();
    } catch (error) {
      this.#failClosed(error);
    }
  }

  #applyDueInputs(targetCycle) {
    while (!this.blocked && this.pending.length && this.pending[0].targetCycle <= targetCycle) {
      const next = this.pending.shift();
      this.#runTo(next.targetCycle);
      if (this.blocked) return;
      const applicationCycle = this.machine.core.cycles;
      if (next.type === 'digital-input') {
        const pin = Number(next.pin.slice(4));
        this.machine.gpio[pin].setInputValue(next.level);
        this.#emit('digital-input-applied', { pin: next.pin, level: next.level }, applicationCycle);
        this.#flushMachineEvents();
      } else if (next.type === 'analog-input') {
        const channel = Number(next.pin.slice(4)) - 26;
        this.machine.adc.channelValues[channel] = next.rawCode;
        this.#emit('analog-input-applied', {
          pin: next.pin, channel, rawCode: next.rawCode,
        }, applicationCycle);
      } else {
        this.machine.uart[0].feedByte(next.value);
        this.#emit('uart-rx-applied', { port: 'UART0', value: next.value }, applicationCycle);
      }
    }
  }

  handle(command, { includeSnapshot = true } = {}) {
    if (!validateRuntimeCommand(command) || command.requestId !== this.lastRequestId + 1) {
      throw errorWithCode('RUNTIME_COMMAND_INVALID');
    }
    if (this.stopped) throw errorWithCode('RUNTIME_PROCESS_EXITED');
    this.lastRequestId = command.requestId;

    if (command.type === 'reset') {
      this.pending = [];
      this.nextPendingSequence = 1;
      this.epochInstructions = 0;
      this.#createMachine();
      this.#emit('reset', { reason: 'command' }, 0, this.ledger.epoch + 1);
      return this.snapshot();
    }
    if (command.type === 'pause') {
      this.#emit('paused');
      return this.snapshot();
    }
    if (command.type === 'stop') {
      this.stopped = true;
      this.#emit('stopped', { reason: 'command' });
      return this.snapshot();
    }
    if (this.blocked) throw errorWithCode(this.blockedCode ?? 'RUNTIME_CAPABILITY_UNSUPPORTED');

    if (command.type === 'digital-input' || command.type === 'analog-input'
      || command.type === 'uart-rx') {
      if (command.targetCycle < this.machine.core.cycles
        || (command.type === 'digital-input' && !GPIO_PIN.test(command.pin))
        || (command.type === 'analog-input' && command.pin !== 'GPIO26')
        || (command.type === 'uart-rx' && command.port !== 'UART0')) {
        throw errorWithCode('RUNTIME_COMMAND_INVALID');
      }
      this.pending.push({ ...command, pendingSequence: this.nextPendingSequence++ });
      this.pending.sort((left, right) => left.targetCycle - right.targetCycle
        || left.pendingSequence - right.pendingSequence);
      return this.snapshot();
    }

    const targetCycle = this.machine.core.cycles + command.budgetCycles;
    if (!Number.isSafeInteger(targetCycle)) throw errorWithCode('RUNTIME_COMMAND_INVALID');
    this.#applyDueInputs(targetCycle);
    if (!this.blocked) this.#runTo(targetCycle);
    if (!this.blocked) {
      this.#emit('progress', { instructions: this.epochInstructions });
    }
    return includeSnapshot ? this.snapshot() : null;
  }

  handleWithoutSnapshot(command) {
    if (command?.type !== 'advance') throw errorWithCode('RUNTIME_COMMAND_INVALID');
    return this.handle(command, { includeSnapshot: false });
  }

  snapshot() {
    return this.ledger.snapshot();
  }

  machineSnapshot() {
    return {
      cycle: this.machine.core.cycles,
      pc: this.machine.core.PC,
      instructions: this.epochInstructions,
      blocked: this.blocked,
      blockedCode: this.blockedCode,
      blockedPeripheral: this.blockedPeripheral,
      gpio: structuredClone(this.gpioHistory),
      uart: structuredClone(this.uartHistory),
      pwm: structuredClone(this.pwmHistory),
      adc: structuredClone(this.adcHistory),
      virtualNanos: Math.round(this.machine.clock.nanos),
    };
  }

  machineStatus() {
    return {
      cycle: this.machine.core.cycles,
      instructions: this.epochInstructions,
      blocked: this.blocked,
      blockedCode: this.blockedCode,
      blockedPeripheral: this.blockedPeripheral,
    };
  }

  x37ProbeSnapshot() {
    const status = this.machineStatus(); const gpio = this.gpioHistory.filter((event) => event.pin === 'GPIO0');
    return { ...status, gpio: structuredClone(gpio) };
  }
}
