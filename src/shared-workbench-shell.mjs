// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  AVR_PROFILE,
  ESP32C3_PROFILE,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
} from './compile-targets.mjs';
import { instrumentCapability } from './instrument-capabilities.mjs';
import {
  createX42DigitalEdgeTriggerCapture,
  X42_CAPTURE_ROW_LIMIT,
  X42_OBSERVED_AFTER_ARM_LIMIT,
  X42_OBSERVER_INTERVAL_MS,
  X42_POST_EDGE_COUNT,
  X42_PRE_EDGE_COUNT,
  x42TriggerAvailability,
} from './x42-digital-edge-trigger-capture.mjs';
import {
  createX43AvrObservationProfile,
  projectX43AvrObservationStatus,
  x43VirtualNanosecondsText,
} from './x43-avr-observation-profile.mjs';
import { validateX43AvrStackSnapshot } from './x43-avr-stack-profile.mjs';
import {
  captureX47PulseSource,
  canonicalX47PulseText,
  createX47PulseContextFromSource,
  createX47PulsePreviewOwner,
  createX47PulseRecord,
  expandX47PulseRecord,
  inspectX47AvrD2Target,
  x47PulseSourceMatches,
} from './x47-avr-d2-pulse.mjs';
import { parseStrictJson } from './strict-json.mjs';
import {
  canonicalX47RepeatableText,
  createX47RepeatableContext,
  createX47RepeatableRecord,
} from './x47-repeatable-inputs.mjs';
import {
  createX49ProjectionOwner,
  X49_CASES,
  X49_OFFSET_LIMITS,
  X49_VIRTUAL_WINDOW,
} from './x49-sensor-offset.mjs';
import {
  calculateX49PublicPreview,
  createX49PublicAuthoringOwner,
  X49_PUBLIC_NATIVE_OFFSET,
} from './x49-public-authoring.mjs';
import { createX49PublicRunner } from './x49-public-runner.mjs';
import {
  X48_NOMINAL_TICK_CYCLES,
  X48_TICK_COUNT,
} from './x48-ideal-room-plant.mjs';

export const SHARED_WORKBENCH_SCHEMA = 'intent-mcu-shared-workbench@1';
export const SHARED_WORKBENCH_SURFACES = Object.freeze([
  'project', 'parts', 'canvas', 'inspector', 'source', 'runtime', 'serial',
]);
export const SHARED_WORKBENCH_DIALOGS = Object.freeze([
  'project', 'parts', 'inspector', 'firmware', 'brief', 'instruments', 'help',
]);
export const SHARED_WORKBENCH_VIEW_MODES = Object.freeze(['simple', 'advanced']);

const adapters = Object.freeze({
  [AVR_PROFILE]: Object.freeze({
    profile: AVR_PROFILE, groupId: 'architecture.avr-v1', groupLabel: 'AVR',
    root: '#workbench-workspace',
    project: '.project-bar',
    parts: '.catalog',
    canvas: '.board-card',
    inspector: '.inspector',
    source: '#firmware-drawer',
    runtime: '#runtime-drawer',
    serial: '#serial-dock',
    pause: Object.freeze({ supported: true, reason: '' }),
    reset: Object.freeze({ supported: true, reason: '' }),
  }),
  [RP2040_PROFILE]: Object.freeze({
    profile: RP2040_PROFILE, groupId: 'architecture.rp2040-v1', groupLabel: 'RP2040',
    root: '#pico-public-workbench', grid: '.pico-public-grid',
    project: '.pico-project-actions', parts: '.bounded-parts-panel',
    canvas: '.pico-circuit-pane', inspector: '#pico-part-properties',
    source: '.pico-project-pane', runtime: '.pico-runtime-actions',
    serial: '.pico-serial-card', prefix: 'pico',
    pause: Object.freeze({ supported: true, reason: '' }),
    reset: Object.freeze({ supported: true, reason: '' }),
  }),
  [ESP32C3_PROFILE]: Object.freeze({
    profile: ESP32C3_PROFILE, groupId: 'architecture.esp32-v1', groupLabel: 'ESP32',
    root: '#c3-public-workbench', grid: '.c3-public-grid',
    project: '.c3-project-actions', parts: '.bounded-parts-panel',
    canvas: '.c3-circuit-pane', inspector: '#c3-part-properties',
    source: '.c3-project-pane', runtime: '.c3-runtime-actions',
    serial: '.c3-terminal-card', prefix: 'c3',
    pause: Object.freeze({ supported: false, reason: 'Pause is unavailable for the bounded QEMU run.' }),
    reset: Object.freeze({ supported: false, reason: 'Reset replay is already verified inside each QEMU Run.' }),
  }),
  [STM32F429ZI_PROFILE]: Object.freeze({
    profile: STM32F429ZI_PROFILE, groupId: 'architecture.stm32-v1', groupLabel: 'STM32',
    root: '#stm32-public-workbench', grid: '.stm32-public-grid',
    project: '.stm32-project-actions', parts: '.bounded-parts-panel',
    canvas: '.stm32-circuit-pane', inspector: '#stm32-part-properties',
    source: '.stm32-project-pane', runtime: '.stm32-runtime-actions',
    serial: '.stm32-terminal-card', prefix: 'stm32',
    pause: Object.freeze({ supported: false, reason: 'Pause is unavailable for the isolated Renode run.' }),
    reset: Object.freeze({ supported: true, reason: '' }),
  }),
});

export function sharedWorkbenchAdapter(profile) {
  const adapter = adapters[profile];
  return adapter ? structuredClone({ schema: SHARED_WORKBENCH_SCHEMA, surfaces: SHARED_WORKBENCH_SURFACES, ...adapter }) : null;
}

export function sharedWorkbenchAdapters() {
  return [AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE]
    .map(sharedWorkbenchAdapter);
}

function labelSurface(node, name) {
  if (node) node.dataset.sharedSurface = name;
  return node;
}

function sharedResizer(document, name, variable, direction) {
  const handle = document.createElement('div');
  handle.className = 'shared-panel-resizer';
  handle.dataset.sharedResizer = name;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('tabindex', '0');
  handle.setAttribute('aria-label', `Resize ${name === 'parts' ? 'Parts' : 'Inspector'} panel`);
  const resize = (start, delta) => {
    const width = Math.max(210, Math.min(430, start + delta * direction));
    document.documentElement.style.setProperty(variable, `${width}px`);
  };
  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    drag = { id: event.pointerId, x: event.clientX,
      width: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(variable)) };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (drag?.id === event.pointerId) resize(drag.width, event.clientX - drag.x);
  });
  const finish = () => { drag = null; };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const width = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(variable));
    resize(width, (event.key === 'ArrowRight' ? 16 : -16));
  });
  return handle;
}

function installCanvasFullscreen(document, root, canvas, prefix) {
  const button = root.querySelector(`#${prefix}-fullscreen`);
  if (!button) throw new Error(`SHARED_WORKBENCH_FULLSCREEN_MISSING:${prefix}`);
  const fallbackClass = 'shared-canvas-focus';
  const active = () => document.fullscreenElement === canvas || root.classList.contains(fallbackClass);
  const render = () => {
    const expanded = active();
    button.textContent = expanded ? 'Exit fullscreen' : 'Fullscreen';
    button.setAttribute('aria-pressed', String(expanded));
    button.setAttribute('aria-label', expanded ? 'Exit fullscreen canvas' : 'Open canvas fullscreen');
    canvas.setAttribute('aria-expanded', String(expanded));
  };
  const closeFallback = () => {
    root.classList.remove(fallbackClass);
    document.body.classList.remove('shared-canvas-focus-open');
    render();
  };
  button.addEventListener('click', async () => {
    if (document.fullscreenElement === canvas) {
      await document.exitFullscreen();
      render();
      return;
    }
    if (root.classList.contains(fallbackClass)) {
      closeFallback();
      return;
    }
    try {
      if (typeof canvas.requestFullscreen !== 'function') throw new Error('FULLSCREEN_API_UNAVAILABLE');
      await canvas.requestFullscreen();
      render();
    } catch {
      root.classList.add(fallbackClass);
      document.body.classList.add('shared-canvas-focus-open');
      canvas.focus({ preventScroll: true });
      render();
    }
  });
  document.addEventListener('fullscreenchange', render);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains(fallbackClass)) closeFallback();
  });
  render();
}

function mountNarrowProfile(document, adapter) {
  const root = document.querySelector(adapter.root);
  const grid = root?.querySelector(adapter.grid);
  if (!root || !grid || root.dataset.sharedMounted === 'true') return root;
  root.dataset.sharedMounted = 'true';
  root.dataset.sharedProfile = adapter.profile;
  root.classList.add('shared-profile-workbench');
  grid.classList.add('shared-profile-grid');

  const parts = labelSurface(root.querySelector(adapter.parts), 'parts');
  const canvas = labelSurface(root.querySelector(adapter.canvas), 'canvas');
  const source = labelSurface(root.querySelector(adapter.source), 'source');
  const project = labelSurface(root.querySelector(adapter.project), 'project');
  const runtime = labelSurface(root.querySelector(adapter.runtime), 'runtime');
  const serial = labelSurface(root.querySelector(adapter.serial), 'serial');
  const properties = root.querySelector(adapter.inspector);
  if (!parts || !canvas || !source || !project || !runtime || !serial || !properties) {
    throw new Error(`SHARED_WORKBENCH_SURFACE_MISSING:${adapter.profile}`);
  }

  const inspector = document.createElement('aside');
  inspector.id = `${adapter.prefix}-shared-inspector`;
  inspector.className = 'shared-inspector-surface';
  inspector.dataset.sharedSurface = 'inspector';
  inspector.setAttribute('aria-label', `${adapter.profile} component inspector`);
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = '3 · INSPECTOR';
  const heading = document.createElement('h2');
  heading.textContent = 'Selected part';
  const connections = document.createElement('div');
  connections.dataset.accessibleConnections = '';
  connections.dataset.connectionProfile = adapter.profile;
  inspector.append(eyebrow, heading, properties, connections);

  const name = root.querySelector(`#${adapter.prefix}-project-name`);
  const nameLabel = root.querySelector(`label[for="${adapter.prefix}-project-name"]`);
  const projectBar = document.createElement('section');
  projectBar.className = 'shared-project-bar';
  projectBar.dataset.sharedSurface = 'project';
  projectBar.setAttribute('aria-label', `${adapter.profile} project controls`);
  project.removeAttribute('data-shared-surface');
  const projectHeading = document.createElement('div');
  projectHeading.className = 'shared-project-heading';
  const projectEyebrow = document.createElement('p');
  projectEyebrow.className = 'eyebrow';
  projectEyebrow.textContent = 'LOCAL PROJECT';
  projectHeading.append(projectEyebrow, nameLabel, name);
  projectBar.append(projectHeading, project);

  const build = root.querySelector(`#${adapter.prefix}-build`);
  const buildControls = document.createElement('div');
  buildControls.className = 'build-controls shared-build-controls';
  buildControls.append(build);
  source.append(buildControls);

  const runtimePanel = document.createElement('section');
  runtimePanel.className = 'shared-runtime-surface';
  runtimePanel.dataset.sharedSurface = 'runtime';
  runtime.removeAttribute('data-shared-surface');
  const message = root.querySelector(`#${adapter.prefix}-message`);
  const identities = root.querySelector(`.${adapter.prefix}-identities`);
  const capability = instrumentCapability(adapter.profile);
  const boundary = document.createElement('section');
  boundary.className = 'instrument-boundary';
  boundary.dataset.instrumentProfile = adapter.profile;
  boundary.dataset.instrumentStatus = 'bounded-profile';
  boundary.setAttribute('aria-label', `${capability.label} instrument boundary`);
  const boundaryHeading = document.createElement('div');
  boundaryHeading.className = 'instrument-boundary-heading';
  const boundaryEyebrow = document.createElement('p');
  boundaryEyebrow.className = 'eyebrow';
  boundaryEyebrow.textContent = 'RECORDED INSTRUMENT BOUNDARY';
  const boundaryTitle = document.createElement('h3');
  boundaryTitle.textContent = capability.label;
  boundaryHeading.append(boundaryEyebrow, boundaryTitle);
  const boundaryList = document.createElement('dl');
  boundaryList.className = 'instrument-boundary-list';
  for (const [name, item] of Object.entries({ Serial: capability.serial, Pins: capability.pin, Logic: capability.logic, Inputs: capability.input })) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = name;
    detail.dataset.instrument = name.toLowerCase();
    detail.dataset.status = item.status;
    detail.textContent = item.status === 'unavailable'
      ? `Unavailable — ${item.reason}`
      : `${item.status === 'output-only' ? 'Output only' : 'Recorded'} — ${item.source}${item.reason ? ` · ${item.reason}` : ''}`;
    row.append(term, detail);
    boundaryList.append(row);
  }
  const liveHeading = document.createElement('div');
  liveHeading.className = 'instrument-summary-heading';
  const liveTitle = document.createElement('strong');
  liveTitle.textContent = 'Current-generation summary';
  const liveState = document.createElement('span');
  liveState.dataset.instrumentSummaryState = '';
  liveState.textContent = 'No current runtime';
  liveHeading.append(liveTitle, liveState);
  const liveList = document.createElement('dl');
  liveList.className = 'instrument-summary-list';
  liveList.dataset.instrumentSummary = '';
  for (const channel of ['serial', 'gpio', 'logic', 'input']) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = channel;
    detail.dataset.instrumentSummaryChannel = channel;
    detail.textContent = 'unavailable · no current runtime';
    row.append(term, detail);
    liveList.append(row);
  }
  const sharedTools = document.createElement('div');
  sharedTools.className = 'shared-instrument-tools';
  sharedTools.dataset.sharedInstrumentTools = '';
  sharedTools.innerHTML = `
    <section class="shared-serial-view" aria-label="Shared Serial output viewer">
      <div class="shared-instrument-tool-heading"><strong>Serial output</strong><span data-shared-serial-classification>unavailable</span></div>
      <pre data-shared-serial-output aria-live="polite">No current Serial output.</pre>
      <p data-shared-serial-meta>No current source-bound runtime.</p>
      <div class="shared-instrument-actions"><button type="button" data-shared-serial-clear disabled>Clear view</button><button type="button" data-shared-serial-export aria-describedby="${adapter.prefix}-shared-export-description" disabled>Export full log (.txt)</button><span id="${adapter.prefix}-shared-export-description" class="sr-only">Exports the current retained accepted log, including rows hidden by Clear view.</span></div>
    </section>
    <section class="shared-pin-view" aria-label="Shared pin inspector">
      <div class="shared-instrument-tool-heading"><strong>Pin inspector</strong><span data-shared-pin-classification>unavailable</span></div>
      <label>Observed pin <select data-shared-pin-select disabled><option value="">Unavailable</option></select></label>
      <dl data-shared-pin-fields></dl>
      <p data-shared-pin-provenance>No current source-bound pin evidence.</p>
    </section>
    <section class="shared-trace-view" aria-label="Shared runtime trace viewer">
      <div class="shared-instrument-tool-heading"><strong>Runtime trace</strong><span data-shared-trace-classification>unavailable</span></div>
      <label>Channel <select data-shared-trace-select disabled><option value="">Unavailable</option></select></label>
      <p data-shared-trace-axis>No verified timebase.</p>
      <ol data-shared-trace-records><li>No current source-bound trace.</li></ol>
      <p data-shared-trace-retention>Retention unavailable.</p>
      <p data-shared-trace-provenance>No verified trace producer.</p>
    </section>`;
  boundary.append(boundaryHeading, boundaryList, liveHeading, liveList, sharedTools);
  runtimePanel.append(runtime, message, identities, boundary, serial);

  const sourceDrawer = document.createElement('details');
  sourceDrawer.className = 'workbench-drawer shared-workbench-drawer';
  sourceDrawer.open = true;
  const sourceSummary = document.createElement('summary');
  sourceSummary.textContent = 'Firmware editor';
  sourceDrawer.append(sourceSummary, source);
  const runtimeDrawer = document.createElement('details');
  runtimeDrawer.className = 'workbench-drawer shared-workbench-drawer';
  runtimeDrawer.open = true;
  const runtimeSummary = document.createElement('summary');
  runtimeSummary.textContent = 'Firmware runtime and instruments';
  runtimeDrawer.append(runtimeSummary, runtimePanel);

  const partsResizer = sharedResizer(document, 'parts', '--catalog-width', 1);
  const inspectorResizer = sharedResizer(document, 'inspector', '--inspector-width', -1);

  grid.replaceChildren(parts, partsResizer, canvas, inspectorResizer, inspector);
  root.insertBefore(projectBar, grid);
  root.append(sourceDrawer, runtimeDrawer);
  source.classList.add('shared-source-surface');
  canvas.classList.add('shared-canvas-surface');
  parts.classList.add('shared-parts-surface');
  project.classList.add('shared-project-tools');
  runtime.classList.add('shared-runtime-tools');
  serial.classList.add('shared-serial-surface');
  canvas.setAttribute('tabindex', '-1');
  installCanvasFullscreen(document, root, canvas, adapter.prefix);
  return root;
}

