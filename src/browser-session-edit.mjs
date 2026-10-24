// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createComponent } from './circuit-engine.mjs';

const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const TYPES = new Set(['board.atmega328p-16mhz-v1', 'resistor.fixed-v1', 'led.basic-v1',
  'button.momentary-v1', 'potentiometer.linear-v1', 'terminal.serial-uart-v1']);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const endpoint = (value) => exact(value, ['component', 'pin']) && ID.test(value.component)
  && /^[A-Z0-9]{1,12}$/u.test(value.pin) ? structuredClone(value) : null;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export const API03_PROFILE_MATRIX = Object.freeze({
  'board.atmega328p-16mhz-v1': Object.freeze({ discover: true, read_project: true, edit_circuit: true,
    commands: Object.freeze(['edit.batch', 'edit.undo', 'edit.redo']),
    batchOperations: Object.freeze(['component.add', 'component.remove', 'component.property.set',
      'wire.connect', 'wire.disconnect']) }),
  'board.rp2040-pico-v1': Object.freeze({ discover: true, read_project: true, edit_circuit: false, commands: Object.freeze([]) }),
  'board.esp32-c3-devmodule-v1': Object.freeze({ discover: true, read_project: true, edit_circuit: false, commands: Object.freeze([]) }),
  'board.stm32f429zi-nucleo144-v1': Object.freeze({ discover: true, read_project: true, edit_circuit: false, commands: Object.freeze([]) }),
});

export function summarizeApiChanges(operations) {
  return operations.map((operation) => Object.freeze(operation.command.startsWith('component.')
    ? { operation: operation.command, component_id: operation.id ?? operation.component_id }
    : { operation: operation.command, net_id: operation.net_id,
      ...(operation.endpoint ? { endpoint: structuredClone(operation.endpoint) } : {}) }));
}

export function prepareApiBatch(project, operations) {
  if (!project?.circuit || !Array.isArray(operations) || !operations.length || operations.length > 16) {
    fail('API_BATCH_SHAPE');
  }
  return operations.map((operation) => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) fail('API_BATCH_COMMAND_SHAPE');
    if (operation.command === 'component.add') {
      if (!exact(operation, ['command', 'id', 'type', 'position']) || !ID.test(operation.id)
          || !TYPES.has(operation.type) || !exact(operation.position, ['x', 'y', 'rotation'])) fail('API_COMPONENT_ADD_SHAPE');
      return { type: 'component.add', component: createComponent(operation.id, operation.type),
        position: structuredClone(operation.position) };
    }
    if (operation.command === 'component.remove') {
      if (!exact(operation, ['command', 'component_id']) || !ID.test(operation.component_id)) fail('API_COMPONENT_REMOVE_SHAPE');
      return { type: 'component.remove', componentId: operation.component_id };
    }
    if (operation.command === 'component.property.set') {
      if (!exact(operation, ['command', 'component_id', 'key', 'value']) || !ID.test(operation.component_id)
          || !/^[a-z][A-Za-z0-9]{0,31}$/u.test(operation.key)) fail('API_PROPERTY_SHAPE');
      return { type: 'component.property.set', componentId: operation.component_id,
        key: operation.key, value: structuredClone(operation.value) };
    }
    if (operation.command === 'wire.connect') {
      const from = endpoint(operation.from); const to = endpoint(operation.to);
      if (!exact(operation, ['command', 'net_id', 'from', 'to']) || !ID.test(operation.net_id)
          || !from || !to || `${from.component}.${from.pin}` === `${to.component}.${to.pin}`) fail('API_WIRE_CONNECT_SHAPE');
      return { type: 'wire.create', net: { id: operation.net_id, endpoints: [from, to] } };
    }
    if (operation.command === 'wire.disconnect') {
      if (exact(operation, ['command', 'net_id']) && ID.test(operation.net_id)) {
        return { type: 'wire.delete', netId: operation.net_id };
      }
      const point = endpoint(operation.endpoint);
      if (!exact(operation, ['command', 'net_id', 'endpoint']) || !ID.test(operation.net_id) || !point) {
        fail('API_WIRE_DISCONNECT_SHAPE');
      }
      return { type: 'wire.branch.delete', netId: operation.net_id, endpoint: point };
    }
    fail('API_COMMAND_UNSUPPORTED');
  });
}
