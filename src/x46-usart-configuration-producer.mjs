// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  MODEL_RUNTIME_BINDING_SCHEMA,
  MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA,
  validateWorkerRuntimeIdentity,
} from './runtime-identity.mjs';
import { exactKeys } from './strict-json.mjs';

export const X46_USART_CONFIGURATION_SCHEMA = 'intent-mcu-usart-config@1';
export const X46_USART_CONFIGURATION_LIMIT = 256;

const PROFILE = 'board.atmega328p-16mhz-v1';
const CLOCK_HERTZ = 16_000_000;
const REGISTERS = Object.freeze(['UCSRA', 'UCSRB', 'UCSRC', 'UBRRL', 'UBRRH']);
const REGISTER_SET = new Set(REGISTERS);

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

function identityBinding(identity) {
  if (!identity || identity.schema !== MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA) {
    reject('X46_USART_CONFIG_IDENTITY_INVALID');
  }
  return {
    schema: MODEL_RUNTIME_BINDING_SCHEMA,
    projectGeneration: identity.projectGeneration,
    runtimeGeneration: identity.runtimeGeneration,
    artifactIdentity: identity.artifactIdentity,
    modelImplementationSha256: identity.modelImplementationSha256,
    modelExecutionContextSha256: identity.modelExecutionContextSha256,
  };
}

function acceptedIdentity(identity) {
  try {
    return validateWorkerRuntimeIdentity(
      identity, identityBinding(identity), identity.workerInstanceNonce,
    );
  } catch {
    reject('X46_USART_CONFIG_IDENTITY_INVALID');
  }
}

function decodeRegisters(registers) {
  if (!exactKeys(registers, REGISTERS)
      || REGISTERS.some((name) => !Number.isInteger(registers[name])
        || registers[name] < 0 || registers[name] > 255)) {
    reject('X46_USART_CONFIG_REGISTERS_INVALID');
  }
  const characterCode = (((registers.UCSRB >> 2) & 1) << 2)
    | ((registers.UCSRC >> 1) & 0x03);
  const dataBits = [5, 6, 7, 8, null, null, null, 9][characterCode];
  const parityCode = (registers.UCSRC >> 4) & 0x03;
  const parity = ['none', 'reserved', 'even', 'odd'][parityCode];
  const stopBits = registers.UCSRC & 0x08 ? 2 : 1;
  const modeCode = (registers.UCSRC >> 6) & 0x03;
  const mode = ['asynchronous', 'synchronous', 'reserved', 'master-spi'][modeCode];
  const doubleSpeed = Boolean(registers.UCSRA & 0x02);
  const divisor = ((registers.UBRRH << 8) | registers.UBRRL) + 1;
  const multiplier = doubleSpeed ? 8 : 16;
  const baud = Math.floor(CLOCK_HERTZ / (divisor * multiplier));
  const paritySymbols = ['even', 'odd'].includes(parity) ? 1 : 0;
  const frameCycles = dataBits === null || parity === 'reserved'
    ? null : divisor * multiplier * (1 + dataBits + paritySymbols + stopBits);
  return {
    dataBits,
    parity,
    stopBits,
    mode,
    doubleSpeed,
    baud,
    frameCycles,
    receiverEnabled: Boolean(registers.UCSRB & 0x10),
    transmitterEnabled: Boolean(registers.UCSRB & 0x08),
    supported: mode === 'asynchronous' && dataBits === 8 && parity === 'none'
      && stopBits === 1,
  };
}

function semantic(configuration) {
  return JSON.stringify(configuration);
}

function validContext(context) {
  if (!exactKeys(context, ['runtimeIdentity', 'resetEpoch'])
      || !Number.isSafeInteger(context.resetEpoch) || context.resetEpoch < 1) {
    reject('X46_USART_CONFIG_CONTEXT_INVALID');
  }
  return {
    runtimeIdentity: acceptedIdentity(context.runtimeIdentity),
    resetEpoch: context.resetEpoch,
  };
}

function validateRecord(record, context, expectedEpoch, previousCycle) {
  if (!exactKeys(record, [
    'epoch', 'cycle', 'resetEpoch', 'trigger', 'registers', 'configuration',
  ]) || record.epoch !== expectedEpoch || record.resetEpoch !== context.resetEpoch
      || !Number.isSafeInteger(record.cycle) || record.cycle < previousCycle
      || !exactKeys(record.trigger, ['register', 'value'])
      || !REGISTER_SET.has(record.trigger.register)
      || !Number.isInteger(record.trigger.value) || record.trigger.value < 0
      || record.trigger.value > 255) {
    reject('X46_USART_CONFIG_RECORD_INVALID');
  }
  const decoded = decodeRegisters(record.registers);
  if (!exactKeys(record.configuration, Object.keys(decoded))
      || semantic(record.configuration) !== semantic(decoded)
      || record.registers[record.trigger.register] !== record.trigger.value) {
    reject('X46_USART_CONFIG_RECORD_INVALID');
  }
  return semantic(decoded);
}

