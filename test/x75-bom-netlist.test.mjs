// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOM_NETLIST_MAX_BYTES,
  createBomNetlistExport,
  parseBomNetlistText,
} from '../src/bom-netlist-export.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from '../src/compile-targets.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { createEsp32C3CircuitDraft } from '../src/esp32c3-public-circuit.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { createRp2040PicoCircuitDraft } from '../src/rp2040-pico-circuit.mjs';
import { createStm32CircuitDraft } from '../src/stm32-public-circuit.mjs';

const clone = (value) => structuredClone(value);
const input = (profile, graph, name = 'X75 test project') => ({
  productRelease: '1.1.0-rc.83',
  profile,
  projectName: name,
  graph,
  modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
});

test('X75 creates strict deterministic local BOM/netlist documents for all four profiles', async () => {
  const fixtures = [
    [AVR_PROFILE, clone(DEFAULT_CIRCUIT)],
    [RP2040_PROFILE, createRp2040PicoCircuitDraft()],
    [ESP32C3_PROFILE, createEsp32C3CircuitDraft()],
    [STM32F429ZI_PROFILE, createStm32CircuitDraft()],
  ];
  for (const [profile, graph] of fixtures) {
    const first = await createBomNetlistExport(input(profile, graph));
    const second = await createBomNetlistExport(input(profile, clone(graph)));
    assert.equal(first.text, second.text);
    assert.deepEqual(await parseBomNetlistText(first.text), first.value);
    assert.equal(first.value.profile, profile);
    assert.equal(first.value.procurement.status, 'not-provided');
    assert.match(first.value.procurement.limitations.join(' '), /Not a purchase list/u);
    assert(!first.text.includes('artifactIdentity'));
    assert(!first.text.includes('runtimeGeneration'));
    assert(!first.text.includes('source.files'));
    assert(new TextEncoder().encode(first.text).byteLength <= BOM_NETLIST_MAX_BYTES);
  }
});

test('X75 exports only authored electrical values and ignores visual movement and routes', async () => {
  const graph = createRp2040PicoCircuitDraft();
  const original = await createBomNetlistExport(input(RP2040_PROFILE, graph));
  const moved = clone(graph);
  moved.layout.positions['resistor-1'] = { x: 0.12, y: 0.82, rotation: 270 };
  moved.layout.wireStyles['net-gpio0'] = '#39dff2';
  moved.layout.wireRoutes['net-gpio0'] = { family: 'orthogonal', bends: [{ x: 0.4, y: 0.4 }] };
  const afterMove = await createBomNetlistExport(input(RP2040_PROFILE, moved));
  assert.equal(afterMove.text, original.text);

  const changed = clone(graph);
  changed.components.find(({ id }) => id === 'resistor-1').properties.ohms = 330;
  const afterValue = await createBomNetlistExport(input(RP2040_PROFILE, changed));
  assert.notEqual(afterValue.text, original.text);
  assert.deepEqual(afterValue.value.nets, original.value.nets);
  const resistor = afterValue.value.components.find(({ id }) => id === 'resistor-1');
  assert.deepEqual(resistor.properties, [{ name: 'ohms', value: 330, unit: 'Ω' }]);
});

test('X75 canonical bytes ignore equivalent input ordering and locale behavior', async () => {
  const graph = clone(DEFAULT_CIRCUIT);
  const original = await createBomNetlistExport(input(AVR_PROFILE, graph));
  const reordered = clone(graph);
  reordered.components.reverse();
  reordered.nets.reverse();
  reordered.junctions.reverse();
  for (const net of reordered.nets) net.endpoints.reverse();
  const potentiometer = reordered.components.find(({ id }) => id === 'pot-1');
  potentiometer.properties = {
    taper: potentiometer.properties.taper,
    ohms: potentiometer.properties.ohms,
  };
  const equivalent = await createBomNetlistExport(input(AVR_PROFILE, reordered));
  assert.equal(equivalent.text, original.text);
});

test('X75 changes the exact named endpoint and a restored graph restores exact bytes', async () => {
  const graph = clone(DEFAULT_CIRCUIT);
  const original = await createBomNetlistExport(input(AVR_PROFILE, graph));
  const reconnected = clone(graph);
  const endpoint = reconnected.nets.find(({ id }) => id === 'net-button-d2').endpoints
    .find(({ component }) => component === 'board-1');
  endpoint.pin = 'D3';
  const changed = await createBomNetlistExport(input(AVR_PROFILE, reconnected));
  assert.notEqual(changed.text, original.text);
  const priorNet = original.value.nets.find(({ id }) => id === 'net-button-d2');
  const nextNet = changed.value.nets.find(({ id }) => id === 'net-button-d2');
  assert.deepEqual(priorNet.endpoints.filter(({ componentId }) => componentId !== 'board-1'),
    nextNet.endpoints.filter(({ componentId }) => componentId !== 'board-1'));
  assert.equal(priorNet.endpoints.find(({ componentId }) => componentId === 'board-1').pinId, 'D2');
  assert.equal(nextNet.endpoints.find(({ componentId }) => componentId === 'board-1').pinId, 'D3');
  const undone = await createBomNetlistExport(input(AVR_PROFILE, clone(graph)));
  assert.equal(undone.text, original.text);
});

