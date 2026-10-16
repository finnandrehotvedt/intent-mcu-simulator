// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  CATALOG_CATEGORIES,
  COMPONENT_CATALOG,
  SUPPORT_STATUS,
  catalogEntries,
  defaultProperties,
  filterCatalog,
} from '../src/component-catalog.mjs';
import { CIRCUIT_SCHEMA, validateCircuit } from '../src/circuit-engine.mjs';
import {
  commandBuildRelevance,
  ProjectEditorReducer,
  createEmptyProject,
  endpointConnection,
  exportCanonicalProject,
  generatePromptBridgeV2,
  newComponent,
  parsePromptBridgeV2,
  projectFromCircuit,
} from '../src/project-editor.mjs';
import { PROJECT_RECOVERY_KEY, PROJECT_STORAGE_KEY, migrateProjectV1, parseProjectV2 } from '../src/project-v2.mjs';
import {
  addRouteJog,
  isRouteFamily,
  materializeRouteFamily,
  moveRouteSegment,
  routeFamilyPaths,
  routeSegmentOrientation,
} from '../src/route-model.mjs';
import { explainError } from '../src/error-catalog.mjs';
import { createLifecycleState, transitionLifecycle } from '../src/lifecycle.mjs';
import { createExampleProject, exampleCatalog } from '../src/example-projects.mjs';
import {
  TEMPERATURE_LCD_THRESHOLD_CARD,
  TEMPERATURE_LCD_THRESHOLD_EXAMPLE_ID,
  createTemperatureLcdThresholdExample,
  openTemperatureLcdThresholdExample,
} from '../expansion-drafts/temperature-lcd-threshold-example-v1.mjs';
import {
  AVR_PROFILE,
  ESP32C3_PROFILE,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
  candidateCompilerTarget,
  firstMissingTargetPrerequisite,
  targetAvailabilitySnapshot,
} from '../src/compile-targets.mjs';
import {
  PUBLIC_CONTROLLER_VIEW_SCHEMA,
  publicControllerView,
  publicControllerViews,
} from '../src/public-controller-workbench-view.mjs';
import { Rp2040PublicWorkbench } from '../src/rp2040-public-workbench.mjs';
import { Esp32C3PublicWorkbench } from '../src/esp32c3-public-workbench.mjs';
import { Stm32PublicWorkbench } from '../src/stm32-public-workbench.mjs';
import { serialEventText, serialInputBytes, serialText } from '../src/serial-view.mjs';
import { CPU_CYCLES_PER_MILLISECOND, cursorCycles, waveformPaths } from '../src/waveform-view.mjs';
import { createComponentArtwork as createBaseComponentArtwork } from './component-artwork.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
  candidateContactControl,
  candidateRuntimeInputs,
  createCandidateUiComponent,
  createCandidateUiArtwork,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import {
  TEMPERATURE_MAX_C,
  TEMPERATURE_MIN_C,
  temperatureCToVoltage,
} from '../expansion-drafts/temperature-analogue-sensor-v1.mjs';
import {
  DIGITAL_LIGHT_THRESHOLD_TYPE,
  LIGHT_HYSTERESIS_MAX_POINTS,
  LIGHT_HYSTERESIS_MIN_POINTS,
  LIGHT_LEVEL_MAX_PERCENT,
  LIGHT_LEVEL_MIN_PERCENT,
  LIGHT_THRESHOLD_MAX_PERCENT,
  LIGHT_THRESHOLD_MIN_PERCENT,
} from '../expansion-drafts/digital-light-threshold-module-v1.mjs';
import { COMMON_CATHODE_RGB_LED_TYPE } from '../expansion-drafts/common-cathode-rgb-led-v1.mjs';
import { ACTIVE_BUZZER_TYPE } from '../expansion-drafts/active-buzzer-module-v1.mjs';
import { SEVEN_SEGMENT_TYPE } from '../expansion-drafts/seven-segment-common-cathode-v1.mjs';
import {
  CHARACTER_LCD_TYPE,
  createCharacterLcd4BitDecoder,
} from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import {
  ROTARY_ENCODER_TYPE,
  nextRotaryEncoderDetent,
} from '../expansion-drafts/rotary-encoder-quadrature-v1.mjs';

const uiComponentCatalog = Object.freeze({ ...COMPONENT_CATALOG, ...CANDIDATE_UI_COMPONENTS });
function createComponentArtwork(definition, component, options = {}) {
  return CANDIDATE_UI_COMPONENTS[component.type]
    ? createCandidateUiArtwork(document, definition, component, options)
    : createBaseComponentArtwork(definition, component, options);
}

const byId = (id) => document.querySelector(`#${id}`);
const elements = Object.fromEntries([
  'source', 'build', 'cancel', 'build-state', 'diagnostics', 'worker-state', 'cycle', 'instructions', 'artifact', 'trace',
  'run', 'pause', 'step', 'reset', 'speed', 'canvas-title', 'circuit-canvas', 'canvas-transform', 'component-layer', 'circuit-wires',
  'graph-state', 'wire-state', 'circuit-diagnostics', 'serial-output', 'serial-count', 'serial-input', 'serial-send',
  'serial-clear', 'logic-output', 'logic-count', 'logic-channels', 'logic-window', 'logic-cursor', 'pin-select',
  'pin-mode', 'pin-level', 'pin-detail', 'pin-diagnostic', 'pin-cycle', 'catalog-search', 'catalog-category',
  'catalog-interface', 'catalog-status', 'catalog-supply-voltage', 'catalog-pin-voltage', 'catalog-favorites', 'catalog-count',
  'catalog-empty', 'catalog-clear',
  'catalog-list', 'catalog-prev', 'catalog-page', 'catalog-next', 'selection-name', 'property-editor', 'rotate-component', 'duplicate-component', 'delete-component',
  'selected-net', 'net-members', 'wire-color', 'wire-bends', 'selection-support', 'reconnect-mode', 'add-bend', 'delete-wire', 'remove-junction', 'zoom-value',
  'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'view-reset', 'fit-project', 'project-state',
  'project-message', 'project-name', 'project-new', 'project-demo', 'project-save', 'project-open', 'project-open-input', 'project-reload', 'project-export', 'project-import',
  'project-import-mode', 'undo', 'redo', 'prompt-generate', 'prompt-copy', 'prompt-output', 'prompt-response',
  'prompt-mode', 'prompt-apply', 'prompt-message', 'component-controls',
  'editor-title', 'source-file', 'source-file-name', 'source-file-add', 'source-file-remove',
  'lifecycle-state', 'technical-error', 'technical-error-detail', 'delete-branch',
  'example-select', 'walkthrough-open', 'walkthrough', 'recovery-export', 'quick-state', 'quick-build', 'quick-run', 'quick-pause', 'quick-reset',
  'toggle-catalog', 'toggle-inspector', 'catalog-resizer', 'inspector-resizer', 'show-pin-labels', 'focus-canvas', 'fullscreen-canvas',
  'source-lines', 'source-highlight', 'diagnostic-links', 'build-log', 'simulated-time', 'requested-speed', 'achieved-speed',
  'serial-text-mode', 'serial-event-mode', 'serial-export', 'serial-newline', 'logic-waveform', 'logic-cursor-a', 'logic-cursor-b',
  'serial-tab', 'serial-dock', 'serial-close', 'serial-resizer', 'serial-resume', 'serial-new-output',
  'canvas-select-mode', 'canvas-interact-mode',
  'starter-examples', 'starter-gallery', 'quick-controls', 'workbench-workspace',
  'board-select', 'controller-status', 'toolchain-boundary',
  'controller-workbench', 'controller-workbench-eyebrow', 'controller-workbench-title', 'controller-workbench-badge',
  'controller-workbench-summary', 'controller-capability-project', 'controller-capability-source',
  'controller-capability-runtime', 'controller-capability-circuit', 'controller-primary-action', 'controller-return-avr',
  'controller-workbench-limitation', 'controller-public-boundary', 'parked-circuit-notice',
  'firmware-drawer', 'prompt-drawer', 'runtime-drawer',
  'pico-public-workbench', 'pico-state', 'pico-project-name', 'pico-save', 'pico-open', 'pico-open-input',
  'pico-source', 'pico-build', 'pico-run', 'pico-pause', 'pico-reset', 'pico-stop', 'pico-message',
  'pico-source-hash', 'pico-artifact-hash', 'pico-diagram', 'pico-external-led', 'pico-circuit-state',
  'pico-disconnect', 'pico-reconnect', 'pico-serial',
  'c3-public-workbench', 'c3-state', 'c3-project-name', 'c3-save', 'c3-open', 'c3-open-input',
  'c3-source', 'c3-build', 'c3-run', 'c3-stop', 'c3-message', 'c3-source-hash', 'c3-flash-hash',
  'c3-diagram', 'c3-external-led', 'c3-circuit-state', 'c3-disconnect', 'c3-reconnect', 'c3-terminal',
  'stm32-public-workbench', 'stm32-state', 'stm32-project-name', 'stm32-save', 'stm32-open', 'stm32-open-input',
  'stm32-source', 'stm32-build', 'stm32-run', 'stm32-reset', 'stm32-stop', 'stm32-message',
  'stm32-source-hash', 'stm32-artifact-hash', 'stm32-diagram', 'stm32-external-led',
  'stm32-circuit-state', 'stm32-terminal',
].map((id) => [id.replaceAll('-', ''), byId(id)]));

const runtimeControls = [elements.run, elements.pause, elements.step, elements.reset, elements.speed];
const CATALOG_PREFERENCES_KEY = 'intent-mcu.catalog-preferences.v1';
const MAX_RECENT_COMPONENTS = 8;
const CATALOG_WINDOW_LIMIT = 80;

let editor;
let selectedComponentId = null;
let selectedNetId = null;
let pendingEndpoint = null;
let wireMode = 'connect';
let worker = null;
let workerToken = 0;
let runtimeWorkerCreations = 0;
let selectedCompilerProfile = AVR_PROFILE;
let activeJob = null;
let loadedSourceIdentity = null;
let running = false;
let lastWorkerMessage = 0;
let selectedSourceFile = 'main.ino';
let catalogPreferences = loadCatalogPreferences();
let catalogWindowStart = 0;
let catalogFixtureRecords = null;
let catalogBenchmarkSession = null;
let catalogFixturePriorFilters = null;
let routeDrag = null;
let componentDrag = null;
let acceptedRoutePaint = [];
let proposedRoutePaint = [];
let proposedRouteNetId = null;
let canvasPan = null;
let selectedRouteSegment = null;
let lifecycle = createLifecycleState();
let savedRevision = null;
let savedProjectGeneration = null;
let fileSavedRevision = null;
let fileSavedProjectGeneration = null;
let fileSaveState = null;
let projectFileHandle = null;
let buildAbortController = null;
let serialViewMode = 'text';
let lastThroughputSample = null;
let latestBuildResult = null;
let selection = { kind: 'none' };
let wireCycle = null;
let suppressCanvasClickUntil = 0;
let serialAutoscroll = true;
let serialRenderedRecords = 0;
let serialUnreadRecords = 0;
let serialResumeGuardUntil = 0;
let serialScrollFrame = null;
let canvasInteractionMode = 'select';
let activeCanvasButton = null;
const characterLcdRuntime = new Map();
const publicPreviewControlStates = new Map();
const publicPreviewRegions = [
  document.querySelector('.project-bar'),
  elements.workbenchworkspace,
  elements.firmwaredrawer,
  elements.promptdrawer,
  elements.runtimedrawer,
].filter(Boolean);
let picoPublicState = null;
let c3PublicState = null;
let stm32PublicState = null;

function renderPicoQuickControls(state = picoPublicState) {
  if (selectedCompilerProfile !== RP2040_PROFILE || !state) return;
  elements.quickstate.textContent = `Pico · ${state.phase} · ${state.circuitValid ? 'wiring valid' : state.circuitCode}`;
  elements.quickbuild.textContent = 'Build Pico';
  elements.quickrun.textContent = 'Run Pico';
  elements.quickpause.textContent = 'Pause';
  elements.quickreset.textContent = 'Reset';
  elements.quickbuild.disabled = state.phase === 'building';
  elements.quickrun.disabled = !state.runnable || ['running', 'starting'].includes(state.phase);
  elements.quickpause.disabled = !['running', 'paused'].includes(state.phase);
  elements.quickreset.disabled = !['running', 'paused'].includes(state.phase);
}

function renderC3QuickControls(state = c3PublicState) {
  if (selectedCompilerProfile !== ESP32C3_PROFILE || !state) return;
  elements.quickstate.textContent = `ESP32-C3 · ${state.phase} · ${state.circuitAccepted ? 'model wiring valid' : state.circuitCode}`;
  elements.quickbuild.textContent = 'Build C3';
  elements.quickrun.textContent = 'Run actual QEMU';
  elements.quickpause.textContent = 'Pause unavailable';
  elements.quickreset.textContent = 'Reset replay is part of Run';
  elements.quickbuild.disabled = state.phase === 'building' || state.phase === 'running';
  elements.quickrun.disabled = !state.runnable || state.phase === 'running';
  elements.quickpause.disabled = true;
  elements.quickreset.disabled = true;
}

function renderStm32QuickControls(state = stm32PublicState) {
  if (selectedCompilerProfile !== STM32F429ZI_PROFILE || !state) return;
  elements.quickstate.textContent = `STM32F429ZI · ${state.phase} · named PB0 circuit`;
  elements.quickbuild.textContent = 'Build STM32 ELF';
  elements.quickrun.textContent = 'Run actual Renode';
  elements.quickpause.textContent = 'Pause unavailable';
  elements.quickreset.textContent = 'Reset in fresh Renode';
  elements.quickbuild.disabled = ['building', 'running'].includes(state.phase);
  elements.quickrun.disabled = !state.runnable || ['building', 'running'].includes(state.phase);
  elements.quickpause.disabled = true;
  elements.quickreset.disabled = !state.runnable || ['building', 'running'].includes(state.phase);
}

const picoPublicWorkbench = new Rp2040PublicWorkbench({
  elements: {
    state: elements.picostate,
    name: elements.picoprojectname,
    save: elements.picosave,
    open: elements.picoopen,
    openInput: elements.picoopeninput,
    source: elements.picosource,
    build: elements.picobuild,
    run: elements.picorun,
    pause: elements.picopause,
    reset: elements.picoreset,
    stop: elements.picostop,
    message: elements.picomessage,
    sourceHash: elements.picosourcehash,
    artifactHash: elements.picoartifacthash,
    diagram: elements.picodiagram,
    externalLed: elements.picoexternalled,
    circuitState: elements.picocircuitstate,
    disconnect: elements.picodisconnect,
    reconnect: elements.picoreconnect,
    serial: elements.picoserial,
  },
  onState: (state) => {
    picoPublicState = state;
    window.__RP2040_PUBLIC_STATE__ = structuredClone(state);
    renderPicoQuickControls(state);
  },
});
window.__RP2040_PUBLIC_WORKBENCH__ = {
  state: () => picoPublicWorkbench.snapshot(),
  build: () => picoPublicWorkbench.build(),
  run: () => picoPublicWorkbench.run(),
  pause: () => picoPublicWorkbench.pause(),
  reset: () => picoPublicWorkbench.reset(),
  stop: () => picoPublicWorkbench.stop(),
};

const c3PublicWorkbench = new Esp32C3PublicWorkbench({
  elements: {
    state: elements.c3state,
    name: elements.c3projectname,
    save: elements.c3save,
    open: elements.c3open,
    openInput: elements.c3openinput,
    source: elements.c3source,
    build: elements.c3build,
    run: elements.c3run,
    stop: elements.c3stop,
    message: elements.c3message,
    sourceHash: elements.c3sourcehash,
    flashHash: elements.c3flashhash,
    diagram: elements.c3diagram,
    led: elements.c3externalled,
    circuitState: elements.c3circuitstate,
    disconnect: elements.c3disconnect,
    reconnect: elements.c3reconnect,
    terminal: elements.c3terminal,
  },
  onState: (state) => {
    c3PublicState = state;
    window.__ESP32C3_PUBLIC_STATE__ = structuredClone(state);
    renderC3QuickControls(state);
  },
});
window.__ESP32C3_PUBLIC_WORKBENCH__ = {
  state: () => c3PublicWorkbench.snapshot(),
  build: () => c3PublicWorkbench.build(),
  run: () => c3PublicWorkbench.run(),
  dispose: () => c3PublicWorkbench.dispose(),
};

const stm32PublicWorkbench = new Stm32PublicWorkbench({
  elements: {
    state: elements.stm32state,
    name: elements.stm32projectname,
    save: elements.stm32save,
    open: elements.stm32open,
    openInput: elements.stm32openinput,
    source: elements.stm32source,
    build: elements.stm32build,
    run: elements.stm32run,
    reset: elements.stm32reset,
    stop: elements.stm32stop,
    message: elements.stm32message,
    sourceHash: elements.stm32sourcehash,
    artifactHash: elements.stm32artifacthash,
    diagram: elements.stm32diagram,
    led: elements.stm32externalled,
    circuitState: elements.stm32circuitstate,
    terminal: elements.stm32terminal,
  },
  onState: (state) => {
    stm32PublicState = state;
    window.__STM32_PUBLIC_STATE__ = structuredClone(state);
    renderStm32QuickControls(state);
  },
});
window.__STM32_PUBLIC_WORKBENCH__ = {
  state: () => stm32PublicWorkbench.snapshot(),
  build: () => stm32PublicWorkbench.build(),
  run: () => stm32PublicWorkbench.run(false),
  reset: () => stm32PublicWorkbench.run(true),
  stop: () => stm32PublicWorkbench.stop(),
};

function setSelection(next) {
  selection = next?.kind ? structuredClone(next) : { kind: 'none' };
  selectedComponentId = selection.kind === 'component' ? selection.componentId : null;
  selectedNetId = ['wire-segment', 'net'].includes(selection.kind) ? selection.netId : null;
  selectedRouteSegment = selection.kind === 'wire-segment'
    ? {
      netId: selection.netId,
      endpoint: selection.endpoint,
      segmentIndex: selection.segmentIndex,
      orientation: selection.orientation,
    }
    : null;
  publish({
    selection: structuredClone(selection),
    selectedComponentId,
    selectedNetId,
    selectedRouteSegment: selectedRouteSegment ? structuredClone(selectedRouteSegment) : null,
  });
}

function selectComponent(componentId) {
  setSelection({ kind: 'component', componentId });
}

function selectWireSegment({ netId, endpoint, segmentIndex, orientation }) {
  setSelection({ kind: 'wire-segment', netId, endpoint, segmentIndex, orientation });
}

function selectNet(netId) {
  setSelection(netId ? { kind: 'net', netId } : { kind: 'none' });
}

function isTextEditingTarget(target) {
  return target instanceof Element
    && Boolean(target.closest('textarea,input,select,[contenteditable="true"],[contenteditable=""]'));
}

window.__M6_STATE__ = {
  buildState: 'dirty', artifactIdentity: null, inputIdentity: null, cacheHit: false,
  runtime: null, project: null, revision: 0, selectedComponentId: null,
  selectedNetId: null, selectedRouteSegment: null, selection: { kind: 'none' },
  importReport: null, lastAction: 'initialized',
  compilerTarget: AVR_PROFILE, compileAvailable: true, compileOnly: false,
  targetAvailability: targetAvailabilitySnapshot(AVR_PROFILE), artifactManifest: null,
  compilerRequestBlocked: false,
  runtimeWorkerCreations: 0,
};
window.__M3_STATE__ = window.__M6_STATE__;
window.__M4_STATE__ = window.__M6_STATE__;
window.__M5_STATE__ = window.__M6_STATE__;
window.__M7_STATE__ = window.__M6_STATE__;
window.__M11_STATE__ = window.__M6_STATE__;
window.__M3_READY__ = true; window.__M4_READY__ = true; window.__M5_READY__ = true; window.__M6_READY__ = true; window.__M7_READY__ = true;
window.__M11_READY__ = true;
window.__PUBLIC_CONTROLLER_PROJECTION__ = {
  schema: PUBLIC_CONTROLLER_VIEW_SCHEMA,
  selectedProfile: AVR_PROFILE,
  selected: publicControllerView(AVR_PROFILE),
  views: publicControllerViews(),
  publicRequests: [],
};

