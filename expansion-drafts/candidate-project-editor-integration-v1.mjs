// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { ProjectEditorReducer } from '../src/project-editor.mjs';
import {
  PROJECT_SCHEMA,
  canonicalProjectJson,
  defaultWireColor,
  validateProjectV2,
} from '../src/project-v2.mjs';
import { parseStrictJson } from '../src/strict-json.mjs';
import {
  CONTACT_PERSISTENCE_LIMIT,
  CONTACT_PERSISTENCE_SCHEMA,
  canonicalContactPersistenceDraftJson,
  synchronizeContactPersistenceRuntime,
  validateContactPersistenceDraft,
} from './project-v3-contact-persistence.mjs';
import { GROUND_REFERENCE_TYPE } from './ground-reference-integration-v1.mjs';
import { SPDT_CONTACT_TYPE } from './switch-contact-graph-v1.mjs';
import {
  createSpdtDigitalTransition,
  evaluateSpdtDigitalInput,
} from './spdt-contact-runtime-adapter-v1.mjs';
import { TOGGLE_SWITCH_TYPE } from './toggle-switch-integration-v1.mjs';
import { LIGHT_ANALOGUE_SENSOR_TYPE } from './light-analogue-sensor-v1.mjs';
import {
  TEMPERATURE_ANALOGUE_SENSOR_TYPE,
  TEMPERATURE_MAX_C,
  TEMPERATURE_MIN_C,
} from './temperature-analogue-sensor-v1.mjs';
import {
  DIGITAL_LIGHT_THRESHOLD_TYPE,
  updateDigitalLightThresholdControl,
} from './digital-light-threshold-module-v1.mjs';

export const CANDIDATE_EDITOR_INTEGRATION_SCHEMA = 'intent-mcu-candidate-editor-session@1';
export const CANDIDATE_EDITOR_HISTORY_LIMIT = 64;

const clone = (value) => structuredClone(value);
const failure = (code, revision, details = []) => ({ ok: false, code, revision, details });
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const CANDIDATE_COMPONENT_TYPES = new Set([
  GROUND_REFERENCE_TYPE, TOGGLE_SWITCH_TYPE, SPDT_CONTACT_TYPE,
  LIGHT_ANALOGUE_SENSOR_TYPE, TEMPERATURE_ANALOGUE_SENSOR_TYPE,
  DIGITAL_LIGHT_THRESHOLD_TYPE,
]);

function validPoint(value) {
  return value && Number.isFinite(value.x) && value.x >= 0 && value.x <= 1
    && Number.isFinite(value.y) && value.y >= 0 && value.y <= 1
    && (!Object.hasOwn(value, 'rotation') || [0, 90, 180, 270].includes(value.rotation));
}

function removeNetFromDraft(draft, netId) {
  draft.candidateCircuit.nets = draft.candidateCircuit.nets.filter((net) => net.id !== netId);
  draft.candidateCircuit.junctions = draft.candidateCircuit.junctions.filter(
    (junction) => junction.net !== netId,
  );
  delete draft.candidateLayout.wireRoutes[netId];
}

function normalizeChangedNet(draft, netId) {
  const net = draft.candidateCircuit.nets.find((item) => item.id === netId);
  delete draft.candidateLayout.wireRoutes[netId];
  if (!net || net.endpoints.length < 2) {
    removeNetFromDraft(draft, netId);
    return;
  }
  if (net.endpoints.length === 2) {
    draft.candidateCircuit.junctions = draft.candidateCircuit.junctions.filter(
      (junction) => junction.net !== netId,
    );
  }
}

function exactCommand(command, fields) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return false;
  const actual = Object.keys(command).sort();
  const expected = ['type', 'revision', ...fields].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function runtimeProject(result) {
  const projectV3 = result.project.project;
  const projectV2 = {
    schema: PROJECT_SCHEMA,
    metadata: clone(projectV3.metadata),
    boardProfile: projectV3.controller.profile,
    source: clone(projectV3.source),
    circuit: clone(result.reconstruction.runtimeProjection),
    layout: clone(projectV3.layout),
    instruments: clone(projectV3.instruments),
    build: { status: 'dirty', inputIdentity: null, artifactIdentity: null },
  };
  const validated = validateProjectV2(projectV2);
  if (!validated.ok) throw Object.assign(new Error(validated.code), { code: validated.code, details: validated.details });
  return validated.project;
}

