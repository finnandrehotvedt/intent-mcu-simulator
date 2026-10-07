// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { explainError } from '../src/error-catalog.mjs';
import {
  LIFECYCLE_STATES,
  createLifecycleState,
  projectChangeRelevance,
  transitionLifecycle,
} from '../src/lifecycle.mjs';

const artifactIdentity = 'a'.repeat(64);
const inputIdentity = 'b'.repeat(64);

function buildReady(initial = createLifecycleState({ empty: false })) {
  const started = transitionLifecycle(initial, { type: 'build.start' });
  const succeeded = transitionLifecycle(started.state, {
    type: 'build.succeeded', binding: started.binding, artifactIdentity, inputIdentity,
  });
  return { state: succeeded.state, buildBinding: started.binding };
}

test('S-01 explicit lifecycle reaches every named state through legal events', () => {
  const observed = new Set();
  let state = createLifecycleState();
  observed.add(state.phase);
  state = transitionLifecycle(state, { type: 'project.install', empty: false, reason: 'new-demo' }).state;
  observed.add(state.phase);
  const build = transitionLifecycle(state, { type: 'build.start' });
  state = build.state; observed.add(state.phase);
  state = transitionLifecycle(state, {
    type: 'build.succeeded', binding: build.binding, artifactIdentity, inputIdentity,
  }).state;
  observed.add(state.phase);
  const loaded = transitionLifecycle(state, { type: 'runtime.load' });
  state = transitionLifecycle(loaded.state, { type: 'runtime.run' }).state;
  observed.add(state.phase);
  state = transitionLifecycle(state, { type: 'runtime.pause' }).state;
  observed.add(state.phase);
  state = transitionLifecycle(state, { type: 'project.edit', relevance: 'build', empty: false }).state;
  observed.add(state.phase);
  const failedBuild = transitionLifecycle(state, { type: 'build.start' });
  state = transitionLifecycle(failedBuild.state, {
    type: 'build.failed', binding: failedBuild.binding, diagnostics: [{ code: 'COMPILE' }],
  }).state;
  observed.add(state.phase);
  assert.deepEqual([...observed].sort(), [...LIFECYCLE_STATES].sort());
});

test('S-02 project replacement clears output and rejects delayed build and worker messages', () => {
  const ready = buildReady();
  const loaded = transitionLifecycle(ready.state, { type: 'runtime.load' });
  let state = transitionLifecycle(loaded.state, { type: 'runtime.run' }).state;
  state = transitionLifecycle(state, {
    type: 'runtime.message', binding: loaded.binding,
    message: {
      paused: false, cycle: 900, instructions: 450,
      instruments: { serial: { records: [{ text: 'old' }] }, logic: { transitions: [{ pin: 'D13' }] } },
      pins: [{ pin: 'D13' }], circuit: { leds: [{ componentId: 'old-led' }] },
    },
  }).state;
  const replacement = transitionLifecycle(state, { type: 'project.install', empty: true, reason: 'new-empty' });
  assert.equal(replacement.state.phase, 'empty');
  assert.equal(replacement.state.projectGeneration, state.projectGeneration + 1);
  assert.deepEqual(replacement.state.output, {
    cycle: 0, instructions: 0, serial: [], transitions: [], pins: [], visualOutputs: [],
  });
  assert.equal(replacement.state.artifact, null);
  assert.equal(replacement.state.runtimeBinding, null);
  assert.equal(transitionLifecycle(replacement.state, {
    type: 'runtime.message', binding: loaded.binding, message: { paused: false, cycle: 999 },
  }).code, 'LIFECYCLE_STALE_RUNTIME');
  assert.equal(transitionLifecycle(replacement.state, {
    type: 'build.succeeded', binding: ready.buildBinding, artifactIdentity, inputIdentity,
  }).code, 'LIFECYCLE_STALE_BUILD');
});

test('S-03 visual edits preserve a matching artifact while build inputs become stale', () => {
  const ready = buildReady().state;
  for (const type of ['wire.route.family.set', 'wire.style.set', 'component.move', 'component.rotate', 'viewport.set']) {
    assert.equal(projectChangeRelevance(type), 'visual');
    const visual = transitionLifecycle(ready, { type: 'project.edit', relevance: projectChangeRelevance(type) });
    assert.equal(visual.state.phase, 'ready');
    assert.equal(visual.state.artifact.artifactIdentity, artifactIdentity);
  }
  for (const type of ['source.set', 'wire.reconnect', 'wire.branch.delete', 'component.property.set']) {
    assert.equal(projectChangeRelevance(type), 'build');
  }
  const stale = transitionLifecycle(ready, { type: 'project.edit', relevance: 'build', empty: false });
  assert.equal(stale.state.phase, 'stale');
  assert.equal(stale.state.artifact, null);
  assert.equal(stale.state.staleArtifactIdentity, artifactIdentity);
});

test('S-04 errors lead with an action and retain bounded technical codes', () => {
  const graph = explainError('CONFLICTING_OUTPUTS', 'CONFLICTING_OUTPUTS net-signal');
  const build = explainError('BUILD_FAILED', 'main.ino:4: error');
  const runtime = explainError('WORKER_WATCHDOG', 'watchdog after 2000 ms');
  assert.match(graph.action, /Review the circuit/u);
  assert.match(build.action, /Fix the first compiler diagnostic/u);
  assert.match(runtime.action, /Reset it or rebuild/u);
  assert.equal(graph.code, 'CONFLICTING_OUTPUTS');
  assert.equal(build.technical, 'main.ino:4: error');
});