function publish(update) { Object.assign(window.__M6_STATE__, update); }
function renderLifecycle() {
  elements.lifecyclestate.textContent = lifecycle.phase;
  elements.lifecyclestate.dataset.phase = lifecycle.phase;
  elements.quickstate.textContent = `${currentProject().metadata.name} · ${lifecycle.phase}`;
  publish({ lifecycle: structuredClone(lifecycle) });
}
function applyLifecycle(event) {
  const result = transitionLifecycle(lifecycle, event);
  if (result.accepted) lifecycle = result.state;
  renderLifecycle();
  return result;
}
function clearTechnicalError() {
  elements.technicalerror.hidden = true;
  elements.technicalerrordetail.textContent = '';
}
function showActionableError(target, code, technical = code) {
  const explanation = explainError(code, technical);
  target.textContent = explanation.action;
  elements.technicalerrordetail.textContent = `${explanation.code}\n${explanation.technical}`;
  elements.technicalerror.hidden = false;
  return explanation;
}
function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function highlightSource(source) {
  const escaped = escapeHtml(source);
  return escaped.replace(/(\/\/[^\n]*)|(["'])(.*?)(\2)|\b(void|int|bool|char|long|float|double|if|else|for|while|return|const|unsigned|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP)\b|\b(\d+(?:\.\d+)?)\b/gu,
    (match, comment, quote, stringBody, closing, keyword, number) => {
      if (comment) return `<span class="tok-comment">${comment}</span>`;
      if (quote) return `<span class="tok-string">${quote}${stringBody}${closing}</span>`;
      if (keyword) return `<span class="tok-keyword">${keyword}</span>`;
      if (number) return `<span class="tok-number">${number}</span>`;
      return match;
    });
}
function renderSourceEditor() {
  const source = elements.source.value;
  const lineCount = Math.max(1, source.split('\n').length);
  elements.sourcelines.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
  elements.sourcehighlight.innerHTML = `${highlightSource(source)}\n`;
  elements.sourcelines.scrollTop = elements.source.scrollTop;
  elements.sourcehighlight.scrollTop = elements.source.scrollTop;
  elements.sourcehighlight.scrollLeft = elements.source.scrollLeft;
}
function navigateDiagnostic(diagnostic) {
  const targetName = diagnostic.file?.split('/').at(-1);
  if (targetName && currentProject().source.files.some((file) => file.name === targetName)) selectedSourceFile = targetName;
  renderProject();
  const lines = elements.source.value.split('\n');
  const line = Math.max(1, Math.min(lines.length, Number(diagnostic.line) || 1));
  const start = lines.slice(0, line - 1).reduce((count, value) => count + value.length + 1, 0);
  const end = start + lines[line - 1].length;
  elements.source.focus(); elements.source.setSelectionRange(start, end);
  elements.source.scrollTop = Math.max(0, (line - 4) * 21);
  renderSourceEditor();
}
function renderBuildDiagnostics(result, fallback = 'No compiler diagnostics.') {
  latestBuildResult = result ?? null;
  const diagnostics = result?.diagnostics ?? [];
  const grouped = diagnostics.filter((item) => item.severity === 'error' || item.severity === 'warning');
  elements.diagnostics.textContent = grouped.length ? grouped.map((item) => `${item.severity}: ${item.message}`).join('\n') : fallback;
  const buttons = grouped.map((diagnostic) => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${diagnostic.file?.split('/').at(-1) ?? 'source'}:${diagnostic.line ?? 1} · ${diagnostic.severity}`;
    button.addEventListener('click', () => navigateDiagnostic(diagnostic));
    return button;
  });
  elements.diagnosticlinks.replaceChildren(...buttons);
  elements.buildlog.textContent = result?.text || formatDiagnostics(result) || fallback;
}
function currentProject() { return editor.project; }
function currentRuntimeProject() { return editor.kind === 'candidate-project-v3' ? editor.runtimeProject : editor.project; }
function currentProjectText() {
  return editor.kind === 'candidate-project-v3' ? editor.saveText() : exportCanonicalProject(editor.project);
}
function currentCandidateInputs() {
  return editor.kind === 'candidate-project-v3' ? candidateRuntimeInputs(editor) : [];
}
function currentCompilerTarget() {
  return candidateCompilerTarget(selectedCompilerProfile) ?? candidateCompilerTarget(AVR_PROFILE);
}
function setPublicPreviewControls(preview) {
  const controls = publicPreviewRegions.flatMap((region) => [...region.querySelectorAll('button, input, select, textarea')])
    .filter((control) => control !== elements.boardselect);
  if (preview) {
    for (const control of controls) {
      if (!publicPreviewControlStates.has(control)) publicPreviewControlStates.set(control, control.disabled);
      control.disabled = true;
    }
    return;
  }
  for (const [control, disabled] of publicPreviewControlStates.entries()) control.disabled = disabled;
  publicPreviewControlStates.clear();
}
function renderPublicControllerWorkbench() {
  const view = publicControllerView(selectedCompilerProfile) ?? publicControllerView(AVR_PROFILE);
  const preview = !view.publicExecution;
  const pico = selectedCompilerProfile === RP2040_PROFILE;
  const c3 = selectedCompilerProfile === ESP32C3_PROFILE;
  const stm32 = selectedCompilerProfile === STM32F429ZI_PROFILE;
  const avr = selectedCompilerProfile === AVR_PROFILE;
  elements.controllerworkbench.dataset.mode = view.mode;
  elements.controllerworkbencheyebrow.textContent = view.eyebrow;
  elements.controllerworkbenchtitle.textContent = view.title;
  elements.controllerworkbenchbadge.textContent = preview ? 'Preview only' : (pico || c3 || stm32) ? 'Supported subset' : 'Supported';
  elements.controllerworkbenchbadge.className = `controller-badge ${preview ? 'preview' : 'supported'}`;
  elements.controllerworkbenchsummary.textContent = view.summary;
  elements.controllercapabilityproject.textContent = view.project;
  elements.controllercapabilitysource.textContent = view.source;
  elements.controllercapabilityruntime.textContent = view.runtime;
  elements.controllercapabilitycircuit.textContent = view.circuit;
  elements.controllerprimaryaction.textContent = view.action;
  elements.controllerprimaryaction.disabled = preview;
  elements.controllerreturnavr.hidden = avr;
  elements.controllerworkbenchlimitation.textContent = view.limitation;
  elements.controllerpublicboundary.textContent = preview
    ? 'Preview mode changes only this browser view. It cannot upload a project, call a private endpoint, build firmware, or create a runtime session.'
    : stm32
      ? 'Public STM32 source is compiled in a fixed network-disabled ARM toolchain and its strict ELF executes in a fresh network-disabled Renode container. Actual PB0/USART3 evidence and the ideal external teaching circuit are labelled separately; projects contain no executable.'
    : c3
      ? 'Public C3 source is compiled in a fixed network-disabled container and executed in a separate network-disabled Espressif QEMU container. QEMU CPU/UART evidence and the project-owned GPIO2 model are labelled separately; no executable is stored with the project.'
      : pico
      ? 'Public Pico source is compiled in a fixed networkless container, returned as a source-bound UF2, and executed only in this browser worker. No executable is stored with the project.'
      : 'Public AVR actions use the documented build service and one browser worker. Other controller previews never inherit those actions.';
  elements.startergallery.hidden = !avr;
  elements.firmwaredrawer.hidden = !avr;
  elements.promptdrawer.hidden = !avr;
  elements.runtimedrawer.hidden = !avr;
  elements.picopublicworkbench.hidden = !pico;
  elements.c3publicworkbench.hidden = !c3;
  elements.stm32publicworkbench.hidden = !stm32;
  elements.parkedcircuitnotice.hidden = true;
  elements.workbenchworkspace.hidden = !avr;
  elements.workbenchworkspace.setAttribute('aria-hidden', String(!avr));
  elements.togglecatalog.hidden = !avr;
  elements.toggleinspector.hidden = !avr;
  elements.quickbuild.textContent = preview ? 'Build unavailable' : pico ? 'Build Pico' : c3 ? 'Build C3' : stm32 ? 'Build STM32 ELF' : 'Build';
  elements.quickrun.textContent = preview ? 'Run unavailable' : pico ? 'Run Pico' : c3 ? 'Run actual QEMU' : stm32 ? 'Run actual Renode' : 'Run';
  elements.quickbuild.disabled = preview || (avr && elements.build.disabled);
  if (preview) {
    elements.quickrun.disabled = true;
    elements.quickpause.disabled = true;
    elements.quickreset.disabled = true;
  }
  setPublicPreviewControls(!avr);
  if (pico) renderPicoQuickControls();
  if (c3) renderC3QuickControls();
  if (stm32) renderStm32QuickControls();
  window.__PUBLIC_CONTROLLER_PROJECTION__.selectedProfile = view.profile;
  window.__PUBLIC_CONTROLLER_PROJECTION__.selected = view;
  publish({
    publicControllerView: structuredClone(view),
    publicExecutionEnabled: view.publicExecution,
    compilerRequestBlocked: preview,
  });
}
function renderCompilerTarget() {
  const target = currentCompilerTarget();
  const view = publicControllerView(target.profile) ?? publicControllerView(AVR_PROFILE);
  const availabilityRows = [
    ['Compiler', target.availability.installedCompiler],
    ['Compile target', target.availability.verifiedCompileTarget],
    ['Runtime', target.availability.emulatorRuntime],
    ['Peripherals', target.availability.validatedPeripherals],
  ].map(([label, state]) => `<span><strong>${label}:</strong> ${state.status} · <code>${state.code}</code></span>`).join(' ');
  elements.boardselect.value = target.profile;
  if (!target.compileAvailable) {
    const missing = firstMissingTargetPrerequisite(target.profile);
    elements.controllerstatus.textContent = `${view.label} · public preview only · Build and Run blocked.`;
    elements.toolchainboundary.innerHTML = `<strong>Public preview:</strong> ${target.profile}. ${availabilityRows} ${missing ? `<strong>Missing public prerequisite:</strong> ${missing.detail} ` : ''}<strong>Boundary:</strong> private evidence is status information only. No project upload, compiler, runtime or AVR circuit mapping is exposed for this profile.`;
  } else {
    if (target.profile === STM32F429ZI_PROFILE) {
      elements.controllerstatus.textContent = 'STM32F429ZI · bounded public C11 build + actual Renode PB0/USART3/reset replay.';
      elements.toolchainboundary.innerHTML = `<strong>Compiler:</strong> Arm GNU 14.3.1 · exact project-owned startup, runtime and linker contract. ${availabilityRows} <strong>Runtime:</strong> actual Renode 1.17.0 CPU, PB0 and USART3 observation across reset replay. <strong>Circuit boundary:</strong> the visible 220 Ω LED path is an ideal teaching rendering, not physical or analogue equivalence.`;
    } else if (target.profile === ESP32C3_PROFILE) {
      elements.controllerstatus.textContent = 'ESP32-C3 · bounded public source build + actual QEMU CPU/UART + separate GPIO2 model.';
      elements.toolchainboundary.innerHTML = `<strong>Compiler:</strong> Arduino CLI 1.5.1 · Arduino-ESP32 3.3.10 · esp-rv32 2601 · fixed DIO layout. ${availabilityRows} <strong>Runtime:</strong> actual Espressif QEMU esp32c3 CPU/UART. <strong>GPIO boundary:</strong> QEMU pin state is not observed; GPIO2 and LED are interpreted by the separately labelled IntentForce executed-register-write model.`;
    } else if (target.profile === RP2040_PROFILE) {
      elements.controllerstatus.textContent = 'RP2040 Pico · bounded public C11 build + browser-worker GPIO0/UART0 runtime.';
      elements.toolchainboundary.innerHTML = `<strong>Compiler:</strong> Arm GNU 14.3.1 · exact project-owned startup, runtime header and linker map. ${availabilityRows} <strong>Simulation:</strong> GPIO0 output, UART0 text, reset and the named GP0/GND LED path only; no SDK or full Pico claim.`;
    } else {
      elements.controllerstatus.textContent = 'ATmega328P · compile and tested virtual runtime.';
      elements.toolchainboundary.innerHTML = `<strong>Compiler:</strong> Arduino AVR core 1.8.8 · avr-gcc 7.3.0-atmel3.6.1-arduino7. ${availabilityRows} <strong>Simulation:</strong> only the <a href="#compatibility-note">documented MCU/peripheral subset</a>, not every library or device.`;
    }
  }
  publish({
    compilerTarget: target.profile,
    compileAvailable: target.compileAvailable,
    compileOnly: false,
    targetAvailability: targetAvailabilitySnapshot(target.profile),
  });
  renderPublicControllerWorkbench();
}
function parseEditorSource(source) {
  const candidate = openCandidateUiSession(source);
  if (candidate.ok) return { ok: true, code: candidate.code, session: candidate.session, report: candidate.schema };
  if (candidate.code !== 'CANDIDATE_UI_PROJECT_VERSION') return candidate;
  const parsed = parseProjectV2(source);
  if (!parsed.ok) return parsed;
  const project = structuredClone(parsed.project);
  // A digest in a saved project is provenance, never a loaded executable.
  // Every browser/file reopen must rebuild before Run can become available.
  project.build = { status: 'dirty', inputIdentity: null, artifactIdentity: null };
  return { ...parsed, project, session: new ProjectEditorReducer(project) };
}
function endpointKey(endpoint) { return `${endpoint.component}.${endpoint.pin}`; }
function parseEndpoint(key) {
  const split = key.lastIndexOf('.');
  return split > 0 ? { component: key.slice(0, split), pin: key.slice(split + 1) } : null;
}
function nextEntityId(prefix, values) {
  const used = new Set(values);
  for (let index = 1; index < 1_000; index += 1) {
    const id = `${prefix}-${index}`;
    if (!used.has(id)) return id;
  }
  throw new Error(`${prefix.toUpperCase()}_LIMIT`);
}
function loadCatalogPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(CATALOG_PREFERENCES_KEY) ?? '{}');
    const selectable = new Set(catalogEntries({ selectableOnly: true }).map((entry) => entry.type));
    const favorites = Array.isArray(value.favorites)
      ? [...new Set(value.favorites.filter((type) => typeof type === 'string' && selectable.has(type)))].slice(0, 64) : [];
    const recent = Array.isArray(value.recent)
      ? [...new Set(value.recent.filter((type) => typeof type === 'string' && selectable.has(type)))].slice(0, MAX_RECENT_COMPONENTS) : [];
    return { favorites, recent };
  } catch {
    return { favorites: [], recent: [] };
  }
}
function saveCatalogPreferences() {
  try { localStorage.setItem(CATALOG_PREFERENCES_KEY, JSON.stringify(catalogPreferences)); }
  catch { elements.projectmessage.textContent = 'Catalogue preferences could not be saved; the project remains usable.'; }
}
function markRecentComponent(type) {
  catalogPreferences.recent = [type, ...catalogPreferences.recent.filter((item) => item !== type)].slice(0, MAX_RECENT_COMPONENTS);
  saveCatalogPreferences();
}
function toggleFavorite(type, { restoreFocus = false } = {}) {
  const selected = new Set(catalogPreferences.favorites);
  if (selected.has(type)) selected.delete(type); else selected.add(type);
  catalogPreferences.favorites = [...selected].sort();
  saveCatalogPreferences();
  renderCatalog();
  if (restoreFocus) {
    const row = [...elements.cataloglist.children].find((item) => item.dataset.type === type);
    const target = row?.querySelector('.catalog-favourite')
      ?? (elements.catalogempty.hidden ? elements.catalogfavorites : elements.catalogclear);
    target?.focus();
  }
}
function persistProject(message = null) {
  try {
    const text = currentProjectText();
    if (new TextEncoder().encode(text).length > 4 * 1024 * 1024) throw new Error('STORAGE_PROJECT_LIMIT');
    localStorage.setItem(PROJECT_RECOVERY_KEY, text);
    localStorage.setItem(PROJECT_STORAGE_KEY, text);
    localStorage.removeItem(PROJECT_RECOVERY_KEY);
    savedRevision = editor.revision;
    savedProjectGeneration = lifecycle.projectGeneration;
    if (message) elements.projectmessage.textContent = message;
    elements.recoveryexport.disabled = true;
    return true;
  } catch (error) {
    elements.projectmessage.textContent = `Browser recovery failed (${error.name || error.message}). The in-memory project remains usable; save a project file before leaving.`;
    elements.recoveryexport.disabled = false;
    return false;
  }
}
function downloadText(filename, text, type = 'text/plain') {
  const link = document.createElement('a');
  link.download = filename; link.href = URL.createObjectURL(new Blob([text], { type }));
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0);
}
function projectFilename() {
  const stem = currentProject().metadata.name
    .normalize('NFKD').replace(/[^A-Za-z0-9 _.-]/gu, '').trim().replace(/\s+/gu, '-').slice(0, 64);
  return `${stem || 'intent-mcu-project'}.intent-mcu.json`;
}
function boundedProjectText() {
  const text = currentProjectText();
  if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('INPUT_LIMIT');
  return text;
}
function markFileSaved(state = 'saved to file') {
  fileSavedRevision = editor.revision;
  fileSavedProjectGeneration = lifecycle.projectGeneration;
  fileSaveState = state;
}
async function saveProjectFile() {
  let text;
  try { text = boundedProjectText(); }
  catch (error) { showActionableError(elements.projectmessage, error.message, 'Project file was not saved.'); return; }
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      projectFileHandle ??= await window.showSaveFilePicker({
        suggestedName: projectFilename(),
        types: [{ description: 'Intent MCU project', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await projectFileHandle.createWritable();
      await writable.write(new Blob([text], { type: 'application/json' }));
      await writable.close();
      const recoverySaved = persistProject(); markFileSaved(); renderProject();
      elements.projectmessage.textContent = recoverySaved
        ? 'Project saved to the file you selected. Browser recovery was updated separately.'
        : 'Project saved to the selected file, but browser recovery/local save failed. The in-memory project remains usable.';
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        elements.projectmessage.textContent = 'Save cancelled. The project remains in memory; browser recovery is unchanged.';
        return;
      }
      projectFileHandle = null;
      showActionableError(elements.projectmessage, 'FILE_SAVE_FAILED', `${error?.name || 'Error'}: ${error?.message || 'write failed'}`);
      return;
    }
  }
  const recoverySaved = persistProject();
  downloadText(projectFilename(), text, 'application/json');
  markFileSaved('download requested'); renderProject();
  elements.projectmessage.textContent = recoverySaved
    ? 'Project download requested. Your browser chooses the download location; browser recovery was updated separately.'
    : 'Project download requested, but browser recovery/local save failed. The in-memory project remains usable.';
}
async function replaceProjectFromFile(file, handle = null) {
  if (!file) return;
  if (file.size > 1024 * 1024) { showActionableError(elements.projectmessage, 'INPUT_LIMIT', `${file.size} bytes`); return; }
  const before = currentProjectText();
  let source;
  try { source = await file.text(); }
  catch (error) { showActionableError(elements.projectmessage, 'PROJECT_READ_FAILED', error?.message || 'read failed'); return; }
  const result = parseEditorSource(source);
  if (result.ok) editor = result.session;
  if (!result.ok) {
    showActionableError(elements.projectmessage, result.code, 'Open rejected atomically; project unchanged.');
    if (currentProjectText() !== before) throw new Error('Atomic open boundary violated');
    return;
  }
  installProjectGeneration({
    empty: currentProject().circuit.components.length === 0, reason: 'project.file-open',
    runtimeMessage: 'Opened project requires build',
  });
  selectedSourceFile = 'main.ino';
  projectFileHandle = handle;
  persistProject(); markFileSaved('opened file current'); publish({ importReport: result.report ?? result.code }); renderCatalog(); renderProject();
  elements.projectmessage.textContent = 'Project opened from your computer and revalidated. Previous runtime output was cleared.';
}
async function openProjectFile() {
  if (typeof window.showOpenFilePicker !== 'function') {
    elements.projectopeninput.click();
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Intent MCU project', accept: { 'application/json': ['.json'] } }],
    });
    await replaceProjectFromFile(await handle.getFile(), handle);
  } catch (error) {
    if (error?.name === 'AbortError') {
      elements.projectmessage.textContent = 'Open cancelled. The current project is unchanged.';
      return;
    }
    showActionableError(elements.projectmessage, 'PROJECT_READ_FAILED', `${error?.name || 'Error'}: ${error?.message || 'read failed'}`);
  }
}
function buildInputIdentity() {
  const target = currentCompilerTarget();
  const runtimeProject = currentRuntimeProject();
  return JSON.stringify({
    compilerTarget: {
      profile: target.profile,
      fqbn: target.fqbn,
      toolchainIdentitySha256: target.toolchainIdentitySha256,
    },
    source: currentProject().source,
    circuit: runtimeProject?.circuit ?? null,
  });
}

function setRuntimeEnabled(enabled) {
  for (const control of runtimeControls) control.disabled = !enabled;
  elements.serialsend.disabled = !enabled;
  elements.serialclear.disabled = !enabled;
  elements.quickrun.disabled = !enabled;
  elements.quickpause.disabled = !enabled;
  elements.quickreset.disabled = !enabled;
}

function clearRuntimePresentation() {
  elements.cycle.textContent = '0';
  elements.instructions.textContent = '0';
  elements.artifact.textContent = 'none';
  elements.simulatedtime.textContent = '0.000 ms';
  elements.achievedspeed.textContent = '—';
  lastThroughputSample = null;
  elements.trace.replaceChildren(Object.assign(document.createElement('li'), { textContent: '0000000000 · LOW' }));
  elements.serialoutput.textContent = 'No firmware bytes.';
  elements.serialcount.textContent = '0 records';
  if (serialScrollFrame !== null) cancelAnimationFrame(serialScrollFrame);
  serialScrollFrame = null;
  serialRenderedRecords = 0; serialUnreadRecords = 0; serialAutoscroll = true;
  elements.serialnewoutput.hidden = true; elements.serialresume.hidden = true;
  elements.logicoutput.replaceChildren(Object.assign(document.createElement('li'), { textContent: '— · 0000000000 · LOW' }));
  elements.logiccount.textContent = '0 transitions';
  elements.logiccursor.textContent = 'Cursor Δ —';
  elements.logicwaveform.replaceChildren();
  elements.pinmode.textContent = '—'; elements.pinlevel.textContent = '—'; elements.pindetail.textContent = '—';
  elements.pindiagnostic.textContent = '—'; elements.pincycle.textContent = '0';
  for (const visual of elements.componentlayer.querySelectorAll('.component-led.on')) visual.classList.remove('on');
  for (const artwork of elements.componentlayer.querySelectorAll('[data-artwork-key="output-rgb-led-common-cathode"]')) {
    artwork.dataset.rDuty = '0'; artwork.dataset.gDuty = '0'; artwork.dataset.bDuty = '0';
    artwork.querySelector('.rgb-led-mix')?.setAttribute('fill', 'rgb(0 0 0)');
    for (const channel of artwork.querySelectorAll('.rgb-led-channel')) {
      channel.classList.remove('on'); channel.style.opacity = '0.22'; channel.style.filter = '';
    }
  }
  for (const artwork of elements.componentlayer.querySelectorAll('[data-artwork-key="output-active-buzzer-module"]')) {
    artwork.dataset.enabled = 'false'; artwork.dataset.driveState = 'idle';
    artwork.querySelector('.active-buzzer-disc')?.classList.remove('on');
    artwork.querySelector('.buzzer-status')?.classList.remove('on');
    for (const wave of artwork.querySelectorAll('.buzzer-wave')) wave.classList.remove('on');
  }
  characterLcdRuntime.clear();
  for (const artwork of elements.componentlayer.querySelectorAll('[data-artwork-key="output-character-lcd-16x2-4bit"]')) {
    artwork.dataset.protocolState = 'awaiting-initialization';
    artwork.dataset.line1 = ''; artwork.dataset.line2 = '';
    artwork.querySelector('[data-lcd-line="1"]')?.replaceChildren();
    artwork.querySelector('[data-lcd-line="2"]')?.replaceChildren();
  }
  publish({ runtime: null });
}

function updateSerialAutoscroll(serial) {
  const absoluteRecords = Number(serial.dropped ?? 0) + serial.records.length;
  const added = Math.max(0, absoluteRecords - serialRenderedRecords);
  serialRenderedRecords = absoluteRecords;
  if (!serialAutoscroll && added) {
    serialUnreadRecords += added;
    elements.serialnewoutput.textContent = `${serialUnreadRecords} new`;
    elements.serialnewoutput.hidden = false;
    elements.serialresume.textContent = 'Jump to new output';
    elements.serialresume.hidden = false;
    publish({ serialAutoscroll, serialUnreadRecords });
    return;
  }
  if (serialAutoscroll) scheduleSerialScrollToEnd();
  publish({ serialAutoscroll, serialUnreadRecords });
}

function scheduleSerialScrollToEnd() {
  if (serialScrollFrame !== null) cancelAnimationFrame(serialScrollFrame);
  serialScrollFrame = requestAnimationFrame(() => {
    serialScrollFrame = null;
    if (serialAutoscroll) elements.serialoutput.scrollTop = elements.serialoutput.scrollHeight;
  });
}

function resumeSerialAutoscroll() {
  if (serialScrollFrame !== null) cancelAnimationFrame(serialScrollFrame);
  serialScrollFrame = null;
  serialAutoscroll = true; serialUnreadRecords = 0;
  elements.serialnewoutput.hidden = true; elements.serialresume.hidden = true;
  elements.serialoutput.scrollTop = elements.serialoutput.scrollHeight;
  publish({ serialAutoscroll, serialUnreadRecords });
}

function resumeSerialAutoscrollFromControl() {
  serialResumeGuardUntil = performance.now() + 200;
  resumeSerialAutoscroll();
  requestAnimationFrame(resumeSerialAutoscroll);
}

function setMomentaryControl(componentId, pressed, action = 'canvas button') {
  const component = currentProject().circuit.components.find((item) => item.id === componentId && item.type === 'button.momentary-v1');
  if (!component || component.controls.pressed === pressed) return { ok: Boolean(component), unchanged: true };
  const result = editor.apply({
    type: 'component.control.set', revision: editor.revision, componentId, key: 'pressed', value: pressed,
  }, { running });
  if (!result.ok) {
    showActionableError(elements.projectmessage, result.code, `${action}: ${componentId}`);
    return result;
  }
  persistProject();
  worker?.postMessage({ command: 'control', componentId, key: 'pressed', value: pressed });
  for (const control of document.querySelectorAll(`[data-control="${componentId}.pressed"],[data-canvas-control="${componentId}.pressed"]`)) {
    control.setAttribute('aria-pressed', String(pressed));
    if (control.classList.contains('component-control-hit')) {
      control.setAttribute('aria-label', `${component.label}: ${pressed ? 'pressed' : 'released'}. Hold Space, Enter, or pointer to operate.`);
      control.closest('.circuit-component')?.classList.toggle('control-pressed', pressed);
    } else control.textContent = pressed ? 'Pressed' : 'Released';
  }
  publish({
    project: JSON.parse(currentProjectText()), revision: editor.revision,
    lastAction: `BUTTON_${pressed ? 'PRESSED' : 'RELEASED'}`,
  });
  elements.projectmessage.textContent = `${component.label} ${pressed ? 'pressed' : 'released'} through ${action}.`;
  return result;
}

function rotateCandidateEncoder(componentId, direction, action = 'encoder control') {
  const component = currentProject().circuit.components.find(
    (item) => item.id === componentId && item.type === ROTARY_ENCODER_TYPE,
  );
  if (!component || editor.kind !== 'candidate-project-v3') return { ok: false, code: 'ROTARY_ENCODER_MISSING' };
  let detent;
  try { detent = nextRotaryEncoderDetent(component, direction); }
  catch (error) {
    showActionableError(elements.projectmessage, error.message, `${action}: ${componentId}`);
    return { ok: false, code: error.message };
  }
  const prepared = candidateContactControl(editor, componentId, 'detent', detent);
  if (!prepared.ok) {
    showActionableError(elements.projectmessage, prepared.code, `${action}: ${componentId}`);
    return prepared;
  }
  const result = applyEditor(prepared.command, `${component.label} ${direction.toUpperCase()} to detent ${detent}`);
  if (result.ok && prepared.worker) worker?.postMessage(prepared.worker);
  if (result.ok) {
    elements.projectmessage.textContent = `${component.label} ${direction.toUpperCase()} · four ideal Gray-code edges queued at 1 ms phase spacing.`;
    publish({ lastEncoderAction: { componentId, direction, detent, source: action } });
  }
  return result;
}

function releaseCanvasButton(reason = 'canvas button') {
  if (!activeCanvasButton) return false;
  const active = activeCanvasButton; activeCanvasButton = null;
  try {
    if (active.target.hasPointerCapture?.(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  } catch { /* capture may already be released */ }
  setMomentaryControl(active.componentId, false, reason);
  return true;
}

function stopRuntime(message = 'No current artifact loaded', { updateLifecycle = true, stale = false } = {}) {
  workerToken += 1;
  worker?.terminate();
  worker = null;
  running = false;
  setRuntimeEnabled(false);
  elements.workerstate.textContent = message;
  clearRuntimePresentation();
  if (updateLifecycle) applyLifecycle({
    type: 'runtime.stop', stale, empty: currentProject().circuit.components.length === 0, reason: message,
  });
}

function detachOutstandingBuild() {
  const job = activeJob;
  activeJob = null;
  buildAbortController?.abort();
  buildAbortController = null;
  elements.build.disabled = false;
  elements.quickbuild.disabled = false;
  elements.cancel.disabled = true;
  if (job?.jobId && job?.capability) {
    void fetch(`/api/build/${job.jobId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${job.capability}`, 'X-Teach-Lab-Build': '1' },
    }).catch(() => {});
  }
}

function installProjectGeneration({ empty, reason, runtimeMessage }) {
  detachOutstandingBuild();
  stopRuntime(runtimeMessage, { updateLifecycle: false });
  applyLifecycle({ type: 'project.install', empty, reason });
  savedRevision = null;
  savedProjectGeneration = null;
  setSelection({ kind: 'none' });
  pendingEndpoint = null;
  routeDrag = null;
  wireMode = 'connect';
  elements.reconnectmode.setAttribute('aria-pressed', 'false');
  elements.wirestate.textContent = empty
    ? 'Add parts, then select two named pins to create a wire.'
    : 'Select two named pins to create a wire. A branch requires an explicit junction; crossings remain separate.';
  elements.diagnostics.textContent = 'No build submitted for this project.';
  elements.diagnosticlinks.replaceChildren(); elements.buildlog.textContent = 'No build submitted for this project.';
  elements.buildstate.textContent = empty ? 'Add a supported circuit to build' : 'Build required';
  publish({
    buildState: empty ? 'empty' : 'dirty', artifactIdentity: null, inputIdentity: null,
    cacheHit: false, runtime: null, importReport: null, selectedComponentId: null,
    selectedNetId: null, selectedRouteSegment: null, selection: { kind: 'none' },
  });
  clearTechnicalError();
}

function applyEditor(command, message = command.type) {
  const result = editor.apply({ ...command, revision: editor.revision }, { running });
  if (!result.ok) {
    showActionableError(elements.projectmessage, result.code, `${message}\n${JSON.stringify(result.details ?? [])}`);
    return result;
  }
  const relevance = result.changeRelevance ?? (result.buildRelevant ? 'build' : commandBuildRelevance(command.type));
  if (relevance === 'build') {
    detachOutstandingBuild();
    stopRuntime('Circuit or source changed — rebuild required', { updateLifecycle: false });
    applyLifecycle({
      type: 'project.edit', relevance: 'build', empty: result.project.circuit.components.length === 0,
    });
  } else {
    applyLifecycle({ type: 'project.edit', relevance });
  }
  if (result.project.build.status === 'dirty') loadedSourceIdentity = null;
  const saved = persistProject();
  publish({ lastAction: result.code, importReport: null });
  renderProject();
  clearTechnicalError();
  elements.projectmessage.textContent = `${message} · revision ${editor.revision}${saved ? '' : ' · local save failed'}`;
  return result;
}

function screenPoint(point) {
  const { zoom, panX, panY } = currentProject().layout.viewport;
  return {
    x: (point.x - 0.5) * zoom + 0.5 + panX,
    y: (point.y - 0.5) * zoom + 0.5 + panY,
  };
}

function worldPoint(screenX, screenY) {
  const { zoom, panX, panY } = currentProject().layout.viewport;
  return {
    x: (screenX - 0.5 - panX) / zoom + 0.5,
    y: (screenY - 0.5 - panY) / zoom + 0.5,
  };
}

function netKind(net) {
  const pins = net.endpoints.filter((endpoint) => endpoint.component.startsWith('board-')).map((endpoint) => endpoint.pin);
  if (pins.includes('5V')) return 'power';
  if (pins.some((pin) => pin.startsWith('GND'))) return 'ground';
  if (pins.some((pin) => pin.startsWith('A'))) return 'analogue';
  return 'digital';
}

function createTerminalWireLayer(component, definition) {
  const width = definition.artwork.cssWidth;
  const height = definition.artwork.cssHeight;
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  layer.classList.add('component-terminal-wires');
  layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  layer.setAttribute('aria-hidden', 'true');
  for (const pin of definition.pins) {
    const endpoint = { component: component.id, pin: pin.id };
    const netId = endpointConnection(currentProject().circuit, endpoint);
    if (!netId) continue;
    const start = { x: pin.anchor.x * width, y: pin.anchor.y * height };
    const edge = [
      { name: 'left', distance: start.x },
      { name: 'right', distance: width - start.x },
      { name: 'top', distance: start.y },
      { name: 'bottom', distance: height - start.y },
    ].sort((left, right) => left.distance - right.distance)[0].name;
    const end = { ...start };
    if (edge === 'left') end.x -= 13;
    if (edge === 'right') end.x += 13;
    if (edge === 'top') end.y -= 13;
    if (edge === 'bottom') end.y += 13;
    const stub = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    stub.classList.add('terminal-wire-stub');
    stub.dataset.endpoint = endpointKey(endpoint);
    stub.dataset.net = netId;
    stub.dataset.escapeEdge = edge;
    stub.setAttribute('x1', String(start.x)); stub.setAttribute('y1', String(start.y));
    stub.setAttribute('x2', String(end.x)); stub.setAttribute('y2', String(end.y));
    stub.style.setProperty('--wire-color', currentProject().layout.wireStyles[netId]?.color ?? '#39dff2');
    layer.append(stub);
  }
  return layer;
}

function netAnchors(net, canvasBox) {
  return Object.fromEntries(net.endpoints.map((endpoint) => {
    const component = currentProject().circuit.components.find((item) => item.id === endpoint.component);
    const definition = component && uiComponentCatalog[component.type];
    const pinDefinition = definition?.pins.find((pin) => pin.id === endpoint.pin);
    const card = elements.componentlayer.querySelector(`[data-component-id="${endpoint.component}"]`);
    const anchor = card?.querySelector(`.pin-anchor[data-endpoint="${endpointKey(endpoint)}"]`);
    if (!component || !definition || !pinDefinition || !card || !anchor) return null;
    const cardBox = card.getBoundingClientRect();
    const anchorBox = anchor.getBoundingClientRect();
    const width = definition.artwork.cssWidth; const height = definition.artwork.cssHeight;
    const localPin = { x: pinDefinition.anchor.x * width, y: pinDefinition.anchor.y * height };
    const distances = [
      { edge: 'left', value: localPin.x },
      { edge: 'right', value: width - localPin.x },
      { edge: 'top', value: localPin.y },
      { edge: 'bottom', value: height - localPin.y },
    ].sort((left, right) => left.value - right.value);
    const radians = (currentProject().layout.positions[component.id].rotation * Math.PI) / 180;
    const localDirection = {
      left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 },
    }[distances[0].edge];
    const direction = {
      x: localDirection.x * Math.cos(radians) - localDirection.y * Math.sin(radians),
      y: localDirection.x * Math.sin(radians) + localDirection.y * Math.cos(radians),
    };
    const rotatedWidth = Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height;
    const rotatedHeight = Math.abs(Math.sin(radians)) * width + Math.abs(Math.cos(radians)) * height;
    const renderedScale = Math.min(cardBox.width / rotatedWidth, cardBox.height / rotatedHeight);
    const pin = {
      x: anchorBox.left - canvasBox.left + anchorBox.width / 2,
      y: anchorBox.top - canvasBox.top + anchorBox.height / 2,
    };
    const escape = {
      x: pin.x + direction.x * 13 * renderedScale,
      y: pin.y + direction.y * 13 * renderedScale,
    };
    return [endpointKey(endpoint), {
      pin: worldPoint(pin.x / canvasBox.width, pin.y / canvasBox.height),
      escape: worldPoint(escape.x / canvasBox.width, escape.y / canvasBox.height),
    }];
  }).filter(Boolean));
}

function routeObstacles(canvasBox) {
  return [...elements.componentlayer.querySelectorAll('.circuit-component')].map((card) => {
    const box = card.getBoundingClientRect();
    const topLeft = worldPoint((box.left - canvasBox.left) / canvasBox.width, (box.top - canvasBox.top) / canvasBox.height);
    const bottomRight = worldPoint((box.right - canvasBox.left) / canvasBox.width, (box.bottom - canvasBox.top) / canvasBox.height);
    return {
      component: card.dataset.componentId,
      left: Math.min(topLeft.x, bottomRight.x), right: Math.max(topLeft.x, bottomRight.x),
      top: Math.min(topLeft.y, bottomRight.y), bottom: Math.max(topLeft.y, bottomRight.y),
    };
  });
}

function screenRoutePoint(point, canvasBox) {
  const visible = screenPoint(point);
  return { x: visible.x * canvasBox.width, y: visible.y * canvasBox.height };
}

function routePathText(points, canvasBox) {
  const visible = points.map((point) => screenRoutePoint(point, canvasBox));
  return `M ${visible.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
}

function drawComponentWireVisibility(canvasBox = elements.circuitcanvas.getBoundingClientRect()) {
  for (const layer of elements.componentlayer.querySelectorAll('.component-terminal-wires')) {
    layer.querySelectorAll('.component-wire-overlay-path').forEach((path) => path.remove());
    const matrix = layer.getScreenCTM();
    if (!matrix) continue;
    const inverse = matrix.inverse();
    for (const record of [...acceptedRoutePaint, ...proposedRoutePaint]) {
      const local = record.points.map((point) => {
        const screen = screenRoutePoint(point, canvasBox);
        const transformed = new DOMPoint(canvasBox.left + screen.x, canvasBox.top + screen.y).matrixTransform(inverse);
        return { x: transformed.x, y: transformed.y };
      });
      const visible = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      visible.classList.add('component-wire-overlay-path');
      if (record.proposal) visible.classList.add('proposal');
      else if (record.netId === proposedRouteNetId) visible.classList.add('drag-source');
      visible.dataset.net = record.netId;
      visible.dataset.endpoint = record.endpoint;
      visible.style.setProperty('--wire-color', record.color);
      visible.setAttribute('d', `M ${local.map((point) => `${point.x} ${point.y}`).join(' L ')}`);
      layer.append(visible);
    }
  }
}

function clearRouteProposal() {
  elements.circuitwires.querySelector('.wire-drag-proposal-group')?.remove();
  for (const path of elements.circuitwires.querySelectorAll('.drag-source')) path.classList.remove('drag-source');
  proposedRoutePaint = [];
  proposedRouteNetId = null;
  drawComponentWireVisibility();
}

function drawRouteProposal(net, family, anchors) {
  clearRouteProposal();
  const canvasBox = elements.circuitcanvas.getBoundingClientRect();
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.classList.add('wire-drag-proposal-group');
  const branches = routeFamilyPaths(family, anchors);
  for (const branch of branches) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('wire-drag-proposal');
    path.dataset.net = net.id;
    path.dataset.endpoint = endpointKey(branch.endpoint);
    path.style.setProperty('--wire-color', currentProject().layout.wireStyles[net.id]?.color ?? '#39dff2');
    path.setAttribute('d', routePathText(branch.points, canvasBox));
    group.append(path);
  }
  for (const path of elements.circuitwires.querySelectorAll(`.circuit-wire[data-net="${net.id}"]`)) path.classList.add('drag-source');
  elements.circuitwires.append(group);
  proposedRouteNetId = net.id;
  proposedRoutePaint = branches.map((branch) => ({
    netId: net.id,
    endpoint: endpointKey(branch.endpoint),
    points: branch.points,
    color: currentProject().layout.wireStyles[net.id]?.color ?? '#39dff2',
    proposal: true,
  }));
  drawComponentWireVisibility(canvasBox);
}

function cancelRouteDrag(message = 'Wire section move cancelled; route restored.') {
  if (!routeDrag) return false;
  const active = routeDrag;
  routeDrag = null;
  clearRouteProposal();
  try {
    if (active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  } catch { /* capture may already be released by the browser */ }
  elements.wirestate.textContent = message;
  return true;
}

function startRouteDrag(event, { net, family, anchors, endpoint, segmentIndex, orientation, target }) {
  if (routeDrag || event.button !== 0) return;
  event.preventDefault(); event.stopPropagation();
  selectWireSegment({ netId: net.id, endpoint, segmentIndex, orientation });
  renderInspector();
  routeDrag = {
    pointerId: event.pointerId,
    target,
    net: structuredClone(net),
    anchors: structuredClone(anchors),
    endpoint,
    segmentIndex,
    orientation,
    originalFamily: structuredClone(family),
    proposalFamily: structuredClone(family),
  };
  target.setPointerCapture(event.pointerId);
  target.dataset.pointerCaptured = String(target.hasPointerCapture(event.pointerId));
  target.classList.add('dragging');
  elements.wirestate.textContent = `${orientation === 'horizontal' ? 'Horizontal' : 'Vertical'} section selected · drag ${orientation === 'horizontal' ? 'up/down' : 'left/right'} · Escape cancels.`;
}

function wireTargetKey(target) {
  return `${target.dataset.net}\u0000${target.dataset.endpoint}\u0000${target.dataset.segment}`;
}

function pointToLineDistance(point, start, end) {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function wireTargetsAtPoint(clientX, clientY) {
  return [...elements.circuitwires.querySelectorAll('.wire-segment-hit')].filter((target) => {
    const length = target.getTotalLength();
    const matrix = target.getScreenCTM();
    if (!matrix || !length) return false;
    const firstLocal = target.getPointAtLength(0); const lastLocal = target.getPointAtLength(length);
    const first = new DOMPoint(firstLocal.x, firstLocal.y).matrixTransform(matrix);
    const last = new DOMPoint(lastLocal.x, lastLocal.y).matrixTransform(matrix);
    return pointToLineDistance({ x: clientX, y: clientY }, first, last) <= 9;
  }).sort((left, right) => wireTargetKey(left).localeCompare(wireTargetKey(right)));
}

function selectSegmentTarget(target, { announce = true } = {}) {
  const interaction = target?.routeInteraction;
  if (!interaction) return false;
  selectWireSegment(interaction);
  renderInspector();
  for (const candidate of elements.circuitwires.querySelectorAll('.wire-segment-hit')) candidate.classList.remove('selected');
  target.classList.add('selected');
  if (announce) {
    const overlapCount = wireTargetsAtPoint(...interaction.midpoint).length;
    elements.wirestate.textContent = `Selected ${interaction.orientation} section ${interaction.segmentIndex + 1} of ${interaction.endpoint} on ${interaction.netId}.${overlapCount > 1 ? ` ${overlapCount} routes overlap here; select again to cycle.` : ''} Junction hubs remain fixed; crossings do not connect.`;
  }
  return true;
}

function cycledWireTarget(candidates, clientX, clientY) {
  if (!candidates.length) return null;
  const keys = candidates.map(wireTargetKey);
  const samePoint = wireCycle && Math.hypot(wireCycle.x - clientX, wireCycle.y - clientY) <= 6
    && JSON.stringify(wireCycle.keys) === JSON.stringify(keys);
  let index = 0;
  if (samePoint) index = (wireCycle.index + 1) % candidates.length;
  else if (selection.kind === 'wire-segment') {
    const selectedKey = `${selection.netId}\u0000${selection.endpoint}\u0000${selection.segmentIndex}`;
    const selectedIndex = keys.indexOf(selectedKey);
    if (selectedIndex >= 0) index = selectedIndex;
  }
  wireCycle = { x: clientX, y: clientY, keys, index };
  return candidates[index];
}

function moveRouteDrag(event) {
  if (!routeDrag || event.pointerId !== routeDrag.pointerId) return;
  event.preventDefault();
  const canvasBox = elements.circuitcanvas.getBoundingClientRect();
  const point = worldPoint(
    (event.clientX - canvasBox.left) / canvasBox.width,
    (event.clientY - canvasBox.top) / canvasBox.height,
  );
  const coordinate = Math.max(-1, Math.min(2, routeDrag.orientation === 'horizontal' ? point.y : point.x));
  try {
    routeDrag.proposalFamily = moveRouteSegment(
      routeDrag.originalFamily,
      routeDrag.anchors,
      routeDrag.endpoint,
      routeDrag.segmentIndex,
      coordinate,
      routeDrag.net,
    );
    routeDrag.invalidCode = null;
    drawRouteProposal(routeDrag.net, routeDrag.proposalFamily, routeDrag.anchors);
  } catch (error) {
    if (!['ROUTE_MOVE_LOOP', 'ROUTE_MOVE_COMPLEXITY'].includes(error?.message)) throw error;
    routeDrag.proposalFamily = routeDrag.originalFamily;
    routeDrag.invalidCode = error.message;
    clearRouteProposal();
    elements.wirestate.textContent = 'That move would add a route loop. The saved wire is unchanged; choose a different section or direction.';
  }
}

function finishRouteDrag(event) {
  if (!routeDrag || event.pointerId !== routeDrag.pointerId) return;
  event.preventDefault();
  const active = routeDrag;
  routeDrag = null;
  clearRouteProposal();
  try {
    if (active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  } catch { /* capture may already be released by the browser */ }
  if (active.invalidCode) {
    elements.wirestate.textContent = 'Move rejected because it would add a route loop. No route or history changed.';
    return;
  }
  if (JSON.stringify(active.proposalFamily) === JSON.stringify(active.originalFamily)) {
    elements.wirestate.textContent = 'Wire section stayed on its original grid line.';
    return;
  }
  applyEditor({ type: 'wire.route.family.set', netId: active.net.id, family: active.proposalFamily }, `Moved section of ${active.net.id}`);
  elements.wirestate.textContent = `Moved one ${active.orientation} section on the world grid. Undo restores the complete route.`;
}

function createSegmentInteraction(net, family, anchors, branch, segmentIndex, canvasBox) {
  const left = branch.points[segmentIndex];
  const right = branch.points[segmentIndex + 1];
  const orientation = routeSegmentOrientation(left, right);
  if (!orientation) return [];
  const endpoint = endpointKey(branch.endpoint);
  const d = routePathText([left, right], canvasBox);
  const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  highlight.classList.add('wire-segment-highlight');
  highlight.dataset.net = net.id; highlight.dataset.endpoint = endpoint; highlight.dataset.segment = String(segmentIndex);
  highlight.style.setProperty('--wire-color', currentProject().layout.wireStyles[net.id]?.color ?? '#39dff2');
  highlight.setAttribute('d', d);
  const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hit.classList.add('wire-segment-hit', orientation);
  if (selectedRouteSegment?.netId === net.id && selectedRouteSegment.endpoint === endpoint
      && selectedRouteSegment.segmentIndex === segmentIndex) hit.classList.add('selected');
  hit.dataset.net = net.id; hit.dataset.endpoint = endpoint; hit.dataset.segment = String(segmentIndex); hit.dataset.orientation = orientation;
  hit.style.cursor = orientation === 'horizontal' ? 'ns-resize' : 'ew-resize';
  hit.setAttribute('d', d); hit.setAttribute('stroke-width', '18');
  hit.setAttribute('tabindex', '0');
  hit.setAttribute('role', 'button');
  hit.setAttribute('aria-label', `${net.id}, branch ${endpoint}, ${orientation} section ${segmentIndex + 1}. ${orientation === 'horizontal' ? 'Up and Down' : 'Left and Right'} move it on the grid. Junction hubs remain fixed.`);
  const firstScreen = screenRoutePoint(left, canvasBox); const lastScreen = screenRoutePoint(right, canvasBox);
  hit.routeInteraction = {
    net, netId: net.id, family, anchors, endpoint, segmentIndex, orientation,
    midpoint: [
      canvasBox.left + (firstScreen.x + lastScreen.x) / 2,
      canvasBox.top + (firstScreen.y + lastScreen.y) / 2,
    ],
  };
  const select = () => {
    selectSegmentTarget(hit);
  };
  hit.addEventListener('click', select);
  hit.addEventListener('focus', select);
  hit.addEventListener('keydown', (event) => {
    const delta = orientation === 'horizontal'
      ? { ArrowUp: -0.01, ArrowDown: 0.01 }[event.key]
      : { ArrowLeft: -0.01, ArrowRight: 0.01 }[event.key];
    if (delta === undefined && !['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (delta === undefined) {
      const candidates = wireTargetsAtPoint(...hit.routeInteraction.midpoint);
      selectSegmentTarget(cycledWireTarget(candidates, ...hit.routeInteraction.midpoint) ?? hit);
      return;
    }
    select();
    const coordinate = (orientation === 'horizontal' ? left.y : left.x) + delta;
    let moved;
    try {
      moved = moveRouteSegment(family, anchors, endpoint, segmentIndex, coordinate, net);
    } catch (error) {
      if (!['ROUTE_MOVE_LOOP', 'ROUTE_MOVE_COMPLEXITY'].includes(error?.message)) throw error;
      elements.wirestate.textContent = 'Keyboard move rejected because it would add a route loop. The wire is unchanged.';
      return;
    }
    applyEditor({ type: 'wire.route.family.set', netId: net.id, family: moved }, `Moved section of ${net.id}`);
    requestAnimationFrame(() => elements.circuitwires.querySelector(
      `.wire-segment-hit[data-net="${net.id}"][data-endpoint="${endpoint}"][data-segment="${segmentIndex}"]`,
    )?.focus());
  });
  hit.addEventListener('pointerenter', () => { if (!routeDrag) highlight.classList.add('hovered'); });
  hit.addEventListener('pointerleave', () => { if (!routeDrag) highlight.classList.remove('hovered'); });
  hit.addEventListener('pointermove', moveRouteDrag);
  hit.addEventListener('pointerup', finishRouteDrag);
  hit.addEventListener('pointercancel', () => cancelRouteDrag());
  hit.addEventListener('gotpointercapture', () => { hit.dataset.pointerCaptured = 'true'; });
  hit.addEventListener('lostpointercapture', () => {
    hit.dataset.pointerCaptured = 'false';
    if (routeDrag?.target === hit) cancelRouteDrag();
  });
  return [hit, highlight];
}

function drawCircuitWires() {
  const canvasBox = elements.circuitcanvas.getBoundingClientRect();
  if (!canvasBox.width || !canvasBox.height) return;
  elements.circuitwires.setAttribute('viewBox', `0 0 ${canvasBox.width} ${canvasBox.height}`);
  const drawings = [];
  const paint = [];
  const obstacles = routeObstacles(canvasBox);
  for (const net of currentProject().circuit.nets) {
    const anchors = netAnchors(net, canvasBox);
    if (Object.keys(anchors).length < 2) continue;
    const family = materializeRouteFamily(net, currentProject().layout.wireRoutes[net.id], anchors, obstacles);
    const branches = routeFamilyPaths(family, anchors);
    for (const branch of branches) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('circuit-wire');
      path.dataset.net = net.id;
      path.dataset.endpoint = endpointKey(branch.endpoint);
      path.dataset.kind = netKind(net);
      path.style.setProperty('--wire-color', currentProject().layout.wireStyles[net.id]?.color ?? '#39dff2');
      path.setAttribute('d', routePathText(branch.points, canvasBox));
      drawings.push(path);
      paint.push({
        netId: net.id,
        endpoint: endpointKey(branch.endpoint),
        points: branch.points,
        color: currentProject().layout.wireStyles[net.id]?.color ?? '#39dff2',
        proposal: false,
      });
      for (let index = 0; index < branch.points.length - 1; index += 1) {
        drawings.push(...createSegmentInteraction(net, family, anchors, branch, index, canvasBox));
      }
    }
    if (currentProject().circuit.junctions.some((junction) => junction.net === net.id)) {
      const hub = screenRoutePoint(branches[0].points.at(-1), canvasBox);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.classList.add('junction-dot');
      dot.dataset.net = net.id;
      dot.setAttribute('cx', String(hub.x)); dot.setAttribute('cy', String(hub.y)); dot.setAttribute('r', '5');
      drawings.push(dot);
    }
  }
  acceptedRoutePaint = paint;
  elements.circuitwires.replaceChildren(...drawings);
  drawComponentWireVisibility(canvasBox);
}

function snappedComponentPoint(point) {
  const snap = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Math.round(value * 100) / 100));
  return { x: snap(point.x, 0.07, 0.93), y: snap(point.y, 0.08, 0.92) };
}

function cancelComponentDrag(message = 'Component move cancelled; original position restored.') {
  if (!componentDrag) return false;
  if (componentDrag.card.hasPointerCapture?.(componentDrag.pointerId)) componentDrag.card.releasePointerCapture(componentDrag.pointerId);
  componentDrag.card.classList.remove('dragging');
  componentDrag.card.style.left = `${screenPoint(componentDrag.original).x * 100}%`;
  componentDrag.card.style.top = `${screenPoint(componentDrag.original).y * 100}%`;
  componentDrag = null;
  drawCircuitWires();
  elements.wirestate.textContent = message;
  return true;
}

function finishComponentDrag(event) {
  if (!componentDrag || componentDrag.pointerId !== event.pointerId) return false;
  const { card, componentId, proposal, moved } = componentDrag;
  componentDrag = null; card.classList.remove('dragging');
  if (!moved) { drawCircuitWires(); return true; }
  applyEditor({ type: 'component.move', componentId, x: proposal.x, y: proposal.y }, `Moved ${componentId}`);
  return true;
}

function moveComponentDrag(event) {
  if (!componentDrag || (event.pointerId !== undefined && componentDrag.pointerId !== event.pointerId)) return false;
  const box = elements.circuitcanvas.getBoundingClientRect();
  const pointer = worldPoint((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  const proposal = snappedComponentPoint({ x: pointer.x - componentDrag.offset.x, y: pointer.y - componentDrag.offset.y });
  componentDrag.proposal = proposal;
  componentDrag.moved ||= Math.hypot(proposal.x - componentDrag.original.x, proposal.y - componentDrag.original.y) >= 0.005;
  const visible = screenPoint(proposal);
  componentDrag.card.style.left = `${visible.x * 100}%`; componentDrag.card.style.top = `${visible.y * 100}%`;
  drawCircuitWires();
  elements.wirestate.textContent = `Moving ${componentDrag.componentId} · snapped ${proposal.x.toFixed(2)}, ${proposal.y.toFixed(2)} · Escape cancels`;
  return true;
}

function cardPointerDrag(card, componentId) {
  card.addEventListener('pointerdown', (event) => {
    if (canvasInteractionMode !== 'select' || event.target.closest('.pin-anchor,.component-control-hit') || event.button !== 0) return;
    const box = elements.circuitcanvas.getBoundingClientRect();
    const pointer = worldPoint((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
    const original = structuredClone(currentProject().layout.positions[componentId]);
    componentDrag = {
      card, componentId, pointerId: event.pointerId, original,
      offset: { x: pointer.x - original.x, y: pointer.y - original.y },
      proposal: { x: original.x, y: original.y }, moved: false,
    };
    selectComponent(componentId);
    renderInspector();
    card.classList.add('dragging');
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener('pointermove', moveComponentDrag);
  card.addEventListener('pointercancel', () => cancelComponentDrag());
  card.addEventListener('pointerup', finishComponentDrag);
}

function nearestPinAnchor(card, event, fallback) {
  if (!event.detail || (!event.clientX && !event.clientY)) return fallback;
  return [...card.querySelectorAll('.pin-anchor')].map((anchor) => {
    const box = anchor.getBoundingClientRect();
    return { anchor, distance: Math.hypot(event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2) };
  }).sort((left, right) => left.distance - right.distance)[0]?.anchor ?? fallback;
}

function handlePin(endpoint, reconnect = false) {
  if (!pendingEndpoint) {
    if (wireMode === 'reconnect' && !endpointConnection(currentProject().circuit, endpoint)) {
      elements.wirestate.textContent = 'Reconnect starts from a connected pin.';
      return;
    }
    pendingEndpoint = endpoint;
    elements.wirestate.textContent = `${wireMode === 'reconnect' ? 'Reconnect' : 'Wire'} from ${endpointKey(endpoint)} — choose destination.`;
    renderComponents();
    return;
  }
  const from = pendingEndpoint;
  pendingEndpoint = null;
  if (endpointKey(from) === endpointKey(endpoint)) {
    elements.wirestate.textContent = 'Wire selection cancelled.';
    renderComponents();
    return;
  }
  const graph = currentProject().circuit;
  const fromNet = endpointConnection(graph, from);
  const toNet = endpointConnection(graph, endpoint);
  if (wireMode === 'reconnect' || reconnect) {
    if (!fromNet || toNet) {
      elements.wirestate.textContent = 'Reconnect requires one connected source pin and one free destination pin.';
      renderComponents();
      return;
    }
    const result = applyEditor({ type: 'wire.reconnect', netId: fromNet, from, to: endpoint }, `Reconnected ${fromNet}`);
    if (result.ok) {
      selectNet(fromNet);
      wireMode = 'connect';
      elements.reconnectmode.setAttribute('aria-pressed', 'false');
      elements.wirestate.textContent = `Reconnected one branch of ${fromNet}. Other endpoints were unchanged.`;
    }
    return;
  }
  if (!fromNet && !toNet) {
    const netId = nextEntityId('net', graph.nets.map((net) => net.id));
    const result = applyEditor({ type: 'wire.create', net: { id: netId, endpoints: [from, endpoint] } }, `Created ${netId}`);
    if (result.ok) elements.wirestate.textContent = `Connected ${endpointKey(from)} to ${endpointKey(endpoint)} as ${netId}.`;
  } else if (Boolean(fromNet) !== Boolean(toNet)) {
    const netId = fromNet ?? toNet;
    const branchEndpoint = fromNet ? endpoint : from;
    const junctionId = nextEntityId('junction', graph.junctions.map((junction) => junction.id));
    const result = applyEditor({ type: 'wire.branch', netId, endpoint: branchEndpoint, junctionId }, `Branched ${netId}`);
    if (result.ok) elements.wirestate.textContent = `Added ${endpointKey(branchEndpoint)} to ${netId} through explicit junction ${junctionId}.`;
  } else if (fromNet === toNet) {
    elements.wirestate.textContent = `Both pins already belong to ${fromNet}.`;
    renderComponents();
  } else {
    elements.wirestate.textContent = 'Pins belong to different nets. Delete or reconnect one endpoint first.';
    renderComponents();
  }
}

function renderComponents() {
  const cards = currentProject().circuit.components.map((component) => {
    const definition = uiComponentCatalog[component.type];
    const position = screenPoint(currentProject().layout.positions[component.id]);
    const card = document.createElement('article');
    card.className = `circuit-component${selectedComponentId === component.id ? ' selected' : ''}`;
    card.dataset.componentId = component.id;
    card.dataset.componentType = component.type;
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${component.label}, ${definition.displayName}`);
    card.title = `${component.label} · ${definition.displayName} · ${SUPPORT_STATUS[definition.support.status]}`;
    card.style.left = `${position.x * 100}%`; card.style.top = `${position.y * 100}%`;
    card.style.setProperty('--rotation', `${currentProject().layout.positions[component.id].rotation}deg`);
    card.style.setProperty('--part-width', `${definition.artwork.cssWidth}px`);
    card.style.setProperty('--part-height', `${definition.artwork.cssHeight}px`);
    card.append(createComponentArtwork(definition, component));
    card.append(createTerminalWireLayer(component, definition));
    for (const pin of definition.pins) {
      const anchor = document.createElement('button'); anchor.type = 'button'; anchor.className = 'pin-anchor';
      anchor.dataset.endpoint = `${component.id}.${pin.id}`; anchor.textContent = pin.id;
      anchor.dataset.label = `${pin.label} · ${component.id}.${pin.id}`;
      anchor.title = `${component.id}.${pin.id} · ${pin.label} · ${pin.role}`;
      anchor.setAttribute('aria-label', anchor.title);
      anchor.style.setProperty('--pin-x', String(pin.anchor.x));
      anchor.style.setProperty('--pin-y', String(pin.anchor.y));
      if (pendingEndpoint && endpointKey(pendingEndpoint) === anchor.dataset.endpoint) anchor.classList.add('pending');
      else if (pendingEndpoint) anchor.classList.add('available');
      anchor.addEventListener('click', (event) => {
        event.stopPropagation();
        const intended = nearestPinAnchor(card, event, anchor);
        const endpoint = parseEndpoint(intended.dataset.endpoint);
        handlePin(endpoint, event.altKey);
        intended.focus();
      });
      card.append(anchor);
    }
    if (component.type === 'button.momentary-v1') {
      const control = document.createElement('button');
      control.type = 'button'; control.className = 'component-control-hit';
      control.dataset.canvasControl = `${component.id}.pressed`;
      control.tabIndex = canvasInteractionMode === 'interact' ? 0 : -1;
      control.setAttribute('aria-pressed', String(component.controls.pressed));
      control.setAttribute('aria-label', `${component.label}: ${component.controls.pressed ? 'pressed' : 'released'}. Hold Space, Enter, or pointer to operate.`);
      control.addEventListener('pointerdown', (event) => {
        if (canvasInteractionMode !== 'interact' || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        activeCanvasButton = { componentId: component.id, pointerId: event.pointerId, target: control };
        control.setPointerCapture(event.pointerId);
        setMomentaryControl(component.id, true, 'canvas pointer');
      });
      control.addEventListener('pointerup', (event) => {
        if (activeCanvasButton?.pointerId !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation(); releaseCanvasButton('canvas pointer');
      });
      control.addEventListener('pointercancel', () => releaseCanvasButton('pointer cancellation'));
      control.addEventListener('lostpointercapture', () => releaseCanvasButton('lost pointer capture'));
      control.addEventListener('keydown', (event) => {
        if (![' ', 'Enter'].includes(event.key) || event.repeat) return;
        event.preventDefault(); event.stopPropagation(); setMomentaryControl(component.id, true, 'canvas keyboard');
      });
      control.addEventListener('keyup', (event) => {
        if (![' ', 'Enter'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); setMomentaryControl(component.id, false, 'canvas keyboard');
      });
      control.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); });
      control.addEventListener('blur', () => setMomentaryControl(component.id, false, 'canvas keyboard blur'));
      card.classList.toggle('control-pressed', component.controls.pressed);
      card.append(control);
    }
    if (component.type === ROTARY_ENCODER_TYPE) {
      for (const direction of ['ccw', 'cw']) {
        const control = document.createElement('button');
        control.type = 'button';
        control.className = `component-control-hit encoder-control-hit encoder-${direction}`;
        control.dataset.canvasControl = `${component.id}.${direction}`;
        control.tabIndex = canvasInteractionMode === 'interact' ? 0 : -1;
        control.textContent = direction === 'cw' ? '↻' : '↺';
        control.setAttribute('aria-label', `${component.label}: turn one detent ${direction.toUpperCase()}.`);
        control.addEventListener('click', (event) => {
          event.preventDefault(); event.stopPropagation();
          if (canvasInteractionMode === 'interact') rotateCandidateEncoder(component.id, direction, 'canvas pointer or keyboard');
        });
        card.append(control);
      }
    }
    card.addEventListener('click', () => { selectComponent(component.id); renderInspector(); renderComponents(); });
    cardPointerDrag(card, component.id);
    return card;
  });
  elements.componentlayer.replaceChildren(...cards);
  drawCircuitWires();
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
}

function hydrateCatalogThumbnail(slot) {
  if (slot.childElementCount) return;
  const definition = slot.catalogDefinition ?? uiComponentCatalog[slot.dataset.type];
  const artworkType = definition.fixtureBaseType ?? definition.type;
  const artworkDefinition = uiComponentCatalog[artworkType];
  if (!artworkDefinition) return;
  const component = CANDIDATE_UI_COMPONENTS[artworkType]
    ? createCandidateUiComponent(artworkType, 'candidate-preview-1')
    : newComponent(artworkType, { components: [] });
  component.label = definition.displayName;
  if (!CANDIDATE_UI_COMPONENTS[artworkType]) component.properties = defaultProperties(artworkType);
  slot.append(createComponentArtwork({ ...artworkDefinition, displayName: definition.displayName }, component, { thumbnail: true }));
}

const catalogThumbnailObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) {
      hydrateCatalogThumbnail(entry.target);
      catalogThumbnailObserver.unobserve(entry.target);
    }
  }, { root: elements.cataloglist, rootMargin: '100px' })
  : null;

function activeCatalogRecords() {
  if (catalogFixtureRecords) return catalogFixtureRecords;
  const records = catalogEntries({ selectableOnly: true });
  if (editor.kind !== 'candidate-project-v3') return records;
  return [...records, ...Object.values(CANDIDATE_UI_COMPONENTS).filter((definition) => definition.selectable)];
}

function matchedCatalogRecords(records = activeCatalogRecords()) {
  const favorites = new Set(catalogPreferences.favorites);
  const recentRank = new Map(catalogPreferences.recent.map((type, index) => [type, index]));
  return filterCatalog(records, {
    query: elements.catalogsearch.value,
    category: elements.catalogcategory.value,
    status: elements.catalogstatus.value,
    interface: elements.cataloginterface.value,
    supplyVoltage: elements.catalogsupplyvoltage.value,
    pinVoltage: elements.catalogpinvoltage.value,
  }).filter((definition) => !elements.catalogfavorites.checked || favorites.has(definition.type))
    .sort((a, b) => Number(favorites.has(b.type)) - Number(favorites.has(a.type))
      || (recentRank.get(a.type) ?? 99) - (recentRank.get(b.type) ?? 99)
      || a.displayName.localeCompare(b.displayName));
}

function createCatalogRow(definition, { interactive = true, thumbnail = true } = {}) {
  const favorites = new Set(catalogPreferences.favorites);
  const row = document.createElement('div'); row.className = 'catalog-item';
  row.dataset.type = definition.type; row.draggable = interactive; row.tabIndex = interactive ? 0 : -1; row.setAttribute('role', interactive ? 'button' : 'listitem');
  row.setAttribute('aria-label', `Add ${definition.displayName}, ${SUPPORT_STATUS[definition.support.status]}`);
  const thumbnailSlot = document.createElement('span'); thumbnailSlot.className = 'catalog-thumbnail-slot'; thumbnailSlot.dataset.type = definition.type;
  thumbnailSlot.catalogDefinition = definition;
  const text = document.createElement('span'); text.className = 'catalog-item-copy';
  const name = document.createElement('strong'); name.textContent = definition.displayName;
  const small = document.createElement('small'); small.textContent = `${definition.partNumber} · ${definition.catalog.interfaces.join(', ')}`;
  const badge = document.createElement('span'); badge.className = `support-badge ${definition.support.status}`; badge.textContent = SUPPORT_STATUS[definition.support.status];
  text.append(name, small, badge);
  const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'catalog-favourite';
  favorite.textContent = favorites.has(definition.type) ? '★' : '☆';
  favorite.setAttribute('aria-label', `${favorites.has(definition.type) ? 'Remove' : 'Add'} ${definition.displayName} ${favorites.has(definition.type) ? 'from' : 'to'} favourites`);
  favorite.disabled = !interactive;
  if (interactive) {
    favorite.addEventListener('click', (event) => { event.stopPropagation(); toggleFavorite(definition.type, { restoreFocus: true }); });
    row.addEventListener('click', (event) => { if (!event.target.closest('.catalog-favourite')) addComponent(definition.type); });
    row.addEventListener('keydown', (event) => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); addComponent(definition.type); } });
    row.addEventListener('dragstart', (event) => event.dataTransfer.setData('application/x-intent-component', definition.type));
  }
  row.append(thumbnailSlot, text, favorite);
  if (thumbnail && catalogThumbnailObserver) catalogThumbnailObserver.observe(thumbnailSlot);
  else if (thumbnail) hydrateCatalogThumbnail(thumbnailSlot);
  return row;
}

function renderCatalog() {
  const started = performance.now();
  const matches = matchedCatalogRecords();
  const maximumStart = matches.length ? Math.floor((matches.length - 1) / CATALOG_WINDOW_LIMIT) * CATALOG_WINDOW_LIMIT : 0;
  catalogWindowStart = Math.min(catalogWindowStart, maximumStart);
  const windowRecords = matches.slice(catalogWindowStart, catalogWindowStart + CATALOG_WINDOW_LIMIT);
  const interactive = catalogFixtureRecords === null;
  const buttons = windowRecords.map((definition) => createCatalogRow(definition, { interactive, thumbnail: true }));
  elements.cataloglist.replaceChildren(...buttons);
  elements.cataloglist.scrollTop = 0;
  const first = matches.length ? catalogWindowStart + 1 : 0;
  const last = Math.min(matches.length, catalogWindowStart + windowRecords.length);
  elements.catalogcount.textContent = `${matches.length} ${matches.length === 1 ? 'part' : 'parts'}`;
  elements.catalogempty.hidden = matches.length > 0;
  elements.catalogpage.textContent = matches.length ? `${first}–${last} of ${matches.length}` : 'No results';
  elements.catalogprev.disabled = catalogWindowStart === 0;
  elements.catalognext.disabled = catalogWindowStart + CATALOG_WINDOW_LIMIT >= matches.length;
  const milliseconds = performance.now() - started;
  if (catalogBenchmarkSession) catalogBenchmarkSession.renderDurations.push(milliseconds);
  return { matches: matches.length, rendered: windowRecords.length, first, last, milliseconds };
}

function createCatalogBenchmarkFixture() {
  const templates = catalogEntries({ selectableOnly: true });
  return Array.from({ length: 1_000 }, (_, index) => {
    const template = templates[index % templates.length];
    return {
      ...template,
      type: `benchmark.component-${index}-v1`,
      fixtureBaseType: template.type,
      displayName: `Benchmark component ${String(index).padStart(4, '0')}`,
      manufacturer: `Benchmark Maker-group-${index % 20}`,
      partNumber: `BENCH-${String(index).padStart(4, '0')}`,
      catalog: {
        ...template.catalog,
        aliases: [...template.catalog.aliases, `benchmark-alias-${index}`],
        functions: [...template.catalog.functions, 'benchmark fixture'],
      },
    };
  });
}

function animationFrames(count = 2) {
  return new Promise((resolve) => {
    const next = () => { if (count-- <= 0) resolve(); else requestAnimationFrame(next); };
    next();
  });
}

async function benchmarkCatalogFixture(action = 'start') {
  if (action === 'stop') {
    await animationFrames();
    catalogBenchmarkSession?.observer?.disconnect();
    const summary = catalogBenchmarkSession ? {
      records: catalogFixtureRecords?.length ?? 0,
      attached: elements.cataloglist.isConnected,
      maximumRenderMilliseconds: Math.max(0, ...catalogBenchmarkSession.renderDurations),
      longTaskObserverSupported: catalogBenchmarkSession.longTaskObserverSupported,
      longTasks: [...catalogBenchmarkSession.longTasks],
      progressiveThumbnails: elements.cataloglist.querySelectorAll('.catalog-thumbnail').length,
    } : null;
    catalogFixtureRecords = null;
    catalogBenchmarkSession = null;
    const prior = catalogFixturePriorFilters;
    catalogFixturePriorFilters = null;
    if (prior) {
      elements.catalogsearch.value = prior.query; elements.catalogcategory.value = prior.category;
      elements.cataloginterface.value = prior.interface; elements.catalogstatus.value = prior.status;
      elements.catalogsupplyvoltage.value = prior.supplyVoltage;
      elements.catalogpinvoltage.value = prior.pinVoltage;
      elements.catalogfavorites.checked = prior.favorites;
    }
    catalogWindowStart = 0; renderCatalog();
    return summary;
  }
  if (catalogFixtureRecords) throw new Error('CATALOG_BENCHMARK_ALREADY_ACTIVE');
  catalogFixturePriorFilters = {
    query: elements.catalogsearch.value, category: elements.catalogcategory.value,
    interface: elements.cataloginterface.value, status: elements.catalogstatus.value,
    supplyVoltage: elements.catalogsupplyvoltage.value, pinVoltage: elements.catalogpinvoltage.value,
    favorites: elements.catalogfavorites.checked,
  };
  catalogFixtureRecords = createCatalogBenchmarkFixture();
  elements.catalogsearch.value = 'benchmark'; elements.catalogcategory.value = 'all';
  elements.cataloginterface.value = 'all'; elements.catalogstatus.value = 'all'; elements.catalogfavorites.checked = false;
  elements.catalogsupplyvoltage.value = 'all'; elements.catalogpinvoltage.value = 'all';
  catalogWindowStart = 0;
  const longTasks = [];
  const longTaskObserverSupported = 'PerformanceObserver' in window && PerformanceObserver.supportedEntryTypes?.includes('longtask');
  const observer = longTaskObserverSupported
    ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration))) : null;
  observer?.observe({ type: 'longtask', buffered: false });
  catalogBenchmarkSession = { longTasks, observer, longTaskObserverSupported, renderDurations: [] };
  const started = performance.now();
  const initial = renderCatalog();
  const layout = elements.cataloglist.getBoundingClientRect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {
    records: catalogFixtureRecords.length,
    matches: initial.matches,
    rendered: initial.rendered,
    attached: elements.cataloglist.isConnected,
    initialAttachedWorkMilliseconds: performance.now() - started,
    attachedLayout: { width: layout.width, height: layout.height },
    maximumRenderMilliseconds: Math.max(0, ...catalogBenchmarkSession.renderDurations),
    longTaskObserverSupported,
    longTasks: [...longTasks],
    progressiveThumbnails: elements.cataloglist.querySelectorAll('.catalog-thumbnail').length,
  };
}

function addComponent(type, point = null) {
  try {
    const candidatePrefix = {
      'reference.ground-v1': 'ground-reference',
      'switch.toggle-spst-v1': 'toggle-switch',
      'switch.changeover-spdt-v1': 'selector',
      'sensor.light-analogue-v1': 'light-sensor',
      'sensor.temperature-analogue-v1': 'temperature-sensor',
      [DIGITAL_LIGHT_THRESHOLD_TYPE]: 'light-threshold',
      [COMMON_CATHODE_RGB_LED_TYPE]: 'rgb-led',
      [ACTIVE_BUZZER_TYPE]: 'active-buzzer',
      [SEVEN_SEGMENT_TYPE]: 'seven-segment',
      [CHARACTER_LCD_TYPE]: 'character-lcd',
      [ROTARY_ENCODER_TYPE]: 'rotary-encoder',
    }[type];
    const component = editor.kind === 'candidate-project-v3' && candidatePrefix
      ? createCandidateUiComponent(type, nextEntityId(candidatePrefix, currentProject().circuit.components.map((item) => item.id)))
      : newComponent(type, currentProject().circuit);
    const index = currentProject().circuit.components.length;
    const firstPosition = {
      'board.atmega328p-16mhz-v1': { x: 0.2, y: 0.34 },
      'resistor.fixed-v1': { x: 0.48, y: 0.16 },
      'led.basic-v1': { x: 0.77, y: 0.16 },
      'button.momentary-v1': { x: 0.77, y: 0.52 },
      'potentiometer.linear-v1': { x: 0.47, y: 0.76 },
      'reference.ground-v1': { x: 0.18, y: 0.78 },
      'switch.toggle-spst-v1': { x: 0.48, y: 0.78 },
      'switch.changeover-spdt-v1': { x: 0.78, y: 0.78 },
      'sensor.light-analogue-v1': { x: 0.62, y: 0.76 },
      'sensor.temperature-analogue-v1': { x: 0.78, y: 0.76 },
      [DIGITAL_LIGHT_THRESHOLD_TYPE]: { x: 0.78, y: 0.72 },
      [COMMON_CATHODE_RGB_LED_TYPE]: { x: 0.78, y: 0.7 },
      [ACTIVE_BUZZER_TYPE]: { x: 0.78, y: 0.68 },
      [SEVEN_SEGMENT_TYPE]: { x: 0.76, y: 0.66 },
      [CHARACTER_LCD_TYPE]: { x: 0.72, y: 0.64 },
      [ROTARY_ENCODER_TYPE]: { x: 0.72, y: 0.64 },
    }[type];
    const sameTypeCount = currentProject().circuit.components.filter((item) => item.type === type).length;
    const slot = index % 16;
    const position = point ?? (sameTypeCount === 0 ? firstPosition : {
      x: 0.12 + (slot % 4) * 0.25,
      y: 0.12 + Math.floor(slot / 4) * 0.25,
    });
    const result = applyEditor({ type: 'component.add', component, position }, `Added ${component.id}`);
    if (result.ok) {
      selectComponent(component.id);
      markRecentComponent(type);
      renderCatalog();
    }
    renderProject();
    return result;
  } catch (error) {
    elements.projectmessage.textContent = `Add rejected: ${error.message}`;
    return { ok: false, code: error.message };
  }
}

function renderPropertyEditor(component) {
  if (!component || !Object.keys(component.properties).length) { elements.propertyeditor.replaceChildren(); return; }
  const definition = uiComponentCatalog[component.type];
  const rows = Object.entries(component.properties).map(([key, value]) => {
    const row = document.createElement('div'); row.className = 'property-row';
    const contract = definition.propertySchema[key] ?? {};
    const label = document.createElement('label'); label.textContent = `${key}${contract.unit ? ` (${contract.unit})` : ''}`;
    let input;
    if (key === 'color') {
      input = document.createElement('select');
      for (const color of ['red', 'yellow', 'green', 'blue']) { const option = document.createElement('option'); option.value = color; option.textContent = color; option.selected = color === value; input.append(option); }
    } else if (typeof value === 'boolean') {
      input = document.createElement('select');
      for (const optionValue of [true, false]) { const option = document.createElement('option'); option.value = String(optionValue); option.textContent = String(optionValue); option.selected = optionValue === value; input.append(option); }
    } else {
      input = document.createElement('input'); input.type = typeof value === 'number' ? 'number' : 'text'; input.value = String(value);
      if (typeof contract.minimum === 'number') input.min = String(contract.minimum);
      if (typeof contract.maximum === 'number') input.max = String(contract.maximum);
      if (typeof value === 'number') input.step = contract.kind === 'integer' ? '1' : 'any';
    }
    input.dataset.property = key;
    input.addEventListener('change', () => {
      const next = typeof value === 'number' ? Number(input.value) : typeof value === 'boolean' ? input.value === 'true' : input.value;
      applyEditor({ type: 'component.property.set', componentId: component.id, key, value: next }, `Updated ${component.id}.${key}`);
    });
    label.htmlFor = `${component.id}-${key}`; input.id = label.htmlFor; row.append(label, input); return row;
  });
  elements.propertyeditor.replaceChildren(...rows);
}

function renderWireBends(net) {
  if (!net) { elements.wirebends.textContent = 'Select a net to edit route bends.'; return; }
  const storedRoute = currentProject().layout.wireRoutes[net.id];
  if (isRouteFamily(storedRoute)) {
    const sections = storedRoute.branches.reduce((count, branch) => count + branch.points.length, 0);
    const summary = document.createElement('p');
    const hasJunction = currentProject().circuit.junctions.some((junction) => junction.net === net.id);
    summary.textContent = `${storedRoute.branches.length} pin branches · ${sections} sections. ${hasJunction ? 'The explicit junction hub stays fixed when a branch section moves.' : 'Crossings and overlaps stay electrically separate.'}`;
    const buttons = storedRoute.branches.flatMap((branch) => branch.points.map((_, segmentIndex) => {
      const endpoint = endpointKey(branch.endpoint);
      const button = document.createElement('button'); button.type = 'button';
      const selected = selectedRouteSegment?.netId === net.id
        && selectedRouteSegment.endpoint === endpoint && selectedRouteSegment.segmentIndex === segmentIndex;
      button.setAttribute('aria-pressed', String(selected));
      button.textContent = `${endpoint} · section ${segmentIndex + 1}`;
      button.addEventListener('click', () => {
        const target = elements.circuitwires.querySelector(
          `.wire-segment-hit[data-net="${net.id}"][data-endpoint="${endpoint}"][data-segment="${segmentIndex}"]`,
        );
        target?.focus();
      });
      return button;
    }));
    elements.wirebends.replaceChildren(summary, ...buttons);
    return;
  }
  const points = storedRoute ?? [];
  if (!points.length) { elements.wirebends.textContent = 'Automatic body-avoiding orthogonal route. Add a bend to override it.'; return; }
  const rows = points.map((point, index) => {
    const row = document.createElement('div'); row.className = 'bend-row';
    const x = document.createElement('input'); x.type = 'number'; x.min = '0'; x.max = '1'; x.step = '0.01'; x.value = String(point.x); x.setAttribute('aria-label', `Bend ${index + 1} x`);
    const y = document.createElement('input'); y.type = 'number'; y.min = '0'; y.max = '1'; y.step = '0.01'; y.value = String(point.y); y.setAttribute('aria-label', `Bend ${index + 1} y`);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove bend ${index + 1}`);
    const update = () => {
      const next = points.map((item) => ({ ...item })); next[index] = { x: Number(x.value), y: Number(y.value) };
      applyEditor({ type: 'wire.route.set', netId: net.id, points: next }, `Moved bend ${index + 1}`);
    };
    x.addEventListener('change', update); y.addEventListener('change', update);
    remove.addEventListener('click', () => applyEditor({ type: 'wire.route.set', netId: net.id, points: points.filter((_, pointIndex) => pointIndex !== index) }, `Removed bend ${index + 1}`));
    row.append(x, y, remove); return row;
  });
  elements.wirebends.replaceChildren(...rows);
}

function renderInspector() {
  let component = currentProject().circuit.components.find((item) => item.id === selectedComponentId) ?? null;
  let net = currentProject().circuit.nets.find((item) => item.id === selectedNetId) ?? null;
  if ((selection.kind === 'component' && !component)
      || (['wire-segment', 'net'].includes(selection.kind) && !net)
      || (selection.kind === 'wire-segment'
        && !net?.endpoints.some((endpoint) => endpointKey(endpoint) === selection.endpoint))) {
    setSelection({ kind: 'none' });
    component = null;
    net = null;
  }
  elements.selectionname.textContent = component
    ? `${component.label} · ${component.id}`
    : selection.kind === 'wire-segment'
      ? `${selection.netId} · ${selection.endpoint} · ${selection.orientation} section ${selection.segmentIndex + 1}`
      : selection.kind === 'net' ? `${selection.netId} · whole net` : 'Nothing selected';
  const definition = component ? uiComponentCatalog[component.type] : null;
  elements.selectionsupport.textContent = definition
    ? `${SUPPORT_STATUS[definition.support.status]} · ${definition.partNumber} · ${definition.support.limitations.join(' ')}`
    : selection.kind === 'wire-segment'
      ? 'Selected physical branch section. Delete removes this connection only; crossings never connect.'
      : selection.kind === 'net'
        ? 'Whole net selected for inspection. Use the separately labelled whole-net action to remove it.'
        : 'Select a part or wire section to inspect its exact target.';
  elements.rotatecomponent.disabled = !component;
  elements.duplicatecomponent.disabled = !component || component.type.startsWith('board.');
  elements.deletecomponent.disabled = !component;
  renderPropertyEditor(component);

  const prior = selectedNetId;
  const options = [new Option('No net selected', ''), ...currentProject().circuit.nets.map((net) => new Option(`${net.id} · ${net.endpoints.length} pins`, net.id))];
  elements.selectednet.replaceChildren(...options);
  if (currentProject().circuit.nets.some((net) => net.id === prior)) elements.selectednet.value = prior;
  else if (selection.kind !== 'component') setSelection({ kind: 'none' });
  net = currentProject().circuit.nets.find((item) => item.id === selectedNetId) ?? null;
  elements.addbend.disabled = !net || !selectedRouteSegment;
  elements.deletebranch.disabled = !net || !selectedRouteSegment;
  elements.deletebranch.textContent = net?.endpoints.length === 2 ? 'Delete selected connection' : 'Delete selected branch';
  elements.deletewire.disabled = !net;
  elements.reconnectmode.disabled = !net || !selectedRouteSegment;
  elements.wirecolor.disabled = !net;
  if (net) elements.wirecolor.value = currentProject().layout.wireStyles[net.id].color;
  const junction = net && currentProject().circuit.junctions.find((item) => item.net === net.id);
  elements.removejunction.disabled = !junction;
  elements.netmembers.textContent = net
    ? `${selectedRouteSegment ? `Selected branch: ${selectedRouteSegment.endpoint}\n` : ''}${net.endpoints.map(endpointKey).join('\n')}${junction ? '\n\nPolicy: the explicit junction hub stays fixed during section moves.' : '\n\nPolicy: crossings and overlaps never connect.'}`
    : 'Select a net to inspect all connected pins.';
  renderWireBends(net);
}

function renderRuntimeControls() {
  const controls = currentProject().circuit.components.flatMap((component) => {
    if (editor.kind === 'candidate-project-v3' && component.type === ROTARY_ENCODER_TYPE) {
      const row = document.createElement('div'); row.className = 'encoder-runtime-control';
      const label = document.createElement('span');
      label.textContent = `${component.label} · detent ${component.controls.detent} · rest 11`;
      const ccw = document.createElement('button'); ccw.type = 'button'; ccw.textContent = 'CCW −1';
      ccw.dataset.control = `${component.id}.ccw`;
      ccw.setAttribute('aria-label', `${component.label}: turn one detent counter-clockwise.`);
      ccw.addEventListener('click', () => rotateCandidateEncoder(component.id, 'ccw', 'inspector button'));
      const cw = document.createElement('button'); cw.type = 'button'; cw.textContent = 'CW +1';
      cw.dataset.control = `${component.id}.cw`;
      cw.setAttribute('aria-label', `${component.label}: turn one detent clockwise.`);
      cw.addEventListener('click', () => rotateCandidateEncoder(component.id, 'cw', 'inspector button'));
      const note = document.createElement('small');
      note.textContent = '11→01→00→10→11 CW · reverse CCW · ideal 1 ms phases · no bounce';
      row.append(label, ccw, cw, note); return [row];
    }
    if (editor.kind === 'candidate-project-v3'
        && ['switch.toggle-spst-v1', 'switch.changeover-spdt-v1'].includes(component.type)) {
      const row = document.createElement('div');
      const label = document.createElement('span'); label.textContent = component.label;
      const button = document.createElement('button'); button.type = 'button';
      const isSpst = component.type === 'switch.toggle-spst-v1';
      const key = isSpst ? 'closed' : 'selectedThrow';
      const value = component.controls[key];
      button.dataset.control = `${component.id}.${key}`;
      button.setAttribute('aria-pressed', String(isSpst ? value : value === 'B'));
      button.textContent = isSpst ? (value ? 'Closed' : 'Open') : `Throw ${value}`;
      button.setAttribute('aria-label', isSpst
        ? `${component.label}: ${value ? 'closed' : 'open'}. Activate to toggle.`
        : `${component.label}: COM connected to ${value}. Activate to select ${value === 'A' ? 'B' : 'A'}.`);
      button.addEventListener('click', () => {
        const next = isSpst ? !component.controls.closed : component.controls.selectedThrow === 'A' ? 'B' : 'A';
        const prepared = candidateContactControl(editor, component.id, key, next);
        if (!prepared.ok) { showActionableError(elements.projectmessage, prepared.code, 'Candidate control rejected.'); return; }
        const changed = editor.apply({ ...prepared.command, revision: editor.revision });
        if (!changed.ok) { showActionableError(elements.projectmessage, changed.code, 'Candidate control rejected.'); return; }
        applyLifecycle({ type: 'project.edit', relevance: 'runtime', empty: false });
        persistProject();
        if (prepared.worker) worker?.postMessage(prepared.worker);
        if (prepared.transition && worker) {
          const projection = editor.evaluateSpdtRuntime(component.id);
          for (const frame of prepared.transition.frames.slice(1)) worker.postMessage({
            command: 'digital-input', pin: prepared.transition.boardPinNumber,
            level: frame.state === 'BREAK' ? true : projection.projection.level,
          });
        }
        elements.projectmessage.textContent = isSpst
          ? `${component.label} changed at runtime without rebuilding.`
          : `${component.label} changed through BREAK. Direct GND/5 V digital-input model only.`;
        renderProject();
      });
      row.append(label, button); return [row];
    }
    if (component.type === 'button.momentary-v1') {
      const row = document.createElement('div');
      const label = document.createElement('span'); label.textContent = component.label;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.control = `${component.id}.pressed`;
      button.setAttribute('aria-pressed', String(component.controls.pressed)); button.textContent = component.controls.pressed ? 'Pressed' : 'Released';
      button.addEventListener('click', () => {
        const pressed = button.getAttribute('aria-pressed') !== 'true';
        setMomentaryControl(component.id, pressed, 'runtime control');
      });
      row.append(label, button); return [row];
    }
    if (editor.kind === 'candidate-project-v3' && component.type === 'sensor.light-analogue-v1') {
      const row = document.createElement('div');
      const label = document.createElement('label');
      const level = Math.round(component.controls.lightLevel * 100);
      label.textContent = `${component.label} · idealized ${level}% · ${(component.controls.lightLevel * 5).toFixed(2)} V`;
      const input = document.createElement('input');
      input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1'; input.value = String(level);
      input.dataset.control = `${component.id}.lightLevel`;
      input.id = `control-${component.id}-light-level`; label.htmlFor = input.id;
      input.setAttribute('aria-label', `${component.label} idealized light level, 0 to 100 percent`);
      input.addEventListener('input', () => {
        const lightLevel = Number(input.value) / 100;
        const prepared = candidateContactControl(editor, component.id, 'lightLevel', lightLevel);
        if (!prepared.ok) {
          showActionableError(elements.projectmessage, prepared.code, 'Light sensor control rejected.');
          return;
        }
        const result = applyEditor(prepared.command, `${component.label} idealized signal ${input.value}%`);
        if (result.ok && prepared.worker) worker?.postMessage(prepared.worker);
      });
      row.append(label, input); return [row];
    }
    if (editor.kind === 'candidate-project-v3' && component.type === 'sensor.temperature-analogue-v1') {
      const row = document.createElement('div');
      const label = document.createElement('label');
      const temperatureC = component.controls.temperatureC;
      const voltage = temperatureCToVoltage(temperatureC);
      label.textContent = `${component.label} · idealized ${temperatureC} °C · ${voltage.toFixed(3)} V`;
      const input = document.createElement('input');
      input.type = 'range'; input.min = String(TEMPERATURE_MIN_C); input.max = String(TEMPERATURE_MAX_C);
      input.step = '1'; input.value = String(temperatureC);
      input.dataset.control = `${component.id}.temperatureC`;
      input.id = `control-${component.id}-temperature`; label.htmlFor = input.id;
      input.setAttribute('aria-label', `${component.label} idealized temperature, ${TEMPERATURE_MIN_C} to ${TEMPERATURE_MAX_C} degrees Celsius`);
      input.addEventListener('input', () => {
        const nextTemperatureC = Number(input.value);
        const prepared = candidateContactControl(editor, component.id, 'temperatureC', nextTemperatureC);
        if (!prepared.ok) {
          showActionableError(elements.projectmessage, prepared.code, 'Temperature module control rejected.');
          return;
        }
        const result = applyEditor(prepared.command, `${component.label} idealized signal ${nextTemperatureC} °C`);
        if (result.ok && prepared.worker) worker?.postMessage(prepared.worker);
      });
      row.append(label, input); return [row];
    }
    if (editor.kind === 'candidate-project-v3' && component.type === DIGITAL_LIGHT_THRESHOLD_TYPE) {
      const controls = component.controls;
      const definitions = [
        {
          key: 'lightLevelPercent', label: `${component.label} · input ${controls.lightLevelPercent}% · DOUT ${controls.outputActive ? 'LOW active' : 'HIGH inactive'}`,
          min: LIGHT_LEVEL_MIN_PERCENT, max: LIGHT_LEVEL_MAX_PERCENT,
          aria: `${component.label} idealized light input, 0 to 100 percent`, message: 'light input',
        },
        {
          key: 'thresholdPercent', label: `Activation threshold · ${controls.thresholdPercent}%`,
          min: LIGHT_THRESHOLD_MIN_PERCENT, max: LIGHT_THRESHOLD_MAX_PERCENT,
          aria: `${component.label} activation threshold, 10 to 100 percent`, message: 'activation threshold',
        },
        {
          key: 'hysteresisPercentagePoints', label: `Hysteresis · ${controls.hysteresisPercentagePoints} percentage points`,
          min: LIGHT_HYSTERESIS_MIN_POINTS, max: LIGHT_HYSTERESIS_MAX_POINTS,
          aria: `${component.label} hysteresis, 0 to 10 percentage points`, message: 'hysteresis',
        },
      ];
      return definitions.map((control) => {
        const row = document.createElement('div');
        const label = document.createElement('label'); label.textContent = control.label;
        const input = document.createElement('input'); input.type = 'range';
        input.min = String(control.min); input.max = String(control.max); input.step = '1';
        input.value = String(component.controls[control.key]);
        input.dataset.control = `${component.id}.${control.key}`;
        input.id = `control-${component.id}-${control.key}`; label.htmlFor = input.id;
        input.setAttribute('aria-label', control.aria);
        input.addEventListener('input', () => {
          const value = Number(input.value);
          const prepared = candidateContactControl(editor, component.id, control.key, value);
          if (!prepared.ok) {
            showActionableError(elements.projectmessage, prepared.code, 'Digital threshold control rejected.');
            return;
          }
          const result = applyEditor(prepared.command, `${component.label} ${control.message} ${value}`);
          if (result.ok && prepared.worker) worker?.postMessage(prepared.worker);
        });
        row.append(label, input);
        return row;
      });
    }
    if (component.type === 'potentiometer.linear-v1') {
      const row = document.createElement('div');
      const label = document.createElement('label'); label.textContent = component.label;
      const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '100'; input.value = String(component.controls.position * 100); input.dataset.control = `${component.id}.position`;
      input.id = `control-${component.id}-position`; label.htmlFor = input.id;
      input.addEventListener('input', () => {
        const position = Number(input.value) / 100;
        const result = applyEditor({ type: 'component.control.set', componentId: component.id, key: 'position', value: position }, `${component.id} ${input.value}%`);
        if (result.ok) worker?.postMessage({ command: 'control', componentId: component.id, key: 'position', value: position });
      });
      row.append(label, input); return [row];
    }
    return [];
  });
  elements.componentcontrols.replaceChildren(...controls);
}

function renderProject() {
  const project = currentProject();
  const validation = editor.kind === 'candidate-project-v3'
    ? editor.runnable
    : validateCircuit(project.circuit);
  const endpointCount = project.circuit.nets.reduce((count, net) => count + net.endpoints.length, 0);
  elements.graphstate.textContent = `${project.circuit.components.length} components · ${project.circuit.nets.length} nets · ${endpointCount} endpoints`;
  if (validation.ok) {
    elements.circuitdiagnostics.textContent = editor.kind === 'candidate-project-v3'
      ? 'Candidate accepted: validated contacts, bounded analogue/digital modules, current-limited light outputs, silent buzzer, seven-segment, and write-only 4-bit GPIO character LCD. Unsupported display commands and electrical topologies fail closed; no physical sensor, optical, acoustic or display accuracy is claimed.'
      : 'Circuit accepted for the tested runtime subset.';
  } else {
    if (editor.kind === 'candidate-project-v3') {
      const details = (validation.details ?? []).map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' · ');
      elements.circuitdiagnostics.textContent = `Draft saved; Build/Run blocked: ${validation.code}${details ? ` · ${details}` : ''}. Complete required terminals with the supported direct 5 V, ground, digital or A0–A5 topology.`;
    } else {
      const explanations = (validation.diagnostics ?? []).map((item) => explainError(item.code));
      elements.circuitdiagnostics.textContent = [...new Set(explanations.map((item) => item.action))].join('\n');
    }
  }
  if (!project.source.files.some((file) => file.name === selectedSourceFile)) selectedSourceFile = 'main.ino';
  const selectedFile = project.source.files.find((file) => file.name === selectedSourceFile);
  elements.sourcefile.replaceChildren(...project.source.files.map((file) => new Option(file.name, file.name, false, file.name === selectedSourceFile)));
  elements.sourcefileremove.disabled = selectedSourceFile === 'main.ino';
  elements.editortitle.textContent = selectedSourceFile;
  if (elements.source.value !== selectedFile.content) elements.source.value = selectedFile.content;
  renderSourceEditor();
  const browserRecoveryCurrent = savedRevision === editor.revision && savedProjectGeneration === lifecycle.projectGeneration;
  const fileSaved = fileSavedRevision === editor.revision && fileSavedProjectGeneration === lifecycle.projectGeneration;
  elements.projectname.value = project.metadata.name;
  const saveState = fileSaved ? fileSaveState : browserRecoveryCurrent ? 'browser recovery current · not saved to file' : 'not saved to file';
  elements.projectstate.textContent = `${project.metadata.name} · ${lifecycle.phase} · revision ${editor.revision} · ${saveState}`;
  elements.canvastitle.textContent = `${project.metadata.name} circuit`;
  elements.undo.disabled = !editor.undoStack.length; elements.redo.disabled = !editor.redoStack.length;
  elements.zoomvalue.value = `${Math.round(project.layout.viewport.zoom * 100)}%`;
  for (const option of elements.logicchannels.options) option.selected = project.instruments.logicChannels.includes(option.value);
  if ([...elements.pinselect.options].some((option) => option.value === project.instruments.selectedPin)) elements.pinselect.value = project.instruments.selectedPin;
  elements.quickbuild.disabled = elements.build.disabled;
  publish({
    project: structuredClone(project), graph: structuredClone(project.circuit), revision: editor.revision,
    selectedComponentId, selectedNetId,
    selectedRouteSegment: selectedRouteSegment ? structuredClone(selectedRouteSegment) : null,
    selection: structuredClone(selection),
  });
  renderLifecycle();
  renderComponents(); renderInspector(); renderRuntimeControls(); renderPublicControllerWorkbench();
}

function svgNode(name, attributes = {}, text = null) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

function renderWaveform(logic) {
  const channels = [...elements.logicchannels.selectedOptions].map((option) => option.value);
  const model = waveformPaths(logic.transitions, channels, { edgeLimit: Number(elements.logicwindow.value) });
  const children = [];
  for (let index = 0; index <= 4; index += 1) {
    const x = model.left + model.plotWidth * index / 4;
    const cycle = Math.round(model.startCycle + (model.endCycle - model.startCycle) * index / 4);
    children.push(svgNode('line', { class: 'wave-grid', x1: x, y1: 18, x2: x, y2: 232 }));
    children.push(svgNode('text', { class: 'wave-axis', x, y: 252, 'text-anchor': 'middle' }, `${(cycle / CPU_CYCLES_PER_MILLISECOND).toFixed(2)} ms`));
  }
  for (const path of model.paths) {
    children.push(svgNode('text', { class: 'wave-label', x: 8, y: path.labelY + 6 }, path.channel));
    children.push(svgNode('path', { class: 'wave-path', d: path.d, 'data-channel': path.channel }));
  }
  const cursors = cursorCycles(model, Number(elements.logiccursora.value) / 100, Number(elements.logiccursorb.value) / 100);
  const cycleX = (cycle) => model.left + ((cycle - model.startCycle) / (model.endCycle - model.startCycle)) * model.plotWidth;
  children.push(svgNode('line', { class: 'wave-cursor', x1: cycleX(cursors.first), y1: 12, x2: cycleX(cursors.first), y2: 232 }));
  children.push(svgNode('line', { class: 'wave-cursor', x1: cycleX(cursors.second), y1: 12, x2: cycleX(cursors.second), y2: 232 }));
  elements.logicwaveform.replaceChildren(...children);
  elements.logiccursor.textContent = `A ${cursors.first.toLocaleString('en-US')} · B ${cursors.second.toLocaleString('en-US')} · Δ ${cursors.deltaCycles.toLocaleString('en-US')} cycles · ${cursors.deltaMilliseconds.toFixed(3)} ms`;
  return model;
}

function renderRgbLedRuntime(message) {
  if (editor.kind !== 'candidate-project-v3') return;
  const pins = new Map((message.pins ?? []).map((pin) => [pin.pin, pin]));
  const dutyForPin = (pinLabel) => {
    const pin = pins.get(pinLabel);
    if (Number.isFinite(pin?.pwm?.duty)) return Math.max(0, Math.min(1, pin.pwm.duty));
    return pin?.mode === 'OUTPUT' || pin?.mode === 'DIGITAL_PWM' ? Number(Boolean(pin.level)) : 0;
  };
  for (const support of editor.runtimeSupport.filter(
    (item) => item.type === COMMON_CATHODE_RGB_LED_TYPE && item.runtimeProjection,
  )) {
    const artwork = elements.componentlayer.querySelector(
      `[data-component-id="${support.componentId}"] [data-artwork-key="output-rgb-led-common-cathode"]`,
    );
    if (!artwork) continue;
    const duties = Object.fromEntries(['R', 'G', 'B'].map((channel) => [
      channel, dutyForPin(support.runtimeProjection.channels[channel].sourcePin),
    ]));
    artwork.dataset.rDuty = duties.R.toFixed(3);
    artwork.dataset.gDuty = duties.G.toFixed(3);
    artwork.dataset.bDuty = duties.B.toFixed(3);
    for (const channel of ['R', 'G', 'B']) {
      const visual = artwork.querySelector(`[data-rgb-channel="${channel}"]`);
      if (!visual) continue;
      visual.classList.toggle('on', duties[channel] > 0.001);
      visual.style.opacity = String(0.22 + duties[channel] * 0.78);
      visual.style.filter = duties[channel] > 0.001
        ? `drop-shadow(0 0 ${2 + duties[channel] * 6}px currentColor)` : '';
    }
    artwork.querySelector('.rgb-led-mix')?.setAttribute('fill', `rgb(${Math.round(duties.R * 255)} ${Math.round(duties.G * 255)} ${Math.round(duties.B * 255)})`);
    const label = `${support.componentId}, commanded relative PWM mix red ${(duties.R * 100).toFixed(1)} percent, green ${(duties.G * 100).toFixed(1)} percent, blue ${(duties.B * 100).toFixed(1)} percent; no physical colour accuracy claimed`;
    artwork.setAttribute('aria-label', label);
    const title = artwork.querySelector('title'); if (title) title.textContent = label;
  }
}

function renderActiveBuzzerRuntime(message) {
  if (editor.kind !== 'candidate-project-v3') return;
  const pins = new Map((message.pins ?? []).map((pin) => [pin.pin, pin]));
  for (const support of editor.runtimeSupport.filter(
    (item) => item.type === ACTIVE_BUZZER_TYPE && item.runtimeProjection,
  )) {
    const artwork = elements.componentlayer.querySelector(
      `[data-component-id="${support.componentId}"] [data-artwork-key="output-active-buzzer-module"]`,
    );
    if (!artwork) continue;
    const pin = pins.get(support.runtimeProjection.sourcePin);
    const driven = pin?.mode === 'OUTPUT';
    const enabled = driven && Boolean(pin.level);
    const driveState = driven ? (enabled ? 'enabled' : 'disabled') : 'not-driven';
    artwork.dataset.enabled = String(enabled);
    artwork.dataset.driveState = driveState;
    artwork.querySelector('.active-buzzer-disc')?.classList.toggle('on', enabled);
    artwork.querySelector('.buzzer-status')?.classList.toggle('on', enabled);
    for (const wave of artwork.querySelectorAll('.buzzer-wave')) wave.classList.toggle('on', enabled);
    const label = `${support.componentId}, ${driveState} from ${support.runtimeProjection.sourcePin}; silent logical active-buzzer indicator, no acoustic or current accuracy claimed`;
    artwork.setAttribute('aria-label', label);
    const title = artwork.querySelector('title'); if (title) title.textContent = label;
  }
}

function renderSevenSegmentRuntime(message) {
  if (editor.kind !== 'candidate-project-v3') return;
  const pins = new Map((message.pins ?? []).map((pin) => [pin.pin, pin]));
  for (const support of editor.runtimeSupport.filter(
    (item) => item.type === SEVEN_SEGMENT_TYPE && item.runtimeProjection,
  )) {
    const artwork = elements.componentlayer.querySelector(
      `[data-component-id="${support.componentId}"] [data-artwork-key="output-seven-segment-common-cathode"]`,
    );
    if (!artwork) continue;
    const active = Object.entries(support.runtimeProjection.segments)
      .filter(([, segment]) => {
        const pin = pins.get(segment.sourcePin);
        return pin?.mode === 'OUTPUT' && Boolean(pin.level);
      })
      .map(([segment]) => segment)
      .sort();
    artwork.dataset.activeSegments = active.join('');
    for (const segment of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      artwork.querySelector(`[data-seven-segment="${segment}"]`)?.classList.toggle(
        'on', active.includes(segment),
      );
    }
    const state = active.length ? active.join(', ') : 'blank';
    const label = `${support.componentId}, commanded segments ${state}; idealized on/off state only, no physical brightness or package-current accuracy claimed`;
    artwork.setAttribute('aria-label', label);
    const title = artwork.querySelector('title'); if (title) title.textContent = label;
  }
}

function renderCharacterLcdRuntime(message) {
  if (editor.kind !== 'candidate-project-v3') return;
  const pins = new Map((message.pins ?? []).map((pin) => [pin.pin, pin]));
  const trace = Array.isArray(message.trace) ? message.trace : [];
  const published = [];
  for (const support of editor.runtimeSupport.filter(
    (item) => item.type === CHARACTER_LCD_TYPE && item.runtimeProjection,
  )) {
    const artwork = elements.componentlayer.querySelector(
      `[data-component-id="${support.componentId}"] [data-artwork-key="output-character-lcd-16x2-4bit"]`,
    );
    if (!artwork) continue;
    const mapping = Object.fromEntries(Object.entries(support.runtimeProjection.signals).map(
      ([signal, record]) => [signal, record.sourcePin],
    ));
    let record = characterLcdRuntime.get(support.componentId);
    if (!record || message.cycle < record.cycle || trace.length < record.traceLength) {
      record = { decoder: createCharacterLcd4BitDecoder(mapping), cycle: 0, traceLength: 0 };
      characterLcdRuntime.set(support.componentId, record);
    }
    const driven = Object.values(mapping).every((pinName) => pins.get(pinName)?.mode === 'OUTPUT');
    const snapshot = driven
      ? record.decoder.consume(trace.slice(record.traceLength), {
        logicDrops: message.retentionDrops?.logic ?? 0,
      })
      : record.decoder.snapshot();
    record.traceLength = trace.length;
    record.cycle = message.cycle;
    const state = driven ? snapshot.status : 'not-driven';
    const lines = driven && snapshot.displayOn ? snapshot.lines : ['', ''];
    artwork.dataset.protocolState = state;
    artwork.dataset.line1 = lines[0]; artwork.dataset.line2 = lines[1];
    const line1 = artwork.querySelector('[data-lcd-line="1"]');
    const line2 = artwork.querySelector('[data-lcd-line="2"]');
    if (line1) line1.textContent = lines[0];
    if (line2) line2.textContent = lines[1];
    const detail = snapshot.error
      ? `${snapshot.error.code}: ${snapshot.error.details.join(', ')}`
      : `${state}; write-only 4-bit GPIO, ${snapshot.latchedBytes} bytes`;
    const label = `${support.componentId}, line 1 ${JSON.stringify(lines[0])}, line 2 ${JSON.stringify(lines[1])}; ${detail}; no I2C or physical display accuracy claimed`;
    artwork.setAttribute('aria-label', label);
    const title = artwork.querySelector('title'); if (title) title.textContent = label;
    published.push({ componentId: support.componentId, ...snapshot, status: state, lines });
  }
  publish({ characterLcd: published });
}

function renderRuntime(message) {
  publish({ runtime: structuredClone(message) });
  elements.cycle.textContent = message.cycle.toLocaleString('en-US');
  elements.simulatedtime.textContent = `${(message.cycle / CPU_CYCLES_PER_MILLISECOND).toFixed(3)} ms`;
  elements.instructions.textContent = message.instructions.toLocaleString('en-US');
  const now = performance.now();
  if (lastThroughputSample && message.cycle >= lastThroughputSample.cycle && now > lastThroughputSample.time) {
    const cyclesPerSecond = (message.cycle - lastThroughputSample.cycle) / ((now - lastThroughputSample.time) / 1000);
    if (cyclesPerSecond > 0) elements.achievedspeed.textContent = `${(cyclesPerSecond / 1_000_000).toFixed(2)} Mcycles/s · ${(cyclesPerSecond / 16_000_000).toFixed(2)}× real time`;
  }
  lastThroughputSample = { cycle: message.cycle, time: now };
  elements.requestedspeed.textContent = message.speed === 'maximum' ? 'Maximum' : `${message.speed ?? elements.speed.value}×`;
  for (const led of message.circuit?.leds ?? []) {
    const visual = elements.componentlayer.querySelector(`[data-led-id="${led.componentId}"]`);
    if (!visual) continue;
    visual.classList.toggle('on', led.on);
    visual.setAttribute('aria-label', `${led.componentId} is ${led.on ? 'on' : 'off'} at ${(led.currentAmps * 1_000).toFixed(2)} mA`);
  }
  renderRgbLedRuntime(message);
  renderActiveBuzzerRuntime(message);
  renderSevenSegmentRuntime(message);
  renderCharacterLcdRuntime(message);
  const transitions = message.trace.filter((entry) => entry.pin === 13).slice(-8).reverse();
  elements.trace.replaceChildren(...(transitions.length ? transitions : [{ cycle: 0, level: false }]).map((entry) => {
    const item = document.createElement('li'); item.textContent = `${String(entry.cycle).padStart(10, '0')} · ${entry.level ? 'HIGH' : 'LOW'}`; return item;
  }));
  const serial = message.instruments?.serial ?? { records: [], dropped: 0 };
  const textView = serialText(serial.records);
  elements.serialoutput.textContent = serialViewMode === 'events'
    ? (serial.records.length ? serialEventText(serial.records) : 'No serial events.')
    : (textView || 'No firmware bytes.');
  elements.serialcount.textContent = `${serial.records.length} records${serial.dropped ? ` · ${serial.dropped} dropped` : ''}`;
  updateSerialAutoscroll(serial);
  const logic = message.instruments?.logic ?? { transitions: [], dropped: 0 };
  const recent = logic.transitions.slice(-Number(elements.logicwindow.value)).reverse();
  elements.logicoutput.replaceChildren(...(recent.length ? recent : [{ pin: '—', cycle: 0, level: false }]).map((entry) => {
    const item = document.createElement('li'); item.textContent = `${entry.pin} · ${String(entry.cycle).padStart(10, '0')} · ${entry.level ? 'HIGH' : 'LOW'}`; return item;
  }));
  elements.logiccount.textContent = `${logic.transitions.length} transitions${logic.dropped ? ` · ${logic.dropped} dropped` : ''}`;
  renderWaveform(logic);
  const pin = message.pins?.find((entry) => entry.pin === elements.pinselect.value) ?? null;
  elements.pinmode.textContent = pin?.mode ?? '—';
  elements.pinlevel.textContent = pin?.pin.startsWith('A') ? `${pin.voltage.toFixed(3)} V` : pin ? (pin.level ? 'HIGH' : 'LOW') : '—';
  elements.pindetail.textContent = pin?.pwm ? `${(pin.pwm.duty * 100).toFixed(1)}% · ${pin.pwm.periodCycles} cycles` : Number.isInteger(pin?.adc) ? `ADC ${pin.adc}` : '—';
  elements.pindiagnostic.textContent = pin?.diagnostic ?? '—'; elements.pincycle.textContent = message.cycle.toLocaleString('en-US');
  const stopped = message.kind === 'error' || message.kind === 'stopped-error';
  elements.workerstate.textContent = stopped ? `Stopped: ${message.message}` : message.paused ? 'Paused' : 'Running';
  if (stopped) { elements.run.disabled = true; elements.pause.disabled = true; elements.step.disabled = true; }
  else { elements.run.disabled = !message.paused; elements.pause.disabled = message.paused; elements.step.disabled = !message.paused; }
  elements.quickrun.disabled = elements.run.disabled; elements.quickpause.disabled = elements.pause.disabled; elements.quickreset.disabled = elements.reset.disabled;
}

function loadArtifact(hex, artifactIdentity) {
  stopRuntime('Loading verified artifact…');
  const loaded = applyLifecycle({ type: 'runtime.load' });
  if (!loaded.accepted) {
    showActionableError(elements.projectmessage, loaded.code, 'Runtime load rejected by lifecycle guard.');
    return;
  }
  const runtimeBinding = loaded.binding;
  const token = ++workerToken;
  runtimeWorkerCreations += 1;
  publish({ runtimeWorkerCreations });
  worker = new Worker('./simulator.worker.js', { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    if (token !== workerToken) return;
    const acceptedMessage = applyLifecycle({ type: 'runtime.message', binding: runtimeBinding, message: data });
    if (!acceptedMessage.accepted) return;
    lastWorkerMessage = performance.now(); running = data.paused === false && data.kind !== 'error';
    if (data.kind === 'ready') setRuntimeEnabled(true);
    renderRuntime(data);
  });
  worker.addEventListener('error', (event) => {
    if (token !== workerToken) return;
    running = false; const state = { kind: 'stopped-error', message: event.message };
    applyLifecycle({ type: 'runtime.message', binding: runtimeBinding, message: state });
    publish({ runtime: state });
    showActionableError(elements.projectmessage, 'WORKER_ERROR', event.message);
    elements.workerstate.textContent = 'Stopped — rebuild the current project';
  });
  elements.artifact.textContent = artifactIdentity.slice(0, 12);
  worker.postMessage({
    command: 'init', hex, circuit: structuredClone(currentRuntimeProject().circuit),
    digitalInputs: currentCandidateInputs(),
    instruments: {
      logicChannels: [...currentProject().instruments.logicChannels],
      selectedPin: currentProject().instruments.selectedPin,
      serialHistoryLimit: currentProject().instruments.serial.historyLimit,
    },
  });
}

function formatDiagnostics(result) {
  if (result?.diagnostics?.length) return result.diagnostics.map((item) => `${item.file}:${item.line}${item.column ? `:${item.column}` : ''} ${item.severity}: ${item.message}`).join('\n');
  return result?.text || result?.code || '';
}

function currentBuildBinding(binding) {
  const active = lifecycle.activeBuild;
  return active && active.projectGeneration === binding.projectGeneration
    && active.buildGeneration === binding.buildGeneration && active.requestId === binding.requestId;
}

async function pollJob(job, inputAtSubmit, binding) {
  while (activeJob === job && currentBuildBinding(binding)) {
    const response = await fetch(`/api/build/${job.jobId}`, {
      headers: { Authorization: `Bearer ${job.capability}` }, cache: 'no-store',
      signal: buildAbortController?.signal,
    });
    if (!response.ok) throw new Error('Build status could not be read');
    const status = await response.json();
    if (status.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    if (activeJob !== job || !currentBuildBinding(binding)) return;
    activeJob = null; elements.build.disabled = false; elements.quickbuild.disabled = false; elements.cancel.disabled = true;
    if (status.status === 'succeeded') {
      if (buildInputIdentity() !== inputAtSubmit) return;
      const result = status.result;
      const acceptedBuild = applyLifecycle({
        type: 'build.succeeded', binding,
        artifactIdentity: result.artifactIdentity, inputIdentity: result.inputIdentity,
        diagnostics: result.diagnostics ?? [],
      });
      if (!acceptedBuild.accepted) return;
      loadedSourceIdentity = inputAtSubmit;
      currentProject().build = { status: 'succeeded', inputIdentity: result.inputIdentity, artifactIdentity: result.artifactIdentity };
      persistProject();
      elements.buildstate.textContent = 'Build succeeded'; renderBuildDiagnostics(result, 'No compiler diagnostics.');
      publish({ buildState: 'succeeded', artifactIdentity: result.artifactIdentity, inputIdentity: result.inputIdentity, cacheHit: status.cacheHit });
      clearTechnicalError();
      loadArtifact(result.artifact.hex, result.artifactIdentity); return;
    }
    const errorCode = status.status === 'timeout' ? 'BUILD_TIMEOUT' : 'BUILD_FAILED';
    const acceptedFailure = applyLifecycle({
      type: 'build.failed', binding, diagnostics: status.result?.diagnostics ?? [{ code: errorCode }],
    });
    if (!acceptedFailure.accepted) return;
    currentProject().build = { status: 'failed', inputIdentity: status.inputIdentity ?? null, artifactIdentity: null };
    elements.buildstate.textContent = status.status === 'timeout' ? 'Build timed out' : status.status === 'cancelled' ? 'Build cancelled' : 'Build failed';
    renderBuildDiagnostics(status.result, status.error || 'Compilation failed.');
    publish({ buildState: status.status, artifactIdentity: null, inputIdentity: status.inputIdentity });
    stopRuntime('No runnable artifact', { updateLifecycle: false });
    showActionableError(elements.projectmessage, errorCode, elements.diagnostics.textContent);
    return;
  }
}

async function build() {
  const target = currentCompilerTarget();
  if (!target.compileAvailable) {
    const missing = firstMissingTargetPrerequisite(target.profile);
    const view = publicControllerView(target.profile);
    detachOutstandingBuild();
    stopRuntime(`${target.displayName} · public execution disabled · no runtime worker created`, { updateLifecycle: false });
    elements.buildstate.textContent = 'Target unavailable';
    const detail = `${missing ? `${missing.code}: ${missing.detail} ` : ''}${view?.limitation ?? 'This controller is not enabled publicly.'} No compiler or runtime request was made. The AVR circuit was not mapped to ${target.profile}.`;
    renderBuildDiagnostics({ diagnostics: [{ file: 'target', line: 1, severity: 'error', message: detail }] }, detail);
    showActionableError(elements.projectmessage, 'COMPILER_TARGET_UNAVAILABLE', detail);
    publish({
      buildState: 'unavailable', artifactIdentity: null, inputIdentity: null,
      artifactManifest: null, compileOnly: false, runtime: null,
      compilerRequestBlocked: true, cacheHit: false,
    });
    return;
  }
  if (editor.kind === 'candidate-project-v3') {
    const runnable = editor.runnable;
    if (!runnable.ok) {
      const details = (runnable.details ?? []).map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' · ');
      const message = `${runnable.code}${details ? ` · ${details}` : ''}. Complete the required contact wiring before building.`;
      elements.buildstate.textContent = 'Draft not runnable';
      renderBuildDiagnostics({ diagnostics: [{ file: 'circuit', line: 1, severity: 'error', message }] }, message);
      showActionableError(elements.projectmessage, runnable.code, message);
      return;
    }
  }
  const runtimeProject = currentRuntimeProject();
  const circuit = validateCircuit(runtimeProject.circuit);
  if (!circuit.ok) {
    elements.buildstate.textContent = 'Circuit validation failed';
    renderBuildDiagnostics({ diagnostics: circuit.diagnostics.map((item) => ({ ...item, severity: 'error', message: explainError(item.code).action, file: 'circuit', line: 1 })) }, 'Circuit validation failed.');
    showActionableError(elements.projectmessage, circuit.code ?? 'INVALID_CIRCUIT', elements.diagnostics.textContent);
    return;
  }
  detachOutstandingBuild();
  stopRuntime('Build in progress', { updateLifecycle: false });
  const started = applyLifecycle({ type: 'build.start' });
  if (!started.accepted) {
    showActionableError(elements.projectmessage, started.code, 'Build start rejected by lifecycle guard.');
    return;
  }
  const binding = started.binding;
  const inputAtSubmit = buildInputIdentity();
  currentProject().build = { status: 'dirty', inputIdentity: null, artifactIdentity: null };
  persistProject();
  elements.build.disabled = true; elements.quickbuild.disabled = true; elements.cancel.disabled = false; elements.buildstate.textContent = 'Building in isolated compiler…'; renderBuildDiagnostics(null, 'Build running…');
  publish({
    buildState: 'building', artifactIdentity: null, inputIdentity: null,
    artifactManifest: null, compileOnly: false,
    compilerRequestBlocked: false, cacheHit: false,
  });
  buildAbortController = new AbortController();
  try {
    const response = await fetch('/api/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
      body: JSON.stringify({
        schema: 'teach-lab-build-request@1',
        board: currentProject().boardProfile,
        files: currentProject().source.files,
      }),
      signal: buildAbortController.signal,
    });
    const submitted = await response.json();
    if (!response.ok) throw new Error(submitted.code || 'Build request rejected');
    if (!currentBuildBinding(binding)) return;
    activeJob = submitted; await pollJob(submitted, inputAtSubmit, binding);
  } catch (error) {
    if (!currentBuildBinding(binding)) return;
    activeJob = null; elements.build.disabled = false; elements.cancel.disabled = true;
    applyLifecycle({ type: 'build.failed', binding, diagnostics: [{ code: 'BUILD_REQUEST_FAILED', message: error.message }] });
    currentProject().build = { status: 'failed', inputIdentity: null, artifactIdentity: null };
    persistProject();
    elements.buildstate.textContent = 'Build request failed'; renderBuildDiagnostics(null, error.message); publish({ buildState: 'failed' });
    showActionableError(elements.projectmessage, 'BUILD_REQUEST_FAILED', error.message);
  } finally {
    if (!activeJob) buildAbortController = null;
  }
}

function setViewport(next) {
  const current = currentProject().layout.viewport;
  applyEditor({ type: 'viewport.set', zoom: next.zoom ?? current.zoom, panX: next.panX ?? current.panX, panY: next.panY ?? current.panY }, 'Updated view');
}

function resetCatalogWindow() { catalogWindowStart = 0; renderCatalog(); }
elements.catalogsearch.addEventListener('input', resetCatalogWindow);
elements.catalogcategory.addEventListener('change', resetCatalogWindow);
elements.cataloginterface.addEventListener('change', resetCatalogWindow);
elements.catalogstatus.addEventListener('change', resetCatalogWindow);
elements.catalogsupplyvoltage.addEventListener('change', resetCatalogWindow);
elements.catalogpinvoltage.addEventListener('change', resetCatalogWindow);
elements.catalogfavorites.addEventListener('change', resetCatalogWindow);
elements.catalogclear.addEventListener('click', () => {
  elements.catalogsearch.value = '';
  elements.catalogcategory.value = 'all';
  elements.cataloginterface.value = 'all';
  elements.catalogstatus.value = 'simulated';
  elements.catalogsupplyvoltage.value = 'all';
  elements.catalogpinvoltage.value = 'all';
  elements.catalogfavorites.checked = false;
  resetCatalogWindow();
  elements.catalogsearch.focus();
});
elements.catalogprev.addEventListener('click', () => {
  catalogWindowStart = Math.max(0, catalogWindowStart - CATALOG_WINDOW_LIMIT); renderCatalog();
});
elements.catalognext.addEventListener('click', () => {
  catalogWindowStart += CATALOG_WINDOW_LIMIT; renderCatalog();
});
elements.circuitcanvas.addEventListener('dragover', (event) => event.preventDefault());
elements.circuitcanvas.addEventListener('drop', (event) => {
  event.preventDefault(); const type = event.dataTransfer.getData('application/x-intent-component'); if (!uiComponentCatalog[type]?.selectable) return;
  const box = elements.circuitcanvas.getBoundingClientRect(); const view = currentProject().layout.viewport;
  const x = Math.max(0.07, Math.min(0.93, ((event.clientX - box.left) / box.width - 0.5 - view.panX) / view.zoom + 0.5));
  const y = Math.max(0.08, Math.min(0.92, ((event.clientY - box.top) / box.height - 0.5 - view.panY) / view.zoom + 0.5));
  addComponent(type, { x, y });
});
elements.source.addEventListener('input', () => {
  renderSourceEditor();
  const result = applyEditor({ type: 'source.set', name: selectedSourceFile, content: elements.source.value }, `${selectedSourceFile} changed`);
  if (result.ok) { elements.buildstate.textContent = 'Source changed — artifact stale'; elements.artifact.textContent = 'stale'; publish({ buildState: 'dirty', artifactIdentity: null }); }
});
elements.source.addEventListener('scroll', renderSourceEditor);
elements.source.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = elements.source.selectionStart; const end = elements.source.selectionEnd;
    elements.source.setRangeText('  ', start, end, 'end');
    elements.source.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (event.key === 'Enter') {
    const start = elements.source.selectionStart;
    const line = elements.source.value.slice(0, start).split('\n').at(-1) ?? '';
    const indent = /^\s*/u.exec(line)[0] + (/\{\s*$/u.test(line) ? '  ' : '');
    if (indent) {
      event.preventDefault(); elements.source.setRangeText(`\n${indent}`, start, elements.source.selectionEnd, 'end');
      elements.source.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
});
elements.sourcefile.addEventListener('change', () => { selectedSourceFile = elements.sourcefile.value; renderProject(); });
elements.sourcefileadd.addEventListener('click', () => {
  const name = elements.sourcefilename.value.trim();
  const result = applyEditor({ type: 'source.add', file: { name, content: '' } }, `Added ${name || 'source file'}`);
  if (result.ok) { selectedSourceFile = name; elements.sourcefilename.value = ''; renderProject(); }
});
elements.sourcefileremove.addEventListener('click', () => {
  if (selectedSourceFile === 'main.ino') return;
  const name = selectedSourceFile; selectedSourceFile = 'main.ino';
  applyEditor({ type: 'source.remove', name }, `Removed ${name}`);
});
elements.build.addEventListener('click', () => { void build(); });
elements.cancel.addEventListener('click', () => {
  const binding = lifecycle.activeBuild;
  if (!binding) return;
  applyLifecycle({ type: 'build.failed', binding, diagnostics: [{ code: 'BUILD_CANCELLED' }] });
  detachOutstandingBuild();
  currentProject().build = { status: 'failed', inputIdentity: null, artifactIdentity: null };
  persistProject();
  elements.buildstate.textContent = 'Build cancelled';
  elements.diagnostics.textContent = 'The cancelled build cannot update this project.';
  publish({ buildState: 'cancelled', artifactIdentity: null, inputIdentity: null, cacheHit: false });
});
elements.run.addEventListener('click', () => {
  const result = applyLifecycle({ type: 'runtime.run' });
  if (result.accepted) worker?.postMessage({ command: 'run' });
});
elements.pause.addEventListener('click', () => {
  const result = applyLifecycle({ type: 'runtime.pause' });
  if (result.accepted) worker?.postMessage({ command: 'pause' });
});
elements.step.addEventListener('click', () => worker?.postMessage({ command: 'step' }));
elements.reset.addEventListener('click', () => worker?.postMessage({ command: 'reset' }));
elements.speed.addEventListener('change', () => {
  const speed = elements.speed.value === 'maximum' ? 'maximum' : Number(elements.speed.value);
  elements.requestedspeed.textContent = speed === 'maximum' ? 'Maximum' : `${speed}×`;
  worker?.postMessage({ command: 'speed', speed });
});
function setSerialDock(open, { returnFocus = false } = {}) {
  elements.serialdock.hidden = !open;
  elements.serialtab.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('serial-dock-open', open);
  publish({ serialDockOpen: open });
  if (open && serialAutoscroll) requestAnimationFrame(resumeSerialAutoscrollFromControl);
  if (!open && returnFocus) elements.serialtab.focus();
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
}

function setCanvasInteractionMode(mode) {
  if (!['select', 'interact'].includes(mode)) return;
  if (mode === 'select') releaseCanvasButton('mode change');
  canvasInteractionMode = mode;
  elements.circuitcanvas.dataset.mode = mode;
  elements.canvasselectmode.setAttribute('aria-pressed', String(mode === 'select'));
  elements.canvasinteractmode.setAttribute('aria-pressed', String(mode === 'interact'));
  elements.wirestate.textContent = mode === 'interact'
    ? 'Interact mode: hold the tactile button with pointer, Space, or Enter while reading Serial.'
    : 'Select mode: move parts, choose pins, and edit wire sections.';
  publish({ canvasInteractionMode: mode });
  renderComponents();
}

elements.serialtab.addEventListener('click', () => setSerialDock(elements.serialtab.getAttribute('aria-expanded') !== 'true'));
elements.serialclose.addEventListener('click', () => setSerialDock(false, { returnFocus: true }));
elements.serialresume.addEventListener('pointerdown', resumeSerialAutoscrollFromControl);
elements.serialresume.addEventListener('click', resumeSerialAutoscrollFromControl);
function pauseSerialAutoscroll() {
  if (performance.now() < serialResumeGuardUntil) return;
  if (!serialAutoscroll) return;
  if (serialScrollFrame !== null) cancelAnimationFrame(serialScrollFrame);
  serialScrollFrame = null;
  serialAutoscroll = false;
  publish({ serialAutoscroll, serialUnreadRecords });
}
elements.serialoutput.addEventListener('wheel', pauseSerialAutoscroll, { passive: true });
elements.serialoutput.addEventListener('touchmove', pauseSerialAutoscroll, { passive: true });
elements.serialoutput.addEventListener('pointermove', (event) => { if (event.buttons) pauseSerialAutoscroll(); });
elements.serialoutput.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) pauseSerialAutoscroll();
});
elements.serialoutput.addEventListener('scroll', () => {
  const atEnd = elements.serialoutput.scrollHeight - elements.serialoutput.scrollTop - elements.serialoutput.clientHeight <= 6;
  if (atEnd) resumeSerialAutoscroll();
  else if (!serialAutoscroll) publish({ serialAutoscroll, serialUnreadRecords });
  else scheduleSerialScrollToEnd();
});
let serialResize = null;
function setSerialDockWidth(width) {
  const maximum = Math.min(620, window.innerWidth * 0.48);
  const snapped = Math.round(clamp(width, 300, maximum) / 20) * 20;
  document.documentElement.dataset.serialWidth = String(clamp(snapped, 300, 620));
}
elements.serialresizer.addEventListener('pointerdown', (event) => {
  serialResize = { pointerId: event.pointerId, x: event.clientX, width: elements.serialdock.getBoundingClientRect().width };
  elements.serialresizer.setPointerCapture(event.pointerId);
});
elements.serialresizer.addEventListener('pointermove', (event) => {
  if (!serialResize || serialResize.pointerId !== event.pointerId) return;
  const width = clamp(serialResize.width + serialResize.x - event.clientX, 300, Math.min(620, window.innerWidth * 0.48));
  setSerialDockWidth(width);
  requestAnimationFrame(drawCircuitWires);
});
const finishSerialResize = () => { serialResize = null; requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires)); };
elements.serialresizer.addEventListener('pointerup', finishSerialResize);
elements.serialresizer.addEventListener('pointercancel', finishSerialResize);
elements.serialresizer.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const current = elements.serialdock.getBoundingClientRect().width;
  setSerialDockWidth(current + (event.key === 'ArrowLeft' ? 20 : -20));
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
});
elements.canvasselectmode.addEventListener('click', () => setCanvasInteractionMode('select'));
elements.canvasinteractmode.addEventListener('click', () => setCanvasInteractionMode('interact'));
elements.serialsend.addEventListener('click', () => { for (const value of serialInputBytes(elements.serialinput.value, elements.serialnewline.value)) worker?.postMessage({ command: 'uart-rx', value }); elements.serialinput.value = ''; });
elements.serialinput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); elements.serialsend.click(); } });
elements.serialclear.addEventListener('click', () => worker?.postMessage({ command: 'serial-clear' }));
elements.serialtextmode.addEventListener('click', () => {
  serialViewMode = 'text'; elements.serialtextmode.setAttribute('aria-pressed', 'true'); elements.serialeventmode.setAttribute('aria-pressed', 'false');
  if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime);
});
elements.serialeventmode.addEventListener('click', () => {
  serialViewMode = 'events'; elements.serialtextmode.setAttribute('aria-pressed', 'false'); elements.serialeventmode.setAttribute('aria-pressed', 'true');
  if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime);
});
elements.serialexport.addEventListener('click', () => {
  const records = window.__M6_STATE__.runtime?.instruments?.serial?.records ?? [];
  downloadText('intent-mcu-serial.txt', serialText(records));
});
elements.logicchannels.addEventListener('change', () => {
  const selected = [...elements.logicchannels.selectedOptions].map((option) => option.value);
  if (selected.length > 8) { elements.logicchannels.querySelector(`option[value="${selected.at(-1)}"]`).selected = false; return; }
  currentProject().instruments.logicChannels = selected; persistProject(); worker?.postMessage({ command: 'logic-channels', channels: selected });
});
elements.logicwindow.addEventListener('change', () => { if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime); });
elements.logiccursora.addEventListener('input', () => { if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime); });
elements.logiccursorb.addEventListener('input', () => { if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime); });
elements.pinselect.addEventListener('change', () => { currentProject().instruments.selectedPin = elements.pinselect.value; persistProject(); if (window.__M6_STATE__.runtime) renderRuntime(window.__M6_STATE__.runtime); });