export function validateX46UsartConfigurationSource(source, expectedContext, {
  requireRecords = true,
} = {}) {
  const context = validContext(expectedContext);
  if (!exactKeys(source, [
    'schema', 'profile', 'channel', 'clockHertz', 'runtimeIdentity', 'resetEpoch',
    'records', 'retention',
  ]) || source.schema !== X46_USART_CONFIGURATION_SCHEMA || source.profile !== PROFILE
      || source.channel !== 'USART0' || source.clockHertz !== CLOCK_HERTZ
      || !exactKeys(source.retention, ['limit', 'retained', 'dropped', 'truncated'])
      || source.retention.limit !== X46_USART_CONFIGURATION_LIMIT
      || !Number.isSafeInteger(source.retention.retained)
      || !Number.isSafeInteger(source.retention.dropped)
      || source.retention.retained < 0 || source.retention.dropped < 0
      || typeof source.retention.truncated !== 'boolean'
      || !Array.isArray(source.records)
      || source.retention.retained !== source.records.length
      || source.records.length > source.retention.limit) {
    reject('X46_USART_CONFIG_SOURCE_INVALID');
  }
  const identity = acceptedIdentity(source.runtimeIdentity);
  if (JSON.stringify(identity) !== JSON.stringify(context.runtimeIdentity)
      || source.resetEpoch !== context.resetEpoch) {
    reject('X46_USART_CONFIG_SOURCE_STALE');
  }
  if (source.retention.dropped !== 0 || source.retention.truncated) {
    reject('X46_USART_CONFIG_SOURCE_INCOMPLETE');
  }
  if (requireRecords && source.records.length === 0) {
    reject('X46_USART_CONFIG_SOURCE_MISSING');
  }
  let previousCycle = -1;
  let previousSemantic = null;
  source.records.forEach((record, index) => {
    const currentSemantic = validateRecord(record, context, index + 1, previousCycle);
    if (currentSemantic === previousSemantic) reject('X46_USART_CONFIG_RECORD_CONFLICT');
    previousSemantic = currentSemantic;
    previousCycle = record.cycle;
  });
  return structuredClone(source);
}

export class X46UsartConfigurationProducer {
  constructor(runtimeIdentity, resetEpoch, limit = X46_USART_CONFIGURATION_LIMIT) {
    this.runtimeIdentity = acceptedIdentity(runtimeIdentity);
    if (!Number.isSafeInteger(resetEpoch) || resetEpoch < 1
        || limit !== X46_USART_CONFIGURATION_LIMIT) {
      reject('X46_USART_CONFIG_CONTEXT_INVALID');
    }
    this.resetEpoch = resetEpoch;
    this.records = [];
    this.dropped = 0;
    this.lastSemantic = null;
  }

  observe({ cycle, register, value, registers }) {
    if (!Number.isSafeInteger(cycle) || cycle < 0 || !REGISTER_SET.has(register)
        || !Number.isInteger(value) || value < 0 || value > 255) {
      reject('X46_USART_CONFIG_OBSERVATION_INVALID');
    }
    const configuration = decodeRegisters(registers);
    const nextSemantic = semantic(configuration);
    if (nextSemantic === this.lastSemantic) return false;
    this.lastSemantic = nextSemantic;
    this.records.push({
      epoch: this.records.length + this.dropped + 1,
      cycle,
      resetEpoch: this.resetEpoch,
      trigger: { register, value },
      registers: structuredClone(registers),
      configuration,
    });
    if (this.records.length > X46_USART_CONFIGURATION_LIMIT) {
      this.records.shift();
      this.dropped += 1;
    }
    return true;
  }

  snapshot() {
    return {
      schema: X46_USART_CONFIGURATION_SCHEMA,
      profile: PROFILE,
      channel: 'USART0',
      clockHertz: CLOCK_HERTZ,
      runtimeIdentity: structuredClone(this.runtimeIdentity),
      resetEpoch: this.resetEpoch,
      records: structuredClone(this.records),
      retention: {
        limit: X46_USART_CONFIGURATION_LIMIT,
        retained: this.records.length,
        dropped: this.dropped,
        truncated: this.dropped > 0,
      },
    };
  }
}
