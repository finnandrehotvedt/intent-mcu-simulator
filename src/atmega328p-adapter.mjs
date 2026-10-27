// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  ADCMuxInputType,
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRTWI,
  AVRUSART,
  CPU,
  avrInstruction,
  adcConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  twiConfig,
  usart0Config,
} from 'avr8js';
import { X34PrecisionObserver } from './x34-precision-observer.mjs';
import { X35CausalObserver } from './x35-causal-observer.mjs';
import { parseIntelHex } from './hex.mjs';
import { X46UsartConfigurationProducer } from './x46-usart-configuration-producer.mjs';
import { USART_RX_OBSERVATION_LATENESS_LIMIT } from './x46-usart-rx-limits.mjs';

export const CLOCK_HZ = 16_000_000;
export const TRACE_LIMIT = 100_000;
export const SERIAL_LIMIT = 4_096;
export const I2C_LIMIT = 8_192;
export { USART_RX_OBSERVATION_LATENESS_LIMIT };
const SAMPLE_LIMIT = 4_096;
const UNSUPPORTED_LIMIT = 256;
const X47_TRANSITION_LIMIT = 64;
const DHT11_TRANSACTION_LIMIT = 64;
const DHT11_START_MIN_CYCLES = 18 * 16_000;
const DHT22_TRANSACTION_LIMIT = 64;
const DHT22_START_MIN_CYCLES = 1_000 * 16;
const DS18B20_TRANSACTION_LIMIT = 64;
const DS18B20_RESET_MIN_CYCLES = 400 * 16;
const DS18B20_WRITE_ZERO_MIN_CYCLES = 40 * 16;
const microsToCycles = (microseconds) => microseconds * 16;
const validDs18b20RuntimeTemperature = (value) => Number.isFinite(value)
  && value >= -55 && value <= 125 && Number.isInteger(value / 0.0625);
const validDht22RuntimeValue = (value, minimum, maximum) => Number.isFinite(value)
  && value >= minimum && value <= maximum
  && Math.abs(value * 10 - Math.round(value * 10)) < Number.EPSILON * 64;
const dht22RuntimePayload = (temperatureC, humidityPercent) => {
  const humidityRaw = Math.round(humidityPercent * 10);
  const temperatureMagnitude = Math.round(Math.abs(temperatureC) * 10);
  const bytes = [
    (humidityRaw >> 8) & 0xff,
    humidityRaw & 0xff,
    ((temperatureMagnitude >> 8) & 0x7f) | (temperatureC < 0 ? 0x80 : 0),
    temperatureMagnitude & 0xff,
  ];
  return [...bytes, bytes.reduce((sum, value) => (sum + value) & 0xff, 0)];
};
const ds18b20RuntimeCrc8 = (bytes) => {
  let crc = 0;
  for (const value of bytes) {
    let incoming = value;
    for (let bit = 0; bit < 8; bit += 1) {
      const mix = (crc ^ incoming) & 1;
      crc >>= 1;
      if (mix) crc ^= 0x8c;
      incoming >>= 1;
    }
  }
  return crc;
};
const ds18b20RuntimeScratchpad = (temperatureC) => {
  const raw = Math.round(temperatureC * 16);
  const bytes = [raw & 0xff, (raw >> 8) & 0xff, 75, 70, 0x7f, 0xff, 0x0c, 0x10];
  return [...bytes, ds18b20RuntimeCrc8(bytes)];
};
const PIN_MAP = Object.freeze({
  0: ['D', 0], 1: ['D', 1], 2: ['D', 2], 3: ['D', 3],
  4: ['D', 4], 5: ['D', 5], 6: ['D', 6], 7: ['D', 7],
  8: ['B', 0], 9: ['B', 1], 10: ['B', 2], 11: ['B', 3],
  12: ['B', 4], 13: ['B', 5],
  A0: ['C', 0], A1: ['C', 1], A2: ['C', 2], A3: ['C', 3], A4: ['C', 4], A5: ['C', 5],
});
const PWM_OUTPUTS = Object.freeze({
  3: [timer2Config, 0x30],
  5: [timer0Config, 0x30],
  6: [timer0Config, 0xc0],
  9: [timer1Config, 0xc0],
  10: [timer1Config, 0x30],
  11: [timer2Config, 0xc0],
});

const UNSUPPORTED_REGISTERS = Object.freeze([
  { address: 0x4c, name: 'SPI', active: (value) => Boolean(value & 0x40) },
  { address: 0x3f, name: 'EEPROM', active: (value) => Boolean(value & 0x07) },
  { address: 0x60, name: 'watchdog', active: (value) => Boolean(value & 0x08) },
  { address: 0x50, name: 'analogue-comparator', active: (value) => Boolean(value & 0x08) },
  { address: 0xb6, name: 'asynchronous-timer2', active: (value) => Boolean(value & 0x20) },
]);

export function boundedPush(target, entry, limit) {
  target.push(entry);
  if (target.length <= limit) return 0;
  const dropped = target.length - limit;
  target.splice(0, dropped);
  return dropped;
}

function voltageForInput(input, adc) {
  if (input.type === ADCMuxInputType.Constant) return input.voltage;
  if (input.type === ADCMuxInputType.SingleEnded) return adc.channelValues[input.channel] ?? 0;
  if (input.type === ADCMuxInputType.Differential) {
    return input.gain * ((adc.channelValues[input.positiveChannel] ?? 0) - (adc.channelValues[input.negativeChannel] ?? 0));
  }
  if (input.type === ADCMuxInputType.Temperature) return 0.378125;
  return 0;
}