elements.rotatecomponent.addEventListener('click', () => {
  if (!selectedComponentId) return;
  const rotation = (currentProject().layout.positions[selectedComponentId].rotation + 90) % 360;
  applyEditor({ type: 'component.rotate', componentId: selectedComponentId, rotation }, `Rotated ${selectedComponentId}`);
});
elements.duplicatecomponent.addEventListener('click', () => {
  const source = currentProject().circuit.components.find((component) => component.id === selectedComponentId); if (!source) return;
  const newId = newComponent(source.type, currentProject().circuit).id;
  const result = applyEditor({ type: 'component.duplicate', sourceId: source.id, newId }, `Duplicated ${source.id}`);
  if (result.ok) { selectComponent(newId); renderProject(); }
});
elements.deletecomponent.addEventListener('click', () => {
  if (!selectedComponentId) return;
  const id = selectedComponentId;
  setSelection({ kind: 'none' });
  applyEditor({ type: 'component.remove', componentId: id }, `Deleted ${id}`);
});
elements.selectednet.addEventListener('change', () => {
  selectNet(elements.selectednet.value || null);
  renderInspector(); drawCircuitWires();
});
elements.wirecolor.addEventListener('change', () => {
  if (selectedNetId) applyEditor({ type: 'wire.style.set', netId: selectedNetId, color: elements.wirecolor.value }, `Styled ${selectedNetId}`);
});
elements.reconnectmode.setAttribute('aria-pressed', 'false');
elements.reconnectmode.addEventListener('click', () => {
  if (!selectedRouteSegment) return;
  wireMode = 'reconnect';
  pendingEndpoint = parseEndpoint(selectedRouteSegment.endpoint);
  elements.reconnectmode.setAttribute('aria-pressed', 'true');
  elements.wirestate.textContent = `Reconnect ${selectedRouteSegment.endpoint}: choose one free named pin. Other branches remain attached.`;
  renderComponents();
});
elements.addbend.addEventListener('click', () => {
  if (!selectedNetId || !selectedRouteSegment) return;
  const net = currentProject().circuit.nets.find((item) => item.id === selectedNetId);
  const canvasBox = elements.circuitcanvas.getBoundingClientRect();
  const anchors = netAnchors(net, canvasBox);
  const family = materializeRouteFamily(net, currentProject().layout.wireRoutes[net.id], anchors, routeObstacles(canvasBox));
  try {
    const jogged = addRouteJog(
      family, anchors, selectedRouteSegment.endpoint, selectedRouteSegment.segmentIndex, net,
    );
    applyEditor({ type: 'wire.route.family.set', netId: net.id, family: jogged }, `Added orthogonal jog to ${net.id}`);
    elements.wirestate.textContent = 'Added one orthogonal jog. Connectivity and the fixed junction hub are unchanged; Undo removes the whole jog.';
  } catch (error) {
    showActionableError(elements.projectmessage, 'EDITOR_ROUTE', error.message);
  }
});
elements.deletebranch.addEventListener('click', () => {
  if (!selectedNetId || !selectedRouteSegment) return;
  const endpoint = parseEndpoint(selectedRouteSegment.endpoint);
  const id = selectedNetId;
  const endpointLabel = selectedRouteSegment.endpoint;
  const net = currentProject().circuit.nets.find((item) => item.id === id);
  const command = net?.endpoints.length === 2
    ? { type: 'wire.delete', netId: id }
    : { type: 'wire.branch.delete', netId: id, endpoint };
  setSelection({ kind: 'none' });
  const result = applyEditor(command, net?.endpoints.length === 2
    ? `Deleted connection ${id}` : `Deleted branch ${endpointLabel}`);
  if (result.ok) {
    elements.wirestate.textContent = net?.endpoints.length === 2
      ? `Deleted the selected two-pin connection ${id}. Both components and unrelated nets were preserved.`
      : `Deleted branch ${endpointLabel} from ${id}. The remaining net and endpoints were preserved.`;
    renderProject();
  }
});
elements.deletewire.addEventListener('click', () => {
  if (selectedNetId) {
    const id = selectedNetId; setSelection({ kind: 'none' });
    applyEditor({ type: 'wire.delete', netId: id }, `Deleted whole net ${id}`);
  }
});
elements.removejunction.addEventListener('click', () => {
  const net = currentProject().circuit.nets.find((item) => item.id === selectedNetId);
  const junction = currentProject().circuit.junctions.find((item) => item.net === selectedNetId);
  if (!net || !junction) return;
  const detachEndpoint = net.endpoints.length > 2 ? net.endpoints.at(-1) : null;
  applyEditor({ type: 'junction.remove', junctionId: junction.id, detachEndpoint }, `Removed ${junction.id}`);
});

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function workspacePreference(name, value = null) {
  const key = `intent-mcu.workbench.${name}.v1`;
  if (value === null) { try { return localStorage.getItem(key) === 'true'; } catch { return false; } }
  try { localStorage.setItem(key, String(Boolean(value))); } catch { /* preference is non-critical */ }
  return Boolean(value);
}
function toggleWorkspacePanel(kind) {
  const className = `${kind}-collapsed`; const button = kind === 'catalog' ? elements.togglecatalog : elements.toggleinspector;
  const collapsed = document.querySelector('.workspace').classList.toggle(className);
  button.setAttribute('aria-pressed', String(collapsed)); workspacePreference(className, collapsed);
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
}
function installPanelResizer(handle, cssVariable, direction) {
  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    drag = { pointerId: event.pointerId, startX: event.clientX, width: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVariable)) };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = clamp(drag.width + (event.clientX - drag.startX) * direction, 210, 430);
    document.documentElement.style.setProperty(cssVariable, `${width}px`);
    requestAnimationFrame(drawCircuitWires);
  });
  const finish = () => { drag = null; requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires)); };
  handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const current = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVariable));
    document.documentElement.style.setProperty(cssVariable, `${clamp(current + (event.key === 'ArrowRight' ? 16 : -16) * direction, 210, 430)}px`);
    requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
  });
}

