// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const THERMOSTAT_EXPERIMENT_ID = 'avr-thermostat-boundary-v1';
export const THERMOSTAT_REQUIREMENTS_SCHEMA = 'intent-mcu-requirement-set@1';
export const THERMOSTAT_SCENARIOS_SCHEMA = 'intent-mcu-scenario-set@1';
export const THERMOSTAT_OBSERVATION_SCHEMA = 'intent-mcu-observation-contract@1';
export const THERMOSTAT_TIME_SCHEMA = 'intent-mcu-virtual-time-contract@1';

const CPU_CYCLES_PER_MILLISECOND = 16_000;
const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const THERMOSTAT_REQUIREMENTS = deepFreeze({
  schema: THERMOSTAT_REQUIREMENTS_SCHEMA,
  experimentId: THERMOSTAT_EXPERIMENT_ID,
  controller: {
    profile: 'board.atmega328p-16mhz-v1',
    clockHertz: 16_000_000,
    compiler: 'Arduino AVR core 1.8.8 / avr-gcc 7.3.0-atmel3.6.1-arduino7',
    runtime: 'project-owned tested ATmega328P browser-worker subset',
  },
  parts: {
    sensor: {
      componentId: 'temperature-sensor-1',
      type: 'sensor.temperature-analogue-v1',
      model: 'model.temperature-analogue-ideal-v1',
      boardPin: 'A1',
    },
    enableButton: {
      componentId: 'enable-button-1',
      type: 'button.momentary-v1',
      model: 'ideal active-low INPUT_PULLUP contact; no bounce or wear',
      boardPin: 'D2',
    },
    heaterIndicator: {
      componentId: 'heater-led-1',
      type: 'led.basic-v1',
      resistorComponentId: 'heater-resistor-1',
      resistorOhms: 220,
      boardPin: 'D13',
      model: 'ideal current-limited LED observation; no heater or thermal-plant model',
    },
  },
  setpointC: 30,
  equalityRule: 'At measuredTemperatureC == 30, D13 must be LOW; heating uses measuredTemperatureC < 30.',
  requirements: [
    { id: 'THERM-REQ-01', text: 'When enabled and measured temperature is below 30 C, executed firmware drives D13 HIGH.' },
    { id: 'THERM-REQ-02', text: 'When enabled and measured temperature equals 30 C, executed firmware drives D13 LOW.' },
    { id: 'THERM-REQ-03', text: 'When the active-low enable button is released, executed firmware drives D13 LOW.' },
    { id: 'THERM-REQ-04', text: 'A verdict uses executed D13 state as primary evidence; Serial text alone cannot pass.' },
    { id: 'THERM-REQ-05', text: 'The known-bad <= boundary variant must fail THERM-REQ-02 from observed executed output.' },
  ],
  limitations: [
    'The analogue sensor is an ideal linear -50..150 C to 0..5 V source with AVR ADC quantization.',
    'The button is an ideal contact without bounce, delay, wear or pull-up tolerance.',
    'The LED is only a visible heater-command indicator; no physical heater, room or thermal dynamics are simulated.',
    'Passing this experiment does not establish broad AVR, Arduino-library, physical-hardware or safety-controller conformance.',
  ],
});

export const THERMOSTAT_SCENARIOS = deepFreeze({
  schema: THERMOSTAT_SCENARIOS_SCHEMA,
  experimentId: THERMOSTAT_EXPERIMENT_ID,
  scenarios: [
    {
      id: 'THERM-SCENARIO-BELOW-ENABLED',
      requirementIds: ['THERM-REQ-01', 'THERM-REQ-04'],
      sensorControlC: 30,
      expectedMeasuredTemperatureC: 29,
      buttonPressed: true,
      expectedD13: true,
      expectedState: 'HEAT',
    },
    {
      id: 'THERM-SCENARIO-EQUALITY-ENABLED',
      requirementIds: ['THERM-REQ-02', 'THERM-REQ-04', 'THERM-REQ-05'],
      sensorControlC: 31,
      expectedMeasuredTemperatureC: 30,
      buttonPressed: true,
      expectedD13: false,
      expectedState: 'HOLD',
    },
    {
      id: 'THERM-SCENARIO-BELOW-DISABLED',
      requirementIds: ['THERM-REQ-03', 'THERM-REQ-04'],
      sensorControlC: 30,
      expectedMeasuredTemperatureC: 29,
      buttonPressed: false,
      expectedD13: false,
      expectedState: 'OFF',
    },
  ],
});

