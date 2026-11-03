// SPDX-License-Identifier: Apache-2.0
import { exactKeys } from '../src/strict-json.mjs';
import { DC_MOTOR_TYPE, createDcMotorL298nComponent, projectDcMotorL298n } from './dc-motor-l298n-v1.mjs';
import { ROTARY_ENCODER_TYPE, createRotaryEncoderComponent,
  projectRotaryEncoders } from './rotary-encoder-quadrature-v1.mjs';

export const DC_MOTOR_ENCODER_TYPE = 'output.dc-motor-encoder-v1';
export const DC_MOTOR_ENCODER_MODEL = 'model.dc-motor-encoder-command-quadrature-v1';
export const DC_MOTOR_ENCODER_RENDERER = 'output-dc-motor-encoder';
const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; };
const pin = (id, label, role, signals, x, constraints) => ({ id, label, role,
  signals: [...signals], capabilities: [...signals], constraints: { ...constraints }, anchor: { x, y: .92 } });

export const DC_MOTOR_ENCODER_DEFINITION = freeze({
  family: 'output.dc-motor-encoder', variant: 'brushed-motor-with-independent-quadrature-feedback',
  type: DC_MOTOR_ENCODER_TYPE, version: 1, displayName: 'DC motor with encoder',
  manufacturer: 'Intent Learning', partNumber: 'IL-DC-MOTOR-ENCODER',
  pins: [
    pin('M1', 'Motor terminal 1', 'power-in', ['motor.bridge-output'], .1, { voltageMin: 0, voltageMax: 5 }),
    pin('M2', 'Motor terminal 2', 'power-in', ['motor.bridge-output'], .28, { voltageMin: 0, voltageMax: 5 }),
    pin('EA', 'Encoder phase A', 'digital-out', ['digital.quadrature-contact'], .5, { voltageMin: 0, voltageMax: 5, pullMode: 'input-pullup' }),
    pin('ECOM', 'Encoder common', 'ground', ['ground.reference'], .72, { voltage: 0 }),
    pin('EB', 'Encoder phase B', 'digital-out', ['digital.quadrature-contact'], .9, { voltageMin: 0, voltageMax: 5, pullMode: 'input-pullup' }),
  ],
  propertyKeys: ['encoding', 'pullMode'], propertySchema: {
    encoding: { kind: 'enum', values: ['gray-2bit'], default: 'gray-2bit' },
    pullMode: { kind: 'enum', values: ['input-pullup'], default: 'input-pullup' },
  },
  controlKeys: ['detent'], modelRef: DC_MOTOR_ENCODER_MODEL, internalTerminalGroups: [], selectable: true,
  artwork: { renderer: DC_MOTOR_ENCODER_RENDERER, thumbnail: DC_MOTOR_ENCODER_RENDERER,
    viewBox: [0, 0, 176, 112], cssWidth: 176, cssHeight: 112,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.', license: 'Apache-2.0' },
  catalog: { category: 'drivers', aliases: ['dc motor encoder', 'gearmotor encoder'],
    functions: ['visual motor command intent', 'independent quadrature feedback'],
    interfaces: ['H-bridge output', 'GPIO'], supplyVolts: { min: 0, max: 5 }, package: 'original virtual motor and encoder assembly' },
  support: { status: 'partial', limitations: [
    'M1/M2 require the bounded L298N command model; EA/EB require unique AVR D2/D3 inputs and ECOM requires ground.',
    'Encoder detents produce the real bounded ideal Gray sequence through the existing quadrature runtime; they are never inferred from motor artwork, PWM, direction or elapsed time.',
    'Motor command and encoder feedback are intentionally independent; no RPM, torque, current, load, inertia, missed pulse or physical coupling is claimed.',
  ] },
});
export const DC_MOTOR_ENCODER_MODEL_ENTRY = freeze({
  schema: 'intent-mcu-model-entry@1', componentType: DC_MOTOR_ENCODER_TYPE,
  modelId: DC_MOTOR_ENCODER_MODEL, renderer: DC_MOTOR_ENCODER_RENDERER,
  controls: [{ key: 'detent', kind: 'integer', min: -999, max: 999, default: 0 }],
  runtimeAuthority: 'independent-user-authored-quadrature-only',
  forbiddenInferences: ['pwm-to-encoder', 'direction-to-encoder', 'artwork-to-encoder', 'elapsed-time-to-rpm'],
});

export function createDcMotorEncoderComponent(id, label = 'DC motor with encoder', detent = 0) {
  const component = { id, type: DC_MOTOR_ENCODER_TYPE, label,
    properties: { encoding: 'gray-2bit', pullMode: 'input-pullup' }, controls: { detent } };
  if (!validateDcMotorEncoderComponent(component)) throw new TypeError('DC_MOTOR_ENCODER_STATE');
  return component;
}
export function validateDcMotorEncoderComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === DC_MOTOR_ENCODER_TYPE
    && exactKeys(component.properties, ['encoding', 'pullMode'])
    && component.properties.encoding === 'gray-2bit' && component.properties.pullMode === 'input-pullup'
    && exactKeys(component.controls, ['detent']) && Number.isInteger(component.controls.detent)
    && component.controls.detent >= -999 && component.controls.detent <= 999;
}

