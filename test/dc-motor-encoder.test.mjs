// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'; import assert from 'node:assert/strict';
import { L298N_DRIVER_TYPE, createDcMotorL298nComponent } from '../expansion-drafts/dc-motor-l298n-v1.mjs';
import { DC_MOTOR_ENCODER_DEFINITION, createDcMotorEncoderComponent,
  projectDcMotorEncoders } from '../expansion-drafts/dc-motor-encoder-v1.mjs';
import { createDcMotorEncoderArtwork } from '../expansion-drafts/dc-motor-encoder-artwork-v1.mjs';
import { candidateUiDefinition, createCandidateUiArtwork,
  createCandidateUiComponent } from '../src/candidate-existing-ui-adapter.mjs';
class N { constructor(name) { this.name = name; this.attributes = {}; this.children = []; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); } append(...children) { this.children.push(...children); }
  all(predicate, out = []) { if (predicate(this)) out.push(this); for (const child of this.children) child.all?.(predicate, out); return out; } }
const doc = { createElementNS(_ns, name) { return new N(name); } };
const graph = () => ({ components: [{ id: 'board', type: 'board.atmega328p-16mhz-v1' },
  createDcMotorEncoderComponent('assembly', 'Motor encoder', 4), createDcMotorL298nComponent(L298N_DRIVER_TYPE, 'driver')],
  nets: [['in1','driver','IN1','board','D7'],['in2','driver','IN2','board','D8'],['ena','driver','ENA','board','D9'],
    ['vcc','driver','VCC','board','5V'],['gnd','driver','GND','board','GND1'],['out1','driver','OUT1','assembly','M1'],
    ['out2','driver','OUT2','assembly','M2'],['ea','assembly','EA','board','D2'],['eb','assembly','EB','board','D3'],
    ['ecom','assembly','ECOM','board','GND2']].map(([id,a,ap,b,bp]) => ({ id, endpoints: [{ component:a,pin:ap },{ component:b,pin:bp }] })), junctions: [] });
test('CMP-069 owns five exact terminals and original motor/encoder artwork', () => { const component = createDcMotorEncoderComponent('assembly');
  const svg = createDcMotorEncoderArtwork(doc, DC_MOTOR_ENCODER_DEFINITION, component);
  assert.deepEqual(svg.all((node) => node.attributes['data-terminal-pin']).map((node) => node.attributes['data-terminal-pin']),
    ['M1','M2','EA','ECOM','EB']); assert.match(DC_MOTOR_ENCODER_DEFINITION.artwork.provenance, /Original IntentForce/u); });
test('CMP-069 is available through the canonical candidate component and artwork APIs', () => {
  const component = createCandidateUiComponent('output.dc-motor-encoder-v1', 'assembly');
  assert.equal(candidateUiDefinition(component.type), DC_MOTOR_ENCODER_DEFINITION);
  assert.equal(createCandidateUiArtwork(doc, DC_MOTOR_ENCODER_DEFINITION, component).attributes['data-renderer'], 'output-dc-motor-encoder');
});
test('CMP-069 expands to the bounded L298N command observer and real quadrature runtime', () => { const projection = projectDcMotorEncoders(graph());
  assert.equal(projection.ok, true); assert.equal(projection.motors.length, 1); assert.equal(projection.encoders.length, 1);
  assert.equal(projection.encoders[0].detent, 4); assert.deepEqual(projection.encoders[0].sequences.cw, ['11','01','00','10','11']);
  assert.equal(projection.runtimeGraph.components.some(({ type }) => type === 'output.dc-motor-encoder-v1'), false); });
test('CMP-069 rejects inferred, shorted or unsupported encoder wiring', () => { const missing = graph();
  missing.nets = missing.nets.filter(({ id }) => id !== 'ea'); assert.equal(projectDcMotorEncoders(missing).code, 'ROTARY_ENCODER_TERMINALS_REQUIRED');
  const wrong = graph(); wrong.nets.find(({ id }) => id === 'eb').endpoints[1].pin = 'D4';
  assert.equal(projectDcMotorEncoders(wrong).code, 'ROTARY_ENCODER_B_REQUIRES_D2_OR_D3');
  const component = createDcMotorEncoderComponent('x'); component.controls.detent = 1000;
  assert.equal(projectDcMotorEncoders({ components: [component], nets: [], junctions: [] }).code, 'DC_MOTOR_ENCODER_STATE'); });