function mountLegacySharedWorkbenchShell(document) {
  for (const adapter of sharedWorkbenchAdapters().filter((item) => item.profile !== AVR_PROFILE)) {
    mountNarrowProfile(document, adapter);
  }
  const roots = new Map(sharedWorkbenchAdapters().map((adapter) => [adapter.profile, document.querySelector(adapter.root)]));
  let activeProfile = AVR_PROFILE;
  return Object.freeze({
    activate(profile) {
      if (!roots.has(profile)) throw new Error('SHARED_WORKBENCH_PROFILE_UNKNOWN');
      activeProfile = profile;
      document.body.dataset.activeProfile = profile;
      for (const [key, root] of roots) {
        root?.classList.toggle('shared-active-profile', key === profile);
        root?.setAttribute('aria-hidden', String(key !== profile));
      }
    },
    toggle(surface) {
      if (!['parts', 'inspector'].includes(surface)) throw new Error('SHARED_WORKBENCH_TOGGLE_UNKNOWN');
      const root = roots.get(activeProfile);
      if (!root) return false;
      const collapsed = root.classList.toggle(`${surface}-collapsed`);
      root.querySelector(`[data-shared-surface="${surface}"]`)?.setAttribute('aria-hidden', String(collapsed));
      return collapsed;
    },
    openSerial() {
      const root = roots.get(activeProfile);
      const serial = root?.querySelector('[data-shared-surface="serial"]');
      const drawer = serial?.closest('details');
      if (!serial || !drawer) return false;
      drawer.open = true;
      serial.setAttribute('tabindex', '-1');
      serial.scrollIntoView({ behavior: 'smooth', block: 'center' });
      serial.focus({ preventScroll: true });
      return true;
    },
    adapter(profile = activeProfile) { return sharedWorkbenchAdapter(profile); },
  });
}

function createX42Panel(document, ordinal) {
  const panel = document.createElement('section');
  panel.className = 'x42-trigger-capture';
  panel.dataset.x42TriggerCapture = '';
  panel.setAttribute('aria-labelledby', `x42-trigger-title-${ordinal}`);
  panel.innerHTML = `
    <div class="shared-instrument-tool-heading">
      <strong id="x42-trigger-title-${ordinal}">Trigger capture</strong>
      <span data-x42-state>Unavailable</span>
    </div>
    <p class="x42-trigger-boundary">Actual armed observation · AVR native cycles only. This does not diagnose a failure or run firmware.</p>
    <div class="x42-trigger-controls">
      <label>Named channel <select data-x42-channel disabled><option value="">Unavailable</option></select></label>
      <label>Edge <select data-x42-edge><option value="rising">Rising</option><option value="falling">Falling</option></select></label>
      <button type="button" data-x42-arm disabled>Arm next edge</button>
    </div>
    <p data-x42-limits>${X42_PRE_EDGE_COUNT} before + trigger + ${X42_POST_EDGE_COUNT} after · maximum ${X42_CAPTURE_ROW_LIMIT} rows · ${X42_OBSERVED_AFTER_ARM_LIMIT.toLocaleString('en-US')} candidate edges</p>
    <dl class="x42-trigger-facts">
      <div><dt>Binding</dt><dd data-x42-binding>No current AVR runtime.</dd></div>
      <div><dt>Source</dt><dd data-x42-source>Unavailable.</dd></div>
      <div><dt>Window</dt><dd data-x42-window>No capture.</dd></div>
    </dl>
    <ol data-x42-rows aria-label="Captured trigger rows"><li>No captured rows.</li></ol>`;
  return panel;
}

function installX42TriggerCapture(document, activeProfileReader) {
  const panels = [...document.querySelectorAll('[data-shared-instrument-tools]')].map((tools, index) => {
    const panel = createX42Panel(document, index + 1);
    tools.append(panel);
    return panel;
  });
  let owner = createX42DigitalEdgeTriggerCapture();
  let timer = null;

  const current = () => {
    const state = document.defaultView?.__M6_STATE__ ?? null;
    return {
      summary: document.defaultView?.__SHARED_INSTRUMENT_SUMMARY__ ?? null,
      lifecycle: state?.lifecycle ?? null,
      revision: state?.revision ?? null,
      artifactIdentity: state?.artifactIdentity ?? null,
    };
  };
  const stopObserver = () => {
    if (timer !== null) document.defaultView?.clearInterval(timer);
    timer = null;
  };
  const revalidateCurrent = () => {
    const { summary, lifecycle, revision, artifactIdentity } = current();
    const before = owner.snapshot();
    if (['armed', 'triggered', 'captured'].includes(before.state)
        && (revision !== before.binding.revision
          || artifactIdentity !== before.binding.artifactIdentity)) {
      owner.invalidate('X42_AUTHORITATIVE_BINDING_CHANGED');
    }
    const snapshot = owner.revalidate(summary, lifecycle);
    if (!['armed', 'triggered'].includes(snapshot.state)) stopObserver();
    return snapshot;
  };
  const render = () => {
    const snapshot = revalidateCurrent();
    const { summary, lifecycle } = current();
    const availability = activeProfileReader() === summary?.profile
      ? x42TriggerAvailability(summary, lifecycle)
      : { state: 'unavailable', reason: 'unavailable-profile-not-active', channels: [] };
    for (const panel of panels) {
      panel.dataset.state = snapshot.state;
      panel.querySelector('[data-x42-state]').textContent = snapshot.state.replace('-', ' ');
      const channel = panel.querySelector('[data-x42-channel]');
      const selected = channel.value;
      channel.replaceChildren();
      const choices = availability.channels;
      if (!choices.length) {
        const option = document.createElement('option'); option.value = ''; option.textContent = 'Unavailable';
        channel.append(option);
      } else for (const name of choices) {
        const option = document.createElement('option'); option.value = name; option.textContent = name;
        channel.append(option);
      }
      if (choices.includes(snapshot.config?.channel)) channel.value = snapshot.config.channel;
      else if (choices.includes(selected)) channel.value = selected;
      channel.disabled = availability.state !== 'ready' || ['armed', 'triggered'].includes(snapshot.state);
      panel.querySelector('[data-x42-edge]').disabled = ['armed', 'triggered'].includes(snapshot.state);
      const arm = panel.querySelector('[data-x42-arm]');
      arm.disabled = availability.state !== 'ready' || ['armed', 'triggered'].includes(snapshot.state);
      arm.textContent = ['captured', 'not-triggered', 'incomplete', 'invalidated'].includes(snapshot.state)
        ? 'Arm new capture' : 'Arm next edge';
      panel.querySelector('[data-x42-binding]').textContent = snapshot.binding
        ? `${snapshot.binding.artifactIdentity.slice(0, 12)}… · project ${snapshot.binding.projectGeneration} · runtime ${snapshot.binding.runtimeGeneration}`
        : availability.reason ?? 'No current AVR runtime.';
      panel.querySelector('[data-x42-source]').textContent = snapshot.source
        ? `${snapshot.source.classification} · ${snapshot.source.timeBasis} · ${snapshot.source.retained}/${snapshot.source.limit} rows · ${snapshot.source.dropped} dropped`
        : availability.reason ?? 'Unavailable.';
      panel.querySelector('[data-x42-window]').textContent = snapshot.capture
        ? `${snapshot.capture.startCycle} → ${snapshot.capture.triggerCycle} → ${snapshot.capture.endCycle} cycles · ${snapshot.capture.rows.length} rows`
        : snapshot.state === 'triggered' ? `Triggered · collecting ${X42_POST_EDGE_COUNT} later rows.`
          : snapshot.state === 'armed' ? `Armed before a future ${snapshot.config.edge} edge · ${snapshot.observedCandidateEdges}/${X42_OBSERVED_AFTER_ARM_LIMIT} candidates.`
            : snapshot.reason ?? 'No capture.';
      const rows = panel.querySelector('[data-x42-rows]');
      rows.replaceChildren();
      if (!snapshot.capture) {
        const item = document.createElement('li'); item.textContent = 'No captured rows.'; rows.append(item);
      } else for (const row of snapshot.capture.rows) {
        const item = document.createElement('li');
        item.dataset.relativePosition = String(row.relativePosition);
        item.textContent = `${row.relativePosition > 0 ? '+' : ''}${row.relativePosition} · ${row.pin} ${row.level ? 'HIGH' : 'LOW'} · cycle ${row.cycle} · source row ${row.sourceOrdinal}`;
        rows.append(item);
      }
    }
    return snapshot;
  };
  const observeNow = () => {
    const { summary, lifecycle } = current();
    const snapshot = owner.observe(summary, lifecycle);
    render();
    if (!['armed', 'triggered'].includes(snapshot.state)) stopObserver();
    return snapshot;
  };
  const startObserver = () => {
    stopObserver();
    timer = document.defaultView?.setInterval(observeNow, X42_OBSERVER_INTERVAL_MS) ?? null;
  };
  const refresh = () => {
    let snapshot = revalidateCurrent();
    if (['unavailable', 'ready'].includes(snapshot.state)) {
      const { summary, lifecycle } = current();
      owner.prepare(summary, lifecycle);
      snapshot = owner.snapshot();
    }
    return render();
  };
  for (const panel of panels) {
    panel.querySelector('[data-x42-arm]').addEventListener('click', () => {
      const { summary, lifecycle } = current();
      try {
        owner.arm(summary, lifecycle, {
          channel: panel.querySelector('[data-x42-channel]').value,
          edge: panel.querySelector('[data-x42-edge]').value,
        });
        for (const peer of panels) peer.querySelector('[data-x42-edge]').value = panel.querySelector('[data-x42-edge]').value;
        startObserver();
      } catch (error) {
        owner.invalidate(error.code ?? 'X42_ARM_REJECTED');
        stopObserver();
      }
      render();
    });
  }
  const invalidate = (reason) => {
    const snapshot = owner.invalidate(reason);
    stopObserver(); render(); return snapshot;
  };
  const invalidateEvents = new Map([
    ['board-select', 'X42_PROFILE_CHANGED'], ['source', 'X42_SOURCE_EDITED'],
    ['build', 'X42_BUILD_STARTED'], ['reset', 'X42_RESET'], ['stop', 'X42_STOP'],
    ['project-new', 'X42_NEW_PROJECT'], ['project-demo', 'X42_EXAMPLE_LOADED'],
  ]);
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'source') invalidate('X42_SOURCE_EDITED');
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'board-select') invalidate('X42_PROFILE_CHANGED');
  }, true);
  document.addEventListener('click', (event) => {
    const reason = invalidateEvents.get(event.target?.id);
    if (reason && event.target?.id !== 'source' && event.target?.id !== 'board-select') invalidate(reason);
  }, true);
  const BindingObserver = document.defaultView?.MutationObserver;
  const bindingObserver = BindingObserver ? new BindingObserver(() => render()) : null;
  if (bindingObserver) {
    for (const selector of ['#project-message', '#build-state', '#quick-state', '#wire-state']) {
      const node = document.querySelector(selector);
      if (node) bindingObserver.observe(node, { childList: true, characterData: true, subtree: true });
    }
  }
  const api = Object.freeze({
    refresh,
    observeNow,
    invalidate,
    snapshot: () => {
      const snapshot = revalidateCurrent();
      render();
      return snapshot;
    },
    observerActive: () => timer !== null,
  });
  document.defaultView.__X42_TRIGGER_CAPTURE__ = api;
  render();
  return api;
}