elements.togglecatalog.addEventListener('click', () => toggleWorkspacePanel('catalog'));
elements.toggleinspector.addEventListener('click', () => toggleWorkspacePanel('inspector'));
installPanelResizer(elements.catalogresizer, '--catalog-width', 1);
installPanelResizer(elements.inspectorresizer, '--inspector-width', -1);
elements.showpinlabels.addEventListener('click', () => {
  const shown = elements.circuitcanvas.classList.toggle('show-pin-labels');
  elements.showpinlabels.setAttribute('aria-pressed', String(shown)); workspacePreference('pin-labels', shown);
});
elements.focuscanvas.addEventListener('click', () => {
  const focused = document.querySelector('.workspace').classList.toggle('canvas-focus');
  elements.focuscanvas.setAttribute('aria-pressed', String(focused));
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
});
elements.fullscreencanvas.addEventListener('click', async () => {
  const board = document.querySelector('.board-card');
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await board.requestFullscreen(); }
  catch { document.querySelector('.workspace').classList.add('canvas-focus'); elements.focuscanvas.setAttribute('aria-pressed', 'true'); }
  requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
});

elements.circuitcanvas.addEventListener('wheel', (event) => {
  if (event.target.closest('.circuit-component,.wire-segment-hit')) return;
  event.preventDefault();
  const box = elements.circuitcanvas.getBoundingClientRect(); const view = currentProject().layout.viewport;
  const screenX = (event.clientX - box.left) / box.width; const screenY = (event.clientY - box.top) / box.height;
  const world = worldPoint(screenX, screenY);
  const zoom = clamp(view.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), 0.5, 3);
  setViewport({ zoom, panX: clamp(screenX - 0.5 - (world.x - 0.5) * zoom, -1, 1), panY: clamp(screenY - 0.5 - (world.y - 0.5) * zoom, -1, 1) });
}, { passive: false });
elements.circuitcanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest?.('.pin-anchor,.component-control-hit')) return;
  const candidates = wireTargetsAtPoint(event.clientX, event.clientY);
  const target = cycledWireTarget(candidates, event.clientX, event.clientY);
  if (!target?.routeInteraction) return;
  target.nextElementSibling?.classList.add('hovered');
  suppressCanvasClickUntil = performance.now() + 500;
  startRouteDrag(event, { ...target.routeInteraction, target });
}, true);
elements.circuitcanvas.addEventListener('click', (event) => {
  if (performance.now() >= suppressCanvasClickUntil) return;
  event.preventDefault(); event.stopImmediatePropagation();
}, true);
elements.circuitcanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('.circuit-component,.wire-segment-hit')) return;
  canvasPan = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, viewport: structuredClone(currentProject().layout.viewport) };
  elements.circuitcanvas.setPointerCapture(event.pointerId); elements.circuitcanvas.classList.add('panning');
});
elements.circuitcanvas.addEventListener('pointermove', (event) => {
  if (!canvasPan || canvasPan.pointerId !== event.pointerId) return;
  elements.canvastransform.style.transform = `translate(${event.clientX - canvasPan.startX}px, ${event.clientY - canvasPan.startY}px)`;
});
function finishCanvasPan(event, cancelled = false) {
  if (!canvasPan || canvasPan.pointerId !== event.pointerId) return;
  const drag = canvasPan; canvasPan = null; elements.canvastransform.style.transform = ''; elements.circuitcanvas.classList.remove('panning');
  if (cancelled) return;
  const box = elements.circuitcanvas.getBoundingClientRect();
  setViewport({ panX: clamp(drag.viewport.panX + (event.clientX - drag.startX) / box.width, -1, 1), panY: clamp(drag.viewport.panY + (event.clientY - drag.startY) / box.height, -1, 1) });
}
elements.circuitcanvas.addEventListener('pointerup', (event) => finishCanvasPan(event));
elements.circuitcanvas.addEventListener('pointercancel', (event) => finishCanvasPan(event, true));

