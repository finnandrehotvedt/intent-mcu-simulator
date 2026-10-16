export const RUNTIME_BRIDGE_SCHEMA = 'intent-mcu-runtime-bridge@1';
export const RUNTIME_DESCRIPTOR_SCHEMA = 'intent-mcu-runtime-descriptor@1';
export const RUNTIME_COMMAND_SCHEMA = 'intent-mcu-runtime-command@1';
export const RUNTIME_EVENT_SCHEMA = 'intent-mcu-runtime-event@1';

export const RUNTIME_BRIDGE_ERROR_CODES = Object.freeze([
  'RUNTIME_COMMAND_INVALID',
  'RUNTIME_EVENT_INVALID',
  'RUNTIME_EVENT_ORDER_INVALID',
  'RUNTIME_EVENT_LIMIT',
  'RUNTIME_HANDSHAKE_TIMEOUT',
  'RUNTIME_LINE_LIMIT',
  'RUNTIME_STDERR_LIMIT',
  'RUNTIME_PROCESS_EXITED',
  'RUNTIME_CAPABILITY_UNSUPPORTED',
  'RUNTIME_SLICE_LIMIT',
  'RUNTIME_ARTIFACT_INVALID',
  'RUNTIME_ENGINE_IDENTITY_MISMATCH',
  'RUNTIME_ENGINE_UNAVAILABLE',
  'RUNTIME_CONFORMANCE_INCOMPLETE',
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const PROFILE = /^board\.[a-z0-9-]+-v[1-9][0-9]*$/u;
const PIN = /^[A-Z][A-Z0-9_.-]{0,31}$/u;
const ENGINE_ID = /^[a-z][a-z0-9.-]{1,63}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/u;
const PORT = /^(?:UART|USART)[0-9]$/u;
const CAPABILITIES = Object.freeze(['gpio', 'uart', 'timer-pwm']);
const DESCRIPTOR_CAPABILITIES = Object.freeze([...CAPABILITIES, 'adc']);
const MAX_CYCLE = 9_007_199_254_740_000;
const MAX_ADVANCE_CYCLES = 10_000_000;
const MAX_EVENTS = 100_000;

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function uniqueStrings(value, expected = null) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim())
    && new Set(value).size === value.length
    && (expected === null || JSON.stringify([...value].sort()) === JSON.stringify([...expected].sort()));
}

function requirement({
  profile, architecture, engineId, engineVersion, boundary, capabilities,
  currentStatus = 'missing-runtime',
}) {
  return {
    schema: RUNTIME_BRIDGE_SCHEMA,
    profile,
    architecture,
    engine: { id: engineId, version: engineVersion },
    boundary,
    requiredCapabilities: capabilities,
    eventProtocol: RUNTIME_EVENT_SCHEMA,
    commandProtocol: RUNTIME_COMMAND_SCHEMA,
    deterministicReplayRequired: true,
    currentStatus,
  };
}

export const BASELINE_RUNTIME_REQUIREMENTS = deepFreeze([
  requirement({
    profile: 'board.atmega328p-16mhz-v1', architecture: 'avr8',
    engineId: 'avr8js', engineVersion: '0.21.1', boundary: 'browser-worker',
    capabilities: ['gpio', 'uart', 'timer-pwm'], currentStatus: 'supported-baseline',
  }),
]);

export const CONTROLLER_RUNTIME_REQUIREMENTS = deepFreeze([
  requirement({
    profile: 'board.esp32-c3-devmodule-v1', architecture: 'riscv32',
    engineId: 'espressif-qemu', engineVersion: 'esp-develop-9.2.2-20260417',
    boundary: 'networkless-isolated-process', capabilities: ['gpio', 'uart', 'timer-pwm'],
  }),
  requirement({
    profile: 'board.rp2040-pico-v1', architecture: 'armv6m',
    engineId: 'rp2040js', engineVersion: '1.4.0',
    boundary: 'browser-worker', capabilities: ['gpio', 'uart', 'timer-pwm'],
    currentStatus: 'private-conformance-partial',
  }),
  requirement({
    profile: 'board.stm32f429zi-nucleo144-v1', architecture: 'armv7em',
    engineId: 'renode', engineVersion: '1.17.0',
    boundary: 'networkless-isolated-process', capabilities: ['gpio', 'uart', 'timer-pwm'],
  }),
]);

export function runtimeRequirement(profile) {
  return CONTROLLER_RUNTIME_REQUIREMENTS.find((item) => item.profile === profile) ?? null;
}

export function baselineRuntimeRequirement(profile) {
  return BASELINE_RUNTIME_REQUIREMENTS.find((item) => item.profile === profile) ?? null;
}