function visualProject(result) {
  const projectV3 = result.project.project;
  const graph = result.reconstruction.graph;
  const layout = result.reconstruction.layout;
  return {
    schema: CANDIDATE_EDITOR_INTEGRATION_SCHEMA,
    metadata: clone(projectV3.metadata),
    boardProfile: projectV3.controller.profile,
    source: clone(projectV3.source),
    circuit: clone(graph),
    layout: {
      positions: clone(layout.positions),
      wireRoutes: clone(layout.wireRoutes),
      wireStyles: Object.fromEntries(graph.nets.map((net) => [
        net.id, { color: defaultWireColor(net, graph) },
      ])),
      viewport: clone(layout.viewport),
    },
    instruments: clone(projectV3.instruments),
    build: { status: 'dirty', inputIdentity: null, artifactIdentity: null },
  };
}

function contactSupport(result) {
  return result.reconstruction.contacts.map((contact) => {
    if (!result.reconstruction.runnable.ok) {
      return {
        componentId: contact.componentId,
        type: contact.type,
        status: 'draft-unrunnable',
        runtimeAdapter: null,
        limitation: `Draft is structurally valid but not runnable: ${result.reconstruction.runnable.code}`,
      };
    }
    const selected = contact.type === SPDT_CONTACT_TYPE
      ? evaluateSpdtDigitalInput(result, contact.componentId)
      : null;
    const spdt = selected?.ok
      ? createSpdtDigitalTransition(
        result,
        contact.componentId,
        contact.state.selectedThrow === 'A' ? 'B' : 'A',
      )
      : selected;
    return {
      componentId: contact.componentId,
      type: contact.type,
      status: spdt && !spdt.ok ? 'runtime-unsupported' : 'projected-simulated',
      runtimeAdapter: contact.type === GROUND_REFERENCE_TYPE
        ? 'board-ground-projection'
        : contact.type === TOGGLE_SWITCH_TYPE
          ? 'button.momentary-v1'
          : contact.type === LIGHT_ANALOGUE_SENSOR_TYPE
            ? 'potentiometer.linear-v1'
          : contact.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE
            ? 'potentiometer.linear-v1'
          : contact.type === DIGITAL_LIGHT_THRESHOLD_TYPE
            ? 'button.momentary-v1'
          : spdt?.ok
            ? 'spdt-digital-reference-v1'
            : null,
      limitation: contact.type === DIGITAL_LIGHT_THRESHOLD_TYPE
        ? 'Ideal active-low percentage threshold with retained hysteresis state only; no lux accuracy or physical detector behavior is modelled.'
        : contact.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE
        ? 'Ideal linear -50 to 150 °C module signal only; no physical-sensor accuracy or thermal response is modelled.'
        : contact.type === LIGHT_ANALOGUE_SENSOR_TYPE
        ? 'Ideal linear 0–5 V module signal only; no lux accuracy or physical LDR response is modelled.'
        : contact.type === SPDT_CONTACT_TYPE
        ? spdt?.ok
          ? 'Direct digital-input GND/5 V references are simulated; generic dynamic nets, analogue contacts and output-drive inference remain unsupported.'
          : `SPDT runtime projection rejected: ${spdt?.code ?? 'SPDT_RUNTIME_UNSUPPORTED'}`
        : null,
    };
  });
}

export class V2EditorSession {
  constructor(project) {
    this.kind = 'project-v2';
    this.editor = new ProjectEditorReducer(project);
  }

