// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const LIFECYCLE_SCHEMA = 'intent-mcu-lifecycle@1';
export const LIFECYCLE_STATES = Object.freeze([
  'empty', 'editing', 'building', 'ready', 'running', 'paused', 'failed', 'stale',
]);

const clone = (value) => structuredClone(value);

export function emptyRuntimeOutput() {
  return {
    cycle: 0,
    instructions: 0,
    serial: [],
    transitions: [],
    pins: [],
    visualOutputs: [],
  };
}

export function createLifecycleState({ empty = true, projectGeneration = 1 } = {}) {
  if (!Number.isInteger(projectGeneration) || projectGeneration < 1) throw new TypeError('LIFECYCLE_GENERATION');
  return {
    schema: LIFECYCLE_SCHEMA,
    phase: empty ? 'empty' : 'editing',
    projectGeneration,
    buildGeneration: 0,
    runtimeGeneration: 0,
    activeBuild: null,
    artifact: null,
    staleArtifactIdentity: null,
    runtimeBinding: null,
    diagnostics: [],
    output: emptyRuntimeOutput(),
    lastEvent: 'initialized',
  };
}

function accepted(state, extra = {}) {
  return { accepted: true, state, ...extra };
}

function ignored(state, code) {
  return { accepted: false, code, state };
}

function sameBuild(left, right) {
  return left && right
    && left.projectGeneration === right.projectGeneration
    && left.buildGeneration === right.buildGeneration
    && left.requestId === right.requestId;
}

function sameRuntime(left, right) {
  return left && right
    && left.projectGeneration === right.projectGeneration
    && left.runtimeGeneration === right.runtimeGeneration
    && left.artifactIdentity === right.artifactIdentity;
}

export function projectChangeRelevance(commandType) {
  if (typeof commandType !== 'string') throw new TypeError('LIFECYCLE_COMMAND');
  if (
    commandType.startsWith('source.')
    || commandType.startsWith('wire.create')
    || commandType.startsWith('wire.branch')
    || commandType.startsWith('wire.reconnect')
    || commandType.startsWith('wire.delete')
    || commandType.startsWith('junction.')
    || ['component.add', 'component.duplicate', 'component.remove', 'component.property.set', 'board.profile.set'].includes(commandType)
  ) return 'build';
  if (
    commandType.startsWith('wire.route.')
    || commandType === 'wire.style.set'
    || commandType === 'component.move'
    || commandType === 'component.rotate'
    || commandType === 'project.rename'
    || commandType === 'viewport.set'
  ) return 'visual';
  if (commandType === 'component.control.set') return 'runtime';
  return 'build';
}

