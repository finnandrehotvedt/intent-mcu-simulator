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
import {
  PROJECT_RECOVERY_KEY, PROJECT_SCHEMA, PROJECT_STORAGE_KEY, migrateProjectV1, parseProjectV2,
} from '../src/project-v2.mjs';
import {
  addRouteJog,
  isRouteFamily,
  materializeRouteFamily,
  moveRouteSegment,
  routeFamilyPaths,
  routeSegmentOrientation,
} from '../src/route-model.mjs';
import { parallelWireConflicts, separateParallelWireLanes } from '../src/wire-lane-rules.mjs';
import { explainError } from '../src/error-catalog.mjs';
import {
  diagnosticLabel, normalizeSourceDiagnostics, sourceSelection,
} from '../src/source-diagnostics.mjs';
import { createLifecycleState, transitionLifecycle } from '../src/lifecycle.mjs';
import { mountSharedWorkbenchShell } from '../src/shared-workbench-shell.mjs';
import {
  avrInstrumentEvidence, instrumentCapability, sharedInstrumentSummary, sharedInstrumentView,
} from '../src/instrument-capabilities.mjs';
import {
  COMPONENT_SUPPORT_CELLS,
  COMPONENT_SUPPORT_MODELS,
  COMPONENT_SUPPORT_PROFILES,
  componentSupportSummary,
} from '../src/component-support-matrix.mjs';
import { createExampleProject, exampleCatalog } from '../src/example-projects.mjs';
import { avrReferenceStarterCatalog, createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import {
  TEMPERATURE_LCD_THRESHOLD_CARD,
  TEMPERATURE_LCD_THRESHOLD_EXAMPLE_ID,
  createTemperatureLcdThresholdExample,
  openTemperatureLcdThresholdExample,
} from '../expansion-drafts/temperature-lcd-threshold-example-v1.mjs';
import {
  THERMOSTAT_EXPERIMENT_ID,
  THERMOSTAT_SCENARIOS,
  THERMOSTAT_TIME,
  thermostatScenarioControls,
} from '../src/thermostat-experiment-contract.mjs';
import {
  THERMOSTAT_EXPERIMENT_CARD,
  createThermostatExperiment,
  isThermostatExperimentProject,
  openThermostatExperiment,
  thermostatFirmwareSource,
  thermostatFirmwareVariant,
} from '../src/thermostat-experiment.mjs';
import {
  ScenarioTimelineEditor, defaultThermostatScenarioTimeline, scenarioTimelineControls,
} from '../src/scenario-timeline.mjs';
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
import {
  CAPABILITY_DISCOVERY_REQUEST_SCHEMA,
  CAPABILITY_DISCOVERY_SCHEMA,
  capabilityDiscoveryResult,
  capabilityDiscoverySnapshot,
} from '../src/capability-discovery.mjs';
import {
  RP2040_PUBLIC_PROJECT_SCHEMA,
  Rp2040PublicWorkbench,
  normalizeRp2040PublicProject,
} from '../src/rp2040-public-workbench.mjs';
import {
  RP2040_PICO_COMPONENT_CATALOG,
  validateRp2040PicoCircuit,
} from '../src/rp2040-pico-circuit.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG, validateEsp32C3Circuit } from '../src/esp32c3-public-circuit.mjs';
import {
  C3_PUBLIC_PROJECT_SCHEMA,
  Esp32C3PublicWorkbench,
  normalizeEsp32C3PublicProject,
} from '../src/esp32c3-public-workbench.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG, validateStm32Circuit } from '../src/stm32-public-circuit.mjs';
import {
  STM32_EDITABLE_PROJECT_SCHEMA,
  Stm32PublicWorkbench,
  normalizeStm32PublicProject,
} from '../src/stm32-public-workbench.mjs';
import {
  PROJECT_BRIEF_SCHEMA,
  PROJECT_ENVELOPE_SCHEMA,
  PROJECT_ENVELOPE_LIMIT,
  canonicalProjectEnvelope,
  emptyProjectBrief,
  normalizeProjectBrief,
  prepareProjectEnvelope,
} from '../src/project-envelope.mjs';
import {
  createRequirementResultLink,
  currentRequirementResultLink,
} from '../src/requirement-traceability.mjs';
import { evaluateProjectFeasibility } from '../src/project-feasibility.mjs';
import {
  PROJECT_PATCH_SCHEMA,
  createProjectPatchPrompt,
  projectTextSha256,
  reviewProjectPatch,
} from '../src/project-patch.mjs';
import { compareDesignAlternatives, DESIGN_COMPARISON_SCHEMA } from '../src/design-comparison.mjs';
import {
  DOMAIN_REQUEST_SCHEMA,
  SHARED_DOMAIN_ENGINE_SCHEMA,
  domainRequest,
  executeDomainRequest,
} from '../src/shared-domain-engine.mjs';
import {
  BOUNDED_ACTIONS,
  BOUNDED_ACTION_REQUEST_SCHEMA,
  BOUNDED_ACTION_ROUTER_SCHEMA,
  boundedActionRequest,
  createBoundedActionRouter,
} from '../src/bounded-action-contracts.mjs';
import { serialEventText, serialInputBytes, serialText } from '../src/serial-view.mjs';
import { SERIAL_HISTORY_MAX } from '../src/runtime-kernel.mjs';
import { createSupportedProfileExample, supportedProfileExamples } from '../src/supported-example-pack.mjs';
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
import { CONTACT_PERSISTENCE_SCHEMA } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { controlRuntimeEvidenceMatrix } from '../src/control-runtime-evidence.mjs';
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

const uiComponentCatalog = Object.freeze({
  ...COMPONENT_CATALOG, ...CANDIDATE_UI_COMPONENTS,
  ...RP2040_PICO_COMPONENT_CATALOG, ...ESP32C3_PUBLIC_COMPONENT_CATALOG,
  ...STM32_PUBLIC_COMPONENT_CATALOG,
});
function createComponentArtwork(definition, component, options = {}) {
  return CANDIDATE_UI_COMPONENTS[component.type]
    ? createCandidateUiArtwork(document, definition, component, options)
    : createBaseComponentArtwork(definition, component, options);
}

const byId = (id) => document.querySelector(`#${id}`);
const sharedWorkbenchShell = mountSharedWorkbenchShell(document);
const elements = Object.fromEntries([
  'source', 'build', 'cancel', 'build-state', 'diagnostics', 'worker-state', 'cycle', 'instructions', 'artifact', 'trace',
  'run', 'pause', 'step', 'reset', 'speed', 'canvas-title', 'circuit-canvas', 'canvas-transform', 'component-layer', 'circuit-wires',
  'graph-state', 'wire-state', 'circuit-diagnostics', 'serial-output', 'serial-count', 'serial-input', 'serial-send',
  'serial-clear', 'logic-output', 'logic-count', 'logic-channels', 'logic-window', 'logic-cursor', 'pin-select',
  'pin-mode', 'pin-level', 'pin-detail', 'pin-diagnostic', 'pin-cycle', 'catalog-search', 'catalog-category',
  'catalog-interface', 'catalog-status', 'catalog-supply-voltage', 'catalog-pin-voltage', 'catalog-favorites', 'catalog-count',
  'catalog-empty', 'catalog-clear',
  'catalog-support-open', 'component-support-dialog', 'component-support-close',
  'component-support-profile', 'component-support-summary', 'component-support-mode', 'component-support-body',
  'catalog-list', 'catalog-prev', 'catalog-page', 'catalog-next', 'selection-name', 'property-editor', 'rotate-component', 'duplicate-component', 'delete-component',
  'selected-net', 'net-members', 'wire-color', 'wire-bends', 'selection-support', 'reconnect-mode', 'add-bend', 'delete-wire', 'remove-junction', 'zoom-value',
  'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'view-reset', 'fit-project', 'project-state',
  'project-message', 'project-name', 'project-new', 'project-demo', 'project-save', 'project-open', 'project-open-input',
  'project-native-open', 'project-native-save', 'project-native-save-copy', 'project-file-connection',
  'project-reload', 'project-export', 'project-import',
  'project-import-mode', 'undo', 'redo', 'prompt-generate', 'prompt-copy', 'prompt-output', 'prompt-response',
  'prompt-mode', 'prompt-apply', 'prompt-message', 'component-controls',
  'editor-title', 'source-file', 'source-file-name', 'source-file-add', 'source-file-remove',
  'lifecycle-state', 'technical-error', 'technical-error-detail', 'delete-branch',
  'example-select', 'walkthrough-open', 'walkthrough', 'recovery-export', 'quick-state', 'quick-build', 'quick-run', 'quick-pause', 'quick-reset',
  'unsaved-change-dialog', 'unsaved-change-title', 'unsaved-change-description', 'unsaved-change-status',
  'unsaved-keep', 'unsaved-download', 'unsaved-discard',
  'toggle-catalog', 'toggle-inspector', 'catalog-resizer', 'inspector-resizer', 'show-pin-labels', 'focus-canvas', 'fullscreen-canvas',
  'source-lines', 'source-highlight', 'diagnostic-links', 'build-log', 'simulated-time', 'requested-speed', 'achieved-speed',
  'serial-text-mode', 'serial-event-mode', 'serial-export', 'serial-newline', 'logic-waveform', 'logic-cursor-a', 'logic-cursor-b',
  'serial-provenance', 'instrument-evidence', 'instrument-evidence-state', 'instrument-evidence-profile',
  'instrument-evidence-artifact', 'instrument-evidence-time', 'instrument-evidence-retention',
  'control-runtime-evidence-body',
  'serial-tab', 'serial-dock', 'serial-close', 'serial-resizer', 'serial-resume', 'serial-new-output',
  'canvas-select-mode', 'canvas-interact-mode',
  'thermostat-experiment', 'thermostat-experiment-state', 'thermostat-run-tests',
  'thermostat-load-bad', 'thermostat-restore', 'thermostat-results', 'thermostat-experiment-message',
  'scenario-editor', 'scenario-add', 'scenario-undo', 'scenario-redo', 'scenario-run',
  'scenario-list', 'scenario-editor-message',
  'starter-examples', 'starter-gallery', 'quick-controls', 'workbench-workspace', 'project-bar',
  'family-select', 'board-select', 'controller-status', 'toolchain-boundary',
  'controller-workbench', 'controller-workbench-eyebrow', 'controller-workbench-title', 'controller-workbench-badge',
  'controller-workbench-summary', 'controller-capability-project', 'controller-capability-source',
  'controller-capability-runtime', 'controller-capability-circuit', 'controller-primary-action', 'controller-return-avr',
  'controller-workbench-limitation', 'controller-public-boundary', 'parked-circuit-notice',
  'project-brief', 'project-brief-profile', 'project-brief-purpose', 'project-brief-inputs',
  'project-brief-outputs', 'project-brief-boundaries', 'project-brief-acceptance',
  'project-brief-assumptions', 'project-brief-capabilities', 'project-brief-evaluation', 'project-brief-status', 'requirement-trace-list', 'requirement-trace-summary',
  'open-assumptions-list', 'open-assumptions-summary', 'project-feasibility-list', 'project-feasibility-summary',
  'project-patch-description', 'project-patch-generate', 'project-patch-copy', 'project-patch-prompt',
  'project-patch-input', 'project-patch-review', 'project-patch-apply', 'project-patch-status',
  'project-patch-changes', 'project-patch-summary',
  'design-comparison-create', 'design-comparison-summary', 'design-comparison-status',
  'design-comparison-alternatives', 'design-comparison-differences',
  'shared-domain-engine-inspect', 'shared-domain-engine-summary', 'shared-domain-engine-status',
  'shared-domain-engine-stages',
  'bounded-actions-summary', 'bounded-actions-status', 'bounded-actions-list',
  'firmware-drawer', 'prompt-drawer', 'runtime-drawer',
  'pico-public-workbench', 'pico-state', 'pico-project-name', 'pico-save', 'pico-open', 'pico-open-input',
  'pico-native-open', 'pico-native-save', 'pico-native-save-copy', 'pico-file-connection', 'pico-legacy-copy',
  'pico-profile-examples',
  'pico-source', 'pico-build', 'pico-run', 'pico-pause', 'pico-reset', 'pico-stop', 'pico-message',
  'pico-diagnostics', 'pico-diagnostic-links',
  'pico-source-hash', 'pico-artifact-hash', 'pico-diagram', 'pico-circuit-state',
  'pico-editor-wires', 'pico-editor-components', 'pico-circuit-selection',
  'pico-parts-list', 'pico-part-properties',
  'pico-delete', 'pico-undo', 'pico-redo', 'pico-rotate', 'pico-zoom-out', 'pico-zoom-value',
  'pico-zoom-in', 'pico-fit', 'pico-reconnect', 'pico-add-bend', 'pico-route-back', 'pico-route-forward',
  'pico-wire-color', 'pico-wire-cancel', 'pico-wire-state', 'pico-serial',
  'c3-public-workbench', 'c3-state', 'c3-project-name', 'c3-save', 'c3-open', 'c3-open-input',
  'c3-native-open', 'c3-native-save', 'c3-native-save-copy', 'c3-file-connection', 'c3-legacy-copy',
  'c3-profile-examples',
  'c3-source', 'c3-build', 'c3-run', 'c3-stop', 'c3-message', 'c3-source-hash', 'c3-flash-hash',
  'c3-diagnostics', 'c3-diagnostic-links',
  'c3-diagram', 'c3-external-led', 'c3-circuit-state', 'c3-reconnect', 'c3-add-bend', 'c3-route-back', 'c3-route-forward',
  'c3-wire-color', 'c3-wire-cancel', 'c3-wire-state', 'c3-terminal',
  'c3-editor-wires', 'c3-editor-components', 'c3-circuit-selection',
  'c3-parts-list', 'c3-part-properties',
  'c3-delete', 'c3-undo', 'c3-redo', 'c3-rotate', 'c3-zoom-out', 'c3-zoom-value', 'c3-zoom-in', 'c3-fit',
  'stm32-public-workbench', 'stm32-state', 'stm32-project-name', 'stm32-save', 'stm32-open', 'stm32-open-input',
  'stm32-native-open', 'stm32-native-save', 'stm32-native-save-copy', 'stm32-file-connection', 'stm32-legacy-copy',
  'stm32-profile-examples',
  'stm32-source', 'stm32-build', 'stm32-run', 'stm32-reset', 'stm32-stop', 'stm32-message',
  'stm32-diagnostics', 'stm32-diagnostic-links',
  'stm32-source-hash', 'stm32-artifact-hash', 'stm32-diagram', 'stm32-external-led',
  'stm32-circuit-state', 'stm32-terminal', 'stm32-editor-wires', 'stm32-editor-components',
  'stm32-circuit-selection', 'stm32-delete', 'stm32-undo', 'stm32-redo', 'stm32-rotate',
  'stm32-parts-list', 'stm32-part-properties',
  'stm32-zoom-out', 'stm32-zoom-value', 'stm32-zoom-in', 'stm32-fit',
  'stm32-reconnect', 'stm32-add-bend', 'stm32-route-back', 'stm32-route-forward',
  'stm32-wire-color', 'stm32-wire-cancel', 'stm32-wire-state',
].map((id) => [id.replaceAll('-', ''), byId(id)]));

const controlRuntimeEvidence = controlRuntimeEvidenceMatrix();
window.__CONTROL_RUNTIME_EVIDENCE_MATRIX__ = structuredClone(controlRuntimeEvidence);
for (const row of controlRuntimeEvidence.rows) {
  const tableRow = document.createElement('tr');
  for (const value of [`${row.model} · ${row.field}${row.authored ? '' : ' (derived)'}`,
    row.workerEvent, row.observable, row.evidence]) {
    tableRow.append(Object.assign(document.createElement('td'), { textContent: value }));
  }
  elements.controlruntimeevidencebody.append(tableRow);
}

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
let runtimeRenderTimer = null;
let pendingRuntimeRender = null;
let runtimeWorkerCreations = 0;
let selectedCompilerProfile = AVR_PROFILE;
const projectBriefDrafts = new Map();
const requirementResultLinks = new Map();
const sharedInstrumentSummaries = new Map();
const sharedInstrumentLocals = new Map();
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
const projectFileConnections = new Map();
let nativeFileOperation = null;
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
let thermostatExperimentRun = null;
let thermostatExperimentResults = [];
let authoredScenarioResults = [];
let scenarioTimelineEditor = null;
let thermostatExperimentNotice = 'Build this exact local project before running the experiment.';
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

function renderProfileDiagnostics(snapshot, { textarea, summary, links, current }) {
  const diagnostics = snapshot?.diagnostics ?? [];
  const panel = summary.closest('.source-diagnostics');
  panel.dataset.state = diagnostics.some((item) => item.severity === 'error') ? 'error' : 'clear';
  summary.textContent = diagnostics.length
    ? diagnostics.map((item) => `${diagnosticLabel(item)} · ${item.message}`).join('\n')
    : 'No current build errors.';
  const nodes = diagnostics.map((diagnostic) => {
    if (!diagnostic.navigable) {
      const message = document.createElement('p');
      message.className = 'diagnostic-message';
      message.textContent = diagnosticLabel(diagnostic);
      return message;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Go to ${diagnostic.file}:${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ''}`;
    button.setAttribute('aria-label', `${button.textContent}. ${diagnostic.message}`);
    button.addEventListener('click', () => {
      const state = current();
      const unchanged = selectedCompilerProfile === diagnostic.profile
        && state?.revision === diagnostic.revision
        && textarea.value === diagnostic.source;
      const selection = unchanged ? sourceSelection(textarea.value, diagnostic.line, diagnostic.column) : null;
      if (!selection) {
        button.disabled = true;
        summary.textContent = 'That diagnostic is stale or has no safe location. Build the current source again.';
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(selection.start, selection.end);
      const before = textarea.value.slice(0, selection.start).split('\n').length;
      textarea.scrollTop = Math.max(0, (before - 4) * 21);
    });
    return button;
  });
  links.replaceChildren(...nodes);
}

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
  elements.quickpause.title = '';
  elements.quickreset.title = '';
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
  elements.quickpause.title = 'Pause is unavailable for the bounded QEMU run.';
  elements.quickreset.title = 'Reset replay is already verified inside each QEMU Run.';
}

function renderStm32QuickControls(state = stm32PublicState) {
  if (selectedCompilerProfile !== STM32F429ZI_PROFILE || !state) return;
  elements.quickstate.textContent = `STM32F429ZI · ${state.phase} · ${state.circuitAccepted ? 'PB0 wiring valid' : state.circuitCode}`;
  elements.quickbuild.textContent = 'Build STM32 ELF';
  elements.quickrun.textContent = 'Run actual Renode';
  elements.quickpause.textContent = 'Pause unavailable';
  elements.quickreset.textContent = 'Reset in fresh Renode';
  elements.quickbuild.disabled = ['building', 'running'].includes(state.phase);
  elements.quickrun.disabled = !state.runnable || ['building', 'running'].includes(state.phase);
  elements.quickpause.disabled = true;
  elements.quickreset.disabled = !state.runnable || ['building', 'running'].includes(state.phase);
  elements.quickpause.title = 'Pause is unavailable for the isolated Renode run.';
  elements.quickreset.title = '';
}

let picoEditorZoom = 1;
let picoEditorDrag = null;
let picoEditorResponsiveScale = null;

function picoEndpointKey(endpoint) { return `${endpoint.component}.${endpoint.pin}`; }

function namedWireConnection(draft, key) {
  return draft.nets.find((net) => net.endpoints.some((endpoint) => picoEndpointKey(endpoint) === key)) ?? null;
}

function namedWireInstruction(wireDraft) {
  if (wireDraft.mode === 'connect-target') {
    return `Start ${picoEndpointKey(wireDraft.from)} selected — choose a compatible free destination. Escape cancels.`;
  }
  if (wireDraft.mode === 'reconnect-source') {
    return `Reconnect ${wireDraft.netId} — choose the connected endpoint to move. Escape cancels.`;
  }
  if (wireDraft.mode === 'reconnect-target') {
    return `Move ${picoEndpointKey(wireDraft.from)} on ${wireDraft.netId} — choose a compatible free destination. Escape cancels.`;
  }
  return 'Select a free named pin, then a compatible free destination. Select a cable first to reconnect one endpoint.';
}

function decorateNamedWireAnchor(anchor, key, { draft, wireDraft }) {
  const connection = namedWireConnection(draft, key);
  const pending = ['connect-target', 'reconnect-target'].includes(wireDraft.mode)
    && picoEndpointKey(wireDraft.from) === key;
  const available = wireDraft.mode === 'connect-target' && !connection
    || wireDraft.mode === 'reconnect-source' && connection?.id === wireDraft.netId
    || wireDraft.mode === 'reconnect-target' && !connection;
  anchor.classList.toggle('pending', pending);
  anchor.classList.toggle('available', available && !pending);
  anchor.dataset.wireState = pending ? 'pending-source' : available ? 'available' : connection ? 'connected' : 'free';
  anchor.setAttribute('aria-pressed', String(pending));
  const action = pending ? 'Selected wire source.' : available ? 'Available wire endpoint.'
    : connection ? `Connected to ${connection.id}.` : 'Free wire endpoint.';
  anchor.setAttribute('aria-label', `${anchor.title}. ${action}`);
}

function namedWireResultMessage(result) {
  if (!result.ok) return `Connection rejected (${result.code}). The circuit is unchanged; choose a compatible free pin or press Escape.`;
  if (result.code.endsWith('_NET_CREATED')) return `Created cable ${result.netId}. ${result.validation.ok ? 'Circuit validated.' : 'Continue wiring; Build remains blocked.'}`;
  if (result.code.endsWith('_ENDPOINT_RECONNECTED')) return `Reconnected one endpoint of ${result.netId}. ${result.validation.ok ? 'Circuit validated.' : 'Continue wiring; Build remains blocked.'}`;
  return namedWireInstruction(result.wireDraft);
}

function activateNamedWireEndpoint(workbench, statusElement, endpoint) {
  const result = workbench.editCircuit('activateEndpoint', endpoint);
  statusElement.textContent = namedWireResultMessage(result);
  return result;
}

function beginNamedWireReconnect(workbench, statusElement) {
  const result = workbench.editCircuit('beginReconnect');
  statusElement.textContent = namedWireResultMessage(result);
  return result;
}

function cancelNamedWire(workbench, statusElement) {
  const result = workbench.editCircuit('cancelWireDraft');
  statusElement.textContent = 'Wire selection cancelled. The circuit is unchanged.';
  return result;
}

function boundedPartSummary(part, component) {
  if (part.fixed) return 'Fixed controller';
  if (!component) return 'Missing · add to repair';
  if (part.type === 'resistor.fixed-v1') return `${component.properties.ohms} Ω · bounded ideal model`;
  if (part.type === 'led.basic-v1') return `${component.properties.color} · bounded ideal LED model`;
  return 'Unsupported';
}

function renderBoundedComponentCatalog({ state, editCircuit, list, properties }) {
  const { draft, selection, catalog } = state.circuitEditor;
  const rows = catalog.parts.map((part) => {
    const component = draft.components.find((candidate) => candidate.type === part.type);
    const row = document.createElement('article');
    row.className = 'bounded-part-card'; row.dataset.type = part.type;
    row.dataset.present = String(part.present); row.setAttribute('role', 'listitem');
    const name = document.createElement('strong'); name.textContent = part.displayName;
    const summary = document.createElement('small'); summary.textContent = boundedPartSummary(part, component);
    const id = document.createElement('code'); id.textContent = component?.id ?? part.id;
    const action = document.createElement('button'); action.type = 'button';
    action.dataset.boundedAdd = part.type;
    action.textContent = part.fixed ? 'Fixed' : part.present ? 'Added' : 'Add missing part';
    action.disabled = !part.addable;
    action.setAttribute('aria-label', part.fixed
      ? `${part.displayName} is fixed for this profile`
      : part.present ? `${part.displayName} is already present` : `Add missing ${part.displayName}`);
    if (part.addable) action.addEventListener('click', () => editCircuit('addMissingComponent', part.type));
    row.title = part.limitation;
    row.append(name, summary, id, action);
    return row;
  });
  list.replaceChildren(...rows);

  const selected = selection.kind === 'component'
    ? draft.components.find((component) => component.id === selection.id) : null;
  const selectedPart = selected && catalog.parts.find((part) => part.type === selected.type);
  if (!selected || !selectedPart || selectedPart.fixed) {
    const note = document.createElement('p');
    note.textContent = selectedPart?.fixed
      ? 'This controller profile is fixed. Select the resistor or LED to edit its bounded model property.'
      : 'Select the resistor or LED to edit only its tested bounded model property.';
    properties.replaceChildren(note); return;
  }

  const row = document.createElement('div'); row.className = 'bounded-property-row';
  const label = document.createElement('label');
  const limit = document.createElement('small');
  const commitOnChange = (control, value) => {
    let committing = false;
    control.addEventListener('change', () => {
      if (committing) return;
      committing = true;
      const next = value();
      // Programmatic browser tests can dispatch change while the control is
      // still focused. Move focus first so the synchronous state render does
      // not replace a focused node and trigger a re-entrant blur/change.
      if (document.activeElement === control) control.blur();
      editCircuit('setComponentProperty', selected.id, control.dataset.boundedProperty, next);
    });
  };
  let input;
  if (selected.type === 'resistor.fixed-v1') {
    label.append('Resistance (Ω)');
    limit.textContent = 'Accepted only when the selected LED remains within the exact 3.3 V / 12 mA ideal-model limit.';
    input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = '10000000';
    input.step = '1'; input.value = String(selected.properties.ohms); input.dataset.boundedProperty = 'ohms';
    commitOnChange(input, () => Number(input.value));
  } else {
    label.append('LED colour');
    limit.textContent = 'Colour selects a tested ideal forward-voltage constant; it is not a wavelength, brightness or physical-accuracy claim.';
    input = document.createElement('select'); input.dataset.boundedProperty = 'color';
    for (const color of selectedPart.supportedProperties.color.values) {
      const option = document.createElement('option'); option.value = color; option.textContent = color;
      option.selected = color === selected.properties.color; input.append(option);
    }
    commitOnChange(input, () => input.value);
  }
  label.append(limit); input.id = `${selected.id}-${input.dataset.boundedProperty}`; label.htmlFor = input.id;
  row.append(label, input); properties.replaceChildren(row);
}

function renderProfileExampleCards(profile, container, workbench) {
  const cards = supportedProfileExamples(profile).map((example) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'profile-example-card';
    button.dataset.profileExample = example.id;
    button.setAttribute('aria-label', `Load ${example.name}. ${example.learn}`);
    const name = document.createElement('strong'); name.textContent = example.name;
    const line = (label, value) => {
      const row = document.createElement('span'); const heading = document.createElement('b');
      heading.textContent = label; row.append(heading, ` · ${value}`); return row;
    };
    const learn = line('Learn', example.learn);
    const tryIt = line('Try', example.try);
    const outcome = line('Observe', example.outcome);
    const limits = line('Limits', example.limits);
    button.append(name, learn, tryIt, outcome, limits);
    button.addEventListener('click', () => {
      const install = () => workbench.installPreparedProject(
        createSupportedProfileExample(profile, example.id),
        `${example.name} loaded as authored data only. Build fresh before Run.`,
      );
      if (!requestUnsavedChangeGuard({ profile, actionLabel: `loading ${example.name}`, continueAction: install })) install();
    });
    return button;
  });
  container.replaceChildren(...cards);
}

function picoEditorAnchor(endpoint, diagram = elements.picodiagram, components = elements.picoeditorcomponents) {
  const target = components.querySelector(`[data-editor-endpoint="${picoEndpointKey(endpoint)}"]`);
  if (!target) return null;
  const canvas = diagram.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const cardBox = target.closest('.pico-editor-part').getBoundingClientRect();
  const pin = { x: box.left - canvas.left + box.width / 2, y: box.top - canvas.top + box.height / 2 };
  const rendered = {
    left: cardBox.left - canvas.left, right: cardBox.right - canvas.left,
    top: cardBox.top - canvas.top, bottom: cardBox.bottom - canvas.top,
  };
  const direction = [
    { distance: Math.abs(pin.x - rendered.left), x: -1, y: 0 },
    { distance: Math.abs(rendered.right - pin.x), x: 1, y: 0 },
    { distance: Math.abs(pin.y - rendered.top), x: 0, y: -1 },
    { distance: Math.abs(rendered.bottom - pin.y), x: 0, y: 1 },
  ].sort((left, right) => left.distance - right.distance)[0];
  const escapeDistance = direction.distance + (canvas.width <= 700 ? 4 : 14);
  return {
    pin,
    escape: { x: pin.x + direction.x * escapeDistance, y: pin.y + direction.y * escapeDistance },
    component: endpoint.component,
  };
}

function picoEditorObstacles(diagram = elements.picodiagram, components = elements.picoeditorcomponents) {
  const canvas = diagram.getBoundingClientRect();
  const clearance = canvas.width <= 430 ? 1.5 : canvas.width <= 700 ? 4 : 9;
  return [...components.querySelectorAll('.pico-editor-part')].map((card) => {
    const box = card.getBoundingClientRect();
    return {
      component: card.dataset.componentId,
      left: box.left - canvas.left - clearance,
      right: box.right - canvas.left + clearance,
      top: box.top - canvas.top - clearance,
      bottom: box.bottom - canvas.top + clearance,
    };
  });
}

function picoSegmentCrossesBody(start, end, body) {
  const epsilon = 0.5;
  if (Math.abs(start.y - end.y) <= epsilon) {
    const y = (start.y + end.y) / 2;
    return y > body.top + epsilon && y < body.bottom - epsilon
      && Math.max(start.x, end.x) > body.left + epsilon
      && Math.min(start.x, end.x) < body.right - epsilon;
  }
  if (Math.abs(start.x - end.x) <= epsilon) {
    const x = (start.x + end.x) / 2;
    return x > body.left + epsilon && x < body.right - epsilon
      && Math.max(start.y, end.y) > body.top + epsilon
      && Math.min(start.y, end.y) < body.bottom - epsilon;
  }
  return true;
}

function compactPicoRoute(points) {
  const unique = points.filter((point, index) => !index
    || Math.abs(point.x - points[index - 1].x) > 0.5 || Math.abs(point.y - points[index - 1].y) > 0.5);
  return unique.filter((point, index) => {
    // The first and last pairs are the electrically named pin-to-escape
    // segments. Keep both escapes even when an intermediate channel happens
    // to be collinear; otherwise a rotated part can lose its outward dogleg
    // and the visible cable cuts back through the component body.
    if (index <= 1 || index >= unique.length - 2) return true;
    const before = unique[index - 1]; const after = unique[index + 1];
    return !((Math.abs(before.x - point.x) <= 0.5 && Math.abs(point.x - after.x) <= 0.5)
      || (Math.abs(before.y - point.y) <= 0.5 && Math.abs(point.y - after.y) <= 0.5));
  });
}

function picoRouteLength(points) {
  return points.slice(1).reduce((total, point, index) => total
    + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0);
}

function picoEditorRoute(anchors, canvas, obstacles, occupied = []) {
  const [left, right] = anchors;
  const xChannels = [12, canvas.width - 12,
    ...obstacles.flatMap((body) => [Math.max(12, body.left - 14), Math.min(canvas.width - 12, body.right + 14)])];
  const yChannels = [12, canvas.height - 12,
    ...obstacles.flatMap((body) => [Math.max(12, body.top - 14), Math.min(canvas.height - 12, body.bottom + 14)])];
  const candidates = [
    [left.pin, left.escape, { x: right.escape.x, y: left.escape.y }, right.escape, right.pin],
    [left.pin, left.escape, { x: left.escape.x, y: right.escape.y }, right.escape, right.pin],
    ...xChannels.map((x) => [left.pin, left.escape, { x, y: left.escape.y }, { x, y: right.escape.y }, right.escape, right.pin]),
    ...yChannels.map((y) => [left.pin, left.escape, { x: left.escape.x, y }, { x: right.escape.x, y }, right.escape, right.pin]),
  ].map(compactPicoRoute);
  const accepted = candidates.filter((points) => points.slice(1).every((end, index) => {
    const start = points[index];
    return obstacles.every((body) => {
      const namedEscape = index === 0 && body.component === anchors[0].component
        || index === points.length - 2 && body.component === anchors[1].component;
      return namedEscape || !picoSegmentCrossesBody(start, end, body);
    });
  }));
  return (accepted.length ? accepted : candidates).map((points, order) => ({
    points, order,
    conflicts: parallelWireConflicts([...occupied, { netId: `candidate-${order}`, points }], { clearance: 8 }).length,
  })).sort((a, b) => a.conflicts - b.conflicts || picoRouteLength(a.points) - picoRouteLength(b.points) || a.order - b.order)[0].points;
}

const boundedRouteSelection = { pico: null, c3: null, stm32: null };

function boundedRouteGeometry(config, draft) {
  const box = config.diagram.getBoundingClientRect();
  const anchors = {};
  for (const net of draft.nets) for (const endpoint of net.endpoints) {
    const anchor = picoEditorAnchor(endpoint, config.diagram, config.components);
    if (!anchor) continue;
    anchors[picoEndpointKey(endpoint)] = {
      pin: { x: anchor.pin.x / box.width, y: anchor.pin.y / box.height },
      escape: { x: anchor.escape.x / box.width, y: anchor.escape.y / box.height },
    };
  }
  const obstacles = picoEditorObstacles(config.diagram, config.components).map((item) => ({
    component: item.component, left: item.left / box.width, right: item.right / box.width,
    top: item.top / box.height, bottom: item.bottom / box.height,
  }));
  return { box, anchors, obstacles };
}

function boundedCombinedPath(family, anchors) {
  const branches = routeFamilyPaths(family, anchors);
  if (branches.length !== 2) throw new TypeError('BOUNDED_ROUTE_BRANCH_COUNT');
  return [...branches[0].points, ...branches[1].points.slice(0, -1).reverse()];
}

function boundedPixelPoints(points, box) {
  return points.map((point) => ({ x: point.x * box.width, y: point.y * box.height }));
}

function boundedFamilyFromPixelRoute(net, points, box) {
  const hubIndex = Math.max(2, Math.min(points.length - 3, Math.floor((points.length - 1) / 2)));
  const normalized = (values) => values.map((point) => ({ x: point.x / box.width, y: point.y / box.height }));
  const left = normalized(points.slice(2, hubIndex + 1));
  const right = normalized(points.slice(hubIndex, points.length - 2).reverse());
  const hub = normalized([points[hubIndex]])[0];
  return {
    schema: 'intent-mcu-route@1',
    branches: [
      { endpoint: structuredClone(net.endpoints[0]), points: left.length ? left : [hub] },
      { endpoint: structuredClone(net.endpoints[1]), points: right.length ? right : [hub] },
    ],
  };
}

function boundedFamilyForNet(config, draft, net, geometry, occupied = []) {
  const stored = draft.layout.wireRoutes?.[net.id];
  if (stored) {
    const family = materializeRouteFamily(net, stored, geometry.anchors, geometry.obstacles);
    return { family, points: boundedPixelPoints(boundedCombinedPath(family, geometry.anchors), geometry.box) };
  }
  const pixelAnchors = net.endpoints.map((endpoint) => picoEditorAnchor(endpoint, config.diagram, config.components));
  const points = picoEditorRoute(pixelAnchors, geometry.box,
    picoEditorObstacles(config.diagram, config.components), occupied);
  const storedFamily = boundedFamilyFromPixelRoute(net, points, geometry.box);
  return { family: materializeRouteFamily(net, storedFamily, geometry.anchors, geometry.obstacles), points };
}

function boundedPathData(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function boundedCrossings(routes) {
  const result = [];
  for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
      const left = routes[leftIndex]; const right = routes[rightIndex];
      for (let a = 0; a < left.points.length - 1; a += 1) {
        const a1 = left.points[a]; const a2 = left.points[a + 1];
        const aHorizontal = Math.abs(a1.y - a2.y) < 0.5;
        for (let b = 0; b < right.points.length - 1; b += 1) {
          const b1 = right.points[b]; const b2 = right.points[b + 1];
          const bHorizontal = Math.abs(b1.y - b2.y) < 0.5;
          if (aHorizontal === bHorizontal) continue;
          const horizontal = aHorizontal ? [a1, a2] : [b1, b2];
          const vertical = aHorizontal ? [b1, b2] : [a1, a2];
          const x = vertical[0].x; const y = horizontal[0].y;
          const within = x > Math.min(horizontal[0].x, horizontal[1].x) + 1
            && x < Math.max(horizontal[0].x, horizontal[1].x) - 1
            && y > Math.min(vertical[0].y, vertical[1].y) + 1
            && y < Math.max(vertical[0].y, vertical[1].y) - 1;
          if (within) result.push({ x, y, leftNet: left.netId, rightNet: right.netId });
        }
      }
    }
  }
  return result;
}

function defaultBoundedSegment(family, anchors) {
  const branches = routeFamilyPaths(family, anchors);
  const candidates = [];
  for (const branch of branches) {
    for (let index = 1; index < branch.points.length - 1; index += 1) {
      const orientation = routeSegmentOrientation(branch.points[index], branch.points[index + 1]);
      if (orientation) candidates.push({
        endpoint: picoEndpointKey(branch.endpoint), segmentIndex: index, orientation,
        length: Math.abs(branch.points[index].x - branch.points[index + 1].x)
          + Math.abs(branch.points[index].y - branch.points[index + 1].y),
      });
    }
  }
  // Prefer the section nearest the shared hub. It is furthest from the named
  // terminal body and gives the first click-free bend the largest safe area.
  candidates.sort((left, right) => right.segmentIndex - left.segmentIndex
    || right.length - left.length || left.endpoint.localeCompare(right.endpoint));
  if (candidates.length) {
    const { length: _length, ...selected } = candidates[0];
    return selected;
  }
  const branch = branches[0];
  const index = Math.min(1, branch.points.length - 2);
  return { endpoint: picoEndpointKey(branch.endpoint), segmentIndex: index,
    orientation: routeSegmentOrientation(branch.points[index], branch.points[index + 1]) };
}

function renderBoundedWireLayer(config) {
  const state = config.state();
  if (!state?.circuitEditor) return;
  const { draft, selection } = state.circuitEditor;
  const geometry = boundedRouteGeometry(config, draft);
  if (!geometry.box.width || !geometry.box.height) return;
  config.svg.setAttribute('viewBox', `0 0 ${geometry.box.width} ${geometry.box.height}`);
  const materialized = [];
  for (const net of draft.nets) {
    const resolved = boundedFamilyForNet(config, draft, net, geometry,
      materialized.map((item) => ({ netId: item.net.id, points: item.points })));
    materialized.push({ net, ...resolved });
  }
  const separated = separateParallelWireLanes(materialized.map((item) => ({
    netId: item.net.id, points: item.points,
  })), { clearance: 8, obstacles: picoEditorObstacles(config.diagram, config.components),
    bounds: { left: 8, right: geometry.box.width - 8, top: 8, bottom: geometry.box.height - 8 } });
  const drawings = [];
  for (const item of materialized) {
    const points = separated.routes.find((route) => route.netId === item.net.id)?.points ?? item.points;
    const d = boundedPathData(points);
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.classList.add('pico-editor-wire-hit'); hit.dataset.net = item.net.id; hit.setAttribute('d', d);
    hit.setAttribute('tabindex', '0'); hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', `Select cable ${item.net.id}: ${item.net.endpoints.map(picoEndpointKey).join(' to ')}. Crossings are not connections.`);
    const select = (event) => {
      event.preventDefault(); config.workbench.selectCircuit({ kind: 'net', id: item.net.id });
      boundedRouteSelection[config.key] = { netId: item.net.id, ...defaultBoundedSegment(item.family, geometry.anchors) };
      requestAnimationFrame(config.draw);
    };
    hit.addEventListener('click', select);
    hit.addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key)) select(event); });
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('pico-editor-wire');
    if (selection.kind === 'net' && selection.id === item.net.id) path.classList.add('selected');
    path.dataset.net = item.net.id; path.dataset.points = JSON.stringify(points);
    path.dataset.laneConflicts = String(separated.conflicts.filter((value) => value.leftNet === item.net.id || value.rightNet === item.net.id).length);
    path.style.setProperty('--wire-color', draft.layout.wireStyles[item.net.id] ?? '#39dff2');
    path.setAttribute('d', d); drawings.push(hit, path);
    if (selection.kind === 'net' && selection.id === item.net.id) {
      for (const branch of routeFamilyPaths(item.family, geometry.anchors)) {
        for (let index = 1; index < branch.points.length - 1; index += 1) {
          const start = boundedPixelPoints([branch.points[index]], geometry.box)[0];
          const end = boundedPixelPoints([branch.points[index + 1]], geometry.box)[0];
          const orientation = routeSegmentOrientation(branch.points[index], branch.points[index + 1]);
          if (!orientation) continue;
          const segment = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          segment.classList.add('pico-editor-segment-hit');
          const key = picoEndpointKey(branch.endpoint);
          const selectedSegment = boundedRouteSelection[config.key];
          if (selectedSegment?.netId === item.net.id && selectedSegment.endpoint === key
              && selectedSegment.segmentIndex === index) segment.classList.add('selected');
          segment.dataset.net = item.net.id; segment.dataset.endpoint = key;
          segment.dataset.segmentIndex = String(index); segment.dataset.orientation = orientation;
          segment.setAttribute('d', boundedPathData([start, end])); segment.setAttribute('tabindex', '0');
          segment.setAttribute('role', 'button');
          segment.setAttribute('aria-label', `Select ${orientation} editable segment ${index} on ${item.net.id}`);
          const choose = (event) => {
            event.preventDefault(); event.stopPropagation();
            boundedRouteSelection[config.key] = { netId: item.net.id, endpoint: key, segmentIndex: index, orientation };
            config.status.textContent = `Selected ${orientation} segment ${index} on ${item.net.id}. Add a bend or nudge it on the snapped grid.`;
            requestAnimationFrame(config.draw);
          };
          segment.addEventListener('click', choose);
          segment.addEventListener('keydown', (event) => {
            if (['Enter', ' '].includes(event.key)) choose(event);
            if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
              choose(event);
              editBoundedRoute(config.key, 'move', ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
            }
          });
          drawings.push(segment);
        }
      }
    }
  }
  for (const crossing of boundedCrossings(separated.routes)) {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    marker.classList.add('pico-wire-crossing'); marker.setAttribute('cx', crossing.x); marker.setAttribute('cy', crossing.y);
    marker.setAttribute('r', '4'); marker.dataset.crossing = `${crossing.leftNet}:${crossing.rightNet}`;
    drawings.push(marker);
  }
  config.svg.replaceChildren(...drawings);
}

function boundedRouteConfig(key) {
  return {
    pico: { key, workbench: picoPublicWorkbench, state: () => picoPublicState,
      diagram: elements.picodiagram, components: elements.picoeditorcomponents,
      status: elements.picowirestate, draw: drawPicoEditorWires },
    c3: { key, workbench: c3PublicWorkbench, state: () => c3PublicState,
      diagram: elements.c3diagram, components: elements.c3editorcomponents,
      status: elements.c3wirestate, draw: drawC3EditorWires },
    stm32: { key, workbench: stm32PublicWorkbench, state: () => stm32PublicState,
      diagram: elements.stm32diagram, components: elements.stm32editorcomponents,
      status: elements.stm32wirestate, draw: drawStm32EditorWires },
  }[key];
}

function boundedRouteCandidateValid(config, draft, targetNetId, targetFamily, geometry) {
  const routes = [];
  for (const net of draft.nets) {
    const resolved = net.id === targetNetId
      ? { family: targetFamily, points: boundedPixelPoints(boundedCombinedPath(targetFamily, geometry.anchors), geometry.box) }
      : boundedFamilyForNet(config, draft, net, geometry, routes);
    const points = resolved.points;
    const blocked = points.slice(0, -1).some((start, index) => {
      const end = points[index + 1];
      return picoEditorObstacles(config.diagram, config.components).some((body) => {
        const endpointEscape = index === 0 && body.component === net.endpoints[0].component
          || index === points.length - 2 && body.component === net.endpoints[1].component;
        return !endpointEscape && picoSegmentCrossesBody(start, end, body);
      });
    });
    if (blocked) return { ok: false, code: 'WIRE_ROUTE_BODY_INTERSECTION' };
    routes.push({ netId: net.id, points });
  }
  const separated = separateParallelWireLanes(routes, {
    clearance: 8, obstacles: picoEditorObstacles(config.diagram, config.components),
    bounds: { left: 8, right: geometry.box.width - 8, top: 8, bottom: geometry.box.height - 8 },
  });
  return separated.conflicts.length
    ? { ok: false, code: 'WIRE_LANE_01_OVERLAP' }
    : { ok: true, crossings: boundedCrossings(separated.routes).length };
}

function editBoundedRoute(key, action, direction = 1) {
  const config = boundedRouteConfig(key);
  const state = config.workbench.snapshot().circuitEditor;
  const netId = state.selection.kind === 'net' ? state.selection.id : null;
  const net = state.draft.nets.find((candidate) => candidate.id === netId);
  if (!net) return { ok: false, code: 'WIRE_SELECTION_REQUIRED' };
  const geometry = boundedRouteGeometry(config, state.draft);
  const occupied = [];
  let resolvedTarget = null;
  for (const candidateNet of state.draft.nets) {
    const resolved = boundedFamilyForNet(config, state.draft, candidateNet, geometry, occupied);
    if (candidateNet.id === net.id) resolvedTarget = resolved;
    occupied.push({ netId: candidateNet.id, points: resolved.points });
  }
  const family = resolvedTarget.family;
  const selected = boundedRouteSelection[key]?.netId === net.id
    ? boundedRouteSelection[key] : { netId: net.id, ...defaultBoundedSegment(family, geometry.anchors) };
  let candidate;
  try {
    if (action === 'bend') {
      candidate = addRouteJog(family, geometry.anchors, selected.endpoint, selected.segmentIndex, net, direction);
    } else {
      const path = routeFamilyPaths(family, geometry.anchors)
        .find((branch) => picoEndpointKey(branch.endpoint) === selected.endpoint);
      const left = path?.points[selected.segmentIndex]; const right = path?.points[selected.segmentIndex + 1];
      const orientation = left && right ? routeSegmentOrientation(left, right) : null;
      if (!orientation) throw new TypeError('ROUTE_SEGMENT');
      const coordinate = orientation === 'horizontal' ? left.y + 0.04 * direction : left.x + 0.04 * direction;
      candidate = moveRouteSegment(family, geometry.anchors, selected.endpoint, selected.segmentIndex, coordinate, net);
    }
  } catch (error) {
    config.status.textContent = `Route edit rejected (${error.message}). The cable and history are unchanged.`;
    return { ok: false, code: error.message };
  }
  const validation = boundedRouteCandidateValid(config, state.draft, net.id, candidate, geometry);
  if (!validation.ok) {
    config.status.textContent = `Route edit rejected (${validation.code}). The cable and history are unchanged.`;
    return validation;
  }
  const result = config.workbench.editCircuit('setWireRoute', net.id, candidate);
  if (result.ok) {
    boundedRouteSelection[key] = { netId: net.id, ...defaultBoundedSegment(candidate, geometry.anchors) };
    config.status.textContent = `${action === 'bend' ? 'Added one orthogonal bend' : 'Moved one eligible segment'} on ${net.id}. Electrical connectivity and firmware authority are unchanged.${validation.crossings ? ` ${validation.crossings} crossing${validation.crossings === 1 ? '' : 's'} remain electrically separate.` : ''}`;
    requestAnimationFrame(config.draw);
  }
  return result;
}

function setBoundedWireColor(key, color) {
  const config = boundedRouteConfig(key);
  const state = config.workbench.snapshot().circuitEditor;
  if (state.selection.kind !== 'net') return { ok: false, code: 'WIRE_SELECTION_REQUIRED' };
  const result = config.workbench.editCircuit('setWireColor', state.selection.id, color);
  config.status.textContent = result.ok
    ? `Changed ${state.selection.id} cable colour only. Connectivity, electrical verdict and firmware authority are unchanged.`
    : `Cable colour rejected (${result.code}).`;
  return result;
}

function cancelBoundedRouteSelection(key) {
  if (!boundedRouteSelection[key]) return false;
  boundedRouteSelection[key] = null;
  const config = boundedRouteConfig(key);
  config.status.textContent = 'Route edit cancelled. The cable, electrical verdict and history are unchanged.';
  requestAnimationFrame(config.draw);
  return true;
}

function drawPicoEditorWires() {
  renderBoundedWireLayer({ key: 'pico', state: () => picoPublicState, workbench: picoPublicWorkbench,
    diagram: elements.picodiagram, components: elements.picoeditorcomponents, svg: elements.picoeditorwires,
    status: elements.picowirestate, draw: drawPicoEditorWires });
  return;
  const canvas = elements.picodiagram.getBoundingClientRect();
  if (!canvas.width || !canvas.height || !picoPublicState?.circuitEditor) return;
  elements.picoeditorwires.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
  const { draft, selection } = picoPublicState.circuitEditor;
  const obstacles = picoEditorObstacles();
  const drawings = [];
  const routed = [];
  for (const net of draft.nets) {
    const anchors = net.endpoints.map((endpoint) => picoEditorAnchor(endpoint));
    if (anchors.some((anchor) => !anchor)) continue;
    const candidate = picoEditorRoute(anchors, canvas, obstacles, routed);
    const lanes = separateParallelWireLanes([...routed, { netId: net.id, points: candidate }], {
      clearance: 8, obstacles, bounds: { left: 8, right: canvas.width - 8, top: 8, bottom: canvas.height - 8 },
    });
    const points = lanes.routes.at(-1).points;
    routed.push({ netId: net.id, points });
    const d = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.classList.add('pico-editor-wire-hit'); hit.dataset.net = net.id; hit.setAttribute('d', d);
    hit.setAttribute('tabindex', '0'); hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', `Select cable ${net.id}: ${net.endpoints.map(picoEndpointKey).join(' to ')}`);
    const select = (event) => { event.preventDefault(); picoPublicWorkbench.selectCircuit({ kind: 'net', id: net.id }); };
    hit.addEventListener('click', select);
    hit.addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key)) select(event); });
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('pico-editor-wire');
    if (selection.kind === 'net' && selection.id === net.id) path.classList.add('selected');
    path.dataset.net = net.id; path.style.setProperty('--wire-color', draft.layout.wireStyles[net.id] ?? '#39dff2');
    path.setAttribute('d', d); path.dataset.points = JSON.stringify(points);
    drawings.push(hit, path);
  }
  elements.picoeditorwires.replaceChildren(...drawings);
}

function picoEditorPosition(event, card, diagram = elements.picodiagram) {
  const canvas = diagram.getBoundingClientRect();
  const box = card.getBoundingClientRect();
  const x = Math.max(box.width / 2 + 12, Math.min(canvas.width - box.width / 2 - 12, event.clientX - canvas.left));
  const y = Math.max(box.height / 2 + 12, Math.min(canvas.height - box.height / 2 - 12, event.clientY - canvas.top));
  return { x: x / canvas.width, y: y / canvas.height };
}

function startPicoEditorDrag(event, componentId, card) {
  if (event.button !== 0) return;
  event.preventDefault();
  picoPublicWorkbench.circuitEditor.select({ kind: 'component', id: componentId });
  picoPublicState = picoPublicWorkbench.snapshot();
  elements.picoeditorcomponents.querySelectorAll('.pico-editor-part').forEach((item) => item.classList.toggle('selected', item === card));
  elements.picocircuitselection.textContent = `Part · ${componentId}`;
  elements.picodelete.disabled = card.dataset.componentType === RP2040_PROFILE;
  elements.picorotate.disabled = false;
  picoEditorDrag = { pointerId: event.pointerId, componentId, card, moved: false, last: null };
  card.classList.add('dragging'); card.setPointerCapture(event.pointerId);
}

function movePicoEditorDrag(event) {
  if (!picoEditorDrag || picoEditorDrag.pointerId !== event.pointerId) return;
  const position = picoEditorPosition(event, picoEditorDrag.card);
  picoEditorDrag.last = position; picoEditorDrag.moved = true;
  picoEditorDrag.card.style.left = `${position.x * 100}%`; picoEditorDrag.card.style.top = `${position.y * 100}%`;
  requestAnimationFrame(drawPicoEditorWires);
}

function finishPicoEditorDrag(event) {
  if (!picoEditorDrag || picoEditorDrag.pointerId !== event.pointerId) return;
  const drag = picoEditorDrag; picoEditorDrag = null;
  try { if (drag.card.hasPointerCapture(event.pointerId)) drag.card.releasePointerCapture(event.pointerId); } catch { /* released */ }
  if (drag.moved && drag.last) picoPublicWorkbench.editCircuit('moveComponent', drag.componentId, drag.last.x, drag.last.y);
  else {
    picoPublicWorkbench.selectCircuit({ kind: 'component', id: drag.componentId });
    elements.picoeditorcomponents.querySelector(`[data-component-id="${drag.componentId}"]`)?.focus({ preventScroll: true });
  }
}

function renderPicoCircuitEditor(state) {
  if (!state?.circuitEditor) return;
  const { draft, selection, wireDraft, canUndo, canRedo, validation } = state.circuitEditor;
  elements.picocircuitselection.textContent = selection.kind === 'none'
    ? 'Nothing selected' : `${selection.kind === 'net' ? 'Cable' : 'Part'} · ${selection.id}`;
  const selectedComponent = selection.kind === 'component'
    ? draft.components.find((component) => component.id === selection.id) : null;
  const responsiveScale = elements.picodiagram.getBoundingClientRect().width <= 430 ? 0.6 : 1;
  picoEditorResponsiveScale = responsiveScale;
  elements.picodelete.disabled = selection.kind === 'none' || selectedComponent?.type === RP2040_PROFILE;
  elements.picorotate.disabled = selection.kind !== 'component';
  elements.picoundo.disabled = !canUndo; elements.picoredo.disabled = !canRedo;
  elements.picoreconnect.disabled = selection.kind !== 'net' || wireDraft.mode !== 'none';
  const picoRouteSelected = selection.kind === 'net' && wireDraft.mode === 'none';
  elements.picoaddbend.disabled = !picoRouteSelected;
  elements.picorouteback.disabled = !picoRouteSelected;
  elements.picorouteforward.disabled = !picoRouteSelected;
  elements.picowirecolor.disabled = !picoRouteSelected;
  if (picoRouteSelected) elements.picowirecolor.value = draft.layout.wireStyles[selection.id] ?? '#39dff2';
  elements.picowirecancel.disabled = wireDraft.mode === 'none';
  elements.picowirestate.textContent = namedWireInstruction(wireDraft);
  elements.picozoomvalue.value = `${Math.round(picoEditorZoom * 100)}%`;
  renderBoundedComponentCatalog({
    state, editCircuit: (...args) => picoPublicWorkbench.editCircuit(...args),
    list: elements.picopartslist, properties: elements.picopartproperties,
  });
  const cards = draft.components.map((component) => {
    const definition = uiComponentCatalog[component.type]; const position = draft.layout.positions[component.id];
    const card = document.createElement('article');
    card.className = `circuit-component pico-editor-part${selection.kind === 'component' && selection.id === component.id ? ' selected' : ''}`;
    card.dataset.componentId = component.id; card.dataset.componentType = component.type;
    card.dataset.rotation = String(position.rotation);
    card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', `Select and move ${component.label}`);
    card.style.left = `${position.x * 100}%`; card.style.top = `${position.y * 100}%`;
    card.style.setProperty('--rotation', `${position.rotation}deg`);
    const partScale = picoEditorZoom * responsiveScale;
    card.style.setProperty('--part-width', `${definition.artwork.cssWidth * partScale}px`);
    card.style.setProperty('--part-height', `${definition.artwork.cssHeight * partScale}px`);
    const artwork = createBaseComponentArtwork(definition, component); card.append(artwork);
    const led = artwork.querySelector('[data-led-id]');
    if (led) {
      led.id = 'pico-external-led'; led.classList.toggle('on', Boolean(state.circuitObservation?.on));
      led.setAttribute('aria-label', `External LED is ${state.circuitObservation?.on ? 'on' : 'off'}`);
    }
    const label = document.createElement('span'); label.className = 'pico-editor-part-label'; label.textContent = component.label; card.append(label);
    for (const pin of definition.pins) {
      const anchor = document.createElement('button'); anchor.type = 'button'; anchor.className = 'pin-anchor';
      anchor.dataset.picoEndpoint = `${component.id}.${pin.id}`;
      anchor.dataset.editorEndpoint = `${component.id}.${pin.id}`; anchor.dataset.label = pin.label;
      anchor.title = `${component.id}.${pin.id} · ${pin.label}`; anchor.setAttribute('aria-label', anchor.title);
      anchor.style.setProperty('--pin-x', String(pin.anchor.x)); anchor.style.setProperty('--pin-y', String(pin.anchor.y));
      const pinLabel = document.createElement('span'); pinLabel.className = 'pico-editor-pin-label'; pinLabel.textContent = pin.label; anchor.append(pinLabel);
      decorateNamedWireAnchor(anchor, anchor.dataset.editorEndpoint, state.circuitEditor);
      anchor.addEventListener('pointerdown', (event) => event.stopPropagation());
      anchor.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        activateNamedWireEndpoint(picoPublicWorkbench, elements.picowirestate, { component: component.id, pin: pin.id });
      });
      card.append(anchor);
    }
    card.addEventListener('pointerdown', (event) => startPicoEditorDrag(event, component.id, card));
    card.addEventListener('pointermove', movePicoEditorDrag); card.addEventListener('pointerup', finishPicoEditorDrag);
    card.addEventListener('pointercancel', finishPicoEditorDrag);
    card.addEventListener('keydown', (event) => {
      if (event.target === card && ['Enter', ' '].includes(event.key)) { event.preventDefault(); picoPublicWorkbench.selectCircuit({ kind: 'component', id: component.id }); }
    });
    return card;
  });
  elements.picoeditorcomponents.replaceChildren(...cards);
  elements.picodiagram.dataset.connected = String(validation.ok);
  requestAnimationFrame(() => requestAnimationFrame(drawPicoEditorWires));
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
    serial: elements.picoserial,
  },
  onState: (state) => {
    picoPublicState = state;
    window.__RP2040_PUBLIC_STATE__ = structuredClone(state);
    renderSharedInstrumentSummary(RP2040_PROFILE, state);
    renderPicoQuickControls(state);
    renderPicoCircuitEditor(state);
  },
  onDiagnostics: (snapshot) => renderProfileDiagnostics(snapshot, {
    textarea: elements.picosource, summary: elements.picodiagnostics,
    links: elements.picodiagnosticlinks, current: () => picoPublicWorkbench.snapshot(),
  }),
  onSave: () => saveCommonProject(RP2040_PROFILE),
  onOpen: (file) => openCommonProjectFile(file),
});
window.__RP2040_PUBLIC_WORKBENCH__ = {
  state: () => picoPublicWorkbench.snapshot(),
  build: () => picoPublicWorkbench.build(),
  run: () => picoPublicWorkbench.run(),
  pause: () => picoPublicWorkbench.pause(),
  reset: () => picoPublicWorkbench.reset(),
  stop: () => picoPublicWorkbench.stop(),
  selectCircuit: (selection) => picoPublicWorkbench.selectCircuit(selection),
  deleteSelected: () => picoPublicWorkbench.editCircuit('deleteSelected'),
  undoCircuit: () => picoPublicWorkbench.editCircuit('undo'),
  redoCircuit: () => picoPublicWorkbench.editCircuit('redo'),
  moveCircuitComponent: (id, x, y) => picoPublicWorkbench.editCircuit('moveComponent', id, x, y),
  rotateCircuitComponent: (id) => picoPublicWorkbench.editCircuit('rotateComponent', id),
  activateEndpoint: (endpoint) => picoPublicWorkbench.editCircuit('activateEndpoint', endpoint),
  addMissingComponent: (type) => picoPublicWorkbench.editCircuit('addMissingComponent', type),
  setComponentProperty: (id, key, value) => picoPublicWorkbench.editCircuit('setComponentProperty', id, key, value),
  beginReconnect: () => picoPublicWorkbench.editCircuit('beginReconnect'),
  cancelWire: () => picoPublicWorkbench.editCircuit('cancelWireDraft'),
  addWireBend: () => editBoundedRoute('pico', 'bend'),
  nudgeWireSegment: (direction) => editBoundedRoute('pico', 'move', direction),
  setWireColor: (color) => setBoundedWireColor('pico', color),
  setWireRoute: (netId, route) => picoPublicWorkbench.editCircuit('setWireRoute', netId, route),
};
renderProfileExampleCards(RP2040_PROFILE, elements.picoprofileexamples, picoPublicWorkbench);
elements.picodelete.addEventListener('click', () => picoPublicWorkbench.editCircuit('deleteSelected'));
elements.picoundo.addEventListener('click', () => picoPublicWorkbench.editCircuit('undo'));
elements.picoredo.addEventListener('click', () => picoPublicWorkbench.editCircuit('redo'));
elements.picorotate.addEventListener('click', () => {
  const selection = picoPublicWorkbench.snapshot().circuitEditor.selection;
  if (selection.kind === 'component') picoPublicWorkbench.editCircuit('rotateComponent', selection.id);
});
elements.picoreconnect.addEventListener('click', () => beginNamedWireReconnect(picoPublicWorkbench, elements.picowirestate));
elements.picoaddbend.addEventListener('click', () => editBoundedRoute('pico', 'bend'));
elements.picorouteback.addEventListener('click', () => editBoundedRoute('pico', 'move', -1));
elements.picorouteforward.addEventListener('click', () => editBoundedRoute('pico', 'move', 1));
elements.picowirecolor.addEventListener('change', () => setBoundedWireColor('pico', elements.picowirecolor.value));
elements.picowirecancel.addEventListener('click', () => cancelNamedWire(picoPublicWorkbench, elements.picowirestate));
elements.picolegacycopy.addEventListener('click', () => saveLegacyProject(RP2040_PROFILE));
function setPicoEditorZoom(next) {
  picoEditorZoom = Math.max(0.7, Math.min(1.25, Math.round(next * 20) / 20));
  renderPicoCircuitEditor(picoPublicWorkbench.snapshot());
}
elements.picozoomout.addEventListener('click', () => setPicoEditorZoom(picoEditorZoom - 0.1));
elements.picozoomin.addEventListener('click', () => setPicoEditorZoom(picoEditorZoom + 0.1));
elements.picofit.addEventListener('click', () => setPicoEditorZoom(1));
new ResizeObserver(() => requestAnimationFrame(() => {
  const nextScale = elements.picodiagram.getBoundingClientRect().width <= 430 ? 0.6 : 1;
  if (nextScale !== picoEditorResponsiveScale) renderPicoCircuitEditor(picoPublicWorkbench.snapshot());
  else requestAnimationFrame(drawPicoEditorWires);
})).observe(elements.picodiagram);
document.addEventListener('keydown', (event) => {
  if (selectedCompilerProfile !== RP2040_PROFILE || elements.picopublicworkbench.hidden || isTextEditingTarget(event.target)) return;
  const snapshot = picoPublicWorkbench.snapshot().circuitEditor;
  if (event.key === 'Escape' && snapshot.wireDraft.mode !== 'none') {
    event.preventDefault(); event.stopImmediatePropagation(); cancelNamedWire(picoPublicWorkbench, elements.picowirestate); return;
  }
  if (event.key === 'Escape' && cancelBoundedRouteSelection('pico')) {
    event.preventDefault(); event.stopImmediatePropagation(); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); event.stopImmediatePropagation();
    picoPublicWorkbench.editCircuit(event.shiftKey ? 'redo' : 'undo'); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault(); event.stopImmediatePropagation(); picoPublicWorkbench.editCircuit('redo'); return;
  }
  if (['Delete', 'Backspace'].includes(event.key)) {
    event.preventDefault(); event.stopImmediatePropagation(); picoPublicWorkbench.editCircuit('deleteSelected'); return;
  }
  if (snapshot.selection.kind !== 'component') return;
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault(); event.stopImmediatePropagation();
    picoPublicWorkbench.editCircuit('rotateComponent', snapshot.selection.id); return;
  }
  const distance = event.shiftKey ? 0.05 : 0.015;
  const delta = { ArrowLeft: [-distance, 0], ArrowRight: [distance, 0], ArrowUp: [0, -distance], ArrowDown: [0, distance] }[event.key];
  if (!delta) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const position = snapshot.draft.layout.positions[snapshot.selection.id];
  picoPublicWorkbench.editCircuit('moveComponent', snapshot.selection.id, position.x + delta[0], position.y + delta[1]);
});

let c3EditorZoom = 1;
let c3EditorDrag = null;
let c3EditorResponsiveScale = null;

function drawC3EditorWires() {
  renderBoundedWireLayer({ key: 'c3', state: () => c3PublicState, workbench: c3PublicWorkbench,
    diagram: elements.c3diagram, components: elements.c3editorcomponents, svg: elements.c3editorwires,
    status: elements.c3wirestate, draw: drawC3EditorWires });
  return;
  const canvas = elements.c3diagram.getBoundingClientRect();
  if (!canvas.width || !canvas.height || !c3PublicState?.circuitEditor) return;
  elements.c3editorwires.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
  const { draft, selection } = c3PublicState.circuitEditor;
  const obstacles = picoEditorObstacles(elements.c3diagram, elements.c3editorcomponents);
  const drawings = [];
  const routed = [];
  for (const net of draft.nets) {
    const anchors = net.endpoints.map((endpoint) => picoEditorAnchor(endpoint, elements.c3diagram, elements.c3editorcomponents));
    if (anchors.some((anchor) => !anchor)) continue;
    const candidate = picoEditorRoute(anchors, canvas, obstacles, routed);
    const lanes = separateParallelWireLanes([...routed, { netId: net.id, points: candidate }], {
      clearance: 8, obstacles, bounds: { left: 8, right: canvas.width - 8, top: 8, bottom: canvas.height - 8 },
    });
    const points = lanes.routes.at(-1).points;
    routed.push({ netId: net.id, points });
    const d = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.classList.add('pico-editor-wire-hit'); hit.dataset.net = net.id; hit.setAttribute('d', d);
    hit.setAttribute('tabindex', '0'); hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', `Select cable ${net.id}: ${net.endpoints.map(picoEndpointKey).join(' to ')}`);
    const select = (event) => { event.preventDefault(); c3PublicWorkbench.selectCircuit({ kind: 'net', id: net.id }); };
    hit.addEventListener('click', select);
    hit.addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key)) select(event); });
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('pico-editor-wire');
    if (selection.kind === 'net' && selection.id === net.id) path.classList.add('selected');
    path.dataset.net = net.id; path.style.setProperty('--wire-color', draft.layout.wireStyles[net.id] ?? '#39dff2');
    path.setAttribute('d', d); path.dataset.points = JSON.stringify(points);
    drawings.push(hit, path);
  }
  elements.c3editorwires.replaceChildren(...drawings);
}

function startC3EditorDrag(event, componentId, card) {
  if (event.button !== 0) return;
  event.preventDefault();
  c3PublicWorkbench.circuitEditor.select({ kind: 'component', id: componentId });
  c3PublicState = c3PublicWorkbench.snapshot();
  elements.c3editorcomponents.querySelectorAll('.pico-editor-part').forEach((item) => item.classList.toggle('selected', item === card));
  elements.c3circuitselection.textContent = `Part · ${componentId}`;
  elements.c3delete.disabled = card.dataset.componentType === ESP32C3_PROFILE;
  elements.c3rotate.disabled = false;
  c3EditorDrag = { pointerId: event.pointerId, componentId, card, moved: false, last: null };
  card.classList.add('dragging'); card.setPointerCapture(event.pointerId);
}

function moveC3EditorDrag(event) {
  if (!c3EditorDrag || c3EditorDrag.pointerId !== event.pointerId) return;
  const position = picoEditorPosition(event, c3EditorDrag.card, elements.c3diagram);
  c3EditorDrag.last = position; c3EditorDrag.moved = true;
  c3EditorDrag.card.style.left = `${position.x * 100}%`; c3EditorDrag.card.style.top = `${position.y * 100}%`;
  requestAnimationFrame(drawC3EditorWires);
}

function finishC3EditorDrag(event) {
  if (!c3EditorDrag || c3EditorDrag.pointerId !== event.pointerId) return;
  const drag = c3EditorDrag; c3EditorDrag = null;
  try { if (drag.card.hasPointerCapture(event.pointerId)) drag.card.releasePointerCapture(event.pointerId); } catch { /* released */ }
  if (drag.moved && drag.last) c3PublicWorkbench.editCircuit('moveComponent', drag.componentId, drag.last.x, drag.last.y);
  else {
    c3PublicWorkbench.selectCircuit({ kind: 'component', id: drag.componentId });
    elements.c3editorcomponents.querySelector(`[data-component-id="${drag.componentId}"]`)?.focus({ preventScroll: true });
  }
}

function renderC3CircuitEditor(state) {
  if (!state?.circuitEditor) return;
  const { draft, selection, wireDraft, canUndo, canRedo, validation } = state.circuitEditor;
  elements.c3circuitselection.textContent = selection.kind === 'none'
    ? 'Nothing selected' : `${selection.kind === 'net' ? 'Cable' : 'Part'} · ${selection.id}`;
  const selectedComponent = selection.kind === 'component'
    ? draft.components.find((component) => component.id === selection.id) : null;
  const responsiveScale = elements.c3diagram.getBoundingClientRect().width <= 430 ? 0.6 : 1;
  c3EditorResponsiveScale = responsiveScale;
  elements.c3delete.disabled = selection.kind === 'none' || selectedComponent?.type === ESP32C3_PROFILE;
  elements.c3rotate.disabled = selection.kind !== 'component';
  elements.c3undo.disabled = !canUndo; elements.c3redo.disabled = !canRedo;
  elements.c3reconnect.disabled = selection.kind !== 'net' || wireDraft.mode !== 'none';
  const c3RouteSelected = selection.kind === 'net' && wireDraft.mode === 'none';
  elements.c3addbend.disabled = !c3RouteSelected;
  elements.c3routeback.disabled = !c3RouteSelected;
  elements.c3routeforward.disabled = !c3RouteSelected;
  elements.c3wirecolor.disabled = !c3RouteSelected;
  if (c3RouteSelected) elements.c3wirecolor.value = draft.layout.wireStyles[selection.id] ?? '#39dff2';
  elements.c3wirecancel.disabled = wireDraft.mode === 'none';
  elements.c3wirestate.textContent = namedWireInstruction(wireDraft);
  elements.c3zoomvalue.value = `${Math.round(c3EditorZoom * 100)}%`;
  renderBoundedComponentCatalog({
    state, editCircuit: (...args) => c3PublicWorkbench.editCircuit(...args),
    list: elements.c3partslist, properties: elements.c3partproperties,
  });
  const modeledLed = Boolean(state.circuitAccepted && state.runtime?.modeledCircuit?.epochs?.at(-1)?.led?.on);
  const cards = draft.components.map((component) => {
    const definition = uiComponentCatalog[component.type]; const position = draft.layout.positions[component.id];
    const card = document.createElement('article');
    card.className = `circuit-component pico-editor-part${selection.kind === 'component' && selection.id === component.id ? ' selected' : ''}`;
    card.dataset.componentId = component.id; card.dataset.componentType = component.type;
    card.dataset.rotation = String(position.rotation);
    card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', `Select and move ${component.label}`);
    card.style.left = `${position.x * 100}%`; card.style.top = `${position.y * 100}%`;
    card.style.setProperty('--rotation', `${position.rotation}deg`);
    card.style.setProperty('--part-width', `${definition.artwork.cssWidth * c3EditorZoom * responsiveScale}px`);
    card.style.setProperty('--part-height', `${definition.artwork.cssHeight * c3EditorZoom * responsiveScale}px`);
    const artwork = createBaseComponentArtwork(definition, component); card.append(artwork);
    const led = artwork.querySelector('[data-led-id]');
    if (led) {
      led.id = 'c3-external-led'; led.classList.toggle('on', modeledLed);
      led.setAttribute('aria-label', `Modeled external LED is ${modeledLed ? 'on' : 'off'}`);
    }
    const label = document.createElement('span'); label.className = 'pico-editor-part-label'; label.textContent = component.label; card.append(label);
    for (const pin of definition.pins) {
      const anchor = document.createElement('button'); anchor.type = 'button'; anchor.className = 'pin-anchor';
      anchor.dataset.c3Endpoint = `${component.id}.${pin.id}`;
      anchor.dataset.editorEndpoint = `${component.id}.${pin.id}`; anchor.dataset.label = pin.label;
      anchor.title = `${component.id}.${pin.id} · ${pin.label}`; anchor.setAttribute('aria-label', anchor.title);
      anchor.style.setProperty('--pin-x', String(pin.anchor.x)); anchor.style.setProperty('--pin-y', String(pin.anchor.y));
      const pinLabel = document.createElement('span'); pinLabel.className = 'pico-editor-pin-label'; pinLabel.textContent = pin.label; anchor.append(pinLabel);
      decorateNamedWireAnchor(anchor, anchor.dataset.editorEndpoint, state.circuitEditor);
      anchor.addEventListener('pointerdown', (event) => event.stopPropagation());
      anchor.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        activateNamedWireEndpoint(c3PublicWorkbench, elements.c3wirestate, { component: component.id, pin: pin.id });
      });
      card.append(anchor);
    }
    card.addEventListener('pointerdown', (event) => startC3EditorDrag(event, component.id, card));
    card.addEventListener('pointermove', moveC3EditorDrag); card.addEventListener('pointerup', finishC3EditorDrag);
    card.addEventListener('pointercancel', finishC3EditorDrag);
    card.addEventListener('keydown', (event) => {
      if (event.target === card && ['Enter', ' '].includes(event.key)) { event.preventDefault(); c3PublicWorkbench.selectCircuit({ kind: 'component', id: component.id }); }
    });
    return card;
  });
  elements.c3editorcomponents.replaceChildren(...cards);
  elements.c3diagram.dataset.connected = String(validation.ok);
  requestAnimationFrame(() => requestAnimationFrame(drawC3EditorWires));
}

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
    terminal: elements.c3terminal,
  },
  onState: (state) => {
    c3PublicState = state;
    window.__ESP32C3_PUBLIC_STATE__ = structuredClone(state);
    renderSharedInstrumentSummary(ESP32C3_PROFILE, state);
    renderC3QuickControls(state);
    renderC3CircuitEditor(state);
  },
  onDiagnostics: (snapshot) => renderProfileDiagnostics(snapshot, {
    textarea: elements.c3source, summary: elements.c3diagnostics,
    links: elements.c3diagnosticlinks, current: () => c3PublicWorkbench.snapshot(),
  }),
  onSave: () => saveCommonProject(ESP32C3_PROFILE),
  onOpen: (file) => openCommonProjectFile(file),
});
window.__ESP32C3_PUBLIC_WORKBENCH__ = {
  state: () => c3PublicWorkbench.snapshot(),
  build: () => c3PublicWorkbench.build(),
  run: () => c3PublicWorkbench.run(),
  dispose: () => c3PublicWorkbench.dispose(),
  selectCircuit: (selection) => c3PublicWorkbench.selectCircuit(selection),
  deleteSelected: () => c3PublicWorkbench.editCircuit('deleteSelected'),
  undoCircuit: () => c3PublicWorkbench.editCircuit('undo'),
  redoCircuit: () => c3PublicWorkbench.editCircuit('redo'),
  moveCircuitComponent: (id, x, y) => c3PublicWorkbench.editCircuit('moveComponent', id, x, y),
  rotateCircuitComponent: (id) => c3PublicWorkbench.editCircuit('rotateComponent', id),
  activateEndpoint: (endpoint) => c3PublicWorkbench.editCircuit('activateEndpoint', endpoint),
  addMissingComponent: (type) => c3PublicWorkbench.editCircuit('addMissingComponent', type),
  setComponentProperty: (id, key, value) => c3PublicWorkbench.editCircuit('setComponentProperty', id, key, value),
  beginReconnect: () => c3PublicWorkbench.editCircuit('beginReconnect'),
  cancelWire: () => c3PublicWorkbench.editCircuit('cancelWireDraft'),
  addWireBend: () => editBoundedRoute('c3', 'bend'),
  nudgeWireSegment: (direction) => editBoundedRoute('c3', 'move', direction),
  setWireColor: (color) => setBoundedWireColor('c3', color),
  setWireRoute: (netId, route) => c3PublicWorkbench.editCircuit('setWireRoute', netId, route),
};
renderProfileExampleCards(ESP32C3_PROFILE, elements.c3profileexamples, c3PublicWorkbench);
elements.c3delete.addEventListener('click', () => c3PublicWorkbench.editCircuit('deleteSelected'));
elements.c3undo.addEventListener('click', () => c3PublicWorkbench.editCircuit('undo'));
elements.c3redo.addEventListener('click', () => c3PublicWorkbench.editCircuit('redo'));
elements.c3rotate.addEventListener('click', () => {
  const selection = c3PublicWorkbench.snapshot().circuitEditor.selection;
  if (selection.kind === 'component') c3PublicWorkbench.editCircuit('rotateComponent', selection.id);
});
elements.c3reconnect.addEventListener('click', () => beginNamedWireReconnect(c3PublicWorkbench, elements.c3wirestate));
elements.c3addbend.addEventListener('click', () => editBoundedRoute('c3', 'bend'));
elements.c3routeback.addEventListener('click', () => editBoundedRoute('c3', 'move', -1));
elements.c3routeforward.addEventListener('click', () => editBoundedRoute('c3', 'move', 1));
elements.c3wirecolor.addEventListener('change', () => setBoundedWireColor('c3', elements.c3wirecolor.value));
elements.c3wirecancel.addEventListener('click', () => cancelNamedWire(c3PublicWorkbench, elements.c3wirestate));
elements.c3legacycopy.addEventListener('click', () => saveLegacyProject(ESP32C3_PROFILE));
function setC3EditorZoom(next) {
  c3EditorZoom = Math.max(0.7, Math.min(1.25, Math.round(next * 20) / 20));
  renderC3CircuitEditor(c3PublicWorkbench.snapshot());
}
elements.c3zoomout.addEventListener('click', () => setC3EditorZoom(c3EditorZoom - 0.1));
elements.c3zoomin.addEventListener('click', () => setC3EditorZoom(c3EditorZoom + 0.1));
elements.c3fit.addEventListener('click', () => setC3EditorZoom(1));
new ResizeObserver(() => requestAnimationFrame(() => {
  const nextScale = elements.c3diagram.getBoundingClientRect().width <= 430 ? 0.6 : 1;
  if (nextScale !== c3EditorResponsiveScale) renderC3CircuitEditor(c3PublicWorkbench.snapshot());
  else requestAnimationFrame(drawC3EditorWires);
})).observe(elements.c3diagram);
document.addEventListener('keydown', (event) => {
  if (selectedCompilerProfile !== ESP32C3_PROFILE || elements.c3publicworkbench.hidden || isTextEditingTarget(event.target)) return;
  const snapshot = c3PublicWorkbench.snapshot().circuitEditor;
  if (event.key === 'Escape' && snapshot.wireDraft.mode !== 'none') {
    event.preventDefault(); event.stopImmediatePropagation(); cancelNamedWire(c3PublicWorkbench, elements.c3wirestate); return;
  }
  if (event.key === 'Escape' && cancelBoundedRouteSelection('c3')) {
    event.preventDefault(); event.stopImmediatePropagation(); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); event.stopImmediatePropagation();
    c3PublicWorkbench.editCircuit(event.shiftKey ? 'redo' : 'undo'); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault(); event.stopImmediatePropagation(); c3PublicWorkbench.editCircuit('redo'); return;
  }
  if (['Delete', 'Backspace'].includes(event.key)) {
    event.preventDefault(); event.stopImmediatePropagation(); c3PublicWorkbench.editCircuit('deleteSelected'); return;
  }
  if (snapshot.selection.kind !== 'component') return;
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault(); event.stopImmediatePropagation();
    c3PublicWorkbench.editCircuit('rotateComponent', snapshot.selection.id); return;
  }
  const distance = event.shiftKey ? 0.05 : 0.015;
  const delta = { ArrowLeft: [-distance, 0], ArrowRight: [distance, 0], ArrowUp: [0, -distance], ArrowDown: [0, distance] }[event.key];
  if (!delta) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const position = snapshot.draft.layout.positions[snapshot.selection.id];
  c3PublicWorkbench.editCircuit('moveComponent', snapshot.selection.id, position.x + delta[0], position.y + delta[1]);
});

let stm32EditorZoom = 1;
let stm32EditorDrag = null;
let stm32EditorResponsiveScale = null;

function drawStm32EditorWires() {
  renderBoundedWireLayer({ key: 'stm32', state: () => stm32PublicState, workbench: stm32PublicWorkbench,
    diagram: elements.stm32diagram, components: elements.stm32editorcomponents, svg: elements.stm32editorwires,
    status: elements.stm32wirestate, draw: drawStm32EditorWires });
  return;
  const canvas = elements.stm32diagram.getBoundingClientRect();
  if (!canvas.width || !canvas.height || !stm32PublicState?.circuitEditor) return;
  elements.stm32editorwires.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
  const { draft, selection } = stm32PublicState.circuitEditor;
  const obstacles = picoEditorObstacles(elements.stm32diagram, elements.stm32editorcomponents);
  const drawings = [];
  const routed = [];
  for (const net of draft.nets) {
    const anchors = net.endpoints.map((endpoint) => picoEditorAnchor(
      endpoint, elements.stm32diagram, elements.stm32editorcomponents,
    ));
    if (anchors.some((anchor) => !anchor)) continue;
    const candidate = picoEditorRoute(anchors, canvas, obstacles, routed);
    const lanes = separateParallelWireLanes([...routed, { netId: net.id, points: candidate }], {
      clearance: 8, obstacles, bounds: { left: 8, right: canvas.width - 8, top: 8, bottom: canvas.height - 8 },
    });
    const points = lanes.routes.at(-1).points;
    routed.push({ netId: net.id, points });
    const d = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.classList.add('pico-editor-wire-hit'); hit.dataset.net = net.id; hit.setAttribute('d', d);
    hit.setAttribute('tabindex', '0'); hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', `Select cable ${net.id}: ${net.endpoints.map(picoEndpointKey).join(' to ')}`);
    const select = (event) => { event.preventDefault(); stm32PublicWorkbench.selectCircuit({ kind: 'net', id: net.id }); };
    hit.addEventListener('click', select);
    hit.addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key)) select(event); });
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('pico-editor-wire');
    if (selection.kind === 'net' && selection.id === net.id) path.classList.add('selected');
    path.dataset.net = net.id; path.style.setProperty('--wire-color', draft.layout.wireStyles[net.id] ?? '#39dff2');
    path.setAttribute('d', d); path.dataset.points = JSON.stringify(points);
    drawings.push(hit, path);
  }
  elements.stm32editorwires.replaceChildren(...drawings);
}

function startStm32EditorDrag(event, componentId, card) {
  if (event.button !== 0) return;
  event.preventDefault();
  stm32PublicWorkbench.circuitEditor.select({ kind: 'component', id: componentId });
  stm32PublicState = stm32PublicWorkbench.snapshot();
  elements.stm32editorcomponents.querySelectorAll('.pico-editor-part').forEach((item) => item.classList.toggle('selected', item === card));
  elements.stm32circuitselection.textContent = `Part · ${componentId}`;
  elements.stm32delete.disabled = card.dataset.componentType === STM32F429ZI_PROFILE;
  elements.stm32rotate.disabled = false;
  stm32EditorDrag = { pointerId: event.pointerId, componentId, card, moved: false, last: null };
  card.classList.add('dragging'); card.setPointerCapture(event.pointerId);
}

function moveStm32EditorDrag(event) {
  if (!stm32EditorDrag || stm32EditorDrag.pointerId !== event.pointerId) return;
  const position = picoEditorPosition(event, stm32EditorDrag.card, elements.stm32diagram);
  stm32EditorDrag.last = position; stm32EditorDrag.moved = true;
  stm32EditorDrag.card.style.left = `${position.x * 100}%`;
  stm32EditorDrag.card.style.top = `${position.y * 100}%`;
  requestAnimationFrame(drawStm32EditorWires);
}

function finishStm32EditorDrag(event) {
  if (!stm32EditorDrag || stm32EditorDrag.pointerId !== event.pointerId) return;
  const drag = stm32EditorDrag; stm32EditorDrag = null;
  try { if (drag.card.hasPointerCapture(event.pointerId)) drag.card.releasePointerCapture(event.pointerId); } catch { /* released */ }
  if (drag.moved && drag.last) {
    stm32PublicWorkbench.editCircuit('moveComponent', drag.componentId, drag.last.x, drag.last.y);
  } else {
    stm32PublicWorkbench.selectCircuit({ kind: 'component', id: drag.componentId });
    elements.stm32editorcomponents.querySelector(`[data-component-id="${drag.componentId}"]`)?.focus({ preventScroll: true });
  }
}

function renderStm32CircuitEditor(state) {
  if (!state?.circuitEditor) return;
  const { draft, selection, wireDraft, canUndo, canRedo, validation } = state.circuitEditor;
  elements.stm32circuitselection.textContent = selection.kind === 'none'
    ? 'Nothing selected' : `${selection.kind === 'net' ? 'Cable' : 'Part'} · ${selection.id}`;
  const selectedComponent = selection.kind === 'component'
    ? draft.components.find((component) => component.id === selection.id) : null;
  const responsiveScale = elements.stm32diagram.getBoundingClientRect().width <= 430 ? 0.6 : 1;
  stm32EditorResponsiveScale = responsiveScale;
  elements.stm32delete.disabled = selection.kind === 'none' || selectedComponent?.type === STM32F429ZI_PROFILE;
  elements.stm32rotate.disabled = selection.kind !== 'component';
  elements.stm32undo.disabled = !canUndo; elements.stm32redo.disabled = !canRedo;
  elements.stm32reconnect.disabled = selection.kind !== 'net' || wireDraft.mode !== 'none';
  const stm32RouteSelected = selection.kind === 'net' && wireDraft.mode === 'none';
  elements.stm32addbend.disabled = !stm32RouteSelected;
  elements.stm32routeback.disabled = !stm32RouteSelected;
  elements.stm32routeforward.disabled = !stm32RouteSelected;
  elements.stm32wirecolor.disabled = !stm32RouteSelected;
  if (stm32RouteSelected) elements.stm32wirecolor.value = draft.layout.wireStyles[selection.id] ?? '#39dff2';
  elements.stm32wirecancel.disabled = wireDraft.mode === 'none';
  elements.stm32wirestate.textContent = namedWireInstruction(wireDraft);
  elements.stm32zoomvalue.value = `${Math.round(stm32EditorZoom * 100)}%`;
  renderBoundedComponentCatalog({
    state, editCircuit: (...args) => stm32PublicWorkbench.editCircuit(...args),
    list: elements.stm32partslist, properties: elements.stm32partproperties,
  });
  const observedLed = Boolean(state.circuitAccepted && state.runtime?.observed?.pb0);
  const cards = draft.components.map((component) => {
    const definition = uiComponentCatalog[component.type]; const position = draft.layout.positions[component.id];
    const card = document.createElement('article');
    card.className = `circuit-component pico-editor-part${selection.kind === 'component' && selection.id === component.id ? ' selected' : ''}`;
    card.dataset.componentId = component.id; card.dataset.componentType = component.type;
    card.dataset.rotation = String(position.rotation);
    card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', `Select and move ${component.label}`);
    card.style.left = `${position.x * 100}%`; card.style.top = `${position.y * 100}%`;
    card.style.setProperty('--rotation', `${position.rotation}deg`);
    card.style.setProperty('--part-width', `${definition.artwork.cssWidth * stm32EditorZoom * responsiveScale}px`);
    card.style.setProperty('--part-height', `${definition.artwork.cssHeight * stm32EditorZoom * responsiveScale}px`);
    const artwork = createBaseComponentArtwork(definition, component); card.append(artwork);
    const led = artwork.querySelector('[data-led-id]');
    if (led) {
      led.id = 'stm32-external-led'; led.classList.toggle('on', observedLed);
      led.setAttribute('aria-label', `Ideal teaching LED is ${observedLed ? 'on' : 'off'}`);
    }
    const label = document.createElement('span'); label.className = 'pico-editor-part-label';
    label.textContent = component.label; card.append(label);
    for (const pin of definition.pins) {
      const anchor = document.createElement('button'); anchor.type = 'button'; anchor.className = 'pin-anchor';
      anchor.dataset.stm32Endpoint = `${component.id}.${pin.id}`;
      anchor.dataset.editorEndpoint = `${component.id}.${pin.id}`; anchor.dataset.label = pin.label;
      anchor.title = `${component.id}.${pin.id} · ${pin.label}`; anchor.setAttribute('aria-label', anchor.title);
      anchor.style.setProperty('--pin-x', String(pin.anchor.x)); anchor.style.setProperty('--pin-y', String(pin.anchor.y));
      const pinLabel = document.createElement('span'); pinLabel.className = 'pico-editor-pin-label';
      pinLabel.textContent = pin.label; anchor.append(pinLabel);
      decorateNamedWireAnchor(anchor, anchor.dataset.editorEndpoint, state.circuitEditor);
      anchor.addEventListener('pointerdown', (event) => event.stopPropagation());
      anchor.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        activateNamedWireEndpoint(stm32PublicWorkbench, elements.stm32wirestate, { component: component.id, pin: pin.id });
      });
      card.append(anchor);
    }
    card.addEventListener('pointerdown', (event) => startStm32EditorDrag(event, component.id, card));
    card.addEventListener('pointermove', moveStm32EditorDrag);
    card.addEventListener('pointerup', finishStm32EditorDrag);
    card.addEventListener('pointercancel', finishStm32EditorDrag);
    card.addEventListener('keydown', (event) => {
      if (event.target === card && ['Enter', ' '].includes(event.key)) {
        event.preventDefault(); stm32PublicWorkbench.selectCircuit({ kind: 'component', id: component.id });
      }
    });
    return card;
  });
  elements.stm32editorcomponents.replaceChildren(...cards);
  elements.stm32diagram.dataset.connected = String(validation.ok);
  requestAnimationFrame(() => requestAnimationFrame(drawStm32EditorWires));
}

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
    renderSharedInstrumentSummary(STM32F429ZI_PROFILE, state);
    renderStm32QuickControls(state);
    renderStm32CircuitEditor(state);
  },
  onDiagnostics: (snapshot) => renderProfileDiagnostics(snapshot, {
    textarea: elements.stm32source, summary: elements.stm32diagnostics,
    links: elements.stm32diagnosticlinks, current: () => stm32PublicWorkbench.snapshot(),
  }),
  onSave: () => saveCommonProject(STM32F429ZI_PROFILE),
  onOpen: (file) => openCommonProjectFile(file),
});
window.__STM32_PUBLIC_WORKBENCH__ = {
  state: () => stm32PublicWorkbench.snapshot(),
  build: () => stm32PublicWorkbench.build(),
  run: () => stm32PublicWorkbench.run(false),
  reset: () => stm32PublicWorkbench.run(true),
  stop: () => stm32PublicWorkbench.stop(),
  selectCircuit: (selection) => stm32PublicWorkbench.selectCircuit(selection),
  deleteSelected: () => stm32PublicWorkbench.editCircuit('deleteSelected'),
  undoCircuit: () => stm32PublicWorkbench.editCircuit('undo'),
  redoCircuit: () => stm32PublicWorkbench.editCircuit('redo'),
  moveCircuitComponent: (id, x, y) => stm32PublicWorkbench.editCircuit('moveComponent', id, x, y),
  rotateCircuitComponent: (id) => stm32PublicWorkbench.editCircuit('rotateComponent', id),
  activateEndpoint: (endpoint) => stm32PublicWorkbench.editCircuit('activateEndpoint', endpoint),
  addMissingComponent: (type) => stm32PublicWorkbench.editCircuit('addMissingComponent', type),
  setComponentProperty: (id, key, value) => stm32PublicWorkbench.editCircuit('setComponentProperty', id, key, value),
  beginReconnect: () => stm32PublicWorkbench.editCircuit('beginReconnect'),
  cancelWire: () => stm32PublicWorkbench.editCircuit('cancelWireDraft'),
  addWireBend: () => editBoundedRoute('stm32', 'bend'),
  nudgeWireSegment: (direction) => editBoundedRoute('stm32', 'move', direction),
  setWireColor: (color) => setBoundedWireColor('stm32', color),
  setWireRoute: (netId, route) => stm32PublicWorkbench.editCircuit('setWireRoute', netId, route),
};
renderProfileExampleCards(STM32F429ZI_PROFILE, elements.stm32profileexamples, stm32PublicWorkbench);
elements.stm32delete.addEventListener('click', () => stm32PublicWorkbench.editCircuit('deleteSelected'));
elements.stm32undo.addEventListener('click', () => stm32PublicWorkbench.editCircuit('undo'));
elements.stm32redo.addEventListener('click', () => stm32PublicWorkbench.editCircuit('redo'));
elements.stm32rotate.addEventListener('click', () => {
  const selection = stm32PublicWorkbench.snapshot().circuitEditor.selection;
  if (selection.kind === 'component') stm32PublicWorkbench.editCircuit('rotateComponent', selection.id);
});
elements.stm32reconnect.addEventListener('click', () => beginNamedWireReconnect(stm32PublicWorkbench, elements.stm32wirestate));
elements.stm32addbend.addEventListener('click', () => editBoundedRoute('stm32', 'bend'));
elements.stm32routeback.addEventListener('click', () => editBoundedRoute('stm32', 'move', -1));
elements.stm32routeforward.addEventListener('click', () => editBoundedRoute('stm32', 'move', 1));
elements.stm32wirecolor.addEventListener('change', () => setBoundedWireColor('stm32', elements.stm32wirecolor.value));
elements.stm32wirecancel.addEventListener('click', () => cancelNamedWire(stm32PublicWorkbench, elements.stm32wirestate));
elements.stm32legacycopy.addEventListener('click', () => saveLegacyProject(STM32F429ZI_PROFILE));
function setStm32EditorZoom(next) {
  stm32EditorZoom = Math.max(0.7, Math.min(1.25, Math.round(next * 20) / 20));
  renderStm32CircuitEditor(stm32PublicWorkbench.snapshot());
}
elements.stm32zoomout.addEventListener('click', () => setStm32EditorZoom(stm32EditorZoom - 0.1));
elements.stm32zoomin.addEventListener('click', () => setStm32EditorZoom(stm32EditorZoom + 0.1));
elements.stm32fit.addEventListener('click', () => setStm32EditorZoom(1));
new ResizeObserver(() => requestAnimationFrame(() => {
  const nextScale = elements.stm32diagram.getBoundingClientRect().width <= 430 ? 0.6 : 1;
  if (nextScale !== stm32EditorResponsiveScale) renderStm32CircuitEditor(stm32PublicWorkbench.snapshot());
  else requestAnimationFrame(drawStm32EditorWires);
})).observe(elements.stm32diagram);
document.addEventListener('keydown', (event) => {
  if (selectedCompilerProfile !== STM32F429ZI_PROFILE || elements.stm32publicworkbench.hidden
      || isTextEditingTarget(event.target)) return;
  const snapshot = stm32PublicWorkbench.snapshot().circuitEditor;
  if (event.key === 'Escape' && snapshot.wireDraft.mode !== 'none') {
    event.preventDefault(); event.stopImmediatePropagation(); cancelNamedWire(stm32PublicWorkbench, elements.stm32wirestate); return;
  }
  if (event.key === 'Escape' && cancelBoundedRouteSelection('stm32')) {
    event.preventDefault(); event.stopImmediatePropagation(); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); event.stopImmediatePropagation();
    stm32PublicWorkbench.editCircuit(event.shiftKey ? 'redo' : 'undo'); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault(); event.stopImmediatePropagation(); stm32PublicWorkbench.editCircuit('redo'); return;
  }
  if (['Delete', 'Backspace'].includes(event.key)) {
    event.preventDefault(); event.stopImmediatePropagation(); stm32PublicWorkbench.editCircuit('deleteSelected'); return;
  }
  if (snapshot.selection.kind !== 'component') return;
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault(); event.stopImmediatePropagation();
    stm32PublicWorkbench.editCircuit('rotateComponent', snapshot.selection.id); return;
  }
  const distance = event.shiftKey ? 0.05 : 0.015;
  const delta = { ArrowLeft: [-distance, 0], ArrowRight: [distance, 0], ArrowUp: [0, -distance], ArrowDown: [0, distance] }[event.key];
  if (!delta) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const position = snapshot.draft.layout.positions[snapshot.selection.id];
  stm32PublicWorkbench.editCircuit('moveComponent', snapshot.selection.id, position.x + delta[0], position.y + delta[1]);
});

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
window.__M12_STATE__ = window.__M6_STATE__;
window.__M3_READY__ = true; window.__M4_READY__ = true; window.__M5_READY__ = true; window.__M6_READY__ = true; window.__M7_READY__ = true;
window.__M11_READY__ = true;
window.__M12_READY__ = true;
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
function renderBuildDiagnostics(result, fallback = 'No compiler diagnostics.') {
  latestBuildResult = result ?? null;
  const binding = currentProjectText();
  const grouped = normalizeSourceDiagnostics(
    (result?.diagnostics ?? []).filter((item) => item.severity === 'error' || item.severity === 'warning'),
    { profile: AVR_PROFILE, revision: editor.revision, source: binding, files: currentProject().source.files },
  );
  elements.diagnostics.textContent = grouped.length ? grouped.map((item) => `${item.severity}: ${item.message}`).join('\n') : fallback;
  const buttons = grouped.map((diagnostic) => {
    if (!diagnostic.navigable) {
      const message = document.createElement('p');
      message.className = 'diagnostic-message';
      message.textContent = diagnosticLabel(diagnostic);
      return message;
    }
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${diagnostic.file}:${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ''} · ${diagnostic.severity}`;
    button.addEventListener('click', () => {
      const file = currentProject().source.files.find((item) => item.name === diagnostic.file);
      const unchanged = selectedCompilerProfile === AVR_PROFILE && editor.revision === diagnostic.revision
        && currentProjectText() === diagnostic.source && file;
      const selection = unchanged ? sourceSelection(file.content, diagnostic.line, diagnostic.column) : null;
      if (!selection) {
        button.disabled = true;
        elements.diagnostics.textContent = 'That diagnostic is stale or has no safe source location. Build the current source again.';
        return;
      }
      selectedSourceFile = diagnostic.file;
      renderProject();
      elements.source.focus(); elements.source.setSelectionRange(selection.start, selection.end);
      elements.source.scrollTop = Math.max(0, (diagnostic.line - 4) * 21);
      renderSourceEditor();
    });
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
function thermostatProjectActive() {
  return selectedCompilerProfile === AVR_PROFILE && isThermostatExperimentProject(currentProject());
}
function thermostatRuntimeReady() {
  return thermostatProjectActive()
    && Boolean(worker && lifecycle.runtimeBinding && lifecycle.artifact)
    && ['ready', 'paused'].includes(lifecycle.phase)
    && loadedSourceIdentity === buildInputIdentity();
}
function nextScenarioId() {
  const used = new Set(scenarioTimelineEditor?.timeline.scenarios.map((item) => item.id) ?? []);
  for (let index = 1; index <= 999; index += 1) {
    const id = `USER-SCENARIO-${index}`;
    if (!used.has(id)) return id;
  }
  throw new Error('SCENARIO_ID_LIMIT');
}
function nextScenarioEventId(scenario) {
  const used = new Set(scenario.events.map((item) => item.id));
  for (let index = 1; index <= 999; index += 1) {
    const id = `USER-EVENT-${index}`;
    if (!used.has(id)) return id;
  }
  throw new Error('SCENARIO_EVENT_ID_LIMIT');
}
function authoredScenarioTemplate() {
  const id = nextScenarioId();
  return { id, name: 'New authored case', events: [
    { id: `${id}-TEMP`, atMilliseconds: 0, kind: 'input.temperature-c',
      componentId: 'temperature-sensor-1', valueC: 31 },
    { id: `${id}-BUTTON`, atMilliseconds: 0, kind: 'input.button-pressed',
      componentId: 'enable-button-1', pressed: true },
    { id: `${id}-D13`, atMilliseconds: 160, throughMilliseconds: 350,
      kind: 'expect.pin-level', pin: 'D13', level: false },
  ] };
}
function scenarioControl(label, value, onChange, options = {}) {
  const wrapper = document.createElement('label'); wrapper.textContent = label;
  let control;
  if (options.values) {
    control = document.createElement('select');
    for (const [optionValue, text] of options.values) {
      const option = document.createElement('option'); option.value = optionValue; option.textContent = text;
      control.append(option);
    }
    control.value = String(value);
  } else {
    control = document.createElement('input'); control.type = options.type ?? 'text'; control.value = String(value);
    if (options.min !== undefined) control.min = String(options.min);
    if (options.max !== undefined) control.max = String(options.max);
    if (options.step !== undefined) control.step = String(options.step);
  }
  if (options.focusId) control.dataset.scenarioFocus = options.focusId;
  control.setAttribute('aria-label', options.ariaLabel ?? label);
  control.disabled = Boolean(thermostatExperimentRun);
  control.addEventListener('change', () => onChange(control.value, control));
  wrapper.append(control); return wrapper;
}
function applyScenarioTimelineCommand(command, { focusId = null } = {}) {
  if (!scenarioTimelineEditor) scenarioTimelineEditor = new ScenarioTimelineEditor(defaultThermostatScenarioTimeline());
  const result = scenarioTimelineEditor.dispatch(command);
  if (!result.ok) {
    const location = result.details?.length ? ` Location: ${result.details.join(', ')}.` : '';
    elements.scenarioeditormessage.textContent = `Timeline edit rejected (${result.code}).${location} The accepted timeline is unchanged.`;
    renderScenarioTimelineEditor();
    if (focusId) requestAnimationFrame(() => elements.scenariolist.querySelector(
      `[data-scenario-focus="${CSS.escape(focusId)}"]`,
    )?.focus());
    return result;
  }
  authoredScenarioResults = [];
  persistProject();
  elements.scenarioeditormessage.textContent = 'Timeline updated as data only. Prior authored results were cleared; the matching firmware artifact remains available.';
  renderScenarioTimelineEditor();
  renderThermostatExperimentPanel();
  if (focusId) requestAnimationFrame(() => elements.scenariolist.querySelector(
    `[data-scenario-focus="${CSS.escape(focusId)}"]`,
  )?.focus());
  return result;
}
function renderScenarioTimelineEditor() {
  const active = thermostatProjectActive();
  elements.scenarioeditor.hidden = !active;
  if (!active) return;
  const timeline = scenarioTimelineEditor?.timeline ?? null;
  const running = Boolean(thermostatExperimentRun);
  elements.scenarioadd.disabled = running;
  elements.scenarioundo.disabled = running || !scenarioTimelineEditor?.undoStack.length;
  elements.scenarioredo.disabled = running || !scenarioTimelineEditor?.redoStack.length;
  elements.scenariorun.disabled = running || !timeline || !thermostatRuntimeReady()
    || thermostatFirmwareVariant(currentProject()) === 'modified';
  elements.scenarioadd.textContent = timeline ? 'Add scenario' : 'Create editable timeline';
  if (!timeline) {
    const empty = document.createElement('p'); empty.className = 'scenario-empty';
    empty.textContent = 'This older project has no authored timeline. Create one from the reviewed boundary cases; firmware is unchanged.';
    elements.scenariolist.replaceChildren(empty); return;
  }
  const cards = timeline.scenarios.map((scenario, scenarioIndex) => {
    const card = document.createElement('article'); card.className = 'scenario-card'; card.dataset.scenarioId = scenario.id;
    const heading = document.createElement('div'); heading.className = 'scenario-card-heading';
    const nameFocus = `${scenario.id}-name`;
    const title = scenarioControl(`Scenario ${scenarioIndex + 1}`, scenario.name, (name) => {
      applyScenarioTimelineCommand({ type: 'scenario.rename', scenarioId: scenario.id, name }, { focusId: nameFocus });
    }, { focusId: nameFocus, ariaLabel: `Scenario ${scenarioIndex + 1} name` });
    const removeScenario = document.createElement('button'); removeScenario.type = 'button'; removeScenario.textContent = 'Delete scenario';
    removeScenario.disabled = running || timeline.scenarios.length === 1;
    removeScenario.addEventListener('click', () => applyScenarioTimelineCommand({ type: 'scenario.delete', scenarioId: scenario.id }));
    heading.append(title, removeScenario); card.append(heading);
    const events = document.createElement('ol'); events.className = 'scenario-events';
    for (const event of scenario.events) {
      const item = document.createElement('li'); item.className = `scenario-event ${event.kind.replaceAll('.', '-')}`;
      item.dataset.eventId = event.id;
      const kind = document.createElement('strong');
      kind.textContent = event.kind === 'input.temperature-c' ? 'Temperature input'
        : event.kind === 'input.button-pressed' ? 'Button input' : 'Expected D13 (window)';
      const timeFocus = `${event.id}-time`;
      const time = scenarioControl(event.kind === 'expect.pin-level' ? 'From ms' : 'At ms', event.atMilliseconds, (raw) => {
        applyScenarioTimelineCommand({ type: 'event.update', scenarioId: scenario.id, eventId: event.id,
          event: { ...event, atMilliseconds: Number(raw) } }, { focusId: timeFocus });
      }, { type: 'number', min: event.kind === 'expect.pin-level' ? 160 : 0, max: event.kind === 'expect.pin-level' ? 350 : 300, step: 1,
        focusId: timeFocus, ariaLabel: `${event.id} virtual time in milliseconds` });
      let value;
      const valueFocus = `${event.id}-value`;
      if (event.kind === 'input.temperature-c') value = scenarioControl('Module °C', event.valueC, (raw) => {
        applyScenarioTimelineCommand({ type: 'event.update', scenarioId: scenario.id, eventId: event.id,
          event: { ...event, valueC: Number(raw) } }, { focusId: valueFocus });
      }, { type: 'number', min: -50, max: 150, step: 1, focusId: valueFocus,
        ariaLabel: `${event.id} ideal module temperature in degrees Celsius` });
      else if (event.kind === 'input.button-pressed') value = scenarioControl('Contact', event.pressed, (raw) => {
        applyScenarioTimelineCommand({ type: 'event.update', scenarioId: scenario.id, eventId: event.id,
          event: { ...event, pressed: raw === 'true' } }, { focusId: valueFocus });
      }, { values: [['true', 'Pressed · D2 LOW'], ['false', 'Released · D2 HIGH']], focusId: valueFocus,
        ariaLabel: `${event.id} button contact state` });
      else value = scenarioControl('D13 must be', event.level, (raw) => {
        applyScenarioTimelineCommand({ type: 'event.update', scenarioId: scenario.id, eventId: event.id,
          event: { ...event, level: raw === 'true' } }, { focusId: valueFocus });
      }, { values: [['true', 'HIGH'], ['false', 'LOW']], focusId: valueFocus,
        ariaLabel: `${event.id} expected D13 level` });
      let windowEnd = null;
      if (event.kind === 'expect.pin-level') {
        const endFocus = `${event.id}-window-end`;
        windowEnd = scenarioControl('Through ms', event.throughMilliseconds, (raw) => {
          applyScenarioTimelineCommand({ type: 'event.update', scenarioId: scenario.id, eventId: event.id,
            event: { ...event, throughMilliseconds: Number(raw) } }, { focusId: endFocus });
        }, { type: 'number', min: event.atMilliseconds, max: 350, step: 1,
          focusId: endFocus, ariaLabel: `${event.id} observation window end in milliseconds` });
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete event';
      remove.disabled = running;
      remove.addEventListener('click', () => applyScenarioTimelineCommand({ type: 'event.delete',
        scenarioId: scenario.id, eventId: event.id }));
      item.append(kind, time, ...(windowEnd ? [windowEnd] : []), value, remove); events.append(item);
    }
    card.append(events);
    const addInputs = document.createElement('div'); addInputs.className = 'scenario-add-events';
    for (const [kind, label] of [['input.temperature-c', 'Add temperature event'], ['input.button-pressed', 'Add button event']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = running;
      button.addEventListener('click', () => {
        const id = nextScenarioEventId(scenario);
        const usedTimes = new Set(scenario.events.filter((item) => item.kind === kind)
          .map((item) => item.atMilliseconds));
        const atMilliseconds = Array.from({ length: scenario.events.at(-1).atMilliseconds }, (_, index) => index)
          .find((candidate) => !usedTimes.has(candidate));
        if (atMilliseconds === undefined) {
          elements.scenarioeditormessage.textContent = 'Timeline edit rejected (SCENARIO_INPUT_SLOT_LIMIT). No unique input time remains before the observation point.';
          return;
        }
        const event = kind === 'input.temperature-c'
          ? { id, atMilliseconds, kind, componentId: 'temperature-sensor-1', valueC: 31 }
          : { id, atMilliseconds, kind, componentId: 'enable-button-1', pressed: true };
        applyScenarioTimelineCommand({ type: 'event.add', scenarioId: scenario.id, event });
      });
      addInputs.append(button);
    }
    const result = authoredScenarioResults.find((item) => item.scenarioId === scenario.id);
    const evidence = document.createElement('p'); evidence.className = result?.status === 'passed'
      ? 'scenario-result pass' : result?.status === 'failed' ? 'scenario-result fail' : 'scenario-result';
    const observedLevel = result?.observed.level === true ? 'HIGH'
      : result?.observed.level === false ? 'LOW' : 'missing';
    evidence.textContent = result
      ? `${result.status === 'passed' ? 'PASS' : 'FAIL'} · expected D13 ${result.expected.level ? 'HIGH' : 'LOW'} during ${result.expected.observationWindow.startMilliseconds}–${result.expected.observationWindow.endMilliseconds} ms · actually observed D13 ${observedLevel} at ${result.virtualMilliseconds.toFixed(3)} ms · ${result.checks.inputsComplete ? 'timed inputs logged' : 'input evidence missing'}`
      : 'Not run · no observed result';
    card.append(addInputs, evidence); return card;
  });
  elements.scenariolist.replaceChildren(...cards);
}
function thermostatKnownBadCaught() {
  if (thermostatExperimentResults.length !== THERMOSTAT_SCENARIOS.scenarios.length) return false;
  return thermostatExperimentResults.every((result) => (
    result.scenarioId === 'THERM-SCENARIO-EQUALITY-ENABLED'
      ? result.status === 'failed'
        && !result.checks.primaryExecutedPin
        && !result.checks.corroboratingSerial
      : result.status === 'passed'
  ));
}
function thermostatPublishedState() {
  return {
    experimentId: THERMOSTAT_EXPERIMENT_ID,
    active: thermostatProjectActive(),
    variant: thermostatProjectActive() ? thermostatFirmwareVariant(currentProject()) : null,
    running: Boolean(thermostatExperimentRun),
    phase: thermostatExperimentRun?.phase ?? 'idle',
    scenarioIndex: thermostatExperimentRun?.scenarioIndex ?? null,
    results: structuredClone(thermostatExperimentResults),
    authoredTimeline: scenarioTimelineEditor?.timeline ?? null,
    authoredResults: structuredClone(authoredScenarioResults),
    knownBadCaught: thermostatKnownBadCaught(),
    freshBuildReady: thermostatRuntimeReady(),
  };
}
function renderThermostatExperimentPanel() {
  const active = thermostatProjectActive();
  elements.thermostatexperiment.hidden = !active;
  if (!active) {
    renderScenarioTimelineEditor();
    publish({ thermostatExperiment: thermostatPublishedState() });
    return;
  }
  const variant = thermostatFirmwareVariant(currentProject());
  const freshBuildReady = thermostatRuntimeReady();
  const runActive = Boolean(thermostatExperimentRun);
  elements.thermostatruntests.disabled = !freshBuildReady || runActive || variant === 'modified';
  elements.thermostatloadbad.disabled = runActive || variant === 'known-bad-equality';
  elements.thermostatrestore.disabled = runActive || variant === 'correct';
  if (runActive) {
    for (const control of runtimeControls) control.disabled = true;
    elements.quickrun.disabled = true;
    elements.quickpause.disabled = true;
    elements.quickreset.disabled = true;
  }
  renderScenarioTimelineEditor();

  for (const [index, scenario] of THERMOSTAT_SCENARIOS.scenarios.entries()) {
    const row = elements.thermostatresults.querySelector(`[data-scenario="${scenario.id}"]`);
    if (!row) continue;
    const evidence = row.children[3];
    const verdict = row.children[4];
    const result = thermostatExperimentResults.find((item) => item.scenarioId === scenario.id);
    const current = thermostatExperimentRun?.scenarioIndex === index;
    verdict.className = result?.status === 'passed'
      ? 'experiment-pass'
      : result?.status === 'failed' ? 'experiment-fail' : current ? 'experiment-running' : 'experiment-pending';
    verdict.textContent = result?.status === 'passed' ? 'Pass' : result?.status === 'failed' ? 'Fail' : current ? 'Running' : 'Pending';
    evidence.textContent = result
      ? `${result.virtualMilliseconds?.toFixed(3) ?? '—'} ms · D13 ${result.observed.d13 === null ? 'missing' : result.observed.d13 ? 'HIGH' : 'LOW'} · ${result.checks.corroboratingSerial ? 'UART matched' : 'UART mismatch'} · ${result.checks.inputsComplete ? 'inputs logged' : 'input evidence missing'}`
      : current ? 'Resetting, applying inputs and executing firmware…' : 'Not run';
  }

  if (runActive) {
    const total = thermostatExperimentRun.authored
      ? scenarioTimelineEditor.timeline.scenarios.length : THERMOSTAT_SCENARIOS.scenarios.length;
    elements.thermostatexperimentstate.textContent = `${thermostatExperimentRun.authored ? 'Authored ' : ''}scenario ${thermostatExperimentRun.scenarioIndex + 1}/${total}`;
  } else if (thermostatKnownBadCaught() && variant === 'known-bad-equality') {
    elements.thermostatexperimentstate.textContent = 'Known-bad caught';
  } else if (thermostatExperimentResults.length === THERMOSTAT_SCENARIOS.scenarios.length) {
    const passed = thermostatExperimentResults.filter((result) => result.status === 'passed').length;
    elements.thermostatexperimentstate.textContent = `${passed}/3 passed`;
  } else {
    elements.thermostatexperimentstate.textContent = freshBuildReady ? 'Ready to test' : 'Fresh build required';
  }
  elements.thermostatexperimentmessage.textContent = thermostatExperimentNotice;
  publish({ thermostatExperiment: thermostatPublishedState() });
}
function cancelThermostatExperiment(message, { clearResults = true, render = true } = {}) {
  thermostatExperimentRun = null;
  if (clearResults) { thermostatExperimentResults = []; authoredScenarioResults = []; }
  if (message) thermostatExperimentNotice = message;
  if (render) renderThermostatExperimentPanel();
}
function startAuthoredScenarioExperiment() {
  if (!scenarioTimelineEditor) {
    elements.scenarioeditormessage.textContent = 'Create an editable timeline before running it.';
    return { ok: false, code: 'SCENARIO_TIMELINE_REQUIRED' };
  }
  if (!thermostatRuntimeReady()) {
    elements.scenarioeditormessage.textContent = 'Build this exact local project before running the authored timeline.';
    renderScenarioTimelineEditor();
    return { ok: false, code: 'THERMOSTAT_FRESH_BUILD_REQUIRED' };
  }
  const variant = thermostatFirmwareVariant(currentProject());
  if (!['correct', 'known-bad-equality'].includes(variant)) {
    elements.scenarioeditormessage.textContent = 'The source no longer matches a supported experiment variant.';
    return { ok: false, code: 'THERMOSTAT_SOURCE_MODIFIED' };
  }
  authoredScenarioResults = [];
  thermostatExperimentRun = { phase: 'await-reset', scenarioIndex: 0, variant, authored: true };
  thermostatExperimentNotice = 'Running the authored data-only timeline from fresh reset. Expected events are compared with executed D13 evidence.';
  worker.postMessage({ command: 'reset' });
  renderThermostatExperimentPanel();
  return { ok: true, code: 'SCENARIO_TIMELINE_STARTED' };
}
function startThermostatExperiment() {
  if (!thermostatRuntimeReady()) {
    thermostatExperimentNotice = 'Build this exact local project before running the experiment.';
    renderThermostatExperimentPanel();
    return { ok: false, code: 'THERMOSTAT_FRESH_BUILD_REQUIRED' };
  }
  const variant = thermostatFirmwareVariant(currentProject());
  if (!['correct', 'known-bad-equality'].includes(variant)) {
    thermostatExperimentNotice = 'The source no longer matches either reviewed experiment variant.';
    renderThermostatExperimentPanel();
    return { ok: false, code: 'THERMOSTAT_SOURCE_MODIFIED' };
  }
  thermostatExperimentResults = [];
  thermostatExperimentRun = { phase: 'await-reset', scenarioIndex: 0, variant, authored: false };
  thermostatExperimentNotice = 'Running three isolated scenarios from virtual cycle 0. Wall-clock speed does not affect the verdict.';
  worker.postMessage({ command: 'reset' });
  renderThermostatExperimentPanel();
  return { ok: true, code: 'THERMOSTAT_EXPERIMENT_STARTED' };
}
async function advanceThermostatExperiment(message) {
  const run = thermostatExperimentRun;
  if (!run) return;
  if (message.kind === 'error' || message.kind === 'stopped-error') {
    cancelThermostatExperiment(`Experiment unresolved: ${message.message ?? 'runtime error'}. Nothing was marked passed.`, { clearResults: false, render: false });
    return;
  }
  const scenarios = run.authored ? scenarioTimelineEditor?.timeline.scenarios : THERMOSTAT_SCENARIOS.scenarios;
  const scenario = scenarios?.[run.scenarioIndex];
  if (!scenario) {
    cancelThermostatExperiment('Experiment unresolved: scenario contract was unavailable.', { clearResults: false, render: false });
    return;
  }
  if (run.phase === 'await-reset') {
    if (message.cycle !== 0 || !message.paused || !['reset', 'ready'].includes(message.kind)) return;
    run.phase = 'await-controls';
    const controls = run.authored ? scenarioTimelineControls(scenario) : thermostatScenarioControls(scenario.id);
    for (const control of controls) worker.postMessage(control);
    return;
  }
  if (run.phase === 'await-controls') {
    const required = run.authored ? scenarioTimelineControls(scenario) : thermostatScenarioControls(scenario.id);
    const logged = message.eventLog?.log?.filter((event) => event.type === 'control') ?? [];
    const complete = message.eventLog?.dropped === 0 && required.every((control) => logged.some(
      (event) => event.componentId === control.componentId && event.key === control.key
        && event.value === control.value && event.targetCycle === (control.targetCycle ?? 0),
    ));
    if (!complete) return;
    const accepted = applyLifecycle({ type: 'runtime.run' });
    if (!accepted.accepted) {
      cancelThermostatExperiment(`Experiment unresolved: ${accepted.code}. Nothing was marked passed.`, { clearResults: false, render: false });
      return;
    }
    run.phase = 'running';
    worker.postMessage({ command: 'speed', speed: 'maximum' });
    worker.postMessage({ command: 'run' });
    return;
  }
  if (run.phase === 'running') {
    const virtualMilliseconds = message.cycle / THERMOSTAT_TIME.clockHertz * 1000;
    const observeAt = run.authored ? scenario.events.at(-1).atMilliseconds
      : THERMOSTAT_TIME.observeAtOrAfterMilliseconds;
    if (virtualMilliseconds < observeAt) return;
    run.phase = 'await-pause';
    const paused = applyLifecycle({ type: 'runtime.pause' });
    if (!paused.accepted) {
      cancelThermostatExperiment(`Experiment unresolved: ${paused.code}. Nothing was marked passed.`, { clearResults: false, render: false });
      return;
    }
    worker.postMessage({ command: 'pause' });
    return;
  }
  if (run.phase !== 'await-pause' || !message.paused) return;
  run.phase = 'evaluating';
  const observationSnapshot = {
    cycle: message.cycle,
    pins: message.pins,
    eventLog: message.eventLog,
    instruments: { serial: message.instruments?.serial },
  };
  const request = domainRequest(run.authored
    ? 'evaluate-scenario-timeline-observation' : 'evaluate-thermostat-observation', commonProjectText(AVR_PROFILE),
    { scenarioId: scenario.id, snapshot: observationSnapshot });
  const domainResult = await executeDomainRequest(request, commonProjectAdapters, AVR_PROFILE, 'ui');
  lastSharedDomainTest = { request, result: structuredClone(domainResult) };
  if (!domainResult.ok || !domainResult.observation) {
    cancelThermostatExperiment(`Experiment unresolved: shared domain engine rejected ${domainResult.code}. Nothing was marked passed.`,
      { clearResults: false });
    return;
  }
  const result = domainResult.observation;
  if (run.authored) authoredScenarioResults.push(result); else thermostatExperimentResults.push(result);
  if (run.scenarioIndex + 1 < scenarios.length) {
    run.scenarioIndex += 1;
    run.phase = 'await-reset';
    worker.postMessage({ command: 'reset' });
    renderThermostatExperimentPanel();
    return;
  }
  thermostatExperimentRun = null;
  const completedResults = run.authored ? authoredScenarioResults : thermostatExperimentResults;
  const passed = completedResults.filter((item) => item.status === 'passed').length;
  thermostatExperimentNotice = run.authored
    ? `${passed}/${scenarios.length} authored scenarios passed from executed D13 and complete timed-input evidence.`
    : run.variant === 'known-bad-equality' && thermostatKnownBadCaught()
    ? 'Known-bad firmware caught: the equality scenario executed D13 HIGH and reported HEAT, while the other two scenarios passed.'
    : passed === THERMOSTAT_SCENARIOS.scenarios.length
      ? '3/3 passed from executed D13, matching UART and complete virtual-cycle input evidence.'
      : `${passed}/3 passed. Failed evidence remains visible; no missing evidence was treated as a pass.`;
  renderThermostatExperimentPanel();
}
function loadThermostatFirmwareVariant(variant) {
  if (!thermostatProjectActive()) return { ok: false, code: 'THERMOSTAT_PROJECT_REQUIRED' };
  const result = applyEditor({
    type: 'source.set', name: 'main.ino', content: thermostatFirmwareSource(variant),
  }, variant === 'known-bad-equality' ? 'Loaded known-bad equality variant' : 'Restored correct equality variant');
  if (result.ok) {
    thermostatExperimentNotice = variant === 'known-bad-equality'
      ? 'Known-bad ≤ firmware loaded. Build it fresh, then run the same three scenarios.'
      : 'Correct < firmware restored. Build it fresh before testing.';
    renderThermostatExperimentPanel();
  }
  return result;
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
  elements.projectbar.hidden = !avr;
  elements.firmwaredrawer.hidden = !avr;
  elements.promptdrawer.hidden = !avr;
  elements.runtimedrawer.hidden = !avr;
  elements.picopublicworkbench.hidden = !pico;
  elements.c3publicworkbench.hidden = !c3;
  elements.stm32publicworkbench.hidden = !stm32;
  elements.parkedcircuitnotice.hidden = true;
  elements.workbenchworkspace.hidden = !avr;
  elements.workbenchworkspace.setAttribute('aria-hidden', String(!avr));
  elements.togglecatalog.hidden = false;
  elements.toggleinspector.hidden = false;
  sharedWorkbenchShell.activate(selectedCompilerProfile);
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
  if (avr) {
    elements.quickpause.title = '';
    elements.quickreset.title = '';
  }
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
function briefDraftFromBrief(value = emptyProjectBrief()) {
  const brief = normalizeProjectBrief(value);
  return {
    purpose: brief.purpose,
    inputs: brief.inputs.join('\n'),
    outputs: brief.outputs.join('\n'),
    boundaryCases: brief.boundaryCases.join('\n'),
    acceptanceCriteria: brief.acceptanceCriteria.map((item) => `${item.id} | ${item.text} | ${item.codeRefs.join(', ')} | ${item.testRefs.join(', ')}`).join('\n'),
    openAssumptions: brief.openAssumptions.map((item) => `${item.id} | ${item.kind} | ${item.question} | ${item.requirementIds.join(', ')}`).join('\n'),
    requiredCapabilities: brief.requiredCapabilities.map((item) => `${item.id} | ${item.kind} | ${item.target} | ${item.requirementIds.join(', ')}`).join('\n'),
  };
}
function emptyProjectBriefDraft() { return briefDraftFromBrief(emptyProjectBrief()); }
function projectBriefDraft(profile) {
  if (!projectBriefDrafts.has(profile)) projectBriefDrafts.set(profile, emptyProjectBriefDraft());
  return projectBriefDrafts.get(profile);
}
function captureProjectBriefDraft() {
  projectBriefDrafts.set(selectedCompilerProfile, {
    purpose: elements.projectbriefpurpose.value,
    inputs: elements.projectbriefinputs.value,
    outputs: elements.projectbriefoutputs.value,
    boundaryCases: elements.projectbriefboundaries.value,
    acceptanceCriteria: elements.projectbriefacceptance.value,
    openAssumptions: elements.projectbriefassumptions.value,
    requiredCapabilities: elements.projectbriefcapabilities.value,
  });
}
function briefLines(value) {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}
function briefReferences(value) {
  return value.split(',').map((reference) => reference.trim()).filter(Boolean);
}
function projectBriefFromDraft(draft) {
  const acceptanceCriteria = briefLines(draft.acceptanceCriteria).map((line, index) => {
    const fields = line.split('|').map((field) => field.trim());
    if (fields.length < 2 || fields.length > 4) throw Object.assign(new Error('PROJECT_BRIEF_CRITERION_FORMAT'),
      { details: [`$brief.acceptanceCriteria[${index}]`] });
    return { id: fields[0], text: fields[1], codeRefs: briefReferences(fields[2] ?? ''),
      testRefs: briefReferences(fields[3] ?? '') };
  });
  const openAssumptions = briefLines(draft.openAssumptions).map((line, index) => {
    const fields = line.split('|').map((field) => field.trim());
    if (fields.length < 3 || fields.length > 4) throw Object.assign(new Error('PROJECT_BRIEF_ASSUMPTION_FORMAT'),
      { details: [`$brief.openAssumptions[${index}]`] });
    return { id: fields[0], kind: fields[1], question: fields[2],
      requirementIds: briefReferences(fields[3] ?? '') };
  });
  const requiredCapabilities = briefLines(draft.requiredCapabilities).map((line, index) => {
    const fields = line.split('|').map((field) => field.trim());
    if (fields.length < 3 || fields.length > 4) throw Object.assign(new Error('PROJECT_BRIEF_CAPABILITY_FORMAT'),
      { details: [`$brief.requiredCapabilities[${index}]`] });
    return { id: fields[0], kind: fields[1], target: fields[2],
      requirementIds: briefReferences(fields[3] ?? '') };
  });
  return normalizeProjectBrief({
    schema: PROJECT_BRIEF_SCHEMA,
    purpose: draft.purpose.trim(),
    inputs: briefLines(draft.inputs),
    outputs: briefLines(draft.outputs),
    boundaryCases: briefLines(draft.boundaryCases),
    acceptanceCriteria,
    openAssumptions,
    requiredCapabilities,
  });
}
function currentProjectFeasibility(profile = selectedCompilerProfile, brief = null) {
  return evaluateProjectFeasibility(profile, (brief ?? projectBriefForProfile(profile)).requiredCapabilities);
}
function renderProjectFeasibility(brief = null) {
  const result = currentProjectFeasibility(selectedCompilerProfile, brief);
  const { available, unsupported, unknown, unresolved } = result.counts;
  elements.projectfeasibilitysummary.textContent = result.items.length
    ? `${available} available · ${unsupported} unsupported · ${unknown} unknown · ${unresolved} unresolved`
    : 'No required capabilities';
  if (!result.items.length) {
    elements.projectfeasibilitylist.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'requirement-trace-empty', textContent: 'Add a required peripheral or component to preflight this project.',
    }));
    return;
  }
  elements.projectfeasibilitylist.replaceChildren(...result.items.map((item) => {
    const row = document.createElement('article'); row.className = 'feasibility-row'; row.dataset.feasibilityId = item.id;
    const identity = document.createElement('div'); identity.append(Object.assign(document.createElement('strong'), { textContent: 'Project need' }), Object.assign(document.createElement('b'), { textContent: item.id }));
    const target = document.createElement('div'); target.append(Object.assign(document.createElement('strong'), { textContent: item.kind }), Object.assign(document.createElement('code'), { textContent: item.target }));
    const state = document.createElement('div');
    const stateValue = Object.assign(document.createElement('span'), { className: 'feasibility-state', textContent: item.state });
    stateValue.dataset.state = item.state;
    state.append(Object.assign(document.createElement('strong'), { textContent: 'Preflight state' }), stateValue);
    const reason = document.createElement('div'); reason.append(Object.assign(document.createElement('strong'), { textContent: 'Authority reason' }), document.createTextNode(item.reason));
    row.append(identity, target, state, reason); return row;
  }));
}
function renderOpenAssumptions(brief = null) {
  const items = brief?.openAssumptions ?? [];
  elements.openassumptionssummary.textContent = items.length
    ? `${items.length} unresolved` : 'No open questions';
  if (!items.length) {
    elements.openassumptionslist.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'requirement-trace-empty', textContent: 'Add an open question when a required detail is missing.',
    }));
    return;
  }
  elements.openassumptionslist.replaceChildren(...items.map((item) => {
    const row = document.createElement('article'); row.className = 'open-assumption-row'; row.dataset.assumptionId = item.id;
    const identity = document.createElement('div'); identity.append(Object.assign(document.createElement('strong'), { textContent: 'Question ID' }), Object.assign(document.createElement('b'), { textContent: item.id }));
    const kind = document.createElement('div'); kind.append(Object.assign(document.createElement('strong'), { textContent: 'Missing detail' }), Object.assign(document.createElement('span'), { textContent: item.kind }));
    const question = document.createElement('div'); question.append(Object.assign(document.createElement('strong'), { textContent: 'Clarification needed' }), document.createTextNode(item.question));
    const state = document.createElement('div'); state.append(Object.assign(document.createElement('strong'), { textContent: 'Status' }), Object.assign(document.createElement('span'), { className: 'open-assumption-status', textContent: 'Unresolved' }), Object.assign(document.createElement('small'), { textContent: item.requirementIds.length ? ` · ${item.requirementIds.join(', ')}` : ' · no requirement link' }));
    row.append(identity, kind, question, state); return row;
  }));
}
function projectBriefForProfile(profile) {
  if (profile === selectedCompilerProfile) captureProjectBriefDraft();
  return projectBriefFromDraft(projectBriefDraft(profile));
}
function requirementResultKey(profile, requirementId) { return `${profile}::${requirementId}`; }
function clearRequirementResultLinks(profile) {
  for (const key of requirementResultLinks.keys()) if (key.startsWith(`${profile}::`)) requirementResultLinks.delete(key);
}
function hasRequirementResultLinks(profile) {
  return [...requirementResultLinks.keys()].some((key) => key.startsWith(`${profile}::`));
}
function refreshRequirementResultButtons(profile) {
  if (profile !== selectedCompilerProfile) return;
  const summary = sharedInstrumentSummaries.get(profile);
  for (const button of elements.requirementtracelist.querySelectorAll('[data-link-requirement-result]')) {
    const criterion = projectBriefForProfile(profile).acceptanceCriteria
      .find((item) => item.id === button.dataset.linkRequirementResult);
    button.disabled = !criterion?.testRefs.length || summary?.state !== 'current-runtime';
    button.title = !criterion?.testRefs.length ? 'Add at least one stable test ID first.'
      : summary?.state !== 'current-runtime' ? 'Build and Run this profile first.'
        : 'Link current runtime provenance without a verdict.';
  }
}
function requirementTraceRows(profile = selectedCompilerProfile) {
  const brief = projectBriefForProfile(profile);
  const summary = sharedInstrumentSummaries.get(profile) ?? null;
  return brief.acceptanceCriteria.map((criterion) => {
    const key = requirementResultKey(profile, criterion.id);
    const result = currentRequirementResultLink(requirementResultLinks.get(key), profile, criterion, summary);
    return { requirement: structuredClone(criterion), result, state: result ? 'current-result-linked' : 'untested',
      evaluated: false };
  });
}
function attachCurrentRequirementResult(requirementId, profile = selectedCompilerProfile) {
  const criterion = projectBriefForProfile(profile).acceptanceCriteria.find((item) => item.id === requirementId);
  if (!criterion) throw new Error('REQUIREMENT_ID_UNKNOWN');
  const result = createRequirementResultLink(profile, criterion, sharedInstrumentSummaries.get(profile));
  requirementResultLinks.set(requirementResultKey(profile, requirementId), result);
  return structuredClone(result);
}
function referenceText(references, missing) { return references.length ? references.join(' · ') : missing; }
function renderRequirementTraceability(brief = null) {
  let rows;
  try { rows = brief ? brief.acceptanceCriteria.map((criterion) => {
    const result = currentRequirementResultLink(requirementResultLinks.get(requirementResultKey(selectedCompilerProfile, criterion.id)),
      selectedCompilerProfile, criterion, sharedInstrumentSummaries.get(selectedCompilerProfile));
    return { requirement: criterion, result, state: result ? 'current-result-linked' : 'untested', evaluated: false };
  }) : requirementTraceRows(); }
  catch {
    elements.requirementtracelist.dataset.renderIdentity = 'invalid';
    elements.requirementtracesummary.textContent = 'Invalid requirement data';
    elements.requirementtracelist.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'requirement-trace-empty', textContent: 'Fix the acceptance-criterion format before traceability can be shown.',
    }));
    return;
  }
  const activeSummary = sharedInstrumentSummaries.get(selectedCompilerProfile);
  const renderIdentity = JSON.stringify({ profile: selectedCompilerProfile,
    summary: { state: activeSummary?.state ?? null, artifactIdentity: activeSummary?.artifactIdentity ?? null },
    rows: rows.map((row) => ({ requirement: row.requirement, result: row.result })) });
  if (elements.requirementtracelist.dataset.renderIdentity === renderIdentity) return;
  elements.requirementtracelist.dataset.renderIdentity = renderIdentity;
  elements.requirementtracesummary.textContent = `${rows.filter((row) => row.result).length} current · ${rows.filter((row) => !row.result).length} untested`;
  if (!rows.length) {
    elements.requirementtracelist.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'requirement-trace-empty', textContent: 'Add an acceptance criterion to start its trace.',
    }));
    return;
  }
  const nodes = rows.map(({ requirement, result }) => {
    const row = document.createElement('article'); row.className = 'requirement-trace-row'; row.dataset.requirementId = requirement.id;
    const identity = document.createElement('div'); identity.className = 'requirement-trace-cell requirement-trace-id';
    identity.append(Object.assign(document.createElement('strong'), { textContent: 'Requirement' }),
      Object.assign(document.createElement('b'), { textContent: requirement.id }),
      Object.assign(document.createElement('div'), { textContent: requirement.text }));
    const code = document.createElement('div'); code.className = 'requirement-trace-cell';
    code.append(Object.assign(document.createElement('strong'), { textContent: 'Code' }),
      Object.assign(document.createElement('code'), { textContent: referenceText(requirement.codeRefs, 'No code linked') }));
    const tests = document.createElement('div'); tests.className = 'requirement-trace-cell';
    tests.append(Object.assign(document.createElement('strong'), { textContent: 'Tests' }),
      Object.assign(document.createElement('code'), { textContent: referenceText(requirement.testRefs, 'No test linked') }));
    const resultCell = document.createElement('div'); resultCell.className = 'requirement-trace-cell requirement-trace-result';
    resultCell.append(Object.assign(document.createElement('strong'), { textContent: 'Current result' }));
    const state = document.createElement('span'); state.dataset.resultState = result ? 'current' : 'untested';
    state.textContent = result
      ? `Linked · generation ${result.generation ?? 'unavailable'} · artifact ${result.artifactIdentity.slice(0, 12)}… · Not evaluated`
      : 'Untested · no current result linked';
    resultCell.append(state);
    if (result) {
      resultCell.append(Object.assign(document.createElement('small'), { textContent: Object.values(result.channels)
        .map((channel) => channel.classification).join(' · ') }));
    } else {
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Link current result' });
      button.dataset.linkRequirementResult = requirement.id;
      const summary = sharedInstrumentSummaries.get(selectedCompilerProfile);
      button.disabled = !requirement.testRefs.length || summary?.state !== 'current-runtime';
      button.title = !requirement.testRefs.length ? 'Add at least one stable test ID first.'
        : summary?.state !== 'current-runtime' ? 'Build and Run this profile first.' : 'Link current runtime provenance without a verdict.';
      resultCell.append(button);
    }
    row.append(identity, code, tests, resultCell); return row;
  });
  elements.requirementtracelist.replaceChildren(...nodes);
}
function renderProjectBrief() {
  const draft = projectBriefDraft(selectedCompilerProfile);
  elements.projectbriefpurpose.value = draft.purpose;
  elements.projectbriefinputs.value = draft.inputs;
  elements.projectbriefoutputs.value = draft.outputs;
  elements.projectbriefboundaries.value = draft.boundaryCases;
  elements.projectbriefacceptance.value = draft.acceptanceCriteria;
  elements.projectbriefassumptions.value = draft.openAssumptions;
  elements.projectbriefcapabilities.value = draft.requiredCapabilities;
  elements.projectbriefprofile.textContent = publicControllerView(selectedCompilerProfile)?.label ?? selectedCompilerProfile;
  try {
    const brief = projectBriefFromDraft(draft);
    const count = brief.acceptanceCriteria.length;
    elements.projectbriefevaluation.textContent = `${count || 'No'} ${count === 1 ? 'criterion' : 'criteria'} · Not evaluated`;
    elements.projectbriefstatus.dataset.valid = 'true';
    elements.projectbriefstatus.textContent = 'Valid data-only brief · saved with Download/Save; Build and runtime authority are unchanged.';
    renderRequirementTraceability(brief);
    renderOpenAssumptions(brief);
    renderProjectFeasibility(brief);
  } catch (error) {
    elements.projectbriefevaluation.textContent = 'Not evaluated';
    elements.projectbriefstatus.dataset.valid = 'false';
    elements.projectbriefstatus.textContent = `Brief not saveable (${error.code ?? error.message}). Use ID | statement and unique uppercase IDs.`;
    renderRequirementTraceability();
    renderOpenAssumptions();
    elements.projectfeasibilitysummary.textContent = 'Invalid project needs';
    elements.projectfeasibilitylist.replaceChildren();
  }
}
elements.requirementtracelist.addEventListener('click', (event) => {
  const button = event.target.closest('[data-link-requirement-result]');
  if (!button) return;
  try {
    const result = attachCurrentRequirementResult(button.dataset.linkRequirementResult);
    const state = button.closest('.requirement-trace-result')?.querySelector('[data-result-state]');
    if (state) {
      state.dataset.resultState = 'current';
      state.textContent = `Linked · generation ${result.generation ?? 'unavailable'} · artifact ${result.artifactIdentity.slice(0, 12)}… · Not evaluated`;
    }
    button.disabled = true;
    button.removeAttribute('data-link-requirement-result');
    button.textContent = 'Current result linked';
    button.title = 'Current runtime provenance linked without a verdict.';
    elements.requirementtracesummary.textContent = `${requirementTraceRows().filter((row) => row.result).length} current · ${requirementTraceRows().filter((row) => !row.result).length} untested`;
    elements.requirementtracelist.dataset.renderIdentity = '';
  }
  catch (error) {
    elements.projectbriefstatus.dataset.valid = 'false';
    elements.projectbriefstatus.textContent = `Current result was not linked (${error.message}). Build and Run, then try again.`;
  }
});
function handleProjectBriefInput(event) {
  if (event?.target === elements.projectbriefacceptance) clearRequirementResultLinks(selectedCompilerProfile);
  captureProjectBriefDraft();
  renderProjectBrief();
}
for (const input of [elements.projectbriefpurpose, elements.projectbriefinputs, elements.projectbriefoutputs,
  elements.projectbriefboundaries, elements.projectbriefacceptance, elements.projectbriefassumptions,
  elements.projectbriefcapabilities]) {
  input.addEventListener('input', handleProjectBriefInput);
}
for (const [button, profile] of [[elements.reset, AVR_PROFILE], [elements.picoreset, RP2040_PROFILE],
  [elements.stm32reset, STM32F429ZI_PROFILE]]) {
  button.addEventListener('click', () => {
    clearRequirementResultLinks(profile);
    if (profile === selectedCompilerProfile) renderRequirementTraceability();
  });
}

