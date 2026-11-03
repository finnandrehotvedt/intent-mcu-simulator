// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'; import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { L298N_DRIVER_TYPE, createDcMotorL298nComponent } from '../expansion-drafts/dc-motor-l298n-v1.mjs';
import { DC_MOTOR_ENCODER_DEFINITION, DC_MOTOR_ENCODER_MODEL_ENTRY, DcMotorEncoderEditor, createDcMotorEncoderComponent,
  projectDcMotorEncoders } from '../expansion-drafts/dc-motor-encoder-v1.mjs';
import { createDcMotorEncoderArtwork } from '../expansion-drafts/dc-motor-encoder-artwork-v1.mjs';
import { candidateContactControl } from '../src/candidate-existing-ui-adapter.mjs';
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
test('CMP-069 expands to the bounded L298N command observer and real quadrature runtime', () => { const projection = projectDcMotorEncoders(graph());
  assert.equal(projection.ok, true); assert.equal(projection.motors.length, 1); assert.equal(projection.encoders.length, 1);
  assert.equal(projection.encoders[0].detent, 4); assert.deepEqual(projection.encoders[0].sequences.cw, ['11','01','00','10','11']);
  assert.deepEqual(projection.assemblies[0].encoder, projection.encoders[0]);
  assert.deepEqual(new Set(Object.values(projection.runtimePositionSources)), new Set(['assembly']));
  assert.equal(projection.runtimeGraph.components.some(({ type }) => type === 'output.dc-motor-encoder-v1'), false); });
test('CMP-069 rejects inferred, shorted or unsupported encoder wiring', () => { const missing = graph();
  missing.nets = missing.nets.filter(({ id }) => id !== 'ea'); assert.equal(projectDcMotorEncoders(missing).code, 'ROTARY_ENCODER_TERMINALS_REQUIRED');
  const wrong = graph(); wrong.nets.find(({ id }) => id === 'eb').endpoints[1].pin = 'D4';
  assert.equal(projectDcMotorEncoders(wrong).code, 'ROTARY_ENCODER_B_REQUIRES_D2_OR_D3');
  const component = createDcMotorEncoderComponent('x'); component.controls.detent = 1000;
  assert.equal(projectDcMotorEncoders({ components: [component], nets: [], junctions: [] }).code, 'DC_MOTOR_ENCODER_STATE'); });
test('CMP-069 editor persists independent detents with atomic rejection and exact Undo/Redo', () => {
  const editor = new DcMotorEncoderEditor(createDcMotorEncoderComponent('assembly', 'Motor encoder', 4));
  const before = editor.saveText(); assert.equal(editor.setDetent(1000).code, 'DC_MOTOR_ENCODER_DETENT_RANGE');
  assert.equal(editor.saveText(), before); assert.equal(editor.step('cw').component.controls.detent, 5);
  assert.equal(editor.undo().component.controls.detent, 4); assert.equal(editor.redo().component.controls.detent, 5);
  const opened = DcMotorEncoderEditor.openText(editor.saveText()); assert.equal(opened.ok, true);
  assert.equal(opened.editor.saveText(), editor.saveText()); assert.equal(opened.editor.undo().code, 'UNDO_EMPTY');
  assert.deepEqual(DC_MOTOR_ENCODER_MODEL_ENTRY.forbiddenInferences,
    ['pwm-to-encoder','direction-to-encoder','artwork-to-encoder','elapsed-time-to-rpm']);
});
test('CMP-069 workbench adapter accepts exactly one bounded independent detent', () => {
  const component = createDcMotorEncoderComponent('assembly', 'Motor encoder', 4);
  const projection = projectDcMotorEncoders(graph());
  const session = { kind: 'candidate-project-v3', visualProject: { circuit: { components: [component] } },
    runtimeSupport: [{ componentId: 'assembly', runtimeProjection: projection.assemblies[0] }],
    evaluateModel(type, input) { assert.equal(type, 'output.dc-motor-encoder-v1');
      assert.deepEqual(input, { in1: false, in2: false, enable: 0, encoderDirection: 'cw', encoderDetents: 1 });
      return { ok: true, result: { encoder: { grayStates: ['11','01','00','10','11'] } } }; } };
  const accepted = candidateContactControl(session, 'assembly', 'detent', 5);
  assert.deepEqual(accepted, {
    ok: true,
    command: { type: 'component.control.set', componentId: 'assembly', key: 'detent', value: 5 },
    worker: { command: 'digital-sequence', events: [
      { offsetCycles: 16000, pin: 2, level: false },
      { offsetCycles: 32000, pin: 3, level: false },
      { offsetCycles: 48000, pin: 2, level: true },
      { offsetCycles: 64000, pin: 3, level: true },
    ] },
    direction: 'cw',
  });
  assert.equal(candidateContactControl(session, 'assembly', 'detent', 6).code, 'CANDIDATE_UI_CONTROL');
  assert.equal(candidateContactControl(session, 'assembly', 'detent', 1000).code, 'CANDIDATE_UI_CONTROL');
});
test('CMP-069 canonical example preserves explicit independent encoder authority', async () => {
  const value = JSON.parse(await readFile(new URL('../examples/indicators-actuators/avr-dc-motor-encoder.intent-mcu.json', import.meta.url)));
  assert.equal(value.schema, 'intent-mcu-project-envelope@8');
  assert.equal(value.project.project.metadata.name, 'DC motor command with independent encoder detents');
  assert.match(value.project.project.source.files[0].content, /encoderQuarterSteps/u);
  assert.doesNotMatch(value.project.project.source.files[0].content, /analogWrite|millis\(\).*encoder|RPM/u);
  const projection = projectDcMotorEncoders(value.project.candidateCircuit);
  assert.equal(projection.ok, true); assert.equal(projection.assemblies.length, 1);
  assert.deepEqual(projection.encoders[0].sequences.cw, ['11','01','00','10','11']);
});