function createX43Panel(document, ordinal) {
  const panel = document.createElement('section');
  panel.className = 'x43-runtime-profile';
  panel.dataset.x43RuntimeProfile = '';
  panel.setAttribute('aria-labelledby', `x43-profile-title-${ordinal}`);
  panel.innerHTML = `
    <div class="shared-instrument-tool-heading">
      <strong id="x43-profile-title-${ordinal}">Runtime profile interval</strong>
      <span data-x43-state>Unavailable</span>
    </div>
    <p class="x43-profile-boundary">Read-only observation · current AVR worker counters only · no runtime command, verdict or hardware benchmark.</p>
    <div class="x43-profile-controls">
      <button type="button" data-x43-start disabled>Start observation</button>
      <button type="button" data-x43-capture disabled>Capture now</button>
    </div>
    <dl class="x43-profile-facts">
      <div><dt>Binding</dt><dd data-x43-binding>No current AVR worker.</dd></div>
      <div><dt>CPU interval</dt><dd data-x43-counters>No captured interval.</dd></div>
      <div><dt>Simulated time</dt><dd data-x43-virtual>Unavailable until capture.</dd></div>
      <div><dt>Wall diagnostic</dt><dd data-x43-wall>Not a semantic or hardware time.</dd></div>
    </dl>
    <dl class="x43-profile-unsupported" aria-label="Runtime memory and observed stack fields">
      <div><dt>Dynamic SRAM</dt><dd data-status="unavailable">Unavailable · runtime does not expose use.</dd></div>
      <div><dt>Heap</dt><dd data-status="unavailable">Unavailable · runtime does not expose use.</dd></div>
      <div><dt>Current observed stack</dt><dd data-x43-stack-current data-status="unavailable">Unavailable · no current AVR stack-pointer sample.</dd></div>
      <div><dt>Interval max observed</dt><dd data-x43-stack-interval data-status="unavailable">Unavailable until a native observation starts.</dd></div>
      <div><dt>Since-reset max observed</dt><dd data-x43-stack-all-time data-status="unavailable">Unavailable · no current AVR worker.</dd></div>
    </dl>`;
  return panel;
}

function installX43AvrObservationProfile(document, activeProfileReader) {
  const panels = [...document.querySelectorAll('[data-shared-instrument-tools]')].map((tools, index) => {
    const panel = createX43Panel(document, index + 1);
    tools.append(panel);
    return panel;
  });
  const owner = createX43AvrObservationProfile();
  let stackToken = null;
  let stackPending = null;
  const clearStackAuthority = () => { stackToken = null; stackPending = null; };
  const stackSnapshot = () => {
    try { return validateX43AvrStackSnapshot(document.defaultView?.__M6_STATE__?.runtime?.x43Stack); }
    catch { return null; }
  };
  const current = () => {
    const profile = activeProfileReader();
    try {
      return projectX43AvrObservationStatus(profile, document.defaultView?.__M6_STATE__ ?? null);
    } catch (error) {
      return { state: 'unavailable', observation: null, binding: null,
        reason: error.code ?? 'unavailable-no-current-avr-worker' };
    }
  };
  const paint = () => {
    const status = current();
    const { observation, reason } = status;
    let snapshot;
    if (status.state === 'transition') snapshot = owner.transition(status);
    else {
      snapshot = owner.peek();
      if (observation) snapshot = owner.snapshot(observation);
      else if (['observing', 'captured'].includes(snapshot.state)) {
        clearStackAuthority();
        snapshot = owner.invalidate(reason);
      }
      if (snapshot.state === 'unavailable') {
        owner.prepare(observation);
        snapshot = owner.peek();
      }
    }
    const transitioning = snapshot.state === 'transitioning';
    const stack = stackSnapshot();
    for (const panel of panels) {
      panel.dataset.state = snapshot.state;
      panel.querySelector('[data-x43-state]').textContent = snapshot.state;
      const start = panel.querySelector('[data-x43-start]');
      const capture = panel.querySelector('[data-x43-capture]');
      start.disabled = transitioning || !observation || snapshot.state === 'observing';
      start.textContent = ['captured', 'invalidated'].includes(snapshot.state)
        ? 'Start new observation' : 'Start observation';
      capture.disabled = transitioning || !observation || snapshot.state !== 'observing';
      panel.querySelector('[data-x43-binding]').textContent = transitioning
        ? 'Awaiting one coherent AVR worker status; controls and values are unavailable during the atomic transition.'
        : snapshot.binding
        ? `source ${snapshot.binding.sourceIdentity.slice(0, 12)}… · revision ${snapshot.binding.revision} · artifact ${snapshot.binding.artifactIdentity.slice(0, 12)}… · project/build/runtime ${snapshot.binding.projectGeneration}/${snapshot.binding.buildGeneration}/${snapshot.binding.runtimeGeneration} · model ${snapshot.binding.modelImplementationSha256.slice(0, 8)}…/${snapshot.binding.modelExecutionContextSha256.slice(0, 8)}… · worker ${snapshot.binding.workerInitialization}/${snapshot.binding.workerInstanceNonce.slice(0, 8)}…`
        : reason ?? snapshot.reason ?? 'No current AVR worker.';
      const interval = snapshot.interval;
      panel.querySelector('[data-x43-counters]').textContent = interval?.delta
        ? `${interval.start.cycle.toLocaleString('en-US')} cycles / ${interval.start.instructions.toLocaleString('en-US')} instructions → ${interval.end.cycle.toLocaleString('en-US')} cycles / ${interval.end.instructions.toLocaleString('en-US')} instructions · Δ ${interval.delta.cycles.toLocaleString('en-US')} / ${interval.delta.instructions.toLocaleString('en-US')}`
        : interval?.start
          ? `Started at ${interval.start.cycle.toLocaleString('en-US')} cycles / ${interval.start.instructions.toLocaleString('en-US')} instructions.`
          : 'No captured interval.';
      panel.querySelector('[data-x43-virtual]').textContent = transitioning
        ? 'Unavailable during runtime state transition.'
        : interval?.virtualTime
        ? `${x43VirtualNanosecondsText(interval.virtualTime)} · exact 16 MHz AVR cycle basis`
        : 'Unavailable until capture.';
      const wall = interval?.wallDiagnostic;
      panel.querySelector('[data-x43-wall]').textContent = transitioning
        ? 'Unavailable during runtime state transition.'
        : wall
        ? `${wall.milliseconds.toFixed(3)} ms browser wall · ${wall.cyclesPerSecond === null ? 'throughput unavailable' : `${Math.round(wall.cyclesPerSecond).toLocaleString('en-US')} cycles/s · ${Math.round(wall.instructionsPerSecond).toLocaleString('en-US')} instructions/s`} · diagnostic only`
        : 'Not a semantic or hardware time.';
      const currentStack = panel.querySelector('[data-x43-stack-current]');
      const intervalStack = panel.querySelector('[data-x43-stack-interval]');
      const allTimeStack = panel.querySelector('[data-x43-stack-all-time]');
      currentStack.dataset.status = stack?.current ? 'available' : 'unavailable';
      currentStack.textContent = stack?.current
        ? `SP 0x${stack.current.pointer.toString(16).padStart(4, '0')} · ${stack.current.depthBytes} B below reset top`
        : `Unavailable · ${stack?.allTimeReason ?? 'no current AVR stack-pointer sample'}.`;
      const nativeInterval = stack?.interval?.token === stackToken ? stack.interval : null;
      if (stackPending === 'start' && nativeInterval) stackPending = null;
      if (stackPending === 'capture'
          && ['captured', 'unavailable'].includes(nativeInterval?.state)) stackPending = null;
      intervalStack.dataset.status = nativeInterval && nativeInterval.state !== 'unavailable'
        ? 'available' : 'unavailable';
      intervalStack.textContent = stackPending === 'start'
        ? 'Start requested · awaiting the bound worker acknowledgement; pre-ack CPU counters are not the native stack interval.'
        : stackPending === 'capture'
          ? 'Capture requested · awaiting the bound worker acknowledgement; the native stack interval is still observing.'
          : nativeInterval?.state === 'captured'
        ? `${nativeInterval.maximumObservedDepthBytes} B observed address depth · minimum SP 0x${nativeInterval.minimumPointer.toString(16).padStart(4, '0')} · ${nativeInterval.samples} instruction-boundary samples`
        : nativeInterval?.state === 'observing'
          ? `Observing · ${nativeInterval.maximumObservedDepthBytes} B maximum so far · ${nativeInterval.samples} samples`
          : nativeInterval?.state === 'unavailable'
            ? `Unavailable · ${nativeInterval.reason}.`
            : stackToken ? 'Awaiting the bound worker observation acknowledgement.'
              : 'Unavailable until a native observation starts.';
      allTimeStack.dataset.status = stack?.allTime ? 'available' : 'unavailable';
      allTimeStack.textContent = stack?.allTime
        ? `${stack.allTime.maximumObservedDepthBytes} B observed address depth · minimum SP 0x${stack.allTime.minimumPointer.toString(16).padStart(4, '0')} · reset/new worker clears this value`
        : `Unavailable · ${stack?.allTimeReason ?? 'no current AVR worker'}.`;
    }
    return snapshot;
  };
  for (const panel of panels) {
    panel.querySelector('[data-x43-start]').addEventListener('click', () => {
      const { observation, reason } = current();
      if (!observation) owner.invalidate(reason ?? 'X43_START_UNAVAILABLE');
      else {
        try {
          stackToken = `x43-stack-${document.defaultView.crypto.randomUUID()}`;
          stackPending = 'start';
          document.dispatchEvent(new document.defaultView.CustomEvent('x43-stack-start-request', {
            detail: { token: stackToken },
          }));
          owner.start(observation, document.defaultView.performance.now());
        }
        catch (error) {
          clearStackAuthority();
          owner.invalidate(error.code ?? 'X43_START_REJECTED');
        }
      }
      paint();
    });
    panel.querySelector('[data-x43-capture]').addEventListener('click', () => {
      const { observation, reason } = current();
      if (!observation) owner.invalidate(reason ?? 'X43_CAPTURE_UNAVAILABLE');
      else {
        try {
          if (!stackToken) throw Object.assign(new Error('X43_STACK_TOKEN_MISSING'), { code: 'X43_STACK_TOKEN_MISSING' });
          stackPending = 'capture';
          document.dispatchEvent(new document.defaultView.CustomEvent('x43-stack-capture-request', {
            detail: { token: stackToken },
          }));
          owner.capture(observation, document.defaultView.performance.now());
        }
        catch (error) {
          clearStackAuthority();
          owner.invalidate(error.code ?? 'X43_CAPTURE_REJECTED');
        }
      }
      paint();
    });
  }
  const invalidate = (reason) => {
    clearStackAuthority();
    const snapshot = owner.invalidate(reason);
    paint();
    return snapshot;
  };
  const invalidateEvents = new Map([
    ['build', 'X43_BUILD_STARTED'], ['reset', 'X43_RESET'], ['stop', 'X43_STOP'],
    ['project-new', 'X43_NEW_PROJECT'], ['project-demo', 'X43_EXAMPLE_LOADED'],
  ]);
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'source') invalidate('X43_SOURCE_EDITED');
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'board-select') invalidate('X43_PROFILE_CHANGED');
  }, true);
  document.addEventListener('click', (event) => {
    const reason = invalidateEvents.get(event.target?.id);
    if (reason) invalidate(reason);
  }, true);
  const BindingObserver = document.defaultView?.MutationObserver;
  const bindingObserver = BindingObserver ? new BindingObserver(() => paint()) : null;
  if (bindingObserver) {
    for (const selector of ['#project-message', '#build-state', '#quick-state', '#wire-state']) {
      const node = document.querySelector(selector);
      if (node) bindingObserver.observe(node, { childList: true, characterData: true, subtree: true });
    }
  }
  const api = Object.freeze({
    refresh: paint,
    invalidate,
    snapshot: paint,
    transitionState: () => panels[0]?.dataset.state ?? 'unavailable',
  });
  document.defaultView.__X43_AVR_PROFILE__ = api;
  paint();
  return api;
}