const commonProjectAdapters = Object.freeze({
  [AVR_PROFILE]: Object.freeze({
    schemas: Object.freeze([PROJECT_SCHEMA, CONTACT_PERSISTENCE_SCHEMA]),
    prepare(value) {
      const parsed = parseEditorSource(JSON.stringify(value));
      if (!parsed.ok) throw Object.assign(new Error(parsed.code), { code: parsed.code, details: parsed.details ?? [] });
      const project = typeof parsed.session.saveText === 'function'
        ? JSON.parse(parsed.session.saveText()) : JSON.parse(exportCanonicalProject(parsed.session.project));
      return {
        project, prepared: parsed.session,
        preserved: ['source', 'circuit', 'layout', 'wire routes/styles', 'instruments', 'supported controls'],
        fieldsDropped: ['build.inputIdentity', 'build.artifactIdentity', 'runtime results'],
      };
    },
    electrical: (result) => result.prepared?.runnable ?? validateCircuit(result.project.circuit),
  }),
  [RP2040_PROFILE]: Object.freeze({
    schemas: Object.freeze([RP2040_PUBLIC_PROJECT_SCHEMA]),
    prepare: (value) => ({ project: normalizeRp2040PublicProject(value),
      preserved: ['name', 'source', 'components', 'pins', 'nets', 'properties', 'layout', 'rotation', 'wires'] }),
    electrical: (result) => validateRp2040PicoCircuit(result.project.circuit),
  }),
  [ESP32C3_PROFILE]: Object.freeze({
    schemas: Object.freeze([C3_PUBLIC_PROJECT_SCHEMA]),
    prepare: (value) => ({ project: normalizeEsp32C3PublicProject(value),
      preserved: ['name', 'source', 'components', 'pins', 'nets', 'properties', 'layout', 'rotation', 'wires'] }),
    electrical: (result) => validateEsp32C3Circuit(result.project.circuit),
  }),
  [STM32F429ZI_PROFILE]: Object.freeze({
    schemas: Object.freeze([STM32_EDITABLE_PROJECT_SCHEMA, 'intent-mcu-stm32-public-project@1']),
    prepare(value) {
      const legacy = value?.schema === 'intent-mcu-stm32-public-project@1';
      return { project: normalizeStm32PublicProject(value),
        preserved: ['name', 'source', ...(legacy ? [] : ['components', 'pins', 'nets', 'properties', 'layout', 'rotation', 'wires'])],
        defaultsAdded: legacy ? ['default validated STM32 teaching circuit'] : [] };
    },
    electrical: (result) => validateStm32Circuit(result.project.circuit),
  }),
});
function parseAvrRecoverySource(source) {
  const common = prepareProjectEnvelope(source, commonProjectAdapters);
  if (common.ok && common.profile === AVR_PROFILE) {
    return { ok: true, code: common.code, session: common.prepared,
      scenarioTimeline: common.scenarioTimeline, report: common.report };
  }
  const legacy = parseEditorSource(source);
  return legacy.ok ? { ...legacy, scenarioTimeline: null } : common;
}
function profileProjectDocument(profile) {
  if (profile === AVR_PROFILE) return JSON.parse(currentProjectText());
  if (profile === RP2040_PROFILE) return picoPublicWorkbench.projectDocument();
  if (profile === ESP32C3_PROFILE) return c3PublicWorkbench.projectDocument();
  if (profile === STM32F429ZI_PROFILE) return stm32PublicWorkbench.projectDocument();
  throw new Error('PROJECT_ENVELOPE_PROFILE');
}
function profileProjectName(profile) {
  const project = profileProjectDocument(profile);
  return project.metadata?.name ?? project.name ?? 'intent-mcu-project';
}
function commonProjectFilename(profile) {
  const stem = profileProjectName(profile).normalize('NFKD')
    .replace(/[^A-Za-z0-9 _.-]/gu, '').trim().replace(/\s+/gu, '-').slice(0, 64);
  return `${stem || 'intent-mcu-project'}.intent-mcu.json`;
}
function commonProjectText(profile) {
  return canonicalProjectEnvelope(profile, profileProjectDocument(profile), commonProjectAdapters,
    projectBriefForProfile(profile), profile === AVR_PROFILE ? scenarioTimelineEditor?.timeline ?? null : null);
}
function legacyProjectText(profile) {
  return `${JSON.stringify(profileProjectDocument(profile), null, 2)}\n`;
}
function profileMessage(profile, message) {
  const target = profile === AVR_PROFILE ? elements.projectmessage
    : profile === RP2040_PROFILE ? elements.picomessage
    : profile === ESP32C3_PROFILE ? elements.c3message : elements.stm32message;
  target.textContent = message;
}
function nativeFileUi(profile) {
  if (profile === AVR_PROFILE) return {
    open: elements.projectnativeopen, save: elements.projectnativesave,
    saveCopy: elements.projectnativesavecopy, status: elements.projectfileconnection,
  };
  if (profile === RP2040_PROFILE) return {
    open: elements.piconativeopen, save: elements.piconativesave,
    saveCopy: elements.piconativesavecopy, status: elements.picofileconnection,
  };
  if (profile === ESP32C3_PROFILE) return {
    open: elements.c3nativeopen, save: elements.c3nativesave,
    saveCopy: elements.c3nativesavecopy, status: elements.c3fileconnection,
  };
  return {
    open: elements.stm32nativeopen, save: elements.stm32nativesave,
    saveCopy: elements.stm32nativesavecopy, status: elements.stm32fileconnection,
  };
}
function nativeFileCapabilities() {
  const secure = window.isSecureContext === true;
  return {
    secure,
    open: secure && typeof window.showOpenFilePicker === 'function',
    save: secure && typeof window.showSaveFilePicker === 'function',
  };
}
function renderNativeFileControls() {
  const capabilities = nativeFileCapabilities();
  for (const profile of [AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE]) {
    const ui = nativeFileUi(profile);
    const connection = projectFileConnections.get(profile);
    const busy = nativeFileOperation?.profile === profile;
    ui.open.hidden = !capabilities.open;
    ui.save.hidden = !capabilities.save;
    ui.saveCopy.hidden = !capabilities.save;
    ui.open.disabled = busy;
    ui.saveCopy.disabled = busy;
    ui.save.disabled = busy || !connection;
    ui.status.dataset.connected = String(Boolean(connection));
    ui.status.dataset.busy = String(Boolean(busy));
    if (busy) ui.status.textContent = `Native ${nativeFileOperation.kind} is waiting for the browser or operating system. Download copy and ordinary Open remain available.`;
    else if (connection) ui.status.textContent = `Connected for this session: ${connection.name}. Save connected file writes only after a complete close.`;
    else if (capabilities.open || capabilities.save) ui.status.textContent = 'Optional native file connection available for this secure desktop session. Download copy and ordinary Open remain the reliable primary actions.';
    else ui.status.textContent = 'Download copy and Open project are available. This browser does not expose the optional native file connection.';
  }
}
function clearProjectFileConnection(profile) {
  projectFileConnections.delete(profile);
  renderNativeFileControls();
}
function nativeFileIntent(profile, kind) {
  if (nativeFileOperation) {
    profileMessage(profile, 'Another native file decision is still open. Download copy and ordinary Open remain available.');
    return null;
  }
  const operation = {
    id: Symbol(kind), profile, kind,
    fingerprint: authoredProjectFingerprint(profile),
  };
  nativeFileOperation = operation;
  renderNativeFileControls();
  return operation;
}
function nativeFileIntentIsCurrent(operation) {
  return nativeFileOperation === operation
    && selectedCompilerProfile === operation.profile
    && authoredProjectFingerprint(operation.profile) === operation.fingerprint;
}
function finishNativeFileIntent(operation) {
  if (nativeFileOperation === operation) nativeFileOperation = null;
  renderNativeFileControls();
}
function safeHandleName(handle, profile) {
  const value = typeof handle?.name === 'string' ? handle.name.trim() : '';
  return value || commonProjectFilename(profile);
}
function saveCommonProject(profile) {
  try {
    const text = commonProjectText(profile);
    downloadText(commonProjectFilename(profile), text, 'application/json');
    profileMessage(profile, 'Common data-only project download requested. Executable and runtime authority were excluded.');
    return { ok: true, code: 'OK', text };
  } catch (error) {
    profileMessage(profile, `Save rejected (${error.code ?? error.message}). The project is unchanged.`);
    return { ok: false, code: error.code ?? error.message };
  }
}
function saveLegacyProject(profile) {
  try {
    const text = legacyProjectText(profile);
    const name = commonProjectFilename(profile).replace(/\.intent-mcu\.json$/u, '.legacy.intent-mcu.json');
    downloadText(name, text, 'application/json');
    profileMessage(profile, 'Legacy compatibility copy downloaded for rc16 rollback recovery.');
    return { ok: true, code: 'OK', text };
  } catch (error) {
    profileMessage(profile, `Legacy copy rejected (${error.code ?? error.message}).`);
    return { ok: false, code: error.code ?? error.message };
  }
}
const projectBaselines = new Map();
let pendingDestructiveProjectAction = null;
let destructiveActionSequence = 0;
function setProjectBaseline(profile) {
  projectBaselines.set(profile, commonProjectText(profile));
}
function isProjectDirty(profile) {
  const baseline = projectBaselines.get(profile);
  if (baseline === undefined) return false;
  try { return commonProjectText(profile) !== baseline; }
  catch { return true; }
}
function authoredProjectFingerprint(profile) {
  try { return commonProjectText(profile); }
  catch {
    if (profile === AVR_PROFILE) return JSON.stringify({
      name: elements.projectname.value, source: elements.source.value, project: currentProject(),
    });
    const state = profile === RP2040_PROFILE ? picoPublicWorkbench.state()
      : profile === ESP32C3_PROFILE ? c3PublicWorkbench.state() : stm32PublicWorkbench.state();
    return JSON.stringify({ name: state.project?.name ?? state.name, source: state.project?.source ?? state.source,
      circuit: state.project?.circuit ?? state.circuit });
  }
}
function currentProjectNameForGuard(profile) {
  const input = profile === AVR_PROFILE ? elements.projectname
    : profile === RP2040_PROFILE ? elements.picoprojectname
    : profile === ESP32C3_PROFILE ? elements.c3projectname : elements.stm32projectname;
  return input?.value?.trim() || 'this project';
}
function closeUnsavedChangeGuard() {
  const returnFocus = pendingDestructiveProjectAction?.returnFocus;
  pendingDestructiveProjectAction = null;
  if (elements.unsavedchangedialog.open) elements.unsavedchangedialog.close('keep');
  queueMicrotask(() => { if (returnFocus?.isConnected) returnFocus.focus(); });
}
function requestUnsavedChangeGuard({ profile, actionLabel, continueAction }) {
  if (!isProjectDirty(profile)) return false;
  if (pendingDestructiveProjectAction || elements.unsavedchangedialog.open) {
    elements.unsavedchangestatus.textContent = 'Finish the current decision first. No additional action was queued.';
    return true;
  }
  const token = ++destructiveActionSequence;
  pendingDestructiveProjectAction = { token, profile, continueAction,
    fingerprint: authoredProjectFingerprint(profile), returnFocus: document.activeElement };
  elements.unsavedchangetitle.textContent = `Keep ${currentProjectNameForGuard(profile)} before ${actionLabel}?`;
  elements.unsavedchangedescription.textContent = `${actionLabel} will replace authored changes to this ${profile} project.`;
  elements.unsavedchangestatus.textContent = 'Choose Keep editing, download a data-only copy, or discard the changes.';
  elements.unsavedchangedialog.showModal();
  elements.unsavedkeep.focus();
  return true;
}
function installPreparedProjectEnvelope(result, handle = null) {
  if (result.profile !== selectedCompilerProfile) {
    elements.boardselect.value = result.profile;
    elements.boardselect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (result.profile === AVR_PROFILE) {
    editor = result.prepared;
    scenarioTimelineEditor = result.scenarioTimeline
      ? new ScenarioTimelineEditor(result.scenarioTimeline) : null;
    authoredScenarioResults = [];
    installProjectGeneration({
      empty: currentProject().circuit.components.length === 0, reason: 'project.file-open',
      runtimeMessage: 'Opened project requires build',
    });
    selectedSourceFile = 'main.ino';
    persistProject(); markFileSaved('opened file current'); renderCatalog(); renderProject();
  } else if (result.profile === RP2040_PROFILE) picoPublicWorkbench.installPreparedProject(result.project);
  else if (result.profile === ESP32C3_PROFILE) c3PublicWorkbench.installPreparedProject(result.project);
  else if (result.profile === STM32F429ZI_PROFILE) stm32PublicWorkbench.installPreparedProject(result.project);
  projectBriefDrafts.set(result.profile, briefDraftFromBrief(result.brief));
  clearRequirementResultLinks(result.profile);
  renderProjectBrief();
  if (handle && !result.report.legacy) projectFileConnections.set(result.profile, {
    handle, name: safeHandleName(handle, result.profile),
  });
  else projectFileConnections.delete(result.profile);
  setProjectBaseline(result.profile);
  renderNativeFileControls();
  window.__COMMON_PROJECT_FILE_STATE__ = structuredClone({ profile: result.profile, report: result.report });
  profileMessage(result.profile, result.report.legacy
    ? `Legacy ${result.report.inputSchema} migrated in memory to ${result.report.outputSchema}. Save creates a new file; fresh Build is required.`
    : `Common project opened for ${result.profile}. Executable authority was cleared; fresh Build is required.`);
  return result;
}
async function openCommonProjectFile(file, handle = null) {
  const activeBefore = selectedCompilerProfile;
  if (!file) return { ok: false, code: 'PROJECT_FILE_REQUIRED' };
  if (file.size > PROJECT_ENVELOPE_LIMIT) {
    profileMessage(activeBefore, `Open rejected (INPUT_LIMIT). The current ${activeBefore} project is unchanged.`);
    return { ok: false, code: 'INPUT_LIMIT' };
  }
  let source;
  try { source = await file.text(); }
  catch (error) {
    profileMessage(activeBefore, `Open rejected (PROJECT_READ_FAILED). ${error?.message ?? 'read failed'}`);
    return { ok: false, code: 'PROJECT_READ_FAILED' };
  }
  const result = prepareProjectEnvelope(source, commonProjectAdapters);
  if (!result.ok) {
    profileMessage(activeBefore, `Open rejected (${result.code}). Profile and current project are unchanged.`);
    return result;
  }
  if (result.profile === activeBefore && requestUnsavedChangeGuard({
    profile: activeBefore,
    actionLabel: 'opening this file',
    continueAction: () => installPreparedProjectEnvelope(result, handle),
  })) return { ...result, pending: true };
  return installPreparedProjectEnvelope(result, handle);
}
async function openConnectedProject(profile) {
  if (!nativeFileCapabilities().open) {
    profileMessage(profile, 'Native connected Open is unavailable. Use Open project instead.');
    return;
  }
  const operation = nativeFileIntent(profile, 'Open & connect');
  if (!operation) return;
  try {
    const handles = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Intent MCU project', accept: { 'application/json': ['.json'] } }],
    });
    if (!nativeFileIntentIsCurrent(operation)) {
      profileMessage(profile, 'Connected Open was cancelled because the active project changed while the picker was open.');
      return;
    }
    const handle = handles?.[0];
    if (!handle || typeof handle.getFile !== 'function') throw new Error('PROJECT_FILE_HANDLE_INVALID');
    const file = await handle.getFile();
    if (!nativeFileIntentIsCurrent(operation)) {
      profileMessage(profile, 'Connected Open was cancelled because the active project changed before validation.');
      return;
    }
    await openCommonProjectFile(file, handle);
  } catch (error) {
    if (error?.name === 'AbortError') profileMessage(profile, 'Connected Open cancelled. The current project and file connection are unchanged.');
    else profileMessage(profile, `Connected Open failed (${error?.name || error?.message || 'PROJECT_READ_FAILED'}). The current project and file connection are unchanged.`);
  } finally {
    finishNativeFileIntent(operation);
  }
}
async function saveNativeProject(profile, { copy = false } = {}) {
  if (!nativeFileCapabilities().save) {
    profileMessage(profile, 'Native Save is unavailable. Use Download copy instead.');
    return;
  }
  const prior = projectFileConnections.get(profile) ?? null;
  if (!copy && !prior) {
    profileMessage(profile, 'No file is connected for this session. Use Save copy or Download copy.');
    return;
  }
  let text;
  try { text = commonProjectText(profile); }
  catch (error) {
    profileMessage(profile, `Native Save rejected (${error.code ?? error.message}). The project and file connection are unchanged.`);
    return;
  }
  const operation = nativeFileIntent(profile, copy ? 'Save copy' : 'Save connected file');
  if (!operation) return;
  let handle = prior?.handle;
  let writable = null;
  try {
    if (copy) handle = await window.showSaveFilePicker({
      suggestedName: commonProjectFilename(profile),
      types: [{ description: 'Intent MCU project', accept: { 'application/json': ['.json'] } }],
    });
    if (!nativeFileIntentIsCurrent(operation)) {
      profileMessage(profile, 'Native Save was cancelled because the active project changed before writing. No file was overwritten.');
      return;
    }
    if (!handle || typeof handle.createWritable !== 'function') throw new Error('PROJECT_FILE_HANDLE_INVALID');
    writable = await handle.createWritable();
    if (!nativeFileIntentIsCurrent(operation)) {
      if (typeof writable.abort === 'function') await writable.abort();
      profileMessage(profile, 'Native Save was cancelled because the active project changed before writing. No file was overwritten.');
      return;
    }
    await writable.write(new Blob([text], { type: 'application/json' }));
    await writable.close();
    writable = null;
    projectFileConnections.set(profile, { handle, name: safeHandleName(handle, profile) });
    if (authoredProjectFingerprint(profile) === operation.fingerprint) {
      setProjectBaseline(profile);
      if (profile === AVR_PROFILE) { markFileSaved('saved to connected file'); renderProject(); }
      profileMessage(profile, `${copy ? 'Save copy' : 'Save'} completed and closed. ${safeHandleName(handle, profile)} is connected for this session.`);
    } else {
      profileMessage(profile, `${copy ? 'Save copy' : 'Save'} completed for the earlier snapshot. Newer edits remain unsaved.`);
    }
  } catch (error) {
    if (writable && typeof writable.abort === 'function') {
      try { await writable.abort(); } catch { /* the failed writer remains untrusted */ }
    }
    if (error?.name === 'AbortError') profileMessage(profile, `${copy ? 'Save copy' : 'Save'} cancelled. The project and existing file connection are unchanged.`);
    else profileMessage(profile, `${copy ? 'Save copy' : 'Save'} failed (${error?.name || error?.message || 'FILE_SAVE_FAILED'}). No completed write is claimed; the project remains unsaved.`);
  } finally {
    finishNativeFileIntent(operation);
  }
}
function installNativeFileControls() {
  for (const profile of [AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE]) {
    const ui = nativeFileUi(profile);
    ui.open.addEventListener('click', () => { void openConnectedProject(profile); });
    ui.save.addEventListener('click', () => { void saveNativeProject(profile); });
    ui.saveCopy.addEventListener('click', () => { void saveNativeProject(profile, { copy: true }); });
  }
  renderNativeFileControls();
}
window.__NATIVE_PROJECT_FILES__ = Object.freeze({
  capabilities: () => structuredClone(nativeFileCapabilities()),
  status: (profile = selectedCompilerProfile) => ({
    profile, connected: projectFileConnections.has(profile),
    name: projectFileConnections.get(profile)?.name ?? null,
    busy: nativeFileOperation?.profile === profile,
  }),
});
window.__COMMON_PROJECT_FILES__ = Object.freeze({
  schema: PROJECT_ENVELOPE_SCHEMA,
  current: (profile = selectedCompilerProfile) => commonProjectText(profile),
  legacy: (profile = selectedCompilerProfile) => legacyProjectText(profile),
  prepare: (source) => prepareProjectEnvelope(source, commonProjectAdapters),
});
let lastSharedDomainInspection = null;
let lastSharedDomainTest = null;
function renderSharedDomainInspection(result) {
  lastSharedDomainInspection = structuredClone(result);
  elements.shareddomainenginesummary.textContent = result.ok ? 'Same engine accepted' : 'Rejected';
  elements.shareddomainenginestatus.dataset.valid = String(Boolean(result.ok));
  elements.shareddomainenginestatus.textContent = result.ok
    ? `${result.engine} accepted ${result.profile} without mutation or Build authority.`
    : `Shared engine rejected (${result.code}). The project is unchanged.`;
  if (!result.ok) {
    elements.shareddomainenginestages.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'requirement-trace-empty', textContent: (result.details ?? []).join(' · ') || 'No weaker fallback ran.',
    })); return;
  }
  const stages = [['Project', result.stages.project], ['Electrical', result.stages.electrical],
    ['Tests', result.stages.tests]];
  elements.shareddomainenginestages.replaceChildren(...stages.map(([label, owner]) => {
    const card = document.createElement('div'); card.className = 'shared-domain-stage';
    const title = document.createElement('strong'); title.textContent = label;
    const value = document.createElement('code'); value.textContent = owner;
    card.append(title, value); return card;
  }));
}
async function inspectCurrentProjectThroughDomainEngine(profile = selectedCompilerProfile) {
  const request = domainRequest('validate-project', commonProjectText(profile));
  const result = await executeDomainRequest(request, commonProjectAdapters, profile, 'ui');
  renderSharedDomainInspection(result); return result;
}
elements.shareddomainengineinspect.addEventListener('click', () => { void inspectCurrentProjectThroughDomainEngine(); });
window.__SHARED_DOMAIN_ENGINE__ = Object.freeze({
  schema: SHARED_DOMAIN_ENGINE_SCHEMA,
  requestSchema: DOMAIN_REQUEST_SCHEMA,
  inspect: (profile = selectedCompilerProfile) => inspectCurrentProjectThroughDomainEngine(profile),
  state: () => lastSharedDomainInspection ? structuredClone(lastSharedDomainInspection) : null,
  lastTest: () => lastSharedDomainTest ? structuredClone(lastSharedDomainTest) : null,
});
window.__AGENT_DOMAIN_ENGINE__ = Object.freeze({
  schema: SHARED_DOMAIN_ENGINE_SCHEMA,
  requestSchema: DOMAIN_REQUEST_SCHEMA,
  execute: (source, profile = selectedCompilerProfile) => executeDomainRequest(source, commonProjectAdapters, profile, 'agent'),
  authority: Object.freeze({ network: false, mutation: false, build: false, run: false, persistence: false }),
});
function actionContext(profile = selectedCompilerProfile) {
  const revision = profile === AVR_PROFILE ? editor.revision
    : profile === RP2040_PROFILE ? picoPublicWorkbench.snapshot().revision
    : profile === ESP32C3_PROFILE ? c3PublicWorkbench.snapshot().revision
    : profile === STM32F429ZI_PROFILE ? stm32PublicWorkbench.snapshot().revision : null;
  if (!Number.isInteger(revision)) throw new Error('ACTION_PROFILE_UNSUPPORTED');
  const projectGeneration = profile === AVR_PROFILE ? lifecycle.projectGeneration : 1;
  return { profile, generation: projectGeneration * 1_000_000 + revision };
}
function actionWorkbench(profile) {
  if (profile === RP2040_PROFILE) return picoPublicWorkbench;
  if (profile === ESP32C3_PROFILE) return c3PublicWorkbench;
  if (profile === STM32F429ZI_PROFILE) return stm32PublicWorkbench;
  return null;
}
function throwIfActionCancelled(signal) {
  if (signal.aborted) throw Object.assign(new Error('ACTION_CANCELLED'), { code: 'ACTION_CANCELLED' });
}
function waitForActionEvidence(predicate, signal, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let timer;
    const finish = (error, value) => {
      clearInterval(timer); signal.removeEventListener('abort', cancelled);
      if (error) reject(error); else resolve(value);
    };
    const cancelled = () => finish(Object.assign(new Error('ACTION_CANCELLED'), { code: 'ACTION_CANCELLED' }));
    signal.addEventListener('abort', cancelled, { once: true });
    timer = setInterval(() => {
      try {
        const value = predicate();
        if (value) finish(null, value);
        else if (Date.now() - started >= timeoutMs) finish(Object.assign(new Error('ACTION_EVIDENCE_TIMEOUT'), { code: 'ACTION_EVIDENCE_TIMEOUT' }));
      } catch (error) { finish(error); }
    }, 25);
  });
}
function boundedThermostatTestEvidence(profile = selectedCompilerProfile) {
  if (profile !== AVR_PROFILE || !thermostatProjectActive()
      || thermostatExperimentResults.length !== THERMOSTAT_SCENARIOS.scenarios.length
      || !lifecycle.runtimeBinding || loadedSourceIdentity !== buildInputIdentity()) return null;
  const observations = structuredClone(thermostatExperimentResults);
  const primaryObservation = observations.find((item) => item.status === 'failed') ?? observations.at(-1);
  return {
    schema: 'intent-mcu-bounded-test-evidence@1',
    experimentId: THERMOSTAT_EXPERIMENT_ID,
    firmwareVariant: thermostatFirmwareVariant(currentProject()),
    status: observations.every((item) => item.status === 'passed') ? 'passed' : 'failed',
    artifactIdentity: lifecycle.runtimeBinding.artifactIdentity,
    sourceIdentity: lifecycle.artifact.inputIdentity,
    projectGeneration: lifecycle.runtimeBinding.projectGeneration,
    runtimeGeneration: lifecycle.runtimeBinding.runtimeGeneration,
    primaryObservation,
    observations,
  };
}
function boundedRuntimeResult(profile = selectedCompilerProfile) {
  if (profile === AVR_PROFILE) {
    const runtime = window.__M6_STATE__.runtime;
    if (!runtime) return { ok: false, code: 'ACTION_CURRENT_RUNTIME_REQUIRED' };
    if (!lifecycle.runtimeBinding) return { ok: false, code: 'ACTION_RUNTIME_BINDING_REQUIRED' };
    if (loadedSourceIdentity !== buildInputIdentity()) return { ok: false, code: 'ACTION_RUNTIME_SOURCE_STALE' };
    if (lifecycle.runtimeBinding.artifactIdentity !== window.__M6_STATE__.artifactIdentity) {
      return { ok: false, code: 'ACTION_RUNTIME_ARTIFACT_STALE' };
    }
    return {
      ok: true, code: 'ACTION_CURRENT_RESULT',
      artifactIdentity: lifecycle.runtimeBinding.artifactIdentity,
      projectGeneration: lifecycle.runtimeBinding.projectGeneration,
      runtimeGeneration: lifecycle.runtimeBinding.runtimeGeneration,
      cycle: runtime.cycle,
      pins: structuredClone(runtime.pins ?? []),
      serial: structuredClone((runtime.instruments?.serial?.records ?? []).slice(-64)),
      serialRetainedCount: runtime.instruments?.serial?.records?.length ?? 0,
      verdict: null,
      testEvidence: boundedThermostatTestEvidence(profile),
    };
  }
  const state = actionWorkbench(profile)?.snapshot();
  const artifactIdentity = state?.artifact?.artifactIdentity ?? state?.artifact?.uf2Sha256
    ?? state?.artifact?.flashSha256 ?? state?.artifact?.elfSha256 ?? null;
  if (!state?.runtime || !artifactIdentity) return { ok: false, code: 'ACTION_CURRENT_RUNTIME_REQUIRED' };
  return {
    ok: true, code: 'ACTION_CURRENT_RESULT', artifactIdentity,
    revision: state.revision, phase: state.phase,
    runtime: structuredClone(state.runtime), verdict: null,
  };
}
async function buildThroughActiveUi(profile, signal) {
  const cancel = () => {
    if (profile === AVR_PROFILE) elements.cancel.click();
    else if (profile === RP2040_PROFILE) picoPublicWorkbench.stop();
    else if (profile === ESP32C3_PROFILE) void c3PublicWorkbench.dispose('Agent action cancelled; transient C3 session discarded.');
    else if (profile === STM32F429ZI_PROFILE) stm32PublicWorkbench.stop('Agent action cancelled; transient STM32 executable discarded.');
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (profile === AVR_PROFILE) {
      await build(); throwIfActionCancelled(signal);
      return window.__M6_STATE__.buildState === 'succeeded'
        ? { ok: true, code: 'ACTION_BUILD_SUCCEEDED', artifactIdentity: window.__M6_STATE__.artifactIdentity }
        : { ok: false, code: `ACTION_BUILD_${String(window.__M6_STATE__.buildState).toUpperCase()}` };
    }
    const result = await actionWorkbench(profile).build(); throwIfActionCancelled(signal);
    return result.ok ? { ...result, code: 'ACTION_BUILD_SUCCEEDED' } : result;
  } finally { signal.removeEventListener('abort', cancel); }
}
async function runThroughActiveUi(profile, signal) {
  const cancel = () => {
    if (profile === AVR_PROFILE) {
      const paused = applyLifecycle({ type: 'runtime.pause' });
      if (paused.accepted) worker?.postMessage({ command: 'pause' });
    } else if (profile === RP2040_PROFILE) picoPublicWorkbench.pause();
    else if (profile === ESP32C3_PROFILE) void c3PublicWorkbench.dispose('Agent Run cancelled; transient C3 session discarded.');
    else if (profile === STM32F429ZI_PROFILE) stm32PublicWorkbench.stop('Agent Run cancelled; transient STM32 executable discarded.');
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const before = profile === AVR_PROFILE ? (window.__M6_STATE__.runtime?.cycle ?? -1) : null;
    if (profile === AVR_PROFILE) {
      const accepted = applyLifecycle({ type: 'runtime.run' });
      if (!accepted.accepted) return { ok: false, code: accepted.code };
      worker?.postMessage({ command: 'run' });
      await waitForActionEvidence(() => {
        const runtime = window.__M6_STATE__.runtime;
        return runtime && runtime.cycle > Math.max(before, 0) ? runtime : null;
      }, signal);
    } else {
      const started = profile === STM32F429ZI_PROFILE
        ? await stm32PublicWorkbench.run(false) : await actionWorkbench(profile).run();
      if (!started.ok) return started;
      await waitForActionEvidence(() => actionWorkbench(profile).snapshot().runtime, signal);
    }
    throwIfActionCancelled(signal);
    const result = boundedRuntimeResult(profile);
    return result.ok ? { ...result, code: 'ACTION_RUN_EVIDENCE_READY' } : result;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
async function runThermostatTestThroughUi(profile, signal) {
  if (profile !== AVR_PROFILE || !thermostatProjectActive()) {
    return { ok: false, code: 'ACTION_TEST_UNSUPPORTED' };
  }
  const cancel = () => {
    cancelThermostatExperiment('Agent test action cancelled; no verdict retained.');
    const paused = applyLifecycle({ type: 'runtime.pause' });
    if (paused.accepted) worker?.postMessage({ command: 'pause' });
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const started = startThermostatExperiment();
    if (!started.ok) return started;
    await waitForActionEvidence(() => boundedThermostatTestEvidence(profile), signal);
    throwIfActionCancelled(signal);
    const testEvidence = boundedThermostatTestEvidence(profile);
    return {
      ok: testEvidence.status === 'passed',
      code: 'ACTION_TEST_EVALUATED',
      artifactIdentity: testEvidence.artifactIdentity,
      sourceIdentity: testEvidence.sourceIdentity,
      testEvidence,
    };
  } finally { signal.removeEventListener('abort', cancel); }
}
const boundedActionHandlers = Object.freeze({
  async 'project.create'({ starterId, firmwareVariant = 'correct' }, { signal, context }) {
    throwIfActionCancelled(signal);
    if (isProjectDirty(context.profile)) return { ok: false, code: 'ACTION_UNSAVED_CHANGES' };
    if (context.profile === AVR_PROFILE) {
      const result = loadExampleProject(starterId, 'agent.project.create', { firmwareVariant });
      return result?.ok ? { ok: true, code: 'ACTION_PROJECT_CREATED', starterId }
        : { ok: false, code: result?.code ?? 'ACTION_STARTER_UNSUPPORTED' };
    }
    if (!supportedProfileExamples(context.profile).some((example) => example.id === starterId)) {
      return { ok: false, code: 'ACTION_STARTER_UNSUPPORTED' };
    }
    const result = actionWorkbench(context.profile).installPreparedProject(
      createSupportedProfileExample(context.profile, starterId),
      'Project created through the bounded local action contract. Build fresh before Run.',
    );
    return result.ok ? { ok: true, code: 'ACTION_PROJECT_CREATED', starterId } : result;
  },
  async 'patch.propose'({ description }, { signal, context }) {
    throwIfActionCancelled(signal);
    const prompt = await generateCurrentProjectPatchPrompt(description, context.profile);
    throwIfActionCancelled(signal);
    return { ok: true, code: 'ACTION_PATCH_PROMPT_CREATED', prompt, liveAiRequest: false, mutation: false };
  },
  async 'project.validate'(_payload, { signal, context }) {
    throwIfActionCancelled(signal);
    const result = await executeDomainRequest(
      domainRequest('validate-project', commonProjectText(context.profile)),
      commonProjectAdapters, context.profile, 'agent',
    );
    throwIfActionCancelled(signal);
    return result;
  },
  'firmware.build': (_payload, { signal, context }) => buildThroughActiveUi(context.profile, signal),
  'runtime.run': (payload, { signal, context }) => payload.experimentId
    ? runThermostatTestThroughUi(context.profile, signal) : runThroughActiveUi(context.profile, signal),
  async 'result.read'(_payload, { signal, context }) {
    throwIfActionCancelled(signal); return boundedRuntimeResult(context.profile);
  },
  async 'project.export'(_payload, { signal, context }) {
    throwIfActionCancelled(signal);
    const text = commonProjectText(context.profile);
    return { ok: true, code: 'ACTION_PROJECT_EXPORTED', filename: commonProjectFilename(context.profile),
      projectText: text, projectSha256: await projectTextSha256(text), browserWriteClaimed: false };
  },
});
const boundedActionRouter = createBoundedActionRouter({
  handlers: boundedActionHandlers,
  currentContext: () => actionContext(),
});
let lastBoundedAction = null;
function renderBoundedAction(result) {
  lastBoundedAction = structuredClone(result);
  elements.boundedactionssummary.textContent = result.ok ? 'Completed' : 'Rejected';
  elements.boundedactionsstatus.dataset.valid = String(Boolean(result.ok));
  elements.boundedactionsstatus.textContent = result.executed
    ? `${result.action} · ${result.code} · generation ${result.generationBefore} → ${result.generationAfter}`
    : `No action ran · ${result.code}`;
}
elements.boundedactionslist.replaceChildren(...BOUNDED_ACTIONS.map((action) => {
  const item = document.createElement('li'); const code = document.createElement('code'); code.textContent = action;
  const effect = document.createElement('span');
  effect.textContent = action === 'firmware.build' ? 'Build only' : action === 'runtime.run' ? 'Run only'
    : action === 'project.create' ? 'Project mutation only' : action === 'project.export' ? 'Data export only' : 'Read-only';
  item.append(code, effect); return item;
}));
window.__AGENT_ACTIONS__ = Object.freeze({
  schema: BOUNDED_ACTION_ROUTER_SCHEMA,
  requestSchema: BOUNDED_ACTION_REQUEST_SCHEMA,
  actions: BOUNDED_ACTIONS,
  context: () => structuredClone(actionContext()),
  request: (action, payload = {}, options = {}) => boundedActionRequest(
    action, selectedCompilerProfile, actionContext().generation, payload, options,
  ),
  execute: async (source) => { const result = await boundedActionRouter.execute(source); renderBoundedAction(result); return result; },
  cancel: (requestId) => boundedActionRouter.cancel(requestId),
  state: () => lastBoundedAction ? structuredClone(lastBoundedAction) : null,
  externalEndpoint: false,
});
window.__CAPABILITY_DISCOVERY__ = Object.freeze({
  schema: CAPABILITY_DISCOVERY_SCHEMA,
  requestSchema: CAPABILITY_DISCOVERY_REQUEST_SCHEMA,
  snapshot: () => capabilityDiscoverySnapshot(),
  request: (value) => capabilityDiscoveryResult(value),
  externalEndpoint: false,
  readOnly: true,
});
window.__PROJECT_BRIEF__ = Object.freeze({
  schema: PROJECT_BRIEF_SCHEMA,
  current: (profile = selectedCompilerProfile) => structuredClone(projectBriefForProfile(profile)),
  status: (profile = selectedCompilerProfile) => {
    try { return { ok: true, profile, brief: structuredClone(projectBriefForProfile(profile)), evaluated: false }; }
    catch (error) { return { ok: false, profile, code: error.code ?? error.message, evaluated: false }; }
  },
});
window.__REQUIREMENT_TRACEABILITY__ = Object.freeze({
  schema: 'intent-mcu-requirement-traceability-view@1',
  current: (profile = selectedCompilerProfile) => structuredClone(requirementTraceRows(profile)),
  attachCurrentResult: (requirementId, profile = selectedCompilerProfile) => attachCurrentRequirementResult(requirementId, profile),
});
window.__PROJECT_FEASIBILITY__ = Object.freeze({
  schema: 'intent-mcu-project-feasibility@1',
  current: (profile = selectedCompilerProfile) => structuredClone(currentProjectFeasibility(profile)),
});
let pendingProjectPatch = null;
let pendingDesignComparison = null;
function clearDesignComparison(message = 'Review a proposal above, then compare it with the current design.') {
  pendingDesignComparison = null;
  elements.designcomparisonsummary.textContent = 'No comparison';
  elements.designcomparisonstatus.dataset.valid = '';
  elements.designcomparisonstatus.textContent = message;
  const empty = document.createElement('p'); empty.className = 'requirement-trace-empty';
  empty.textContent = 'Two validated alternatives will appear here.';
  elements.designcomparisonalternatives.replaceChildren(empty);
  elements.designcomparisondifferences.replaceChildren();
}
function clearProjectPatchReview(message = 'No project mutation has been proposed.') {
  pendingProjectPatch = null;
  elements.projectpatchapply.disabled = true;
  elements.designcomparisoncreate.disabled = true;
  clearDesignComparison();
  elements.projectpatchsummary.textContent = 'No proposal reviewed';
  elements.projectpatchstatus.dataset.valid = '';
  elements.projectpatchstatus.textContent = message;
  const empty = document.createElement('p'); empty.className = 'requirement-trace-empty';
  empty.textContent = 'Reviewed source, component and wire changes appear here before Apply.';
  elements.projectpatchchanges.replaceChildren(empty);
}
function renderProjectPatchReview(reviewed) {
  pendingProjectPatch = reviewed;
  elements.projectpatchapply.disabled = false;
  elements.designcomparisoncreate.disabled = false;
  clearDesignComparison('Proposal reviewed. Compare it with the current design before Apply.');
  elements.projectpatchsummary.textContent = `${reviewed.result.changes.length} proposed change${reviewed.result.changes.length === 1 ? '' : 's'}`;
  elements.projectpatchstatus.dataset.valid = 'true';
  elements.projectpatchstatus.textContent = 'Proposal validated against the current base. Review every row, then explicitly Apply or keep editing.';
  const rows = reviewed.result.changes.map((change) => {
    const row = document.createElement('div'); row.className = 'project-patch-change';
    const kind = document.createElement('strong'); kind.textContent = change.kind;
    const action = document.createElement('b'); action.dataset.action = change.action; action.textContent = change.action;
    const summary = document.createElement('span'); summary.textContent = change.summary;
    row.append(kind, action, summary); return row;
  });
  elements.projectpatchchanges.replaceChildren(...rows);
}
function renderDesignComparison(result) {
  pendingDesignComparison = structuredClone(result);
  elements.designcomparisonsummary.textContent = `2 alternatives · ${result.requirements.ids.length} same requirement${result.requirements.ids.length === 1 ? '' : 's'}`;
  elements.designcomparisonstatus.dataset.valid = 'true';
  elements.designcomparisonstatus.textContent = 'Compared without mutation, execution, ranking or verdict. Apply remains a separate explicit action.';
  const cards = result.alternatives.map((alternative) => {
    const card = document.createElement('article'); card.className = 'design-alternative'; card.dataset.alternativeId = alternative.id;
    const title = document.createElement('h4'); title.textContent = alternative.label;
    const identity = document.createElement('code'); identity.textContent = alternative.projectSha256;
    const metric = document.createElement('div'); metric.className = 'design-metrics';
    for (const [label, value] of [['Source files', alternative.metrics.sourceFiles],
      ['Components', alternative.metrics.components], ['Wires', alternative.metrics.wires]]) {
      const cell = document.createElement('div'); const count = document.createElement('b'); count.textContent = String(value);
      cell.append(count, label); metric.append(cell);
    }
    const requirements = document.createElement('p'); requirements.className = 'design-requirements';
    requirements.textContent = `Same requirements: ${alternative.requirementIds.join(', ') || 'none saved'} · identity ${alternative.requirementsSha256.slice(0, 12)}…`;
    const limit = document.createElement('p'); limit.className = 'design-limit';
    limit.textContent = `${alternative.model.label} model limit: ${alternative.model.limitation}`;
    const capabilities = document.createElement('div'); capabilities.className = 'design-capabilities';
    for (const item of alternative.requiredCapabilities) {
      const row = document.createElement('div'); row.className = 'design-capability';
      const id = document.createElement('b'); id.textContent = item.id;
      const state = document.createElement('span'); state.dataset.state = item.state; state.textContent = item.state;
      const reason = document.createElement('small'); reason.textContent = item.reason;
      row.append(id, state, reason); capabilities.append(row);
    }
    if (!alternative.requiredCapabilities.length) {
      capabilities.append(Object.assign(document.createElement('p'), { className: 'requirement-trace-empty',
        textContent: 'No required capabilities saved; no support is inferred.' }));
    }
    card.append(title, identity, metric, requirements, limit, capabilities); return card;
  });
  elements.designcomparisonalternatives.replaceChildren(...cards);
  elements.designcomparisondifferences.replaceChildren(...result.changes.map((change) => {
    const row = document.createElement('div'); row.className = 'project-patch-change';
    const kind = document.createElement('strong'); kind.textContent = change.kind;
    const action = document.createElement('b'); action.dataset.action = change.action; action.textContent = change.action;
    const summary = document.createElement('span'); summary.textContent = change.summary;
    row.append(kind, action, summary); return row;
  }));
}
async function generateCurrentProjectPatchPrompt(description = elements.projectpatchdescription.value,
  profile = selectedCompilerProfile) {
  const prompt = await createProjectPatchPrompt(description.trim(), commonProjectText(profile), commonProjectAdapters, profile);
  elements.projectpatchprompt.value = prompt;
  elements.projectpatchcopy.disabled = false;
  elements.projectpatchstatus.dataset.valid = 'true';
  elements.projectpatchstatus.textContent = 'Portable prompt generated locally. No network or AI request was made.';
  return prompt;
}
async function reviewCurrentProjectPatch(source = elements.projectpatchinput.value,
  profile = selectedCompilerProfile) {
  const baseText = commonProjectText(profile);
  const result = await reviewProjectPatch(source, baseText, commonProjectAdapters, profile);
  if (!result.ok) {
    clearProjectPatchReview(`Review rejected (${result.code}). The current project is unchanged.`);
    elements.projectpatchstatus.dataset.valid = 'false';
    return result;
  }
  renderProjectPatchReview({ raw: source, result, profile, baseText });
  return result;
}
async function compareReviewedProjectDesigns() {
  if (!pendingProjectPatch) return { ok: false, code: 'DESIGN_COMPARISON_REVIEW_REQUIRED' };
  const reviewed = pendingProjectPatch;
  const currentText = commonProjectText(reviewed.profile);
  const refreshed = await reviewProjectPatch(reviewed.raw, currentText, commonProjectAdapters, reviewed.profile);
  if (!refreshed.ok || reviewed.profile !== selectedCompilerProfile) {
    const code = reviewed.profile !== selectedCompilerProfile ? 'PROJECT_PATCH_PROFILE_MISMATCH' : refreshed.code;
    clearProjectPatchReview(`Comparison rejected (${code}). Review a fresh proposal against the current project.`);
    elements.projectpatchstatus.dataset.valid = 'false';
    return { ok: false, code };
  }
  const result = await compareDesignAlternatives({ currentProjectText: currentText,
    candidateProjectText: refreshed.proposed.canonical, adapters: commonProjectAdapters,
    activeProfile: reviewed.profile, expectedBaseSha256: reviewed.result.baseProjectSha256,
    expectedCandidateSha256: reviewed.result.candidateProjectSha256 });
  if (!result.ok) {
    clearDesignComparison(`Comparison rejected (${result.code}). The current project is unchanged.`);
    elements.designcomparisonstatus.dataset.valid = 'false'; return result;
  }
  renderDesignComparison(result); return result;
}
async function applyReviewedProjectPatch() {
  if (!pendingProjectPatch) return { ok: false, code: 'PROJECT_PATCH_REVIEW_REQUIRED' };
  const reviewed = pendingProjectPatch;
  const currentText = commonProjectText(reviewed.profile);
  const result = await reviewProjectPatch(reviewed.raw, currentText, commonProjectAdapters, reviewed.profile);
  if (!result.ok || reviewed.profile !== selectedCompilerProfile) {
    const code = reviewed.profile !== selectedCompilerProfile ? 'PROJECT_PATCH_PROFILE_MISMATCH' : result.code;
    clearProjectPatchReview(`Apply rejected (${code}). The current project is unchanged; review a fresh proposal.`);
    elements.projectpatchstatus.dataset.valid = 'false';
    return { ...result, ok: false, code };
  }
  const priorBaseline = projectBaselines.get(reviewed.profile) ?? currentText;
  installPreparedProjectEnvelope(result.proposed);
  projectBaselines.set(reviewed.profile, priorBaseline);
  profileMessage(reviewed.profile, 'Reviewed data-only patch applied atomically. Executable and runtime authority were cleared; inspect the project and Build fresh.');
  clearProjectPatchReview('Reviewed patch applied. A fresh Build is required; replay requires a new base hash and review.');
  elements.projectpatchinput.value = '';
  return { ok: true, code: 'PROJECT_PATCH_APPLIED', profile: reviewed.profile,
    changes: structuredClone(result.changes), freshBuildRequired: true };
}
elements.projectpatchgenerate.addEventListener('click', async () => {
  try { await generateCurrentProjectPatchPrompt(); }
  catch (error) {
    elements.projectpatchstatus.dataset.valid = 'false';
    elements.projectpatchstatus.textContent = `Prompt rejected (${error.code ?? error.message}). The current project is unchanged.`;
  }
});
elements.projectpatchcopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(elements.projectpatchprompt.value);
    elements.projectpatchstatus.textContent = 'Patch prompt copied. No AI request was made by the Lab.';
  } catch {
    elements.projectpatchprompt.select();
    elements.projectpatchstatus.textContent = 'Patch prompt selected; copy it with your browser shortcut.';
  }
});
elements.projectpatchinput.addEventListener('input', () => clearProjectPatchReview('Patch text changed. Review the complete proposal before Apply.'));
elements.projectpatchreview.addEventListener('click', () => { void reviewCurrentProjectPatch(); });
elements.designcomparisoncreate.addEventListener('click', () => { void compareReviewedProjectDesigns(); });
elements.projectpatchapply.addEventListener('click', () => { void applyReviewedProjectPatch(); });
window.__PROJECT_PATCH__ = Object.freeze({
  schema: PROJECT_PATCH_SCHEMA,
  prompt: (description, profile = selectedCompilerProfile) => generateCurrentProjectPatchPrompt(description, profile),
  review: (source, profile = selectedCompilerProfile) => reviewCurrentProjectPatch(source, profile),
  apply: () => applyReviewedProjectPatch(),
  state: () => pendingProjectPatch ? {
    profile: pendingProjectPatch.profile,
    baseProjectSha256: pendingProjectPatch.result.baseProjectSha256,
    candidateProjectSha256: pendingProjectPatch.result.candidateProjectSha256,
    changes: structuredClone(pendingProjectPatch.result.changes),
    evaluated: false,
    buildAuthority: false,
  } : null,
});
window.__DESIGN_COMPARISON__ = Object.freeze({
  schema: DESIGN_COMPARISON_SCHEMA,
  compare: () => compareReviewedProjectDesigns(),
  state: () => pendingDesignComparison ? structuredClone(pendingDesignComparison) : null,
});
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
    const text = commonProjectText(AVR_PROFILE);
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
  return commonProjectFilename(AVR_PROFILE);
}
function boundedProjectText() {
  const text = commonProjectText(AVR_PROFILE);
  if (new TextEncoder().encode(text).length > PROJECT_ENVELOPE_LIMIT) throw new Error('INPUT_LIMIT');
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
  const recoverySaved = persistProject();
  downloadText(projectFilename(), text, 'application/json');
  markFileSaved('download requested'); renderProject();
  elements.projectmessage.textContent = recoverySaved
    ? 'Project download requested. Your browser chooses the download location; browser recovery was updated separately.'
    : 'Project download requested, but browser recovery/local save failed. The in-memory project remains usable.';
}
async function replaceProjectFromFile(file, handle = null) {
  return openCommonProjectFile(file, handle);
}
async function openProjectFile() {
  elements.projectopeninput.click();
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
  renderInstrumentEvidence();
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

function renderInstrumentEvidence(runtime = null) {
  const artifactIdentity = currentProject().build?.artifactIdentity ?? null;
  const evidence = avrInstrumentEvidence(runtime, artifactIdentity);
  const capability = instrumentCapability(AVR_PROFILE);
  const configuredSerialLimit = currentProject().instruments.serial.historyLimit;
  window.__INSTRUMENT_EVIDENCE__ = structuredClone(evidence);
  elements.instrumentevidence.dataset.state = evidence.state;
  elements.instrumentevidencestate.textContent = evidence.state === 'recorded-runtime' ? 'Recorded runtime' : 'No recorded evidence';
  elements.instrumentevidenceprofile.textContent = capability.label;
  elements.instrumentevidenceartifact.textContent = evidence.artifactIdentity
    ? `${evidence.artifactIdentity.slice(0, 12)}…${evidence.artifactIdentity.slice(-8)}`
    : 'Build and run to bind evidence';
  elements.instrumentevidencetime.textContent = evidence.cycle === null
    ? 'No runtime snapshot'
    : `cycle ${evidence.cycle.toLocaleString('en-US')} · ${evidence.virtualMilliseconds.toFixed(3)} ms`;
  elements.instrumentevidenceretention.textContent = evidence.state === 'recorded-runtime'
    ? `Serial ${evidence.serial.retained.toLocaleString('en-US')} / ${configuredSerialLimit.toLocaleString('en-US')} configured (max ${capability.serial.retained.toLocaleString('en-US')})${evidence.serial.dropped ? ` · ${evidence.serial.dropped} dropped` : ''} · logic ${evidence.logic.retained.toLocaleString('en-US')} / ${capability.logic.retained.toLocaleString('en-US')}${evidence.logic.dropped ? ` · ${evidence.logic.dropped} dropped` : ''} · inputs ${evidence.input.recorded.toLocaleString('en-US')} / ${capability.input.retained.toLocaleString('en-US')}`
    : `Serial 0 / ${configuredSerialLimit.toLocaleString('en-US')} configured (max ${capability.serial.retained.toLocaleString('en-US')}) · logic 0 / ${capability.logic.retained.toLocaleString('en-US')} · inputs 0 / ${capability.input.retained.toLocaleString('en-US')}`;
  elements.serialprovenance.textContent = evidence.state === 'recorded-runtime'
    ? `USART0 records from the same avr8js worker snapshot at cycle ${evidence.cycle.toLocaleString('en-US')}; artifact ${evidence.artifactIdentity.slice(0, 12)}…`
    : 'No recorded USART0 evidence. Build and run to bind output to an artifact and virtual cycle.';
  renderSharedInstrumentSummary(AVR_PROFILE, {
    ...window.__M6_STATE__, runtime, project: currentProject(),
  });
}

function instrumentSummaryLine(channel) {
  const retention = channel.retention;
  const counts = retention.retained === null ? 'retention unavailable'
    : `${retention.retained.toLocaleString('en-US')} retained · ${retention.dropped.toLocaleString('en-US')} dropped${retention.limit === null ? '' : ` · limit ${retention.limit.toLocaleString('en-US')}`}`;
  const time = channel.time.cycle === null ? channel.time.basis
    : `cycle ${channel.time.cycle.toLocaleString('en-US')} · ${channel.time.virtualMilliseconds.toFixed(3)} ms`;
  return `${channel.classification} · ${counts} · ${time} · ${channel.provenance}`;
}

function sharedFieldText(field) {
  if (field.status === 'unavailable') return 'Unavailable';
  if (typeof field.value === 'boolean') return field.value ? 'HIGH / true' : 'LOW / false';
  if (typeof field.value === 'object') return JSON.stringify(field.value);
  return String(field.value);
}

function sharedTraceRecordText(record, basis) {
  const level = typeof record.level === 'boolean' ? (record.level ? 'HIGH' : 'LOW')
    : String(record.state ?? 'level unavailable');
  if (Number.isSafeInteger(record.cycle)) {
    const virtual = Number.isFinite(record.virtualNanos) ? ` · ${record.virtualNanos.toLocaleString('en-US')} ns` : '';
    return `cycle ${record.cycle.toLocaleString('en-US')}${virtual} · ${level}`;
  }
  if (Number.isSafeInteger(record.sequence)) {
    const prefix = basis === 'adapter-epoch-sequence' ? 'adapter epoch' : 'observation';
    return `${prefix} ${record.sequence.toLocaleString('en-US')} · ${level}`;
  }
  return `position unavailable · ${level}`;
}

function sharedTraceAxisText(trace) {
  if (trace.classification === 'unavailable') return 'No verified timebase.';
  if (trace.time.basis === 'virtual-cycle') return `avr8js cycles at 16 MHz · snapshot ${trace.time.cycle.toLocaleString('en-US')} · ${trace.time.virtualMilliseconds.toFixed(3)} ms`;
  if (trace.time.basis === 'virtual-cycle-and-nanoseconds') return `rp2040js worker cycles · producer-supplied virtual nanoseconds · snapshot ${trace.time.cycle.toLocaleString('en-US')}`;
  if (trace.time.basis === 'adapter-epoch-sequence') return 'Ordered project-model adapter epochs · no QEMU pin timing.';
  if (trace.time.basis === 'instruction-order-only') return 'Final Renode PB0 observation · instruction order only, no duration.';
  return trace.time.basis;
}

function renderSharedInstrumentTools(root, view) {
  const tools = root.querySelector('[data-shared-instrument-tools]');
  if (!tools) return;
  const serialClass = tools.querySelector('[data-shared-serial-classification]');
  const serialOutput = tools.querySelector('[data-shared-serial-output]');
  const serialMeta = tools.querySelector('[data-shared-serial-meta]');
  const serialClear = tools.querySelector('[data-shared-serial-clear]');
  const serialExport = tools.querySelector('[data-shared-serial-export]');
  serialClass.textContent = view.serial.classification;
  serialOutput.textContent = view.serial.classification === 'unavailable'
    ? 'No current Serial output.' : view.serial.cleared ? 'View cleared locally.' : view.serial.text || 'No output bytes recorded.';
  serialMeta.textContent = `${view.serial.provenance} · ${view.serial.input.status === 'unavailable'
    ? 'RX unavailable.' : 'RX stays in the existing AVR console.'}`;
  serialClear.disabled = view.serial.classification === 'unavailable' || view.serial.cleared;
  serialExport.disabled = view.serial.classification === 'unavailable';

  const pinClass = tools.querySelector('[data-shared-pin-classification]');
  const pinSelect = tools.querySelector('[data-shared-pin-select]');
  const pinFields = tools.querySelector('[data-shared-pin-fields]');
  const pinProvenance = tools.querySelector('[data-shared-pin-provenance]');
  pinClass.textContent = view.pin.classification;
  pinSelect.replaceChildren();
  if (!view.pin.options.length) {
    pinSelect.append(Object.assign(document.createElement('option'), { value: '', textContent: 'Unavailable' }));
    pinSelect.disabled = true;
  } else {
    for (const pin of view.pin.options) pinSelect.append(Object.assign(document.createElement('option'), {
      value: pin, textContent: pin, selected: pin === view.pin.selectedPin,
    }));
    pinSelect.disabled = false;
  }
  pinFields.replaceChildren();
  for (const [name, fieldValue] of Object.entries(view.pin.fields)) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = name; detail.textContent = sharedFieldText(fieldValue); detail.dataset.status = fieldValue.status;
    if (fieldValue.reason) detail.title = fieldValue.reason;
    row.append(term, detail); pinFields.append(row);
  }
  pinProvenance.textContent = view.pin.provenance;

  const traceClass = tools.querySelector('[data-shared-trace-classification]');
  const traceSelect = tools.querySelector('[data-shared-trace-select]');
  const traceAxis = tools.querySelector('[data-shared-trace-axis]');
  const traceRecords = tools.querySelector('[data-shared-trace-records]');
  const traceRetention = tools.querySelector('[data-shared-trace-retention]');
  const traceProvenance = tools.querySelector('[data-shared-trace-provenance]');
  if (!traceClass || !traceSelect || !traceAxis || !traceRecords || !traceRetention || !traceProvenance) return;
  traceClass.textContent = view.trace.classification;
  traceClass.dataset.sharedTraceClassification = view.trace.classification;
  traceSelect.replaceChildren();
  if (!view.trace.channels.length) {
    traceSelect.append(Object.assign(document.createElement('option'), { value: '', textContent: 'Unavailable' }));
    traceSelect.disabled = true;
  } else {
    for (const channel of view.trace.channels) traceSelect.append(Object.assign(document.createElement('option'), {
      value: channel, textContent: channel, selected: channel === view.trace.selectedChannel,
    }));
    traceSelect.disabled = false;
  }
  traceAxis.textContent = sharedTraceAxisText(view.trace);
  const displayed = view.trace.records.map((record) => Object.assign(document.createElement('li'), {
    textContent: sharedTraceRecordText(record, view.trace.time.basis),
  }));
  traceRecords.replaceChildren(...(displayed.length ? displayed
    : [Object.assign(document.createElement('li'), { textContent: view.trace.classification === 'unavailable'
      ? 'No verified trace producer.' : 'No transitions recorded for this channel.' })]));
  traceRetention.textContent = view.trace.retention.retained === null ? 'Retention unavailable.'
    : `${view.trace.retention.retained.toLocaleString('en-US')} retained · ${view.trace.retention.dropped.toLocaleString('en-US')} dropped${view.trace.retention.limit === null ? '' : ` · limit ${view.trace.retention.limit.toLocaleString('en-US')}`} · showing ${view.trace.displayed.toLocaleString('en-US')}`;
  traceProvenance.textContent = `${view.trace.provenance} · generation ${view.trace.revision ?? 'unavailable'} · artifact ${view.trace.artifactIdentity ? `${view.trace.artifactIdentity.slice(0, 12)}…` : 'unavailable'}`;
}