export function runtimeDescriptorRequirement(profile) {
  return baselineRuntimeRequirement(profile) ?? runtimeRequirement(profile);
}

export function validateRuntimeRequirement(value) {
  return Boolean(exactKeys(value, [
    'schema', 'profile', 'architecture', 'engine', 'boundary', 'requiredCapabilities',
    'eventProtocol', 'commandProtocol', 'deterministicReplayRequired', 'currentStatus',
  ]) && value.schema === RUNTIME_BRIDGE_SCHEMA && PROFILE.test(value.profile)
    && typeof value.architecture === 'string' && value.architecture
    && exactKeys(value.engine, ['id', 'version']) && ENGINE_ID.test(value.engine.id)
    && VERSION.test(value.engine.version)
    && ['networkless-isolated-process', 'browser-worker'].includes(value.boundary)
    && uniqueStrings(value.requiredCapabilities, CAPABILITIES)
    && value.eventProtocol === RUNTIME_EVENT_SCHEMA
    && value.commandProtocol === RUNTIME_COMMAND_SCHEMA
    && value.deterministicReplayRequired === true
    && ['missing-runtime', 'private-conformance-partial'].includes(value.currentStatus));
}

export function validateRuntimeRequirementSet(values = CONTROLLER_RUNTIME_REQUIREMENTS) {
  return Array.isArray(values) && values.length === 3
    && values.every(validateRuntimeRequirement)
    && new Set(values.map((item) => item.profile)).size === values.length
    && values.filter((item) => item.currentStatus === 'missing-runtime').length === 2
    && values.filter((item) => item.currentStatus === 'private-conformance-partial').length === 1;
}

export function validateBaselineRuntimeRequirementSet(values = BASELINE_RUNTIME_REQUIREMENTS) {
  return Array.isArray(values) && values.length === 1
    && values.every((value) => validateRuntimeRequirement({ ...value, currentStatus: 'missing-runtime' }))
    && values.every((value) => value.currentStatus === 'supported-baseline');
}

export function validateRuntimeDescriptor(value) {
  if (!exactKeys(value, [
    'schema', 'profile', 'role', 'engine', 'artifactSha256', 'capabilities',
    'sandbox', 'deterministic', 'conformance',
  ]) || value.schema !== RUNTIME_DESCRIPTOR_SCHEMA || !PROFILE.test(value.profile)
    || !['controller-runtime', 'transport-test-fixture'].includes(value.role)
    || !exactKeys(value.engine, ['id', 'version', 'sha256'])
    || !ENGINE_ID.test(value.engine.id) || !VERSION.test(value.engine.version)
    || !SHA256.test(value.engine.sha256) || !SHA256.test(value.artifactSha256)
    || !uniqueStrings(value.capabilities)
    || !value.capabilities.every((item) => DESCRIPTOR_CAPABILITIES.includes(item))
    || !exactKeys(value.sandbox, [
      'network', 'readOnlyRoot', 'capDropAll', 'noNewPrivileges', 'watchdog',
      'ephemeralWorkspace',
    ]) || value.sandbox.network !== 'none'
    || !['read-only', 'not-applicable-browser-worker'].includes(value.sandbox.readOnlyRoot)
    || value.sandbox.capDropAll !== true || value.sandbox.noNewPrivileges !== true
    || value.sandbox.watchdog !== true || value.sandbox.ephemeralWorkspace !== true
    || value.deterministic !== true
    || !exactKeys(value.conformance, ['gpio', 'uart', 'timerPwm', 'resetReplay', 'unsupportedFailClosed'])
    || !Object.values(value.conformance).every((item) => typeof item === 'boolean')) return false;

  if (value.role === 'transport-test-fixture') {
    return value.engine.id === 'intent-mcu-transport-fixture'
      && value.engine.version === '1.0.0'
      && Object.values(value.conformance).every((item) => item === false);
  }
  return runtimeDescriptorRequirement(value.profile) !== null;
}

export function runtimePromotionEligibility(descriptor) {
  if (!validateRuntimeDescriptor(descriptor) || descriptor.role !== 'controller-runtime') {
    return { eligible: false, code: 'RUNTIME_CONFORMANCE_INCOMPLETE' };
  }
  const required = runtimeRequirement(descriptor.profile);
  if (!required || descriptor.engine.id !== required.engine.id
    || descriptor.engine.version !== required.engine.version) {
    return { eligible: false, code: 'RUNTIME_ENGINE_IDENTITY_MISMATCH' };
  }
  if (!uniqueStrings(descriptor.capabilities, required.requiredCapabilities)
    || Object.values(descriptor.conformance).some((item) => item !== true)) {
    return { eligible: false, code: 'RUNTIME_CONFORMANCE_INCOMPLETE' };
  }
  return { eligible: true, code: null };
}