function createX47Panel(document, ordinal) {
  const panel = document.createElement('section');
  panel.className = 'x47-pulse-preview';
  panel.dataset.x47PulsePreview = '';
  panel.setAttribute('aria-labelledby', `x47-pulse-title-${ordinal}`);
  panel.innerHTML = `
    <div class="shared-instrument-tool-heading">
      <strong id="x47-pulse-title-${ordinal}">D2 active-low pulse</strong>
      <span data-x47-state>Checking</span>
    </div>
    <p class="x47-pulse-boundary"><strong>AVR D2 pulse</strong> · transient · not saved · <a href="/support.html#x47-avr-d2-pulse">Usage and evidence limits</a>.</p>
    <div class="x47-pulse-controls">
      <label>Start offset <span><input data-x47-start type="number" inputmode="numeric" min="1" max="1599999" step="1" value="16000"> cycles</span></label>
      <label>Pulse width <span><input data-x47-width type="number" inputmode="numeric" min="1" max="1599999" step="1" value="32000"> cycles</span></label>
      <button type="button" data-x47-preview disabled>Create preview</button>
    </div>
    <p data-x47-binding>Checking the current AVR graph.</p>
    <div class="x47-pulse-output" data-x47-output hidden>
      <ol data-x47-events aria-label="Expanded D2 events"></ol>
      <details><summary>Canonical transient record</summary><pre data-x47-canonical></pre></details>
    </div>
    <div class="x47-runtime-actions" data-x47-runtime-actions>
      <button type="button" data-x47-apply disabled>Apply to paused D2</button>
      <button type="button" data-x47-resume disabled>Resume explicitly</button>
      <button type="button" data-x47-stop disabled>Stop safely</button>
    </div>
    <p data-x47-runtime-state>Build, Run, then explicitly Pause before Apply.</p>
    <dl class="x47-runtime-facts" data-x47-runtime-facts>
      <div><dt>Target</dt><dd data-x47-fact="target">—</dd></div>
      <div><dt>Queue drain</dt><dd data-x47-fact="drain">—</dd></div>
      <div><dt>Adapter apply</dt><dd data-x47-fact="adapter">—</dd></div>
      <div><dt>Electrical transition</dt><dd data-x47-fact="transition">—</dd></div>
      <div><dt>Cancellation</dt><dd data-x47-fact="cancel">—</dd></div>
    </dl>`;
  return panel;
}

function installX47PulsePreview(document, activeProfileReader) {
  const panels = [...document.querySelectorAll('[data-shared-instrument-tools]')].map((tools, index) => {
    const panel = createX47Panel(document, index + 1);
    tools.append(panel);
    return panel;
  });
  const owner = createX47PulsePreviewOwner();
  let operation = 0;
  let lastContext = null;
  let lastSource = null;
  let pending = false;
  let draftChanged = false;
  let notice = null;
  let integration = { phase: 'unavailable', reason: 'Build, Run, then explicitly Pause before Apply.',
    request: null, queueReceipt: null, executionReceipt: null, cancelReceipt: null, cancelTimeout: null };

  const state = () => document.defaultView?.__M6_STATE__ ?? null;
  const captureSource = () => {
    const current = state();
    return captureX47PulseSource(activeProfileReader(), current?.lifecycle?.projectGeneration,
      current?.revision, current?.graph);
  };
  const resolveContext = async () => {
    const source = captureSource();
    const context = await createX47PulseContextFromSource(source);
    const current = state();
    if (!x47PulseSourceMatches(source, activeProfileReader(), current?.lifecycle?.projectGeneration,
      current?.revision, current?.graph)) {
      const error = new Error('X47_SOURCE_CHANGED_DURING_HASH');
      error.code = 'X47_SOURCE_CHANGED_DURING_HASH';
      throw error;
    }
    return { source, context };
  };
  const redacted = (reason = 'X47_BINDING_REVALIDATING') => ({
    state: 'pending', reason, record: null, canonicalText: null, events: [],
  });
  const currentSnapshot = () => {
    if (pending) return redacted();
    const snapshot = owner.snapshot();
    if (snapshot.state !== 'preview') return snapshot;
    const current = state();
    if (!lastSource || !lastContext || !x47PulseSourceMatches(
      lastSource, activeProfileReader(), current?.lifecycle?.projectGeneration,
      current?.revision, current?.graph,
    )) {
      operation += 1;
      lastSource = null;
      lastContext = null;
      draftChanged = false;
      notice = null;
      const invalidated = owner.invalidate('X47_BINDING_CHANGED');
      paintSnapshot(invalidated, null);
      return invalidated;
    }
    return owner.revalidate(lastContext);
  };
  const paintSnapshot = (snapshot, availability = null) => {
    for (const panel of panels) {
      const status = panel.querySelector('[data-x47-state]');
      const preview = panel.querySelector('[data-x47-preview]');
      const output = panel.querySelector('[data-x47-output]');
      panel.dataset.state = snapshot.state;
      status.textContent = snapshot.state === 'pending' ? 'Checking binding'
        : snapshot.state === 'preview' && notice ? 'Rejected · preview retained'
        : snapshot.state === 'preview' && draftChanged ? 'Previous preview retained'
        : snapshot.state === 'preview' ? 'Preview ready'
        : snapshot.state === 'invalidated' ? 'Cleared' : availability ? 'Ready' : 'Unavailable';
      preview.disabled = snapshot.state === 'pending' || !availability;
      panel.querySelector('[data-x47-binding]').textContent = availability
        ? `${notice ? `${notice} · ` : ''}Current ${availability.target.componentId}: ${availability.target.inputEndpoint} → ${availability.target.contactEndpoint}, ${availability.target.groundContactEndpoint} → ${availability.target.groundEndpoint} · revision ${availability.sourceProjectRevision} · graph ${availability.graphIdentity.slice(0, 19)}…`
        : snapshot.reason ?? 'Requires one validated AVR button wired from D2 to ground.';
      output.hidden = snapshot.state !== 'preview';
      const rows = snapshot.events.map((event) => {
        const item = document.createElement('li');
        item.textContent = `${event.offsetCycles.toLocaleString('en-US')} cycles · ${event.pin} ${event.level ? 'HIGH' : 'LOW'}`;
        return item;
      });
      panel.querySelector('[data-x47-events]').replaceChildren(...rows);
      panel.querySelector('[data-x47-canonical]').textContent = snapshot.canonicalText ?? '';
      paintIntegration(panel, snapshot);
    }
  };
  const factText = (events, field, missing) => events?.length
    ? events.map((event) => `event ${event.eventIndex + 1}: ${event[field] === null
      ? missing : Number(event[field]).toLocaleString('en-US')}`).join(' · ') : missing;
  const paintIntegration = (panel, previewSnapshot = owner.snapshot()) => {
    const apply = panel.querySelector('[data-x47-apply]');
    const resume = panel.querySelector('[data-x47-resume]');
    const stop = panel.querySelector('[data-x47-stop]');
    apply.disabled = previewSnapshot.state !== 'preview' || integration.phase !== 'ready';
    resume.disabled = integration.phase !== 'resume-required';
    stop.disabled = !['resume-required', 'running', 'ready'].includes(integration.phase)
      || !integration.queueReceipt;
    const historical = ['retired', 'stopped', 'timeout'].includes(integration.phase)
      && Boolean(integration.request || integration.queueReceipt || integration.executionReceipt
        || integration.cancelReceipt || integration.cancelTimeout);
    const evidencePrefix = historical ? 'Historical · non-current · ' : '';
    panel.querySelector('[data-x47-runtime-state]').textContent = historical
      ? `Historical evidence · non-current; active authority revoked. ${integration.reason}`
      : integration.reason;
    const execution = integration.executionReceipt;
    const events = execution?.events ?? integration.queueReceipt?.events ?? [];
    panel.querySelector('[data-x47-fact="target"]').textContent = evidencePrefix + (events.length
      ? events.map((event) => `event ${event.eventIndex + 1}: ${event.targetCycle.toLocaleString('en-US')}`).join(' · ')
      : 'Not requested');
    panel.querySelector('[data-x47-fact="drain"]').textContent = evidencePrefix
      + factText(execution?.events, 'drainAppliedCycle', 'Not observed');
    panel.querySelector('[data-x47-fact="adapter"]').textContent = evidencePrefix
      + factText(execution?.events, 'adapterAppliedCycle', 'Not observed');
    panel.querySelector('[data-x47-fact="transition"]').textContent = evidencePrefix + (execution?.events?.length
      ? execution.events.map((event) => event.transitioned === null
        ? `event ${event.eventIndex + 1}: unknown`
        : event.transitioned
          ? `event ${event.eventIndex + 1}: cycle ${event.transitionCycle.toLocaleString('en-US')}`
          : `event ${event.eventIndex + 1}: applied, no electrical transition`).join(' · ')
      : 'Not observed');
    panel.querySelector('[data-x47-fact="cancel"]').textContent = evidencePrefix + (integration.cancelTimeout
      ? 'Not completed: acknowledgement timeout'
      : integration.cancelReceipt
        ? integration.cancelReceipt.evidenceComplete ? 'Complete evidence' : 'Acknowledged · evidence incomplete'
        : 'Not requested');
  };
  const refresh = async () => {
    const ticket = ++operation;
    pending = true;
    notice = null;
    paintSnapshot(redacted(), null);
    try {
      const resolved = await resolveContext();
      if (ticket !== operation) return currentSnapshot();
      pending = false;
      lastSource = resolved.source;
      lastContext = resolved.context;
      const snapshot = owner.revalidate(resolved.context);
      paintSnapshot(snapshot, resolved.context);
      return snapshot;
    } catch (error) {
      if (ticket !== operation) return currentSnapshot();
      pending = false;
      lastSource = null;
      lastContext = null;
      const snapshot = owner.invalidate(error.code ?? 'X47_UNAVAILABLE');
      paintSnapshot(snapshot, null);
      return snapshot;
    }
  };
  const invalidate = (reason) => {
    operation += 1;
    pending = false;
    lastSource = null;
    lastContext = null;
    draftChanged = false;
    notice = null;
    const snapshot = owner.invalidate(reason);
    paintSnapshot(snapshot, null);
    return snapshot;
  };
  for (const panel of panels) {
    for (const input of panel.querySelectorAll('[data-x47-start],[data-x47-width]')) {
      input.addEventListener('input', () => {
        if (pending) { operation += 1; pending = false; }
        draftChanged = owner.snapshot().state === 'preview';
        notice = null;
        const snapshot = currentSnapshot();
        paintSnapshot(snapshot, lastContext);
      });
    }
    panel.querySelector('[data-x47-preview]').addEventListener('click', async () => {
      const ticket = ++operation;
      const startOffsetCycles = Number(panel.querySelector('[data-x47-start]').value);
      const widthCycles = Number(panel.querySelector('[data-x47-width]').value);
      pending = true;
      notice = null;
      paintSnapshot(redacted(), null);
      try {
        const resolved = await resolveContext();
        if (ticket !== operation) return;
        const record = createX47PulseRecord(
          { startOffsetCycles, widthCycles }, resolved.context,
        );
        const snapshot = owner.accept(record, resolved.context);
        pending = false;
        lastSource = resolved.source;
        lastContext = resolved.context;
        draftChanged = false;
        paintSnapshot(snapshot, resolved.context);
        document.dispatchEvent(new CustomEvent('x47-preview-ready'));
      } catch (error) {
        if (ticket !== operation) return;
        pending = false;
        notice = error.code ?? 'X47_PREVIEW_REJECTED';
        const snapshot = currentSnapshot();
        paintSnapshot(snapshot, lastContext);
      }
    });
    panel.querySelector('[data-x47-apply]').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('x47-apply-request'));
    });
    panel.querySelector('[data-x47-resume]').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('x47-resume-request'));
    });
    panel.querySelector('[data-x47-stop]').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('x47-stop-request'));
    });
  }
  const invalidationEvents = new Map([
    ['build', 'X47_BUILD_STARTED'], ['run', 'X47_RUN_STARTED'], ['reset', 'X47_RESET'],
    ['stop', 'X47_RUNTIME_RETIRED'], ['project-new', 'X47_NEW_PROJECT'],
    ['project-demo', 'X47_EXAMPLE_OPENED'], ['project-open', 'X47_OPEN_STARTED'],
  ]);
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'source') invalidate('X47_SOURCE_EDITED');
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'board-select') invalidate('X47_PROFILE_CHANGED');
    else if (event.target?.id === 'project-open-input') invalidate('X47_PROJECT_OPENED');
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!['Delete', 'Backspace'].includes(event.key) || event.target?.closest?.('input,textarea,select')) return;
    if (pending || owner.snapshot().state === 'preview') invalidate('X47_GRAPH_EDIT_STARTED');
  }, true);
  document.addEventListener('click', (event) => {
    const reason = invalidationEvents.get(event.target?.id);
    if (reason) invalidate(reason);
    else if (!event.target?.closest?.('[data-x47-pulse-preview]') && owner.snapshot().state === 'preview') {
      document.defaultView?.queueMicrotask(() => { void refresh(); });
    }
  }, true);
  const BindingObserver = document.defaultView?.MutationObserver;
  const bindingObserver = BindingObserver ? new BindingObserver(() => {
    const snapshot = currentSnapshot();
    paintSnapshot(snapshot, snapshot.state === 'preview' ? lastContext : null);
  }) : null;
  if (bindingObserver) {
    for (const selector of ['#project-message', '#build-state', '#quick-state', '#wire-state']) {
      const node = document.querySelector(selector);
      if (node) bindingObserver.observe(node, { childList: true, characterData: true, subtree: true });
    }
  }
  const api = Object.freeze({
    refresh,
    invalidate,
    snapshot: currentSnapshot,
    canonicalText: () => {
      const snapshot = currentSnapshot();
      return snapshot.record ? canonicalX47PulseText(snapshot.record, lastContext) : null;
    },
    expandedEvents: () => {
      const snapshot = currentSnapshot();
      return snapshot.record ? expandX47PulseRecord(snapshot.record, lastContext) : [];
    },
    inspectTarget: () => inspectX47AvrD2Target(state()?.graph),
    bindingContext: () => lastContext ? structuredClone(lastContext) : null,
    record: () => {
      const snapshot = currentSnapshot();
      return snapshot.record ? structuredClone(snapshot.record) : null;
    },
    integration(value) {
      integration = structuredClone(value);
      for (const panel of panels) paintIntegration(panel);
      return structuredClone(integration);
    },
  });
  document.defaultView.__X47_PULSE_PREVIEW__ = api;
  paintSnapshot(currentSnapshot(), null);
  void refresh();
  return api;
}