function renderSharedInstrumentSummary(profile, state) {
  if (profile !== selectedCompilerProfile) return null;
  const summary = sharedInstrumentSummary(profile, state);
  if (!summary) return null;
  const previousSummary = sharedInstrumentSummaries.get(profile);
  const resultBecameStale = hasRequirementResultLinks(profile)
    && (summary.state !== 'current-runtime' || previousSummary?.artifactIdentity !== summary.artifactIdentity);
  if (resultBecameStale) {
    clearRequirementResultLinks(profile);
  }
  sharedInstrumentSummaries.set(profile, structuredClone(summary));
  const previousLocal = sharedInstrumentLocals.get(profile) ?? {};
  const view = sharedInstrumentView(summary, previousLocal);
  sharedInstrumentLocals.set(profile, structuredClone(view.local));
  window.__SHARED_INSTRUMENT_SUMMARY__ = structuredClone(summary);
  window.__SHARED_INSTRUMENT_VIEW__ = structuredClone(view);
  const roots = profile === AVR_PROFILE
    ? [elements.instrumentevidence]
    : [...document.querySelectorAll(`[data-instrument-profile="${profile}"]`)];
  for (const root of roots) {
    root.dataset.summaryState = summary.state;
    const stateNode = root.querySelector('[data-instrument-summary-state]');
    if (stateNode) stateNode.textContent = summary.state === 'current-runtime' ? 'Current runtime' : 'No current runtime';
    for (const [name, channel] of Object.entries(summary.channels)) {
      const node = root.querySelector(`[data-instrument-summary-channel="${name}"]`);
      if (!node) continue;
      node.dataset.classification = channel.classification;
      node.textContent = instrumentSummaryLine(channel);
    }
    renderSharedInstrumentTools(root, view);
  }
  if (resultBecameStale) renderRequirementTraceability();
  else refreshRequirementResultButtons(profile);
  return summary;
}