export function transitionLifecycle(current, event) {
  if (!current || current.schema !== LIFECYCLE_SCHEMA || !event || typeof event.type !== 'string') {
    throw new TypeError('LIFECYCLE_EVENT');
  }
  const state = clone(current);
  switch (event.type) {
    case 'project.install': {
      state.projectGeneration += 1;
      state.buildGeneration += 1;
      state.runtimeGeneration += 1;
      state.phase = event.empty ? 'empty' : 'editing';
      state.activeBuild = null;
      state.artifact = null;
      state.staleArtifactIdentity = null;
      state.runtimeBinding = null;
      state.diagnostics = [];
      state.output = emptyRuntimeOutput();
      state.lastEvent = event.reason ?? 'project.install';
      return accepted(state);
    }
    case 'project.edit': {
      if (!['build', 'visual', 'runtime'].includes(event.relevance)) throw new TypeError('LIFECYCLE_RELEVANCE');
      if (event.relevance !== 'build') {
        state.lastEvent = `${event.relevance}.edit`;
        return accepted(state);
      }
      state.buildGeneration += 1;
      state.runtimeGeneration += 1;
      state.activeBuild = null;
      state.staleArtifactIdentity = state.artifact?.artifactIdentity ?? state.staleArtifactIdentity;
      state.artifact = null;
      state.runtimeBinding = null;
      state.diagnostics = [];
      state.output = emptyRuntimeOutput();
      state.phase = state.staleArtifactIdentity ? 'stale' : (event.empty ? 'empty' : 'editing');
      state.lastEvent = 'build-input.edit';
      return accepted(state);
    }
    case 'build.start': {
      if (state.phase === 'empty') return ignored(current, 'LIFECYCLE_EMPTY_PROJECT');
      state.buildGeneration += 1;
      state.runtimeGeneration += 1;
      const binding = {
        projectGeneration: state.projectGeneration,
        buildGeneration: state.buildGeneration,
        requestId: `build-${state.projectGeneration}-${state.buildGeneration}`,
      };
      state.phase = 'building';
      state.activeBuild = binding;
      state.artifact = null;
      state.runtimeBinding = null;
      state.diagnostics = [];
      state.output = emptyRuntimeOutput();
      state.lastEvent = 'build.start';
      return accepted(state, { binding: clone(binding) });
    }
    case 'build.succeeded': {
      if (!sameBuild(state.activeBuild, event.binding)) return ignored(current, 'LIFECYCLE_STALE_BUILD');
      if (!/^[0-9a-f]{64}$/u.test(event.artifactIdentity ?? '') || !/^[0-9a-f]{64}$/u.test(event.inputIdentity ?? '')) {
        throw new TypeError('LIFECYCLE_ARTIFACT');
      }
      state.phase = 'ready';
      state.activeBuild = null;
      state.artifact = {
        projectGeneration: state.projectGeneration,
        buildGeneration: state.buildGeneration,
        artifactIdentity: event.artifactIdentity,
        inputIdentity: event.inputIdentity,
      };
      state.staleArtifactIdentity = null;
      state.diagnostics = Array.isArray(event.diagnostics) ? clone(event.diagnostics) : [];
      state.lastEvent = 'build.succeeded';
      return accepted(state);
    }
    case 'build.failed': {
      if (!sameBuild(state.activeBuild, event.binding)) return ignored(current, 'LIFECYCLE_STALE_BUILD');
      state.phase = 'failed';
      state.activeBuild = null;
      state.artifact = null;
      state.runtimeBinding = null;
      state.diagnostics = Array.isArray(event.diagnostics) ? clone(event.diagnostics) : [];
      state.lastEvent = 'build.failed';
      return accepted(state);
    }
    case 'runtime.load': {
      if (state.phase !== 'ready' || !state.artifact) return ignored(current, 'LIFECYCLE_ARTIFACT_REQUIRED');
      state.runtimeGeneration += 1;
      const binding = {
        projectGeneration: state.projectGeneration,
        runtimeGeneration: state.runtimeGeneration,
        artifactIdentity: state.artifact.artifactIdentity,
      };
      state.runtimeBinding = binding;
      state.output = emptyRuntimeOutput();
      state.lastEvent = 'runtime.load';
      return accepted(state, { binding: clone(binding) });
    }
    case 'runtime.run':
      if (!state.runtimeBinding || !['ready', 'paused'].includes(state.phase)) return ignored(current, 'LIFECYCLE_RUNTIME_NOT_READY');
      state.phase = 'running';
      state.lastEvent = 'runtime.run';
      return accepted(state);
    case 'runtime.pause':
      if (!state.runtimeBinding || state.phase !== 'running') return ignored(current, 'LIFECYCLE_RUNTIME_NOT_RUNNING');
      state.phase = 'paused';
      state.lastEvent = 'runtime.pause';
      return accepted(state);
    case 'runtime.message': {
      if (!sameRuntime(state.runtimeBinding, event.binding)) return ignored(current, 'LIFECYCLE_STALE_RUNTIME');
      const message = event.message ?? {};
      if (message.kind === 'error' || message.kind === 'stopped-error') state.phase = 'failed';
      else if (message.kind === 'ready') state.phase = 'ready';
      else if (message.paused === true) state.phase = 'paused';
      else if (message.paused === false) state.phase = 'running';
      state.output = {
        cycle: Number.isFinite(message.cycle) ? message.cycle : state.output.cycle,
        instructions: Number.isFinite(message.instructions) ? message.instructions : state.output.instructions,
        serial: clone(message.instruments?.serial?.records ?? state.output.serial),
        transitions: clone(message.instruments?.logic?.transitions ?? message.trace ?? state.output.transitions),
        pins: clone(message.pins ?? state.output.pins),
        visualOutputs: clone(message.circuit?.leds ?? state.output.visualOutputs),
      };
      state.lastEvent = 'runtime.message';
      return accepted(state);
    }
    case 'runtime.stop':
      state.runtimeGeneration += 1;
      state.runtimeBinding = null;
      state.output = emptyRuntimeOutput();
      state.phase = state.artifact ? 'ready' : (event.stale ? 'stale' : (event.empty ? 'empty' : 'editing'));
      state.lastEvent = event.reason ?? 'runtime.stop';
      return accepted(state);
    default:
      throw new TypeError('LIFECYCLE_EVENT_UNKNOWN');
  }
}
