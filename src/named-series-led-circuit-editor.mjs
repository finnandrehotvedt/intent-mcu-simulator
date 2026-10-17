// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const clone = (value) => structuredClone(value);

/**
 * Shared bounded editor state machine for the named controller -> resistor ->
 * LED -> ground teaching circuits. Electrical validation stays owned by each
 * controller profile; this class shares only transactional selection, layout,
 * topology deletion and history behavior.
 */
export class NamedSeriesLedCircuitEditor {
  constructor({ draft, normalize, validate, createDefault, fixedComponentType,
    codePrefix, historyLimit = 32 }) {
    this.normalize = normalize;
    this.validate = validate;
    this.createDefault = createDefault;
    this.fixedComponentType = fixedComponentType;
    this.codePrefix = codePrefix;
    this.historyLimit = historyLimit;
    this.draft = normalize(draft);
    this.selection = { kind: 'none' };
    this.history = [];
    this.future = [];
    this.revision = 0;
  }

  code(suffix) { return `${this.codePrefix}_${suffix}`; }

  snapshot() {
    return { draft: clone(this.draft), selection: clone(this.selection), revision: this.revision,
      canUndo: this.history.length > 0, canRedo: this.future.length > 0,
      validation: this.validate(this.draft) };
  }

  select(selection) {
    const next = selection?.kind === 'component' && this.draft.components.some((item) => item.id === selection.id)
      ? { kind: 'component', id: selection.id }
      : selection?.kind === 'net' && this.draft.nets.some((item) => item.id === selection.id)
        ? { kind: 'net', id: selection.id } : { kind: 'none' };
    this.selection = next;
    return this.snapshot();
  }

  commit(next, selection = { kind: 'none' }) {
    this.history.push(this.draft);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.future = [];
    this.draft = this.normalize(next);
    this.selection = clone(selection);
    this.revision += 1;
    return this.snapshot();
  }

  deleteSelected() {
    if (this.selection.kind === 'none') return { ok: false, code: this.code('SELECTION_REQUIRED'), ...this.snapshot() };
    if (this.selection.kind === 'component') {
      const selected = this.draft.components.find((item) => item.id === this.selection.id);
      if (selected?.type === this.fixedComponentType) {
        return { ok: false, code: this.code('BOARD_FIXED'), ...this.snapshot() };
      }
      const next = clone(this.draft);
      next.components = next.components.filter((item) => item.id !== this.selection.id);
      next.nets = next.nets.filter((net) => !net.endpoints.some((endpoint) => endpoint.component === this.selection.id));
      delete next.layout.positions[this.selection.id];
      for (const id of Object.keys(next.layout.wireStyles)) {
        if (!next.nets.some((net) => net.id === id)) delete next.layout.wireStyles[id];
      }
      return { ok: true, code: this.code('COMPONENT_DELETED'), ...this.commit(next) };
    }
    const next = clone(this.draft);
    next.nets = next.nets.filter((net) => net.id !== this.selection.id);
    delete next.layout.wireStyles[this.selection.id];
    return { ok: true, code: this.code('NET_DELETED'), ...this.commit(next) };
  }

  undo() {
    if (!this.history.length) return { ok: false, code: this.code('UNDO_EMPTY'), ...this.snapshot() };
    this.future.push(this.draft);
    if (this.future.length > this.historyLimit) this.future.shift();
    this.draft = this.history.pop();
    this.selection = { kind: 'none' };
    this.revision += 1;
    return { ok: true, code: this.code('UNDONE'), ...this.snapshot() };
  }

  redo() {
    if (!this.future.length) return { ok: false, code: this.code('REDO_EMPTY'), ...this.snapshot() };
    this.history.push(this.draft);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.draft = this.future.pop();
    this.selection = { kind: 'none' };
    this.revision += 1;
    return { ok: true, code: this.code('REDONE'), ...this.snapshot() };
  }

  moveComponent(id, x, y) {
    if (!this.draft.components.some((item) => item.id === id) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, code: this.code('COMPONENT_MOVE_INVALID'), ...this.snapshot() };
    }
    const next = clone(this.draft);
    next.layout.positions[id].x = Math.max(0.08, Math.min(0.92, x));
    next.layout.positions[id].y = Math.max(0.1, Math.min(0.9, y));
    return { ok: true, code: this.code('COMPONENT_MOVED'), ...this.commit(next, { kind: 'component', id }) };
  }

  rotateComponent(id) {
    if (!this.draft.components.some((item) => item.id === id)) {
      return { ok: false, code: this.code('COMPONENT_ROTATE_INVALID'), ...this.snapshot() };
    }
    const next = clone(this.draft);
    next.layout.positions[id].rotation = (next.layout.positions[id].rotation + 90) % 360;
    return { ok: true, code: this.code('COMPONENT_ROTATED'), ...this.commit(next, { kind: 'component', id }) };
  }

  restoreExample() {
    return { ok: true, code: this.code('EXAMPLE_RESTORED'), ...this.commit(this.createDefault()) };
  }
}