export class Atmega328PAdapter {
  constructor(hexText, options = {}) {
    this.program = parseIntelHex(hexText);
    this.speed = options.speed ?? 1;
    this.inputLevels = new Map();
    this.digitalBridges = new Map();
    this.refreshingDigitalBridges = false;
    this.analogVoltages = new Map();
    this.stuckAnalogChannels = new Map();
    this.faultEvents = [];
    this.scheduledEvents = [];
    this.paused = true;
    this.x34Observer = options.x34Probe ? new X34PrecisionObserver(options.x34Probe) : null;
    this.x35Observer = options.x35Probe ? new X35CausalObserver(options.x35Probe) : null;
    this.x46RuntimeIdentity = options.runtimeIdentity
      ? structuredClone(options.runtimeIdentity) : null;
    this.x46ResetEpoch = 0;
    const dht11Devices = options.dht11Devices ?? [];
    if (!Array.isArray(dht11Devices) || dht11Devices.length > 1
        || dht11Devices.some((item) => !item || item.type !== 'dht11'
          || typeof item.componentId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/u.test(item.componentId)
          || !Number.isInteger(item.pin) || item.pin < 2 || item.pin > 12
          || !Number.isInteger(item.temperatureC) || item.temperatureC < 0 || item.temperatureC > 50
          || !Number.isInteger(item.humidityPercent)
          || item.humidityPercent < 20 || item.humidityPercent > 90)) {
      throw new TypeError('DHT11_DEVICE_CONFIGURATION');
    }
    this.dht11Devices = new Map(dht11Devices.map((item) => [item.componentId, {
      componentId: item.componentId, pin: item.pin, temperatureC: item.temperatureC,
      humidityPercent: item.humidityPercent, lowStartCycle: null, busyUntilCycle: 0,
    }]));
    const dht22Devices = options.dht22Devices ?? [];
    if (!Array.isArray(dht22Devices) || dht22Devices.length > 1
        || dht22Devices.some((item) => !item || item.type !== 'dht22'
          || typeof item.componentId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/u.test(item.componentId)
          || !Number.isInteger(item.pin) || item.pin < 2 || item.pin > 12
          || !validDht22RuntimeValue(item.temperatureC, -40, 80)
          || !validDht22RuntimeValue(item.humidityPercent, 0, 100))) {
      throw new TypeError('DHT22_DEVICE_CONFIGURATION');
    }
    this.dht22Devices = new Map(dht22Devices.map((item) => [item.componentId, {
      componentId: item.componentId, pin: item.pin, temperatureC: item.temperatureC,
      humidityPercent: item.humidityPercent, lowStartCycle: null, busyUntilCycle: 0,
    }]));
    const ds18b20Devices = options.ds18b20Devices ?? [];
    if (!Array.isArray(ds18b20Devices) || ds18b20Devices.length > 1
        || ds18b20Devices.some((item) => !item || item.type !== 'ds18b20'
          || typeof item.componentId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/u.test(item.componentId)
          || !Number.isInteger(item.pin) || item.pin < 2 || item.pin > 12
          || !validDs18b20RuntimeTemperature(item.temperatureC))) {
      throw new TypeError('DS18B20_DEVICE_CONFIGURATION');
    }
    this.ds18b20Devices = new Map(ds18b20Devices.map((item) => [item.componentId, {
      componentId: item.componentId,
      pin: item.pin,
      temperatureC: item.temperatureC,
      lowStartCycle: null,
      busyUntilCycle: 0,
      phase: 'await-reset',
      receiveByte: 0,
      receiveBit: 0,
      scratchpad: ds18b20RuntimeScratchpad(item.temperatureC),
      readBits: [],
      readBit: 0,
      converted: false,
    }]));
    const i2cDevices = options.i2cDevices ?? [];
    if (!Array.isArray(i2cDevices) || i2cDevices.length > 1
        || i2cDevices.some((item) => item?.address !== 0x27 || item?.type !== 'pcf8574-lcd')) {
      throw new TypeError('I2C_DEVICE_CONFIGURATION');
    }
    this.i2cAddresses = new Set(i2cDevices.map((item) => item.address));
    this.#createMachine();
  }

