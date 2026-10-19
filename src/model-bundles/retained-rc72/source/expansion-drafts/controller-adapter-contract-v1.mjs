// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const CONTROLLER_ADAPTER_SCHEMA = 'intent-mcu-controller-adapter@1';
export const CONTROLLER_COMPILER_SCHEMA = 'intent-mcu-controller-compiler@1';
export const EXECUTABLE_ARTIFACT_SCHEMA = 'intent-mcu-executable-artifact@1';
export const ADAPTER_EVENT_SCHEMA = 'intent-mcu-adapter-event@1';

export const ADAPTER_REQUIRED_METHODS = Object.freeze([
  'step', 'runInstructions', 'runUntilCycle', 'run', 'pause', 'reset', 'setSpeed',
  'setDigitalPin', 'setAnalogChannel', 'scheduleDigital', 'scheduleAnalog',
  'scheduleUartRx', 'pinLevel', 'pinSnapshot', 'snapshot',
]);

export const ADAPTER_ERROR_CODES = Object.freeze([
  'ADAPTER_ARTIFACT_INVALID',
  'ADAPTER_PROFILE_UNSUPPORTED',
  'ADAPTER_EVENT_INVALID',
  'ADAPTER_EVENT_PAST',
  'ADAPTER_CAPABILITY_UNSUPPORTED',
  'ADAPTER_EXECUTION_BLOCKED',
  'ADAPTER_SLICE_LIMIT',
  'ADAPTER_STATE_INVALID',
]);

