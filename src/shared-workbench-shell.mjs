// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  AVR_PROFILE,
  ESP32C3_PROFILE,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
} from './compile-targets.mjs';
import { instrumentCapability } from './instrument-capabilities.mjs';

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
        project: [document.querySelector('#project-bar'), common.history],
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
      project: [root.querySelector('.shared-project-bar'), common.history],
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
  let viewMode = 'advanced';

  const viewButtons = Object.freeze({
    simple: document.querySelector('#workbench-view-simple'),
    advanced: document.querySelector('#workbench-view-advanced'),
  });
  const viewStatus = document.querySelector('#workbench-view-status');
  if (Object.values(viewButtons).some((node) => !node) || !viewStatus) {
    throw new Error('SHARED_WORKBENCH_VIEW_SWITCH_MISSING');
  }
  const advancedOnlySelector = [
    '#brief-tests-open', '#build-list-export', '#accessible-svg-export',
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
    const focus = returnFocus;
    opener.setAttribute('aria-expanded', 'false');
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
    if (activePopup) closePopup({ restoreFocus: false });
    const popup = popupByName.get(name);
    for (const node of profileNodes(activeProfile)[name]) popup.mount.append(node);
    activePopup = name;
    returnFocus = requestedOpener ?? document.activeElement ?? popup.opener;
    popup.opener.setAttribute('aria-expanded', 'true');
    popup.dialog.showModal();
    if (initialFocus) {
      const heading = popup.dialog.querySelector('h2');
      queueMicrotask(() => (heading ?? popupFocusable(popup.dialog)[0])?.focus({ preventScroll: true }));
    }
    return true;
  };

  const setViewMode = (nextMode, { focus = false } = {}) => {
    if (!SHARED_WORKBENCH_VIEW_MODES.includes(nextMode)) {
      throw new Error('SHARED_WORKBENCH_VIEW_MODE_UNKNOWN');
    }
    const focusedAdvancedOnly = document.activeElement?.closest?.(advancedOnlySelector);
    const closedBrief = nextMode === 'simple' && activePopup === 'brief';
    if (closedBrief) closePopup({ restoreFocus: false });
    viewMode = nextMode;
    document.body.dataset.workbenchView = viewMode;
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
      closePopup();
      if (activeCanvas) parking.append(activeCanvas);
      activeProfile = profile;
      legacy.activate(profile);
      activeCanvas = profileNodes(profile).canvas;
      canvasMount.append(activeCanvas);
      activeCanvas.removeAttribute('aria-hidden');
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
      return true;
    },
    activeDialog() { return activePopup; },
    viewMode() { return viewMode; },
    setViewMode(mode, options = {}) { return setViewMode(mode, options); },
    adapter(profile = activeProfile) { return sharedWorkbenchAdapter(profile); },
  });
  setViewMode('advanced');
  api.activate(AVR_PROFILE);
  return api;
}