  #createMachine() {
    this.cpu = new CPU(this.program, 0x800);
    this.cpu.cycles = 0;
    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    this.timers = [
      new AVRTimer(this.cpu, timer0Config),
      new AVRTimer(this.cpu, timer1Config),
      new AVRTimer(this.cpu, timer2Config),
    ];
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    this.twi = new AVRTWI(this.cpu, twiConfig, CLOCK_HZ);
    this.x46ResetEpoch += 1;
    this.x46UsartConfiguration = this.x46RuntimeIdentity
      ? new X46UsartConfigurationProducer(this.x46RuntimeIdentity, this.x46ResetEpoch)
      : null;
    this.trace = [];
    this.serial = [];
    this.i2c = [];
    this.dht11 = [];
    this.dht22 = [];
    this.ds18b20 = [];
    this.usartRxSequence = 0;
    this.activeUsartRx = null;
    this.pendingUsartRxCompletion = null;
    this.recordingUsartRxRequest = false;
    this.adcReads = [];
    this.unsupported = [];
    this.x47DigitalTransitions = [];
    this.x47DigitalTransitionDrops = 0;
    this.stuckAnalogChannels = new Map();
    this.faultEvents = [];
    this.retentionDrops = { logic: 0, serial: 0, i2c: 0, adc: 0, unsupported: 0 };
    this.blocked = false;
    this.instructions = 0;
    this.x34Observer?.reset();
    this.x35Observer?.reset();
    this.lastPortValues = { B: 0, C: 0, D: 0 };
    this.#attachPortTrace('B');
    this.#attachPortTrace('C');
    this.#attachPortTrace('D');
    this.#attachAdcTrace();
    this.#attachUsartTrace();
    this.#attachUsartConfigurationTrace();
    this.#attachTwiTrace();
    this.#attachUnsupportedMonitors();
    this.#attachUnsupportedModeMonitors();
    for (const [pin, level] of this.inputLevels) this.#setDigitalPinNow(pin, level, false);
    for (const device of this.dht11Devices.values()) {
      device.lowStartCycle = null;
      device.busyUntilCycle = 0;
      this.#setDigitalPinNow(device.pin, true, false);
    }
    for (const device of this.dht22Devices.values()) {
      device.lowStartCycle = null;
      device.busyUntilCycle = 0;
      this.#setDigitalPinNow(device.pin, true, false);
    }
    for (const device of this.ds18b20Devices.values()) {
      device.lowStartCycle = null;
      device.busyUntilCycle = 0;
      device.phase = 'await-reset';
      device.receiveByte = 0;
      device.receiveBit = 0;
      device.scratchpad = ds18b20RuntimeScratchpad(device.temperatureC);
      device.readBits = [];
      device.readBit = 0;
      device.converted = false;
      this.#setDigitalPinNow(device.pin, true, false);
    }
    this.#refreshDigitalBridges();
    for (const [channel, voltage] of this.analogVoltages) this.adc.channelValues[channel] = voltage;
  }

  #attachPortTrace(name) {
    this.ports[name].addListener((value, oldValue) => {
      this.lastPortValues[name] = value;
      const changed = value ^ oldValue;
      for (let bit = 0; bit < 8; bit++) {
        if (!(changed & (1 << bit))) continue;
        const pin = Object.entries(PIN_MAP).find(([, mapping]) => mapping[0] === name && mapping[1] === bit)?.[0];
        if (pin === undefined) continue;
        this.retentionDrops.logic += boundedPush(this.trace, {
          cycle: this.cpu.cycles,
          pin: /^\d+$/.test(pin) ? Number(pin) : pin,
          level: Boolean(value & (1 << bit)),
        }, TRACE_LIMIT);
      }
      this.#refreshDigitalBridges();
    });
  }

  #attachAdcTrace() {
    this.adc.onADCRead = (input) => {
      const startCycle = this.cpu.cycles;
      const sampleCycles = this.adc.sampleCycles;
      const voltage = voltageForInput(input, this.adc);
      const raw = Math.min(Math.max(Math.floor((voltage / this.adc.referenceVoltage) * 1024), 0), 1023);
      const entry = {
        channel: input.type === ADCMuxInputType.SingleEnded ? input.channel : null,
        startCycle, sampleCycles, completionCycle: null, value: raw,
      };
      this.retentionDrops.adc += boundedPush(this.adcReads, entry, SAMPLE_LIMIT);
      this.cpu.addClockEvent(() => {
        entry.completionCycle = this.cpu.cycles;
        this.adc.completeADCRead(raw);
      }, sampleCycles);
    };
  }

  #attachUsartTrace() {
    this.usart.onByteTransmit = (value) => {
      const ubrr = (this.cpu.data[usart0Config.UBRRH] << 8) | this.cpu.data[usart0Config.UBRRL];
      const multiplier = this.cpu.data[usart0Config.UCSRA] & 0x02 ? 8 : 16;
      const symbols = 1 + this.usart.bitsPerChar + this.usart.stopBits + (this.usart.parityEnabled ? 1 : 0);
      this.retentionDrops.serial += boundedPush(this.serial, {
        direction: 'tx',
        cycle: this.cpu.cycles,
        value,
        baud: this.usart.baudRate,
        frameCycles: (ubrr + 1) * multiplier * symbols,
      }, SERIAL_LIMIT);
    };
    this.usart.onRxComplete = () => {
      const transfer = this.activeUsartRx;
      const cycle = this.cpu.cycles;
      const completion = {
        direction: 'rx-complete', cycle,
        ...(transfer ? {
          transferId: transfer.transferId,
          resetEpoch: transfer.resetEpoch,
          value: transfer.value,
          startCycle: transfer.startCycle,
          scheduledCompletionCycle: transfer.scheduledCompletionCycle,
          observationLatenessCycles: cycle - transfer.scheduledCompletionCycle,
        } : {}),
      };
      if (this.recordingUsartRxRequest) this.pendingUsartRxCompletion = completion;
      else this.retentionDrops.serial += boundedPush(this.serial, completion, SERIAL_LIMIT);
      this.activeUsartRx = null;
    };
  }

  #usartRegisters() {
    return Object.fromEntries(['UCSRA', 'UCSRB', 'UCSRC', 'UBRRL', 'UBRRH']
      .map((name) => [name, this.cpu.data[usart0Config[name]]]));
  }

  #attachUsartConfigurationTrace() {
    if (!this.x46UsartConfiguration) return;
    for (const register of ['UCSRA', 'UCSRB', 'UCSRC', 'UBRRL', 'UBRRH']) {
      this.#wrapWrite(usart0Config[register], (value) => {
        this.x46UsartConfiguration.observe({
          cycle: this.cpu.cycles,
          register,
          value: this.cpu.data[usart0Config[register]],
          registers: this.#usartRegisters(),
        });
      });
    }
  }

  #attachTwiTrace() {
    let address = null;
    this.twi.eventHandler = {
      start: (repeated) => {
        this.retentionDrops.i2c += boundedPush(this.i2c,
          { cycle: this.cpu.cycles, kind: repeated ? 'repeated-start' : 'start' }, I2C_LIMIT);
        this.twi.completeStart();
      },
      stop: () => {
        this.retentionDrops.i2c += boundedPush(this.i2c,
          { cycle: this.cpu.cycles, kind: 'stop', address }, I2C_LIMIT);
        address = null; this.twi.completeStop();
      },
      connectToSlave: (nextAddress, write) => {
        address = nextAddress;
        const acknowledged = write && this.i2cAddresses.has(address);
        this.retentionDrops.i2c += boundedPush(this.i2c,
          { cycle: this.cpu.cycles, kind: 'address', address, read: !write, acknowledged }, I2C_LIMIT);
        this.twi.completeConnect(acknowledged);
      },
      writeByte: (value) => {
        const acknowledged = this.i2cAddresses.has(address);
        this.retentionDrops.i2c += boundedPush(this.i2c,
          { cycle: this.cpu.cycles, kind: 'write', address, value, acknowledged }, I2C_LIMIT);
        this.twi.completeWrite(acknowledged);
      },
      readByte: () => {
        this.#markUnsupported('twi-read', { address });
        this.twi.completeRead(0xff);
      },
    };
  }

  #attachUnsupportedMonitors() {
    for (const monitor of UNSUPPORTED_REGISTERS) {
      const prior = this.cpu.writeHooks[monitor.address];
      this.cpu.writeHooks[monitor.address] = (value, oldValue, address, mask) => {
        if (monitor.active(value)) {
          this.retentionDrops.unsupported += boundedPush(
            this.unsupported,
            { cycle: this.cpu.cycles, peripheral: monitor.name, address, value },
            UNSUPPORTED_LIMIT,
          );
          this.blocked = true;
        }
        return prior ? prior(value, oldValue, address, mask) : false;
      };
    }
  }

  #markUnsupported(peripheral, details = {}) {
    this.retentionDrops.unsupported += boundedPush(
      this.unsupported, { cycle: this.cpu.cycles, peripheral, ...details }, UNSUPPORTED_LIMIT,
    );
    this.blocked = true;
  }

  #wrapWrite(address, inspect, inspectBefore = false) {
    const prior = this.cpu.writeHooks[address];
    this.cpu.writeHooks[address] = (value, oldValue, register, mask) => {
      if (inspectBefore) {
        inspect(value, register);
        if (this.blocked) return true;
      }
      const result = prior ? prior(value, oldValue, register, mask) : false;
      if (!inspectBefore) inspect(value, register);
      return result;
    };
  }

  #attachUnsupportedModeMonitors() {
    const timerCases = [
      { timer: this.timers[0], config: timer0Config, reserved: new Set([4, 6]), externalClock: true },
      { timer: this.timers[1], config: timer1Config, reserved: new Set([13]), externalClock: true },
      { timer: this.timers[2], config: timer2Config, reserved: new Set([4, 6]), externalClock: false },
    ];
    for (const item of timerCases) {
      const check = (value, register) => {
        if (item.reserved.has(item.timer.WGM)) this.#markUnsupported('unsupported-timer-mode', { register, value, wgm: item.timer.WGM });
        if (item.externalClock && item.timer.CS >= 6) this.#markUnsupported('external-timer-clock', { register, value });
      };
      this.#wrapWrite(item.config.TCCRA, check);
      this.#wrapWrite(item.config.TCCRB, check);
    }
    this.#wrapWrite(timer1Config.TIMSK, (value, register) => {
      if (value & 0x20) this.#markUnsupported('timer1-input-capture', { register, value });
    });

    this.#wrapWrite(adcConfig.ADCSRB, (value, register) => {
      if (value & 0x07) this.#markUnsupported('adc-auto-trigger', { register, value });
    }, true);
    this.#wrapWrite(adcConfig.ADCSRA, (value, register) => {
      if ((value & 0x60) === 0x60) this.#markUnsupported('adc-auto-trigger', { register, value });
      const refs = (this.cpu.data[adcConfig.ADMUX] >> 6) & 0x03;
      if ((value & 0x40) && refs !== 1) this.#markUnsupported('adc-reference', { register, value, refs });
    }, true);

    this.#wrapWrite(usart0Config.UDR, (value, register) => {
      const ubrr = (this.cpu.data[usart0Config.UBRRH] << 8) | this.cpu.data[usart0Config.UBRRL];
      const multiplier = this.cpu.data[usart0Config.UCSRA] & 0x02 ? 8 : 16;
      const symbols = 1 + this.usart.bitsPerChar + this.usart.stopBits + (this.usart.parityEnabled ? 1 : 0);
      const frameCycles = (ubrr + 1) * multiplier * symbols;
      const frameIs8N1 = this.usart.bitsPerChar === 8 && this.usart.stopBits === 1 && !this.usart.parityEnabled;
      if (!frameIs8N1 || ![16640, 8320, 4160, 2720, 1360].includes(frameCycles)) {
        this.#markUnsupported('usart-configuration', { register, value, frameCycles });
      }
    }, true);
  }

  #detectUnsupportedOpcode() {
    const opcode = this.cpu.progMem[this.cpu.pc];
    if (opcode === 0x9588 && (this.cpu.data[0x53] & 0x01)) {
      this.retentionDrops.unsupported += boundedPush(
        this.unsupported, { cycle: this.cpu.cycles, peripheral: 'sleep', opcode }, UNSUPPORTED_LIMIT,
      );
      this.blocked = true;
    } else if (opcode === 0x95e8 || opcode === 0x95f8) {
      this.retentionDrops.unsupported += boundedPush(
        this.unsupported, { cycle: this.cpu.cycles, peripheral: 'self-programming', opcode }, UNSUPPORTED_LIMIT,
      );
      this.blocked = true;
    }
  }

  #applyDueEvents() {
    while (this.scheduledEvents.length && this.scheduledEvents[0].cycle <= this.cpu.cycles) {
      const event = this.scheduledEvents.shift();
      if (event.type === 'digital') {
        const observed = this.#setDigitalPinNow(event.pin, event.level);
        if (event.x47) {
          this.x47DigitalTransitionDrops += boundedPush(this.x47DigitalTransitions, {
            transactionId: event.x47.transactionId,
            eventIndex: event.x47.eventIndex,
            targetCycle: event.cycle,
            appliedCycle: this.cpu.cycles,
            pin: event.pin,
            level: Boolean(event.level),
            beforeLevel: observed.before,
            afterLevel: observed.after,
            transitioned: observed.transitioned,
            transitionCycle: observed.transitioned ? this.cpu.cycles : null,
          }, X47_TRANSITION_LIMIT);
        }
      }
      if (event.type === 'analogue') this.setAnalogChannel(event.channel, event.voltage);
      if (event.type === 'dht11') this.#setDigitalPinNow(event.pin, event.level);
      if (event.type === 'dht22') this.#setDigitalPinNow(event.pin, event.level);
      if (event.type === 'ds18b20') this.#setDigitalPinNow(event.pin, event.level);
      if (event.type === 'fault-digital-drive') {
        this.inputLevels.set(event.pin, event.level);
        this.#setDigitalPinNow(event.pin, event.level);
        this.faultEvents.push({ kind: 'button-bounce-transition', eventId: event.eventId,
          requestedCycle: event.cycle, appliedCycle: this.cpu.cycles,
          drive: event.level ? 'HIGH' : 'LOW' });
      }
      if (event.type === 'fault-digital-release') this.#releaseDigitalPinNow(event);
      if (event.type === 'fault-analogue-stuck') {
        const appliedVoltage = ((event.stuckValueC + 50) / 200) * 5;
        this.stuckAnalogChannels.set(event.channel,
          { eventId: event.eventId, stuckValueC: event.stuckValueC, appliedVoltage });
        this.analogVoltages.set(event.channel, appliedVoltage);
        this.adc.channelValues[event.channel] = appliedVoltage;
        this.faultEvents.push({ kind: 'temperature-stuck', eventId: event.eventId,
          requestedCycle: event.cycle, appliedCycle: this.cpu.cycles,
          stuckValueC: event.stuckValueC, appliedVoltage });
      }
      if (event.type === 'uart-rx') {
        const startCycle = this.cpu.cycles;
        const frameCycles = this.usart.cyclesPerChar;
        const transfer = {
          transferId: `rx:${this.x46ResetEpoch}:${this.usartRxSequence += 1}`,
          resetEpoch: this.x46ResetEpoch,
          value: event.value,
          startCycle,
          scheduledCompletionCycle: startCycle + frameCycles,
        };
        const priorTransfer = this.activeUsartRx;
        if (!priorTransfer) this.activeUsartRx = transfer;
        this.recordingUsartRxRequest = true;
        const accepted = this.usart.writeByte(event.value, event.immediate ?? false);
        this.recordingUsartRxRequest = false;
        if (accepted === false) this.activeUsartRx = priorTransfer;
        this.retentionDrops.serial += boundedPush(this.serial, {
          direction: 'rx-request', cycle: startCycle, targetCycle: event.cycle,
          startObservationLatenessCycles: startCycle - event.cycle,
          value: event.value, accepted: accepted !== false,
          immediate: event.immediate === true,
          transferId: transfer.transferId,
          resetEpoch: transfer.resetEpoch,
          baud: this.usart.baudRate,
          frameCycles,
          scheduledCompletionCycle: accepted === false ? null : transfer.scheduledCompletionCycle,
        }, SERIAL_LIMIT);
        if (this.pendingUsartRxCompletion) {
          this.retentionDrops.serial += boundedPush(this.serial,
            this.pendingUsartRxCompletion, SERIAL_LIMIT);
          this.pendingUsartRxCompletion = null;
        }
      }
    }
  }

  #setDigitalPinNow(pin, level, record = true) {
    const mapping = PIN_MAP[pin];
    if (!mapping) throw new Error(`Unsupported digital pin ${pin}`);
    const config = { B: portBConfig, C: portCConfig, D: portDConfig }[mapping[0]];
    const mask = 1 << mapping[1];
    const before = Boolean(this.cpu.data[config.PIN] & mask);
    this.ports[mapping[0]].setPin(mapping[1], Boolean(level));
    const after = Boolean(this.cpu.data[config.PIN] & mask);
    const normalizedPin = /^\d+$/.test(String(pin)) ? Number(pin) : pin;
    const duplicate = this.trace.at(-1);
    if (record && before !== after && !(duplicate?.cycle === this.cpu.cycles
        && duplicate.pin === normalizedPin && duplicate.level === after)) {
      this.retentionDrops.logic += boundedPush(
        this.trace, { cycle: this.cpu.cycles, pin: normalizedPin, level: after }, TRACE_LIMIT,
      );
    }
    return { before, after, transitioned: before !== after };
  }

  setDigitalPin(pin, level) {
    const alreadyInitialized = this.inputLevels.has(pin);
    this.inputLevels.set(pin, Boolean(level));
    this.#setDigitalPinNow(pin, level, alreadyInitialized);
  }

  setDht11Environment(componentId, key, value) {
    const device = this.dht11Devices.get(componentId);
    const valid = key === 'temperatureC'
      ? Number.isInteger(value) && value >= 0 && value <= 50
      : key === 'humidityPercent' && Number.isInteger(value) && value >= 20 && value <= 90;
    if (!device || !valid) throw new TypeError('DHT11_CONTROL');
    device[key] = value;
  }

  #scheduleDht11Response(device, releaseCycle, startPulseCycles) {
    const bytes = [device.humidityPercent, 0, device.temperatureC, 0];
    bytes.push(bytes.reduce((sum, value) => (sum + value) & 0xff, 0));
    const bits = bytes.flatMap((value) => Array.from({ length: 8 }, (_, index) =>
      Boolean(value & (1 << (7 - index)))));
    let cycle = releaseCycle + microsToCycles(20);
    this.#schedule({ type: 'dht11', cycle, pin: device.pin, level: false });
    cycle += microsToCycles(80);
    this.#schedule({ type: 'dht11', cycle, pin: device.pin, level: true });
    cycle += microsToCycles(80);
    this.#schedule({ type: 'dht11', cycle, pin: device.pin, level: false });
    for (const bit of bits) {
      cycle += microsToCycles(50);
      this.#schedule({ type: 'dht11', cycle, pin: device.pin, level: true });
      cycle += microsToCycles(bit ? 70 : 28);
      this.#schedule({ type: 'dht11', cycle, pin: device.pin, level: false });
    }
    cycle += microsToCycles(50);
    this.#schedule({ type: 'dht11', cycle, pin: device.pin, level: true });
    device.busyUntilCycle = cycle;
    boundedPush(this.dht11, {
      componentId: device.componentId, pin: device.pin, releaseCycle, startPulseCycles,
      responseStartCycle: releaseCycle + microsToCycles(20), responseEndCycle: cycle,
      temperatureC: device.temperatureC, humidityPercent: device.humidityPercent,
      payload: bytes,
    }, DHT11_TRANSACTION_LIMIT);
  }

  #monitorDht11() {
    for (const device of this.dht11Devices.values()) {
      const [port, bit] = PIN_MAP[device.pin];
      const config = { B: portBConfig, C: portCConfig, D: portDConfig }[port];
      const mask = 1 << bit;
      const hostDrivingLow = Boolean(this.cpu.data[config.DDR] & mask)
        && !Boolean(this.cpu.data[config.PORT] & mask);
      if (hostDrivingLow) {
        if (device.lowStartCycle === null && this.cpu.cycles >= device.busyUntilCycle) {
          device.lowStartCycle = this.cpu.cycles;
        }
        continue;
      }
      if (device.lowStartCycle === null) continue;
      const startPulseCycles = this.cpu.cycles - device.lowStartCycle;
      device.lowStartCycle = null;
      if (startPulseCycles >= DHT11_START_MIN_CYCLES
          && this.cpu.cycles >= device.busyUntilCycle) {
        this.#scheduleDht11Response(device, this.cpu.cycles, startPulseCycles);
      }
    }
  }

  setDht22Environment(componentId, key, value) {
    const device = this.dht22Devices.get(componentId);
    const valid = key === 'temperatureC'
      ? validDht22RuntimeValue(value, -40, 80)
      : key === 'humidityPercent' && validDht22RuntimeValue(value, 0, 100);
    if (!device || !valid) throw new TypeError('DHT22_CONTROL');
    device[key] = value;
  }

  #scheduleDht22Response(device, releaseCycle, startPulseCycles) {
    const bytes = dht22RuntimePayload(device.temperatureC, device.humidityPercent);
    const bits = bytes.flatMap((value) => Array.from({ length: 8 }, (_, index) =>
      Boolean(value & (1 << (7 - index)))));
    let cycle = releaseCycle + microsToCycles(20);
    this.#schedule({ type: 'dht22', cycle, pin: device.pin, level: false });
    cycle += microsToCycles(80);
    this.#schedule({ type: 'dht22', cycle, pin: device.pin, level: true });
    cycle += microsToCycles(80);
    this.#schedule({ type: 'dht22', cycle, pin: device.pin, level: false });
    for (const bit of bits) {
      cycle += microsToCycles(50);
      this.#schedule({ type: 'dht22', cycle, pin: device.pin, level: true });
      cycle += microsToCycles(bit ? 70 : 28);
      this.#schedule({ type: 'dht22', cycle, pin: device.pin, level: false });
    }
    cycle += microsToCycles(50);
    this.#schedule({ type: 'dht22', cycle, pin: device.pin, level: true });
    device.busyUntilCycle = cycle;
    boundedPush(this.dht22, {
      componentId: device.componentId, pin: device.pin, releaseCycle, startPulseCycles,
      responseStartCycle: releaseCycle + microsToCycles(20), responseEndCycle: cycle,
      temperatureC: device.temperatureC, humidityPercent: device.humidityPercent,
      payload: bytes,
    }, DHT22_TRANSACTION_LIMIT);
  }

  #monitorDht22() {
    for (const device of this.dht22Devices.values()) {
      const [port, bit] = PIN_MAP[device.pin];
      const config = { B: portBConfig, C: portCConfig, D: portDConfig }[port];
      const mask = 1 << bit;
      const hostDrivingLow = Boolean(this.cpu.data[config.DDR] & mask)
        && !Boolean(this.cpu.data[config.PORT] & mask);
      if (hostDrivingLow) {
        if (device.lowStartCycle === null && this.cpu.cycles >= device.busyUntilCycle) {
          device.lowStartCycle = this.cpu.cycles;
        }
        continue;
      }
      if (device.lowStartCycle === null) continue;
      const startPulseCycles = this.cpu.cycles - device.lowStartCycle;
      device.lowStartCycle = null;
      if (startPulseCycles >= DHT22_START_MIN_CYCLES
          && this.cpu.cycles >= device.busyUntilCycle) {
        this.#scheduleDht22Response(device, this.cpu.cycles, startPulseCycles);
      }
    }
  }

  setDs18b20Temperature(componentId, value) {
    const device = this.ds18b20Devices.get(componentId);
    if (!device || !validDs18b20RuntimeTemperature(value)) throw new TypeError('DS18B20_CONTROL');
    device.temperatureC = value;
  }

  #scheduleDs18b20Presence(device, releaseCycle, resetPulseCycles) {
    let cycle = releaseCycle + microsToCycles(30);
    this.#schedule({ type: 'ds18b20', cycle, pin: device.pin, level: false });
    cycle += microsToCycles(120);
    this.#schedule({ type: 'ds18b20', cycle, pin: device.pin, level: true });
    device.busyUntilCycle = cycle;
    device.phase = 'rom-command';
    device.receiveByte = 0;
    device.receiveBit = 0;
    device.readBits = [];
    device.readBit = 0;
    boundedPush(this.ds18b20, {
      kind: 'reset-presence', componentId: device.componentId, pin: device.pin,
      releaseCycle, resetPulseCycles, presenceStartCycle: releaseCycle + microsToCycles(30),
      presenceEndCycle: cycle,
    }, DS18B20_TRANSACTION_LIMIT);
  }

  #acceptDs18b20WriteBit(device, bit, cycle) {
    device.receiveByte |= (bit ? 1 : 0) << device.receiveBit;
    device.receiveBit += 1;
    if (device.receiveBit < 8) return;
    const command = device.receiveByte;
    const phase = device.phase;
    device.receiveByte = 0;
    device.receiveBit = 0;
    boundedPush(this.ds18b20, {
      kind: 'command', componentId: device.componentId, pin: device.pin,
      cycle, phase, command,
    }, DS18B20_TRANSACTION_LIMIT);
    if (phase === 'rom-command') {
      device.phase = command === 0xcc ? 'function-command' : 'await-reset';
      return;
    }
    if (phase !== 'function-command') {
      device.phase = 'await-reset';
      return;
    }
    if (command === 0x44) {
      device.scratchpad = ds18b20RuntimeScratchpad(device.temperatureC);
      device.converted = true;
      device.phase = 'await-reset';
      return;
    }
    if (command === 0xbe && device.converted) {
      device.scratchpad = ds18b20RuntimeScratchpad(device.temperatureC);
      device.readBits = device.scratchpad.flatMap((value) =>
        Array.from({ length: 8 }, (_unused, index) => Boolean(value & (1 << index))));
      device.readBit = 0;
      device.phase = 'read-scratchpad';
      return;
    }
    device.phase = 'await-reset';
  }

  #scheduleDs18b20ReadBit(device, releaseCycle) {
    const bit = device.readBits[device.readBit];
    if (typeof bit !== 'boolean') {
      device.phase = 'await-reset';
      return;
    }
    let cycle = releaseCycle + microsToCycles(2);
    this.#schedule({ type: 'ds18b20', cycle, pin: device.pin, level: bit });
    cycle = releaseCycle + microsToCycles(45);
    this.#schedule({ type: 'ds18b20', cycle, pin: device.pin, level: true });
    device.busyUntilCycle = cycle;
    device.readBit += 1;
    if (device.readBit === device.readBits.length) {
      boundedPush(this.ds18b20, {
        kind: 'scratchpad-read', componentId: device.componentId, pin: device.pin,
        releaseCycle, temperatureC: device.temperatureC,
        scratchpad: [...device.scratchpad], crcValid: true,
      }, DS18B20_TRANSACTION_LIMIT);
      device.phase = 'await-reset';
    }
  }

  #monitorDs18b20() {
    for (const device of this.ds18b20Devices.values()) {
      const [port, bit] = PIN_MAP[device.pin];
      const config = { B: portBConfig, C: portCConfig, D: portDConfig }[port];
      const mask = 1 << bit;
      const hostDrivingLow = Boolean(this.cpu.data[config.DDR] & mask)
        && !Boolean(this.cpu.data[config.PORT] & mask);
      if (hostDrivingLow) {
        if (device.lowStartCycle === null && this.cpu.cycles >= device.busyUntilCycle) {
          device.lowStartCycle = this.cpu.cycles;
        }
        continue;
      }
      if (device.lowStartCycle === null) continue;
      const lowCycles = this.cpu.cycles - device.lowStartCycle;
      device.lowStartCycle = null;
      if (lowCycles >= DS18B20_RESET_MIN_CYCLES) {
        this.#scheduleDs18b20Presence(device, this.cpu.cycles, lowCycles);
      } else if (this.cpu.cycles >= device.busyUntilCycle && device.phase === 'read-scratchpad') {
        this.#scheduleDs18b20ReadBit(device, this.cpu.cycles);
      } else if (this.cpu.cycles >= device.busyUntilCycle
          && ['rom-command', 'function-command'].includes(device.phase)) {
        this.#acceptDs18b20WriteBit(device, lowCycles < DS18B20_WRITE_ZERO_MIN_CYCLES, this.cpu.cycles);
      }
    }
  }

  setDigitalBridge(id, pinA, pinB, closed) {
    if (typeof id !== 'string' || !/^\d+$/.test(String(pinA)) || !/^\d+$/.test(String(pinB))
        || !PIN_MAP[pinA] || !PIN_MAP[pinB] || pinA === pinB || typeof closed !== 'boolean') {
      throw new TypeError('DIGITAL_BRIDGE_CONFIGURATION');
    }
    this.digitalBridges.set(id, { pinA: Number(pinA), pinB: Number(pinB), closed });
    this.#refreshDigitalBridges();
  }

  #refreshDigitalBridges() {
    if (this.refreshingDigitalBridges || !this.cpu) return;
    this.refreshingDigitalBridges = true;
    try {
      const configFor = (pin) => { const [port, bit] = PIN_MAP[pin];
        return { port, bit, config: { B: portBConfig, C: portCConfig, D: portDConfig }[port] }; };
      for (const bridge of this.digitalBridges.values()) {
        if (!bridge.closed) continue;
        const left = configFor(bridge.pinA); const right = configFor(bridge.pinB);
        const leftOutput = Boolean(this.cpu.data[left.config.DDR] & (1 << left.bit));
        const rightOutput = Boolean(this.cpu.data[right.config.DDR] & (1 << right.bit));
        if (leftOutput && !rightOutput) this.#setDigitalPinNow(bridge.pinB,
          Boolean(this.cpu.data[left.config.PORT] & (1 << left.bit)), false);
        else if (rightOutput && !leftOutput) this.#setDigitalPinNow(bridge.pinA,
          Boolean(this.cpu.data[right.config.PORT] & (1 << right.bit)), false);
        else if (!leftOutput && !rightOutput) {
          this.#setDigitalPinNow(bridge.pinA, true, false);
          this.#setDigitalPinNow(bridge.pinB, true, false);
        }
      }
    } finally { this.refreshingDigitalBridges = false; }
  }

  #releaseDigitalPinNow(event) {
    if (event.pin !== 2) throw new Error('FAULT_OPEN_CIRCUIT_PIN_UNSUPPORTED');
    const [port, bit] = PIN_MAP[event.pin];
    const config = { B: portBConfig, C: portCConfig, D: portDConfig }[port];
    const mask = 1 << bit;
    const output = Boolean(this.cpu.data[config.DDR] & mask);
    const pullup = !output && Boolean(this.cpu.data[config.PORT] & mask);
    if (output || !pullup) throw new Error('FAULT_OPEN_CIRCUIT_REQUIRES_INPUT_PULLUP');
    this.inputLevels.delete(event.pin);
    this.#setDigitalPinNow(event.pin, true);
    this.faultEvents.push({ kind: 'button-open-circuit', eventId: event.eventId,
      requestedCycle: event.cycle, appliedCycle: this.cpu.cycles,
      externalDrive: 'RELEASED', resolvedBy: 'INPUT_PULLUP' });
  }

  setAnalogChannel(channel, voltage) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 5) throw new Error('ADC channel must be A0..A5');
    if (!Number.isFinite(voltage) || voltage < 0 || voltage > 5) throw new Error('ADC voltage must be between 0 and 5');
    const stuck = this.stuckAnalogChannels.get(channel);
    if (stuck) {
      this.faultEvents.push({ kind: 'temperature-stuck-held', eventId: stuck.eventId,
        requestedCycle: this.cpu.cycles, appliedCycle: this.cpu.cycles,
        requestedVoltage: voltage, appliedVoltage: stuck.appliedVoltage });
      this.analogVoltages.set(channel, stuck.appliedVoltage);
      this.adc.channelValues[channel] = stuck.appliedVoltage;
      return;
    }
    this.analogVoltages.set(channel, voltage);
    this.adc.channelValues[channel] = voltage;
  }

  scheduleButtonBounce(cycle, pin, eventId, patternMilliseconds) {
    if (pin !== 2 || typeof eventId !== 'string' || !Array.isArray(patternMilliseconds)
        || patternMilliseconds.length !== 5) throw new Error('FAULT_BUTTON_BOUNCE_INVALID');
    for (const [index, offsetMilliseconds] of patternMilliseconds.entries()) {
      this.#schedule({ type: 'fault-digital-drive', cycle: cycle + offsetMilliseconds * 16_000,
        pin, level: index % 2 === 1, eventId });
    }
  }

  scheduleDigitalRelease(cycle, pin, eventId) {
    if (pin !== 2 || typeof eventId !== 'string') throw new Error('FAULT_BUTTON_OPEN_INVALID');
    this.#schedule({ type: 'fault-digital-release', cycle, pin, eventId });
  }

  scheduleAnalogStuck(cycle, channel, stuckValueC, eventId) {
    if (channel !== 1 || !Number.isInteger(stuckValueC) || stuckValueC < -50 || stuckValueC > 150
        || typeof eventId !== 'string') throw new Error('FAULT_TEMPERATURE_STUCK_INVALID');
    this.#schedule({ type: 'fault-analogue-stuck', cycle, channel, stuckValueC, eventId });
  }

  scheduleDigital(cycle, pin, level, x47 = null) {
    if (x47 !== null && (!x47 || typeof x47 !== 'object' || Array.isArray(x47)
        || Object.keys(x47).sort().join('|') !== 'eventIndex|transactionId'
        || typeof x47.transactionId !== 'string' || ![0, 1].includes(x47.eventIndex))) {
      throw new Error('X47_ADAPTER_CORRELATION_INVALID');
    }
    this.#schedule({ type: 'digital', cycle, pin, level: Boolean(level),
      ...(x47 ? { x47: { ...x47 } } : {}) });
  }

  cancelX47Transactions(transactionIds) {
    if (!Array.isArray(transactionIds) || transactionIds.some((id) => typeof id !== 'string')) {
      throw new Error('X47_ADAPTER_CANCEL_INVALID');
    }
    const selected = new Set(transactionIds);
    const before = this.scheduledEvents.length;
    this.scheduledEvents = this.scheduledEvents.filter((event) =>
      !event.x47 || !selected.has(event.x47.transactionId));
    return before - this.scheduledEvents.length;
  }

  x47DigitalTransitionSnapshot() {
    return {
      records: this.x47DigitalTransitions.map((entry) => ({ ...entry })),
      scheduled: this.scheduledEvents.filter((event) => event.x47).map((event) => ({
        transactionId: event.x47.transactionId,
        eventIndex: event.x47.eventIndex,
        targetCycle: event.cycle,
        pin: event.pin,
        level: Boolean(event.level),
      })),
      dropped: this.x47DigitalTransitionDrops,
      retention: { limit: X47_TRANSITION_LIMIT, retained: this.x47DigitalTransitions.length,
        dropped: this.x47DigitalTransitionDrops },
    };
  }

  scheduleUartRx(cycle, value, immediate = false) {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('UART byte must be 0..255');
    this.#schedule({ type: 'uart-rx', cycle, value, immediate });
  }

  scheduleAnalog(cycle, channel, voltage) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 5) throw new Error('ADC channel must be A0..A5');
    if (!Number.isFinite(voltage) || voltage < 0 || voltage > 5) throw new Error('ADC voltage must be between 0 and 5');
    this.#schedule({ type: 'analogue', cycle, channel, voltage });
  }

  #schedule(event) {
    if (!Number.isSafeInteger(event.cycle) || event.cycle < this.cpu.cycles) throw new Error('Event cycle is in the past');
    this.scheduledEvents.push(event);
    this.scheduledEvents.sort((a, b) => a.cycle - b.cycle);
  }

  step() {
    if (this.blocked) throw new Error(`Unsupported peripheral activation: ${this.unsupported.at(-1)?.peripheral ?? 'unknown'}`);
    this.#applyDueEvents();
    this.#detectUnsupportedOpcode();
    if (this.blocked) throw new Error(`Unsupported peripheral activation: ${this.unsupported.at(-1).peripheral}`);
    const before = this.cpu.cycles;
    const pcBefore = this.cpu.pc;
    const opcode = this.cpu.progMem[pcBefore];
    const portBefore = this.cpu.data[portBConfig.PORT];
    const traceBefore = this.trace.length;
    const x34Before = this.x34Observer?.read(this.cpu.data) ?? null;
    avrInstruction(this.cpu);
    const portAfterInstruction = this.cpu.data[portBConfig.PORT];
    const traceAfterInstruction = this.trace.length;
    this.cpu.tick();
    this.#monitorDht11();
    this.#monitorDht22();
    this.#monitorDs18b20();
    const portAfterTick = this.cpu.data[portBConfig.PORT];
    const traceAfterTick = this.trace.length;
    this.instructions++;
    const d13 = (this.x34Observer || this.x35Observer)
      ? this.pinSnapshot().find((pin) => pin.pin === 'D13') ?? null : null;
    if (this.x34Observer) {
      this.x34Observer.observe({
        before: x34Before,
        after: this.x34Observer.read(this.cpu.data),
        pcBefore,
        pcAfter: this.cpu.pc,
        cycle: this.cpu.cycles,
        latestAdc: this.adcReads.findLast((entry) => entry.channel === 1) ?? null,
        d13,
      });
    }
    this.x35Observer?.observeStep({
      pcBefore, pcAfter: this.cpu.pc, opcode, cycleBefore: before, cycleAfter: this.cpu.cycles,
      portBefore, portAfterInstruction, portAfterTick,
      instructionRecords: this.trace.slice(traceBefore, traceAfterInstruction),
      tickRecords: this.trace.slice(traceAfterInstruction, traceAfterTick),
      pin: d13, retentionDrops: { ...this.retentionDrops },
    });
    if (this.blocked) throw new Error(`Unsupported peripheral activation: ${this.unsupported.at(-1).peripheral}`);
    return { pcBefore, pcAfter: this.cpu.pc, cycles: this.cpu.cycles - before };
  }

  projectX35(projection) { this.x35Observer?.project(projection); }

  get x35Enabled() { return this.x35Observer !== null; }

  get x35ProjectionPending() { return this.x35Observer?.pending != null; }

  runInstructions(count) {
    if (!Number.isInteger(count) || count < 0) throw new Error('Instruction count must be a non-negative integer');
    for (let i = 0; i < count; i++) this.step();
    return this.snapshot();
  }

  runUntilCycle(targetCycle, maxInstructions = 100_000_000) {
    if (!Number.isSafeInteger(targetCycle) || targetCycle < this.cpu.cycles) throw new Error('Target cycle is invalid');
    let count = 0;
    while (this.cpu.cycles < targetCycle) {
      this.step();
      count++;
      if (count >= maxInstructions) throw new Error('Instruction slice limit reached');
    }
    return this.snapshot();
  }

  setSpeed(speed) {
    if (![0.1, 0.5, 1, 2, 4, 'maximum'].includes(speed)) throw new Error('Unsupported speed');
    this.speed = speed;
  }

  run() { this.paused = false; }
  pause() { this.paused = true; }

  reset() {
    const speed = this.speed;
    this.paused = true;
    this.scheduledEvents = [];
    this.#createMachine();
    this.speed = speed;
    return this.snapshot();
  }

  pinLevel(pin) {
    const mapping = PIN_MAP[pin];
    if (!mapping) throw new Error(`Unsupported digital pin ${pin}`);
    return Boolean(this.lastPortValues[mapping[0]] & (1 << mapping[1]));
  }

  pinSnapshot() {
    const configs = { B: portBConfig, C: portCConfig, D: portDConfig };
    const tracesByPin = new Map();
    for (const entry of this.trace) {
      if (typeof entry.pin !== 'number') continue;
      if (!tracesByPin.has(entry.pin)) tracesByPin.set(entry.pin, []);
      tracesByPin.get(entry.pin).push(entry);
    }
    const digital = Array.from({ length: 14 }, (_, pin) => {
      const [port, bit] = PIN_MAP[pin];
      const config = configs[port];
      const mask = 1 << bit;
      const output = Boolean(this.cpu.data[config.DDR] & mask);
      const pullup = !output && Boolean(this.cpu.data[config.PORT] & mask);
      const transitions = tracesByPin.get(pin) ?? [];
      const rising = transitions.filter((entry) => entry.level).slice(-2);
      let pwm = null;
      const pwmOutput = PWM_OUTPUTS[pin];
      if (output && pwmOutput && (this.cpu.data[pwmOutput[0].TCCRA] & pwmOutput[1]) && rising.length === 2) {
        const falling = transitions.find((entry) => !entry.level
          && entry.cycle > rising[0].cycle && entry.cycle < rising[1].cycle);
        const periodCycles = rising[1].cycle - rising[0].cycle;
        if (falling && periodCycles > 0) {
          pwm = {
            periodCycles,
            highCycles: falling.cycle - rising[0].cycle,
            duty: (falling.cycle - rising[0].cycle) / periodCycles,
          };
        }
      }
      return {
        pin: `D${pin}`,
        mode: output ? (pwm ? 'DIGITAL_PWM' : 'OUTPUT') : pullup ? 'INPUT_PULLUP' : 'INPUT',
        level: Boolean(this.cpu.data[config.PIN] & mask),
        externalDrive: this.inputLevels.has(pin) ? (this.inputLevels.get(pin) ? 'HIGH' : 'LOW') : 'RELEASED',
        pwm,
        diagnostic: this.blocked ? 'UNSUPPORTED_PERIPHERAL' : 'OK',
      };
    });
    const analogue = Array.from({ length: 6 }, (_, channel) => {
      const read = this.adcReads.findLast((entry) => entry.channel === channel) ?? null;
      const mask = 1 << channel;
      const output = Boolean(this.cpu.data[portCConfig.DDR] & mask);
      const pullup = !output && Boolean(this.cpu.data[portCConfig.PORT] & mask);
      return {
        pin: `A${channel}`,
        mode: output ? 'OUTPUT' : read ? 'ANALOG_INPUT' : pullup ? 'INPUT_PULLUP' : 'INPUT',
        level: Boolean(this.cpu.data[portCConfig.PIN] & mask),
        voltage: this.analogVoltages.get(channel) ?? 0,
        faultState: this.stuckAnalogChannels.has(channel) ? 'STUCK' : 'NONE',
        adc: read ? read.value : null,
        sampleCycle: read ? read.completionCycle : null,
        diagnostic: this.blocked ? 'UNSUPPORTED_PERIPHERAL' : 'OK',
      };
    });
    return [...digital, ...analogue];
  }

  snapshot() {
    const digitalPins = Object.fromEntries(
      Array.from({ length: 14 }, (_, pin) => [`D${pin}`, this.pinLevel(pin)]),
    );
    return {
      cycle: this.cpu.cycles,
      pc: this.cpu.pc,
      instructions: this.instructions,
      paused: this.paused,
      speed: this.speed,
      led: this.pinLevel(13),
      digitalPins,
      trace: this.trace.slice(),
      serial: this.serial.slice(),
      i2c: this.i2c.map((entry) => ({ ...entry })),
      dht11: this.dht11.map((entry) => ({ ...entry, payload: [...entry.payload] })),
      dht22: this.dht22.map((entry) => ({ ...entry, payload: [...entry.payload] })),
      ds18b20: this.ds18b20.map((entry) => ({ ...entry,
        ...(entry.scratchpad ? { scratchpad: [...entry.scratchpad] } : {}) })),
      adcReads: this.adcReads.map((entry) => ({ ...entry })),
      unsupported: this.unsupported.slice(),
      faultEvents: this.faultEvents.map((entry) => ({ ...entry })),
      pins: this.pinSnapshot(),
      retentionDrops: { ...this.retentionDrops },
      ...(this.x46UsartConfiguration ? {
        usartConfiguration: this.x46UsartConfiguration.snapshot(),
      } : {}),
      ...(this.x34Observer ? { x34Precision: this.x34Observer.snapshot() } : {}),
      ...(this.x35Observer ? { x35CausalChain: this.x35Observer.snapshot() } : {}),
    };
  }
}