const X47_REPEATABLE_DEFAULTS = Object.freeze({
  ramp: '{"startTemperatureC":20,"endTemperatureC":40,"eventCount":5,"startOffsetCycles":16000,"stepCycles":16000}',
  'seeded-noise': '{"centerTemperatureC":30,"amplitudeC":4,"eventCount":8,"startOffsetCycles":8000,"stepCycles":8000}',
  recorded: '{"points":[{"offsetCycles":16000,"temperatureC":20},{"offsetCycles":32000,"temperatureC":30},{"offsetCycles":48000,"temperatureC":40}]}',
});

function createX47RepeatablePanel(document, ordinal) {
  const panel = document.createElement('section');
  panel.className = 'x47-repeatable-inputs';
  panel.dataset.x47RepeatableInputs = '';
  panel.setAttribute('aria-labelledby', `x47-repeatable-title-${ordinal}`);
  panel.innerHTML = `
    <div class="shared-instrument-tool-heading">
      <strong id="x47-repeatable-title-${ordinal}">Repeatable A1 inputs</strong>
      <span data-x47-repeatable-state>Checking</span>
    </div>
    <p class="x47-repeatable-boundary"><strong>Bounded AVR input</strong> · finite local preview · not saved · Apply never resumes execution.</p>
    <div class="x47-repeatable-controls">
      <label>Input family
        <select data-x47-repeatable-family>
          <option value="ramp">Temperature ramp</option>
          <option value="seeded-noise">Seeded temperature noise</option>
          <option value="recorded">Recorded temperature sequence</option>
        </select>
      </label>
      <label data-x47-repeatable-seed-wrap hidden>Unsigned 32-bit seed
        <input data-x47-repeatable-seed type="number" inputmode="numeric" min="0" max="4294967295" step="1" value="305419896">
      </label>
      <button type="button" data-x47-repeatable-preview disabled>Create finite preview</button>
    </div>
    <label class="x47-repeatable-parameters">Strict local JSON parameters
      <textarea data-x47-repeatable-parameters rows="4" spellcheck="false">${X47_REPEATABLE_DEFAULTS.ramp}</textarea>
    </label>
    <p data-x47-repeatable-binding>Checking exact A1 temperature and D2 button wiring.</p>
    <div class="x47-repeatable-output" data-x47-repeatable-output hidden>
      <div><strong>Expanded schedule</strong><ol data-x47-repeatable-events></ol></div>
      <details><summary>Canonical bounded record</summary><pre data-x47-repeatable-canonical></pre></details>
    </div>
    <div class="x47-repeatable-actions">
      <button type="button" data-x47-repeatable-apply disabled>Apply to paused A1</button>
    </div>
    <p data-x47-repeatable-runtime>Build, Run, then explicitly Pause. Apply only queues the finite schedule; it never resumes execution.</p>`;
  return panel;
}

function installX47RepeatableInputs(document, activeProfileReader) {
  const panels = [...document.querySelectorAll('[data-shared-instrument-tools]')].map((tools, index) => {
    const panel = createX47RepeatablePanel(document, index + 1);
    tools.append(panel);
    return panel;
  });
  let operation = 0;
  let context = null;
  let record = null;
  let canonicalText = null;
  let source = null;
  let notice = null;
  let draftChanged = false;
  let integration = { phase: 'unavailable', reason: 'No current paused worker.' };
  const state = () => document.defaultView?.__M6_STATE__ ?? null;
  const sourceStillCurrent = () => source && source.profile === activeProfileReader()
    && source.projectGeneration === state()?.lifecycle?.projectGeneration
    && source.revision === state()?.revision
    && source.graphJson === JSON.stringify(state()?.graph);
  const snapshot = () => ({ state: record && sourceStillCurrent() ? 'preview' : 'unavailable',
    reason: notice ?? (integration.phase === 'rejected' ? integration.reason : null),
    context: context ? structuredClone(context) : null,
    record: record ? structuredClone(record) : null, canonicalText });
  const canApply = () => Boolean(record && !draftChanged && sourceStillCurrent()
    && state()?.lifecycle?.phase === 'paused'
    && ['await-pause', 'ready'].includes(integration.phase));
  const paint = () => {
    if (record && !sourceStillCurrent()) {
      context = null; record = null; canonicalText = null;
      notice = 'X47_REPEATABLE_BINDING_CHANGED';
    }
    const applyRejected = Boolean(record && integration.phase === 'rejected');
    for (const panel of panels) {
      panel.dataset.state = applyRejected
        ? 'rejected' : record ? 'preview' : notice ? 'invalidated' : 'ready';
      panel.querySelector('[data-x47-repeatable-state]').textContent = applyRejected
        ? `Apply rejected · preview retained · ${integration.reason}`
        : record && notice
        ? `Rejected · previous preview retained · ${notice}`
        : record && draftChanged ? 'Previous preview retained'
          : record ? 'Preview ready' : notice ? `Rejected · ${notice}` : context ? 'Ready' : 'Unavailable';
      panel.querySelector('[data-x47-repeatable-preview]').disabled = !context;
      panel.querySelector('[data-x47-repeatable-apply]').disabled = !canApply();
      panel.querySelector('[data-x47-repeatable-binding]').textContent = context
        ? `Current ${context.target.componentId}: ${context.target.signalEndpoint} → ${context.target.inputEndpoint} · ${context.target.units} · revision ${context.sourceProjectRevision} · graph ${context.graphIdentity.slice(0, 19)}…`
        : notice ?? 'Requires the exact AVR thermostat graph with A1 temperature sensor and D2 button.';
      panel.querySelector('[data-x47-repeatable-output]').hidden = !record;
      panel.querySelector('[data-x47-repeatable-canonical]').textContent = canonicalText ?? '';
      const rows = record?.events.map((event) => {
        const item = document.createElement('li');
        item.textContent = `${event.offsetCycles.toLocaleString('en-US')} cycles · ${event.temperatureC} °C`;
        return item;
      }) ?? [];
      panel.querySelector('[data-x47-repeatable-events]').replaceChildren(...rows);
      panel.querySelector('[data-x47-repeatable-runtime]').textContent = integration.accepted
        ? `${integration.accepted.events.length} events queued on the current paused worker; execution has not been resumed or claimed.`
        : `${integration.reason ?? 'No current paused worker.'} Apply queues data only and never resumes execution.`;
    }
    return snapshot();
  };
  const refresh = async () => {
    const ticket = ++operation;
    const current = state();
    const captured = { profile: activeProfileReader(),
      projectGeneration: current?.lifecycle?.projectGeneration, revision: current?.revision,
      graphJson: JSON.stringify(current?.graph), graph: structuredClone(current?.graph) };
    try {
      const next = await createX47RepeatableContext(captured.profile, captured.projectGeneration,
        captured.revision, captured.graph);
      if (ticket !== operation || captured.profile !== activeProfileReader()
          || captured.projectGeneration !== state()?.lifecycle?.projectGeneration
          || captured.revision !== state()?.revision
          || captured.graphJson !== JSON.stringify(state()?.graph)) return snapshot();
      source = { profile: captured.profile, projectGeneration: captured.projectGeneration,
        revision: captured.revision, graphJson: captured.graphJson };
      context = next; notice = null;
    } catch (error) {
      if (ticket !== operation) return snapshot();
      source = null; context = null; record = null; canonicalText = null;
      notice = error.code ?? error.message;
    }
    return paint();
  };
  const invalidate = (reason) => {
    operation += 1; source = null; context = null; record = null; canonicalText = null; draftChanged = false;
    notice = reason; integration = { phase: 'unavailable', reason };
    return paint();
  };
  for (const panel of panels) {
    const family = panel.querySelector('[data-x47-repeatable-family]');
    const parameters = panel.querySelector('[data-x47-repeatable-parameters]');
    const seedWrap = panel.querySelector('[data-x47-repeatable-seed-wrap]');
    family.addEventListener('change', () => {
      parameters.value = X47_REPEATABLE_DEFAULTS[family.value];
      seedWrap.hidden = family.value !== 'seeded-noise';
      record = null; canonicalText = null; notice = null; draftChanged = false; paint();
    });
    parameters.addEventListener('input', () => { draftChanged = Boolean(record); notice = null; paint(); });
    panel.querySelector('[data-x47-repeatable-seed]').addEventListener('input', () => {
      draftChanged = Boolean(record); notice = null; paint();
    });
    panel.querySelector('[data-x47-repeatable-preview]').addEventListener('click', () => {
      try {
        if (!context || !sourceStillCurrent()) throw new Error('X47_REPEATABLE_BINDING_CHANGED');
        const parsed = parseStrictJson(parameters.value);
        const seed = family.value === 'seeded-noise'
          ? Number(panel.querySelector('[data-x47-repeatable-seed]').value) : null;
        const next = createX47RepeatableRecord(family.value, parsed, context, seed);
        record = next; canonicalText = canonicalX47RepeatableText(next, context);
        notice = null; draftChanged = false; integration = { ...integration, accepted: null };
      } catch (error) {
        notice = error.code ?? error.message;
      }
      paint();
    });
    panel.querySelector('[data-x47-repeatable-apply]').addEventListener('click', () => {
      if (!canApply()) return;
      document.dispatchEvent(new CustomEvent('x47-repeatable-apply-request', { detail: {
        context: structuredClone(context), record: structuredClone(record), canonicalText,
      } }));
    });
  }
  const api = Object.freeze({ refresh, invalidate, snapshot: () => paint(),
    integration(value) { integration = structuredClone(value); return paint(); },
    accepted(value) { integration = { ...integration, accepted: structuredClone(value),
      phase: 'queued', reason: 'Finite schedule accepted while paused.' }; return paint(); } });
  document.defaultView.__X47_REPEATABLE_INPUTS__ = api;
  void refresh();
  return api;
}