export function runtimeExecutionEligibility(descriptor) {
  const baseline = baselineRuntimeRequirement(descriptor?.profile);
  if (!baseline) return runtimePromotionEligibility(descriptor);
  if (!validateRuntimeDescriptor(descriptor) || descriptor.role !== 'controller-runtime'
    || descriptor.engine.id !== baseline.engine.id
    || descriptor.engine.version !== baseline.engine.version) {
    return { eligible: false, code: 'RUNTIME_ENGINE_IDENTITY_MISMATCH' };
  }
  if (!uniqueStrings(descriptor.capabilities, baseline.requiredCapabilities)
    || Object.values(descriptor.conformance).some((item) => item !== true)) {
    return { eligible: false, code: 'RUNTIME_CONFORMANCE_INCOMPLETE' };
  }
  return { eligible: true, code: null };
}

export function createRuntimeCommand(requestId, type, fields = {}) {
  const value = { schema: RUNTIME_COMMAND_SCHEMA, requestId, type, ...fields };
  if (!validateRuntimeCommand(value)) throw new Error('RUNTIME_COMMAND_INVALID');
  return deepFreeze(value);
}

export function validateRuntimeCommand(value) {
  if (!value || value.schema !== RUNTIME_COMMAND_SCHEMA
    || !Number.isSafeInteger(value.requestId) || value.requestId < 1) return false;
  if (['reset', 'pause', 'stop'].includes(value.type)) {
    return exactKeys(value, ['schema', 'requestId', 'type']);
  }
  if (value.type === 'advance') {
    return exactKeys(value, ['schema', 'requestId', 'type', 'budgetCycles'])
      && Number.isSafeInteger(value.budgetCycles) && value.budgetCycles >= 1
      && value.budgetCycles <= MAX_ADVANCE_CYCLES;
  }
  if (value.type === 'digital-input') {
    return exactKeys(value, ['schema', 'requestId', 'type', 'pin', 'level', 'targetCycle'])
      && PIN.test(value.pin) && typeof value.level === 'boolean'
      && Number.isSafeInteger(value.targetCycle) && value.targetCycle >= 0
      && value.targetCycle <= MAX_CYCLE;
  }
  if (value.type === 'analog-input') {
    return exactKeys(value, ['schema', 'requestId', 'type', 'pin', 'rawCode', 'targetCycle'])
      && /^GPIO2[6-9]$/u.test(value.pin)
      && Number.isInteger(value.rawCode) && value.rawCode >= 0 && value.rawCode <= 4095
      && Number.isSafeInteger(value.targetCycle) && value.targetCycle >= 0
      && value.targetCycle <= MAX_CYCLE;
  }
  if (value.type === 'uart-rx') {
    return exactKeys(value, ['schema', 'requestId', 'type', 'port', 'value', 'targetCycle'])
      && PORT.test(value.port) && Number.isInteger(value.value) && value.value >= 0
      && value.value <= 255 && Number.isSafeInteger(value.targetCycle)
      && value.targetCycle >= 0 && value.targetCycle <= MAX_CYCLE;
  }
  return false;
}

function validEventBase(value) {
  return value && value.schema === RUNTIME_EVENT_SCHEMA
    && Number.isSafeInteger(value.sequence) && value.sequence >= 1
    && Number.isSafeInteger(value.epoch) && value.epoch >= 0
    && Number.isSafeInteger(value.cycle) && value.cycle >= 0 && value.cycle <= MAX_CYCLE;
}