elements.zoomin.addEventListener('click', () => setViewport({ zoom: Math.min(3, currentProject().layout.viewport.zoom + 0.25) }));
elements.zoomout.addEventListener('click', () => setViewport({ zoom: Math.max(0.5, currentProject().layout.viewport.zoom - 0.25) }));
elements.panleft.addEventListener('click', () => setViewport({ panX: Math.max(-1, currentProject().layout.viewport.panX - 0.05) }));
elements.panright.addEventListener('click', () => setViewport({ panX: Math.min(1, currentProject().layout.viewport.panX + 0.05) }));
elements.panup.addEventListener('click', () => setViewport({ panY: Math.max(-1, currentProject().layout.viewport.panY - 0.05) }));
elements.pandown.addEventListener('click', () => setViewport({ panY: Math.min(1, currentProject().layout.viewport.panY + 0.05) }));
elements.viewreset.addEventListener('click', () => setViewport({ zoom: 1, panX: 0, panY: 0 }));
elements.fitproject.addEventListener('click', () => {
  const positions = Object.values(currentProject().layout.positions);
  if (!positions.length) { setViewport({ zoom: 1, panX: 0, panY: 0 }); return; }
  const xs = positions.map((position) => position.x); const ys = positions.map((position) => position.y);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const span = Math.max(0.32, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const zoom = Math.max(0.5, Math.min(2, 0.72 / span));
  setViewport({ zoom, panX: Math.max(-1, Math.min(1, -(center.x - 0.5) * zoom)), panY: Math.max(-1, Math.min(1, -(center.y - 0.5) * zoom)) });
});
elements.undo.addEventListener('click', () => applyEditor({ type: 'undo' }, 'Undo'));
elements.redo.addEventListener('click', () => applyEditor({ type: 'redo' }, 'Redo'));

elements.projectnew.addEventListener('click', () => {
  editor = new ProjectEditorReducer(createEmptyProject());
  installProjectGeneration({ empty: true, reason: 'project.new', runtimeMessage: 'New empty project — build required' });
  selectedSourceFile = 'main.ino';
  projectFileHandle = null; fileSavedRevision = null; fileSavedProjectGeneration = null; fileSaveState = null;
  localStorage.removeItem(PROJECT_STORAGE_KEY); localStorage.removeItem(PROJECT_RECOVERY_KEY); renderCatalog(); renderProject(); elements.projectmessage.textContent = 'Created an actually empty project.';
});
function loadExampleProject(exampleId, reason = 'project.demo') {
  if (exampleId === TEMPERATURE_LCD_THRESHOLD_EXAMPLE_ID) {
    const before = currentProjectText();
    let example;
    try { example = createTemperatureLcdThresholdExample(); }
    catch (error) {
      showActionableError(elements.projectmessage, error?.message ?? 'EXAMPLE_INVALID', 'Temperature display example could not be constructed.');
      return { ok: false, code: error?.message ?? 'EXAMPLE_INVALID' };
    }
    const parsed = openTemperatureLcdThresholdExample(example.text);
    if (!parsed.ok) {
      showActionableError(elements.projectmessage, parsed.code, 'Temperature display example was rejected atomically; project unchanged.');
      if (currentProjectText() !== before) throw new Error('Atomic starter example boundary violated');
      return parsed;
    }
    editor = parsed.session;
    installProjectGeneration({
      empty: false, reason, runtimeMessage: `${example.name} loaded — build required`,
    });
    selectedSourceFile = 'main.ino';
    elements.exampleselect.value = exampleId;
    persistProject();
    publish({ lastAction: 'TEMPERATURE_LCD_THRESHOLD_EXAMPLE_LOADED', importReport: parsed.report ?? parsed.code });
    renderCatalog(); renderProject();
    elements.projectmessage.textContent = `${example.name} loaded through candidate electrical and project validation. The ideal sensor model resolves in 0.1953125 °C ADC steps; displayed whole Celsius uses the compiled integer calculation.`;
    return { ok: true, code: parsed.code, example };
  }
  const example = createExampleProject(exampleId);
  const projectLabel = exampleId === 'blink' ? 'Blink demo' : example.name;
  example.project.metadata.name = projectLabel;
  // A candidate-v3 example owns a different editor session type. Validate the
  // ordinary v2 replacement in a fresh reducer before swapping sessions so a
  // starter remains atomic and works after any previously opened example.
  const replacement = new ProjectEditorReducer(createEmptyProject());
  const result = replacement.importProject(example.project, 'replace', { running, requireRunnable: true });
  if (!result.ok) { showActionableError(elements.projectmessage, result.code, `${example.name} example could not be loaded.`); return; }
  editor = replacement;
  installProjectGeneration({ empty: false, reason, runtimeMessage: `${projectLabel} loaded — build required` });
  selectedSourceFile = 'main.ino';
  elements.exampleselect.value = exampleId;
  persistProject(); publish({ lastAction: `${exampleId.toUpperCase()}_EXAMPLE_LOADED`, importReport: null }); renderProject();
  elements.projectmessage.textContent = `${example.name} loaded through the same safety checks as every project. Edit it, build it, then inspect the live instruments.`;
  return { ok: true, code: result.code, example };
}

function renderStarterExamples() {
  const cards = [...exampleCatalog(), TEMPERATURE_LCD_THRESHOLD_CARD].map((example) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'starter-card'; button.dataset.example = example.id;
    button.setAttribute('aria-label', `Open ${example.name}: ${example.focus}`);
    const focus = document.createElement('span'); focus.className = 'starter-focus'; focus.textContent = example.focus;
    const name = document.createElement('strong'); name.textContent = example.name;
    const description = document.createElement('span'); description.className = 'starter-description'; description.textContent = example.description;
    const parts = document.createElement('span'); parts.className = 'starter-parts'; parts.textContent = example.partsLabel;
    const outcome = document.createElement('span'); outcome.className = 'starter-outcome'; outcome.textContent = example.outcome;
    const action = document.createElement('span'); action.className = 'starter-action'; action.textContent = 'Open working circuit →';
    button.append(focus, name, description, parts, outcome, action);
    button.addEventListener('click', () => loadExampleProject(example.id, 'project.starter'));
    return button;
  });
  elements.starterexamples.replaceChildren(...cards);
}