export class DcMotorEncoderEditor {
  #component; #undo = []; #redo = [];
  constructor(component = createDcMotorEncoderComponent('dc-motor-encoder-1')) {
    if (!validateDcMotorEncoderComponent(component)) throw new TypeError('DC_MOTOR_ENCODER_STATE');
    this.#component = structuredClone(component);
  }
  snapshot() { return structuredClone(this.#component); }
  setDetent(value) {
    if (!Number.isInteger(value) || value < -999 || value > 999) return { ok: false, code: 'DC_MOTOR_ENCODER_DETENT_RANGE' };
    if (value === this.#component.controls.detent) return { ok: true, code: 'NO_CHANGE', component: this.snapshot() };
    this.#undo.push(this.snapshot()); this.#redo = []; this.#component.controls.detent = value;
    return { ok: true, code: 'OK', component: this.snapshot() };
  }
  step(direction) {
    if (!['cw', 'ccw'].includes(direction)) return { ok: false, code: 'DC_MOTOR_ENCODER_DIRECTION' };
    return this.setDetent(this.#component.controls.detent + (direction === 'cw' ? 1 : -1));
  }
  undo() { if (!this.#undo.length) return { ok: false, code: 'UNDO_EMPTY' }; this.#redo.push(this.snapshot());
    this.#component = this.#undo.pop(); return { ok: true, code: 'OK', component: this.snapshot() }; }
  redo() { if (!this.#redo.length) return { ok: false, code: 'REDO_EMPTY' }; this.#undo.push(this.snapshot());
    this.#component = this.#redo.pop(); return { ok: true, code: 'OK', component: this.snapshot() }; }
  saveText() { return `${JSON.stringify({ schema: 'intent-mcu-dc-motor-encoder@1', component: this.#component })}\n`; }
  static openText(text) { let value; try { value = JSON.parse(text); } catch { return { ok: false, code: 'DC_MOTOR_ENCODER_JSON' }; }
    if (!exactKeys(value, ['schema', 'component']) || value.schema !== 'intent-mcu-dc-motor-encoder@1'
        || !validateDcMotorEncoderComponent(value.component)) return { ok: false, code: 'DC_MOTOR_ENCODER_DOCUMENT' };
    return { ok: true, code: 'OK', editor: new DcMotorEncoderEditor(value.component) }; }
}

export function projectDcMotorEncoders(value) {
  const graph = structuredClone(value); const assemblies = graph.components.filter(({ type }) => type === DC_MOTOR_ENCODER_TYPE);
  if (!assemblies.length) return { ok: true, runtimeGraph: graph, assemblies: [], motors: [], encoders: [] };
  const ids = new Set(graph.components.map(({ id }) => id));
  for (const assembly of assemblies) {
    if (!validateDcMotorEncoderComponent(assembly)) return { ok: false, code: 'DC_MOTOR_ENCODER_STATE', details: [assembly.id] };
    for (const suffix of ['-motor', '-encoder']) if (ids.has(`${assembly.id}${suffix}`)) {
      return { ok: false, code: 'DC_MOTOR_ENCODER_EXPANSION_ID', details: [assembly.id] };
    }
  }
  graph.components = graph.components.flatMap((component) => {
    if (component.type !== DC_MOTOR_ENCODER_TYPE) return [component];
    const motor = createDcMotorL298nComponent(DC_MOTOR_TYPE, `${component.id}-motor`, component.label);
    const encoder = createRotaryEncoderComponent(`${component.id}-encoder`, `${component.label} encoder`, component.controls.detent);
    return [motor, encoder];
  });
  const endpoint = (item) => {
    const assembly = assemblies.find(({ id }) => id === item.component); if (!assembly) return [item];
    const mapping = { M1: [`${assembly.id}-motor`, 'A'], M2: [`${assembly.id}-motor`, 'B'],
      EA: [`${assembly.id}-encoder`, 'A'], EB: [`${assembly.id}-encoder`, 'B'], ECOM: [`${assembly.id}-encoder`, 'COM'] };
    const target = mapping[item.pin]; return target ? [{ component: target[0], pin: target[1] }] : [item];
  };
  graph.nets = graph.nets.map((net) => ({ ...net, endpoints: net.endpoints.flatMap(endpoint) }));
  const motorProjection = projectDcMotorL298n(graph); if (!motorProjection.ok) return motorProjection;
  const encoderProjection = projectRotaryEncoders(motorProjection.runtimeGraph); if (!encoderProjection.ok) return encoderProjection;
  return { ok: true, runtimeGraph: encoderProjection.runtimeGraph,
    assemblies: assemblies.map(({ id, controls }) => ({
      componentId: id,
      motorId: `${id}-motor`,
      encoderId: `${id}-encoder`,
      detent: controls.detent,
      encoder: structuredClone(encoderProjection.encoders.find(({ componentId }) => componentId === `${id}-encoder`)),
    })),
    motors: motorProjection.motors, drivers: motorProjection.drivers, encoders: encoderProjection.encoders,
    runtimePositionSources: Object.fromEntries([
      ...assemblies.map(({ id }) => [`${id}-motor`, id]),
      ...Object.entries(encoderProjection.runtimePositionSources).map(([runtimeId, sourceId]) => {
        const assembly = assemblies.find(({ id }) => sourceId === `${id}-encoder`);
        return [runtimeId, assembly?.id ?? sourceId];
      }),
    ]) };
}