export function validateRuntimeEvent(value) {
  if (!validEventBase(value)) return false;
  const base = ['schema', 'sequence', 'epoch', 'cycle', 'type'];
  if (value.type === 'ready') {
    return exactKeys(value, [...base, 'descriptor']) && value.sequence === 1
      && value.epoch === 0 && value.cycle === 0 && validateRuntimeDescriptor(value.descriptor);
  }
  if (value.type === 'progress') {
    return exactKeys(value, [...base, 'instructions'])
      && Number.isSafeInteger(value.instructions) && value.instructions >= 0;
  }
  if (value.type === 'gpio') {
    return exactKeys(value, [...base, 'pin', 'level', 'mode']) && PIN.test(value.pin)
      && typeof value.level === 'boolean' && ['input', 'input-pullup', 'output'].includes(value.mode);
  }
  if (value.type === 'uart-tx' || value.type === 'uart-rx-applied') {
    return exactKeys(value, [...base, 'port', 'value']) && PORT.test(value.port)
      && Number.isInteger(value.value) && value.value >= 0 && value.value <= 255;
  }
  if (value.type === 'digital-input-applied') {
    return exactKeys(value, [...base, 'pin', 'level']) && PIN.test(value.pin)
      && typeof value.level === 'boolean';
  }
  if (value.type === 'analog-input-applied') {
    return exactKeys(value, [...base, 'pin', 'channel', 'rawCode'])
      && /^GPIO2[6-9]$/u.test(value.pin)
      && Number.isInteger(value.channel) && value.channel >= 0 && value.channel <= 3
      && value.channel === Number(value.pin.slice(4)) - 26
      && Number.isInteger(value.rawCode) && value.rawCode >= 0 && value.rawCode <= 4095;
  }
  if (value.type === 'adc') {
    return exactKeys(value, [
      ...base, 'pin', 'channel', 'rawCode', 'resolutionBits', 'sampleTimeMicros',
      'virtualNanos',
    ]) && /^GPIO2[6-9]$/u.test(value.pin)
      && Number.isInteger(value.channel) && value.channel >= 0 && value.channel <= 3
      && value.channel === Number(value.pin.slice(4)) - 26
      && Number.isInteger(value.rawCode) && value.rawCode >= 0 && value.rawCode <= 4095
      && value.resolutionBits === 12 && value.sampleTimeMicros === 2
      && Number.isSafeInteger(value.virtualNanos) && value.virtualNanos >= 0;
  }
  if (value.type === 'pwm') {
    return exactKeys(value, [
      ...base, 'pin', 'dutyCycle', 'frequencyHz', 'periodNanos', 'virtualNanos',
    ]) && PIN.test(value.pin)
      && Number.isFinite(value.dutyCycle) && value.dutyCycle >= 0 && value.dutyCycle <= 1
      && Number.isFinite(value.frequencyHz) && value.frequencyHz > 0 && value.frequencyHz <= 10_000_000
      && Number.isFinite(value.periodNanos) && value.periodNanos > 0
      && Number.isSafeInteger(value.virtualNanos) && value.virtualNanos >= 0;
  }
  if (value.type === 'reset') {
    return exactKeys(value, [...base, 'reason']) && value.cycle === 0 && value.reason === 'command';
  }
  if (value.type === 'paused') return exactKeys(value, base);
  if (value.type === 'stopped') {
    return exactKeys(value, [...base, 'reason']) && ['command', 'watchdog', 'process-exit'].includes(value.reason);
  }
  if (value.type === 'error') {
    return exactKeys(value, [...base, 'code', 'message'])
      && RUNTIME_BRIDGE_ERROR_CODES.includes(value.code)
      && typeof value.message === 'string' && value.message.length >= 1 && value.message.length <= 240;
  }
  return false;
}

export class RuntimeEventLedger {
  constructor({ profile, maxEvents = MAX_EVENTS } = {}) {
    if (!runtimeDescriptorRequirement(profile)
      || !Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > MAX_EVENTS) {
      throw new Error('RUNTIME_EVENT_INVALID');
    }
    this.profile = profile;
    this.maxEvents = maxEvents;
    this.events = [];
    this.descriptor = null;
    this.sequence = 0;
    this.epoch = 0;
    this.cycle = 0;
  }

  ingest(value) {
    if (!validateRuntimeEvent(value)) throw new Error('RUNTIME_EVENT_INVALID');
    if (this.events.length >= this.maxEvents) throw new Error('RUNTIME_EVENT_LIMIT');
    if (value.sequence !== this.sequence + 1) throw new Error('RUNTIME_EVENT_ORDER_INVALID');
    if (this.sequence === 0) {
      if (value.type !== 'ready' || value.descriptor.profile !== this.profile) {
        throw new Error('RUNTIME_EVENT_ORDER_INVALID');
      }
      this.descriptor = structuredClone(value.descriptor);
    } else if (value.type === 'ready') {
      throw new Error('RUNTIME_EVENT_ORDER_INVALID');
    }
    if (value.epoch === this.epoch) {
      if (value.cycle < this.cycle || value.type === 'reset') throw new Error('RUNTIME_EVENT_ORDER_INVALID');
    } else if (value.epoch === this.epoch + 1) {
      if (value.type !== 'reset' || value.cycle !== 0) throw new Error('RUNTIME_EVENT_ORDER_INVALID');
    } else {
      throw new Error('RUNTIME_EVENT_ORDER_INVALID');
    }
    this.sequence = value.sequence;
    this.epoch = value.epoch;
    this.cycle = value.cycle;
    this.events.push(structuredClone(value));
    return structuredClone(value);
  }

  snapshot() {
    return deepFreeze({
      profile: this.profile,
      descriptor: structuredClone(this.descriptor),
      support: runtimeExecutionEligibility(this.descriptor),
      sequence: this.sequence,
      epoch: this.epoch,
      cycle: this.cycle,
      events: structuredClone(this.events),
    });
  }
}