function renderStoredSharedInstrumentView(profile) {
  const summary = sharedInstrumentSummaries.get(profile);
  if (!summary || profile !== selectedCompilerProfile) return null;
  const view = sharedInstrumentView(summary, sharedInstrumentLocals.get(profile) ?? {});
  sharedInstrumentLocals.set(profile, structuredClone(view.local));
  window.__SHARED_INSTRUMENT_VIEW__ = structuredClone(view);
  const roots = profile === AVR_PROFILE
    ? [elements.instrumentevidence]
    : [...document.querySelectorAll(`[data-instrument-profile="${profile}"]`)];
  for (const root of roots) renderSharedInstrumentTools(root, view);
  return view;
}

function sharedInstrumentProfileFor(node) {
  const boundary = node.closest('[data-instrument-profile]');
  return boundary?.dataset.instrumentProfile ?? (node.closest('#instrument-evidence') ? AVR_PROFILE : null);
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
  cancelThermostatExperiment(
    thermostatProjectActive() ? `${message}. A fresh build is required before the experiment can run.` : null,
    { clearResults: true, render: false },
  );
  workerToken += 1;
  worker?.terminate();
  worker = null;
  if (runtimeRenderTimer !== null) clearTimeout(runtimeRenderTimer);
  runtimeRenderTimer = null; pendingRuntimeRender = null;
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
    const empty = result.project.circuit.components.length === 0;
    detachOutstandingBuild();
    stopRuntime('Circuit or source changed — rebuild required', { updateLifecycle: false });
    applyLifecycle({
      type: 'project.edit', relevance: 'build', empty,
    });
    publish({ buildState: empty ? 'empty' : 'dirty', artifactIdentity: null, inputIdentity: null, cacheHit: false });
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
    const allPaint = [...acceptedRoutePaint, ...proposedRoutePaint];
    const componentPrefix = `${layer.parentElement.dataset.componentId}.`;
    // A full cross-product keeps every tiny circuit-wire overlay available for
    // the detailed teaching view, but grows quadratically at the graph limit.
    // At that limit, only a route's own terminal card needs the clipped copy;
    // the canonical canvas path remains visible everywhere else.
    const visiblePaint = allPaint.length <= 64
      ? allPaint : allPaint.filter((record) => record.endpoint.startsWith(componentPrefix));
    for (const record of visiblePaint) {
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
  const automaticLaneObstacles = [];
  const records = [];
  const denseGraph = currentProject().circuit.nets.length > 64;
  for (const net of currentProject().circuit.nets) {
    const anchors = netAnchors(net, canvasBox);
    if (Object.keys(anchors).length < 2) continue;
    const storedRoute = currentProject().layout.wireRoutes[net.id];
    const family = materializeRouteFamily(net, storedRoute, anchors,
      storedRoute || denseGraph ? obstacles : [...obstacles, ...automaticLaneObstacles]);
    const branches = routeFamilyPaths(family, anchors);
    for (const branch of branches) {
      records.push({ net, family, anchors, branch, netId: net.id, points: branch.points });
      if (!storedRoute && !denseGraph) branch.points.slice(1, -1).forEach((point, index) => {
        const next = branch.points[index + 2];
        const laneMargin = 0.006;
        automaticLaneObstacles.push({
          left: Math.min(point.x, next.x) - laneMargin,
          right: Math.max(point.x, next.x) + laneMargin,
          top: Math.min(point.y, next.y) - laneMargin,
          bottom: Math.max(point.y, next.y) + laneMargin,
        });
      });
    }
  }
  const lanes = separateParallelWireLanes(records.map(({ netId, points }) => ({ netId, points })), {
    clearance: 0.012, obstacles, bounds: { left: -1, right: 2, top: -1, bottom: 2 },
  });
  const separated = records.map((record, index) => ({
    ...record, branch: { ...record.branch, points: lanes.routes[index].points },
  }));
  for (const { net, family, anchors, branch } of separated) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('circuit-wire');
      path.dataset.net = net.id;
      path.dataset.endpoint = endpointKey(branch.endpoint);
      path.dataset.kind = netKind(net);
      path.dataset.points = JSON.stringify(branch.points);
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
  for (const net of currentProject().circuit.nets) {
    const branches = separated.filter((record) => record.net.id === net.id).map((record) => record.branch);
    if (branches.length && currentProject().circuit.junctions.some((junction) => junction.net === net.id)) {
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
    card.addEventListener('click', () => {
      selectComponent(component.id);
      renderInspector();
      for (const candidate of elements.componentlayer.querySelectorAll('.circuit-component')) {
        candidate.classList.toggle('selected', candidate.dataset.componentId === component.id);
      }
    });
    cardPointerDrag(card, component.id);
    return card;
  });
  elements.componentlayer.replaceChildren(...cards);
  drawCircuitWires();
  if (currentProject().circuit.nets.length <= 64) {
    requestAnimationFrame(() => requestAnimationFrame(drawCircuitWires));
  }
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

function renderComponentSupportMatrix() {
  const profileId = elements.componentsupportprofile.value || selectedCompilerProfile || AVR_PROFILE;
  const profile = COMPONENT_SUPPORT_PROFILES.find((candidate) => candidate.id === profileId)
    ?? COMPONENT_SUPPORT_PROFILES[0];
  elements.componentsupportprofile.value = profile.id;
  const summary = componentSupportSummary(profile.id);
  elements.componentsupportsummary.textContent = `${summary.available} of ${summary.total} models available · ${summary.simulated} Simulated · ${summary.partial} Partial · ${summary.unavailable} Unavailable`;
  elements.componentsupportmode.textContent = profile.id === AVR_PROFILE
    ? 'Ordinary AVR projects show 5 Simulated parts. Candidate-v3 shows 13 by default; All statuses shows all 16 available AVR parts, including 3 Partial.'
    : 'This bounded profile exposes exactly 3 available entries: its fixed Partial controller, plus the Simulated resistor and LED. Other models are unavailable and are never silently substituted.';
  const cells = COMPONENT_SUPPORT_CELLS.filter((cell) => cell.profile === profile.id);
  const rows = COMPONENT_SUPPORT_MODELS.map((model) => {
    const cell = cells.find((candidate) => candidate.model === model.type);
    const row = document.createElement('tr');
    row.dataset.model = model.type; row.dataset.status = cell.status;
    const modelCell = document.createElement('th'); modelCell.scope = 'row';
    const name = document.createElement('strong'); name.textContent = model.name;
    const id = document.createElement('code'); id.textContent = model.type;
    modelCell.append(name, id);
    const statusCell = document.createElement('td');
    const badge = document.createElement('span'); badge.className = `matrix-status ${cell.status}`;
    badge.textContent = cell.status === 'unavailable' ? 'Unavailable' : SUPPORT_STATUS[cell.status];
    statusCell.append(badge);
    const modeCell = document.createElement('td'); modeCell.textContent = cell.projectMode;
    const limitCell = document.createElement('td'); limitCell.textContent = cell.limitations[0];
    row.append(modelCell, statusCell, modeCell, limitCell);
    return row;
  });
  elements.componentsupportbody.replaceChildren(...rows);
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

function candidateComponentPrefix(type) {
  return {
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
  }[type] ?? null;
}

function freshComponentId(type) {
  const prefix = editor.kind === 'candidate-project-v3' ? candidateComponentPrefix(type) : null;
  return prefix
    ? nextEntityId(prefix, currentProject().circuit.components.map((item) => item.id))
    : newComponent(type, currentProject().circuit).id;
}

function addComponent(type, point = null) {
  try {
    const candidatePrefix = candidateComponentPrefix(type);
    const component = editor.kind === 'candidate-project-v3' && candidatePrefix
      ? createCandidateUiComponent(type, freshComponentId(type))
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
    const position = snappedComponentPoint(point ?? (sameTypeCount === 0 ? firstPosition : {
      x: 0.12 + (slot % 4) * 0.25,
      y: 0.12 + Math.floor(slot / 4) * 0.25,
    }));
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
    let committing = false;
    input.addEventListener('change', () => {
      if (committing) return;
      committing = true;
      const next = typeof value === 'number' ? Number(input.value) : typeof value === 'boolean' ? input.value === 'true' : input.value;
      const result = applyEditor({ type: 'component.property.set', componentId: component.id, key, value: next }, `Updated ${component.id}.${key}`);
      if (!result?.ok) committing = false;
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
  if (!points.length) {
    const summary = document.createElement('p');
    summary.textContent = 'Automatic body-avoiding orthogonal route. Choose one named branch below, or add a bend to override it.';
    const buttons = net.endpoints.map((item) => {
      const endpoint = endpointKey(item);
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${endpoint} · automatic route`;
      button.addEventListener('click', () => requestAnimationFrame(() => elements.circuitwires.querySelector(
        `.wire-segment-hit[data-net="${net.id}"][data-endpoint="${endpoint}"]`,
      )?.focus()));
      return button;
    });
    elements.wirebends.replaceChildren(summary, ...buttons);
    return;
  }
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
  renderThermostatExperimentPanel();
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

window.__M6_INSTRUMENT_RENDER_BENCHMARK__ = () => {
  const records = Array.from({ length: SERIAL_HISTORY_MAX }, (_, index) => ({
    direction: index % 7 === 0 ? 'rx' : 'tx', value: 65 + (index % 26), cycle: index * 160,
  }));
  const serialStarted = performance.now();
  const serialNode = document.createElement('pre');
  serialNode.textContent = serialEventText(records);
  const serialMilliseconds = performance.now() - serialStarted;
  const transitions = Array.from({ length: 500 }, (_, index) => ({
    pin: index % 2 ? 'D13' : 'D2', cycle: index * 160, level: Boolean(index % 4),
  }));
  const waveformStarted = performance.now();
  const model = waveformPaths(transitions, ['D2', 'D13'], { edgeLimit: 500 });
  const waveformNode = svgNode('svg');
  waveformNode.replaceChildren(...model.paths.map((path) => svgNode('path', { d: path.d })));
  const cursors = cursorCycles(model, 0.25, 0.75);
  waveformNode.append(
    svgNode('line', { 'data-cycle': cursors.first }),
    svgNode('line', { 'data-cycle': cursors.second }),
  );
  const waveformMilliseconds = performance.now() - waveformStarted;
  return {
    schema: 'intent-mcu-instrument-render-benchmark@1',
    serial: { records: records.length, textLength: serialNode.textContent.length, milliseconds: serialMilliseconds },
    logic: { edges: model.records.length, paths: waveformNode.querySelectorAll('path').length, cursors: waveformNode.querySelectorAll('line').length, milliseconds: waveformMilliseconds },
  };
};

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

function renderRuntime(message, { publishState = true } = {}) {
  if (publishState) publish({ runtime: structuredClone(message) });
  renderInstrumentEvidence(message);
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
  void advanceThermostatExperiment(message);
  renderThermostatExperimentPanel();
}

function scheduleWorkerRuntimeRender(message) {
  publish({ runtime: message });
  pendingRuntimeRender = message;
  if (message.paused !== false || message.kind === 'ready' || message.kind === 'error' || message.kind === 'stopped-error') {
    if (runtimeRenderTimer !== null) clearTimeout(runtimeRenderTimer);
    runtimeRenderTimer = null; pendingRuntimeRender = null;
    renderRuntime(message, { publishState: false });
    return;
  }
  if (runtimeRenderTimer !== null) return;
  runtimeRenderTimer = setTimeout(() => {
    runtimeRenderTimer = null;
    const latest = pendingRuntimeRender; pendingRuntimeRender = null;
    if (latest) renderRuntime(latest, { publishState: false });
  }, 100);
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
    scheduleWorkerRuntimeRender(data);
  });
  worker.addEventListener('error', (event) => {
    if (token !== workerToken) return;
    running = false; const state = { kind: 'stopped-error', message: event.message };
    applyLifecycle({ type: 'runtime.message', binding: runtimeBinding, message: state });
    publish({ runtime: state });
    cancelThermostatExperiment(`Experiment unresolved: ${event.message}. Nothing was marked passed.`, { clearResults: false });
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
elements.catalogsupportopen.addEventListener('click', () => {
  elements.componentsupportprofile.value = selectedCompilerProfile;
  renderComponentSupportMatrix();
  elements.componentsupportdialog.showModal();
});
elements.componentsupportclose.addEventListener('click', () => elements.componentsupportdialog.close());
elements.componentsupportdialog.addEventListener('close', () => elements.catalogsupportopen.focus());
elements.componentsupportprofile.addEventListener('change', renderComponentSupportMatrix);
elements.catalogprev.addEventListener('click', () => {
  catalogWindowStart = Math.max(0, catalogWindowStart - CATALOG_WINDOW_LIMIT); renderCatalog();
});
elements.catalognext.addEventListener('click', () => {
  catalogWindowStart += CATALOG_WINDOW_LIMIT; renderCatalog();
});
elements.circuitcanvas.addEventListener('dragover', (event) => event.preventDefault(), true);
elements.circuitcanvas.addEventListener('drop', (event) => {
  event.preventDefault(); const type = event.dataTransfer.getData('application/x-intent-component'); if (!uiComponentCatalog[type]?.selectable) return;
  const box = elements.circuitcanvas.getBoundingClientRect(); const view = currentProject().layout.viewport;
  const x = Math.max(0.07, Math.min(0.93, ((event.clientX - box.left) / box.width - 0.5 - view.panX) / view.zoom + 0.5));
  const y = Math.max(0.08, Math.min(0.92, ((event.clientY - box.top) / box.height - 0.5 - view.panY) / view.zoom + 0.5));
  addComponent(type, { x, y });
}, true);
elements.source.addEventListener('input', () => {
  latestBuildResult = null;
  elements.diagnosticlinks.replaceChildren();
  elements.diagnostics.textContent = 'Source changed — build again for current diagnostics.';
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
elements.reset.addEventListener('click', () => {
  if (!worker) return;
  renderInstrumentEvidence(null);
  worker.postMessage({ command: 'reset' });
});
elements.thermostatruntests.addEventListener('click', startThermostatExperiment);
elements.thermostatloadbad.addEventListener('click', () => loadThermostatFirmwareVariant('known-bad-equality'));
elements.thermostatrestore.addEventListener('click', () => loadThermostatFirmwareVariant('correct'));
elements.scenarioadd.addEventListener('click', () => {
  if (!scenarioTimelineEditor) {
    scenarioTimelineEditor = new ScenarioTimelineEditor(defaultThermostatScenarioTimeline());
    authoredScenarioResults = [];
    persistProject();
    elements.scenarioeditormessage.textContent = 'Editable timeline created. Firmware and its loaded artifact identity were not changed.';
    renderThermostatExperimentPanel();
    requestAnimationFrame(() => elements.scenariolist.querySelector('input')?.focus());
    return;
  }
  const scenario = authoredScenarioTemplate();
  applyScenarioTimelineCommand({ type: 'scenario.add', scenario }, { focusId: `${scenario.id}-name` });
});
elements.scenarioundo.addEventListener('click', () => applyScenarioTimelineCommand({ type: 'undo' }));
elements.scenarioredo.addEventListener('click', () => applyScenarioTimelineCommand({ type: 'redo' }));
elements.scenariorun.addEventListener('click', startAuthoredScenarioExperiment);
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

elements.serialtab.addEventListener('click', () => {
  if (selectedCompilerProfile !== AVR_PROFILE) {
    setSerialDock(false);
    sharedWorkbenchShell.openSerial();
    return;
  }
  setSerialDock(elements.serialtab.getAttribute('aria-expanded') !== 'true');
});
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
document.addEventListener('click', (event) => {
  const clear = event.target.closest('[data-shared-serial-clear]');
  const exportButton = event.target.closest('[data-shared-serial-export]');
  if (!clear && !exportButton) return;
  const profile = sharedInstrumentProfileFor(event.target);
  const summary = profile ? sharedInstrumentSummaries.get(profile) : null;
  if (!profile || !summary || summary.state !== 'current-runtime') return;
  const local = sharedInstrumentLocals.get(profile) ?? {};
  if (clear) {
    sharedInstrumentLocals.set(profile, { ...local, cleared: true });
    renderStoredSharedInstrumentView(profile);
    return;
  }
  const exportView = sharedInstrumentView(summary, { ...local, cleared: false });
  downloadText(`intent-mcu-${profile.replace(/[^a-z0-9]+/giu, '-')}-serial.txt`, exportView.serial.text);
});
document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-shared-pin-select], [data-shared-trace-select]');
  if (!select) return;
  const profile = sharedInstrumentProfileFor(select);
  if (!profile) return;
  const local = sharedInstrumentLocals.get(profile) ?? {};
  sharedInstrumentLocals.set(profile, select.matches('[data-shared-trace-select]')
    ? { ...local, selectedTraceChannel: select.value }
    : { ...local, selectedPin: select.value });
  renderStoredSharedInstrumentView(profile);
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
  const newId = freshComponentId(source.type);
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
  const collapsed = selectedCompilerProfile === AVR_PROFILE
    ? document.querySelector('.workspace').classList.toggle(className)
    : sharedWorkbenchShell.toggle(kind === 'catalog' ? 'parts' : 'inspector');
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

function createNewAvrProject() {
  editor = new ProjectEditorReducer(createEmptyProject());
  scenarioTimelineEditor = null; authoredScenarioResults = [];
  installProjectGeneration({ empty: true, reason: 'project.new', runtimeMessage: 'New empty project — build required' });
  selectedSourceFile = 'main.ino';
  clearProjectFileConnection(AVR_PROFILE);
  fileSavedRevision = null; fileSavedProjectGeneration = null; fileSaveState = null;
  localStorage.removeItem(PROJECT_STORAGE_KEY); localStorage.removeItem(PROJECT_RECOVERY_KEY); renderCatalog(); renderProject();
  setProjectBaseline(AVR_PROFILE);
  elements.projectmessage.textContent = 'Created an actually empty project.';
}
elements.projectnew.addEventListener('click', () => {
  if (requestUnsavedChangeGuard({ profile: AVR_PROFILE, actionLabel: 'creating a new empty project', continueAction: createNewAvrProject })) return;
  createNewAvrProject();
});
function loadExampleProject(exampleId, reason = 'project.demo', { firmwareVariant = 'correct' } = {}) {
  const referenceCard = avrReferenceStarterCatalog().find((entry) => entry.id === exampleId);
  if (referenceCard) {
    const before = currentProjectText();
    let example;
    try { example = createAvrReferenceStarter(exampleId); }
    catch (error) {
      showActionableError(elements.projectmessage, error?.message ?? 'EXAMPLE_INVALID', 'AVR reference starter could not be constructed.');
      return { ok: false, code: error?.message ?? 'EXAMPLE_INVALID' };
    }
    const parsed = openCandidateUiSession(example.text);
    if (!parsed.ok) {
      showActionableError(elements.projectmessage, parsed.code, 'AVR reference starter was rejected atomically; project unchanged.');
      if (currentProjectText() !== before) throw new Error('Atomic AVR reference starter boundary violated');
      return parsed;
    }
    editor = parsed.session;
    scenarioTimelineEditor = null; authoredScenarioResults = [];
    installProjectGeneration({ empty: false, reason, runtimeMessage: `${example.name} loaded — build required` });
    selectedSourceFile = 'main.ino';
    elements.exampleselect.value = exampleId;
    persistProject();
    publish({ lastAction: `${exampleId.toUpperCase()}_LOADED`, importReport: parsed.report ?? parsed.code });
    renderCatalog(); renderProject();
    elements.projectmessage.textContent = `${example.name} loaded as authored data only. Build fresh, then ${example.try.toLowerCase()}`;
    return { ok: true, code: parsed.code, example };
  }
  if (exampleId === THERMOSTAT_EXPERIMENT_ID) {
    const before = currentProjectText();
    let example;
    try { example = createThermostatExperiment(firmwareVariant); }
    catch (error) {
      showActionableError(elements.projectmessage, error?.message ?? 'EXAMPLE_INVALID', 'Thermostat experiment could not be constructed.');
      return { ok: false, code: error?.message ?? 'EXAMPLE_INVALID' };
    }
    const parsed = openThermostatExperiment(example.text);
    if (!parsed.ok) {
      showActionableError(elements.projectmessage, parsed.code, 'Thermostat experiment was rejected atomically; project unchanged.');
      if (currentProjectText() !== before) throw new Error('Atomic thermostat example boundary violated');
      return parsed;
    }
    editor = parsed.session;
    scenarioTimelineEditor = new ScenarioTimelineEditor(defaultThermostatScenarioTimeline());
    authoredScenarioResults = [];
    installProjectGeneration({
      empty: false, reason, runtimeMessage: `${example.name} loaded — build required`,
    });
    selectedSourceFile = 'main.ino';
    elements.exampleselect.value = exampleId;
    thermostatExperimentNotice = 'Build this exact local project before running the three boundary scenarios.';
    persistProject();
    publish({ lastAction: 'THERMOSTAT_EXPERIMENT_LOADED', importReport: parsed.report ?? parsed.code });
    renderCatalog(); renderProject();
    elements.projectmessage.textContent = `${example.name} loaded with exact A1 sensor, D2 active-low button and current-limited D13 indicator wiring.`;
    return { ok: true, code: parsed.code, example };
  }
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
    scenarioTimelineEditor = null; authoredScenarioResults = [];
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
  const cards = [...exampleCatalog(), TEMPERATURE_LCD_THRESHOLD_CARD, THERMOSTAT_EXPERIMENT_CARD, ...avrReferenceStarterCatalog()].map((example) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'starter-card'; button.dataset.example = example.id;
    button.setAttribute('aria-label', `Open ${example.name}: ${example.focus}`);
    const focus = document.createElement('span'); focus.className = 'starter-focus'; focus.textContent = example.focus;
    const name = document.createElement('strong'); name.textContent = example.name;
    const description = document.createElement('span'); description.className = 'starter-description'; description.textContent = example.description;
    const parts = document.createElement('span'); parts.className = 'starter-parts'; parts.textContent = example.partsLabel;
    const outcome = document.createElement('span'); outcome.className = 'starter-outcome'; outcome.textContent = example.outcome ?? example.observe;
    const action = document.createElement('span'); action.className = 'starter-action'; action.textContent = 'Open working circuit →';
    button.append(focus, name, description, parts, outcome);
    if (example.learn) {
      const guide = document.createElement('span'); guide.className = 'starter-learning-grid';
      for (const [label, value] of [['Learn', example.learn], ['Try', example.try], ['Observe', example.observe], ['Limits', example.limits]]) {
        const row = document.createElement('span'); const title = document.createElement('b'); title.textContent = label;
        row.append(title, document.createTextNode(value)); guide.append(row);
      }
      button.append(guide);
    }
    button.append(action);
    button.addEventListener('click', () => loadExampleProject(example.id, 'project.starter'));
    return button;
  });
  elements.starterexamples.replaceChildren(...cards);
}

elements.projectdemo.addEventListener('click', () => loadExampleProject(elements.exampleselect.value));
function syncControllerSelectors(profile) {
  const adapter = sharedWorkbenchShell.adapter(profile);
  if (!adapter) return;
  elements.familyselect.value = adapter.groupId;
  for (const option of elements.boardselect.options) option.hidden = option.dataset.group !== adapter.groupId;
  elements.boardselect.value = profile;
}
elements.familyselect.addEventListener('change', () => {
  const option = [...elements.boardselect.options].find((candidate) => candidate.dataset.group === elements.familyselect.value);
  if (!option) return;
  elements.boardselect.value = option.value;
  elements.boardselect.dispatchEvent(new Event('change', { bubbles: true }));
});
elements.boardselect.addEventListener('change', () => {
  const previousProfile = selectedCompilerProfile;
  const selected = candidateCompilerTarget(elements.boardselect.value);
  selectedCompilerProfile = selected ? selected.profile : AVR_PROFILE;
  if (previousProfile !== selectedCompilerProfile) clearRequirementResultLinks(previousProfile);
  if (previousProfile !== selectedCompilerProfile) clearProjectPatchReview('Profile changed. Review a patch for the active project.');
  syncControllerSelectors(selectedCompilerProfile);
  if (elements.componentsupportdialog.open) {
    elements.componentsupportprofile.value = selectedCompilerProfile;
    renderComponentSupportMatrix();
  }
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
  renderProjectBrief();
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
elements.recoveryexport.addEventListener('click', () => downloadText('intent-mcu-recovery.json', commonProjectText(AVR_PROFILE), 'application/json'));
elements.projectreload.addEventListener('click', () => {
  const recovery = localStorage.getItem(PROJECT_RECOVERY_KEY);
  const stored = recovery ?? localStorage.getItem(PROJECT_STORAGE_KEY); const parsed = stored ? parseAvrRecoverySource(stored) : { ok: false, code: 'NO_LOCAL_SAVE' };
  if (!parsed.ok) { showActionableError(elements.projectmessage, parsed.code, 'Reload validation failed.'); return; }
  editor = parsed.session;
  scenarioTimelineEditor = parsed.scenarioTimeline
    ? new ScenarioTimelineEditor(parsed.scenarioTimeline) : null;
  authoredScenarioResults = [];
  installProjectGeneration({
    empty: editor.project.circuit.components.length === 0, reason: 'project.reload',
    runtimeMessage: 'Reloaded project requires build',
  });
  selectedSourceFile = 'main.ino';
  savedRevision = editor.revision; savedProjectGeneration = lifecycle.projectGeneration;
  renderCatalog(); renderProject(); elements.projectmessage.textContent = 'Restored and revalidated browser recovery. Previous runtime output was cleared; save a project file for durable storage.';
});
elements.projectexport.addEventListener('click', () => saveLegacyProject(AVR_PROFILE));

elements.walkthroughopen.addEventListener('click', () => elements.walkthrough.showModal());
elements.unsavedkeep.addEventListener('click', closeUnsavedChangeGuard);
elements.unsavedchangedialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeUnsavedChangeGuard();
});
elements.unsavedchangedialog.addEventListener('click', (event) => {
  if (event.target === elements.unsavedchangedialog) closeUnsavedChangeGuard();
});
elements.unsaveddownload.addEventListener('click', () => {
  const pending = pendingDestructiveProjectAction;
  if (!pending) return;
  const result = saveCommonProject(pending.profile);
  elements.unsavedchangestatus.textContent = result.ok
    ? 'Download requested. Your browser or operating system decides whether and where it is stored. Choose Keep editing or Discard and continue.'
    : 'Download could not be requested. Your project is unchanged; choose Keep editing or try again.';
});
elements.unsaveddiscard.addEventListener('click', () => {
  const pending = pendingDestructiveProjectAction;
  if (!pending) return;
  if (selectedCompilerProfile !== pending.profile
    || authoredProjectFingerprint(pending.profile) !== pending.fingerprint) {
    closeUnsavedChangeGuard();
    profileMessage(pending.profile, 'The project changed while the decision was open. The older action was cancelled; your newer draft is unchanged.');
    return;
  }
  pendingDestructiveProjectAction = null;
  elements.unsavedchangedialog.close('discard');
  pending.continueAction();
});
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
    elements.promptoutput.value = generatePromptBridgeV2(currentRuntimeProject(), projectBriefForProfile(selectedCompilerProfile).openAssumptions);
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
    cancelThermostatExperiment('Experiment unresolved: worker watchdog expired. Nothing was marked passed.', { clearResults: false });
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
syncControllerSelectors(selectedCompilerProfile);

let stored = null; let recoveryStored = null;
try { stored = localStorage.getItem(PROJECT_STORAGE_KEY); recoveryStored = localStorage.getItem(PROJECT_RECOVERY_KEY); } catch { /* storage denial is recoverable */ }
const recoveryRestored = recoveryStored ? parseAvrRecoverySource(recoveryStored) : null;
const currentRestored = stored ? parseAvrRecoverySource(stored) : null;
const restored = recoveryRestored?.ok ? recoveryRestored : currentRestored;
editor = restored?.ok ? restored.session : new ProjectEditorReducer(createEmptyProject());
scenarioTimelineEditor = restored?.scenarioTimeline
  ? new ScenarioTimelineEditor(restored.scenarioTimeline) : null;
authoredScenarioResults = [];
lifecycle = createLifecycleState({ empty: currentProject().circuit.components.length === 0 });
if (restored?.ok) persistProject();
const workspace = document.querySelector('.workspace');
for (const [name, button] of [['catalog-collapsed', elements.togglecatalog], ['inspector-collapsed', elements.toggleinspector]]) {
  if (workspacePreference(name)) { workspace.classList.add(name); button.setAttribute('aria-pressed', 'true'); }
}
if (workspacePreference('pin-labels')) { elements.circuitcanvas.classList.add('show-pin-labels'); elements.showpinlabels.setAttribute('aria-pressed', 'true'); }
renderCompilerTarget(); renderCatalog(); renderProject(); renderProjectBrief(); setRuntimeEnabled(false);
clearRuntimePresentation(); renderLifecycle();
setCanvasInteractionMode('select'); setSerialDock(false);
elements.projectmessage.textContent = recoveryRestored?.ok
  ? 'Recovered and revalidated an interrupted local save. Rebuild before Run.'
  : restored?.ok ? 'Reopened and revalidated the local project. Rebuild before Run.'
    : stored || recoveryStored ? 'A saved value was invalid and was left untouched. The empty in-memory project can be exported before retrying.'
      : 'No example or hidden template is loaded.';
if ((stored || recoveryStored) && !restored?.ok) elements.recoveryexport.disabled = false;
for (const profile of [AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE]) setProjectBaseline(profile);
installNativeFileControls();
window.__UNSAVED_CHANGE_GUARD__ = Object.freeze({
  isDirty: (profile = selectedCompilerProfile) => isProjectDirty(profile),
  baseline: (profile = selectedCompilerProfile) => projectBaselines.get(profile),
  pending: () => pendingDestructiveProjectAction
    ? { token: pendingDestructiveProjectAction.token, profile: pendingDestructiveProjectAction.profile }
    : null,
});