test('X75 exports only profile-owned physical pin metadata', async () => {
  const pico = (await createBomNetlistExport(input(RP2040_PROFILE, createRp2040PicoCircuitDraft()))).value;
  const gpio = pico.nets.flatMap(({ endpoints }) => endpoints)
    .find(({ componentId, pinId }) => componentId === 'pico-1' && pinId === 'GP0');
  assert.deepEqual(gpio.physical, { connector: null, pin: 1 });
  const resistor = pico.nets.flatMap(({ endpoints }) => endpoints)
    .find(({ componentId }) => componentId === 'resistor-1');
  assert.equal(resistor.physical, null);

  const c3 = (await createBomNetlistExport(input(ESP32C3_PROFILE, createEsp32C3CircuitDraft()))).value;
  assert.deepEqual(c3.nets.flatMap(({ endpoints }) => endpoints)
    .find(({ pinId }) => pinId === 'GPIO2').physical, { connector: 'J1', pin: 4 });
  const stm32 = (await createBomNetlistExport(input(STM32F429ZI_PROFILE, createStm32CircuitDraft()))).value;
  assert.deepEqual(stm32.nets.flatMap(({ endpoints }) => endpoints)
    .find(({ pinId }) => pinId === 'PB0').physical, { connector: 'CN11', pin: 34 });
  const avr = (await createBomNetlistExport(input(AVR_PROFILE, clone(DEFAULT_CIRCUIT)))).value;
  assert.equal(avr.nets.flatMap(({ endpoints }) => endpoints)
    .find(({ componentId, pinId }) => componentId === 'board-1' && pinId === 'D13').physical, null);
});

test('X75 rejects unknown identities, invalid properties, duplicate endpoints and limits', async () => {
  const unknownProfile = input('board.unknown-v1', clone(DEFAULT_CIRCUIT));
  await assert.rejects(createBomNetlistExport(unknownProfile), { message: 'BOM_NETLIST_PROFILE_UNKNOWN' });

  const unknownPin = clone(DEFAULT_CIRCUIT);
  unknownPin.nets[0].endpoints[0].pin = 'D99';
  await assert.rejects(createBomNetlistExport(input(AVR_PROFILE, unknownPin)),
    (error) => ['MODEL_LIBRARY_PIN_UNKNOWN', 'BOM_NETLIST_PIN_UNKNOWN'].includes(error.message));

  const invalidProperty = clone(DEFAULT_CIRCUIT);
  invalidProperty.components.find(({ id }) => id === 'resistor-1').properties.ohms = 0;
  await assert.rejects(createBomNetlistExport(input(AVR_PROFILE, invalidProperty)),
    (error) => /PROPERTY|RESISTOR/iu.test(error.message));

  const duplicate = clone(DEFAULT_CIRCUIT);
  duplicate.nets[1].endpoints[0] = clone(duplicate.nets[0].endpoints[0]);
  await assert.rejects(createBomNetlistExport(input(AVR_PROFILE, duplicate)),
    { message: 'BOM_NETLIST_ENDPOINT_DUPLICATE' });

  const overLimit = clone(DEFAULT_CIRCUIT);
  overLimit.components = Array.from({ length: 65 }, (_, index) => ({
    ...clone(overLimit.components[1]), id: `r-${index}`,
  }));
  await assert.rejects(createBomNetlistExport(input(AVR_PROFILE, overLimit)),
    { message: 'BOM_NETLIST_GRAPH_LIMIT' });

  await assert.rejects(parseBomNetlistText(' '.repeat(BOM_NETLIST_MAX_BYTES + 1)),
    { message: 'BOM_NETLIST_INPUT_LIMIT' });
});

test('X75 strict parser rejects identity, pin, model, property, physical and count tampering', async () => {
  const generated = await createBomNetlistExport(input(RP2040_PROFILE, createRp2040PicoCircuitDraft()));
  const extra = clone(generated.value);
  extra.procurement.mpn = 'invented';
  await assert.rejects(parseBomNetlistText(JSON.stringify(extra)), { message: 'BOM_NETLIST_DOCUMENT_INVALID' });
  const counts = clone(generated.value);
  counts.counts.components += 1;
  await assert.rejects(parseBomNetlistText(JSON.stringify(counts)), { message: 'BOM_NETLIST_DOCUMENT_COUNTS' });
  const release = clone(generated.value);
  release.productRelease = '1.1.0-rc.82';
  await assert.rejects(parseBomNetlistText(JSON.stringify(release)), { message: 'BOM_NETLIST_DOCUMENT_INVALID' });
  const type = clone(generated.value);
  type.components[0].type = 'component.fabricated-v1';
  await assert.rejects(parseBomNetlistText(JSON.stringify(type)), { message: 'BOM_NETLIST_DOCUMENT_MODEL' });
  const model = clone(generated.value);
  model.components[0].model.id = 'model.fabricated-v1';
  await assert.rejects(parseBomNetlistText(JSON.stringify(model)), { message: 'BOM_NETLIST_DOCUMENT_MODEL' });
  const modelVersion = clone(generated.value);
  modelVersion.components[0].model.version += 1;
  await assert.rejects(parseBomNetlistText(JSON.stringify(modelVersion)), { message: 'BOM_NETLIST_DOCUMENT_MODEL' });
  const property = clone(generated.value);
  property.components.find(({ id }) => id === 'resistor-1').properties[0].value = 0;
  await assert.rejects(parseBomNetlistText(JSON.stringify(property)), { message: 'BOM_NETLIST_DOCUMENT_PROPERTY' });
  const pin = clone(generated.value);
  pin.nets[0].endpoints[0].pinId = 'UNKNOWN';
  await assert.rejects(parseBomNetlistText(JSON.stringify(pin)), { message: 'BOM_NETLIST_DOCUMENT_ENDPOINT' });
  const physical = clone(generated.value);
  physical.nets.flatMap(({ endpoints }) => endpoints).find(({ physical: value }) => value).physical.pin = 99;
  await assert.rejects(parseBomNetlistText(JSON.stringify(physical)), { message: 'BOM_NETLIST_DOCUMENT_ENDPOINT' });
});
