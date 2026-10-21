// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  COMPONENT_APPEARANCE_SCHEMA,
  componentAppearanceInvariantReview,
  componentAppearanceInvariantSnapshot,
  normalizeComponentAppearance,
  resistorAppearancePreset,
} from '../src/component-appearance.mjs';
import { catalogType } from '../src/component-catalog.mjs';
import { validateCircuit } from '../src/circuit-engine.mjs';
import { createExampleProject } from '../src/example-projects.mjs';
import { ProjectEditorReducer, mergeCircuitProject } from '../src/project-editor.mjs';
import { canonicalProjectJson, parseProjectV2, validateProjectV2 } from '../src/project-v2.mjs';
import { CandidateEditorSession, openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { createTemperatureLcdThresholdExample } from '../expansion-drafts/temperature-lcd-threshold-example-v1.mjs';

const clone = (value) => structuredClone(value);
const appearance = (components = {}) => ({ schema: COMPONENT_APPEARANCE_SCHEMA, components });
const command = (session, value) => session.apply({ ...value, revision: session.revision });

test('X55 appearance data is finite, AVR-only, resistor-only and exact-key strict', () => {
  const project = validateProjectV2(createExampleProject('blink').project).project;
  const accepted = normalizeComponentAppearance(
    appearance({ 'resistor-1': { preset: 'cool-blue' } }), project.circuit,
  );
  assert.deepEqual(accepted, appearance({ 'resistor-1': { preset: 'cool-blue' } }));
  for (const rejected of [
    { ...appearance(), extra: true },
    appearance({ 'resistor-1': { preset: 'unknown' } }),
    appearance({ 'resistor-1': { preset: 'cool-blue', extra: true } }),
    appearance({ 'led-1': { preset: 'cool-blue' } }),
    appearance({ missing: { preset: 'cool-blue' } }),
  ]) assert.equal(normalizeComponentAppearance(rejected, project.circuit), null);

  for (const profile of ['board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1',
    'board.stm32f429zi-nucleo144-v1']) {
    const nonAvr = clone(project.circuit);
    nonAvr.components.find((item) => item.type.startsWith('board.')).type = profile;
    assert.equal(normalizeComponentAppearance(
      appearance({ 'resistor-1': { preset: 'cool-blue' } }), nonAvr,
    ), null, profile);
    assert.deepEqual(normalizeComponentAppearance(undefined, nonAvr), appearance(), profile);
  }
});

test('X55 preview and apply preserve pins, normalized world anchors, nets, model, ohms, source and position', () => {
  const project = validateProjectV2(createExampleProject('blink').project).project;
  const definition = catalogType('resistor.fixed-v1');
  const editor = new ProjectEditorReducer(project);
  for (const [rotation, x, y] of [[0, 0.22, 0.31], [90, 0.37, 0.41],
    [180, 0.52, 0.57], [270, 0.68, 0.64]]) {
    project.layout.positions['resistor-1'] = { x, y, rotation };
    const before = componentAppearanceInvariantSnapshot({
      componentId: 'resistor-1', graph: project.circuit, layout: project.layout,
      source: project.source, boardProfile: project.boardProfile, definition,
    });
    const preview = clone(project);
    preview.layout.componentAppearance = appearance({ 'resistor-1': { preset: 'cool-blue' } });
    const after = componentAppearanceInvariantSnapshot({
      componentId: 'resistor-1', graph: preview.circuit, layout: preview.layout,
      source: preview.source, boardProfile: preview.boardProfile, definition,
    });
    assert.deepEqual(componentAppearanceInvariantReview(before, after), {
      schema: 'intent-mcu-component-appearance-invariant@1', equal: true, changedFields: [],
    });
    assert.equal(before.pins.every((pin) => Number.isFinite(pin.normalizedWorldAnchor.x)
      && Number.isFinite(pin.normalizedWorldAnchor.y)), true);
  }
  const sourceBefore = clone(editor.project.source);
  const circuitBefore = clone(editor.project.circuit);
  const layoutBefore = clone(editor.project.layout);
  const applied = editor.apply({
    type: 'component.appearance.set', revision: 0,
    componentId: 'resistor-1', preset: 'cool-blue',
  }, { running: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.buildRelevant, false);
  assert.equal(applied.stopped, false);
  assert.deepEqual(applied.project.source, sourceBefore);
  assert.deepEqual(applied.project.circuit, circuitBefore);
  assert.deepEqual(applied.project.layout.positions, layoutBefore.positions);
  assert.equal(resistorAppearancePreset(applied.project.layout.componentAppearance, 'resistor-1'), 'cool-blue');
});

test('X55 visual history, duplicate, remove, merge and actual file Save/Open remain atomic', async () => {
  const project = validateProjectV2(createExampleProject('blink').project).project;
  const editor = new ProjectEditorReducer(project);
  assert.equal(editor.apply({ type: 'component.appearance.set', revision: 0,
    componentId: 'resistor-1', preset: 'cool-blue' }).ok, true);
  assert.equal(editor.apply({ type: 'component.duplicate', revision: 1,
    sourceId: 'resistor-1', newId: 'resistor-copy' }).ok, true);
  assert.equal(resistorAppearancePreset(editor.project.layout.componentAppearance, 'resistor-copy'), 'cool-blue');
  assert.equal(editor.apply({ type: 'undo', revision: 2 }).ok, true);
  assert.equal(editor.apply({ type: 'redo', revision: 3 }).ok, true);
  assert.equal(editor.apply({ type: 'component.remove', revision: 4,
    componentId: 'resistor-copy' }).ok, true);
  assert.equal(Object.hasOwn(editor.project.layout.componentAppearance.components, 'resistor-copy'), false);

  const incoming = validateProjectV2(createExampleProject('blink').project).project;
  incoming.layout.componentAppearance = appearance({ 'resistor-1': { preset: 'cool-blue' } });
  const merged = mergeCircuitProject(editor.project, incoming);
  const mapped = merged.report.componentIds['resistor-1'];
  assert.equal(resistorAppearancePreset(merged.project.layout.componentAppearance, mapped), 'cool-blue');

  const directory = await mkdtemp(join(tmpdir(), 'x55-appearance-'));
  const file = join(directory, 'project.intent-mcu.json');
  try {
    const saved = canonicalProjectJson(merged.project);
    await writeFile(file, saved, 'utf8');
    const reopened = parseProjectV2(await readFile(file, 'utf8'));
    assert.equal(reopened.ok, true);
    assert.equal(canonicalProjectJson(reopened.project), saved);
    const hostile = JSON.parse(saved);
    hostile.layout.componentAppearance.components[mapped].authority = 'runtime';
    const bytesBefore = await readFile(file, 'utf8');
    assert.equal(parseProjectV2(JSON.stringify(hostile)).ok, false);
    assert.equal(await readFile(file, 'utf8'), bytesBefore);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('X55 candidate draft history and actual portable file roundtrip preserve appearance without runtime dirtiness', async () => {
  const session = new CandidateEditorSession(createTemperatureLcdThresholdExample().project);
  const sourceBefore = clone(session.project.source);
  const circuitBefore = clone(session.project.circuit);
  const applied = command(session, {
    type: 'component.appearance.set', componentId: 'resistor-red', preset: 'cool-blue',
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.runtimeDirty, false);
  assert.equal(applied.changeRelevance, 'visual');
  assert.deepEqual(session.project.source, sourceBefore);
  assert.deepEqual(session.project.circuit, circuitBefore);
  assert.equal(command(session, { type: 'component.duplicate', sourceId: 'resistor-red',
    newId: 'resistor-red-copy' }).ok, true);
  assert.equal(resistorAppearancePreset(session.project.layout.componentAppearance,
    'resistor-red-copy'), 'cool-blue');
  assert.equal(command(session, { type: 'undo' }).ok, true);
  assert.equal(command(session, { type: 'redo' }).ok, true);
  const directory = await mkdtemp(join(tmpdir(), 'x55-candidate-'));
  const file = join(directory, 'candidate.intent-mcu.json');
  try {
    await writeFile(file, session.saveText(), 'utf8');
    const opened = openPortableEditorSession(await readFile(file, 'utf8'));
    assert.equal(opened.ok, true);
    assert.equal(resistorAppearancePreset(opened.session.project.layout.componentAppearance,
      'resistor-red'), 'cool-blue');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('X55 appearance cannot alter a deterministic disconnected-wire diagnostic', () => {
  const project = validateProjectV2(createExampleProject('blink').project).project;
  const disconnected = clone(project.circuit);
  const removed = disconnected.nets.find((net) => net.endpoints.some(
    (endpoint) => endpoint.component === 'resistor-1' && endpoint.pin === 'B',
  ));
  disconnected.nets = disconnected.nets.filter((net) => net.id !== removed.id);
  const before = validateCircuit(disconnected);
  assert.equal(before.ok, false);
  const disconnectedProject = clone(project);
  disconnectedProject.circuit = disconnected;
  delete disconnectedProject.layout.wireRoutes[removed.id];
  delete disconnectedProject.layout.wireStyles[removed.id];
  const editor = new ProjectEditorReducer(disconnectedProject);
  const applied = editor.apply({ type: 'component.appearance.set', revision: 0,
    componentId: 'resistor-1', preset: 'cool-blue' });
  assert.equal(applied.ok, true);
  const after = validateCircuit(applied.project.circuit);
  assert.equal(after.code, before.code);
  assert.deepEqual(after.diagnostics, before.diagnostics);
});