function createX49Panel(document, ordinal) {
  const panel = document.createElement('section');
  panel.className = 'x49-offset-comparison';
  panel.dataset.x49OffsetComparison = '';
  panel.setAttribute('aria-labelledby', `x49-offset-title-${ordinal}`);
  panel.innerHTML = `
    <div class="shared-instrument-tool-heading">
      <strong id="x49-offset-title-${ordinal}">Temperature sensor offset comparison</strong>
      <span data-x49-state>Ready</span>
    </div>
    <p class="x49-offset-boundary"><strong>Ideal model composition</strong> · transient · not saved · integer offset ${X49_OFFSET_LIMITS.minimum}…+${X49_OFFSET_LIMITS.maximum} °C.</p>
    <div class="x49-offset-actions">
      <label>Candidate offset
        <select data-x49-offset aria-label="Candidate temperature offset">
          ${Array.from({ length: X49_OFFSET_LIMITS.maximum - X49_OFFSET_LIMITS.minimum + 1 },
    (_, index) => index + X49_OFFSET_LIMITS.minimum).map((value) => `<option value="${value}"${value === X49_PUBLIC_NATIVE_OFFSET ? ' selected' : ''}>${value >= 0 ? '+' : ''}${value} °C</option>`).join('')}
        </select>
      </label>
      <button type="button" data-x49-preview>Preview calculation</button>
      <button type="button" data-x49-native>Build and run verified +1 comparison</button>
      <button type="button" data-x49-cancel hidden>Cancel comparison</button>
      <span data-x49-window>${X49_VIRTUAL_WINDOW.minimumMilliseconds}–${X49_VIRTUAL_WINDOW.maximumMilliseconds} ms virtual acceptance window · cycle-zero inputs</span>
    </div>
    <p class="x49-offset-disclosure"><strong>Before native run:</strong> an instrumented copy of this exact source is sent to the same-origin isolated compiler for this run. It is not saved into the project.</p>
    <p data-x49-message>Choose any offset for a calculated preview. Native execution is restricted to baseline 0 versus candidate +1.</p>
    <div class="x49-offset-table-wrap" data-x49-output hidden>
      <table>
        <caption>Authored, calculated and observed evidence remain separate</caption>
        <thead><tr><th>Case</th><th>Authored input</th><th>Calculated expectation</th><th>Native emulator observation</th><th>Physical observation</th></tr></thead>
        <tbody data-x49-rows></tbody>
      </table>
    </div>
    <p class="x49-offset-producer"><strong>Candidate producer boundary:</strong> a separately instrumented in-memory copy of the exact AVR thermostat source is required; ordinary current firmware, thermostat snapshots and UART text are not native verification.</p>`;
  return panel;
}

function createX48Panel(document, ordinal) {
  const panel = document.createElement('section');
  panel.className = 'x48-room-loop';
  panel.dataset.x48RoomLoop = '';
  panel.dataset.state = 'unavailable';
  panel.setAttribute('aria-labelledby', `x48-room-title-${ordinal}`);
  panel.innerHTML = `
    <div class="shared-instrument-tool-heading">
      <strong id="x48-room-title-${ordinal}">Ideal room control loop</strong>
      <span data-x48-state>Unavailable</span>
    </div>
    <p class="x48-room-boundary"><strong>Discrete educational model</strong> · ${X48_TICK_COUNT} ticks on a nominal 160 ms schedule · each sample uses the first completed AVR instruction boundary at or after its target.</p>
    <div class="x48-room-actions">
      <button type="button" data-x48-start disabled>Run ideal room loop</button>
      <button type="button" data-x48-cancel hidden>Cancel loop</button>
    </div>
    <p data-x48-message>Open the exact thermostat example and make a fresh Build. Ordinary Run is not used.</p>
    <dl class="x48-room-facts">
      <div><dt>Schedule</dt><dd>Nominal ${X48_NOMINAL_TICK_CYCLES.toLocaleString('en-US')} cycles/tick; actual producer boundary retained.</dd></div>
      <div><dt>Result</dt><dd data-x48-result>No transient result.</dd></div>
    </dl>
    <div class="x48-room-table-wrap" data-x48-output hidden>
      <table><caption>Nominal schedule and actual producer evidence</caption>
        <thead><tr><th>Tick</th><th>Temperature input</th><th>D13</th><th>Nominal target</th><th>Actual / lateness</th><th>Next input apply</th></tr></thead>
        <tbody data-x48-rows></tbody>
      </table>
    </div>
    <p class="x48-room-limit">Not physical time, thermal calibration, a continuous solver or safety evidence. Results are transient and bound to one current source/artifact/model/worker.</p>`;
  return panel;
}

function installX48RoomLoop(document, activeProfileReader) {
  const panels = [...document.querySelectorAll('[data-shared-instrument-tools]')].map((tools, index) => {
    const panel = createX48Panel(document, index + 1); tools.append(panel); return panel;
  });
  let state = { phase: 'ready', message: 'Fresh exact thermostat Build required.', result: null };
  const bridge = () => document.defaultView.__X48_RUNTIME_BRIDGE__ ?? null;
  const eligibility = () => {
    if (activeProfileReader() !== AVR_PROFILE) return { eligible: false, code: 'X48_PROFILE_UNAVAILABLE' };
    try { return bridge()?.eligibility?.() ?? { eligible: false, code: 'X48_RUNTIME_BRIDGE_UNAVAILABLE' }; }
    catch { return { eligible: false, code: 'X48_ELIGIBILITY_INVALID' }; }
  };
  const paint = () => {
    const eligible = eligibility();
    const running = state.phase === 'running';
    const rows = state.result?.rows ?? [];
    for (const panel of panels) {
      panel.dataset.state = state.phase;
      panel.querySelector('[data-x48-state]').textContent = running
        ? `Running ${rows.length}/${X48_TICK_COUNT}`
        : state.phase === 'ready' && !eligible.eligible ? 'Unavailable' : state.phase;
      panel.querySelector('[data-x48-start]').disabled = running || !eligible.eligible;
      panel.querySelector('[data-x48-cancel]').hidden = !running;
      panel.querySelector('[data-x48-message]').textContent = running || state.phase !== 'ready'
        ? state.message : eligible.message ?? 'Fresh exact thermostat Build required.';
      panel.querySelector('[data-x48-result]').textContent = state.result
        ? `${state.result.status} · ${rows.length}/${X48_TICK_COUNT} rows${state.result.reason ? ` · ${state.result.reason}` : ''}`
        : 'No transient result.';
      panel.querySelector('[data-x48-output]').hidden = rows.length === 0;
      panel.querySelector('[data-x48-rows]').replaceChildren(...rows.map((row) => {
        const tr = document.createElement('tr');
        for (const text of [
          String(row.tick),
          `${(row.inputMilliC / 1000).toFixed(3)} °C`,
          `${row.observedD13.mode}/${row.observedD13.level ? 'HIGH' : 'LOW'} · ${row.matched ? 'matches' : 'contradiction'}`,
          row.nominalTargetCycle.toLocaleString('en-US'),
          `${row.actualSampleCycle.toLocaleString('en-US')} / +${row.latenessCycles}`,
          `${(row.nextMilliC / 1000).toFixed(3)} °C @ ${row.inputAppliedCycle.toLocaleString('en-US')}`,
        ]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
        return tr;
      }));
    }
    return structuredClone(state);
  };
  for (const panel of panels) {
    panel.querySelector('[data-x48-start]').addEventListener('click', () => {
      state = { phase: 'running', message: 'Starting at cycle zero…', result: null };
      paint(); document.dispatchEvent(new CustomEvent('x48-start-request'));
    });
    panel.querySelector('[data-x48-cancel]').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('x48-cancel-request'));
    });
  }
  document.addEventListener('x48-state', (event) => {
    const detail = event.detail ?? {};
    const phase = detail.kind === 'x48-started' || detail.kind === 'x48-progress' ? 'running'
      : detail.kind === 'x48-complete' ? detail.result?.status ?? 'indeterminate'
        : detail.kind === 'x48-cancelled' || detail.kind === 'x48-indeterminate' ? 'indeterminate'
          : 'indeterminate';
    state = { phase, message: detail.message ?? (phase === 'running'
      ? `Executing bounded worker slices; ${detail.result?.rows?.length ?? 0}/${X48_TICK_COUNT} rows retained.`
      : phase === 'passed' ? `Loop complete: all ${detail.result?.rows?.length ?? 0}/${X48_TICK_COUNT} retained rows matched.`
        : detail.result?.reason ?? 'Loop ended without complete evidence.'),
    result: detail.result ? structuredClone(detail.result) : null };
    paint();
  });
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'source') invalidate('X48_SOURCE_EDITED');
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'board-select') invalidate('X48_PROFILE_CHANGED');
    else if (event.target?.id === 'project-open-input') invalidate('X48_PROJECT_OPENED');
  }, true);
  const Observer = document.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(() => paint()) : null;
  if (observer) {
    for (const selector of ['#project-message', '#build-state', '#quick-state', '#wire-state']) {
      const node = document.querySelector(selector);
      if (node) observer.observe(node, { childList: true, characterData: true, subtree: true });
    }
  }
  const invalidate = (reason) => {
    state = { phase: 'indeterminate', message: reason, result: state.result
      ? { ...state.result, status: 'indeterminate', reason } : null };
    return paint();
  };
  const api = Object.freeze({ refresh: paint, invalidate, snapshot: () => structuredClone(state) });
  document.defaultView.__X48_ROOM_LOOP__ = api;
  paint();
  return api;
}

