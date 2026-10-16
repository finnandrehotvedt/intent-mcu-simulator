import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RP2040_PICO_CIRCUIT_SCHEMA,
  RP2040_PICO_DRAFT_STORAGE_KEY,
  RP2040_PICO_PIN_MAP,
  Rp2040PicoCircuitEditor,
  canonicalRp2040PicoCircuitJson,
  createRp2040PicoCircuitDraft,
  observeRp2040PicoCircuit,
  parseRp2040PicoCircuitText,
  rp2040PicoCircuitDependencies,
  validateRp2040PicoCircuit,
} from '../src/rp2040-pico-circuit.mjs';

const clone = (value) => structuredClone(value);
function mutate(callback) { const draft = createRp2040PicoCircuitDraft(); callback(draft); return draft; }

test('officially named GPIO0 and GND anchors define one 3.3 V external LED path', () => {
  assert.equal(RP2040_PICO_CIRCUIT_SCHEMA, 'intent-mcu-rp2040-pico-circuit@1');
  assert.equal(RP2040_PICO_DRAFT_STORAGE_KEY, 'intent-mcu.rp2040-pico-circuit.public.v1');
  assert.deepEqual(RP2040_PICO_PIN_MAP, {
    GP0: { signal: 'GPIO0', physicalPin: 1, voltage: 3.3, capability: 'digital-output+pwm' },
    GND3: { signal: 'GND', physicalPin: 3, voltage: 0, capability: 'ground-reference' },
  });
  assert.deepEqual(rp2040PicoCircuitDependencies(), [
    'board.rp2040-pico-v1', 'resistor.fixed-v1', 'led.basic-v1',
  ]);
  const result = validateRp2040PicoCircuit(createRp2040PicoCircuitDraft());
  assert.equal(result.ok, true);
  assert.deepEqual({ source: result.model.sourcePin, physical: result.model.sourcePhysicalPin,
    ground: result.model.groundPhysicalPin, volts: result.model.nominalVolts,
    resistor: result.model.resistorOhms },
  { source: 'GPIO0', physical: 1, ground: 3, volts: 3.3, resistor: 220 });
  assert.ok(result.model.peakCurrentAmps > 0.005 && result.model.peakCurrentAmps < 0.006);
});

test('wrong pin, open path, ground, polarity, resistor and overcurrent fail closed', () => {
  const wrongPin = mutate((draft) => { draft.nets[0].endpoints[0].pin = 'GP1'; });
  assert.equal(validateRp2040PicoCircuit(wrongPin).code, 'RP2040_PIN_UNPROVEN');

  const disconnected = mutate((draft) => { draft.nets = draft.nets.filter((net) => net.id !== 'net-series'); delete draft.layout.wireStyles['net-series']; });
  assert.equal(validateRp2040PicoCircuit(disconnected).code, 'RP2040_PATH_OPEN');

  const ground = mutate((draft) => { draft.nets = draft.nets.filter((net) => net.id !== 'net-ground'); delete draft.layout.wireStyles['net-ground']; });
  assert.equal(validateRp2040PicoCircuit(ground).code, 'RP2040_GROUND_REQUIRED');

  const reverse = mutate((draft) => {
    const anode = draft.nets[1].endpoints.find((endpoint) => endpoint.component === 'led-1');
    const cathode = draft.nets[2].endpoints.find((endpoint) => endpoint.component === 'led-1');
    anode.pin = 'CATHODE'; cathode.pin = 'ANODE';
  });
  assert.equal(validateRp2040PicoCircuit(reverse).code, 'RP2040_LED_REVERSE_POLARITY');

  const noResistor = mutate((draft) => {
    draft.components = draft.components.filter((item) => item.id !== 'resistor-1');
    delete draft.layout.positions['resistor-1'];
    draft.nets = [
      { id: 'net-direct', endpoints: [{ component: 'pico-1', pin: 'GP0' }, { component: 'led-1', pin: 'ANODE' }] },
      draft.nets[2],
    ];
    draft.layout.wireStyles = { 'net-direct': '#f04f5f', 'net-ground': '#303943' };
  });
  assert.equal(validateRp2040PicoCircuit(noResistor).code, 'RP2040_SERIES_RESISTOR_REQUIRED');

  const overcurrent = mutate((draft) => { draft.components.find((item) => item.id === 'resistor-1').properties.ohms = 10; });
  assert.equal(validateRp2040PicoCircuit(overcurrent).code, 'RP2040_LED_OVERCURRENT');
});

test('only actual RP2040 machine state can drive a validated LED model', () => {
  const draft = createRp2040PicoCircuitDraft();
  const runtime = {
    profile: 'board.rp2040-pico-v1', kind: 'paused',
    experimental: { gpio0: { mode: 'output', level: false }, pwm: { dutyCycle: 0.5 } },
  };
  const observed = observeRp2040PicoCircuit(draft, runtime);
  assert.equal(observed.active, true); assert.equal(observed.on, true); assert.equal(observed.brightness, 0.5);
  assert.ok(observed.averageCurrentAmps > 0.0025 && observed.averageCurrentAmps < 0.003);
  assert.equal(observeRp2040PicoCircuit(draft, { ...runtime, kind: 'reset', experimental: { gpio0: { mode: 'input', level: false }, pwm: null } }).on, false);
  assert.equal(observeRp2040PicoCircuit(draft, null).on, false);
  const broken = clone(draft); broken.nets = []; broken.layout.wireStyles = {};
  assert.equal(observeRp2040PicoCircuit(broken, runtime).on, false);
});

test('selection delete undo and strict circuit-only file open preserve draft semantics', () => {
  const editor = new Rp2040PicoCircuitEditor();
  const original = editor.saveText();
  editor.select({ kind: 'net', id: 'net-ground' });
  const deleted = editor.deleteSelected();
  assert.equal(deleted.ok, true); assert.equal(deleted.validation.code, 'RP2040_GROUND_REQUIRED');
  const undone = editor.undo();
  assert.equal(undone.ok, true); assert.equal(undone.validation.ok, true); assert.equal(editor.saveText(), original);
  editor.select({ kind: 'component', id: 'pico-1' });
  assert.equal(editor.deleteSelected().code, 'RP2040_BOARD_FIXED');
  const parsed = parseRp2040PicoCircuitText(original);
  assert.equal(parsed.ok, true); assert.equal(parsed.validation.ok, true);
  assert.equal(editor.openText(original).ok, true);
  const withFirmware = JSON.parse(original); withFirmware.firmware = 'forbidden';
  const before = editor.saveText();
  assert.equal(editor.openText(JSON.stringify(withFirmware)).code, 'RP2040_CIRCUIT_SHAPE');
  assert.equal(editor.saveText(), before);
  assert.equal(parseRp2040PicoCircuitText('{"schema":"x","schema":"y"}').code, 'DUPLICATE_KEY');
  assert.equal(canonicalRp2040PicoCircuitJson(JSON.parse(original)), original);
});