elements.projectdemo.addEventListener('click', () => loadExampleProject(elements.exampleselect.value));
elements.boardselect.addEventListener('change', () => {
  const selected = candidateCompilerTarget(elements.boardselect.value);
  selectedCompilerProfile = selected ? selected.profile : AVR_PROFILE;
  const target = currentCompilerTarget();
  const view = publicControllerView(target.profile) ?? publicControllerView(AVR_PROFILE);
  if (selectedCompilerProfile === RP2040_PROFILE) picoPublicWorkbench.activate();
  else picoPublicWorkbench.deactivate();
  if (selectedCompilerProfile === ESP32C3_PROFILE) c3PublicWorkbench.activate();
  else void c3PublicWorkbench.deactivate();
  if (selectedCompilerProfile === STM32F429ZI_PROFILE) stm32PublicWorkbench.activate();
  else stm32PublicWorkbench.deactivate();
  detachOutstandingBuild();
  stopRuntime(
    view.publicExecution
      ? selectedCompilerProfile === ESP32C3_PROFILE
        ? 'Supported C3 subset selected · build the bounded sketch to run actual QEMU CPU/UART'
        : selectedCompilerProfile === STM32F429ZI_PROFILE
        ? 'Supported STM32 subset selected · build bounded source to run actual Renode PB0/USART3'
        : selectedCompilerProfile === RP2040_PROFILE
        ? 'Supported Pico subset selected · build the bounded source to run'
        : 'Supported AVR workbench selected · rebuild to run'
      : `${view.label} public preview · compiler/runtime requests blocked`,
    { updateLifecycle: false },
  );
  applyLifecycle({
    type: 'project.edit', relevance: 'build',
    empty: currentProject().circuit.components.length === 0,
  });
  currentProject().build = { status: 'dirty', inputIdentity: null, artifactIdentity: null };
  elements.buildstate.textContent = 'Build required';
  renderBuildDiagnostics(null, view.publicExecution
    ? selectedCompilerProfile === ESP32C3_PROFILE
      ? 'The AVR project is parked. Use the C3 source panel for the bounded compiler and actual QEMU CPU/UART path.'
      : selectedCompilerProfile === STM32F429ZI_PROFILE
      ? 'The AVR project is parked. Use the STM32 source panel for the bounded compiler and actual Renode PB0/USART3 path.'
      : selectedCompilerProfile === RP2040_PROFILE
      ? 'The AVR project is parked. Use the Pico source panel to build a source-bound UF2.'
      : 'No AVR build submitted for the current project.'
    : `${view.label} is a public status preview. No build request was made.`);
  renderCompilerTarget();
  renderProject();
  elements.projectmessage.textContent = view.publicExecution
    ? selectedCompilerProfile === ESP32C3_PROFILE
      ? 'ESP32-C3 bounded public source selected. The AVR project remains parked; QEMU pin state is not claimed.'
      : selectedCompilerProfile === STM32F429ZI_PROFILE
      ? 'STM32F429ZI bounded public source selected. The AVR project remains parked; actual Renode evidence and the ideal teaching circuit are labelled separately.'
      : selectedCompilerProfile === RP2040_PROFILE
      ? 'RP2040 Pico bounded public source selected. The AVR project remains parked and unchanged.'
      : 'ATmega328P public build and tested virtual runtime selected. Rebuild before Run.'
    : `${view.label} preview selected. The AVR project is parked without remapping its circuit; public Build, Run, project upload, and private endpoints remain disabled.`;
  publish({
    buildState: 'dirty', artifactIdentity: null, inputIdentity: null,
    artifactManifest: null, runtime: null, compilerRequestBlocked: !view.publicExecution,
  });
  if (selectedCompilerProfile === RP2040_PROFILE) picoPublicWorkbench.render();
  if (selectedCompilerProfile === ESP32C3_PROFILE) c3PublicWorkbench.render();
  if (selectedCompilerProfile === STM32F429ZI_PROFILE) stm32PublicWorkbench.render();
});
elements.controllerprimaryaction.addEventListener('click', () => {
  if (selectedCompilerProfile === AVR_PROFILE) elements.build.click();
  else if (selectedCompilerProfile === ESP32C3_PROFILE) void c3PublicWorkbench.build();
  else if (selectedCompilerProfile === RP2040_PROFILE) void picoPublicWorkbench.build();
  else if (selectedCompilerProfile === STM32F429ZI_PROFILE) void stm32PublicWorkbench.build();
});
elements.controllerreturnavr.addEventListener('click', () => {
  elements.boardselect.value = AVR_PROFILE;
  elements.boardselect.dispatchEvent(new Event('change', { bubbles: true }));
  elements.boardselect.focus();
});
elements.projectsave.addEventListener('click', saveProjectFile);
elements.projectopen.addEventListener('click', openProjectFile);
elements.projectopeninput.addEventListener('change', async () => {
  const file = elements.projectopeninput.files[0];
  elements.projectopeninput.value = '';
  await replaceProjectFromFile(file);
});
elements.projectname.addEventListener('change', () => {
  const result = applyEditor({ type: 'project.rename', name: elements.projectname.value }, 'Project renamed');
  if (!result.ok) elements.projectname.value = currentProject().metadata.name;
});
elements.recoveryexport.addEventListener('click', () => downloadText('intent-mcu-recovery.json', currentProjectText(), 'application/json'));
elements.projectreload.addEventListener('click', () => {
  const recovery = localStorage.getItem(PROJECT_RECOVERY_KEY);
  const stored = recovery ?? localStorage.getItem(PROJECT_STORAGE_KEY); const parsed = stored ? parseEditorSource(stored) : { ok: false, code: 'NO_LOCAL_SAVE' };
  if (!parsed.ok) { showActionableError(elements.projectmessage, parsed.code, 'Reload validation failed.'); return; }
  editor = parsed.session;
  installProjectGeneration({
    empty: editor.project.circuit.components.length === 0, reason: 'project.reload',
    runtimeMessage: 'Reloaded project requires build',
  });
  selectedSourceFile = 'main.ino';
  savedRevision = editor.revision; savedProjectGeneration = lifecycle.projectGeneration;
  renderCatalog(); renderProject(); elements.projectmessage.textContent = 'Restored and revalidated browser recovery. Previous runtime output was cleared; save a project file for durable storage.';
});
elements.projectexport.addEventListener('click', async () => {
  const text = currentProjectText(); const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((value) => value.toString(16).padStart(2, '0')).join('');
  downloadText('intent-mcu-project.json', text, 'application/json');
  elements.projectmessage.textContent = `Exported canonical project · SHA-256 ${digest.slice(0, 16)}…`;
});