  get revision() { return this.editor.revision; }
  get project() { return clone(this.editor.project); }
  get visualProject() { return clone(this.editor.project); }
  get runtimeProject() { return clone(this.editor.project); }
  get runtimeSupport() { return []; }
  get compiledFixture() { return null; }
  saveText() { return canonicalProjectJson(this.editor.project); }
  apply(command, options = {}) { return this.editor.apply(command, options); }
}

export class CandidateEditorSession {
  constructor(value, historyLimit = CANDIDATE_EDITOR_HISTORY_LIMIT) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > CANDIDATE_EDITOR_HISTORY_LIMIT) {
      throw new TypeError('CANDIDATE_EDITOR_HISTORY_LIMIT');
    }
    const accepted = validateContactPersistenceDraft(value);
    if (!accepted.ok) throw Object.assign(new Error(accepted.code), { code: accepted.code, details: accepted.details });
    const normalized = accepted.reconstruction.projectionReady && !accepted.reconstruction.baseMatches
      ? synchronizeContactPersistenceRuntime(accepted.project)
      : accepted;
    if (!normalized.ok) throw Object.assign(new Error(normalized.code), { code: normalized.code, details: normalized.details });
    this.kind = 'candidate-project-v3';
    this.accepted = normalized;
    this.revision = 0;
    this.historyLimit = historyLimit;
    this.undoStack = [];
    this.redoStack = [];
  }

  get project() { return visualProject(this.accepted); }
  get visualProject() { return visualProject(this.accepted); }
  get runtimeProject() {
    const runnable = this.runnable;
    if (!runnable.ok) throw Object.assign(new Error(runnable.code), { code: runnable.code, details: runnable.details });
    return runtimeProject(this.accepted);
  }
  get runnable() {
    const candidateCount = this.accepted.project.candidateCircuit.components.filter(
      (component) => CANDIDATE_COMPONENT_TYPES.has(component.type),
    ).length;
    if (candidateCount === 0) {
      return { ok: false, code: 'PROJECT_CONTACT_CANDIDATE_REQUIRED', details: [] };
    }
    const structural = this.accepted.reconstruction.runnable;
    if (!structural.ok) return clone(structural);
    const unsupported = contactSupport(this.accepted).find((item) => item.status !== 'projected-simulated');
    return unsupported
      ? { ok: false, code: 'CANDIDATE_UI_RUNTIME_UNSUPPORTED', details: [unsupported.componentId, unsupported.limitation] }
      : { ok: true, code: 'OK', details: [] };
  }
  get runtimeSupport() { return clone(contactSupport(this.accepted)); }
  get compiledFixture() { return clone(this.accepted.reconstruction.compiledFixture); }
  get pinAnchors() { return clone(this.accepted.reconstruction.pinAnchors); }
  saveText() { return canonicalContactPersistenceDraftJson(this.accepted.project); }
  evaluateSpdtRuntime(componentId, options = {}) {
    return clone(evaluateSpdtDigitalInput(this.accepted, componentId, options));
  }
  createSpdtRuntimeTransition(componentId, to, options = {}) {
    return clone(createSpdtDigitalTransition(this.accepted, componentId, to, options));
  }

  #accept(project, code, { runtimeDirty = false, changeRelevance = null } = {}) {
    let next = validateContactPersistenceDraft(project);
    if (!next.ok) return failure(next.code, this.revision, next.details);
    if (next.reconstruction.projectionReady && !next.reconstruction.baseMatches) {
      next = synchronizeContactPersistenceRuntime(next.project);
      if (!next.ok) return failure(next.code, this.revision, next.details);
    }
    this.undoStack.push(clone(this.accepted.project));
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    this.redoStack = [];
    this.accepted = next;
    this.revision += 1;
    return {
      ok: true,
      code,
      revision: this.revision,
      project: this.visualProject,
      runtimeProject: this.runnable.ok ? this.runtimeProject : null,
      runnable: this.runnable,
      runtimeDirty,
      changeRelevance: changeRelevance ?? (runtimeDirty ? 'build' : 'visual'),
    };
  }

  #travel(command) {
    if (!exactCommand(command, [])) return failure('EDITOR_COMMAND_SHAPE', this.revision);
    const undo = command.type === 'undo';
    const source = undo ? this.undoStack : this.redoStack;
    const target = undo ? this.redoStack : this.undoStack;
    if (!source.length) return failure(undo ? 'EDITOR_UNDO_EMPTY' : 'EDITOR_REDO_EMPTY', this.revision);
    const beforeProjection = JSON.stringify(this.accepted.reconstruction.runtimeProjection);
    const beforeContacts = JSON.stringify(
      this.accepted.reconstruction.contacts.map((contact) => contact.state),
    );
    const previous = clone(this.accepted.project);
    let next = validateContactPersistenceDraft(source.pop());
    if (!next.ok) throw new Error(`CANDIDATE_EDITOR_HISTORY:${next.code}`);
    if (next.reconstruction.projectionReady && !next.reconstruction.baseMatches) {
      next = synchronizeContactPersistenceRuntime(next.project);
    }
    if (!next.ok) throw new Error(`CANDIDATE_EDITOR_HISTORY:${next.code}`);
    target.push(previous);
    if (target.length > this.historyLimit) target.shift();
    this.accepted = next;
    this.revision += 1;
    const topologyDirty = beforeProjection !== JSON.stringify(next.reconstruction.runtimeProjection);
    const runtimeDirty = topologyDirty || beforeContacts !== JSON.stringify(
      next.reconstruction.contacts.map((contact) => contact.state),
    );
    return {
      ok: true,
      code: undo ? 'EDITOR_UNDONE' : 'EDITOR_REDONE',
      revision: this.revision,
      project: this.visualProject,
      runtimeProject: this.runnable.ok ? this.runtimeProject : null,
      runnable: this.runnable,
      runtimeDirty,
      changeRelevance: topologyDirty ? 'build' : runtimeDirty ? 'runtime' : 'visual',
    };
  }

  apply(command) {
    if (!command || !Number.isInteger(command.revision) || command.revision !== this.revision) {
      return failure('EDITOR_STALE_REVISION', this.revision);
    }
    if (command.type === 'undo' || command.type === 'redo') return this.#travel(command);
    const draft = clone(this.accepted.project);
    let runtimeDirty = false;
    try {
      switch (command.type) {
        case 'project.rename': {
          if (!exactCommand(command, ['name'])) return failure('EDITOR_COMMAND_SHAPE', this.revision);
          draft.project.metadata = { name: command.name };
          break;
        }
        case 'component.add': {
          if (!exactCommand(command, ['component', 'position']) || !validPoint(command.position)
              || !CANDIDATE_COMPONENT_TYPES.has(command.component?.type)) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          if (draft.candidateCircuit.components.some((item) => item.id === command.component.id)) {
            return failure('PROJECT_CONTACT_COMPONENT_DUPLICATE', this.revision, [command.component.id]);
          }
          draft.candidateCircuit.components.push(clone(command.component));
          draft.candidateLayout.positions[command.component.id] = {
            x: command.position.x,
            y: command.position.y,
            rotation: command.position.rotation ?? 0,
          };
          runtimeDirty = true;
          break;
        }
        case 'component.remove': {
          if (!exactCommand(command, ['componentId'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const component = draft.candidateCircuit.components.find(
            (item) => item.id === command.componentId,
          );
          if (!component) return failure('EDITOR_COMPONENT_MISSING', this.revision, [command.componentId]);
          if (!CANDIDATE_COMPONENT_TYPES.has(component.type)) {
            return failure('CANDIDATE_EDITOR_COMPONENT_REMOVE_UNSUPPORTED', this.revision, [command.componentId]);
          }
          draft.candidateCircuit.components = draft.candidateCircuit.components.filter(
            (item) => item.id !== command.componentId,
          );
          delete draft.candidateLayout.positions[command.componentId];
          const changedNets = [];
          for (const net of draft.candidateCircuit.nets) {
            const endpoints = net.endpoints.filter(
              (endpoint) => endpoint.component !== command.componentId,
            );
            if (endpoints.length !== net.endpoints.length) {
              net.endpoints = endpoints;
              changedNets.push(net.id);
            }
          }
          for (const netId of changedNets) normalizeChangedNet(draft, netId);
          runtimeDirty = true;
          break;
        }
        case 'wire.create': {
          if (!exactCommand(command, ['net']) || !command.net
              || Object.keys(command.net).sort().join('|') !== 'endpoints|id'
              || !Array.isArray(command.net.endpoints) || command.net.endpoints.length !== 2) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateCircuit.nets.push(clone(command.net));
          runtimeDirty = true;
          break;
        }
        case 'wire.delete': {
          if (!exactCommand(command, ['netId'])) return failure('EDITOR_COMMAND_SHAPE', this.revision);
          if (!draft.candidateCircuit.nets.some((net) => net.id === command.netId)) {
            return failure('EDITOR_NET_MISSING', this.revision, [command.netId]);
          }
          removeNetFromDraft(draft, command.netId);
          runtimeDirty = true;
          break;
        }
        case 'wire.branch.delete': {
          if (!exactCommand(command, ['netId', 'endpoint'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const net = draft.candidateCircuit.nets.find((item) => item.id === command.netId);
          if (!net) return failure('EDITOR_NET_MISSING', this.revision, [command.netId]);
          if (net.endpoints.length <= 2) {
            return failure('EDITOR_BRANCH_REQUIRES_MULTI_ENDPOINT', this.revision, [command.netId]);
          }
          const key = endpointKey(command.endpoint);
          if (!net.endpoints.some((endpoint) => endpointKey(endpoint) === key)) {
            return failure('EDITOR_ENDPOINT_MISSING', this.revision, [key]);
          }
          net.endpoints = net.endpoints.filter((endpoint) => endpointKey(endpoint) !== key);
          normalizeChangedNet(draft, command.netId);
          runtimeDirty = true;
          break;
        }
        case 'wire.branch': {
          if (!exactCommand(command, ['netId', 'endpoint', 'junctionId'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const net = draft.candidateCircuit.nets.find((item) => item.id === command.netId);
          if (!net) return failure('EDITOR_NET_MISSING', this.revision, [command.netId]);
          const key = endpointKey(command.endpoint);
          if (draft.candidateCircuit.nets.some(
            (item) => item.endpoints.some((endpoint) => endpointKey(endpoint) === key),
          )) return failure('PROJECT_CONTACT_REUSED_ENDPOINT', this.revision, [key]);
          net.endpoints.push(clone(command.endpoint));
          if (!draft.candidateCircuit.junctions.some((junction) => junction.net === command.netId)) {
            draft.candidateCircuit.junctions.push({ id: command.junctionId, net: command.netId });
          }
          runtimeDirty = true;
          break;
        }
        case 'component.move': {
          if (!exactCommand(command, ['componentId', 'x', 'y'])
              || !draft.candidateLayout.positions[command.componentId]) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateLayout.positions[command.componentId].x = command.x;
          draft.candidateLayout.positions[command.componentId].y = command.y;
          break;
        }
        case 'component.rotate': {
          if (!exactCommand(command, ['componentId', 'rotation'])
              || !draft.candidateLayout.positions[command.componentId]) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateLayout.positions[command.componentId].rotation = command.rotation;
          break;
        }
        case 'viewport.set': {
          if (!exactCommand(command, ['zoom', 'panX', 'panY'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateLayout.viewport = {
            zoom: command.zoom, panX: command.panX, panY: command.panY,
          };
          break;
        }
        case 'wire.route.family.set': {
          if (!exactCommand(command, ['netId', 'family'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          draft.candidateLayout.wireRoutes[command.netId] = clone(command.family);
          break;
        }
        case 'component.control.set': {
          if (!exactCommand(command, ['componentId', 'key', 'value'])) {
            return failure('EDITOR_COMMAND_SHAPE', this.revision);
          }
          const component = draft.candidateCircuit.components.find((item) => item.id === command.componentId);
          if (!component) return failure('EDITOR_COMPONENT_MISSING', this.revision);
          if (component.type === GROUND_REFERENCE_TYPE) {
            return failure('CANDIDATE_EDITOR_GROUND_IMMUTABLE', this.revision);
          }
          if (component.type === TOGGLE_SWITCH_TYPE) {
            if (command.key !== 'closed' || typeof command.value !== 'boolean') {
              return failure('PROJECT_CONTACT_SPST_STATE', this.revision);
            }
            component.controls.closed = command.value;
            const projected = draft.project.circuit.components.find((item) => item.id === component.id);
            if (projected && projected.type !== 'button.momentary-v1') {
              return failure('PROJECT_CONTACT_BASE_GRAPH_MISMATCH', this.revision);
            }
            if (projected) projected.controls.pressed = command.value;
            runtimeDirty = true;
            break;
          }
          if (component.type === SPDT_CONTACT_TYPE) {
            if (command.key !== 'selectedThrow' || !['A', 'B'].includes(command.value)) {
              return failure('PROJECT_CONTACT_SPDT_STATE', this.revision);
            }
            component.controls.selectedThrow = command.value;
            runtimeDirty = true;
            break;
          }
          if (component.type === LIGHT_ANALOGUE_SENSOR_TYPE) {
            if (command.key !== 'lightLevel' || !Number.isFinite(command.value)
                || command.value < 0 || command.value > 1) {
              return failure('PROJECT_CONTACT_LIGHT_SENSOR_STATE', this.revision);
            }
            component.controls.lightLevel = command.value;
            runtimeDirty = true;
            break;
          }
          if (component.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE) {
            if (command.key !== 'temperatureC' || !Number.isFinite(command.value)
                || command.value < TEMPERATURE_MIN_C || command.value > TEMPERATURE_MAX_C) {
              return failure('PROJECT_CONTACT_TEMPERATURE_SENSOR_STATE', this.revision);
            }
            component.controls.temperatureC = command.value;
            runtimeDirty = true;
            break;
          }
          if (component.type === DIGITAL_LIGHT_THRESHOLD_TYPE) {
            try {
              const updated = updateDigitalLightThresholdControl(component, command.key, command.value);
              component.controls = updated.controls;
            } catch {
              return failure('PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_STATE', this.revision);
            }
            runtimeDirty = true;
            break;
          }
          return failure('CANDIDATE_EDITOR_CONTROL_UNSUPPORTED', this.revision);
        }
        default:
          return failure('CANDIDATE_EDITOR_COMMAND_UNSUPPORTED', this.revision);
      }
      return this.#accept(draft, 'EDITOR_COMMITTED', {
        runtimeDirty,
        changeRelevance: command.type === 'component.control.set' ? 'runtime' : null,
      });
    } catch (error) {
      return failure(error.code ?? error.message ?? 'CANDIDATE_EDITOR_INVALID', this.revision, error.details ?? []);
    }
  }
}

export function openPortableEditorSession(source) {
  let value;
  try { value = parseStrictJson(source, CONTACT_PERSISTENCE_LIMIT); }
  catch (error) { return { ok: false, code: error.code ?? 'MALFORMED_JSON', details: [] }; }
  try {
    if (value?.schema === PROJECT_SCHEMA) {
      const validated = validateProjectV2(value);
      if (!validated.ok) return validated;
      return { ok: true, code: 'OK', kind: 'project-v2', session: new V2EditorSession(validated.project) };
    }
    if (value?.schema === CONTACT_PERSISTENCE_SCHEMA) {
      const validated = validateContactPersistenceDraft(value);
      if (!validated.ok) return validated;
      return {
        ok: true,
        code: 'OK',
        kind: 'candidate-project-v3',
        session: new CandidateEditorSession(validated.project),
      };
    }
    return { ok: false, code: 'PROJECT_VERSION', details: [value?.schema ?? null] };
  } catch (error) {
    return { ok: false, code: error.code ?? error.message ?? 'PROJECT_INVALID', details: error.details ?? [] };
  }
}