const PIN = /^(?:D(?:[0-9]|1[0-3])|A[0-5])$/u;
const PROFILE_KEYS = Object.freeze([
  'schema', 'profile', 'status', 'implementation', 'executionBoundary', 'mcu',
  'artifactFormats', 'pins', 'capabilities', 'lifecycle', 'timing', 'events',
  'errors', 'missingExecutionDependencies',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function capability(id, status, pins, modes, rejectCode = null) {
  return { id, status, pins, modes, rejectCode };
}

const digitalPins = Array.from({ length: 14 }, (_, index) => `D${index}`);
const analoguePins = Array.from({ length: 6 }, (_, index) => `A${index}`);
const pwmPins = ['D3', 'D5', 'D6', 'D9', 'D10', 'D11'];

const avrProfile = {
  schema: CONTROLLER_ADAPTER_SCHEMA,
  profile: 'board.atmega328p-16mhz-v1',
  status: 'simulated',
  implementation: 'Atmega328PAdapter',
  executionBoundary: 'browser-worker',
  mcu: {
    architecture: 'avr8', variant: 'ATmega328P', frequencyHz: 16_000_000,
    flashBytes: 32 * 1024, sramBytes: 2 * 1024,
  },
  artifactFormats: [
    { role: 'executable', format: 'intel-hex', status: 'supported' },
    { role: 'debug', format: 'elf', status: 'identity-only' },
  ],
  pins: {
    digital: digitalPins,
    analogue: analoguePins,
    pwm: pwmPins,
    uart0: { rx: 'D0', tx: 'D1' },
    externalInterrupts: { INT0: 'D2', INT1: 'D3' },
  },
  capabilities: [
    capability('gpio', 'simulated', digitalPins, ['input', 'input-pullup', 'output']),
    capability('adc', 'simulated', analoguePins, ['single-conversion-0-5v']),
    capability('pwm', 'simulated', pwmPins, ['implemented-fast-pwm-modes']),
    capability('uart0', 'simulated', ['D0', 'D1'], ['8N1-9600-19200-38400-57600-115200']),
    capability('timers', 'partial', [], ['timer0', 'timer1', 'timer2']),
    capability('interrupts', 'partial', ['D2', 'D3'], ['INT0', 'INT1', 'implemented-pin-change-masks']),
    capability('spi', 'unsupported', ['D10', 'D11', 'D12', 'D13'], [], 'ADAPTER_CAPABILITY_UNSUPPORTED'),
    capability('i2c', 'unsupported', ['A4', 'A5'], [], 'ADAPTER_CAPABILITY_UNSUPPORTED'),
    capability('eeprom', 'unsupported', [], [], 'ADAPTER_CAPABILITY_UNSUPPORTED'),
    capability('watchdog', 'unsupported', [], [], 'ADAPTER_CAPABILITY_UNSUPPORTED'),
  ],
  lifecycle: {
    initial: 'paused',
    states: ['paused', 'running', 'blocked'],
    reset: 'cycle-instructions-events-and-peripherals-clear; selected speed persists',
    stop: 'unsupported activation throws before a synthetic response',
    requiredMethods: ADAPTER_REQUIRED_METHODS,
  },
  timing: {
    unit: 'cpu-cycle', frequencyHz: 16_000_000, deterministic: true,
    eventOrder: 'targetCycle then insertion sequence',
    slicePolicy: 'bounded instruction count or explicit target cycle',
  },
  events: [
    { type: 'digital', target: 'pin', value: 'boolean' },
    { type: 'analogue', target: 'channel', value: 'volts-0-5' },
    { type: 'uart-rx', target: 'uart0', value: 'byte-0-255' },
  ],
  errors: ADAPTER_ERROR_CODES,
  missingExecutionDependencies: [],
};

function unsupportedProfile(profile, architecture, variant, frequencyHz, artifactFormats, missing) {
  return {
    schema: CONTROLLER_ADAPTER_SCHEMA,
    profile,
    status: 'unsupported',
    implementation: null,
    executionBoundary: null,
    mcu: { architecture, variant, frequencyHz, flashBytes: null, sramBytes: null },
    artifactFormats: artifactFormats.map((format) => ({ role: 'candidate', format, status: 'unsupported' })),
    pins: { digital: [], analogue: [], pwm: [], uart0: null, externalInterrupts: {} },
    capabilities: [],
    lifecycle: null,
    timing: null,
    events: [],
    errors: ['ADAPTER_PROFILE_UNSUPPORTED'],
    missingExecutionDependencies: missing,
  };
}

export const CONTROLLER_ADAPTER_PROFILES = deepFreeze([
  avrProfile,
  unsupportedProfile(
    'board.esp32-c3-devmodule-v1', 'riscv32', 'ESP32-C3', 160_000_000,
    ['elf', 'flash-image'],
    ['Approved Arduino-ESP32 3.3.12 compiler image (installed 3.3.10 is a private probe only)', 'Espressif QEMU esp-develop-9.2.2-20260417 runtime image', 'GPIO/UART0/timer-PWM event adapter', 'pin and unsupported-peripheral conformance'],
  ),
  unsupportedProfile(
    'board.rp2040-pico-v1', 'armv6m-dualcore', 'RP2040', 125_000_000,
    ['uf2', 'elf'],
    ['Arduino-Pico 6.3.0 compiler image', 'rp2040js 1.4.0 worker adapter', 'GPIO/UART0/timer-PWM/ADC0-2 event adapter', 'PIO/DMA/USB/multicore rejection conformance'],
  ),
  unsupportedProfile(
    'board.stm32f429zi-nucleo144-v1', 'armv7em', 'STM32F429ZI', 180_000_000,
    ['elf'],
    ['STM32duino 3.0.0 compiler image', 'Renode 1.17.0 networkless runtime image', 'NUCLEO-F429ZI platform/event adapter', 'GPIO/USART/timer-PWM and unsupported-peripheral conformance'],
  ),
]);

function compilerProfile({
  profile, status, fqbn, coreId, requiredVersion, observedVersion,
  artifacts, reproducibility, runtimeLoadable,
}) {
  return {
    schema: CONTROLLER_COMPILER_SCHEMA,
    profile,
    status,
    fqbn,
    core: {
      id: coreId,
      requiredVersion,
      observedVersion,
      versionMatch: observedVersion === requiredVersion,
    },
    artifacts,
    reproducibility,
    runtimeLoadable,
    rejectCode: runtimeLoadable ? null : 'ADAPTER_EXECUTION_BLOCKED',
  };
}

export const CONTROLLER_COMPILER_PROFILES = deepFreeze([
  compilerProfile({
    profile: 'board.atmega328p-16mhz-v1', status: 'supported',
    fqbn: 'arduino:avr:uno', coreId: 'arduino:avr',
    requiredVersion: '1.8.8', observedVersion: '1.8.8',
    artifacts: ['intel-hex', 'elf'], reproducibility: 'accepted', runtimeLoadable: true,
  }),
  compilerProfile({
    profile: 'board.esp32-c3-devmodule-v1', status: 'pre-adoption-probe',
    fqbn: 'esp32:esp32:esp32c3', coreId: 'esp32:esp32',
    requiredVersion: '3.3.12', observedVersion: '3.3.10',
    artifacts: ['flash-image', 'elf', 'merged-flash-image'],
    reproducibility: 'private-probe', runtimeLoadable: false,
  }),
  compilerProfile({
    profile: 'board.rp2040-pico-v1', status: 'unavailable',
    fqbn: 'rp2040:rp2040:rpipico', coreId: 'rp2040:rp2040',
    requiredVersion: '6.3.0', observedVersion: null,
    artifacts: ['uf2', 'elf'], reproducibility: 'unverified', runtimeLoadable: false,
  }),
  compilerProfile({
    profile: 'board.stm32f429zi-nucleo144-v1', status: 'unavailable',
    fqbn: 'STMicroelectronics:stm32:Nucleo_144:pnum=NUCLEO_F429ZI',
    coreId: 'STMicroelectronics:stm32', requiredVersion: '3.0.0', observedVersion: null,
    artifacts: ['elf'], reproducibility: 'unverified', runtimeLoadable: false,
  }),
]);

export const CONTROLLER_ADAPTER_FIXTURES = deepFreeze([
  { id: 'avr-artifact-identity', profile: avrProfile.profile, kind: 'artifact', expected: 'ACCEPT' },
  { id: 'avr-lifecycle-reset', profile: avrProfile.profile, kind: 'lifecycle', expected: 'ACCEPT' },
  { id: 'avr-digital-event', profile: avrProfile.profile, kind: 'event', expected: 'ACCEPT' },
  { id: 'avr-analogue-event', profile: avrProfile.profile, kind: 'event', expected: 'ACCEPT' },
  { id: 'avr-uart-event', profile: avrProfile.profile, kind: 'event', expected: 'ACCEPT' },
  { id: 'avr-spi-activation', profile: avrProfile.profile, kind: 'unsupported-capability', expected: 'ADAPTER_CAPABILITY_UNSUPPORTED' },
  { id: 'esp32-c3-compiler-probe', profile: 'board.esp32-c3-devmodule-v1', kind: 'compiler-probe', expected: 'ACCEPT' },
  { id: 'esp32-c3-init', profile: 'board.esp32-c3-devmodule-v1', kind: 'profile-init', expected: 'ADAPTER_PROFILE_UNSUPPORTED' },
  { id: 'rp2040-pico-init', profile: 'board.rp2040-pico-v1', kind: 'profile-init', expected: 'ADAPTER_PROFILE_UNSUPPORTED' },
  { id: 'stm32f429zi-init', profile: 'board.stm32f429zi-nucleo144-v1', kind: 'profile-init', expected: 'ADAPTER_PROFILE_UNSUPPORTED' },
]);

function uniqueStrings(value, allowEmpty = false) {
  return Array.isArray(value) && (allowEmpty || value.length > 0)
    && value.every((item) => typeof item === 'string' && item.trim())
    && new Set(value).size === value.length;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function validateArtifactFormats(profile) {
  return Array.isArray(profile.artifactFormats) && profile.artifactFormats.length > 0
    && profile.artifactFormats.every((item) => exactKeys(item, ['role', 'format', 'status'])
      && ['executable', 'debug', 'candidate'].includes(item.role)
      && ['intel-hex', 'elf', 'uf2', 'flash-image'].includes(item.format)
      && ['supported', 'identity-only', 'unsupported'].includes(item.status));
}

export function validateControllerAdapterProfile(profile) {
  try {
    if (!exactKeys(profile, PROFILE_KEYS) || profile.schema !== CONTROLLER_ADAPTER_SCHEMA
      || !/^board\.[a-z0-9-]+-v[1-9][0-9]*$/u.test(profile.profile)
      || !['simulated', 'unsupported'].includes(profile.status)
      || !profile.mcu || typeof profile.mcu !== 'object'
      || typeof profile.mcu.architecture !== 'string' || !profile.mcu.architecture
      || typeof profile.mcu.variant !== 'string' || !profile.mcu.variant
      || !Number.isInteger(profile.mcu.frequencyHz) || profile.mcu.frequencyHz <= 0
      || !validateArtifactFormats(profile) || !uniqueStrings(profile.errors)) return false;
    if (profile.status === 'unsupported') {
      return profile.implementation === null && profile.executionBoundary === null
        && profile.lifecycle === null && profile.timing === null
        && Array.isArray(profile.capabilities) && profile.capabilities.length === 0
        && Array.isArray(profile.events) && profile.events.length === 0
        && uniqueStrings(profile.missingExecutionDependencies)
        && profile.artifactFormats.every((item) => item.status === 'unsupported')
        && profile.errors.length === 1 && profile.errors[0] === 'ADAPTER_PROFILE_UNSUPPORTED';
    }
    if (profile.implementation !== 'Atmega328PAdapter' || profile.executionBoundary !== 'browser-worker'
      || !Number.isInteger(profile.mcu.flashBytes) || !Number.isInteger(profile.mcu.sramBytes)
      || !profile.pins || !uniqueStrings(profile.pins.digital) || !uniqueStrings(profile.pins.analogue)
      || !uniqueStrings(profile.pins.pwm) || !profile.lifecycle || !profile.timing
      || profile.lifecycle.initial !== 'paused'
      || JSON.stringify(profile.lifecycle.requiredMethods) !== JSON.stringify(ADAPTER_REQUIRED_METHODS)
      || profile.timing.unit !== 'cpu-cycle' || profile.timing.deterministic !== true
      || !Array.isArray(profile.capabilities) || profile.capabilities.length < 1
      || !Array.isArray(profile.events) || profile.events.length !== 3
      || !Array.isArray(profile.missingExecutionDependencies) || profile.missingExecutionDependencies.length !== 0) return false;
    const capabilityIds = new Set();
    for (const item of profile.capabilities) {
      if (!exactKeys(item, ['id', 'status', 'pins', 'modes', 'rejectCode'])
        || typeof item.id !== 'string' || capabilityIds.has(item.id)
        || !['simulated', 'partial', 'unsupported'].includes(item.status)
        || !uniqueStrings(item.pins, true) || !uniqueStrings(item.modes, true)
        || (item.status === 'unsupported' ? item.rejectCode !== 'ADAPTER_CAPABILITY_UNSUPPORTED' : item.rejectCode !== null)) return false;
      capabilityIds.add(item.id);
    }
    return profile.pins.digital.every((pin) => PIN.test(pin))
      && profile.pins.analogue.every((pin) => PIN.test(pin))
      && profile.pins.pwm.every((pin) => profile.pins.digital.includes(pin));
  } catch {
    return false;
  }
}

export function validateControllerAdapterProfileSet(profiles = CONTROLLER_ADAPTER_PROFILES) {
  return Array.isArray(profiles) && profiles.length === 4
    && profiles.every(validateControllerAdapterProfile)
    && new Set(profiles.map((profile) => profile.profile)).size === profiles.length
    && profiles.filter((profile) => profile.status === 'simulated').length === 1;
}

export function validateControllerCompilerProfile(value) {
  if (!exactKeys(value, [
    'schema', 'profile', 'status', 'fqbn', 'core', 'artifacts', 'reproducibility',
    'runtimeLoadable', 'rejectCode',
  ]) || value.schema !== CONTROLLER_COMPILER_SCHEMA
    || !CONTROLLER_ADAPTER_PROFILES.some((profile) => profile.profile === value.profile)
    || !['supported', 'pre-adoption-probe', 'unavailable'].includes(value.status)
    || typeof value.fqbn !== 'string' || !value.fqbn
    || !exactKeys(value.core, ['id', 'requiredVersion', 'observedVersion', 'versionMatch'])
    || typeof value.core.id !== 'string' || !value.core.id
    || typeof value.core.requiredVersion !== 'string' || !value.core.requiredVersion
    || !uniqueStrings(value.artifacts)
    || !['accepted', 'private-probe', 'unverified'].includes(value.reproducibility)
    || typeof value.runtimeLoadable !== 'boolean') return false;
  const adapter = CONTROLLER_ADAPTER_PROFILES.find((profile) => profile.profile === value.profile);
  if (value.status === 'supported') {
    return adapter.status === 'simulated' && value.core.observedVersion === value.core.requiredVersion
      && value.core.versionMatch === true && value.reproducibility === 'accepted'
      && value.runtimeLoadable === true && value.rejectCode === null;
  }
  if (value.status === 'pre-adoption-probe') {
    return adapter.status === 'unsupported' && typeof value.core.observedVersion === 'string'
      && value.core.observedVersion && value.core.observedVersion !== value.core.requiredVersion
      && value.core.versionMatch === false && value.reproducibility === 'private-probe'
      && value.runtimeLoadable === false && value.rejectCode === 'ADAPTER_EXECUTION_BLOCKED';
  }
  return adapter.status === 'unsupported' && value.core.observedVersion === null
    && value.core.versionMatch === false && value.reproducibility === 'unverified'
    && value.runtimeLoadable === false && value.rejectCode === 'ADAPTER_EXECUTION_BLOCKED';
}

export function validateControllerCompilerProfileSet(profiles = CONTROLLER_COMPILER_PROFILES) {
  return Array.isArray(profiles) && profiles.length === CONTROLLER_ADAPTER_PROFILES.length
    && profiles.every(validateControllerCompilerProfile)
    && new Set(profiles.map((profile) => profile.profile)).size === profiles.length
    && profiles.every((profile) => CONTROLLER_ADAPTER_PROFILES.some((adapter) => adapter.profile === profile.profile))
    && profiles.filter((profile) => profile.status === 'supported').length === 1
    && profiles.filter((profile) => profile.status === 'pre-adoption-probe').length === 1;
}


export function validateAdapterEvent(value, profileId = avrProfile.profile) {
  const profile = CONTROLLER_ADAPTER_PROFILES.find((item) => item.profile === profileId);
  if (profile?.status !== 'simulated' || !value || typeof value !== 'object' || Array.isArray(value)
    || value.schema !== ADAPTER_EVENT_SCHEMA || !Number.isSafeInteger(value.targetCycle) || value.targetCycle < 0) return false;
  if (value.type === 'digital') return Object.keys(value).length === 5
    && profile.pins.digital.includes(value.pin) && typeof value.value === 'boolean';
  if (value.type === 'analogue') return Object.keys(value).length === 5
    && profile.pins.analogue.includes(value.pin) && Number.isFinite(value.value)
    && value.value >= 0 && value.value <= 5;
  if (value.type === 'uart-rx') return Object.keys(value).length === 4
    && Number.isInteger(value.value) && value.value >= 0 && value.value <= 255;
  return false;
}

export function validateAdapterFixtureSet(fixtures = CONTROLLER_ADAPTER_FIXTURES) {
  if (!Array.isArray(fixtures) || fixtures.length !== 10) return false;
  const profileIds = new Set(CONTROLLER_ADAPTER_PROFILES.map((item) => item.profile));
  return new Set(fixtures.map((item) => item.id)).size === fixtures.length
    && fixtures.every((item) => /^[a-z][a-z0-9-]+$/u.test(item.id)
      && profileIds.has(item.profile) && typeof item.kind === 'string'
      && (item.expected === 'ACCEPT' || ADAPTER_ERROR_CODES.includes(item.expected)));
}
