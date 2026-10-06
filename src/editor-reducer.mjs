// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CircuitError, normalizeCircuitStructure, validateCircuit } from './circuit-engine.mjs';
import { exactKeys } from './strict-json.mjs';

export const EDITOR_HISTORY_LIMIT = 64;

const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

function failure(code, revision, details = []) {
  return { ok: false, code, revision, details };
}

function commandShape(command, fields) {
  return exactKeys(command, ['type', 'revision', ...fields])
    && Number.isInteger(command.revision) && command.revision >= 0;
}

function findComponent(graph, componentId) {
  return graph.components.find((component) => component.id === componentId);
}

function findNet(graph, netId) {
  return graph.nets.find((net) => net.id === netId);
}

function sameEndpoint(left, right) {
  return endpointKey(left) === endpointKey(right);
}

function applyMutation(graph, command) {
  const next = clone(graph);
  switch (command.type) {
    case 'component.add':
      if (!commandShape(command, ['component'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      next.components.push(clone(command.component));
      break;
    case 'component.duplicate': {
      if (!commandShape(command, ['sourceId', 'newId'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      const source = findComponent(next, command.sourceId);
      if (!source) throw new CircuitError('EDITOR_COMPONENT_MISSING', { componentId: command.sourceId });
      const copy = clone(source);
      copy.id = command.newId;
      copy.label = `${source.label} copy`;
      next.components.push(copy);
      break;
    }
    case 'component.remove': {
      if (!commandShape(command, ['componentId'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      if (!findComponent(next, command.componentId)) {
        throw new CircuitError('EDITOR_COMPONENT_MISSING', { componentId: command.componentId });
      }
      next.components = next.components.filter((component) => component.id !== command.componentId);
      const removedNets = new Set();
      next.nets = next.nets.flatMap((net) => {
        const endpoints = net.endpoints.filter((endpoint) => endpoint.component !== command.componentId);
        if (endpoints.length < 2) {
          removedNets.add(net.id);
          return [];
        }
        return [{ ...net, endpoints }];
      });
      next.junctions = next.junctions.filter((junction) => !removedNets.has(junction.net));
      break;
    }
    case 'component.property.set': {
      if (!commandShape(command, ['componentId', 'key', 'value'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      const component = findComponent(next, command.componentId);
      if (!component) throw new CircuitError('EDITOR_COMPONENT_MISSING', { componentId: command.componentId });
      if (typeof command.key !== 'string' || !Object.hasOwn(component.properties, command.key)) {
        throw new CircuitError('EDITOR_PROPERTY_UNKNOWN', { componentId: command.componentId });
      }
      component.properties[command.key] = clone(command.value);
      break;
    }
    case 'wire.create':
      if (!commandShape(command, ['net'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      next.nets.push(clone(command.net));
      break;
    case 'wire.reconnect': {
      if (!commandShape(command, ['netId', 'from', 'to'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      const net = findNet(next, command.netId);
      if (!net) throw new CircuitError('EDITOR_NET_MISSING', { netId: command.netId });
      const index = net.endpoints.findIndex((endpoint) => sameEndpoint(endpoint, command.from));
      if (index < 0) throw new CircuitError('EDITOR_ENDPOINT_MISSING', { netId: command.netId });
      net.endpoints[index] = clone(command.to);
      break;
    }
    case 'wire.delete':
      if (!commandShape(command, ['netId'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      if (!findNet(next, command.netId)) throw new CircuitError('EDITOR_NET_MISSING', { netId: command.netId });
      next.nets = next.nets.filter((net) => net.id !== command.netId);
      next.junctions = next.junctions.filter((junction) => junction.net !== command.netId);
      break;
    case 'junction.add':
      if (!commandShape(command, ['junction'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      next.junctions.push(clone(command.junction));
      break;
    case 'junction.remove':
      if (!commandShape(command, ['junctionId'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      if (!next.junctions.some((junction) => junction.id === command.junctionId)) {
        throw new CircuitError('EDITOR_JUNCTION_MISSING');
      }
      next.junctions = next.junctions.filter((junction) => junction.id !== command.junctionId);
      break;
    case 'pin.assign': {
      if (!commandShape(command, ['netId', 'from', 'to'])) throw new CircuitError('EDITOR_COMMAND_SHAPE');
      const net = findNet(next, command.netId);
      if (!net) throw new CircuitError('EDITOR_NET_MISSING', { netId: command.netId });
      const index = net.endpoints.findIndex((endpoint) => sameEndpoint(endpoint, command.from));
      if (index < 0) throw new CircuitError('EDITOR_ENDPOINT_MISSING', { netId: command.netId });
      net.endpoints[index] = clone(command.to);
      break;
    }
    default:
      throw new CircuitError('EDITOR_COMMAND_UNKNOWN');
  }
  return normalizeCircuitStructure(next, { allowDraft: true });
}

export class CircuitEditorReducer {
  constructor(graph, historyLimit = EDITOR_HISTORY_LIMIT) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > EDITOR_HISTORY_LIMIT) {
      throw new TypeError('Invalid editor history limit');
    }
    this.graph = normalizeCircuitStructure(graph, { allowDraft: true });
    this.revision = 0;
    this.historyLimit = historyLimit;
    this.undoStack = [];
    this.redoStack = [];
  }

  apply(command, { running = false } = {}) {
    if (!command || typeof command !== 'object' || Array.isArray(command)
        || !Number.isInteger(command.revision) || command.revision !== this.revision) {
      return failure('EDITOR_STALE_REVISION', this.revision);
    }
    if (command.type === 'undo' || command.type === 'redo') return this.#travel(command, running);
    try {
      const next = applyMutation(this.graph, command);
      this.undoStack.push(this.graph);
      if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
      this.redoStack = [];
      this.graph = next;
      this.revision += 1;
      const validation = validateCircuit(next);
      return {
        ok: true,
        code: 'EDITOR_COMMITTED',
        revision: this.revision,
        graph: clone(this.graph),
        runnable: validation.ok,
        diagnostics: validation.diagnostics,
        stopped: running,
      };
    } catch (error) {
      if (error instanceof CircuitError) return failure(error.code, this.revision, error.diagnostics);
      throw error;
    }
  }

  #travel(command, running) {
    if (!commandShape(command, [])) return failure('EDITOR_COMMAND_SHAPE', this.revision);
    const undo = command.type === 'undo';
    const source = undo ? this.undoStack : this.redoStack;
    const target = undo ? this.redoStack : this.undoStack;
    if (!source.length) return failure(undo ? 'EDITOR_UNDO_EMPTY' : 'EDITOR_REDO_EMPTY', this.revision);
    target.push(this.graph);
    if (target.length > this.historyLimit) target.shift();
    this.graph = source.pop();
    this.revision += 1;
    const validation = validateCircuit(this.graph);
    return {
      ok: true,
      code: undo ? 'EDITOR_UNDONE' : 'EDITOR_REDONE',
      revision: this.revision,
      graph: clone(this.graph),
      runnable: validation.ok,
      diagnostics: validation.diagnostics,
      stopped: running,
    };
  }
}