elements.walkthroughopen.addEventListener('click', () => elements.walkthrough.showModal());
elements.quickbuild.addEventListener('click', () => {
  if (selectedCompilerProfile === ESP32C3_PROFILE) void c3PublicWorkbench.build();
  else if (selectedCompilerProfile === RP2040_PROFILE) void picoPublicWorkbench.build();
  else if (selectedCompilerProfile === STM32F429ZI_PROFILE) void stm32PublicWorkbench.build();
  else elements.build.click();
});
elements.quickrun.addEventListener('click', () => {
  if (selectedCompilerProfile === ESP32C3_PROFILE) void c3PublicWorkbench.run();
  else if (selectedCompilerProfile === RP2040_PROFILE) void picoPublicWorkbench.run();
  else if (selectedCompilerProfile === STM32F429ZI_PROFILE) void stm32PublicWorkbench.run(false);
  else elements.run.click();
});
elements.quickpause.addEventListener('click', () => {
  if (selectedCompilerProfile === RP2040_PROFILE) picoPublicWorkbench.pause();
  else elements.pause.click();
});
elements.quickreset.addEventListener('click', () => {
  if (selectedCompilerProfile === RP2040_PROFILE) picoPublicWorkbench.reset();
  else if (selectedCompilerProfile === STM32F429ZI_PROFILE) void stm32PublicWorkbench.run(true);
  else elements.reset.click();
});
elements.projectimport.addEventListener('change', async () => {
  const file = elements.projectimport.files[0]; if (!file) return;
  if (file.size > 1024 * 1024) { showActionableError(elements.projectmessage, 'INPUT_LIMIT', `${file.size} bytes`); return; }
  const before = currentProjectText();
  const mode = elements.projectimportmode.value;
  const source = await file.text();
  const migrated = mode === 'migrate-v1' ? migrateProjectV1(source, localStorage) : null;
  const result = mode === 'migrate-v1'
    ? (migrated.ok ? editor.importProject(migrated.project, 'replace', { running }) : migrated)
    : editor.importText(source, mode, { running });
  elements.projectimport.value = '';
  if (!result.ok) { showActionableError(elements.projectmessage, result.code, 'Import rejected atomically; project unchanged.'); if (currentProjectText() !== before) throw new Error('Atomic import boundary violated'); return; }
  if (mode === 'merge') {
    detachOutstandingBuild(); stopRuntime('Merged project requires build', { updateLifecycle: false });
    applyLifecycle({ type: 'project.edit', relevance: 'build', empty: currentProject().circuit.components.length === 0 });
  } else {
    installProjectGeneration({
      empty: currentProject().circuit.components.length === 0, reason: 'project.import',
      runtimeMessage: 'Imported project requires build',
    });
  }
  selectedSourceFile = 'main.ino'; persistProject(); publish({ importReport: migrated?.report ?? result.report ?? result.code }); renderProject();
  elements.projectmessage.textContent = mode === 'merge'
    ? 'Circuit merged safely. Source files and unrelated project settings were preserved.'
    : mode === 'migrate-v1'
      ? 'Older project migrated and opened safely. Review it, then build before Run.'
      : 'Project replaced safely. Previous runtime output was cleared; build before Run.';
});

