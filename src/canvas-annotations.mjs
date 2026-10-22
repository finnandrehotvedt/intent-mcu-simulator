// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';
import { contractSubcircuits, emptySubcircuits, normalizeSubcircuits } from './bounded-subcircuits.mjs';

export const CANVAS_ANNOTATIONS_SCHEMA = 'intent-mcu-canvas-annotations@2';
export const LEGACY_CANVAS_ANNOTATIONS_SCHEMA = 'intent-mcu-canvas-annotations@1';
export const NET_LABELS_SCHEMA = 'intent-mcu-net-labels@1';
export const ANNOTATED_WORKSPACE_SCHEMA = 'intent-mcu-annotated-workspace@3';
export const PRE_SUBCIRCUIT_ANNOTATED_WORKSPACE_SCHEMA = 'intent-mcu-annotated-workspace@2';
export const LEGACY_ANNOTATED_WORKSPACE_SCHEMA = 'intent-mcu-annotated-workspace@1';
export const CANVAS_ANNOTATION_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, notes: 32, groups: 16,
  netLabels: 32, noteText: 1000, label: 80 });
const clone = (value) => structuredClone(value);
const fail = (code, details = []) => { throw Object.assign(new Error(code), { code, details }); };
const id = (value, path) => {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/u.test(value)) fail('CANVAS_ANNOTATION_ID', [path]);
  return value;
};
const text = (value, path, limit) => {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > limit
      || /[\u0000-\u001f\u007f]/u.test(value) || /<\/?[A-Za-z][^>]*>/u.test(value)) fail('CANVAS_ANNOTATION_TEXT', [path]);
  return value;
};
const point = (value, path) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) fail('CANVAS_ANNOTATION_POINT', [path]);
  return value;
};
export const emptyCanvasAnnotations = () => ({ schema: CANVAS_ANNOTATIONS_SCHEMA, notes: [], groups: [],
  netLabels: { schema: NET_LABELS_SCHEMA, labels: [] } });

function references(value) {
  if (Array.isArray(value)) return { componentIds: value, netIds: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !Array.isArray(value.componentIds) || !Array.isArray(value.netIds)) fail('CANVAS_ANNOTATION_REFERENCES');
  return { componentIds: value.componentIds, netIds: value.netIds };
}