function installX49OffsetComparison(document, activeProfileReader) {
  const panels = [...document.querySelectorAll('[data-shared-instrument-tools]')].map((tools, index) => {
    const panel = createX49Panel(document, index + 1);
    tools.append(panel);
    return panel;
  });
  const owner = createX49ProjectionOwner();
  const authoring = createX49PublicAuthoringOwner();
  const runner = createX49PublicRunner({
    contextReader: () => structuredClone(document.defaultView.__M6_STATE__ ?? {}),
    authoringReader: () => authoring.snapshot(),
  });
  let runnerSnapshot = runner.snapshot();
  let eligibilityEpoch = 0;
  let nativeEligibility = { eligible: false, code: 'X49_PUBLIC_ELIGIBILITY_CHECKING' };
  let savedControlState = null;
  const ordinaryControlIds = Object.freeze([
    'build', 'run', 'pause', 'reset', 'stop', 'quick-build', 'quick-run', 'quick-pause',
    'quick-reset', 'quick-stop', 'project-new', 'project-demo', 'project-open',
  ]);
  const nativeEntry = (entry) => runnerSnapshot.projection?.cases?.find(
    (candidate) => candidate.authored.offsetC === entry.authored.offsetC,
  ) ?? null;
  const eligibilityMessage = (code) => ({
    X49_PUBLIC_ELIGIBILITY_CHECKING: 'Checking the exact thermostat source, graph and project revision.',
    X49_PUBLIC_AUTHORING_NOT_NATIVE: 'Native comparison requires the exact +1 °C authored offset.',
    X49_PUBLIC_GRAPH_AUTHORITY_INVALID: 'Native comparison requires the exact AVR thermostat example and wiring graph.',
    X49_PUBLIC_SOURCE_AUTHORITY_INVALID: 'Native comparison requires the exact unedited AVR thermostat source.',
    X49_PUBLIC_PROFILE_AUTHORITY_INVALID: 'Native comparison is available only for the AVR thermostat profile.',
    X49_PUBLIC_NORMAL_OPERATION_ACTIVE: 'Finish the ordinary build or run before starting this comparison.',
    X49_PUBLIC_AUTHORITY_RETIRED: 'The project changed while eligibility was checked; refresh the exact thermostat example.',
  }[code] ?? 'Native comparison is unavailable for the current project authority.');
  const previewEntries = (snapshot) => {
    if (runnerSnapshot.projection?.cases?.length) return runnerSnapshot.projection.cases;
    if (snapshot.classification === 'synthetic-browser-replay-not-native-evidence') return snapshot.cases;
    const selected = authoring.snapshot();
    const values = selected.offsetC === 0 ? [selected] : [calculateX49PublicPreview(0), selected];
    return values.map((value) => ({
      caseId: value.offsetC === 0 ? 'baseline-offset-0' : `candidate-offset-${value.offsetC}`,
      authored: { referenceTemperatureC: value.referenceTemperatureC,
        offsetC: value.offsetC, effectiveTemperatureC: value.effectiveTemperatureC },
      calculated: value.calculated,
      native: nativeEntry(value),
    }));
  };
  const reflectMutualExclusion = () => {
    const active = runner.active();
    const controls = ordinaryControlIds.map((id) => document.getElementById(id)).filter(Boolean);
    if (active && !savedControlState) {
      savedControlState = new Map(controls.map((control) => [control, control.disabled]));
      for (const control of controls) {
        control.disabled = true;
        control.setAttribute('aria-disabled', 'true');
        control.dataset.x49Excluded = 'true';
      }
    } else if (!active && savedControlState) {
      for (const [control, disabled] of savedControlState) {
        control.disabled = disabled;
        control.removeAttribute('aria-disabled');
        delete control.dataset.x49Excluded;
      }
      savedControlState = null;
    }
  };
  const paint = (snapshot = owner.snapshot()) => {
    const available = activeProfileReader() === AVR_PROFILE;
    const authored = authoring.snapshot();
    const running = runner.active();
    const x48Active = Boolean(document.defaultView.__X48_RUNTIME_BRIDGE__?.active?.());
    const nativeAvailable = available && nativeEligibility.eligible && !x48Active;
    const visualPhase = snapshot.classification === 'synthetic-browser-replay-not-native-evidence'
      ? 'synthetic-replay' : snapshot.state === 'invalidated' ? 'invalidated' : runnerSnapshot.phase;
    reflectMutualExclusion();
    for (const panel of panels) {
      panel.dataset.state = available ? visualPhase : 'unavailable';
      panel.querySelector('[data-x49-state]').textContent = !available ? 'Unavailable for this profile'
        : !nativeEligibility.eligible && runnerSnapshot.phase === 'ready'
          ? nativeEligibility.code === 'X49_PUBLIC_ELIGIBILITY_CHECKING' ? 'Checking native eligibility' : 'Native unavailable'
        : visualPhase === 'synthetic-replay' ? 'Synthetic replay · not native'
          : visualPhase === 'invalidated' ? 'Cleared'
            : runnerSnapshot.phase === 'passed' ? 'Native academic pass'
          : runnerSnapshot.phase === 'preview-only' ? 'Calculated preview'
            : runnerSnapshot.phase === 'retired' ? 'Retired'
              : runnerSnapshot.phase === 'ready' ? 'Ready' : runnerSnapshot.phase.replaceAll('-', ' ');
      panel.querySelector('[data-x49-preview]').disabled = !available;
      panel.querySelector('[data-x49-offset]').disabled = !available || running;
      panel.querySelector('[data-x49-native]').disabled = !nativeAvailable || running
        || authored.offsetC !== X49_PUBLIC_NATIVE_OFFSET;
      panel.querySelector('[data-x49-cancel]').hidden = !running;
      const output = panel.querySelector('[data-x49-output]');
      const entries = previewEntries(snapshot);
      output.hidden = !available || visualPhase === 'invalidated'
        || (!entries.length && runnerSnapshot.phase === 'ready');
      const rows = entries.map((entry) => {
        const row = document.createElement('tr');
        const native = entry.native?.native ?? entry.native;
        let nativeText = 'Unavailable · requires a fresh source/artifact/model/worker/time/input-bound instrumented mailbox observation.';
        if (runnerSnapshot.phase === 'passed' && native) {
          nativeText = `Browser-native pass · ADC ${native.adc.value} · firmware ${native.firmwareTransaction.temperatureC} °C · D13 ${native.pin.level ? 'HIGH' : 'LOW'} · cycle ${native.time.cpuCycles.toLocaleString('en-US')} · five writes · zero drops`;
        } else if (snapshot.classification === 'synthetic-browser-replay-not-native-evidence' && native) {
          nativeText = entry.outcome?.academicStatus === 'indeterminate'
            ? `Synthetic replay only · indeterminate (${entry.outcome.reason}) · cannot pass native acceptance`
            : `Synthetic replay only · ${entry.outcome?.academicStatus ?? 'unavailable'} · ADC ${native.adc.value} completed at cycle ${native.adc.completionCycle.toLocaleString('en-US')} · mailbox ${native.firmwareTransaction.temperatureC} °C · D13 ${native.pin.level ? 'HIGH' : 'LOW'} · cannot pass native acceptance`;
        }
        const cells = [
          entry.caseId,
          `Reference ${entry.authored.referenceTemperatureC} °C · offset ${entry.authored.offsetC >= 0 ? '+' : ''}${entry.authored.offsetC} °C · effective ${entry.authored.effectiveTemperatureC} °C`,
          `${entry.calculated.modelVoltage.toFixed(3)} V ideal model · ADC ${entry.calculated.adcCount} · firmware integer ${entry.calculated.firmwareIntegerC} °C · D13 ${entry.calculated.d13Level ? 'HIGH' : 'LOW'}`,
          nativeText,
          'Absent · no hardware, tolerance, probability or factory guarantee.',
        ];
        for (const text of cells) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); }
        return row;
      });
      panel.querySelector('[data-x49-rows]').replaceChildren(...rows);
      panel.querySelector('[data-x49-message]').textContent = !available
        ? 'The fixed comparison is available only for the AVR thermostat teaching case.'
        : !nativeEligibility.eligible && !running
          ? eligibilityMessage(nativeEligibility.code)
        : visualPhase === 'invalidated'
          ? `${snapshot.reason}. The transient comparison and any replay were cleared.`
          : visualPhase === 'synthetic-replay'
            ? 'Synthetic browser replay is visible for UI verification only. Academic/native status remains unavailable.'
            : runnerSnapshot.message;
    }
    return { ...snapshot, authoring: authored, runner: runner.snapshot() };
  };
  const refreshEligibility = async () => {
    const token = ++eligibilityEpoch;
    nativeEligibility = { eligible: false, code: 'X49_PUBLIC_ELIGIBILITY_CHECKING' };
    paint(owner.snapshot());
    const checked = await runner.eligibility();
    if (token !== eligibilityEpoch) return;
    nativeEligibility = checked;
    paint(owner.snapshot());
  };
  const synchronizeOffsets = (offsetC) => {
    for (const candidate of panels) candidate.querySelector('[data-x49-offset]').value = String(offsetC);
  };
  for (const panel of panels) {
    panel.querySelector('[data-x49-offset]').addEventListener('change', (event) => {
      const offsetC = Number(event.target.value);
      const wasActive = runner.active();
      authoring.select(offsetC); synchronizeOffsets(offsetC);
      if (wasActive) {
        void runner.retire('X49_PUBLIC_AUTHORING_CHANGED'); owner.invalidate('X49_PUBLIC_AUTHORING_CHANGED');
      } else runner.previewOnly('Calculated preview only; no compiler request or worker was started.');
      paint(owner.preview());
      void refreshEligibility();
    });
    panel.querySelector('[data-x49-preview]').addEventListener('click', () => {
      runner.previewOnly('Calculated preview only; no compiler request or worker was started.');
      paint(owner.preview());
    });
    panel.querySelector('[data-x49-native]').addEventListener('click', () => {
      if (document.defaultView.__X48_RUNTIME_BRIDGE__?.active?.()) {
        runner.previewOnly('X48 owns the current worker; cancel the ideal room loop before starting X49.');
        paint(owner.snapshot()); return;
      }
      void runner.start().catch(() => {}).finally(() => paint(owner.snapshot()));
    });
    panel.querySelector('[data-x49-cancel]').addEventListener('click', () => {
      void runner.cancel('X49_PUBLIC_USER_CANCELLED').finally(() => paint(owner.snapshot()));
    });
  }
  runner.subscribe((value) => { runnerSnapshot = value; paint(owner.snapshot()); });
  const invalidate = (reason) => {
    if (runner.active() || runner.snapshot().phase === 'passed') void runner.retire(reason);
    const painted = paint(owner.invalidate(reason));
    void refreshEligibility();
    return painted;
  };
  const invalidationEvents = new Map([
    ['build', 'X49_BUILD_STARTED'], ['run', 'X49_RUN_STARTED'], ['reset', 'X49_RESET'],
    ['stop', 'X49_RUNTIME_RETIRED'], ['project-new', 'X49_NEW_PROJECT'],
    ['project-demo', 'X49_EXAMPLE_OPENED'], ['project-open', 'X49_OPEN_STARTED'],
  ]);
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'source') invalidate('X49_SOURCE_EDITED');
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'board-select') invalidate('X49_PROFILE_CHANGED');
    else if (event.target?.id === 'project-open-input') invalidate('X49_PROJECT_OPENED');
  }, true);
  document.addEventListener('click', (event) => {
    const reason = invalidationEvents.get(event.target?.id);
    if (reason) {
      if (runner.active()) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
      invalidate(reason);
    }
  }, true);
  Object.defineProperty(document.defaultView, '__AGENT_ACTIONS__', {
    configurable: true,
    get() { return this.__x49AgentActions ?? undefined; },
    set(value) {
      const original = value;
      this.__x49AgentActions = Object.freeze({ ...original,
        execute: async (source) => {
          let action = source?.action;
          if (!action && typeof source === 'string') {
            try { action = JSON.parse(source).action; } catch { action = null; }
          }
          if (runner.active() && ['firmware.build', 'runtime.run', 'project.create'].includes(action)) {
            return { ok: false, executed: false, code: 'X49_PUBLIC_OPERATION_ACTIVE', action };
          }
          return original.execute(source);
        },
      });
    },
  });
  const api = Object.freeze({
    refresh: () => { void refreshEligibility(); return paint(owner.snapshot()); },
    preview: () => paint(owner.preview()),
    invalidate,
    snapshot: () => owner.snapshot(),
    fixedCases: () => structuredClone(X49_CASES),
    authoring: () => authoring.snapshot(),
    runner: () => runner.snapshot(),
    startNative: () => runner.start(),
    cancelNative: () => runner.cancel(),
    acceptSyntheticReplay: async (report) => paint(await owner.acceptSyntheticReplay(report)),
  });
  document.defaultView.__X49_OFFSET_COMPARISON__ = api;
  paint();
  void refreshEligibility();
  return api;
}