elements.promptgenerate.addEventListener('click', () => {
  try {
    elements.promptoutput.value = generatePromptBridgeV2(currentRuntimeProject());
    elements.promptcopy.disabled = false;
    elements.promptmessage.textContent = 'Portable prompt generated locally. No network request was made.';
  } catch (error) {
    elements.promptoutput.value = '';
    elements.promptcopy.disabled = true;
    showActionableError(elements.promptmessage, error?.message ?? 'PROMPT_GENERATION_FAILED',
      'The current project could not be projected into the portable Prompt Bridge contract.');
  }
});
elements.promptcopy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(elements.promptoutput.value); elements.promptmessage.textContent = 'Prompt copied.'; } catch { elements.promptoutput.select(); elements.promptmessage.textContent = 'Prompt selected; copy it with your browser shortcut.'; } });
elements.promptapply.addEventListener('click', () => {
  if (editor.kind === 'candidate-project-v3') {
    showActionableError(elements.promptmessage, 'CANDIDATE_PROMPT_APPLY_UNSUPPORTED',
      'Portable prompt generation uses the validated runnable projection, but applying a circuit-only proposal cannot safely replace candidate-specific contacts. Open an ordinary AVR project to apply a proposal.');
    return;
  }
  const parsed = parsePromptBridgeV2(elements.promptresponse.value);
  if (!parsed.ok) { showActionableError(elements.promptmessage, parsed.code, 'The pasted proposal was rejected before it could change the project.'); return; }
  const candidate = projectFromCircuit(parsed.graph, currentProject().source.files[0].content);
  const beforeSource = currentProject().source.files[0].content;
  const result = editor.importProject(candidate, elements.promptmode.value, { circuitOnly: true, running, requireRunnable: true });
  if (!result.ok || currentProject().source.files[0].content !== beforeSource) {
    showActionableError(elements.promptmessage, result.code ?? 'PROMPT_SOURCE_BOUNDARY', 'The proposal was rejected before it could change source or circuit state.');
    return;
  }
  if (elements.promptmode.value === 'replace') {
    installProjectGeneration({
      empty: currentProject().circuit.components.length === 0, reason: 'prompt.replace',
      runtimeMessage: 'Accepted proposal requires build',
    });
  } else {
    detachOutstandingBuild(); stopRuntime('Accepted proposal requires build', { updateLifecycle: false });
    applyLifecycle({ type: 'project.edit', relevance: 'build', empty: currentProject().circuit.components.length === 0 });
  }
  persistProject(); publish({ importReport: result.report ?? result.code }); renderProject();
  elements.promptmessage.textContent = `Proposal ${elements.promptmode.value === 'merge' ? 'merged with' : 'replaced'} the circuit after passing the same safety checks as manual wiring.`;
});

document.addEventListener('pointerup', finishComponentDrag);
document.addEventListener('mousemove', (event) => { if (componentDrag) moveComponentDrag(event); });
document.addEventListener('mouseup', () => {
  if (componentDrag) finishComponentDrag({ pointerId: componentDrag.pointerId });
});
function cancelCanvasPan() {
  if (!canvasPan) return false;
  canvasPan = null; elements.canvastransform.style.transform = ''; elements.circuitcanvas.classList.remove('panning');
  elements.wirestate.textContent = 'Canvas pan cancelled; the original view is unchanged.';
  return true;
}

function cancelPendingWiring() {
  if (!pendingEndpoint && wireMode === 'connect') return false;
  pendingEndpoint = null; wireMode = 'connect'; elements.reconnectmode.setAttribute('aria-pressed', 'false');
  elements.wirestate.textContent = 'Wire preview or reconnect cancelled; topology is unchanged.';
  renderComponents();
  return true;
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape'
      && (cancelComponentDrag() || cancelRouteDrag() || releaseCanvasButton('Escape') || cancelCanvasPan() || cancelPendingWiring())) {
    event.preventDefault(); return;
  }
  if (isTextEditingTarget(event.target)) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); (event.shiftKey ? elements.redo : elements.undo).click(); return; }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selection.kind === 'component') { event.preventDefault(); elements.deletecomponent.click(); }
    else if (selection.kind === 'wire-segment') { event.preventDefault(); elements.deletebranch.click(); }
    else if (selection.kind === 'net') elements.wirestate.textContent = 'Whole-net deletion uses the separately labelled Delete whole net action.';
    return;
  }
  if (!selectedComponentId) return;
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); elements.rotatecomponent.click(); return; }
  const delta = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[event.key];
  if (delta) {
    event.preventDefault(); const position = currentProject().layout.positions[selectedComponentId];
    applyEditor({ type: 'component.move', componentId: selectedComponentId, x: Math.max(0.07, Math.min(0.93, position.x + delta[0])), y: Math.max(0.08, Math.min(0.92, position.y + delta[1])) }, `Moved ${selectedComponentId}`);
  }
});
window.addEventListener('resize', () => requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires)));

setInterval(() => {
  if (running && performance.now() - lastWorkerMessage > 2_000) {
    const binding = lifecycle.runtimeBinding;
    running = false; worker?.terminate(); worker = null; setRuntimeEnabled(false);
    const state = { kind: 'stopped-error', message: 'Worker watchdog expired' };
    if (binding) applyLifecycle({ type: 'runtime.message', binding, message: state });
    publish({ runtime: state }); elements.workerstate.textContent = 'Stopped — rebuild the current project';
    showActionableError(elements.projectmessage, 'WORKER_WATCHDOG', 'No worker message arrived within 2000 ms.');
  }
}, 250);

window.__M3_BUILD__ = build;
window.__M3_COMMAND__ = (command, value) => worker?.postMessage(command === 'speed' ? { command, speed: value } : { command });
window.__M4_CONTROL__ = (componentId, key, value) => worker?.postMessage({ command: 'control', componentId, key, value });
window.__M5_COMMAND__ = (command, value) => worker?.postMessage({ command, value });
window.addEventListener('pagehide', () => {
  picoPublicWorkbench.deactivate();
  c3PublicWorkbench.disposeForPageExit();
});
window.__M6_ADD__ = addComponent;
window.__M6_CONNECT__ = (from, to) => { pendingEndpoint = parseEndpoint(from); handlePin(parseEndpoint(to)); };
window.__M6_PROJECT__ = () => JSON.parse(currentProjectText());
window.__M6_IMPORT__ = (source, mode = 'replace') => {
  const before = currentProjectText(); const result = editor.importText(source, mode, { running });
  if (result.ok) {
    if (mode === 'replace') {
      installProjectGeneration({
        empty: currentProject().circuit.components.length === 0, reason: 'test.import',
        runtimeMessage: 'Imported project requires build',
      });
    } else {
      detachOutstandingBuild(); stopRuntime('Imported project requires build', { updateLifecycle: false });
      applyLifecycle({ type: 'project.edit', relevance: 'build', empty: currentProject().circuit.components.length === 0 });
    }
    persistProject(); renderProject();
  }
  return { ...result, atomic: result.ok || before === currentProjectText() };
};
window.__M7_ADD__ = addComponent;
window.__M7_PROJECT__ = window.__M6_PROJECT__;
window.__M7_CATALOG__ = () => ({
  preferences: structuredClone(catalogPreferences),
  visible: elements.cataloglist.children.length,
  windowStart: catalogWindowStart,
  fixtureActive: catalogFixtureRecords !== null,
  visibleTypes: [...elements.cataloglist.children].map((item) => item.dataset.type),
});
window.__M7_CATALOG_BENCHMARK__ = benchmarkCatalogFixture;

for (const category of CATALOG_CATEGORIES) elements.catalogcategory.append(new Option(category.label, category.id));
renderStarterExamples();

let stored = null; let recoveryStored = null;
try { stored = localStorage.getItem(PROJECT_STORAGE_KEY); recoveryStored = localStorage.getItem(PROJECT_RECOVERY_KEY); } catch { /* storage denial is recoverable */ }
const recoveryRestored = recoveryStored ? parseEditorSource(recoveryStored) : null;
const currentRestored = stored ? parseEditorSource(stored) : null;
const restored = recoveryRestored?.ok ? recoveryRestored : currentRestored;
editor = restored?.ok ? restored.session : new ProjectEditorReducer(createEmptyProject());
lifecycle = createLifecycleState({ empty: currentProject().circuit.components.length === 0 });
if (restored?.ok) persistProject();
const workspace = document.querySelector('.workspace');
for (const [name, button] of [['catalog-collapsed', elements.togglecatalog], ['inspector-collapsed', elements.toggleinspector]]) {
  if (workspacePreference(name)) { workspace.classList.add(name); button.setAttribute('aria-pressed', 'true'); }
}
if (workspacePreference('pin-labels')) { elements.circuitcanvas.classList.add('show-pin-labels'); elements.showpinlabels.setAttribute('aria-pressed', 'true'); }
renderCompilerTarget(); renderCatalog(); renderProject(); setRuntimeEnabled(false);
clearRuntimePresentation(); renderLifecycle();
setCanvasInteractionMode('select'); setSerialDock(false);
elements.projectmessage.textContent = recoveryRestored?.ok
  ? 'Recovered and revalidated an interrupted local save. Rebuild before Run.'
  : restored?.ok ? 'Reopened and revalidated the local project. Rebuild before Run.'
    : stored || recoveryStored ? 'A saved value was invalid and was left untouched. The empty in-memory project can be exported before retrying.'
      : 'No example or hidden template is loaded.';
if ((stored || recoveryStored) && !restored?.ok) elements.recoveryexport.disabled = false;