export function normalizeCanvasAnnotations(value, availableReferences) {
  const { componentIds, netIds } = references(availableReferences);
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![CANVAS_ANNOTATIONS_SCHEMA, LEGACY_CANVAS_ANNOTATIONS_SCHEMA].includes(value.schema)
      || value.schema === LEGACY_CANVAS_ANNOTATIONS_SCHEMA && !exactKeys(value, ['schema', 'notes', 'groups'])
      || value.schema === CANVAS_ANNOTATIONS_SCHEMA && !exactKeys(value, ['schema', 'notes', 'groups', 'netLabels'])
      || !Array.isArray(value.notes) || value.notes.length > CANVAS_ANNOTATION_LIMITS.notes
      || !Array.isArray(value.groups) || value.groups.length > CANVAS_ANNOTATION_LIMITS.groups) fail('CANVAS_ANNOTATION_SHAPE');
  const allowed = new Set(componentIds);
  const allowedNets = new Set(netIds);
  const ids = new Set();
  const notes = value.notes.map((item, index) => {
    const path = `$notes[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item) || !exactKeys(item, ['id', 'text', 'x', 'y'])) fail('CANVAS_NOTE_SHAPE', [path]);
    const itemId = id(item.id, `${path}.id`); if (ids.has(itemId)) fail('CANVAS_ANNOTATION_DUPLICATE', [itemId]); ids.add(itemId);
    return { id: itemId, text: text(item.text, `${path}.text`, CANVAS_ANNOTATION_LIMITS.noteText), x: point(item.x, `${path}.x`), y: point(item.y, `${path}.y`) };
  });
  const groups = value.groups.map((item, index) => {
    const path = `$groups[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item) || !exactKeys(item, ['id', 'label', 'componentIds'])
        || !Array.isArray(item.componentIds) || !item.componentIds.length) fail('CANVAS_GROUP_SHAPE', [path]);
    const itemId = id(item.id, `${path}.id`); if (ids.has(itemId)) fail('CANVAS_ANNOTATION_DUPLICATE', [itemId]); ids.add(itemId);
    const members = new Set();
    for (const [memberIndex, member] of item.componentIds.entries()) {
      if (typeof member !== 'string' || !allowed.has(member)) fail('CANVAS_GROUP_DANGLING_COMPONENT', [path, member]);
      if (members.has(member)) fail('CANVAS_GROUP_DUPLICATE_COMPONENT', [path, memberIndex]); members.add(member);
    }
    return { id: itemId, label: text(item.label, `${path}.label`, CANVAS_ANNOTATION_LIMITS.label), componentIds: [...members].sort() };
  });
  const netLabelsValue = value.schema === LEGACY_CANVAS_ANNOTATIONS_SCHEMA
    ? { schema: NET_LABELS_SCHEMA, labels: [] } : value.netLabels;
  if (!netLabelsValue || typeof netLabelsValue !== 'object' || Array.isArray(netLabelsValue)
      || !exactKeys(netLabelsValue, ['schema', 'labels']) || netLabelsValue.schema !== NET_LABELS_SCHEMA
      || !Array.isArray(netLabelsValue.labels) || netLabelsValue.labels.length > CANVAS_ANNOTATION_LIMITS.netLabels) {
    fail('CANVAS_NET_LABELS_SHAPE');
  }
  const labels = netLabelsValue.labels.map((item, index) => {
    const path = `$netLabels.labels[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || !exactKeys(item, ['id', 'netId', 'text', 'x', 'y'])) fail('CANVAS_NET_LABEL_SHAPE', [path]);
    const itemId = id(item.id, `${path}.id`);
    if (ids.has(itemId)) fail('CANVAS_ANNOTATION_DUPLICATE', [itemId]);
    ids.add(itemId);
    if (typeof item.netId !== 'string' || !allowedNets.has(item.netId)) fail('CANVAS_NET_LABEL_DANGLING_NET', [path, item.netId]);
    return { id: itemId, netId: item.netId, text: text(item.text, `${path}.text`, CANVAS_ANNOTATION_LIMITS.label),
      x: point(item.x, `${path}.x`), y: point(item.y, `${path}.y`) };
  });
  return { schema: CANVAS_ANNOTATIONS_SCHEMA, notes, groups,
    netLabels: { schema: NET_LABELS_SCHEMA, labels } };
}

export class CanvasAnnotationReducer {
  #state; #past = []; #future = [];
  constructor(value = emptyCanvasAnnotations(), availableReferences = { componentIds: [], netIds: [] }) {
    this.#state = normalizeCanvasAnnotations(value, availableReferences);
  }
  snapshot() { return clone(this.#state); }
  #replace(next, availableReferences, record = true) {
    const normalized = normalizeCanvasAnnotations(next, availableReferences);
    if (JSON.stringify(normalized) === JSON.stringify(this.#state)) return { ok: true, changed: false, annotations: this.snapshot() };
    if (record) { this.#past.push(this.snapshot()); if (this.#past.length > 100) this.#past.shift(); this.#future = []; }
    this.#state = normalized; return { ok: true, changed: true, annotations: this.snapshot() };
  }
  restore(value, availableReferences) { return this.#replace(value, availableReferences, false); }
  apply(command, availableReferences) {
    if (!command || typeof command !== 'object' || Array.isArray(command) || typeof command.type !== 'string') fail('CANVAS_ANNOTATION_COMMAND');
    const next = this.snapshot();
    if (command.type === 'note.create') next.notes.push({ id: command.id, text: command.text, x: command.x, y: command.y });
    else if (command.type === 'note.edit') {
      const note = next.notes.find((item) => item.id === command.id); if (!note) fail('CANVAS_NOTE_MISSING');
      Object.assign(note, { text: command.text, x: command.x, y: command.y });
    } else if (command.type === 'note.remove') next.notes = next.notes.filter((item) => item.id !== command.id);
    else if (command.type === 'group.create') next.groups.push({ id: command.id, label: command.label, componentIds: [...command.componentIds] });
    else if (command.type === 'group.edit') {
      const group = next.groups.find((item) => item.id === command.id); if (!group) fail('CANVAS_GROUP_MISSING');
      Object.assign(group, { label: command.label, componentIds: [...command.componentIds] });
    } else if (command.type === 'group.remove') next.groups = next.groups.filter((item) => item.id !== command.id);
    else if (command.type === 'net-label.create') next.netLabels.labels.push({ id: command.id, netId: command.netId,
      text: command.text, x: command.x, y: command.y });
    else if (command.type === 'net-label.edit') {
      const label = next.netLabels.labels.find((item) => item.id === command.id); if (!label) fail('CANVAS_NET_LABEL_MISSING');
      Object.assign(label, { netId: command.netId, text: command.text, x: command.x, y: command.y });
    } else if (command.type === 'net-label.remove') {
      next.netLabels.labels = next.netLabels.labels.filter((item) => item.id !== command.id);
    } else if (command.type === 'references.reconcile' || command.type === 'components.reconcile') {
      const { componentIds, netIds } = references(availableReferences);
      const allowed = new Set(componentIds); const allowedNets = new Set(netIds);
      next.groups = next.groups.map((group) => ({ ...group, componentIds: group.componentIds.filter((member) => allowed.has(member)) }))
        .filter((group) => group.componentIds.length);
      next.netLabels.labels = next.netLabels.labels.filter((label) => allowedNets.has(label.netId));
    } else fail('CANVAS_ANNOTATION_COMMAND');
    return this.#replace(next, availableReferences);
  }
  undo(availableReferences) {
    if (!this.#past.length) return { ok: true, changed: false, annotations: this.snapshot() };
    const previous = normalizeCanvasAnnotations(this.#past.at(-1), availableReferences);
    this.#past.pop(); this.#future.push(this.snapshot()); this.#state = previous;
    return { ok: true, changed: true, annotations: this.snapshot() };
  }
  redo(availableReferences) {
    if (!this.#future.length) return { ok: true, changed: false, annotations: this.snapshot() };
    const next = normalizeCanvasAnnotations(this.#future.at(-1), availableReferences);
    this.#future.pop(); this.#past.push(this.snapshot()); this.#state = next;
    return { ok: true, changed: true, annotations: this.snapshot() };
  }
  history() { return Object.freeze({ undo: this.#past.length, redo: this.#future.length }); }
}

export function normalizeAnnotatedWorkspace(value, validateProject) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![ANNOTATED_WORKSPACE_SCHEMA, PRE_SUBCIRCUIT_ANNOTATED_WORKSPACE_SCHEMA,
        LEGACY_ANNOTATED_WORKSPACE_SCHEMA].includes(value.schema)) fail('ANNOTATED_WORKSPACE_NOT_MATCHED');
  const expectedKeys = value.schema === ANNOTATED_WORKSPACE_SCHEMA
    ? ['schema', 'profileId', 'project', 'annotations', 'subcircuits']
    : ['schema', 'profileId', 'project', 'annotations'];
  if (!exactKeys(value, expectedKeys) || typeof validateProject !== 'function') fail('ANNOTATED_WORKSPACE_SHAPE');
  const validated = validateProject(clone(value.project), value.profileId);
  if (!validated?.project || !validated.graph || !validated.modelLibrary
      || !Array.isArray(validated.componentIds) || !Array.isArray(validated.netIds)) fail('ANNOTATED_WORKSPACE_PROJECT');
  const subcircuits = value.schema === ANNOTATED_WORKSPACE_SCHEMA
    ? normalizeSubcircuits(value.subcircuits, { profileId: value.profileId, modelLibraryLock: validated.modelLibrary })
    : emptySubcircuits(validated.modelLibrary);
  contractSubcircuits(validated.graph, subcircuits,
    { profileId: value.profileId, modelLibraryLock: validated.modelLibrary });
  return { workspace: { schema: ANNOTATED_WORKSPACE_SCHEMA, profileId: value.profileId, project: clone(validated.project),
    annotations: normalizeCanvasAnnotations(value.annotations, validated), subcircuits }, prepared: validated.prepared ?? null };
}
export function parseAnnotatedWorkspace(source, validateProject) {
  return normalizeAnnotatedWorkspace(parseStrictJson(source, CANVAS_ANNOTATION_LIMITS.bytes), validateProject);
}
export function canonicalAnnotatedWorkspace(value, validateProject) {
  return `${JSON.stringify(normalizeAnnotatedWorkspace(value, validateProject).workspace, null, 2)}\n`;
}