export function mountSharedWorkbenchShell(document) {
  const legacy = mountLegacySharedWorkbenchShell(document);
  const adapterMap = new Map(sharedWorkbenchAdapters().map((adapter) => [adapter.profile, adapter]));
  const roots = new Map([...adapterMap].map(([profile, adapter]) => [profile, document.querySelector(adapter.root)]));
  const parking = document.createElement('div');
  parking.id = 'workbench-surface-parking';
  parking.hidden = true;
  document.body.append(parking);

  const canvasMount = document.querySelector('#active-canvas-mount');
  const controllerMount = document.querySelector('#top-controller-controls');
  const primaryMount = document.querySelector('#top-primary-controls');
  const profilePicker = document.querySelector('.controller-profile-picker');
  const quickControls = document.querySelector('#quick-controls');
  if (!canvasMount || !controllerMount || !primaryMount || !profilePicker || !quickControls) {
    throw new Error('SHARED_WORKBENCH_TOP_SHELL_MISSING');
  }
  controllerMount.append(profilePicker);
  primaryMount.append(quickControls);

  const openerSelectors = {
    project: '#project-files-open',
    parts: '#toggle-catalog',
    inspector: '#toggle-inspector',
    firmware: '#firmware-open',
    brief: '#brief-tests-open',
    instruments: '#instruments-open',
    help: '#help-limits-open',
  };
  const popupByName = new Map(SHARED_WORKBENCH_DIALOGS.map((name) => {
    const dialog = document.querySelector('#workbench-' + name + '-dialog');
    const mount = dialog?.querySelector('[data-workbench-popup-mount="' + name + '"]');
    const opener = document.querySelector(openerSelectors[name]);
    if (!dialog || !mount || !opener) throw new Error('SHARED_WORKBENCH_DIALOG_MISSING:' + name);
    return [name, { dialog, mount, opener }];
  }));
  const common = {
    recovery: document.querySelector('#browser-draft-recovery'),
    history: document.querySelector('#local-history'),
    navigation: document.querySelector('#project-navigation'),
    brief: document.querySelector('#project-brief'),
    prompt: document.querySelector('#prompt-drawer'),
    controller: document.querySelector('#controller-workbench'),
    desktop: document.querySelector('.desktop-required'),
  };
  if (Object.values(common).some((node) => !node)) throw new Error('SHARED_WORKBENCH_COMMON_SURFACE_MISSING');

  const resolveProfileNodes = (profile) => {
    const adapter = adapterMap.get(profile);
    const root = roots.get(profile);
    if (!adapter || !root) throw new Error('SHARED_WORKBENCH_PROFILE_UNKNOWN');
    const shared = (surface) => root.querySelector('[data-shared-surface="' + surface + '"]');
    if (profile === AVR_PROFILE) {
      return {
        canvas: root.querySelector(adapter.canvas),
        project: [document.querySelector('#project-bar'), common.recovery, common.history],
        parts: [root.querySelector(adapter.parts)],
        inspector: [root.querySelector(adapter.inspector)],
        firmware: [document.querySelector('#firmware-drawer')],
        brief: [common.navigation, common.brief, common.prompt],
        instruments: [document.querySelector('#runtime-drawer'), document.querySelector('#serial-dock')],
        help: [common.desktop, common.controller],
      };
    }
    return {
      canvas: shared('canvas'),
      project: [root.querySelector('.shared-project-bar'), common.recovery, common.history],
      parts: [shared('parts')],
      inspector: [shared('inspector')],
      firmware: [shared('source')],
      brief: [common.navigation, common.brief],
      instruments: [shared('runtime')],
      help: [common.desktop, common.controller],
    };
  };

  // Resolve every real surface exactly once while it still lives below its
  // profile root. The shell subsequently moves those nodes between parking,
  // the active canvas stage and dialogs; querying the old roots after that
  // move would lose the authoritative node and invite accidental cloning.
  const resolvedProfileNodes = new Map(
    [...adapterMap.keys()].map((profile) => [profile, resolveProfileNodes(profile)]),
  );
  const profileNodes = (profile) => {
    const nodes = resolvedProfileNodes.get(profile);
    if (!nodes) throw new Error('SHARED_WORKBENCH_PROFILE_UNKNOWN');
    return nodes;
  };

  const everySurface = new Set();
  for (const profile of adapterMap.keys()) {
    const nodes = profileNodes(profile);
    everySurface.add(nodes.canvas);
    for (const name of SHARED_WORKBENCH_DIALOGS) {
      for (const node of nodes[name]) everySurface.add(node);
    }
  }
  for (const node of everySurface) {
    if (!node) throw new Error('SHARED_WORKBENCH_SURFACE_MISSING');
    parking.append(node);
  }
  for (const root of roots.values()) root?.classList.add('shared-parking-root');

  let activeProfile = AVR_PROFILE;
  let activeCanvas = null;
  let activePopup = null;
  let returnFocus = null;
  let viewMode = 'simple';
  const x42 = installX42TriggerCapture(document, () => activeProfile);
  const x43 = installX43AvrObservationProfile(document, () => activeProfile);
  const x47 = installX47PulsePreview(document, () => activeProfile);
  const x47Repeatable = installX47RepeatableInputs(document, () => activeProfile);
  const x48 = installX48RoomLoop(document, () => activeProfile);
  const x49 = installX49OffsetComparison(document, () => activeProfile);

  const viewButtons = Object.freeze({
    simple: document.querySelector('#workbench-view-simple'),
    advanced: document.querySelector('#workbench-view-advanced'),
  });
  const viewStatus = document.querySelector('#workbench-view-status');
  const more = document.querySelector('#workbench-more');
  const popupControls = document.querySelector('#workbench-popup-controls');
  const simplePartsDrawer = document.querySelector('#simple-parts-drawer');
  const simplePartsMount = document.querySelector('#simple-parts-mount');
  const simplePartsProfile = document.querySelector('#simple-parts-profile');
  const simplePartsEdit = document.querySelector('#simple-parts-edit');
  const simplePartsUndo = document.querySelector('#simple-parts-undo');
  const simplePartsSave = document.querySelector('#simple-parts-save');
  if (Object.values(viewButtons).some((node) => !node) || !viewStatus || !more || !popupControls
      || !simplePartsDrawer || !simplePartsMount || !simplePartsProfile || !simplePartsEdit
      || !simplePartsUndo || !simplePartsSave) {
    throw new Error('SHARED_WORKBENCH_VIEW_SWITCH_MISSING');
  }
  const simpleActionSelectors = Object.freeze({
    [AVR_PROFILE]: { undo: '#undo', save: '#project-save' },
    [RP2040_PROFILE]: { undo: '#pico-undo', save: '#pico-save' },
    [ESP32C3_PROFILE]: { undo: '#c3-undo', save: '#c3-save' },
    [STM32F429ZI_PROFILE]: { undo: '#stm32-undo', save: '#stm32-save' },
  });
  const advancedOnlySelector = [
    '#brief-tests-open', '#x81-assessment-open', '#presentation-open', '#canvas-annotations-open',
    '#build-list-export', '#accessible-svg-export',
    '#build-list-status', '#accessible-svg-status', '#local-history',
    '#project-navigation', '#project-brief', '#prompt-drawer',
    '#thermostat-experiment', '#regression-matrix',
  ].join(',');

  const popupFocusable = (dialog) => [...dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((node) => !node.hidden && node.getClientRects().length > 0);

  const restorePopupNodes = () => {
    if (!activePopup) return;
    const { mount } = popupByName.get(activePopup);
    for (const node of [...mount.children]) parking.append(node);
  };
  const closePopup = ({ restoreFocus = true } = {}) => {
    if (!activePopup) return false;
    const { dialog, opener } = popupByName.get(activePopup);
    const closingInstruments = activePopup === 'instruments';
    const focus = returnFocus;
    opener.setAttribute('aria-expanded', 'false');
    if (closingInstruments && activeProfile === AVR_PROFILE) {
      const serial = document.querySelector('#serial-dock');
      const serialTab = document.querySelector('#serial-tab');
      if (serial) serial.hidden = true;
      if (serialTab) serialTab.setAttribute('aria-expanded', 'false');
    }
    if (dialog.open) dialog.close('close');
    restorePopupNodes();
    activePopup = null;
    returnFocus = null;
    if (restoreFocus) queueMicrotask(() => {
      const target = focus?.isConnected && !focus.hidden ? focus : opener;
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
    return true;
  };
  const openPopup = (name, requestedOpener = null, { initialFocus = true } = {}) => {
    if (!SHARED_WORKBENCH_DIALOGS.includes(name)) throw new Error('SHARED_WORKBENCH_DIALOG_UNKNOWN');
    if (viewMode === 'simple' && name === 'brief') return false;
    if (viewMode === 'simple' && name === 'parts') {
      simplePartsDrawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      queueMicrotask(() => simplePartsDrawer.querySelector('input, button:not([disabled]), [tabindex="0"]')?.focus({ preventScroll: true }));
      return true;
    }
    if (activePopup) closePopup({ restoreFocus: false });
    const popup = popupByName.get(name);
    for (const node of profileNodes(activeProfile)[name]) popup.mount.append(node);
    if (name === 'instruments' && activeProfile === AVR_PROFILE) {
      const serial = document.querySelector('#serial-dock');
      const serialTab = document.querySelector('#serial-tab');
      if (serial) serial.hidden = false;
      if (serialTab) serialTab.setAttribute('aria-expanded', 'true');
    }
    activePopup = name;
    returnFocus = requestedOpener ?? document.activeElement ?? popup.opener;
    popup.opener.setAttribute('aria-expanded', 'true');
    popup.dialog.showModal();
    if (name === 'instruments') {
      x42.refresh(); x43.refresh(); void x47.refresh(); void x47Repeatable.refresh(); x48.refresh(); x49.refresh();
    }
    if (initialFocus) {
      const heading = popup.dialog.querySelector('h2');
      queueMicrotask(() => (heading ?? popupFocusable(popup.dialog)[0])?.focus({ preventScroll: true }));
    }
    return true;
  };

  const syncSimplePartsActions = () => {
    const selectors = simpleActionSelectors[activeProfile];
    const undo = document.querySelector(selectors.undo);
    const save = document.querySelector(selectors.save);
    simplePartsProfile.textContent = adapterMap.get(activeProfile).groupLabel;
    simplePartsUndo.disabled = !undo || undo.disabled;
    simplePartsSave.disabled = !save || save.disabled;
  };
  const mountSimpleParts = () => {
    if (viewMode !== 'simple') {
      for (const node of [...simplePartsMount.children]) parking.append(node);
      simplePartsDrawer.hidden = true;
      return;
    }
    if (activePopup === 'parts') closePopup({ restoreFocus: false });
    simplePartsDrawer.hidden = false;
    const activeParts = new Set(profileNodes(activeProfile).parts);
    for (const node of [...simplePartsMount.children]) if (!activeParts.has(node)) parking.append(node);
    for (const node of activeParts) simplePartsMount.append(node);
    syncSimplePartsActions();
  };
  simplePartsUndo.addEventListener('click', () => document.querySelector(simpleActionSelectors[activeProfile].undo)?.click());
  simplePartsSave.addEventListener('click', () => document.querySelector(simpleActionSelectors[activeProfile].save)?.click());
  simplePartsEdit.addEventListener('click', () => document.querySelector('#toggle-inspector')?.click());
  const SimpleActionObserver = document.defaultView?.MutationObserver;
  const simpleActionObserver = SimpleActionObserver ? new SimpleActionObserver(syncSimplePartsActions) : null;
  if (simpleActionObserver) {
    for (const selectors of Object.values(simpleActionSelectors)) {
      for (const selector of Object.values(selectors)) {
        const node = document.querySelector(selector);
        if (node) simpleActionObserver.observe(node, { attributes: true, attributeFilter: ['disabled'] });
      }
    }
  }

  const setViewMode = (nextMode, { focus = false } = {}) => {
    if (!SHARED_WORKBENCH_VIEW_MODES.includes(nextMode)) {
      throw new Error('SHARED_WORKBENCH_VIEW_MODE_UNKNOWN');
    }
    const focusedAdvancedOnly = document.activeElement?.closest?.(advancedOnlySelector);
    const closedBrief = nextMode === 'simple' && activePopup === 'brief';
    if (closedBrief) closePopup({ restoreFocus: false });
    viewMode = nextMode;
    more.open = nextMode === 'advanced';
    if (nextMode === 'simple') popupControls.prepend(quickControls);
    else primaryMount.append(quickControls);
    document.body.dataset.workbenchView = viewMode;
    mountSimpleParts();
    for (const [mode, button] of Object.entries(viewButtons)) {
      button.setAttribute('aria-pressed', String(mode === viewMode));
    }
    viewStatus.textContent = viewMode === 'simple'
      ? 'Simple view keeps the active project, circuit, source, runtime status, instruments, files, limits and diagnostics; advanced review tools are hidden.'
      : 'Advanced view shows all review and evidence tools.';
    if (focusedAdvancedOnly || closedBrief || focus) {
      const dialogClose = activePopup
        ? popupByName.get(activePopup)?.dialog.querySelector('.workbench-popup-close') : null;
      queueMicrotask(() => (dialogClose ?? viewButtons[viewMode]).focus({ preventScroll: true }));
    }
    document.defaultView?.requestAnimationFrame(() => {
      document.defaultView?.dispatchEvent(new document.defaultView.Event('resize'));
    });
    return viewMode;
  };
  for (const [mode, button] of Object.entries(viewButtons)) {
    button.addEventListener('click', () => setViewMode(mode));
  }

  for (const [name, popup] of popupByName) {
    popup.opener.setAttribute('aria-expanded', 'false');
    popup.opener.addEventListener('click', () => openPopup(name, popup.opener));
    popup.dialog.querySelector('.workbench-popup-close').addEventListener('click', () => closePopup());
    popup.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closePopup();
    });
    popup.dialog.addEventListener('keydown', (event) => {
      // Escape belongs to the top workbench popup. Handle it before the
      // document-level canvas shortcuts so closing a popup never cancels an
      // in-progress named-wire or reconnect draft behind it.
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePopup();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = popupFocusable(popup.dialog);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !popup.dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  const stageProfile = document.querySelector('#top-stage-profile');
  const stageState = document.querySelector('#top-stage-state');
  const stageDetail = document.querySelector('#top-stage-detail');
  const statusSelectors = {
    [AVR_PROFILE]: ['#quick-state', '#wire-state'],
    [RP2040_PROFILE]: ['#quick-state', '#pico-wire-state'],
    [ESP32C3_PROFILE]: ['#quick-state', '#c3-wire-state'],
    [STM32F429ZI_PROFILE]: ['#quick-state', '#stm32-wire-state'],
  };
  const syncStageStatus = () => {
    const adapter = adapterMap.get(activeProfile);
    const [stateSelector, detailSelector] = statusSelectors[activeProfile];
    stageProfile.textContent = document.querySelector('#board-select')?.selectedOptions?.[0]?.textContent
      ?? adapter.groupLabel;
    stageState.textContent = document.querySelector(stateSelector)?.textContent ?? 'Current project';
    stageDetail.textContent = document.querySelector(detailSelector)?.textContent ?? 'Use named pins and validated connections.';
  };
  const Observer = document.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(syncStageStatus) : null;
  if (observer) {
    for (const selectors of Object.values(statusSelectors)) {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node) observer.observe(node, { childList: true, characterData: true, subtree: true });
      }
    }
  }

  const api = Object.freeze({
    activate(profile) {
      if (!roots.has(profile)) throw new Error('SHARED_WORKBENCH_PROFILE_UNKNOWN');
      const nextCanvas = profileNodes(profile).canvas;
      if (profile === activeProfile && activeCanvas === nextCanvas) {
        syncStageStatus();
        mountSimpleParts();
        return;
      }
      if (profile !== activeProfile) {
        x42.invalidate('X42_PROFILE_CHANGED');
        x43.invalidate('X43_PROFILE_CHANGED');
        x47.invalidate('X47_PROFILE_CHANGED');
        x47Repeatable.invalidate('X47_REPEATABLE_PROFILE_CHANGED');
        x48.invalidate('X48_PROFILE_CHANGED');
        x49.invalidate('X49_PROFILE_CHANGED');
      }
      closePopup();
      if (activeCanvas) parking.append(activeCanvas);
      activeProfile = profile;
      legacy.activate(profile);
      activeCanvas = nextCanvas;
      canvasMount.append(activeCanvas);
      activeCanvas.removeAttribute('aria-hidden');
      mountSimpleParts();
      syncStageStatus();
      document.defaultView?.requestAnimationFrame(() => {
        document.defaultView?.dispatchEvent(new document.defaultView.Event('resize'));
      });
    },
    toggle(surface) {
      if (!['parts', 'inspector'].includes(surface)) throw new Error('SHARED_WORKBENCH_TOGGLE_UNKNOWN');
      openPopup(surface, popupByName.get(surface).opener);
      return false;
    },
    openDialog(name, opener = null, options = {}) { return openPopup(name, opener, options); },
    closeDialog(options = {}) { return closePopup(options); },
    openSerial() {
      openPopup('instruments', document.activeElement ?? popupByName.get('instruments').opener);
      const serial = activeProfile === AVR_PROFILE
        ? document.querySelector('#serial-dock')
        : profileNodes(activeProfile).instruments[0]?.querySelector('[data-shared-surface="serial"]');
      if (!serial) return false;
      const drawer = serial.closest('details');
      if (drawer) drawer.open = true;
      serial.setAttribute('tabindex', '-1');
      serial.focus({ preventScroll: true });
      const mount = serial.closest('.workbench-popup-mount');
      if (mount) mount.scrollTop = Math.max(0, serial.offsetTop - 12);
      return true;
    },
    activeDialog() { return activePopup; },
    viewMode() { return viewMode; },
    setViewMode(mode, options = {}) { return setViewMode(mode, options); },
    adapter(profile = activeProfile) { return sharedWorkbenchAdapter(profile); },
  });
  setViewMode('simple');
  api.activate(AVR_PROFILE);
  return api;
}
