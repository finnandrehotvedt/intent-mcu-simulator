// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const CANVAS_ANNOTATIONS_SCHEMA = 'intent-mcu-canvas-annotations@1';
export const ANNOTATED_WORKSPACE_SCHEMA = 'intent-mcu-annotated-workspace@1';
export const CANVAS_ANNOTATION_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, notes: 32, groups: 16, noteText: 1000, label: 80 });
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
export const emptyCanvasAnnotations = () => ({ schema: CANVAS_ANNOTATIONS_SCHEMA, notes: [], groups: [] });

export function normalizeCanvasAnnotations(value, componentIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'notes', 'groups']) || value.schema !== CANVAS_ANNOTATIONS_SCHEMA
      || !Array.isArray(value.notes) || value.notes.length > CANVAS_ANNOTATION_LIMITS.notes
      || !Array.isArray(value.groups) || value.groups.length > CANVAS_ANNOTATION_LIMITS.groups) fail('CANVAS_ANNOTATION_SHAPE');
  const allowed = new Set(componentIds);
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
  return { schema: CANVAS_ANNOTATIONS_SCHEMA, notes, groups };
}

export class CanvasAnnotationReducer {
  #state; #past = []; #future = [];
  constructor(value = emptyCanvasAnnotations(), componentIds = []) { this.#state = normalizeCanvasAnnotations(value, componentIds); }
  snapshot() { return clone(this.#state); }
  #replace(next, componentIds, record = true) {
    const normalized = normalizeCanvasAnnotations(next, componentIds);
    if (JSON.stringify(normalized) === JSON.stringify(this.#state)) return { ok: true, changed: false, annotations: this.snapshot() };
    if (record) { this.#past.push(this.snapshot()); if (this.#past.length > 100) this.#past.shift(); this.#future = []; }
    this.#state = normalized; return { ok: true, changed: true, annotations: this.snapshot() };
  }
  restore(value, componentIds) { return this.#replace(value, componentIds, false); }
  apply(command, componentIds) {
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
    else if (command.type === 'components.reconcile') {
      const allowed = new Set(componentIds);
      next.groups = next.groups.map((group) => ({ ...group, componentIds: group.componentIds.filter((member) => allowed.has(member)) }))
        .filter((group) => group.componentIds.length);
    } else fail('CANVAS_ANNOTATION_COMMAND');
    return this.#replace(next, componentIds);
  }
  undo(componentIds) {
    if (!this.#past.length) return { ok: true, changed: false, annotations: this.snapshot() };
    const previous = this.#past.pop(); this.#future.push(this.snapshot()); this.#state = normalizeCanvasAnnotations(previous, componentIds);
    return { ok: true, changed: true, annotations: this.snapshot() };
  }
  redo(componentIds) {
    if (!this.#future.length) return { ok: true, changed: false, annotations: this.snapshot() };
    const next = this.#future.pop(); this.#past.push(this.snapshot()); this.#state = normalizeCanvasAnnotations(next, componentIds);
    return { ok: true, changed: true, annotations: this.snapshot() };
  }
  history() { return Object.freeze({ undo: this.#past.length, redo: this.#future.length }); }
}

export function normalizeAnnotatedWorkspace(value, validateProject) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== ANNOTATED_WORKSPACE_SCHEMA) fail('ANNOTATED_WORKSPACE_NOT_MATCHED');
  if (!exactKeys(value, ['schema', 'profileId', 'project', 'annotations']) || typeof validateProject !== 'function') fail('ANNOTATED_WORKSPACE_SHAPE');
  const validated = validateProject(clone(value.project), value.profileId);
  if (!validated?.project || !Array.isArray(validated.componentIds)) fail('ANNOTATED_WORKSPACE_PROJECT');
  return { workspace: { schema: ANNOTATED_WORKSPACE_SCHEMA, profileId: value.profileId, project: clone(validated.project),
    annotations: normalizeCanvasAnnotations(value.annotations, validated.componentIds) }, prepared: validated.prepared ?? null };
}
export function parseAnnotatedWorkspace(source, validateProject) {
  return normalizeAnnotatedWorkspace(parseStrictJson(source, CANVAS_ANNOTATION_LIMITS.bytes), validateProject);
}
export function canonicalAnnotatedWorkspace(value, validateProject) {
  return `${JSON.stringify(normalizeAnnotatedWorkspace(value, validateProject).workspace, null, 2)}\n`;
}
