// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { LED_BAR_GRAPH_DEFINITION, LED_BAR_GRAPH_TYPE, RGB_COMMON_ANODE_DEFINITION,
  RGB_COMMON_ANODE_TYPE, ROTARY_SELECTOR_DEFINITION, ROTARY_SELECTOR_TYPE,
  commonAnodeChannelLevels, createRotarySelectorIndicator, ledBarGraphLevels,
  projectCommonAnodeRgbLeds, projectLedBarGraphs, projectRotarySelectors,
  rotarySelectorContactState, validateRotarySelectorIndicator } from '../expansion-drafts/rotary-selector-indicators-v1.mjs';
import { CANDIDATE_UI_COMPONENTS, createCandidateUiComponent } from '../src/candidate-existing-ui-adapter.mjs';
import { CIRCUIT_SCHEMA, CircuitRuntime, createComponent } from '../src/circuit-engine.mjs';

test('CMP036 rotary selector has five named terminals and one truthful maintained contact', () => {
  const component = createRotarySelectorIndicator(ROTARY_SELECTOR_TYPE, 'selector-4-1');
  assert.equal(validateRotarySelectorIndicator(component), true);
  assert.deepEqual(ROTARY_SELECTOR_DEFINITION.pins.map(({ id }) => id), ['COM', 'P1', 'P2', 'P3', 'P4']);
  assert.deepEqual(rotarySelectorContactState(component), { P1: true, P2: false, P3: false, P4: false });
  component.controls.position = 4;
  assert.deepEqual(rotarySelectorContactState(component), { P1: false, P2: false, P3: false, P4: true });
});

test('CMP039 common-anode RGB model explicitly converts desired light duty to active-low pin duty', () => {
  const component = createRotarySelectorIndicator(RGB_COMMON_ANODE_TYPE, 'rgb-ca-1');
  assert.equal(validateRotarySelectorIndicator(component), true);
  assert.deepEqual(RGB_COMMON_ANODE_DEFINITION.pins.map(({ id }) => id), ['R', 'G', 'B', 'COM']);
  assert.deepEqual(commonAnodeChannelLevels({ R: 1, G: 0.25, B: 0 }), {
    R: { sinkDuty: 1, pinHighDuty: 0 }, G: { sinkDuty: 0.25, pinHighDuty: 0.75 }, B: { sinkDuty: 0, pinHighDuty: 1 },
  });
  assert.throws(() => commonAnodeChannelLevels({ R: 2, G: 0, B: 0 }), /RGB_COMMON_ANODE_DUTY/u);
});

test('CMP040 bar graph preserves twenty physical terminals and ten independent visible states', () => {
  const component = createRotarySelectorIndicator(LED_BAR_GRAPH_TYPE, 'bar-1');
  assert.equal(validateRotarySelectorIndicator(component), true);
  assert.equal(LED_BAR_GRAPH_DEFINITION.pins.length, 20);
  assert.deepEqual(LED_BAR_GRAPH_DEFINITION.pins.slice(0, 4).map(({ id }) => id), ['A1', 'K1', 'A2', 'K2']);
  assert.deepEqual(ledBarGraphLevels([true, true, true, false, false, false, false, false, false, false]).slice(0, 4), [
    { segment: 1, on: true }, { segment: 2, on: true }, { segment: 3, on: true }, { segment: 4, on: false },
  ]);
  assert.throws(() => ledBarGraphLevels([true]), /LED_BAR_GRAPH_LEVELS/u);
});

test('all three contracts carry original artwork provenance and explicit limitations', () => {
  for (const definition of [ROTARY_SELECTOR_DEFINITION, RGB_COMMON_ANODE_DEFINITION, LED_BAR_GRAPH_DEFINITION]) {
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(definition.artwork.license, 'Apache-2.0');
    assert(definition.support.limitations.length >= 2);
  }
  assert.equal(Object.values(CANDIDATE_UI_COMPONENTS).filter(({ selectable }) => selectable).length, 69);
  assert.deepEqual(createCandidateUiComponent(ROTARY_SELECTOR_TYPE, 'selector-4-2').controls, { position: 1 });
  assert.deepEqual(createCandidateUiComponent(RGB_COMMON_ANODE_TYPE, 'rgb-ca-2').properties, {});
  assert.deepEqual(createCandidateUiComponent(LED_BAR_GRAPH_TYPE, 'bar-2').properties, { color: 'green' });
});