export const THERMOSTAT_OBSERVATION = deepFreeze({
  schema: THERMOSTAT_OBSERVATION_SCHEMA,
  experimentId: THERMOSTAT_EXPERIMENT_ID,
  primary: {
    source: 'executed ATmega328P pin snapshot',
    pin: 'D13',
    requiredMode: 'OUTPUT',
    field: 'level',
  },
  corroborating: {
    source: 'executed UART TX records',
    exactFields: ['TEMP_C', 'BUTTON', 'HEATER', 'STATE'],
    mayPassAlone: false,
  },
  inputEvidence: {
    source: 'runtime ordered input-event log',
    requiredControls: ['temperature-sensor-1.position', 'enable-button-1.pressed'],
    droppedEventsAllowed: 0,
  },
  completeness: {
    serialDropsAllowed: 0,
    missingPinOrInputEvidence: 'fail',
    timeoutOrInfrastructureError: 'unresolved, never pass',
  },
});

export const THERMOSTAT_TIME = deepFreeze({
  schema: THERMOSTAT_TIME_SCHEMA,
  experimentId: THERMOSTAT_EXPERIMENT_ID,
  clockHertz: 16_000_000,
  inputApplyAtMilliseconds: 0,
  observeAtOrAfterMilliseconds: 160,
  deadlineMilliseconds: 350,
  resetBetweenScenarios: true,
  wallClockAffectsVerdict: false,
});

function scenarioById(id) {
  return THERMOSTAT_SCENARIOS.scenarios.find((scenario) => scenario.id === id) ?? null;
}

export function thermostatScenarioControls(id) {
  const scenario = scenarioById(id);
  if (!scenario) throw new TypeError('THERMOSTAT_SCENARIO_UNKNOWN');
  const position = (scenario.sensorControlC + 50) / 200;
  return [
    { command: 'control', componentId: 'temperature-sensor-1', key: 'position', value: position },
    { command: 'control', componentId: 'enable-button-1', key: 'pressed', value: scenario.buttonPressed },
  ];
}

export function thermostatExpectedSerialLine(id) {
  const scenario = scenarioById(id);
  if (!scenario) throw new TypeError('THERMOSTAT_SCENARIO_UNKNOWN');
  return `TEMP_C=${scenario.expectedMeasuredTemperatureC} BUTTON=${scenario.buttonPressed ? 'PRESSED' : 'RELEASED'} HEATER=${scenario.expectedD13 ? 'ON' : 'OFF'} STATE=${scenario.expectedState}`;
}

export function evaluateThermostatObservation(id, snapshot) {
  const scenario = scenarioById(id);
  if (!scenario) throw new TypeError('THERMOSTAT_SCENARIO_UNKNOWN');
  const cycle = snapshot?.cycle;
  const virtualMilliseconds = Number.isSafeInteger(cycle) ? cycle / CPU_CYCLES_PER_MILLISECOND : null;
  const pin = Array.isArray(snapshot?.pins)
    ? snapshot.pins.find((entry) => entry.pin === THERMOSTAT_OBSERVATION.primary.pin) ?? null
    : null;
  const serial = snapshot?.instruments?.serial ?? null;
  const expectedSerialLine = thermostatExpectedSerialLine(id);
  const eventLog = snapshot?.eventLog;
  const loggedControls = Array.isArray(eventLog?.log)
    ? eventLog.log.filter((event) => event.type === 'control')
    : [];
  const requiredControls = thermostatScenarioControls(id);
  const inputsComplete = eventLog?.dropped === 0 && requiredControls.every((required) => loggedControls.some(
    (event) => event.componentId === required.componentId && event.key === required.key
      && event.value === required.value && event.targetCycle === 0,
  ));
  const timeInWindow = virtualMilliseconds !== null
    && virtualMilliseconds >= THERMOSTAT_TIME.observeAtOrAfterMilliseconds
    && virtualMilliseconds <= THERMOSTAT_TIME.deadlineMilliseconds;
  const primaryPassed = pin?.mode === THERMOSTAT_OBSERVATION.primary.requiredMode
    && pin.level === scenario.expectedD13;
  const serialPassed = serial?.dropped === 0 && typeof serial.text === 'string'
    && serial.text.includes(expectedSerialLine);
  const passed = timeInWindow && inputsComplete && primaryPassed && serialPassed;
  return {
    schema: 'intent-mcu-thermostat-observation-result@1',
    experimentId: THERMOSTAT_EXPERIMENT_ID,
    scenarioId: scenario.id,
    requirementIds: [...scenario.requirementIds],
    status: passed ? 'passed' : 'failed',
    virtualMilliseconds,
    expected: {
      d13: scenario.expectedD13,
      serialLine: expectedSerialLine,
    },
    observed: {
      d13Mode: pin?.mode ?? null,
      d13: typeof pin?.level === 'boolean' ? pin.level : null,
      serialText: typeof serial?.text === 'string' ? serial.text : '',
      inputControls: loggedControls.map((event) => ({
        componentId: event.componentId,
        key: event.key,
        value: event.value,
        targetCycle: event.targetCycle,
      })),
    },
    checks: {
      timeInWindow,
      inputsComplete,
      primaryExecutedPin: primaryPassed,
      corroboratingSerial: serialPassed,
    },
  };
}