test('rotary selector projection retains only the selected COM contact in the runtime graph', () => {
  const selector = createRotarySelectorIndicator(ROTARY_SELECTOR_TYPE, 'selector-4-3');
  selector.controls.position = 3;
  const projected = projectRotarySelectors({ schema: CIRCUIT_SCHEMA,
    components: [selector, createComponent('board-1', 'board.atmega328p-16mhz-v1')],
    nets: [
      { id: 'net-com', endpoints: [{ component: 'selector-4-3', pin: 'COM' }, { component: 'board-1', pin: 'D7' }] },
      { id: 'net-p3', endpoints: [{ component: 'selector-4-3', pin: 'P3' }, { component: 'board-1', pin: 'GND1' }] },
      { id: 'net-p1', endpoints: [{ component: 'selector-4-3', pin: 'P1' }, { component: 'board-1', pin: '5V' }] },
    ], junctions: [] });
  assert.deepEqual(projected.selectors[0].activeContact, ['COM', 'P3']);
  assert.equal(projected.runtimeGraph.nets.some(({ id }) => id === 'net-p1'), false);
  assert.deepEqual(projected.runtimeGraph.components.find(({ id }) => id === 'selector-4-3').controls, { pressed: true });
});

test('common-anode projection and runtime make LOW bright and HIGH dark', () => {
  const rgb = createRotarySelectorIndicator(RGB_COMMON_ANODE_TYPE, 'rgb-ca-3');
  const board = createComponent('board-1', 'board.atmega328p-16mhz-v1');
  const resistors = ['r-red', 'r-green', 'r-blue'].map((id) => createComponent(id, 'resistor.fixed-v1', { properties: { ohms: 330 } }));
  const graph = { schema: CIRCUIT_SCHEMA, components: [board, rgb, ...resistors], junctions: [], nets: [
    { id: 'net-common', endpoints: [{ component: 'rgb-ca-3', pin: 'COM' }, { component: 'board-1', pin: '5V' }] },
    ...['R', 'G', 'B'].flatMap((channel, index) => [
      { id: `net-${channel.toLowerCase()}-led`, endpoints: [{ component: 'rgb-ca-3', pin: channel }, { component: resistors[index].id, pin: 'A' }] },
      { id: `net-${channel.toLowerCase()}-gpio`, endpoints: [{ component: resistors[index].id, pin: 'B' }, { component: 'board-1', pin: ['D3', 'D5', 'D6'][index] }] },
    ]),
  ] };
  const projected = projectCommonAnodeRgbLeds(graph);
  const runtime = new CircuitRuntime(projected.runtimeGraph);
  const low = runtime.observe({ digitalPins: { D3: false, D5: true, D6: true } });
  assert.equal(low.leds.find(({ componentId }) => componentId === 'rgb-ca-3').on, true);
  assert.equal(low.leds.find(({ componentId }) => componentId === 'rgb-ca-3-green').on, false);
});

test('bar graph projection creates ten ordinary LED channels with exact terminal mapping', () => {
  const bar = createRotarySelectorIndicator(LED_BAR_GRAPH_TYPE, 'bar-3');
  const graph = { schema: CIRCUIT_SCHEMA, components: [bar], nets: [
    { id: 'net-a10', endpoints: [{ component: 'bar-3', pin: 'A10' }, { component: 'r10', pin: 'B' }] },
    { id: 'net-k10', endpoints: [{ component: 'bar-3', pin: 'K10' }, { component: 'board-1', pin: 'GND1' }] },
  ], junctions: [] };
  const projected = projectLedBarGraphs(graph);
  assert.equal(projected.runtimeGraph.components.length, 10);
  assert(projected.runtimeGraph.nets.find(({ id }) => id === 'net-a10').endpoints.some(
    (endpoint) => endpoint.component === 'bar-3-s10' && endpoint.pin === 'ANODE'));
  assert.equal(projected.runtimePositionSources['bar-3-s10'], 'bar-3');
});
