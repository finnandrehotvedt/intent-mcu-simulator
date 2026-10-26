// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { installX81Assessment } from './x81-assessment-controller.mjs';
import { X81_RETAINED_ASSESSMENT } from '../src/x81-retained-assessment.mjs';
import { BOUNDED_3V3_UI_COMPONENTS, validateBounded3v3AuthoringGraph } from '../src/bounded-3v3-authoring-contracts.mjs';

import {
  CATALOG_CATEGORIES,
  COMPONENT_CATALOG,
  SUPPORT_STATUS,
  CIRCUIT_LIMITS,
  catalogEntries,
  defaultProperties,
  filterCatalog,
} from '../src/component-catalog.mjs';
import { createAccessibleConnectionView } from '../src/accessible-connections.mjs';
import {
  bomNetlistInputGuard, createBomNetlistExport, parseBomNetlistText,
} from '../src/bom-netlist-export.mjs';
import {
  accessibleDemonstrationInputGuard, accessibleMeasurementsFromSharedSummary,
  avrAccessibleRuntimeBindingMatches, createAccessibleDemonstration,
  validateAccessibleDemonstrationSvg,
} from '../src/accessible-demonstration-export.mjs';
import { createProjectNavigationView, searchProjectNavigation } from '../src/project-navigation.mjs';
import { CIRCUIT_SCHEMA, validateCircuit } from '../src/circuit-engine.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { pinTargetGuidance } from '../src/pin-target-guidance.mjs';
import { RELEASE_VERSION } from '../src/release-metadata.mjs';
import { isRetryableCapacityCode, retryGuidanceFromResponse, retryMessage, retryResultFields } from '../src/retry-guidance.mjs';
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
  COMPONENT_BODY_BOUNDS,
  LED_APPEARANCE_PRESETS,
  RESISTOR_APPEARANCE_PRESETS,
  componentAppearanceBody,
  componentAppearanceBodyOrNull,
  componentAppearancePreset,
  componentAppearanceInvariantReview,
  componentAppearanceInvariantSnapshot,
  withComponentAppearance,
  withComponentAppearanceBody,
} from '../src/component-appearance.mjs';
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
import {
  MODEL_RUNTIME_BINDING_SCHEMA, RUNTIME_BINDING_SCHEMA, validateWorkerRuntimeIdentity,
} from '../src/runtime-identity.mjs';
import {
  createX47WorkerBinding, X47_RUNTIME_AUTHORITY_SCHEMA, validateX47CancelReceipt,
} from '../src/x47-runtime-transaction.mjs';
import { acceptX46UsartRuntimeSnapshot } from '../src/x46-usart-runtime-boundary.mjs';
import { createX47UiOwner } from '../src/x47-ui-integration.mjs';
import {
  captureX47PulseSource, createX47PulseContextFromSource,
} from '../src/x47-avr-d2-pulse.mjs';
import {
  createX47RepeatableApplyRequest, validateX47RepeatableRecord,
} from '../src/x47-repeatable-inputs.mjs';
import { mountSharedWorkbenchShell } from '../src/shared-workbench-shell.mjs';
import {
  avrInstrumentPresentationEvidence, instrumentCapability, sharedInstrumentPresentationSummary,
  sharedInstrumentSummary, sharedInstrumentView,
} from '../src/instrument-capabilities.mjs';
import {
  X46_UART_PANEL_INPUT_SCHEMA, assessX46UartReadonlyPanel,
} from '../src/x46-uart-readonly-panel.mjs';
import { renderX46UartReadonlyPanel } from '../src/x46-uart-readonly-panel-view.mjs';
import {
  completenessAcademicStatus, createMeasurementReportEnvelope, measurementCompletenessDisclosure,
  measurementRequirementStatus, validateMeasurementReportEnvelope,
} from '../src/measurement-completeness.mjs';
import {
  canonicalCheckableEvidenceText, checkableEvidenceDisclosure,
  checkableEvidenceDownloadSha256, createCheckableEvidenceReport,
  validateCheckableEvidenceReport,
} from '../src/checkable-evidence-report.mjs';
import {
  EXPERIMENT_PACKAGE_COMPARISON_LIMITS,
  compareExperimentPackages,
  parseExperimentComparisonSlot,
} from '../src/experiment-package-comparison.mjs';
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
  PCF8574_LCD_HELLO_CARD, PCF8574_LCD_HELLO_EXAMPLE_ID, createPcf8574LcdHelloExample,
} from '../expansion-drafts/pcf8574-lcd-hello-example-v1.mjs';
import {
  THERMOSTAT_EXPERIMENT_ID,
  THERMOSTAT_SCENARIOS,
  THERMOSTAT_TIME,
  thermostatScenarioControls,
} from '../src/thermostat-experiment-contract.mjs';
import {
  THERMOSTAT_EXPERIMENT_CARD,
  THERMOSTAT_EXPERIMENT_SOURCE,
  createThermostatExperiment,
  isThermostatExperimentProject,
  openThermostatExperiment,
  thermostatFirmwareSource,
  thermostatFirmwareVariant,
} from '../src/thermostat-experiment.mjs';
import {
  X48_AUTHORITY_SCHEMA,
  X48_PLANT_CONTRACT_IDENTITY,
  X48_PLANT_ID,
  X48_PROFILE,
  X48_SCHEMA,
  createX48Binding,
  createX48OperationEpochOwner,
  validateX48Binding,
  validateX48Result,
} from '../src/x48-ideal-room-plant.mjs';
import {
  ScenarioTimelineEditor, defaultThermostatScenarioTimeline, faultInjectionThermostatTimeline,
  generateSeededThermostatTimeline, scenarioTimelineRuntimeEvents,
} from '../src/scenario-timeline.mjs';
import { aggregateExperimentOutcomes, completedExperimentOutcome } from '../src/experiment-outcomes.mjs';
import {
  X26_REGRESSION_MATRIX, createExpectationOverride, regressionFixture,
  regressionMatrixIdentity, sha256Text,
} from '../src/regression-matrix-contract.mjs';
import {
  executeRegressionMatrix, regressionReportPassed,
} from '../src/regression-matrix-runner.mjs';
import {
  acceptedX26VersionReport, validateX26VersionReport,
  x26SyntheticExpectationMutation, x26VersionReportPassed,
} from '../src/x26-version-regression-contract.mjs';
import {
  createPartitionEvidence, projectCoverageReport,
} from '../src/coverage-report.mjs';
import {
  X28_LONG_DURATION_SUITE, longDurationSuiteIdentity,
} from '../src/long-duration-contract.mjs';
import {
  executeLongDurationSuite, longDurationReportPassed,
} from '../src/long-duration-runner.mjs';
import { longDurationPresentation } from '../src/long-duration-presentation.mjs';
import {
  TIME_REPORT_SCHEMA, X29_FIXTURE_SOURCE, X29_TIME_SUITE, semanticTimeProjection,
  stableTimeStringify, timeReportPassed, timeSha256, timeSuiteIdentity,
  validateTimeReport, validateTimeRequirement, virtualNanoseconds,
} from '../src/time-invariance-contract.mjs';
import {
  EVENT_ORDER_REPORT_SCHEMA, X30_EVENT_ORDER_SUITE, evaluateEventOrderPhases,
  eventOrderExecutionProjection, eventOrderReportPassed, eventOrderSha256,
  eventOrderSuiteIdentity, semanticEventOrderProjection, stableEventOrderStringify,
  validateEventOrderPlan, validateEventOrderReport,
} from '../src/event-order-contract.mjs';
import {
  RESET_CLASS_REPORT_SCHEMA, RESET_CLASSES, X31_RESET_CLASS_SUITE,
  evaluateResetClassExecution, resetClassReportPassed, resetClassSha256,
  resetClassSuiteIdentity, resetExecutionProjection, semanticResetClassProjection,
  stableResetStringify, validateResetClass, validateResetClassReport,
} from '../src/reset-class-contract.mjs';
import { executeResetClass } from '../src/reset-class-runner.mjs';
import {
  UNSUPPORTED_ACCESS_REPORT_SCHEMA, X32_FAULT_SOURCE, X32_GOOD_SOURCE,
  X32_UNSUPPORTED_ACCESS_SUITE, evaluateUnsupportedAccessExecution,
  semanticUnsupportedAccessProjection, stableUnsupportedAccessStringify,
  unsupportedAccessExecutionProjection, unsupportedAccessReportPassed,
  unsupportedAccessSha256, unsupportedAccessSuiteIdentity,
  validateUnsupportedAccessDetector, validateUnsupportedAccessReport,
} from '../src/unsupported-access-contract.mjs';
import {
  goodCompanionFromWorker, unsupportedAccessExecutionFromWorker,
} from '../src/unsupported-access-runner.mjs';
import {
  DIGITAL_STATE_REPORT_SCHEMA, X33_DIGITAL_STATE_SUITE, digitalStateReportPassed,
  digitalStateRepeatProjection, digitalStateSha256, digitalStateSuiteIdentity,
  semanticDigitalStateProjection, stableDigitalStateStringify,
  validateDigitalStateAnnotations, validateDigitalStateReport,
} from '../src/digital-state-contract.mjs';
import { runDigitalStateRepeat } from '../src/digital-state-runner.mjs';
import {
  X33_RUNTIME_CIRCUIT, X33_RUNTIME_REPORT_SCHEMA, X33_RUNTIME_SOURCE, X33_RUNTIME_SUITE,
  projectX33RuntimeRows, semanticX33RuntimeProjection, stableX33RuntimeStringify,
  validateX33RuntimeReport, x33RuntimeRepeatProjection, x33RuntimeReportPassed,
  x33RuntimeSha256, x33RuntimeSuiteIdentity, x33RuntimeTopologyIdentity,
} from '../src/x33-runtime-state-contract.mjs';
import { parseX34ProbeSymbol } from '../src/x34-avr-probe-symbol.mjs';
import {
  X34_FIXTURE_ID, X34_INSTRUMENTED_SOURCE,
} from '../src/x34-precision-fixture.mjs';
import { X34_RUNTIME_PROBE_SCHEMA } from '../src/x34-precision-observer.mjs';
import {
  X34_PRECISION_SUITE, X34_REPORT_SCHEMA, evaluateX34Repeat, semanticX34Projection,
  stableX34Stringify, validateX34Report, x34RepeatProjection, x34ReportPassed,
  x34Sha256, x34SuiteIdentity,
} from '../src/x34-precision-contract.mjs';
import {
  X35_CAUSAL_SUITE, X35_REPORT_SCHEMA, X35_RUNTIME_PROBE_SCHEMA,
  evaluateX35Repeat, semanticX35Projection, stableX35Stringify,
  validateX35Report, x35RepeatProjection, x35ReportPassed, x35Sha256,
  x35SuiteIdentity,
} from '../src/x35-causal-chain-contract.mjs';
import {
  X36_REPLAY_REPORT_SCHEMA, X36_REPLAY_SUITE, X36_SUITE_ID,
  createX36ReplayRecipe, semanticX36Projection, validateX36ReplayReport,
  x36RepeatProjection, x36ReplayReportPassed, x36Sha256, x36SuiteIdentity,
} from '../src/x36-failure-replay-contract.mjs';
import {
  createX39FailureLocator, validateX39FailureLocator,
} from '../src/x39-failure-navigation.mjs';
import {
  createX40SharedTimeline, validateX40SharedTimeline, x40TimelineRetainsForLifecycle,
  x40TimelineRetainsForWorkerMessage,
} from '../src/x40-shared-timeline.mjs';
import {
  X23_USART_KNOWN_BAD_SOURCE, X23_USART_REPORT_SCHEMA, X23_USART_SOURCE,
  X23_USART_SUITE, X23_USART_SUITE_ID, createX23UsartRecipe,
  semanticX23UsartProjection, validateX23UsartReport, x23UsartReportPassed,
  x23UsartRunProjection, x23UsartSha256, x23UsartSuiteIdentity,
} from '../src/x23-usart-response-contract.mjs';
import {
  COUNTEREXAMPLE_REDUCTION_SEED, reduceThermostatCounterexample,
} from '../src/counterexample-reduction.mjs';
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
import { explainProfileMigration } from '../src/profile-migration-explanation.mjs';
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
  RP2040_PICO_BOARD_DEFINITION, RP2040_PICO_COMPONENT_CATALOG,
  validateRp2040PicoCircuit,
} from '../src/rp2040-pico-circuit.mjs';
import { ESP32C3_BOARD_DEFINITION, ESP32C3_PUBLIC_COMPONENT_CATALOG, validateEsp32C3Circuit } from '../src/esp32c3-public-circuit.mjs';
import {
  C3_PUBLIC_PROJECT_SCHEMA,
  Esp32C3PublicWorkbench,
  normalizeEsp32C3PublicProject,
} from '../src/esp32c3-public-workbench.mjs';
import { STM32_BOARD_DEFINITION, STM32_PUBLIC_COMPONENT_CATALOG, validateStm32Circuit } from '../src/stm32-public-circuit.mjs';
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
  migrateProjectModelLibrary,
  normalizeProjectBrief,
  preparePublishedRecoveryProjectEnvelope,
  prepareProjectEnvelope,
} from '../src/project-envelope.mjs';
import {
  IndexedDbLocalVersionVault,
  LOCAL_HISTORY_ENABLED_KEY,
  createHistoryRecord,
  inspectHistoryRecord,
} from '../src/local-version-history.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK,
  RETAINED_MODEL_LIBRARY_LOCK,
  modelLibraryExecutionIdentity,
  modelLibraryMigrationPreview,
  resolveModelLibrary,
} from '../src/model-library.mjs';
import {
  createRequirementResultLink,
  currentRequirementResultLink,
} from '../src/requirement-traceability.mjs';
import { evaluateProjectFeasibility } from '../src/project-feasibility.mjs';
import {
  PROJECT_PATCH_SCHEMA,
  REFERENCED_PROJECT_PATCH_SCHEMA,
  createProjectPatchPrompt,
  projectTextSha256,
  reviewProjectPatch,
} from '../src/project-patch.mjs';
import {
  X92_BUDGET_SCHEMA,
  X92_DEFAULT_LIMITS,
  X92_REVIEW_SCHEMA,
  X92_RUNTIME_QUIESCENCE_ACK_SCHEMA,
  createX92BudgetedExecutor,
  createX92ExperimentBudget,
  parseX92ReviewProjection,
} from '../src/x92-experiment-budget.mjs';
import {
  PRESENTATION_DRAFT_SCHEMA,
  PRESENTATION_INSTRUMENTS,
  PRESENTATION_LIMITS,
  PRESENTATION_PROFILE,
  createPresentationViewOwner,
  normalizePresentationDraft,
} from '../src/presentation-view.mjs';
import {
  TEACHING_EXERCISE_PROFILE,
  TEACHING_EXERCISE_SCHEMA,
  TEACHING_EXERCISE_LIMITS,
  canonicalTeachingExercise,
  normalizeTeachingExercise,
  parseTeachingExercise,
  teachingExerciseAuthority,
} from '../src/teaching-exercise-package.mjs';
import {
  ANNOTATED_WORKSPACE_SCHEMA,
  LEGACY_ANNOTATED_WORKSPACE_SCHEMA,
  PRE_SUBCIRCUIT_ANNOTATED_WORKSPACE_SCHEMA,
  CANVAS_ANNOTATIONS_SCHEMA,
  CANVAS_ANNOTATION_LIMITS,
  NET_LABELS_SCHEMA,
  CanvasAnnotationReducer,
  canonicalAnnotatedWorkspace,
  emptyCanvasAnnotations,
  parseAnnotatedWorkspace,
} from '../src/canvas-annotations.mjs';
import {
  BoundedSubcircuitReducer,
  SUBCIRCUIT_INSTANCE_SCHEMA,
  SUBCIRCUITS_SCHEMA,
  contractSubcircuits,
  createSeriesLedDefinition,
  emptySubcircuits,
  normalizeSubcircuits,
} from '../src/bounded-subcircuits.mjs';
import { AUTHORED_CHANGE_REVIEW_SCHEMA } from '../src/authored-change-review.mjs';
import {
  EXPECTATION_REFERENCE_LIMIT,
  EXPECTATION_REFERENCE_SCHEMA,
  createExpectationReference,
  expectationReferenceMatchesPrepared,
  parseExpectationReference,
} from '../src/expectation-reference.mjs';
import {
  EXPERIMENT_PACKAGE_LIMIT,
  createExperimentPackage,
  parseExperimentPackage,
} from '../src/experiment-package.mjs';
import {
  GUIDED_EXPERIMENT_REPLAY_SCHEMA,
  createGuidedExperimentReplay,
} from '../src/guided-experiment-replay.mjs';
import {
  RECIPIENT_RESPONSE_LIMIT,
  RECIPIENT_RESPONSE_SCHEMA,
  createRecipientResponse,
  parseRecipientResponse,
} from '../src/recipient-file-exchange.mjs';
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
  BOUNDED_ACTION_RESULT_SCHEMA,
  boundedActionRequest,
  createBoundedActionRouter,
  parseBoundedActionRequest,
} from '../src/bounded-action-contracts.mjs';
import { createX92C3BudgetIntegration } from '../src/x92-c3-budget-integration.mjs';
import { createX92Stm32BudgetIntegration } from '../src/x92-stm32-budget-integration.mjs';
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
} from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import {
  CHARACTER_LCD_20X4_RENDERER,
  CHARACTER_LCD_20X4_TYPE,
} from '../expansion-drafts/character-lcd-20x4-4bit-v1.mjs';
import { PCF8574_LCD_TYPE } from '../expansion-drafts/pcf8574-lcd-backpack-v1.mjs';
import {
  ROTARY_ENCODER_TYPE,
  nextRotaryEncoderDetent,
} from '../expansion-drafts/rotary-encoder-quadrature-v1.mjs';

const uiComponentCatalog = Object.freeze({
  ...COMPONENT_CATALOG, ...CANDIDATE_UI_COMPONENTS,
  ...BOUNDED_3V3_UI_COMPONENTS,
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
  'component-editor', 'component-editor-model-tab', 'component-editor-drawing-tab',
  'component-editor-model-panel', 'component-editor-drawing-panel',
  'appearance-editor', 'appearance-editor-title', 'appearance-preset', 'appearance-preview', 'appearance-status', 'appearance-apply',
  'appearance-width', 'appearance-width-value', 'appearance-height', 'appearance-height-value',
  'appearance-corner', 'appearance-corner-value', 'appearance-cancel',
  'accessible-connections-root',
  'selected-net', 'net-members', 'wire-color', 'wire-bends', 'selection-support', 'reconnect-mode', 'add-bend', 'delete-wire', 'remove-junction', 'zoom-value',
  'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'view-reset', 'fit-project', 'project-state',
  'project-message', 'project-name', 'project-new', 'project-demo', 'project-save', 'project-open', 'project-open-input',
  'project-native-open', 'project-native-save', 'project-native-save-copy', 'project-file-connection',
  'model-library-detail', 'model-library-summary', 'model-library-status', 'model-library-changes', 'model-library-migrate',
  'local-history', 'local-history-badge', 'local-history-enable', 'local-history-disable',
  'local-history-retention', 'local-history-label', 'local-history-save', 'local-history-clear',
  'local-history-status', 'local-history-list', 'local-history-confirm',
  'local-history-confirm-title', 'local-history-confirm-description', 'local-history-confirm-status',
  'local-history-confirm-cancel', 'local-history-confirm-accept',
  'project-reload', 'browser-draft-recovery', 'project-draft-recovery', 'project-draft-recover',
  'project-draft-recovery-status', 'project-export', 'project-import',
  'project-import-mode', 'undo', 'redo', 'prompt-generate', 'prompt-copy', 'prompt-output', 'prompt-response',
  'prompt-mode', 'prompt-apply', 'prompt-message', 'component-controls',
  'editor-title', 'source-file', 'source-file-name', 'source-file-add', 'source-file-remove',
  'lifecycle-state', 'technical-error', 'technical-error-detail', 'delete-branch',
  'example-select', 'example-picker-dialog', 'example-picker-close', 'example-picker-search', 'example-picker-status',
  'walkthrough-open', 'top-get-started', 'help-get-started', 'walkthrough', 'recovery-export', 'quick-state', 'quick-build', 'quick-run', 'quick-pause', 'quick-reset', 'quick-stop',
  'unsaved-change-dialog', 'unsaved-change-title', 'unsaved-change-description', 'unsaved-change-status',
  'unsaved-keep', 'unsaved-download', 'unsaved-discard',
  'toggle-catalog', 'toggle-inspector', 'catalog-resizer', 'inspector-resizer', 'show-pin-labels', 'focus-canvas', 'fullscreen-canvas',
  'source-lines', 'source-highlight', 'diagnostic-links', 'build-log', 'simulated-time', 'requested-speed', 'achieved-speed',
  'serial-text-mode', 'serial-event-mode', 'serial-export', 'serial-newline', 'logic-waveform', 'logic-cursor-a', 'logic-cursor-b',
  'serial-provenance', 'instrument-evidence', 'instrument-evidence-state', 'instrument-evidence-profile',
  'instrument-evidence-artifact', 'instrument-evidence-time', 'instrument-evidence-retention',
  'x46-uart-panel',
  'pico-branch-endpoint', 'pico-remove-branch', 'c3-branch-endpoint', 'c3-remove-branch',
  'stm32-branch-endpoint', 'stm32-remove-branch',
  'control-runtime-evidence-body',
  'serial-tab', 'serial-dock', 'serial-close', 'serial-resizer', 'serial-resume', 'serial-new-output',
  'canvas-select-mode', 'canvas-interact-mode',
  'thermostat-experiment', 'thermostat-experiment-state', 'thermostat-run-tests',
  'thermostat-load-bad', 'thermostat-restore', 'thermostat-results', 'thermostat-experiment-message',
  'x39-failure-location', 'x39-failure-location-summary', 'x39-failure-source',
  'x39-failure-pin', 'x39-failure-net', 'x39-failure-time', 'x39-failure-export',
  'x40-shared-timeline', 'x40-shared-timeline-summary', 'x40-shared-timeline-body',
  'x40-shared-timeline-compact', 'x40-shared-timeline-export',
  'scenario-editor', 'scenario-add', 'scenario-undo', 'scenario-redo', 'scenario-run',
  'scenario-list', 'scenario-editor-message',
  'seeded-property-seed', 'seeded-property-exact-value', 'seeded-property-generate', 'seeded-property-replay', 'seeded-property-summary',
  'counterexample-reduce', 'counterexample-reduction-summary',
  'fault-suite-load', 'fault-suite-replay', 'fault-suite-summary',
  'starter-examples', 'starter-gallery', 'quick-controls', 'workbench-workspace', 'project-bar',
  'beginner-primary', 'beginner-run', 'beginner-runtime-toggle', 'beginner-examples', 'beginner-scratch', 'beginner-source', 'beginner-status', 'workbench-more',
  'build-list-export', 'build-list-status', 'accessible-svg-export', 'accessible-svg-status',
  'project-navigation', 'project-navigation-query', 'project-navigation-status', 'project-navigation-results',
  'family-select', 'board-select', 'controller-status', 'toolchain-boundary',
  'controller-workbench', 'controller-workbench-eyebrow', 'controller-workbench-title', 'controller-workbench-badge',
  'controller-workbench-summary', 'controller-capability-project', 'controller-capability-source',
  'controller-capability-runtime', 'controller-capability-circuit', 'controller-primary-action', 'controller-return-avr',
  'controller-workbench-limitation', 'controller-public-boundary', 'parked-circuit-notice',
  'profile-migration-explanation', 'profile-migration-summary', 'profile-migration-intro',
  'profile-migration-source', 'profile-migration-pins', 'profile-migration-parts', 'profile-migration-requirements',
  'project-brief', 'project-brief-profile', 'project-brief-purpose', 'project-brief-inputs',
  'project-brief-outputs', 'project-brief-boundaries', 'project-brief-acceptance',
  'project-brief-assumptions', 'project-brief-capabilities', 'project-brief-evaluation', 'project-brief-status', 'requirement-trace-list', 'requirement-trace-summary',
  'open-assumptions-list', 'open-assumptions-summary', 'project-feasibility-list', 'project-feasibility-summary',
  'project-patch-description', 'project-patch-generate', 'project-patch-copy', 'project-patch-prompt',
  'project-patch-input', 'project-patch-review', 'project-patch-apply', 'project-patch-status',
  'project-patch-changes', 'project-patch-summary', 'project-patch-implementation-changes',
  'project-patch-expectation-changes', 'expectation-reference-lock', 'expectation-reference-open',
  'authored-change-review', 'authored-change-review-title', 'authored-change-review-summary',
  'authored-change-review-status', 'authored-change-review-identities', 'authored-change-review-show-source',
  'authored-change-review-rows', 'authored-change-review-source', 'authored-change-review-diffs',
  'authored-change-review-back',
  'expectation-reference-input', 'expectation-reference-status', 'expectation-reference-identity',
  'experiment-package-download', 'experiment-package-state', 'experiment-package-detail',
  'experiment-package-comparison', 'experiment-package-comparison-state',
  'experiment-package-before-open', 'experiment-package-before-name', 'experiment-package-before-input',
  'experiment-package-after-open', 'experiment-package-after-name', 'experiment-package-after-input',
  'experiment-package-compare', 'experiment-package-comparison-clear',
  'experiment-package-comparison-status', 'experiment-package-comparison-review',
  'experiment-package-comparison-identities', 'experiment-package-comparison-source',
  'experiment-package-comparison-circuit', 'experiment-package-comparison-results',
  'guided-replay-open', 'guided-replay-input', 'guided-replay-dialog', 'guided-replay-title',
  'guided-replay-close', 'guided-replay-status', 'guided-replay-identities',
  'guided-replay-position', 'guided-replay-step-title', 'guided-replay-select',
  'guided-replay-scenario-id', 'guided-replay-inputs', 'guided-replay-observation',
  'guided-replay-explanation', 'guided-replay-previous', 'guided-replay-next',
  'recipient-review-only', 'recipient-project-open', 'recipient-handover-download',
  'recipient-choice-status', 'recipient-response-disposition', 'recipient-response-note',
  'recipient-response-download', 'recipient-response-open', 'recipient-response-input',
  'recipient-response-status', 'recipient-response-relationship',
  'design-comparison-create', 'design-comparison-summary', 'design-comparison-status',
  'design-comparison-alternatives', 'design-comparison-differences',
  'shared-domain-engine-inspect', 'shared-domain-engine-summary', 'shared-domain-engine-status',
  'shared-domain-engine-stages',
  'bounded-actions-summary', 'bounded-actions-status', 'bounded-actions-list',
  'x92-budget-start', 'x92-budget-download', 'x92-budget-open', 'x92-budget-open-input',
  'x92-budget-summary', 'x92-budget-status', 'x92-budget-metrics', 'x92-budget-reservations',
  'x92-budget-unresolved', 'x92-budget-imported', 'x92-budget-accounting', 'release-version',
  'presentation-open', 'presentation-view-dialog', 'presentation-view-title', 'presentation-close',
  'presentation-setup', 'presentation-instruments', 'presentation-add-step', 'presentation-step-editors',
  'presentation-status', 'presentation-start', 'presentation-stage', 'presentation-step-title',
  'presentation-step-count', 'presentation-snapshot-status', 'presentation-step-text', 'presentation-instrument-cards',
  'presentation-previous', 'presentation-next', 'presentation-exit',
  'teaching-exercise-open', 'teaching-exercise-dialog', 'teaching-exercise-title', 'teaching-exercise-close',
  'teaching-exercise-instructions', 'teaching-exercise-download', 'teaching-exercise-import',
  'teaching-exercise-input', 'teaching-exercise-status', 'teaching-exercise-requirements',
  'teaching-exercise-variants', 'teaching-exercise-install',
  'canvas-annotations-open', 'canvas-annotations-dialog', 'canvas-annotations-title', 'canvas-annotations-close',
  'canvas-note-text', 'canvas-note-x', 'canvas-note-y', 'canvas-note-add', 'canvas-group-label',
  'canvas-group-components', 'canvas-group-add', 'canvas-annotations-undo', 'canvas-annotations-redo',
  'canvas-net-label-text', 'canvas-net-label-net', 'canvas-net-label-x', 'canvas-net-label-y', 'canvas-net-label-add',
  'canvas-subcircuit-id', 'canvas-subcircuit-source', 'canvas-subcircuit-ground',
  'canvas-subcircuit-x', 'canvas-subcircuit-y', 'canvas-subcircuit-add',
  'canvas-annotations-download', 'canvas-annotations-import', 'canvas-annotations-input',
  'canvas-annotations-status', 'canvas-annotations-list', 'canvas-annotation-layer',
  'regression-matrix', 'regression-matrix-state', 'regression-matrix-identity',
  'regression-matrix-selector', 'regression-matrix-run', 'regression-matrix-negative',
  'regression-matrix-export', 'regression-matrix-results', 'regression-matrix-summary',
  'checkable-evidence', 'checkable-evidence-state', 'checkable-evidence-summary',
  'checkable-evidence-message', 'checkable-evidence-open', 'checkable-evidence-open-input',
  'checkable-evidence-identity', 'checkable-evidence-rows', 'checkable-evidence-limitations',
  'checkable-evidence-download',
  'version-regression-state', 'version-regression-identity', 'version-regression-load',
  'version-regression-negative', 'version-regression-export', 'version-regression-results',
  'version-regression-summary',
  'coverage-report-state', 'coverage-report-export', 'coverage-report-results', 'coverage-report-summary',
  'long-duration', 'long-duration-state', 'long-duration-identity', 'long-duration-run',
  'long-duration-export', 'long-duration-results', 'long-duration-summary',
  'time-invariance', 'time-invariance-state', 'time-invariance-identity', 'time-invariance-run',
  'time-invariance-export', 'time-invariance-results', 'time-invariance-summary',
  'event-order', 'event-order-state', 'event-order-identity', 'event-order-run',
  'event-order-export', 'event-order-results', 'event-order-summary',
  'reset-class', 'reset-class-state', 'reset-class-identity', 'reset-class-run',
  'reset-class-export', 'reset-class-results', 'reset-class-summary',
  'unsupported-access', 'unsupported-access-state', 'unsupported-access-identity',
  'unsupported-access-run', 'unsupported-access-export', 'unsupported-access-results',
  'unsupported-access-summary',
  'digital-state', 'digital-state-state', 'digital-state-identity', 'digital-state-run',
  'digital-state-export', 'digital-state-results', 'digital-state-summary',
  'digital-state-runtime', 'digital-state-runtime-state', 'digital-state-runtime-identity',
  'digital-state-runtime-run', 'digital-state-runtime-export', 'digital-state-runtime-results',
  'digital-state-runtime-summary',
  'precision-check', 'precision-check-state', 'precision-check-identity', 'precision-check-run',
  'precision-check-export', 'precision-check-results', 'precision-check-summary',
  'causal-chain', 'causal-chain-state', 'causal-chain-identity', 'causal-chain-run',
  'causal-chain-export', 'causal-chain-results', 'causal-chain-summary',
  'usart-response', 'usart-response-state', 'usart-response-identity', 'usart-response-run',
  'usart-response-export', 'usart-response-results', 'usart-response-summary',
  'failure-replay', 'failure-replay-state', 'failure-replay-identity', 'failure-replay-open',
  'failure-replay-advance', 'failure-replay-export', 'failure-replay-results',
  'failure-replay-summary',
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
  'pico-zoom-in', 'pico-fit', 'pico-reconnect', 'pico-branch', 'pico-add-bend', 'pico-route-back', 'pico-route-forward',
  'pico-wire-color', 'pico-wire-cancel', 'pico-wire-state', 'pico-serial',
  'c3-public-workbench', 'c3-state', 'c3-project-name', 'c3-save', 'c3-open', 'c3-open-input',
  'c3-native-open', 'c3-native-save', 'c3-native-save-copy', 'c3-file-connection', 'c3-legacy-copy',
  'c3-profile-examples',
  'c3-source', 'c3-build', 'c3-run', 'c3-stop', 'c3-message', 'c3-source-hash', 'c3-flash-hash',
  'c3-diagnostics', 'c3-diagnostic-links',
  'c3-diagram', 'c3-external-led', 'c3-circuit-state', 'c3-reconnect', 'c3-branch', 'c3-add-bend', 'c3-route-back', 'c3-route-forward',
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
  'stm32-reconnect', 'stm32-branch', 'stm32-add-bend', 'stm32-route-back', 'stm32-route-forward',
  'stm32-wire-color', 'stm32-wire-cancel', 'stm32-wire-state',
].map((id) => [id.replaceAll('-', ''), byId(id)]));

elements.releaseversion.textContent = RELEASE_VERSION;

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
let appearancePreview = null;
const componentEditorModes = new Map();
let selectedNetId = null;
let pendingEndpoint = null;
let wireMode = 'connect';
let worker = null;
let workerToken = 0;
let currentRuntimeWorkerIdentity = null;
let runtimeRenderTimer = null;
let pendingRuntimeRender = null;
let runtimeWorkerCreations = 0;
let runtimeReadyDeadlineTimer = null;
const RUNTIME_READY_DEADLINE_MS = 5_000;
const TAB_DRAFT_ID_KEY = 'intent-mcu.active-draft-id.v1';
const TAB_PROFILE_KEY = 'intent-mcu.active-profile.v1';
const DRAFT_REGISTRY_KEY = 'intent-mcu.draft-registry.v1';
const DRAFT_LEASE_PREFIX = 'intent-mcu.draft-lease.v1.';
const DRAFT_REGISTRY_LIMIT = 12;
const DRAFT_LEASE_MAX_AGE_MS = 15_000;
const pageInstanceId = crypto.randomUUID();
const corruptControllerDraftProfiles = new Set();
const controllerDraftRestoreInProgress = new Set();
let activeDraftId = null;
try {
  activeDraftId = sessionStorage.getItem(TAB_DRAFT_ID_KEY);
  const navigationType = performance.getEntriesByType('navigation')[0]?.type ?? 'navigate';
  const lease = activeDraftId ? JSON.parse(localStorage.getItem(`${DRAFT_LEASE_PREFIX}${activeDraftId}`) ?? 'null') : null;
  const liveElsewhere = navigationType !== 'reload' && lease?.instanceId
    && lease.instanceId !== pageInstanceId && Date.now() - Number(lease.updatedAt) < DRAFT_LEASE_MAX_AGE_MS;
  if (liveElsewhere) activeDraftId = null;
  if (!/^[a-f0-9-]{16,64}$/u.test(activeDraftId ?? '')) {
    activeDraftId = crypto.randomUUID();
    sessionStorage.setItem(TAB_DRAFT_ID_KEY, activeDraftId);
  }
} catch { activeDraftId = null; }
let activeProjectStorageKey = activeDraftId ? `${PROJECT_STORAGE_KEY}.tab.${activeDraftId}` : PROJECT_STORAGE_KEY;
let activeProjectRecoveryKey = activeDraftId ? `${PROJECT_RECOVERY_KEY}.tab.${activeDraftId}` : PROJECT_RECOVERY_KEY;
const profileDraftStorageKey = (profile) => `intent-mcu.profile-draft.v1.${profile}.tab.${activeDraftId ?? 'fallback'}`;
function reportControllerDraftFailure(profile, message) {
  profileMessage(profile, message);
  if (profile === selectedCompilerProfile && elements?.projectmessage) elements.projectmessage.textContent = message;
  setTimeout(() => {
    profileMessage(profile, message);
    if (profile === selectedCompilerProfile && elements?.projectmessage) elements.projectmessage.textContent = message;
  }, 0);
}
function persistControllerDraft(profile, workbench) {
  if (controllerDraftRestoreInProgress.has(profile)) return true;
  if (corruptControllerDraftProfiles.has(profile)) {
    reportControllerDraftFailure(profile, 'Browser recovery was not replaced because its saved bytes are invalid. The original bytes remain untouched; use Save copy before leaving.');
    return false;
  }
  try {
    const inputs = {
      [RP2040_PROFILE]: [elements?.picosource, elements?.picoprojectname],
      [ESP32C3_PROFILE]: [elements?.c3source, elements?.c3projectname],
      [STM32F429ZI_PROFILE]: [elements?.stm32source, elements?.stm32projectname],
    }[profile];
    if (inputs?.[0]) workbench.project.source = inputs[0].value;
    if (inputs?.[1]?.value.trim()) workbench.project.name = inputs[1].value.trim();
    let prior = null;
    try { prior = JSON.parse(localStorage.getItem(profileDraftStorageKey(profile)) ?? 'null'); }
    catch {
      corruptControllerDraftProfiles.add(profile);
      reportControllerDraftFailure(profile, 'Browser recovery was not replaced because its saved bytes are invalid. The original bytes remain untouched; use Save copy before leaving.');
      return false;
    }
    let validatedProject = prior?.schema === 'intent-mcu-profile-draft@1' ? prior.project : prior;
    try { validatedProject = workbench.projectDocument(); } catch { /* keep last validated install basis */ }
    if (!validatedProject) return false;
    const circuit = structuredClone(workbench.circuitEditor.snapshot().draft);
    localStorage.setItem(profileDraftStorageKey(profile), JSON.stringify({
      schema: 'intent-mcu-profile-draft@1', profile, project: validatedProject,
      authoredSource: inputs?.[0]?.value ?? workbench.project.source,
      authoredName: inputs?.[1]?.value.trim() || workbench.project.name,
      circuit, updatedAt: new Date().toISOString(),
    }));
    return true;
  } catch (error) {
    reportControllerDraftFailure(profile, `Browser recovery for ${profile} could not be saved (${error.name || error.message}). Existing saved bytes were not replaced; the in-memory project remains usable. Use Save copy before leaving.`);
    return false;
  }
}
function readControllerDraft(profile) {
  try {
    const source = localStorage.getItem(profileDraftStorageKey(profile));
    return source ? JSON.parse(source) : null;
  } catch {
    corruptControllerDraftProfiles.add(profile);
    return null;
  }
}
function restoreControllerDraft(profile, workbench, retained = readControllerDraft(profile)) {
  controllerDraftRestoreInProgress.add(profile);
  try {
    if (!retained) return false;
    const envelope = retained.schema === 'intent-mcu-profile-draft@1' ? retained : null;
    const project = envelope ? { ...envelope.project, circuit: envelope.circuit } : retained;
    workbench.installPreparedProject(project, 'Reopened validated local draft. Build fresh before Run.');
    if (envelope) {
      workbench.project.source = envelope.authoredSource;
      workbench.project.name = envelope.authoredName;
      workbench.elements.source.value = envelope.authoredSource;
      workbench.elements.name.value = envelope.authoredName;
      workbench.invalidate('Reopened local authored draft. Build fresh before Run.');
    }
    return true;
  } catch { return false; }
  finally {
    // Workbench installation queues its normal state notification. Keep that
    // initialization notification read-only; later authored events persist.
    setTimeout(() => controllerDraftRestoreInProgress.delete(profile), 0);
  }
}
function bindControllerDraftInputs(profile, workbench, source, name) {
  source.addEventListener('input', () => {
    workbench.project.source = source.value;
    queueMicrotask(() => persistControllerDraft(profile, workbench));
  });
  name.addEventListener('input', () => {
    workbench.project.name = name.value.trim();
    queueMicrotask(() => persistControllerDraft(profile, workbench));
  });
  name.addEventListener('change', () => queueMicrotask(() => persistControllerDraft(profile, workbench)));
}
function writeDraftLease() {
  if (!activeDraftId) return;
  try { localStorage.setItem(`${DRAFT_LEASE_PREFIX}${activeDraftId}`, JSON.stringify({ instanceId: pageInstanceId, updatedAt: Date.now() })); } catch { /* persistence remains best effort */ }
}
writeDraftLease();
const draftLeaseHeartbeat = setInterval(writeDraftLease, 5_000);
window.addEventListener('pagehide', () => {
  clearInterval(draftLeaseHeartbeat);
  if (!activeDraftId) return;
  try {
    const leaseKey = `${DRAFT_LEASE_PREFIX}${activeDraftId}`;
    const lease = JSON.parse(localStorage.getItem(leaseKey) ?? 'null');
    if (lease?.instanceId === pageInstanceId) localStorage.removeItem(leaseKey);
  } catch { /* a stale lease expires automatically */ }
});
let selectedCompilerProfile = AVR_PROFILE;
try {
  const retainedProfile = sessionStorage.getItem(TAB_PROFILE_KEY);
  if ([AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE].includes(retainedProfile)) {
    selectedCompilerProfile = retainedProfile;
  }
} catch { /* session storage denial keeps the safe AVR default */ }
let x92Budget = null;
let x92BudgetExecutor = null;
let x92C3Integration = null;
let x92C3OwnedDispatchPermit = null;
let x92C3OwnedBinding = null;
let x92C3OwnedPrivateResult = false;
let x92Stm32Integration = null;
let x92Stm32OwnedDispatchPermit = null;
let x92Stm32OwnedBinding = null;
let x92Stm32OwnedPrivateResult = false;
let x92BudgetStartPending = null;
const x92AdvancingBoundary = (dispatchPermit = null) => x92BudgetExecutor?.advancingBoundary?.(dispatchPermit)
  ?? { ok: true, code: 'X92_ADVANCING_CONTROL_ALLOWED' };
let x92ImportedReview = null;
let x92IdentitySequence = 0;
const presentationOwner = createPresentationViewOwner();
let presentationStepSequence = 0;
let presentationReturnFocus = null;
let presentationObservation = null;
let acceptedTeachingExercise = null;
let teachingExerciseReturnFocus = null;
let canvasAnnotations = null;
let boundedSubcircuits = emptySubcircuits();
let pendingSubcircuitTransition = null;
let canvasAnnotationSequence = 0;
let canvasAnnotationReturnFocus = null;
let selectedCanvasAnnotationGroup = null;
let canvasAnnotationBaseline = JSON.stringify({ annotations: emptyCanvasAnnotations(), subcircuits: boundedSubcircuits });
const annotationEditorPast = [];
const annotationEditorFuture = [];
let lastProfileMigrationReport = null;
const projectBriefDrafts = new Map();
const requirementResultLinks = new Map();
const sharedInstrumentSummaries = new Map();
const sharedInstrumentLocals = new Map();
let activeJob = null;
let beginnerRunIntent = null;
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
const projectModelLibraryLocks = new Map([
  [AVR_PROFILE, structuredClone(CURRENT_MODEL_LIBRARY_LOCK)],
  [RP2040_PROFILE, structuredClone(CURRENT_MODEL_LIBRARY_LOCK)],
  [ESP32C3_PROFILE, structuredClone(CURRENT_MODEL_LIBRARY_LOCK)],
  [STM32F429ZI_PROFILE, structuredClone(CURRENT_MODEL_LIBRARY_LOCK)],
]);
const modelLibraryLockFor = (profile) => {
  const lock = projectModelLibraryLocks.get(profile);
  if (!lock) throw new Error('MODEL_LIBRARY_LOCK_MISSING');
  return structuredClone(lock);
};
const modelLibraryImplementationFor = (profile) => {
  const resolved = resolveModelLibrary(modelLibraryLockFor(profile));
  if (!resolved.ok) throw Object.assign(new Error(resolved.code), resolved);
  return resolved.implementation;
};
const modelLibraryImplementationForResult = (result) => {
  const resolved = resolveModelLibrary(result?.modelLibrary);
  if (!resolved.ok) throw Object.assign(new Error(resolved.code), resolved);
  return resolved.implementation;
};
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
let thermostatFailureLocator = null;
let pendingThermostatFailureLocator = null;
let x39FailureLocationOpened = false;
let x40SharedTimeline = null;
let x40TimelineReset = null;
let x40TimelineResult = null;
let x40TimelineNotice = 'Run one isolated authored AVR thermostat scenario to create current producer evidence.';
let authoredScenarioResults = [];
let scenarioTimelineEditor = null;
let authoredExperimentWaiter = null;
let counterexampleReductionActive = false;
let counterexampleReductionResult = null;
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
const x47UiOwner = createX47UiOwner();
const X47_STOP_TIMEOUT_MS = 750;
let x47RuntimeAuthority = null;
let x47WorkerIdentity = null;
let x47ExplicitPauseRequested = false;
let x47StopTimer = null;
let x47TerminalProjection = null;
let x47AsyncEpoch = 0;
let x47LoadTicket = 0;
let x47PauseTicket = 0;
let x47ApplyTicket = 0;
let x47ResetExpectation = null;
let x47WorkerStatus = null;
let x47WorkerStatusSequence = 0;
let x47RepeatablePending = null;
const accessibleConnectionNotices = new Map();

function renderX47Integration(snapshot = x47TerminalProjection ?? x47UiOwner.snapshot()) {
  window.__X47_PULSE_PREVIEW__?.integration?.(snapshot);
  window.__X47_REPEATABLE_INPUTS__?.integration?.(snapshot);
  publish({ x47Integration: structuredClone(snapshot) });
  return snapshot;
}

function retireX47Integration(reason, { preserveTerminal = false } = {}) {
  x47AsyncEpoch += 1;
  x47LoadTicket += 1;
  x47PauseTicket += 1;
  x47ApplyTicket += 1;
  x47ResetExpectation = null;
  x47WorkerStatus = null;
  x47WorkerStatusSequence += 1;
  x47RepeatablePending = null;
  if (x47StopTimer !== null) clearTimeout(x47StopTimer);
  x47StopTimer = null;
  x47RuntimeAuthority = null;
  x47WorkerIdentity = null;
  x47ExplicitPauseRequested = false;
  window.__X47_REPEATABLE_INPUTS__?.invalidate?.(reason);
  if (!preserveTerminal) {
    x47TerminalProjection = null;
    const retired = x47UiOwner.retire(reason);
    renderX47Integration({ ...retired,
      reason: `${reason} · Build, Run, then explicitly Pause before Apply.` });
  }
}

function x47LoadStillCurrent(frozen) {
  return frozen.loadTicket === x47LoadTicket && frozen.asyncEpoch === x47AsyncEpoch
    && frozen.workerToken === workerToken && selectedCompilerProfile === frozen.profile
    && lifecycle.projectGeneration === frozen.runtimeBinding.projectGeneration
    && lifecycle.runtimeGeneration === frozen.runtimeBinding.runtimeGeneration
    && lifecycle.artifact?.artifactIdentity === frozen.runtimeBinding.artifactIdentity
    && lifecycle.artifact?.buildGeneration === frozen.buildGeneration
    && editor.revision === frozen.sourceProjectRevision
    && modelLibraryLockFor(frozen.profile).manifestSha256 === frozen.modelLibraryLock.manifestSha256
    && JSON.stringify(currentProject().source.files) === frozen.sourceFilesJson
    && JSON.stringify(currentProject().circuit) === frozen.circuitJson;
}

async function x47AuthorityForRuntime(frozen) {
  if (frozen.profile !== AVR_PROFILE
      || frozen.modelLibraryLock.manifestSha256 !== CURRENT_MODEL_LIBRARY_LOCK.manifestSha256) return null;
  try {
    const source = captureX47PulseSource(AVR_PROFILE, frozen.runtimeBinding.projectGeneration,
      frozen.sourceProjectRevision, frozen.circuit);
    const context = await createX47PulseContextFromSource(source);
    if (!x47LoadStillCurrent(frozen)) throw new Error('X47_LOAD_EPOCH_STALE');
    const sourceSha256 = await projectTextSha256(frozen.canonicalSourceFiles);
    if (!x47LoadStillCurrent(frozen)) throw new Error('X47_LOAD_EPOCH_STALE');
    return {
      schema: X47_RUNTIME_AUTHORITY_SCHEMA,
      profile: AVR_PROFILE,
      projectGeneration: frozen.runtimeBinding.projectGeneration,
      buildGeneration: frozen.buildGeneration,
      sourceProjectRevision: frozen.sourceProjectRevision,
      sourceSha256,
      graphIdentity: context.graphIdentity,
      inputIdentitySha256: frozen.inputIdentitySha256,
      artifactIdentity: frozen.runtimeBinding.artifactIdentity,
      runtimeGeneration: frozen.runtimeBinding.runtimeGeneration,
      modelImplementationSha256: frozen.modelImplementationSha256,
      modelExecutionContextSha256: frozen.modelExecutionContextSha256,
    };
  } catch (error) {
    if (error.message === 'X47_LOAD_EPOCH_STALE') throw error;
    if (!x47LoadStillCurrent(frozen)) throw new Error('X47_LOAD_EPOCH_STALE');
    return null;
  }
}

function frozenX47Preview(api) {
  const canonicalText = api?.canonicalText?.();
  const context = api?.bindingContext?.();
  const events = api?.expandedEvents?.();
  return { canonicalText, context, events };
}

function sameX47Preview(left, right) {
  return left.canonicalText === right.canonicalText
    && sameRuntimeIdentity(left.context, right.context)
    && sameRuntimeIdentity(left.events, right.events);
}

async function bindPausedX47Preview(token, identity, cycle, expectedWorker = worker) {
  const api = window.__X47_PULSE_PREVIEW__;
  const frozen = frozenX47Preview(api);
  const owner = x47UiOwner.snapshot();
  const authority = structuredClone(x47RuntimeAuthority);
  const asyncEpoch = x47AsyncEpoch;
  const pauseTicket = ++x47PauseTicket;
  const status = x47WorkerStatus;
  if (!authority || !frozen.canonicalText || !frozen.context || !Array.isArray(frozen.events)
      || !status || status.workerToken !== token || status.cycle !== cycle || status.paused !== true
      || status.kind !== 'paused' || status.worker !== expectedWorker
      || frozen.context.graphIdentity !== authority.graphIdentity
      || frozen.context.sourceProjectRevision !== authority.sourceProjectRevision) {
    renderX47Integration({ ...x47UiOwner.snapshot(), reason: 'Create a current D2 preview while explicitly paused.' });
    return false;
  }
  const preview = {
    canonicalPulseSha256: await projectTextSha256(frozen.canonicalText),
    events: frozen.events.map((event) => ({ pin: 2, offsetCycles: event.offsetCycles, level: event.level })),
  };
  const live = frozenX47Preview(api);
  if (pauseTicket !== x47PauseTicket || asyncEpoch !== x47AsyncEpoch
      || token !== workerToken || expectedWorker !== worker || !x47WorkerIdentity
      || !sameRuntimeIdentity(identity, x47WorkerIdentity) || lifecycle.phase !== 'paused'
      || status !== x47WorkerStatus
      || !x47CanBindExplicitPause(x47UiOwner.snapshot())
      || !sameRuntimeIdentity(owner, x47UiOwner.snapshot()) || !sameX47Preview(frozen, live)
      || frozen.context.graphIdentity !== x47RuntimeAuthority?.graphIdentity
      || frozen.context.sourceProjectRevision !== x47RuntimeAuthority?.sourceProjectRevision) return false;
  renderX47Integration(x47UiOwner.noteExplicitPause({ workerToken: token,
    runtimeIdentity: identity, cycle, preview }));
  return true;
}

function sameRuntimeIdentity(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function x47CanBindExplicitPause(owner = x47UiOwner.snapshot()) {
  return owner.phase === 'await-pause'
    || (owner.phase === 'running' && owner.executionReceipt?.complete === true);
}

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

function boundedQuickCircuitStatus(state, validLabel) {
  if (state.circuitValid || state.circuitAccepted) return validLabel;
  if (state.authoringAccepted && state.circuitCode === 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE') {
    return 'authoring accepted · runtime unavailable for this graph';
  }
  return state.circuitCode;
}

function renderPicoQuickControls(state = picoPublicState) {
  if (selectedCompilerProfile !== RP2040_PROFILE || !state) return;
  elements.quickstate.textContent = `Pico · ${state.phase} · ${boundedQuickCircuitStatus(state, 'wiring valid')}`;
  elements.quickbuild.textContent = 'Build Pico';
  elements.quickrun.textContent = 'Run Pico';
  elements.quickpause.textContent = 'Pause';
  elements.quickreset.textContent = 'Reset';
  elements.quickstop.textContent = 'Stop';
  elements.quickbuild.disabled = state.phase === 'building';
  elements.quickrun.disabled = !state.runnable || ['running', 'starting'].includes(state.phase);
  elements.quickpause.disabled = !['running', 'paused'].includes(state.phase);
  elements.quickreset.disabled = !['running', 'paused'].includes(state.phase);
  elements.quickstop.disabled = elements.picostop.disabled;
  elements.quickpause.title = '';
  elements.quickreset.title = '';
  elements.quickstop.title = 'Stop the browser worker and discard the current Pico artifact.';
  renderBeginnerRuntimeToggle({ phase: state.phase, supportsPause: true, stopAvailable: true });
}

function renderBeginnerRuntimeToggle({ phase, supportsPause, stopAvailable }) {
  const active = supportsPause && ['running', 'paused'].includes(phase);
  elements.beginnerruntimetoggle.hidden = !active;
  if (!active) return;
  const paused = phase === 'paused';
  elements.beginnerruntimetoggle.dataset.state = paused ? 'paused' : 'running';
  elements.beginnerruntimetoggle.textContent = paused ? 'Resume' : 'Pause';
  elements.beginnerruntimetoggle.setAttribute('aria-label', paused
    ? 'Resume the current runtime without changing source or wiring'
    : 'Pause the current runtime without changing source or wiring');
  elements.beginnerstatus.textContent = paused
    ? `Paused · source, wiring and current project are preserved. Choose Resume to continue.${stopAvailable ? '' : ' Stop is unavailable; Reset starts from the current built project.'}`
    : `Running · choose Pause to inspect or correct the project without losing source.${stopAvailable ? '' : ' Stop is unavailable; use Pause or Reset.'}`;
}

function renderAvrQuickControls() {
  elements.quickbuild.textContent = 'Build';
  elements.quickrun.textContent = 'Run';
  elements.quickpause.textContent = 'Pause';
  elements.quickreset.textContent = 'Reset';
  elements.quickstop.textContent = 'Stop unavailable';
  elements.quickbuild.disabled = elements.build.disabled;
  elements.quickrun.disabled = elements.run.disabled;
  elements.quickpause.disabled = elements.pause.disabled;
  elements.quickreset.disabled = elements.reset.disabled;
  elements.quickstop.disabled = true;
  elements.quickbuild.title = '';
  elements.quickrun.title = '';
  elements.quickpause.title = '';
  elements.quickreset.title = '';
  elements.quickstop.title = 'Stop is unavailable for the AVR browser runtime; use Pause or Reset.';
  renderBeginnerRuntimeToggle({ phase: lifecycle.phase, supportsPause: true, stopAvailable: false });
}

function renderC3QuickControls(state = c3PublicState) {
  if (selectedCompilerProfile !== ESP32C3_PROFILE || !state) return;
  elements.quickstate.textContent = `ESP32-C3 · ${state.phase} · ${boundedQuickCircuitStatus(state, 'model wiring valid')}`;
  elements.quickbuild.textContent = 'Build C3';
  elements.quickrun.textContent = 'Run actual QEMU';
  elements.quickpause.textContent = 'Pause unavailable';
  elements.quickreset.textContent = 'Reset replay is part of Run';
  elements.quickstop.textContent = 'Stop';
  elements.quickbuild.disabled = state.phase === 'building' || state.phase === 'running';
  elements.quickrun.disabled = !state.runnable || state.phase === 'running';
  elements.quickpause.disabled = true;
  elements.quickreset.disabled = true;
  elements.quickstop.disabled = elements.c3stop.disabled;
  elements.quickpause.title = 'Pause is unavailable for the bounded QEMU run.';
  elements.quickreset.title = 'Reset replay is already verified inside each QEMU Run.';
  elements.quickstop.title = 'Stop QEMU and discard the transient C3 session.';
  renderBeginnerRuntimeToggle({ phase: state.phase, supportsPause: false, stopAvailable: true });
}

function renderStm32QuickControls(state = stm32PublicState) {
  if (selectedCompilerProfile !== STM32F429ZI_PROFILE || !state) return;
  elements.quickstate.textContent = `STM32F429ZI · ${state.phase} · ${boundedQuickCircuitStatus(state, 'PB0 wiring valid')}`;
  elements.quickbuild.textContent = 'Build STM32 ELF';
  elements.quickrun.textContent = 'Run actual Renode';
  elements.quickpause.textContent = 'Pause unavailable';
  elements.quickreset.textContent = 'Reset in fresh Renode';
  elements.quickstop.textContent = 'Stop';
  elements.quickbuild.disabled = ['building', 'running'].includes(state.phase);
  elements.quickrun.disabled = !state.runnable || ['building', 'running'].includes(state.phase);
  elements.quickpause.disabled = true;
  elements.quickreset.disabled = !state.runnable || ['building', 'running'].includes(state.phase);
  elements.quickstop.disabled = elements.stm32stop.disabled;
  elements.quickpause.title = 'Pause is unavailable for the isolated Renode run.';
  elements.quickreset.title = '';
  elements.quickstop.title = 'Stop Renode and discard the transient STM32 executable.';
  renderBeginnerRuntimeToggle({ phase: state.phase, supportsPause: false, stopAvailable: true });
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
  if (wireDraft.mode === 'branch-target') {
    return `Add branch to ${wireDraft.netId} — choose one compatible free endpoint. Escape cancels.`;
  }
  return 'Select a free named pin, then a compatible free destination. Select a cable first to reconnect one endpoint.';
}

function decorateNamedWireAnchor(anchor, key, { draft, wireDraft }) {
  const connection = namedWireConnection(draft, key);
  const pending = ['connect-target', 'reconnect-target'].includes(wireDraft.mode)
    && picoEndpointKey(wireDraft.from) === key;
  const available = wireDraft.mode === 'connect-target' && !connection
    || wireDraft.mode === 'branch-target' && !connection
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

function beginNamedWireBranch(workbench, statusElement) {
  const result = workbench.editCircuit('beginBranch');
  statusElement.textContent = namedWireResultMessage(result);
  return result;
}

function renderNamedBranchRemoval(select, button, draft, selection, wireDraft) {
  const net = selection.kind === 'net' ? draft.nets.find(({ id }) => id === selection.id) : null;
  const endpoints = net?.endpoints.length > 2 ? net.endpoints : [];
  const previous = select.value;
  select.replaceChildren(new Option('Choose branch endpoint', ''), ...endpoints.map((endpoint) =>
    new Option(picoEndpointKey(endpoint), JSON.stringify(endpoint))));
  if ([...select.options].some(({ value }) => value === previous)) select.value = previous;
  select.disabled = !endpoints.length || wireDraft.mode !== 'none';
  button.disabled = select.disabled || !select.value;
}

function removeNamedBranch(workbench, select, statusElement) {
  const snapshot = workbench.snapshot().circuitEditor;
  if (snapshot.selection.kind !== 'net' || !select.value) return;
  const endpoint = JSON.parse(select.value);
  const result = workbench.editCircuit('deleteBranch', snapshot.selection.id, endpoint);
  statusElement.textContent = result.ok
    ? `Removed ${picoEndpointKey(endpoint)} from ${snapshot.selection.id}. Undo restores it.`
    : `Branch removal rejected (${result.code}). The circuit is unchanged.`;
}

function cancelNamedWire(workbench, statusElement) {
  const result = workbench.editCircuit('cancelWireDraft');
  statusElement.textContent = 'Wire selection cancelled. The circuit is unchanged.';
  return result;
}

function boundedPartSummary(part, component) {
  if (part.fixed) return 'Fixed controller';
  if (!component) return '0 placed · add a first part';
  if ((part.count ?? 1) > 1) return `${part.count} placed · select one on the canvas to inspect`;
  if (part.type === 'resistor.fixed-v1') return `${component.properties.ohms} Ω · bounded ideal model`;
  if (part.type === 'led.basic-v1') return `${component.properties.color} · bounded ideal LED model`;
  return 'Authoring-only · runtime unavailable';
}

function componentEditorKey(profile, componentId) {
  return `${profile}:${componentId}`;
}

function createComponentEditorSplit({ profile, component, modelPanel, drawingPanel }) {
  const root = document.createElement('section'); root.className = 'component-editor';
  root.dataset.componentEditor = component.id; root.dataset.profile = profile;
  const heading = document.createElement('div'); heading.className = 'component-editor-heading';
  const headingText = document.createElement('div');
  const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'X55 · BOUNDED COMPONENT EDITOR';
  const title = document.createElement('h3'); title.textContent = `${component.label} editor`;
  const badge = document.createElement('span'); badge.textContent = 'Preview first';
  headingText.append(eyebrow, title); heading.append(headingText, badge);
  const tabs = document.createElement('div'); tabs.className = 'component-editor-tabs';
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', `${component.label} editor workspace`);
  const safeId = `${profile}-${component.id}`.replace(/[^a-z0-9_-]+/giu, '-');
  const buttons = {};
  const panels = { model: modelPanel, drawing: drawingPanel };
  for (const [mode, label] of [['model', 'Model property'], ['drawing', 'Drawing']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.id = `${safeId}-${mode}-tab`; button.dataset.componentEditorMode = mode;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `${safeId}-${mode}-panel`);
    panels[mode].id = `${safeId}-${mode}-panel`; panels[mode].classList.add('component-editor-panel');
    panels[mode].setAttribute('role', 'tabpanel'); panels[mode].setAttribute('aria-labelledby', button.id);
    buttons[mode] = button; tabs.append(button);
  }
  const key = componentEditorKey(profile, component.id);
  const setMode = (mode, focus = false) => {
    componentEditorModes.set(key, mode);
    for (const name of ['model', 'drawing']) {
      const active = name === mode;
      buttons[name].setAttribute('aria-selected', String(active)); buttons[name].tabIndex = active ? 0 : -1;
      panels[name].hidden = !active;
    }
    root.dataset.mode = mode;
    if (focus) buttons[mode].focus({ preventScroll: true });
  };
  for (const [mode, button] of Object.entries(buttons)) {
    button.addEventListener('click', () => setMode(mode));
    button.addEventListener('keydown', (event) => {
      const order = ['model', 'drawing']; const current = order.indexOf(mode);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? order.length - 1
        : event.key === 'ArrowLeft' ? (current - 1 + order.length) % order.length
          : event.key === 'ArrowRight' ? (current + 1) % order.length : -1;
      if (next < 0) return;
      event.preventDefault(); event.stopPropagation(); setMode(order[next], true);
    });
  }
  setMode(componentEditorModes.get(key) ?? 'model');
  root.append(heading, tabs, modelPanel, drawingPanel);
  return root;
}

function renderBoundedComponentCatalog({ profile, state, editCircuit, list, properties }) {
  const { draft, selection, catalog } = state.circuitEditor;
  const rows = catalog.parts.map((part) => {
    const component = draft.components.find((candidate) => candidate.type === part.type);
    const row = document.createElement('article');
    row.className = 'bounded-part-card'; row.dataset.type = part.type;
    row.dataset.present = String(part.present); row.setAttribute('role', 'listitem');
    row.draggable = part.addable || part.repeatable;
    const thumbnail = document.createElement('span');
    thumbnail.className = 'bounded-part-thumbnail';
    const definition = uiComponentCatalog[part.type];
    const previewComponent = component ?? {
      id: `catalog-${part.type.replace(/[^a-z0-9]+/giu, '-')}`,
      type: part.type,
      label: part.displayName,
      properties: definition?.propertyKeys?.length ? defaultProperties(part.type) : {},
      controls: {},
    };
    if (definition) thumbnail.append(createComponentArtwork(definition, previewComponent, { thumbnail: true }));
    const copy = document.createElement('span'); copy.className = 'bounded-part-copy';
    const name = document.createElement('strong'); name.textContent = part.displayName;
    const summary = document.createElement('small'); summary.textContent = boundedPartSummary(part, component);
    const id = document.createElement('code'); id.textContent = component?.id ?? part.id;
    copy.append(name, summary, id);
    const action = document.createElement('button'); action.type = 'button';
    action.dataset.boundedAdd = part.type;
    action.textContent = part.fixed ? 'Fixed' : part.present ? 'Add another' : 'Add part';
    action.disabled = !(part.addable || part.repeatable);
    action.setAttribute('aria-label', part.fixed
      ? `${part.displayName} is fixed for this profile`
      : `Add ${part.displayName}`);
    if (part.addable || part.repeatable) {
      action.addEventListener('click', () => editCircuit('addComponent', part.type));
      row.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-intent-component', JSON.stringify({ profile, type: part.type }));
      });
    }
    row.title = part.limitation;
    row.append(thumbnail, copy, action);
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

  if (!['resistor.fixed-v1', 'led.basic-v1'].includes(selected.type)) {
    const note = document.createElement('p');
    note.textContent = `${selectedPart.displayName} is a 3.3 V authoring-only part. Its named pins persist, but it cannot grant Build or Run authority.`;
    const duplicate = document.createElement('button'); duplicate.type = 'button'; duplicate.textContent = 'Duplicate disconnected part';
    duplicate.dataset.boundedDuplicate = selected.id;
    duplicate.addEventListener('click', () => editCircuit('duplicateComponent', selected.id));
    properties.replaceChildren(note, duplicate); return;
  }

  const row = document.createElement('div'); row.className = 'bounded-property-row';
  const label = document.createElement('label');
  const limit = document.createElement('small');
  let input;
  if (selected.type === 'resistor.fixed-v1') {
    label.append('Resistance (Ω)');
    limit.textContent = 'Accepted only when the selected LED remains within the exact 3.3 V / 12 mA ideal-model limit.';
    input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = '10000000';
    input.step = '1'; input.value = String(selected.properties.ohms); input.dataset.boundedProperty = 'ohms';
  } else {
    label.append('LED colour');
    limit.textContent = 'Colour selects a tested ideal forward-voltage constant; it is not a wavelength, brightness or physical-accuracy claim.';
    input = document.createElement('select'); input.dataset.boundedProperty = 'color';
    for (const color of selectedPart.supportedProperties.color.values) {
      const option = document.createElement('option'); option.value = color; option.textContent = color;
      option.selected = color === selected.properties.color; input.append(option);
    }
  }
  label.append(limit); input.id = `${selected.id}-${input.dataset.boundedProperty}`; label.htmlFor = input.id;
  row.append(label, input);
  if (!['resistor.fixed-v1', 'led.basic-v1'].includes(selected.type)) {
    properties.replaceChildren(row); return;
  }

  const modelPanel = document.createElement('section');
  const modelStatus = document.createElement('p'); modelStatus.className = 'component-editor-invariant'; modelStatus.setAttribute('role', 'status');
  const duplicate = document.createElement('button'); duplicate.type = 'button'; duplicate.textContent = 'Duplicate disconnected part';
  duplicate.dataset.boundedDuplicate = selected.id;
  duplicate.addEventListener('click', () => {
    const result = editCircuit('duplicateComponent', selected.id);
    if (!result?.ok) modelStatus.textContent = `Duplicate rejected (${result?.code ?? 'validation failed'}). The project is unchanged.`;
  });
  const modelApply = document.createElement('button'); modelApply.type = 'button'; modelApply.textContent = 'Apply model property';
  modelApply.dataset.boundedModelApply = selected.id;
  const modelCancel = document.createElement('button'); modelCancel.type = 'button'; modelCancel.textContent = 'Cancel preview';
  modelCancel.dataset.componentEditorCancel = 'model';
  const currentValue = selected.properties[input.dataset.boundedProperty];
  const previewValue = () => typeof currentValue === 'number' ? Number(input.value) : input.value;
  const modelValid = () => input.checkValidity() && (typeof currentValue !== 'number' || Number.isInteger(previewValue()));
  const modelChanged = () => previewValue() !== currentValue;
  const updateModel = () => {
    const valid = modelValid(); const changed = modelChanged();
    input.setAttribute('aria-invalid', String(!valid)); modelApply.disabled = !valid || !changed;
    modelStatus.textContent = !valid
      ? 'Preview rejected · enter a value inside the existing bounded model contract. No project data changed.'
      : changed
        ? `Model preview only · no project or runtime state has changed. Apply changes ${input.dataset.boundedProperty}, revalidates the model property and circuit, retires current executable and runtime evidence, and requires a fresh Build before Run. Pins, anchors, named nets, drawing and source stay unchanged.`
        : `Current model value · ${input.dataset.boundedProperty} is unchanged. Apply is disabled.`;
  };
  input.addEventListener('input', updateModel); input.addEventListener('change', updateModel);
  modelCancel.addEventListener('click', () => {
    input.value = String(currentValue); updateModel();
    if (document.querySelector('#workbench-inspector-dialog')?.open) input.focus({ preventScroll: true });
  });
  const capturedRevision = state.circuitEditor.revision;
  modelApply.addEventListener('click', () => {
    if (!modelValid() || !modelChanged()) return;
    const currentRevision = (profile === RP2040_PROFILE ? picoPublicWorkbench.snapshot()
      : profile === ESP32C3_PROFILE ? c3PublicWorkbench.snapshot() : stm32PublicWorkbench.snapshot()).circuitEditor.revision;
    if (currentRevision !== capturedRevision) {
      modelStatus.textContent = 'Preview stale · the project changed. Reopen the current value before applying.';
      modelApply.disabled = true; return;
    }
    const result = editCircuit('setComponentProperty', selected.id, input.dataset.boundedProperty, previewValue());
    if (!result?.ok) {
      modelStatus.textContent = `Model edit rejected (${result?.code ?? 'validation failed'}). The project is unchanged.`;
      modelApply.disabled = true;
    }
  });
  const modelActions = document.createElement('div'); modelActions.className = 'component-editor-actions';
  modelActions.append(duplicate, modelCancel, modelApply); modelPanel.append(row, modelStatus, modelActions); updateModel();

  const appearance = document.createElement('section'); appearance.className = 'bounded-property-row bounded-appearance-row';
  const appearanceLabel = document.createElement('label');
  appearanceLabel.textContent = selected.type === 'resistor.fixed-v1' ? 'Body preset' : 'Outline preset';
  const appearanceSelect = document.createElement('select');
  appearanceSelect.dataset.boundedAppearance = selected.id;
  const currentPreset = componentAppearancePreset(
    draft.layout.componentAppearance, selected.id, selected.type,
  );
  const appearancePresets = selected.type === 'resistor.fixed-v1'
    ? RESISTOR_APPEARANCE_PRESETS : LED_APPEARANCE_PRESETS;
  for (const preset of appearancePresets) {
    const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.label;
    option.selected = preset.id === currentPreset; appearanceSelect.append(option);
  }
  const preview = document.createElement('div'); preview.className = 'appearance-preview bounded-appearance-preview';
  const currentBody = componentAppearanceBody(
    draft.layout.componentAppearance, selected.id, selected.type,
  );
  const bodyControls = document.createElement('fieldset'); bodyControls.className = 'appearance-body-controls';
  bodyControls.append(Object.assign(document.createElement('legend'), { textContent: 'Bounded body geometry' }));
  const bodyInputs = {};
  for (const [key, labelText] of [['widthPct', 'Width'], ['heightPct', 'Height'], ['cornerPct', 'Corner softness']]) {
    const labelNode = document.createElement('label'); const output = document.createElement('output');
    output.textContent = `${currentBody[key]}%`; labelNode.append(labelText, output);
    const control = document.createElement('input'); control.type = 'range';
    control.min = String(COMPONENT_BODY_BOUNDS[key].minimum); control.max = String(COMPONENT_BODY_BOUNDS[key].maximum);
    control.step = String(COMPONENT_BODY_BOUNDS[key].step); control.value = String(currentBody[key]);
    control.dataset.boundedBody = key; control.addEventListener('input', () => { output.textContent = `${control.value}%`; renderPreview(); });
    bodyInputs[key] = control; bodyControls.append(labelNode, control);
  }
  const selectedBody = () => Object.fromEntries(Object.entries(bodyInputs).map(([key, control]) => [key, Number(control.value)]));
  const renderPreview = () => preview.replaceChildren(createBaseComponentArtwork(
    uiComponentCatalog[selected.type], selected,
    { appearancePreset: appearanceSelect.value, appearanceBody: selectedBody() },
  ));
  appearanceSelect.addEventListener('change', renderPreview); renderPreview();
  const status = document.createElement('small');
  status.textContent = `Visual preview only · pins ${uiComponentCatalog[selected.type].pins
    .map(({ id }) => id).join('/')}, named nets, electrical properties and runtime semantics stay unchanged.`;
  const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Apply visual preset';
  apply.dataset.boundedAppearanceApply = selected.id;
  const changed = () => appearanceSelect.value !== currentPreset
    || JSON.stringify(selectedBody()) !== JSON.stringify(currentBody);
  const updateApply = () => { apply.disabled = !changed(); };
  appearanceSelect.addEventListener('change', updateApply);
  Object.values(bodyInputs).forEach((control) => control.addEventListener('input', updateApply));
  updateApply();
  apply.addEventListener('click', () => {
    const currentRevision = (profile === RP2040_PROFILE ? picoPublicWorkbench.snapshot()
      : profile === ESP32C3_PROFILE ? c3PublicWorkbench.snapshot() : stm32PublicWorkbench.snapshot()).circuitEditor.revision;
    if (currentRevision !== capturedRevision) {
      status.textContent = 'Visual preview stale · the project changed. Reopen the current drawing before applying.';
      apply.disabled = true; return;
    }
    editCircuit('setComponentAppearanceEdit', selected.id, appearanceSelect.value, selectedBody());
  });
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel preview';
  cancel.dataset.componentEditorCancel = 'drawing';
  cancel.addEventListener('click', () => {
    appearanceSelect.value = currentPreset;
    for (const [key, control] of Object.entries(bodyInputs)) control.value = String(currentBody[key]);
    bodyControls.querySelectorAll('output').forEach((output, index) => {
      output.textContent = `${currentBody[['widthPct', 'heightPct', 'cornerPct'][index]]}%`;
    });
    renderPreview(); updateApply();
    if (document.querySelector('#workbench-inspector-dialog')?.open) appearanceSelect.focus({ preventScroll: true });
  });
  const actions = document.createElement('div'); actions.className = 'appearance-actions'; actions.append(cancel, apply);
  appearanceLabel.append(appearanceSelect, status); appearance.append(appearanceLabel, bodyControls, preview, actions);
  properties.replaceChildren(createComponentEditorSplit({ profile, component: selected, modelPanel, drawingPanel: appearance }));
}

function installBoundedPartsDrop(profile, workbench, diagram) {
  const mime = 'application/x-intent-component';
  diagram.addEventListener('dragover', (event) => {
    if (![...event.dataTransfer.types].includes(mime)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  diagram.addEventListener('drop', (event) => {
    const raw = event.dataTransfer.getData(mime);
    if (!raw) return;
    event.preventDefault();
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    if (payload?.profile !== profile || typeof payload.type !== 'string') return;
    const box = diagram.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const position = {
      x: Math.max(0.08, Math.min(0.92, (event.clientX - box.left) / box.width)),
      y: Math.max(0.1, Math.min(0.9, (event.clientY - box.top) / box.height)),
    };
    const result = workbench.editCircuit('addComponent', payload.type, position);
    const status = document.querySelector('#simple-parts-status');
    if (status && selectedCompilerProfile === profile) status.textContent = result.ok
      ? `Added ${result.componentId} at the dropped canvas position. Undo is available.`
      : `Drop rejected (${result.code}). Project data was not changed.`;
  });
}

function accessibleValidation(result) {
  const rawDiagnostics = result?.diagnostics ?? result?.details ?? [];
  const diagnostics = (Array.isArray(rawDiagnostics) ? rawDiagnostics : [rawDiagnostics]).slice(0, 64)
    .map((item) => typeof item === 'string' ? item : JSON.stringify(item))
    .filter((item) => typeof item === 'string' && item.length > 0);
  return {
    checked: true,
    ok: Boolean(result?.ok),
    code: String(result?.code ?? (result?.ok ? 'OK' : 'CIRCUIT_INVALID')),
    diagnostics,
  };
}

function accessibleWireColors(layout) {
  return Object.fromEntries(Object.entries(layout?.wireStyles ?? {}).map(([netId, style]) => [
    netId, typeof style === 'string' ? style : style?.color,
  ]));
}

function accessibleView({ profile, revision, graph, catalogue, validation, limits }) {
  return createAccessibleConnectionView({
    profile,
    revision,
    components: graph.components,
    nets: graph.nets,
    junctions: graph.junctions ?? [],
    catalogue,
    wireColors: accessibleWireColors(graph.layout),
    limits,
    validation: accessibleValidation(validation),
  });
}

function announceAccessibleConnection(profile, message, preferredRoot = null) {
  accessibleConnectionNotices.set(profile, message);
  const root = preferredRoot ?? (profile === AVR_PROFILE ? elements.accessibleconnectionsroot
    : document.querySelector(`[data-accessible-connections][data-connection-profile="${profile}"]`));
  const status = root?.querySelector('[data-connection-status]');
  if (status) status.textContent = message;
}

function accessibleConnectionRoot(profile) {
  return profile === AVR_PROFILE ? elements.accessibleconnectionsroot
    : document.querySelector(`[data-accessible-connections][data-connection-profile="${profile}"]`);
}

function focusNamedEndpoint(selector, key) {
  requestAnimationFrame(() => {
    const anchor = [...document.querySelectorAll(selector)].find((item) =>
      (item.dataset.endpoint ?? item.dataset.editorEndpoint) === key);
    anchor?.focus({ preventScroll: true });
  });
}

function renderAccessibleConnections({ profile, label, view, adapter }) {
  const root = accessibleConnectionRoot(profile);
  if (!root) return;
  const active = root.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = active?.dataset.connectionFocus ?? null;
  const wasOpen = root.querySelector('details')?.open ?? false;
  const priorFrom = root.querySelector('[data-connection-from]')?.value ?? '';
  const priorTo = root.querySelector('[data-connection-to]')?.value ?? '';
  const priorReconnectNet = root.dataset.reconnectNet ?? '';
  const priorReconnectFrom = root.dataset.reconnectFrom ?? '';

  const details = document.createElement('details');
  details.className = 'accessible-connections'; details.open = wasOpen;
  details.dataset.connectionSchema = view.schema;
  details.dataset.semanticIdentity = view.semanticIdentity;
  const summary = document.createElement('summary');
  summary.textContent = `Connections · ${view.summary.nets} nets · ${view.summary.pins} named pins`;
  summary.dataset.connectionFocus = 'summary';
  const body = document.createElement('div'); body.className = 'accessible-connections-body';
  const intro = document.createElement('p'); intro.className = 'accessible-connection-summary';
  intro.textContent = `${label}. Every named pin and validated cable endpoint is listed in text; colour is optional layout metadata only.`;
  const validation = document.createElement('p');
  validation.className = 'accessible-connection-summary accessible-connection-validation';
  validation.dataset.valid = String(view.validation.ok);
  validation.textContent = view.validation.ok
    ? `Current graph validation: accepted (${view.validation.code}).`
    : `Current draft validation: ${view.validation.code}. Editing remains fail-closed.`;

  const componentList = document.createElement('ul');
  componentList.className = 'accessible-connection-components';
  componentList.setAttribute('aria-label', `${label} components and named pins`);
  for (const component of view.components) {
    const row = document.createElement('li'); row.className = 'accessible-connection-component';
    const heading = document.createElement('strong');
    heading.textContent = `${component.label} · ${component.id}`;
    const pins = document.createElement('ul'); pins.className = 'accessible-connection-pins';
    for (const pin of component.pins) {
      const item = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'accessible-connection-pin';
      button.dataset.endpoint = pin.key; button.dataset.connected = String(pin.connected);
      button.dataset.connectionFocus = `pin:${pin.key}`;
      button.textContent = `${pin.label} · ${pin.key} · ${pin.netId ?? 'free'}`;
      button.setAttribute('aria-label', `Select ${pin.accessibleLabel}`);
      button.addEventListener('click', () => {
        adapter.selectPin(pin);
        announceAccessibleConnection(profile, `Selected named pin ${pin.key}${pin.netId ? ` on ${pin.netId}` : ', currently free'}.`, root);
      });
      item.append(button); pins.append(item);
    }
    row.append(heading, pins); componentList.append(row);
  }

  const netList = document.createElement('ul'); netList.className = 'accessible-connection-nets';
  netList.setAttribute('aria-label', `${label} validated connection list`);
  if (!view.nets.length) {
    const empty = document.createElement('li'); empty.textContent = 'No connections in the current draft.'; netList.append(empty);
  }
  for (const net of view.nets) {
    const row = document.createElement('li'); row.className = 'accessible-connection-net'; row.dataset.netId = net.id;
    const description = document.createElement('p');
    const junction = net.junctions.length ? ` · junctions ${net.junctions.join(', ')}` : ' · no junction';
    description.textContent = `${net.accessibleLabel}${junction}`;
    const actions = document.createElement('div'); actions.className = 'accessible-connection-net-actions';
    const select = document.createElement('button'); select.type = 'button'; select.textContent = 'Select';
    select.dataset.connectionFocus = `net:${net.id}:select`;
    select.setAttribute('aria-label', `Select connection ${net.id}`);
    select.addEventListener('click', () => {
      adapter.selectNet(net.id);
      announceAccessibleConnection(profile, `Selected connection ${net.id}.`, root);
    });
    const reconnect = document.createElement('button'); reconnect.type = 'button'; reconnect.textContent = 'Reconnect';
    reconnect.dataset.connectionFocus = `net:${net.id}:reconnect`;
    reconnect.setAttribute('aria-label', `Reconnect one endpoint of ${net.id}`);
    reconnect.addEventListener('click', () => {
      const currentFrom = root.querySelector('[data-connection-from]')?.value;
      const reconnectEndpoint = net.endpoints.find((endpoint) => endpoint.key === currentFrom) ?? net.endpoints[0];
      root.dataset.reconnectNet = net.id;
      root.dataset.reconnectFrom = reconnectEndpoint.key;
      const from = root.querySelector('[data-connection-from]');
      const to = root.querySelector('[data-connection-to]');
      from.value = reconnectEndpoint.key; to.value = '';
      root.querySelector('[data-connection-focus="connect"]').textContent = 'Reconnect exact pins';
      root.querySelector('[data-connection-cancel]').hidden = false;
      announceAccessibleConnection(profile, `Reconnect ${reconnectEndpoint.key} on ${net.id}: choose an exact free To named pin.`, root);
      to.focus();
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete';
    remove.dataset.connectionFocus = `net:${net.id}:delete`;
    remove.setAttribute('aria-label', `Delete whole connection ${net.id}`);
    remove.addEventListener('click', () => {
      if (adapter.revision() !== view.revision) {
        announceAccessibleConnection(profile, 'Delete rejected: the connection view is stale. Review the refreshed graph.', root); return;
      }
      announceAccessibleConnection(profile, `Deleting exact connection ${net.id}…`, root);
      const result = adapter.deleteNet(net.id, view.revision);
      queueMicrotask(() => announceAccessibleConnection(profile, result?.ok
        ? `Deleted connection ${net.id}. Unrelated components and nets were preserved.`
        : `Delete rejected (${result?.code ?? 'UNKNOWN'}). The graph is unchanged.`, accessibleConnectionRoot(profile)));
    });
    actions.append(select, reconnect, remove); row.append(description, actions); netList.append(row);
  }

  const form = document.createElement('form'); form.className = 'accessible-connection-form';
  form.setAttribute('aria-label', `${label} named pin connection form`);
  const endpointOptions = (selected) => {
    const placeholder = new Option('Choose a named pin', ''); placeholder.selected = !selected;
    return [placeholder, ...view.pins.map((pin) => new Option(
      `${pin.componentLabel} — ${pin.label} (${pin.key}) · ${pin.netId ?? 'free'}`,
      pin.key, false, pin.key === selected,
    ))];
  };
  const fromLabel = document.createElement('label'); fromLabel.append('From named pin');
  const from = document.createElement('select'); from.dataset.connectionFrom = '';
  from.dataset.connectionFocus = 'from'; from.replaceChildren(...endpointOptions(priorReconnectFrom || priorFrom));
  fromLabel.append(from);
  const toLabel = document.createElement('label'); toLabel.append('To named pin');
  const to = document.createElement('select'); to.dataset.connectionTo = '';
  to.dataset.connectionFocus = 'to'; to.replaceChildren(...endpointOptions(priorTo)); toLabel.append(to);
  const connect = document.createElement('button'); connect.type = 'submit';
  connect.dataset.connectionFocus = 'connect';
  connect.textContent = priorReconnectNet ? 'Reconnect exact pins' : 'Connect exact pins';
  const cancelReconnect = document.createElement('button'); cancelReconnect.type = 'button';
  cancelReconnect.dataset.connectionCancel = ''; cancelReconnect.dataset.connectionFocus = 'cancel-reconnect';
  cancelReconnect.textContent = 'Cancel reconnect'; cancelReconnect.hidden = !priorReconnectNet;
  cancelReconnect.addEventListener('click', () => {
    delete root.dataset.reconnectNet; delete root.dataset.reconnectFrom;
    from.value = ''; to.value = '';
    connect.textContent = 'Connect exact pins'; cancelReconnect.hidden = true;
    announceAccessibleConnection(profile, 'Reconnect cancelled. The graph is unchanged; ordinary Connect is ready.', root);
    from.focus();
  });
  const help = document.createElement('p'); help.className = 'accessible-connection-help';
  help.textContent = 'Both endpoints are explicit. Occupied, incompatible, ambiguous, stale or invalid choices are rejected atomically.';
  const status = document.createElement('p'); status.className = 'accessible-connection-status';
  status.dataset.connectionStatus = ''; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  status.textContent = accessibleConnectionNotices.get(profile) ?? 'Choose two named pins. No connection is inferred.';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const expectedRevision = view.revision;
    if (adapter.revision() !== expectedRevision) {
      announceAccessibleConnection(profile, 'Connection rejected: this view is stale. Review the refreshed graph.', root); return;
    }
    if (!from.value || !to.value) {
      announceAccessibleConnection(profile, 'Connection rejected: select both an exact From and To named pin.', root); return;
    }
    const fromPin = view.pins.find((pin) => pin.key === from.value);
    const toPin = view.pins.find((pin) => pin.key === to.value);
    if (!fromPin || !toPin) {
      announceAccessibleConnection(profile, 'Connection rejected: one named pin is no longer present.', root); return;
    }
    const reconnectNet = root.dataset.reconnectNet || null;
    announceAccessibleConnection(profile, reconnectNet
      ? `Validating exact reconnect on ${reconnectNet}…` : 'Validating exact named-pin connection…', root);
    const result = reconnectNet
      ? adapter.reconnect(reconnectNet, fromPin, toPin, expectedRevision)
      : adapter.connect(fromPin, toPin, expectedRevision);
    if (result?.ok) {
      delete root.dataset.reconnectNet; delete root.dataset.reconnectFrom;
      const currentConnect = root.querySelector('[data-connection-focus="connect"]');
      const currentCancel = root.querySelector('[data-connection-cancel]');
      if (currentConnect) currentConnect.textContent = 'Connect exact pins';
      if (currentCancel) currentCancel.hidden = true;
      queueMicrotask(() => announceAccessibleConnection(profile, reconnectNet
        ? `Reconnected ${fromPin.key} to ${toPin.key} on ${reconnectNet}.`
        : `Connected ${fromPin.key} to ${toPin.key}.`, accessibleConnectionRoot(profile)));
    } else {
      queueMicrotask(() => announceAccessibleConnection(profile,
        `Connection rejected (${result?.code ?? 'UNKNOWN'}). The graph is unchanged.`, accessibleConnectionRoot(profile)));
    }
  });
  form.append(fromLabel, toLabel, connect, cancelReconnect, help);
  body.append(intro, validation, componentList, netList, form, status);
  details.append(summary, body); root.replaceChildren(details);
  root.dataset.reconnectNet = priorReconnectNet;
  root.dataset.reconnectFrom = priorReconnectFrom;
  if (focusKey) {
    const target = root.querySelector(`[data-connection-focus="${CSS.escape(focusKey)}"]`)
      ?? root.querySelector('[data-connection-focus="from"]')
      ?? root.querySelector('[data-connection-focus="summary"]');
    target?.focus({ preventScroll: true });
  }
}

function renderBoundedAccessibleConnections(profile, label, state, workbench, anchorSelector) {
  const graph = state.circuitEditor.draft;
  const validation = state.authoringAccepted && !state.circuitValid && !state.circuitAccepted
    ? { ok: true, code: `${state.authoringCode} · RUNTIME_UNAVAILABLE(${state.circuitCode})`, details: [] }
    : state.circuitEditor.validation;
  const view = accessibleView({
    profile,
    revision: state.circuitEditor.revision,
    graph,
    catalogue: uiComponentCatalog,
    validation,
    limits: { components: 17, nets: 24, endpoints: 48 },
  });
  const endpoint = (pin) => ({ component: pin.componentId, pin: pin.id });
  renderAccessibleConnections({
    profile, label, view,
    adapter: {
      revision: () => workbench.circuitEditor.revision,
      selectPin: (pin) => {
        workbench.selectCircuit({ kind: 'component', id: pin.componentId });
        focusNamedEndpoint(anchorSelector, pin.key);
      },
      selectNet: (netId) => workbench.selectCircuit({ kind: 'net', id: netId }),
      connect: (from, to) => workbench.editCircuit('connectEndpoints', endpoint(from), endpoint(to)),
      reconnect: (netId, from, to) => workbench.editCircuit('reconnectEndpoint', netId, endpoint(from), endpoint(to)),
      deleteNet: (netId) => {
        workbench.selectCircuit({ kind: 'net', id: netId });
        return workbench.editCircuit('deleteSelected');
      },
    },
  });
}

function renderAvrAccessibleConnections(validation) {
  const project = currentProject();
  const view = accessibleView({
    profile: AVR_PROFILE,
    revision: editor.revision,
    graph: { ...project.circuit, layout: project.layout },
    catalogue: uiComponentCatalog,
    validation,
    limits: CIRCUIT_LIMITS,
  });
  const endpoint = (pin) => ({ component: pin.componentId, pin: pin.id });
  renderAccessibleConnections({
    profile: AVR_PROFILE, label: 'AVR', view,
    adapter: {
      revision: () => editor.revision,
      selectPin: (pin) => {
        selectComponent(pin.componentId); renderInspector();
        focusNamedEndpoint('#component-layer .pin-anchor', pin.key);
      },
      selectNet: (netId) => { selectNet(netId); renderInspector(); drawCircuitWires(); },
      connect: (from, to) => {
        pendingEndpoint = endpoint(from); wireMode = 'connect';
        return handlePin(endpoint(to));
      },
      reconnect: (_netId, from, to) => {
        pendingEndpoint = endpoint(from); wireMode = 'reconnect';
        return handlePin(endpoint(to), true);
      },
      deleteNet: (netId) => {
        setSelection({ kind: 'none' });
        return applyEditor({ type: 'wire.delete', netId }, `Deleted whole net ${netId}`);
      },
    },
  });
}

let projectNavigationView = null;
function navigationState() {
  const profile = selectedCompilerProfile;
  const brief = projectBriefForProfile(profile);
  const scenarios = profile === AVR_PROFILE && scenarioTimelineEditor
    ? scenarioTimelineEditor.timeline.scenarios.map((item) => ({ id: item.id, name: item.name,
      events: item.events.map((event) => ({ id: event.id })) })) : [];
  if (profile === AVR_PROFILE) {
    const project = currentProject();
    const validation = editor.kind === 'candidate-project-v3' ? editor.runnable
      : validateCircuit(project.circuit, { modelLibraryLock: modelLibraryLockFor(AVR_PROFILE) });
    return { profile, generation: lifecycle.projectGeneration, revision: editor.revision,
      connections: accessibleView({ profile, revision: editor.revision,
        graph: { ...project.circuit, layout: project.layout }, catalogue: uiComponentCatalog,
        validation, limits: CIRCUIT_LIMITS }), sources: project.source.files,
      criteria: brief.acceptanceCriteria, scenarios };
  }
  const state = profile === RP2040_PROFILE ? picoPublicWorkbench.snapshot()
    : profile === ESP32C3_PROFILE ? c3PublicWorkbench.snapshot() : stm32PublicWorkbench.snapshot();
  const sourceName = profile === ESP32C3_PROFILE ? 'sketch.ino' : 'main.c';
  const source = state.source ?? state.project?.source;
  const connectionValidation = state.authoringAccepted && !state.circuitValid && !state.circuitAccepted
    ? { ok: true, code: `${state.authoringCode} · RUNTIME_UNAVAILABLE(${state.circuitCode})`, details: [] }
    : state.circuitEditor.validation;
  return { profile, generation: 1, revision: state.revision,
    connections: accessibleView({ profile, revision: state.circuitEditor.revision,
      graph: state.circuitEditor.draft, catalogue: uiComponentCatalog,
      validation: connectionValidation, limits: { components: 17, nets: 24, endpoints: 48 } }),
    sources: [{ name: sourceName, content: source }], criteria: brief.acceptanceCriteria, scenarios: [] };
}
function currentNavigationIdentity() {
  const state = navigationState();
  return `${state.profile}:${state.generation}:${state.revision}:${state.connections.semanticIdentity}`;
}
function focusSourceLine(textarea, content, line) {
  const lines = content.split('\n');
  const start = lines.slice(0, line - 1).reduce((count, item) => count + item.length + 1, 0);
  textarea.focus(); textarea.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  textarea.scrollTop = Math.max(0, (line - 4) * 21);
}
function navigateProjectResult(entry, expectedIdentity) {
  if (currentNavigationIdentity() !== expectedIdentity) {
    renderProjectNavigation(); elements.projectnavigationstatus.textContent = 'Project changed; search again.'; return;
  }
  const profile = selectedCompilerProfile;
  if (entry.kind === 'component' || entry.kind === 'pin' || entry.kind === 'net') {
    // These targets are owned by the always-present circuit canvas. Close the
    // Brief popup first so the resulting selection/focus is actually visible.
    sharedWorkbenchShell.closeDialog({ restoreFocus: false });
    if (profile === AVR_PROFILE) {
      if (entry.kind === 'net') { selectNet(entry.target.netId); drawCircuitWires(); }
      else selectComponent(entry.target.componentId);
      renderInspector();
      if (entry.kind === 'pin') focusNamedEndpoint('#component-layer .pin-anchor', entry.target.pinKey);
    } else {
      const workbench = profile === RP2040_PROFILE ? picoPublicWorkbench
        : profile === ESP32C3_PROFILE ? c3PublicWorkbench : stm32PublicWorkbench;
      workbench.selectCircuit(entry.kind === 'net' ? { kind: 'net', id: entry.target.netId }
        : { kind: 'component', id: entry.target.componentId });
      if (entry.kind === 'pin') focusNamedEndpoint(profile === RP2040_PROFILE ? '#pico-editor-components .pin-anchor'
        : profile === ESP32C3_PROFILE ? '#c3-editor-components .pin-anchor' : '#stm32-editor-components .pin-anchor', entry.target.pinKey);
    }
  } else if (entry.kind === 'file' || entry.kind === 'source') {
    // Source now lives in the Firmware popup. Move the authoritative editor
    // into view before focusing the requested file/line; focusing its parked
    // node would report success while leaving the user on a hidden surface.
    if (profile === AVR_PROFILE) {
      selectedSourceFile = entry.target.file; renderProject();
      sharedWorkbenchShell.openDialog('firmware', document.querySelector('#firmware-open'), { initialFocus: false });
      if (entry.target.line) focusSourceLine(elements.source, currentProject().source.files.find((item) => item.name === entry.target.file).content, entry.target.line);
      else elements.sourcefile.focus();
    } else {
      sharedWorkbenchShell.openDialog('firmware', document.querySelector('#firmware-open'), { initialFocus: false });
      const textarea = profile === RP2040_PROFILE ? elements.picosource : profile === ESP32C3_PROFILE ? elements.c3source : elements.stm32source;
      if (entry.target.line) focusSourceLine(textarea, textarea.value, entry.target.line); else textarea.focus();
    }
  } else if (entry.target.requirementId) {
    const row = document.querySelector(`[data-requirement-id="${CSS.escape(entry.target.requirementId)}"]`);
    row?.scrollIntoView({ block: 'center' }); const target = row?.querySelector('button:not(:disabled)') ?? row;
    if (target) { if (target === row) target.tabIndex = -1; target.focus({ preventScroll: true }); }
  } else if (entry.target.scenarioId) {
    document.querySelector(`[data-scenario-id="${CSS.escape(entry.target.scenarioId)}"] input`)?.focus({ preventScroll: true });
  }
  elements.projectnavigationstatus.textContent = `Opened ${entry.kind} ${entry.id}. Project data was not changed.`;
}
function renderProjectNavigation() {
  try {
    projectNavigationView = createProjectNavigationView(navigationState());
    const found = searchProjectNavigation(projectNavigationView, elements.projectnavigationquery.value, 100);
    const identity = currentNavigationIdentity();
    elements.projectnavigationstatus.textContent = found.query
      ? `${found.total} results${found.truncated ? ' · first 100 shown; refine the query' : ''}.`
      : 'Type to search the current authored project.';
    elements.projectnavigationresults.replaceChildren(...found.results.map((entry) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'project-navigation-result';
      button.dataset.navigationKind = entry.kind; button.dataset.navigationId = entry.id; button.setAttribute('role', 'listitem');
      const kind = document.createElement('span'); kind.textContent = entry.kind;
      const label = document.createElement('span'); label.textContent = entry.label;
      button.append(kind, label); button.addEventListener('click', () => navigateProjectResult(entry, identity)); return button;
    }));
  } catch (error) {
    projectNavigationView = null; elements.projectnavigationresults.replaceChildren();
    elements.projectnavigationstatus.textContent = `Project search unavailable (${error.code ?? 'INVALID_PROJECT'}).`;
  }
}
elements.projectnavigationquery.addEventListener('input', renderProjectNavigation);

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
    const next = line('Next', example.next);
    button.append(name, learn, tryIt, outcome, limits, next);
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
  if (branches.length !== 2) throw new TypeError('BOUNDED_ROUTE_COMBINED_PATH_REQUIRES_TWO_BRANCHES');
  return [...branches[0].points, ...branches[1].points.slice(0, -1).reverse()];
}

function boundedPixelBranches(family, anchors, box) {
  return routeFamilyPaths(family, anchors).map((branch) => ({
    endpoint: branch.endpoint,
    points: boundedPixelPoints(branch.points, box),
  }));
}

function boundedReconcileStoredFamily(net, stored) {
  if (!isRouteFamily(stored) || !stored.branches.length) return stored;
  const expected = new Set(net.endpoints.map(picoEndpointKey));
  const retained = stored.branches.filter((branch) => expected.has(picoEndpointKey(branch.endpoint)));
  const hub = retained[0]?.points?.at(-1) ?? stored.branches[0]?.points?.at(-1);
  if (!hub) return null;
  const byEndpoint = new Map(retained.map((branch) => [picoEndpointKey(branch.endpoint), branch]));
  return {
    schema: 'intent-mcu-route@1',
    branches: net.endpoints.map((endpoint) => byEndpoint.get(picoEndpointKey(endpoint)) ?? {
      endpoint: structuredClone(endpoint), points: [structuredClone(hub)],
    }),
  };
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
    const family = materializeRouteFamily(net, boundedReconcileStoredFamily(net, stored), geometry.anchors, geometry.obstacles);
    const branches = boundedPixelBranches(family, geometry.anchors, geometry.box);
    const points = branches.length === 2
      ? boundedPixelPoints(boundedCombinedPath(family, geometry.anchors), geometry.box) : branches[0].points;
    return { family, branches, points };
  }
  if (net.endpoints.length !== 2) {
    const family = materializeRouteFamily(net, null, geometry.anchors, geometry.obstacles);
    const branches = boundedPixelBranches(family, geometry.anchors, geometry.box);
    return { family, branches, points: branches[0].points };
  }
  const pixelAnchors = net.endpoints.map((endpoint) => picoEditorAnchor(endpoint, config.diagram, config.components));
  const points = picoEditorRoute(pixelAnchors, geometry.box,
    picoEditorObstacles(config.diagram, config.components), occupied);
  const storedFamily = boundedFamilyFromPixelRoute(net, points, geometry.box);
  const family = materializeRouteFamily(net, storedFamily, geometry.anchors, geometry.obstacles);
  return { family, branches: boundedPixelBranches(family, geometry.anchors, geometry.box), points };
}

function boundedPathData(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function boundedCrossings(routes) {
  const result = [];
  for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
      const left = routes[leftIndex]; const right = routes[rightIndex];
      if (left.netId === right.netId) continue;
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
      materialized.flatMap((item) => item.branches.map((branch) => ({ netId: item.net.id, points: branch.points }))));
    materialized.push({ net, ...resolved });
  }
  const separated = separateParallelWireLanes(materialized.map((item) => ({
    netId: item.net.id, points: item.points,
  })), { clearance: 8, obstacles: picoEditorObstacles(config.diagram, config.components),
    bounds: { left: 8, right: geometry.box.width - 8, top: 8, bottom: geometry.box.height - 8 } });
  const drawings = [];
  for (const item of materialized) {
    const twoTerminal = item.branches.length === 2;
    const points = twoTerminal
      ? separated.routes.find((route) => route.netId === item.net.id)?.points ?? item.points : item.points;
    const renderedBranches = twoTerminal ? [{ points }] : item.branches;
    const d = renderedBranches.map((branch) => boundedPathData(branch.points)).join(' ');
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
    path.dataset.net = item.net.id; path.dataset.points = JSON.stringify(renderedBranches.map((branch) => branch.points));
    path.dataset.renderedEndpoints = String(item.branches.length);
    path.dataset.laneConflicts = String(separated.conflicts.filter((value) => value.leftNet === item.net.id || value.rightNet === item.net.id).length);
    path.style.setProperty('--wire-color', draft.layout.wireStyles[item.net.id] ?? '#39dff2');
    path.setAttribute('d', d); drawings.push(hit, path);
    if (item.branches.length > 2) {
      const hub = item.branches[0].points.at(-1);
      const junction = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      junction.classList.add('pico-wire-junction'); junction.dataset.net = item.net.id;
      junction.dataset.renderedEndpoints = String(item.branches.length);
      junction.setAttribute('cx', hub.x); junction.setAttribute('cy', hub.y); junction.setAttribute('r', '4');
      drawings.push(junction);
    }
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
  const crossingRoutes = materialized.flatMap((item) => item.branches.length === 2
    ? [separated.routes.find((route) => route.netId === item.net.id) ?? { netId: item.net.id, points: item.points }]
    : item.branches.map((branch) => ({ netId: item.net.id, points: branch.points })));
  for (const crossing of boundedCrossings(crossingRoutes)) {
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
      ? (() => {
        const branches = boundedPixelBranches(targetFamily, geometry.anchors, geometry.box);
        return { family: targetFamily, branches, points: branches.length === 2
          ? boundedPixelPoints(boundedCombinedPath(targetFamily, geometry.anchors), geometry.box) : branches[0].points };
      })()
      : boundedFamilyForNet(config, draft, net, geometry, routes);
    const candidateBranches = resolved.branches ?? [{ points: resolved.points }];
    const blocked = candidateBranches.some(({ points }) => points.slice(0, -1).some((start, index) => {
      const end = points[index + 1];
      return picoEditorObstacles(config.diagram, config.components).some((body) => {
        const endpointEscape = index === 0 && net.endpoints.some(({ component }) => body.component === component);
        return !endpointEscape && picoSegmentCrossesBody(start, end, body);
      });
    }));
    if (blocked) return { ok: false, code: 'WIRE_ROUTE_BODY_INTERSECTION' };
    routes.push(...candidateBranches.map(({ points }) => ({ netId: net.id, points })));
  }
  const separated = separateParallelWireLanes(routes, {
    clearance: 8, obstacles: picoEditorObstacles(config.diagram, config.components),
    bounds: { left: 8, right: geometry.box.width - 8, top: 8, bottom: geometry.box.height - 8 },
  });
  const interNetConflicts = separated.conflicts.filter((conflict) => conflict.leftNet !== conflict.rightNet);
  return interNetConflicts.length
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
  elements.picobranch.disabled = selection.kind !== 'net' || wireDraft.mode !== 'none';
  renderNamedBranchRemoval(elements.picobranchendpoint, elements.picoremovebranch, draft, selection, wireDraft);
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
    profile: RP2040_PROFILE, state, editCircuit: (...args) => picoPublicWorkbench.editCircuit(...args),
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
    const artwork = createBaseComponentArtwork(definition, component, {
      appearancePreset: componentAppearancePreset(draft.layout.componentAppearance, component.id, component.type),
      appearanceBody: componentAppearanceBodyOrNull(draft.layout.componentAppearance, component.id, component.type),
    }); card.append(artwork);
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
  renderBoundedAccessibleConnections(
    RP2040_PROFILE, 'RP2040 Pico', state, picoPublicWorkbench, '#pico-editor-components .pin-anchor',
  );
  elements.picodiagram.dataset.connected = String(validation.ok);
  requestAnimationFrame(() => requestAnimationFrame(drawPicoEditorWires));
}

const retainedPicoDraft = readControllerDraft(RP2040_PROFILE);
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
    queueMicrotask(renderProjectNavigation);
    void syncX92Identity('RP2040 source or electrical graph changed');
    queueMicrotask(() => persistControllerDraft(RP2040_PROFILE, picoPublicWorkbench));
  },
  onDiagnostics: (snapshot) => renderProfileDiagnostics(snapshot, {
    textarea: elements.picosource, summary: elements.picodiagnostics,
    links: elements.picodiagnosticlinks, current: () => picoPublicWorkbench.snapshot(),
  }),
  onSave: () => saveCommonProject(RP2040_PROFILE),
  onOpen: (file) => openCommonProjectFile(file),
  advanceGuard: (_action, dispatchPermit) => x92AdvancingBoundary(dispatchPermit),
});
restoreControllerDraft(RP2040_PROFILE, picoPublicWorkbench, retainedPicoDraft);
bindControllerDraftInputs(RP2040_PROFILE, picoPublicWorkbench, elements.picosource, elements.picoprojectname);
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
  newCircuit: () => picoPublicWorkbench.editCircuit('newProject'),
  addComponent: (type, position) => picoPublicWorkbench.editCircuit('addComponent', type, position),
  addMissingComponent: (type) => picoPublicWorkbench.editCircuit('addMissingComponent', type),
  setComponentProperty: (id, key, value) => picoPublicWorkbench.editCircuit('setComponentProperty', id, key, value),
  setComponentAppearance: (id, preset) => picoPublicWorkbench.editCircuit('setComponentAppearance', id, preset),
  setComponentAppearanceEdit: (id, preset, body) => picoPublicWorkbench.editCircuit('setComponentAppearanceEdit', id, preset, body),
  beginReconnect: () => picoPublicWorkbench.editCircuit('beginReconnect'),
  cancelWire: () => picoPublicWorkbench.editCircuit('cancelWireDraft'),
  addWireBend: () => editBoundedRoute('pico', 'bend'),
  nudgeWireSegment: (direction) => editBoundedRoute('pico', 'move', direction),
  setWireColor: (color) => setBoundedWireColor('pico', color),
  setWireRoute: (netId, route) => picoPublicWorkbench.editCircuit('setWireRoute', netId, route),
  apiBatch: (operations, transactionId) => picoPublicWorkbench.editCircuit('applyApiBatch', operations, transactionId),
  apiUndo: (transactionId) => picoPublicWorkbench.editCircuit('undoApi', transactionId),
  apiRedo: (transactionId) => picoPublicWorkbench.editCircuit('redoApi', transactionId),
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
elements.picobranch.addEventListener('click', () => beginNamedWireBranch(picoPublicWorkbench, elements.picowirestate));
elements.picobranchendpoint.addEventListener('change', () => { elements.picoremovebranch.disabled = !elements.picobranchendpoint.value; });
elements.picoremovebranch.addEventListener('click', () => removeNamedBranch(picoPublicWorkbench, elements.picobranchendpoint, elements.picowirestate));
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
  elements.c3branch.disabled = selection.kind !== 'net' || wireDraft.mode !== 'none';
  renderNamedBranchRemoval(elements.c3branchendpoint, elements.c3removebranch, draft, selection, wireDraft);
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
    profile: ESP32C3_PROFILE, state, editCircuit: (...args) => c3PublicWorkbench.editCircuit(...args),
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
    const artwork = createBaseComponentArtwork(definition, component, {
      appearancePreset: componentAppearancePreset(draft.layout.componentAppearance, component.id, component.type),
      appearanceBody: componentAppearanceBodyOrNull(draft.layout.componentAppearance, component.id, component.type),
    }); card.append(artwork);
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
  renderBoundedAccessibleConnections(
    ESP32C3_PROFILE, 'ESP32-C3', state, c3PublicWorkbench, '#c3-editor-components .pin-anchor',
  );
  elements.c3diagram.dataset.connected = String(validation.ok);
  requestAnimationFrame(() => requestAnimationFrame(drawC3EditorWires));
}

const retainedC3Draft = readControllerDraft(ESP32C3_PROFILE);
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
    queueMicrotask(renderProjectNavigation);
    void syncX92Identity('ESP32-C3 source or electrical graph changed');
    queueMicrotask(() => persistControllerDraft(ESP32C3_PROFILE, c3PublicWorkbench));
  },
  onDiagnostics: (snapshot) => renderProfileDiagnostics(snapshot, {
    textarea: elements.c3source, summary: elements.c3diagnostics,
    links: elements.c3diagnosticlinks, current: () => c3PublicWorkbench.snapshot(),
  }),
  onSave: () => saveCommonProject(ESP32C3_PROFILE),
  onOpen: (file) => openCommonProjectFile(file),
  dispatchAction: (action, task) => executeC3ManualAction(action, task),
  advanceGuard: (action, permit, binding) => x92C3Integration?.advancingBoundary(permit, binding, action)
    ?? { ok: false, code: 'X92_C3_PRODUCT_OWNER_NOT_READY' },
});
restoreControllerDraft(ESP32C3_PROFILE, c3PublicWorkbench, retainedC3Draft);
bindControllerDraftInputs(ESP32C3_PROFILE, c3PublicWorkbench, elements.c3source, elements.c3projectname);
window.__ESP32C3_PUBLIC_WORKBENCH__ = {
  state: () => c3PublicWorkbench.snapshot(),
  build: () => executeC3ManualAction('firmware.build',
    (permit) => c3PublicWorkbench.build({ advancePermit: permit })),
  run: () => executeC3ManualAction('runtime.run',
    (permit, binding) => c3PublicWorkbench.run({ advancePermit: permit, x92Binding: binding })),
  dispose: () => c3PublicWorkbench.dispose(),
  selectCircuit: (selection) => c3PublicWorkbench.selectCircuit(selection),
  deleteSelected: () => c3PublicWorkbench.editCircuit('deleteSelected'),
  undoCircuit: () => c3PublicWorkbench.editCircuit('undo'),
  redoCircuit: () => c3PublicWorkbench.editCircuit('redo'),
  moveCircuitComponent: (id, x, y) => c3PublicWorkbench.editCircuit('moveComponent', id, x, y),
  rotateCircuitComponent: (id) => c3PublicWorkbench.editCircuit('rotateComponent', id),
  activateEndpoint: (endpoint) => c3PublicWorkbench.editCircuit('activateEndpoint', endpoint),
  newCircuit: () => c3PublicWorkbench.editCircuit('newProject'),
  addComponent: (type, position) => c3PublicWorkbench.editCircuit('addComponent', type, position),
  addMissingComponent: (type) => c3PublicWorkbench.editCircuit('addMissingComponent', type),
  setComponentProperty: (id, key, value) => c3PublicWorkbench.editCircuit('setComponentProperty', id, key, value),
  setComponentAppearance: (id, preset) => c3PublicWorkbench.editCircuit('setComponentAppearance', id, preset),
  setComponentAppearanceEdit: (id, preset, body) => c3PublicWorkbench.editCircuit('setComponentAppearanceEdit', id, preset, body),
  beginReconnect: () => c3PublicWorkbench.editCircuit('beginReconnect'),
  cancelWire: () => c3PublicWorkbench.editCircuit('cancelWireDraft'),
  addWireBend: () => editBoundedRoute('c3', 'bend'),
  nudgeWireSegment: (direction) => editBoundedRoute('c3', 'move', direction),
  setWireColor: (color) => setBoundedWireColor('c3', color),
  setWireRoute: (netId, route) => c3PublicWorkbench.editCircuit('setWireRoute', netId, route),
  apiBatch: (operations, transactionId) => c3PublicWorkbench.editCircuit('applyApiBatch', operations, transactionId),
  apiUndo: (transactionId) => c3PublicWorkbench.editCircuit('undoApi', transactionId),
  apiRedo: (transactionId) => c3PublicWorkbench.editCircuit('redoApi', transactionId),
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
elements.c3branch.addEventListener('click', () => beginNamedWireBranch(c3PublicWorkbench, elements.c3wirestate));
elements.c3branchendpoint.addEventListener('change', () => { elements.c3removebranch.disabled = !elements.c3branchendpoint.value; });
elements.c3removebranch.addEventListener('click', () => removeNamedBranch(c3PublicWorkbench, elements.c3branchendpoint, elements.c3wirestate));
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
  elements.stm32branch.disabled = selection.kind !== 'net' || wireDraft.mode !== 'none';
  renderNamedBranchRemoval(elements.stm32branchendpoint, elements.stm32removebranch, draft, selection, wireDraft);
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
    profile: STM32F429ZI_PROFILE, state, editCircuit: (...args) => stm32PublicWorkbench.editCircuit(...args),
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
    const artwork = createBaseComponentArtwork(definition, component, {
      appearancePreset: componentAppearancePreset(draft.layout.componentAppearance, component.id, component.type),
      appearanceBody: componentAppearanceBodyOrNull(draft.layout.componentAppearance, component.id, component.type),
    }); card.append(artwork);
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
  renderBoundedAccessibleConnections(
    STM32F429ZI_PROFILE, 'STM32F429ZI', state, stm32PublicWorkbench, '#stm32-editor-components .pin-anchor',
  );
  elements.stm32diagram.dataset.connected = String(validation.ok);
  requestAnimationFrame(() => requestAnimationFrame(drawStm32EditorWires));
}

const retainedStm32Draft = readControllerDraft(STM32F429ZI_PROFILE);
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
    queueMicrotask(renderProjectNavigation);
    void syncX92Identity('STM32 source or electrical graph changed');
    queueMicrotask(() => persistControllerDraft(STM32F429ZI_PROFILE, stm32PublicWorkbench));
  },
  onDiagnostics: (snapshot) => renderProfileDiagnostics(snapshot, {
    textarea: elements.stm32source, summary: elements.stm32diagnostics,
    links: elements.stm32diagnosticlinks, current: () => stm32PublicWorkbench.snapshot(),
  }),
  onSave: () => saveCommonProject(STM32F429ZI_PROFILE),
  onOpen: (file) => openCommonProjectFile(file),
  dispatchAction: (action, task) => executeStm32ManualAction(action, task),
  advanceGuard: (action, permit, binding) => x92Stm32Integration?.advancingBoundary(permit, binding, action)
    ?? { ok: false, code: 'X92_STM32_PRODUCT_OWNER_NOT_READY' },
});
restoreControllerDraft(STM32F429ZI_PROFILE, stm32PublicWorkbench, retainedStm32Draft);
bindControllerDraftInputs(STM32F429ZI_PROFILE, stm32PublicWorkbench, elements.stm32source, elements.stm32projectname);
document.addEventListener('input', (event) => {
  const owner = {
    'pico-source': [RP2040_PROFILE, picoPublicWorkbench],
    'pico-project-name': [RP2040_PROFILE, picoPublicWorkbench],
    'c3-source': [ESP32C3_PROFILE, c3PublicWorkbench],
    'c3-project-name': [ESP32C3_PROFILE, c3PublicWorkbench],
    'stm32-source': [STM32F429ZI_PROFILE, stm32PublicWorkbench],
    'stm32-project-name': [STM32F429ZI_PROFILE, stm32PublicWorkbench],
  }[event.target?.id];
  if (owner) queueMicrotask(() => persistControllerDraft(owner[0], owner[1]));
});
window.addEventListener('pagehide', () => {
  persistControllerDraft(RP2040_PROFILE, picoPublicWorkbench);
  persistControllerDraft(ESP32C3_PROFILE, c3PublicWorkbench);
  persistControllerDraft(STM32F429ZI_PROFILE, stm32PublicWorkbench);
});
window.__STM32_PUBLIC_WORKBENCH__ = {
  state: () => stm32PublicWorkbench.snapshot(),
  build: () => executeStm32ManualAction('firmware.build',
    (permit) => stm32PublicWorkbench.build({ advancePermit: permit })),
  run: () => executeStm32ManualAction('runtime.run',
    (permit, binding) => stm32PublicWorkbench.run(false, { advancePermit: permit, x92Binding: binding })),
  reset: () => executeStm32ManualAction('runtime.run',
    (permit, binding) => stm32PublicWorkbench.run(true, { advancePermit: permit, x92Binding: binding })),
  stop: () => stm32PublicWorkbench.stop(),
  selectCircuit: (selection) => stm32PublicWorkbench.selectCircuit(selection),
  deleteSelected: () => stm32PublicWorkbench.editCircuit('deleteSelected'),
  undoCircuit: () => stm32PublicWorkbench.editCircuit('undo'),
  redoCircuit: () => stm32PublicWorkbench.editCircuit('redo'),
  moveCircuitComponent: (id, x, y) => stm32PublicWorkbench.editCircuit('moveComponent', id, x, y),
  rotateCircuitComponent: (id) => stm32PublicWorkbench.editCircuit('rotateComponent', id),
  activateEndpoint: (endpoint) => stm32PublicWorkbench.editCircuit('activateEndpoint', endpoint),
  newCircuit: () => stm32PublicWorkbench.editCircuit('newProject'),
  addComponent: (type, position) => stm32PublicWorkbench.editCircuit('addComponent', type, position),
  addMissingComponent: (type) => stm32PublicWorkbench.editCircuit('addMissingComponent', type),
  setComponentProperty: (id, key, value) => stm32PublicWorkbench.editCircuit('setComponentProperty', id, key, value),
  setComponentAppearance: (id, preset) => stm32PublicWorkbench.editCircuit('setComponentAppearance', id, preset),
  setComponentAppearanceEdit: (id, preset, body) => stm32PublicWorkbench.editCircuit('setComponentAppearanceEdit', id, preset, body),
  beginReconnect: () => stm32PublicWorkbench.editCircuit('beginReconnect'),
  cancelWire: () => stm32PublicWorkbench.editCircuit('cancelWireDraft'),
  apiBatch: (operations, transactionId) => stm32PublicWorkbench.editCircuit('applyApiBatch', operations, transactionId),
  apiUndo: (transactionId) => stm32PublicWorkbench.editCircuit('undoApi', transactionId),
  apiRedo: (transactionId) => stm32PublicWorkbench.editCircuit('redoApi', transactionId),
  addWireBend: () => editBoundedRoute('stm32', 'bend'),
  nudgeWireSegment: (direction) => editBoundedRoute('stm32', 'move', direction),
  setWireColor: (color) => setBoundedWireColor('stm32', color),
  setWireRoute: (netId, route) => stm32PublicWorkbench.editCircuit('setWireRoute', netId, route),
};
function createNewControllerProject(profile, workbench) {
  const originalDraftId = activeDraftId;
  if (!persistControllerDraft(profile, workbench)) {
    profileMessage(profile, 'New circuit stopped because the current browser recovery copy could not be preserved. Download a copy and try again.');
    return { ok: false, code: 'NEW_PROJECT_RECOVERY_REQUIRED' };
  }
  const originalKey = profileDraftStorageKey(profile);
  const originalBytes = localStorage.getItem(originalKey);
  if (!originalBytes) return { ok: false, code: 'NEW_PROJECT_RECOVERY_REQUIRED' };
  const nextDraftId = forkDraftForRecovery();
  const result = workbench.editCircuit('newProject');
  if (!result.ok || !persistControllerDraft(profile, workbench)) {
    if (result.ok) workbench.editCircuit('undo');
    forkDraftForRecovery(originalDraftId);
    profileMessage(profile, 'New circuit stopped because its new browser recovery copy could not be created. The preserved original remains active.');
    return { ok: false, code: 'NEW_PROJECT_COPY_FAILED' };
  }
  setProjectBaseline(profile);
  registerActiveDraft(currentProjectNameForGuard(profile));
  renderDraftRecoveryChoices();
  return { ...result, originalDraftId, originalKey, nextDraftId };
}
function bindNewControllerProject(selector, profile, workbench) {
  document.querySelector(selector)?.addEventListener('click', () => {
    const create = () => createNewControllerProject(profile, workbench);
    if (!requestUnsavedChangeGuard({ profile, actionLabel: 'creating a new empty circuit', continueAction: create })) create();
  });
}
bindNewControllerProject('#pico-new-circuit', RP2040_PROFILE, picoPublicWorkbench);
bindNewControllerProject('#c3-new-circuit', ESP32C3_PROFILE, c3PublicWorkbench);
bindNewControllerProject('#stm32-new-circuit', STM32F429ZI_PROFILE, stm32PublicWorkbench);
installBoundedPartsDrop(RP2040_PROFILE, picoPublicWorkbench, elements.picodiagram);
installBoundedPartsDrop(ESP32C3_PROFILE, c3PublicWorkbench, elements.c3diagram);
installBoundedPartsDrop(STM32F429ZI_PROFILE, stm32PublicWorkbench, elements.stm32diagram);
renderProfileExampleCards(STM32F429ZI_PROFILE, elements.stm32profileexamples, stm32PublicWorkbench);
elements.stm32delete.addEventListener('click', () => stm32PublicWorkbench.editCircuit('deleteSelected'));
elements.stm32undo.addEventListener('click', () => stm32PublicWorkbench.editCircuit('undo'));
elements.stm32redo.addEventListener('click', () => stm32PublicWorkbench.editCircuit('redo'));
elements.stm32rotate.addEventListener('click', () => {
  const selection = stm32PublicWorkbench.snapshot().circuitEditor.selection;
  if (selection.kind === 'component') stm32PublicWorkbench.editCircuit('rotateComponent', selection.id);
});
elements.stm32reconnect.addEventListener('click', () => beginNamedWireReconnect(stm32PublicWorkbench, elements.stm32wirestate));
elements.stm32branch.addEventListener('click', () => beginNamedWireBranch(stm32PublicWorkbench, elements.stm32wirestate));
elements.stm32branchendpoint.addEventListener('change', () => { elements.stm32removebranch.disabled = !elements.stm32branchendpoint.value; });
elements.stm32removebranch.addEventListener('click', () => removeNamedBranch(stm32PublicWorkbench, elements.stm32branchendpoint, elements.stm32wirestate));
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
  const priorComponentId = selectedComponentId;
  selection = next?.kind ? structuredClone(next) : { kind: 'none' };
  selectedComponentId = selection.kind === 'component' ? selection.componentId : null;
  if (selectedComponentId !== priorComponentId) appearancePreview = null;
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

let regressionMatrixReport = null;
let coverageReport = null;
let checkableEvidenceReport = null;
let checkableEvidenceGeneration = 0;
let checkableEvidenceOrigin = 'none';
let regressionPartitionEvidence = [];
let regressionMatrixRunning = false;
let regressionMatrixReady = false;
let versionRegressionReport = null;
let versionRegressionReady = false;
let longDurationReport = null;
let longDurationRunning = false;
let longDurationReady = false;
let timeInvarianceReport = null;
let timeInvarianceRunning = false;
let timeInvarianceReady = false;
let eventOrderReport = null;
let eventOrderRunning = false;
let eventOrderReady = false;
let resetClassReport = null;
let resetClassRunning = false;
let resetClassReady = false;
let unsupportedAccessReport = null;
let unsupportedAccessRunning = false;
let unsupportedAccessReady = false;
let digitalStateReport = null;
let digitalStateRunning = false;
let digitalStateReady = false;
let digitalStateRuntimeReport = null;
let digitalStateRuntimeRunning = false;
let digitalStateRuntimeReady = false;
let precisionCheckReport = null;
let precisionCheckRunning = false;
let precisionCheckReady = false;
let causalChainReport = null;
let causalChainRunning = false;
let causalChainReady = false;
let failureReplayReport = null;
let failureReplaySession = null;
let failureReplayRunning = false;
let failureReplayReady = false;
let failureReplayToken = 0;
let failureReplayGeneration = 3600;
let failureReplayRetirements = 0;
let failureReplayArtifact = null;
let usartResponseReport = null;
let usartResponseRunning = false;
let usartResponseReady = false;
let usartResponseToken = 0;
let usartResponseGeneration = 2300;
let usartResponseWorkers = [];

const waitForMatrixState = async (read, accept, code, timeoutMilliseconds = 30_000) => {
  const deadline = performance.now() + timeoutMilliseconds;
  while (performance.now() < deadline) {
    const value = read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Object.assign(new Error(code), { code });
};

function taggedEvidenceText(tagged) {
  return tagged.state === 'known' ? JSON.stringify(tagged.value) : `${tagged.state}: ${tagged.reason}`;
}

function renderCheckableEvidence(report = checkableEvidenceReport) {
  elements.checkableevidencerows.replaceChildren();
  elements.checkableevidencelimitations.replaceChildren();
  if (!report) {
    elements.checkableevidencestate.textContent = 'Unavailable';
    elements.checkableevidencesummary.textContent = checkableEvidenceDisclosure(null);
    elements.checkableevidencemessage.textContent = 'Open a local accepted evidence package to review it without running firmware.';
    elements.checkableevidenceidentity.textContent = 'No source envelope or report hash.';
    elements.checkableevidencedownload.disabled = true;
    for (const [root, text] of [[elements.checkableevidencerows, 'No current rows.'],
      [elements.checkableevidencelimitations, 'No current source, profile, or model limits.']]) {
      const item = document.createElement('li'); item.textContent = text; root.append(item);
    }
    return;
  }
  const knownRows = report.measurements.filter((row) => row.value.state === 'known').length;
  const imported = checkableEvidenceOrigin === 'imported-retained-package';
  elements.checkableevidencestate.textContent = `${imported ? 'Imported · ' : ''}${knownRows}/${report.measurements.length} available`;
  elements.checkableevidencesummary.textContent = `${imported ? 'Imported retained source evidence · not a fresh execution. ' : 'Current in-browser source evidence. '}${checkableEvidenceDisclosure(report)}`;
  elements.checkableevidencemessage.textContent = imported
    ? 'Read-only local review. Opening this package restored no project, runtime, outcome authority or executable state.'
    : 'This report follows the current in-browser source lifecycle and becomes stale with its source.';
  elements.checkableevidenceidentity.textContent = `${report.producer.producerId} · source class ${report.producer.evidenceClass} · ${imported ? 'historical/imported review' : 'current source'} · ${report.producer.adapterId} · source ${report.integrity.sourceReportSha256} · report ${report.integrity.reportSha256} · model ${report.modelContext.state}`;
  for (const row of report.measurements) {
    const item = document.createElement('li');
    item.dataset.measurementState = row.value.state;
    item.dataset.measurementId = row.id;
    item.textContent = `${row.label} · scenario/row ${row.id}: ${taggedEvidenceText(row.value)} · observation ${taggedEvidenceText(row.observation)} ${row.timeBasis} · unit ${taggedEvidenceText(row.unit)} · source ${row.sourcePath} · ${row.provenance}`;
    elements.checkableevidencerows.append(item);
  }
  for (const row of report.limitations) {
    const item = document.createElement('li'); item.textContent = `${row.owner}: ${row.text}`;
    elements.checkableevidencelimitations.append(item);
  }
  elements.checkableevidencedownload.disabled = false;
}

async function setCheckableEvidenceReport(sourceReport, sourceProject = null, origin = 'current-source') {
  const generation = ++checkableEvidenceGeneration;
  const report = await createCheckableEvidenceReport(sourceReport, { sourceProject });
  await validateCheckableEvidenceReport(report);
  if (generation !== checkableEvidenceGeneration) return null;
  checkableEvidenceReport = report;
  checkableEvidenceOrigin = origin;
  renderCheckableEvidence(report);
  return structuredClone(report);
}

async function setCheckableEvidencePackage(source) {
  const parsed = await parseExperimentPackage(source, commonProjectAdapters);
  if (!parsed.ok || !parsed.x80Complete) {
    throw Object.assign(new Error(parsed.code ?? 'CHECKABLE_EVIDENCE_PACKAGE_REQUIRED'),
      { code: parsed.code ?? 'CHECKABLE_EVIDENCE_PACKAGE_REQUIRED' });
  }
  return setCheckableEvidenceReport(parsed.value.report, parsed.value.project, 'imported-retained-package');
}

async function openCheckableEvidencePackage(file) {
  if (!file) return null;
  if (file.size > EXPERIMENT_PACKAGE_LIMIT) {
    elements.checkableevidencemessage.textContent = 'Package rejected (INPUT_LIMIT). The previous evidence report is unchanged.';
    return null;
  }
  try {
    return await setCheckableEvidencePackage(await file.text());
  } catch (error) {
    elements.checkableevidencemessage.textContent = `Package rejected (${error.code ?? error.message}). The previous evidence report is unchanged.`;
    return null;
  }
}

function clearCheckableEvidenceReport(message = 'No current evidence report. Build and Run are never started by this disclosure.') {
  checkableEvidenceGeneration += 1;
  checkableEvidenceReport = null;
  checkableEvidenceOrigin = 'none';
  renderCheckableEvidence(null);
  elements.checkableevidencesummary.textContent = message;
}

async function downloadCheckableEvidenceReport() {
  if (!checkableEvidenceReport) return null;
  const report = await validateCheckableEvidenceReport(checkableEvidenceReport);
  const downloadSha256 = await checkableEvidenceDownloadSha256(report);
  downloadText(`checkable-evidence-${report.integrity.reportSha256.slice(0, 16)}.json`,
    canonicalCheckableEvidenceText(report), 'application/json');
  elements.checkableevidenceidentity.textContent = `${elements.checkableevidenceidentity.textContent} · download ${downloadSha256}`;
  return { report: structuredClone(report), downloadSha256 };
}

function applyMeasurementPresentation(report, root, state, summary, { historical = false } = {}) {
  void setCheckableEvidenceReport(report).catch((error) => {
    clearCheckableEvidenceReport(`Evidence report rejected (${error.code ?? error.message}). No source authority was retained.`);
  });
  const completeness = measurementRequirementStatus(report);
  const effective = completenessAcademicStatus('passed', completeness);
  if (!completeness.completeForRequirements) {
    const prefix = historical ? 'historical source ' : 'source ';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (!walker.currentNode.parentElement?.closest('pre')) nodes.push(walker.currentNode);
    }
    for (const node of nodes) {
      node.nodeValue = node.nodeValue
        .replace(/\bpassed\b/giu, `${prefix}passed (current indeterminate)`)
        .replace(/\bfailed\b/giu, `${prefix}failed (current indeterminate)`);
    }
    for (const element of root.querySelectorAll('[data-status="passed"], [data-status="failed"]')) {
      element.dataset.status = 'indeterminate';
    }
    state.textContent = `Current academic ${effective} · ${state.textContent}`;
  }
  summary.textContent = `${summary.textContent} ${measurementCompletenessDisclosure(completeness)}`;
  return completeness;
}

function renderRegressionMatrixReport(report = regressionMatrixReport) {
  elements.regressionmatrixresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr');
    const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No matrix report. Reports are transient review data and never project or verdict authority.';
    row.append(cell); elements.regressionmatrixresults.append(row);
    elements.regressionmatrixstate.textContent = 'Not run';
    elements.regressionmatrixexport.disabled = true;
    return;
  }
  for (const result of report.results) {
    const row = document.createElement('tr');
    const cells = [
      `${result.caseId}\n${result.profile}\n${result.profileVersion}`,
      `${result.producer}\nartifact ${result.artifactSha256}`,
      `expected ${JSON.stringify(result.expected)}\nactual ${JSON.stringify(result.actual)}\nraw time ${JSON.stringify(result.rawVirtualTime)}`,
      `${result.outcome.academicStatus} · job ${result.outcome.jobStatus}`,
      result.limitation,
    ];
    for (const [index, text] of cells.entries()) {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      const pre = document.createElement('code'); pre.textContent = text; cell.append(pre);
      if (index === 3) {
        cell.className = 'regression-matrix-outcome';
        cell.dataset.status = result.outcome.academicStatus;
      }
      row.append(cell);
    }
    elements.regressionmatrixresults.append(row);
  }
  const passed = report.results.filter((item) => item.outcome.academicStatus === 'passed').length;
  const failed = report.results.filter((item) => item.outcome.academicStatus === 'failed').length;
  elements.regressionmatrixstate.textContent = `${passed} passed · ${failed} failed · ${report.results.length} completed`;
  elements.regressionmatrixexport.disabled = false;
  elements.regressionmatrixsummary.textContent = `Matrix ${report.matrixSha256} · semantic report ${report.semanticSha256}. ${report.expectationOverrideSha256 ? 'A separate wrong-expectation reference was applied to exactly one selected cell.' : 'No expectation override was applied.'} Raw profile timebases remain separate.`;
  applyMeasurementPresentation(report, elements.regressionmatrixresults,
    elements.regressionmatrixstate, elements.regressionmatrixsummary);
}

function invalidateLongDurationReport(message = 'Project state changed. Run X28 again for current evidence.') {
  if (longDurationRunning || !longDurationReport) return;
  longDurationReport = null;
  renderLongDurationReport(null);
  elements.longdurationsummary.textContent = message;
}

function invalidateTimeInvarianceReport(message = 'Project state changed. Run X29 again for current evidence.') {
  if (timeInvarianceRunning || !timeInvarianceReport) return;
  timeInvarianceReport = null;
  renderTimeInvarianceReport(null);
  elements.timeinvariancesummary.textContent = message;
}

function invalidateEventOrderReport(message = 'Project state changed. Run X30 again for current evidence.') {
  if (eventOrderRunning || !eventOrderReport) return;
  eventOrderReport = null;
  renderEventOrderReport(null);
  elements.eventordersummary.textContent = message;
}

function invalidateResetClassReport(message = 'Project state changed. Run X31 again for current evidence.') {
  if (resetClassRunning || !resetClassReport) return;
  resetClassReport = null;
  renderResetClassReport(null);
  elements.resetclasssummary.textContent = message;
}

function invalidateUnsupportedAccessReport(message = 'Project state changed. Run X32 again for current evidence.') {
  if (unsupportedAccessRunning || !unsupportedAccessReport) return;
  unsupportedAccessReport = null;
  renderUnsupportedAccessReport(null);
  elements.unsupportedaccesssummary.textContent = message;
}

function invalidateDigitalStateReport(message = 'Project state changed. Run X33 again for current evidence.') {
  if (digitalStateRunning || !digitalStateReport) return;
  digitalStateReport = null;
  renderDigitalStateReport(null);
  elements.digitalstatesummary.textContent = message;
}

function invalidateDigitalStateRuntimeReport(message = 'Project state changed. Run the X33 runtime producer check again.') {
  if (digitalStateRuntimeRunning || !digitalStateRuntimeReport) return;
  digitalStateRuntimeReport = null;
  renderDigitalStateRuntimeReport(null);
  elements.digitalstateruntimesummary.textContent = message;
}

function invalidatePrecisionCheckReport(message = 'Project state changed. Run X34 again for current evidence.') {
  if (precisionCheckRunning || !precisionCheckReport) return;
  precisionCheckReport = null;
  renderPrecisionCheckReport(null);
  elements.precisionchecksummary.textContent = message;
}

function invalidateCausalChainReport(message = 'Project state changed. Run X35 again for current evidence.') {
  if (causalChainRunning || !causalChainReport) return;
  causalChainReport = null;
  renderCausalChainReport(null);
  elements.causalchainsummary.textContent = message;
}

function invalidateUsartResponseReport(message = 'Project state changed. Run the X23 USART0 check again for current evidence.') {
  usartResponseToken += 1;
  for (const entry of usartResponseWorkers.splice(0)) {
    entry.channel.close('X23_USART_RETIRED');
    try { entry.worker.postMessage({ command: 'dispose' }); } catch { /* already unavailable */ }
    setTimeout(() => entry.worker.terminate(), 250);
  }
  usartResponseRunning = false;
  usartResponseReport = null;
  renderUsartResponseReport(null);
  elements.usartresponsesummary.textContent = message;
}

function retireFailureReplayWorkers() {
  const session = failureReplaySession;
  failureReplaySession = null;
  failureReplayToken += 1;
  if (!session) return;
  for (const entry of session.workers) {
    entry.channel.close('X36_REPLAY_RETIRED');
    try { entry.worker.postMessage({ command: 'dispose' }); } catch { /* already unavailable */ }
    setTimeout(() => entry.worker.terminate(), 250);
  }
  failureReplayRetirements += session.workers.length;
}

function invalidateFailureReplayReport(message = 'Project state changed. Open the replay point again for current evidence.') {
  retireFailureReplayWorkers();
  failureReplayRunning = false;
  failureReplayReport = null;
  renderFailureReplay(null);
  elements.failurereplaysummary.textContent = message;
}

function invalidateRegressionMatrixReport(message = 'Project state changed. Run the matrix again for current evidence.') {
  clearCheckableEvidenceReport(message);
  invalidateVersionRegressionReport(message);
  if (!regressionMatrixRunning && regressionMatrixReport) {
    regressionMatrixReport = null;
    coverageReport = null;
    regressionPartitionEvidence = [];
    renderRegressionMatrixReport(null);
    renderCoverageReport(null);
    elements.regressionmatrixsummary.textContent = message;
    elements.coveragereportsummary.textContent = message;
  }
  invalidateLongDurationReport(message);
  invalidateTimeInvarianceReport(message);
  invalidateEventOrderReport(message);
  invalidateResetClassReport(message);
  invalidateUnsupportedAccessReport(message);
  invalidateDigitalStateReport(message);
  invalidateDigitalStateRuntimeReport(message);
  invalidatePrecisionCheckReport(message);
  invalidateCausalChainReport(message);
  invalidateUsartResponseReport(message);
  invalidateFailureReplayReport(message);
}

function renderVersionRegressionReport(report = versionRegressionReport) {
  elements.versionregressionresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 4;
    cell.textContent = 'No active comparison review. The accepted historical evidence is not restored as a fresh execution.';
    row.append(cell); elements.versionregressionresults.append(row);
    elements.versionregressionstate.textContent = 'Not loaded';
    elements.versionregressionexport.disabled = true;
    return;
  }
  for (const result of report.results) {
    const row = document.createElement('tr');
    const releases = result.releases.map((release) =>
      `${release.version}\n${release.outcome.academicStatus} · job ${release.outcome.jobStatus}\nartifact ${release.artifactSha256}`);
    const values = [
      `${result.caseId}\n${result.profile}\n${result.scenarioId}`,
      releases[0], releases[1],
      `${result.sameRequirementIdentity ? 'same requirement' : 'identity mismatch'}\n${result.outcomeStableAcrossReleases ? 'stable outcome' : 'outcome changed'}`,
    ];
    for (const [index, value] of values.entries()) {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      const code = document.createElement('code'); code.textContent = value; cell.append(code);
      if (index === 3) { cell.className = 'regression-matrix-outcome'; cell.dataset.status = 'passed'; }
      row.append(cell);
    }
    elements.versionregressionresults.append(row);
  }
  elements.versionregressionstate.textContent = 'Reviewed evidence loaded · no producer executed';
  elements.versionregressionexport.disabled = false;
  elements.versionregressionsummary.textContent = `Independently reviewed reports: 8 passed / 8 completed across rc.49 and rc.60. Comparison ${report.semanticSha256}. Loading this report did not build or run firmware.`;
  applyMeasurementPresentation(report, elements.versionregressionresults,
    elements.versionregressionstate, elements.versionregressionsummary, { historical: true });
}

function invalidateVersionRegressionReport(message = 'Project state changed. Load the reviewed comparison again.') {
  if (!versionRegressionReport) return;
  versionRegressionReport = null; renderVersionRegressionReport(null);
  elements.versionregressionsummary.textContent = `${message} Historical acceptance remains documented, but no active report or export authority was restored.`;
}

async function loadReviewedVersionRegression() {
  const reviewed = await acceptedX26VersionReport();
  versionRegressionReport = await validateX26VersionReport(reviewed);
  renderVersionRegressionReport(versionRegressionReport);
  return structuredClone(versionRegressionReport);
}

async function rejectSyntheticVersionMutation() {
  versionRegressionReport = null; renderVersionRegressionReport(null);
  try {
    await validateX26VersionReport(await x26SyntheticExpectationMutation());
    throw new Error('X26_SYNTHETIC_MUTATION_ACCEPTED');
  } catch (error) {
    if (error.message === 'X26_SYNTHETIC_MUTATION_ACCEPTED') throw error;
    elements.versionregressionstate.textContent = 'Synthetic mismatch rejected';
    elements.versionregressionsummary.textContent = `Separate data-only negative rejected (${error.code ?? error.message}). No old or current release producer ran, and no report/export authority was created.`;
    return { accepted: false, code: error.code ?? error.message, synthetic: true, producerRuns: 0 };
  }
}

async function exportVersionRegressionReport() {
  if (!versionRegressionReport || !x26VersionReportPassed(versionRegressionReport)) return;
  await downloadMeasurementReport(versionRegressionReport,
    `x26-version-regression-${versionRegressionReport.semanticSha256.slice(0, 12)}.intent-mcu-x26-version.json`);
}

function renderCoverageReport(report = coverageReport) {
  elements.coveragereportresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr');
    const cell = document.createElement('td'); cell.colSpan = 6;
    cell.textContent = 'No current coverage report. Run the immutable matrix to project its seven declared partitions.';
    row.append(cell); elements.coveragereportresults.append(row);
    elements.coveragereportstate.textContent = 'Not run';
    elements.coveragereportexport.disabled = true;
    return;
  }
  for (const rowReport of report.rows) {
    const row = document.createElement('tr');
    const partitionSummary = rowReport.partitions.map((item) => `${item.partitionId}: ${item.status}`).join('\n');
    const cells = [
      `${rowReport.caseId}\n${rowReport.profile}`,
      `${rowReport.partitions.length} declared`, partitionSummary,
      `${rowReport.evidenceCompleteness}\nacademic ${rowReport.academicOutcome}\njob ${rowReport.jobOutcome}\n${rowReport.exercisedPartitions.length} exercised`,
      `${rowReport.producer}\nraw timebase: ${rowReport.rawTimebase}`,
      rowReport.limitation,
    ];
    for (const [index, text] of cells.entries()) {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      const pre = document.createElement('code'); pre.textContent = text; cell.append(pre); row.append(cell);
    }
    elements.coveragereportresults.append(row);
  }
  const counts = report.counts;
  elements.coveragereportstate.textContent = `${counts.passed}/${counts.declared} partitions passed`;
  elements.coveragereportexport.disabled = false;
  elements.coveragereportsummary.textContent = `${counts.executed} executed · ${counts.passed} passed · ${counts.failed} failed · ${counts.notRun} not run · ${counts.unsupported} unsupported · ${counts.indeterminate} indeterminate · ${counts.infrastructureError} infrastructure error. Semantic report ${report.semanticSha256}.`;
  applyMeasurementPresentation(report, elements.coveragereportresults,
    elements.coveragereportstate, elements.coveragereportsummary);
}

function renderLongDurationReport(report = longDurationReport) {
  elements.longdurationresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr');
    const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No current X28 report. Reports are transient and never project, timer or verdict authority.';
    row.append(cell); elements.longdurationresults.append(row);
    elements.longdurationstate.textContent = 'Not run';
    elements.longdurationexport.disabled = true;
    return;
  }
  const rows = [...report.results, { cellId: 'X28-KNOWN-BAD-DIRECT-DEADLINE',
    expected: { academicStatus: 'failed', jobStatus: 'completed' }, actual: report.knownBad.actual,
    outcome: report.knownBad.outcome, rawVirtualTime: report.knownBad.rawVirtualTime }];
  const appendFacts = (cell, values) => {
    const list = document.createElement('ul'); list.className = 'long-duration-facts';
    for (const value of values) { const item = document.createElement('li'); item.textContent = value; list.append(item); }
    cell.append(list);
  };
  for (const result of rows) {
    const row = document.createElement('tr');
    const presentation = longDurationPresentation(result);
    const identity = document.createElement('th'); identity.scope = 'row'; identity.className = 'long-duration-cell';
    const label = document.createElement('strong'); label.textContent = presentation.label;
    const id = document.createElement('code'); id.textContent = result.cellId;
    identity.append(label, id);
    const expected = document.createElement('td'); appendFacts(expected, presentation.expected);
    const actual = document.createElement('td'); appendFacts(actual, presentation.actual);
    const outcome = document.createElement('td'); outcome.className = 'regression-matrix-outcome';
    outcome.dataset.status = result.outcome.academicStatus;
    const badges = document.createElement('div'); badges.className = 'long-duration-outcomes';
    for (const value of [result.outcome.academicStatus, `job ${result.outcome.jobStatus}`]) {
      const badge = document.createElement('span'); badge.className = 'long-duration-outcome-badge'; badge.textContent = value; badges.append(badge);
    }
    outcome.append(badges);
    const evidence = document.createElement('td');
    const details = document.createElement('details'); details.className = 'long-duration-raw';
    const summary = document.createElement('summary'); summary.textContent = 'View complete raw records';
    const raw = document.createElement('pre'); raw.textContent = JSON.stringify({
      expected: result.expected,
      actual: result.actual,
      outcome: result.outcome,
      rawVirtualTime: result.rawVirtualTime,
    }, null, 2);
    details.append(summary, raw); evidence.append(details);
    row.append(identity, expected, actual, outcome, evidence);
    elements.longdurationresults.append(row);
  }
  const passed = report.results.filter((result) => result.outcome.academicStatus === 'passed').length;
  const badRejected = report.knownBad.outcome.academicStatus === 'failed'
    && report.knownBad.outcome.jobStatus === 'completed' && report.knownBad.actual.failedAsExpected;
  elements.longdurationstate.textContent = `${passed}/3 passed · known-bad ${badRejected ? 'rejected' : 'not rejected'}`;
  elements.longdurationexport.disabled = false;
  elements.longdurationsummary.textContent = `Artifact ${report.artifactSha256} · semantic report ${report.semanticSha256}. Raw cycles and observed unsigned millisecond values are retained separately; wall duration is diagnostic only.`;
  applyMeasurementPresentation(report, elements.longdurationresults,
    elements.longdurationstate, elements.longdurationsummary);
}

async function compileLongDurationSource(source) {
  const response = await fetch('/api/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
    body: JSON.stringify({ schema: 'teach-lab-build-request@1', board: 'board.atmega328p-16mhz-v1',
      files: [{ name: 'main.ino', content: source }] }),
  });
  const submitted = await response.json();
  if (!response.ok) throw Object.assign(new Error(submitted.code ?? 'LONG_DURATION_BUILD_REJECTED'), { code: submitted.code });
  while (true) {
    const statusResponse = await fetch(`/api/build/${submitted.jobId}`, {
      headers: { Authorization: `Bearer ${submitted.capability}` }, cache: 'no-store',
    });
    const status = await statusResponse.json();
    if (!statusResponse.ok) throw Object.assign(new Error(status.code ?? 'LONG_DURATION_BUILD_STATUS'), { code: status.code });
    if (status.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    if (status.status !== 'succeeded') {
      const code = status.error ?? status.result?.code ?? `LONG_DURATION_BUILD_${status.status.toUpperCase()}`;
      throw Object.assign(new Error(code), { code });
    }
    return { hex: status.result.artifact.hex, artifactSha256: status.result.artifactIdentity };
  }
}

async function runBrowserLongDurationSuite() {
  if (longDurationRunning) throw Object.assign(new Error('LONG_DURATION_BUSY'), { code: 'LONG_DURATION_BUSY' });
  longDurationRunning = true; longDurationReport = null; renderLongDurationReport(null);
  elements.longdurationrun.disabled = true;
  elements.longdurationstate.textContent = 'Running actual AVR virtual time…';
  elements.longdurationsummary.textContent = 'Compiling the checksum-locked good and known-bad fixtures, then executing one integrated suite.';
  try {
    longDurationReport = await executeLongDurationSuite({ compile: compileLongDurationSource });
    renderLongDurationReport(longDurationReport);
    return structuredClone(longDurationReport);
  } finally {
    longDurationRunning = false; elements.longdurationrun.disabled = false;
  }
}

async function exportLongDurationReport() {
  if (!longDurationReport) return;
  await downloadMeasurementReport(longDurationReport,
    `x28-long-duration-${longDurationReport.semanticSha256.slice(0, 12)}.intent-mcu-long-duration.json`);
}

function timeMarkerCycle(records, marker) {
  const text = records.map((entry) => String.fromCharCode(entry.value)).join('');
  const index = text.indexOf(marker);
  return index < 0 ? null : records[index]?.cycle ?? null;
}

function timeD13HighCycle(message) {
  return message.instruments?.logic?.transitions?.find(
    (entry) => entry.pin === 'D13' && entry.level === true,
  )?.cycle ?? null;
}

function timeSnapshot(message, requirement) {
  return {
    cpuCycles: message.cycle,
    instructions: message.instructions,
    virtualNanoseconds: virtualNanoseconds(message.cycle),
    pendingTarget: message.eventLog.pending.find((entry) => entry.targetCycle === requirement.targetCycle)?.targetCycle ?? null,
  };
}

function timeRequirementVisible(message, requirement) {
  const records = message.instruments?.serial?.records ?? [];
  const d13 = timeD13HighCycle(message);
  const uart = timeMarkerCycle(records, requirement.uartMarker);
  return message.eventLog.pending.length === 0 && d13 !== null && uart !== null;
}

function timeWorkerQueue(worker) {
  const queued = []; const waiting = [];
  worker.addEventListener('message', ({ data }) => {
    const index = waiting.findIndex((entry) => entry.accept(data));
    if (index >= 0) {
      const [entry] = waiting.splice(index, 1); clearTimeout(entry.timer); entry.resolve(data);
    } else queued.push(data);
  });
  worker.addEventListener('error', (event) => {
    for (const entry of waiting.splice(0)) { clearTimeout(entry.timer); entry.reject(Object.assign(new Error(event.message), { code: 'TIME_WORKER_ERROR' })); }
  });
  return (accept, timeoutMilliseconds = 30_000) => {
    const index = queued.findIndex(accept);
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const entry = { accept, resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const waitingIndex = waiting.indexOf(entry); if (waitingIndex >= 0) waiting.splice(waitingIndex, 1);
        reject(Object.assign(new Error('TIME_WORKER_TIMEOUT'), { code: 'TIME_WORKER_TIMEOUT' }));
      }, timeoutMilliseconds);
      waiting.push(entry);
    });
  };
}

async function executeTimeInvarianceCell(artifact, spec) {
  const requirement = structuredClone(X29_TIME_SUITE.requirement);
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const next = timeWorkerQueue(worker);
  const started = performance.now();
  try {
    worker.postMessage({ command: 'init', hex: artifact.hex, circuit: DEFAULT_CIRCUIT,
      instruments: { logicChannels: ['D13', 'D2'], serialHistoryLimit: 512 } });
    const readyMessage = await next((message) => message.kind === 'ready');
    const ready = { cpuCycles: readyMessage.cycle, instructions: readyMessage.instructions,
      virtualNanoseconds: virtualNanoseconds(readyMessage.cycle) };
    worker.postMessage({ command: 'control', componentId: 'button-1', key: 'pressed', value: true,
      targetCycle: requirement.targetCycle });
    await next((message) => message.kind === 'control'
      && message.eventLog.pending.some((entry) => entry.targetCycle === requirement.targetCycle));
    worker.postMessage({ command: 'speed', speed: spec.pacing });
    await next((message) => message.kind === 'speed' && message.speed === spec.pacing);
    let pauseProbe = null;
    worker.postMessage({ command: 'run' });
    if (spec.pause) {
      await next((message) => message.paused === false
        && message.cycle >= spec.pause.minimumCycle && message.cycle <= spec.pause.maximumCycle);
      worker.postMessage({ command: 'pause' });
      const beforeMessage = await next((message) => message.kind === 'paused');
      const before = timeSnapshot(beforeMessage, requirement);
      const wallStarted = performance.now();
      await new Promise((resolve) => setTimeout(resolve, spec.pause.minimumWallMilliseconds + 25));
      worker.postMessage({ command: 'logic-channels', channels: ['D13', 'D2'] });
      const afterMessage = await next((message) => message.kind === 'logic-channels');
      const after = timeSnapshot(afterMessage, requirement);
      pauseProbe = { before, after, wallWaitMilliseconds: performance.now() - wallStarted,
        requirementSatisfiedBeforeWait: timeRequirementVisible(beforeMessage, requirement),
        requirementSatisfiedAfterWait: timeRequirementVisible(afterMessage, requirement) };
      worker.postMessage({ command: 'run' });
    }
    const observed = await next((message) => message.paused === false
      && message.cycle >= requirement.targetCycle && timeRequirementVisible(message, requirement));
    worker.postMessage({ command: 'pause' });
    const final = await next((message) => message.kind === 'paused');
    const records = final.instruments.serial.records;
    const actual = {
      eventLoggedTarget: final.eventLog.log.find((entry) => entry.targetCycle === requirement.targetCycle)?.targetCycle ?? null,
      d13HighCycle: timeD13HighCycle(final),
      uartMarkerCycle: timeMarkerCycle(records, requirement.uartMarker),
      finalD13: final.pins.find((entry) => entry.pin === 'D13')?.level ?? null,
      finalCpuCycles: final.cycle,
      finalInstructions: final.instructions,
      finalVirtualNanoseconds: virtualNanoseconds(final.cycle),
      pauseProbe,
    };
    const passed = actual.eventLoggedTarget === requirement.targetCycle
      && actual.d13HighCycle >= requirement.observationStartCycle
      && actual.d13HighCycle <= requirement.observationEndCycle
      && actual.uartMarkerCycle >= requirement.observationStartCycle
      && actual.uartMarkerCycle <= requirement.observationEndCycle
      && actual.finalD13 === requirement.expectedD13
      && (!pauseProbe || (stableTimeStringify(pauseProbe.before) === stableTimeStringify(pauseProbe.after)
        && pauseProbe.requirementSatisfiedBeforeWait === false
        && pauseProbe.requirementSatisfiedAfterWait === false));
    const wallDurationMilliseconds = performance.now() - started;
    return {
      executionId: spec.executionId, pacing: spec.pacing, ready, requirement, actual,
      outcome: completedExperimentOutcome({ evidence: [
        { code: 'TIME_D13_UART_PRODUCER_EVIDENCE', complete: actual.d13HighCycle !== null && actual.uartMarkerCycle !== null },
      ], assertions: [
        { code: 'TIME_VIRTUAL_REQUIREMENT_SATISFIED', passed },
      ] }),
      diagnostics: { wallDurationMilliseconds,
        measuredCyclesPerSecond: wallDurationMilliseconds > 0 ? final.cycle / (wallDurationMilliseconds / 1000) : 0 },
    };
  } finally {
    worker.postMessage({ command: 'dispose' }); worker.terminate();
  }
}

function renderTimeInvarianceReport(report = timeInvarianceReport) {
  elements.timeinvarianceresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 6;
    cell.textContent = 'No current X29 report. Wall time never satisfies a virtual requirement.';
    row.append(cell); elements.timeinvarianceresults.append(row);
    elements.timeinvariancestate.textContent = 'Not run'; elements.timeinvarianceexport.disabled = true; return;
  }
  for (const execution of report.executions) {
    const row = document.createElement('tr');
    const identity = document.createElement('th'); identity.scope = 'row'; identity.className = 'time-invariance-cell';
    const name = document.createElement('strong');
    name.textContent = execution.executionId === 'X29-REFERENCE-1X' ? 'Reference · 1×'
      : execution.executionId === 'X29-MAXIMUM' ? 'Maximum pacing' : 'Pause and resume';
    const id = document.createElement('code'); id.textContent = execution.executionId; identity.append(name, id);
    const requirement = document.createElement('td'); requirement.textContent = `D2 at ${execution.requirement.targetCycle.toLocaleString('en-US')} cycles · D13/UART within ${(execution.requirement.observationStartCycle / 16000).toFixed(0)}–${(execution.requirement.observationEndCycle / 16000).toFixed(0)} ms virtual`;
    const observed = document.createElement('td');
    observed.textContent = `${execution.actual.finalCpuCycles.toLocaleString('en-US')} CPU cycles · ${execution.actual.finalInstructions.toLocaleString('en-US')} instructions · ${execution.actual.finalVirtualNanoseconds.toLocaleString('en-US')} ns virtual${execution.actual.pauseProbe ? ` · Pause froze at ${execution.actual.pauseProbe.before.cpuCycles.toLocaleString('en-US')} cycles` : ''}`;
    const outcome = document.createElement('td'); outcome.className = 'regression-matrix-outcome';
    outcome.dataset.status = execution.outcome.academicStatus;
    const badges = document.createElement('div'); badges.className = 'long-duration-outcomes';
    for (const value of [execution.outcome.academicStatus, `job ${execution.outcome.jobStatus}`]) {
      const badge = document.createElement('span'); badge.className = 'long-duration-outcome-badge'; badge.textContent = value; badges.append(badge);
    }
    outcome.append(badges);
    const diagnostic = document.createElement('td'); diagnostic.className = 'time-wall-diagnostic';
    diagnostic.textContent = `${execution.diagnostics.wallDurationMilliseconds.toFixed(1)} ms wall · diagnostic only`;
    const evidence = document.createElement('td');
    const details = document.createElement('details'); details.className = 'long-duration-raw time-invariance-raw';
    const summary = document.createElement('summary'); summary.textContent = 'View complete native record';
    const raw = document.createElement('pre'); raw.textContent = JSON.stringify(execution, null, 2);
    details.append(summary, raw); evidence.append(details);
    row.append(identity, requirement, observed, outcome, diagnostic, evidence);
    elements.timeinvarianceresults.append(row);
  }
  elements.timeinvariancestate.textContent = `${report.executions.filter((entry) => entry.outcome.academicStatus === 'passed').length}/3 passed · wall requirement rejected`;
  elements.timeinvarianceexport.disabled = false;
  elements.timeinvariancesummary.textContent = `Semantic report ${report.semanticSha256}. Wall diagnostics are excluded. ${report.validationProbe.code} rejected before execution; no academic outcome was created.`;
  applyMeasurementPresentation(report, elements.timeinvarianceresults,
    elements.timeinvariancestate, elements.timeinvariancesummary);
}

async function runBrowserTimeInvarianceSuite() {
  if (timeInvarianceRunning) throw Object.assign(new Error('TIME_INVARIANCE_BUSY'), { code: 'TIME_INVARIANCE_BUSY' });
  timeInvarianceRunning = true; timeInvarianceReport = null; renderTimeInvarianceReport(null);
  elements.timeinvariancerun.disabled = true; elements.timeinvariancestate.textContent = 'Compiling one fixture…';
  try {
    const artifact = await compileLongDurationSource(X29_FIXTURE_SOURCE);
    const executions = [];
    for (const spec of X29_TIME_SUITE.executions) {
      elements.timeinvariancestate.textContent = `Running ${spec.executionId}…`;
      executions.push(await executeTimeInvarianceCell(artifact, spec));
    }
    let validationCode = null;
    try { validateTimeRequirement({ ...X29_TIME_SUITE.requirement, wallMilliseconds: 150 }); }
    catch (error) { validationCode = error.code; }
    const report = {
      schema: TIME_REPORT_SCHEMA, suiteId: X29_TIME_SUITE.suiteId,
      suiteSha256: await timeSuiteIdentity(), profile: X29_TIME_SUITE.profile,
      sourceSha256: X29_TIME_SUITE.fixture.sourceSha256, artifactSha256: artifact.artifactSha256,
      producer: 'existing browser simulator.worker/RuntimeKernel/avr8js 0.21.1', executions,
      validationProbe: { status: 'rejected-before-execution', code: validationCode,
        academicOutcomeCreated: false }, limits: structuredClone(X29_TIME_SUITE.limits),
    };
    report.semanticSha256 = await timeSha256(stableTimeStringify(semanticTimeProjection(report)));
    timeInvarianceReport = await validateTimeReport(report);
    renderTimeInvarianceReport(timeInvarianceReport);
    return structuredClone(timeInvarianceReport);
  } finally {
    timeInvarianceRunning = false; elements.timeinvariancerun.disabled = false;
  }
}

async function exportTimeInvarianceReport() {
  if (!timeInvarianceReport) return;
  await downloadMeasurementReport(timeInvarianceReport,
    `x29-time-invariance-${timeInvarianceReport.semanticSha256.slice(0, 12)}.intent-mcu-time.json`);
}

function eventOrderProducer(message) {
  const records = message.instruments?.serial?.records ?? [];
  return {
    cpuCycles: message.cycle,
    instructions: message.instructions,
    paused: message.paused,
    pending: message.eventLog.pending.map((entry) => ({ sequence: entry.sequence,
      targetCycle: entry.targetCycle, componentId: entry.componentId, key: entry.key, value: entry.value })),
    inputLog: message.eventLog.log.filter((entry) => entry.type === 'control').map((entry) => ({
      sequence: entry.sequence, targetCycle: entry.targetCycle, componentId: entry.componentId,
      key: entry.key, value: entry.value,
    })),
    controls: {
      potPosition: message.circuit.controls['pot-1'].position,
      buttonPressed: message.circuit.controls['button-1'].pressed,
    },
    d13: message.pins.find((entry) => entry.pin === 'D13')?.level ?? null,
    d13HighCycle: timeD13HighCycle(message),
    uartMarkerCycle: timeMarkerCycle(records, X30_EVENT_ORDER_SUITE.plan.execution.uartMarker),
  };
}

function eventOrderWorkerChannel(worker) {
  const queued = []; const waiting = []; const received = [];
  worker.addEventListener('message', ({ data }) => {
    const record = { index: received.length + 1, kind: data.kind, cycle: data.cycle };
    received.push(record);
    const index = waiting.findIndex((entry) => entry.accept(data));
    if (index >= 0) {
      const [entry] = waiting.splice(index, 1); clearTimeout(entry.timer); entry.resolve({ data, record });
    } else queued.push({ data, record });
  });
  worker.addEventListener('error', (event) => {
    for (const entry of waiting.splice(0)) {
      clearTimeout(entry.timer); entry.reject(Object.assign(new Error(event.message), { code: 'EVENT_ORDER_WORKER_ERROR' }));
    }
  });
  const next = (accept, timeoutMilliseconds = 30_000) => {
    const index = queued.findIndex((entry) => accept(entry.data));
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const entry = { accept, resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const waitingIndex = waiting.indexOf(entry); if (waitingIndex >= 0) waiting.splice(waitingIndex, 1);
        reject(Object.assign(new Error('EVENT_ORDER_WORKER_TIMEOUT'), { code: 'EVENT_ORDER_WORKER_TIMEOUT' }));
      }, timeoutMilliseconds);
      waiting.push(entry);
    });
  };
  return { next, after: (index) => received.filter((entry) => entry.index > index) };
}

function eventOrderPhase(phase, phaseOrdinal, snapshotKind, message) {
  return { epochId: X30_EVENT_ORDER_SUITE.plan.epochId, phase, phaseOrdinal, snapshotKind,
    producer: eventOrderProducer(message) };
}

async function executeEventOrderRepeat(artifact, executionId) {
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const channel = eventOrderWorkerChannel(worker);
  const started = performance.now();
  try {
    worker.postMessage({ command: 'init', hex: artifact.hex, circuit: DEFAULT_CIRCUIT,
      instruments: { logicChannels: ['D13', 'D2'], serialHistoryLimit: 512 } });
    const { data: readyMessage } = await channel.next((message) => message.kind === 'ready');
    const preResetSpec = X30_EVENT_ORDER_SUITE.plan.preReset;
    worker.postMessage({ command: 'control', componentId: preResetSpec.componentId,
      key: preResetSpec.key, value: preResetSpec.value, targetCycle: preResetSpec.targetCycle });
    const { data: preResetQueued } = await channel.next((message) => message.kind === 'control'
      && message.eventLog.pending.some((entry) => entry.targetCycle === preResetSpec.targetCycle));
    worker.postMessage({ command: 'speed', speed: 0.1 });
    await channel.next((message) => message.kind === 'speed' && message.speed === 0.1);
    worker.postMessage({ command: 'run' });
    const { data: runningBeforeReset } = await channel.next((message) => message.paused === false
      && message.cycle > 0 && message.cycle < preResetSpec.targetCycle);
    worker.postMessage({ command: 'reset' });
    const { data: resetMessage, record: resetRecord } = await channel.next((message) => message.kind === 'reset');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterResetMessages = channel.after(resetRecord.index);

    const controlMessages = [];
    for (const input of X30_EVENT_ORDER_SUITE.plan.inputs) {
      worker.postMessage({ command: 'control', componentId: input.componentId, key: input.key,
        value: input.value, targetCycle: input.targetCycle });
      const { data } = await channel.next((message) => message.kind === 'control'
        && message.eventLog.log.length === input.ordinal);
      controlMessages.push(data);
    }
    const inputBoundary = controlMessages.at(-1);
    worker.postMessage({ command: 'sample' });
    const { data: preExecutionSample } = await channel.next((message) => message.kind === 'sample');
    worker.postMessage({ command: 'speed', speed: 'maximum' });
    await channel.next((message) => message.kind === 'speed' && message.speed === 'maximum');
    worker.postMessage({ command: 'run' });
    const requirement = X30_EVENT_ORDER_SUITE.plan.execution;
    await channel.next((message) => message.paused === false && message.cycle >= requirement.minimumFinalCycle
      && timeRequirementVisible(message, { targetCycle: 0, uartMarker: requirement.uartMarker }));
    worker.postMessage({ command: 'pause' });
    const { data: executionMessage } = await channel.next((message) => message.kind === 'paused');
    worker.postMessage({ command: 'sample' });
    const { data: finalSample } = await channel.next((message) => message.kind === 'sample');
    const phases = [
      eventOrderPhase('RESET_BARRIER', 1, 'reset', resetMessage),
      eventOrderPhase('INPUT_ORDINAL_ASC', 2, 'control-boundary', inputBoundary),
      eventOrderPhase('PRE_EXECUTION_SAMPLE', 3, 'sample', preExecutionSample),
      eventOrderPhase('CPU_EXECUTION', 4, 'paused', executionMessage),
      eventOrderPhase('FINAL_SAMPLE', 5, 'sample', finalSample),
    ];
    return {
      executionId, ready: { cpuCycles: readyMessage.cycle, instructions: readyMessage.instructions },
      preReset: { targetCycle: preResetSpec.targetCycle,
        queuedSequence: preResetQueued.eventLog.log[0]?.sequence ?? null,
        pendingBeforeReset: preResetQueued.eventLog.pending.length,
        runningCycleBeforeReset: runningBeforeReset.cycle,
        resetCleared: resetMessage.eventLog.pending.length === 0 && resetMessage.eventLog.log.length === 0,
        generationRetired: afterResetMessages.length === 0 },
      phases, outcome: evaluateEventOrderPhases(phases),
      diagnostics: { wallDurationMilliseconds: performance.now() - started },
    };
  } finally {
    worker.postMessage({ command: 'dispose' }); worker.terminate();
  }
}

function renderEventOrderReport(report = eventOrderReport) {
  elements.eventorderresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No current X30 report. Host message arrival time is never event-order authority.';
    row.append(cell); elements.eventorderresults.append(row);
    elements.eventorderstate.textContent = 'Not run'; elements.eventorderexport.disabled = true; return;
  }
  const phaseNames = {
    RESET_BARRIER: 'Reset barrier', INPUT_ORDINAL_ASC: 'Inputs · ordinal 1 → 2',
    PRE_EXECUTION_SAMPLE: 'Read-only sample', CPU_EXECUTION: 'CPU execution', FINAL_SAMPLE: 'Final read-only sample',
  };
  const boundaries = {
    RESET_BARRIER: 'Old pending input and old worker generation retired',
    INPUT_ORDINAL_ASC: 'Potentiometer then button · target cycle 0',
    PRE_EXECUTION_SAMPLE: 'After controls · before any CPU instruction',
    CPU_EXECUTION: 'Producer D13/UART within fixed virtual window',
    FINAL_SAMPLE: 'After Pause · no state advance or queue drain',
  };
  for (const [index, phase] of report.executions[0].phases.entries()) {
    const repeat = report.executions[1].phases[index];
    const row = document.createElement('tr');
    const identity = document.createElement('th'); identity.scope = 'row'; identity.className = 'event-order-cell';
    const label = document.createElement('strong'); label.textContent = phaseNames[phase.phase];
    const id = document.createElement('code'); id.textContent = `${phase.phaseOrdinal} · ${phase.phase}`;
    identity.append(label, id);
    const boundary = document.createElement('td'); boundary.textContent = boundaries[phase.phase];
    const observed = document.createElement('td');
    observed.textContent = `${phase.producer.cpuCycles.toLocaleString('en-US')} cycles · ${phase.producer.instructions.toLocaleString('en-US')} instructions · ${phase.producer.inputLog.length} applied · ${phase.producer.pending.length} pending · snapshot ${phase.snapshotKind}`;
    const outcome = document.createElement('td'); outcome.className = 'regression-matrix-outcome'; outcome.dataset.status = 'passed';
    const badges = document.createElement('div'); badges.className = 'long-duration-outcomes';
    for (const value of ['verified', 'repeat equal']) {
      const badge = document.createElement('span'); badge.className = 'long-duration-outcome-badge'; badge.textContent = value; badges.append(badge);
    }
    outcome.append(badges);
    const evidence = document.createElement('td');
    const details = document.createElement('details'); details.className = 'long-duration-raw event-order-raw';
    const summary = document.createElement('summary'); summary.textContent = 'View both native records';
    const raw = document.createElement('pre'); raw.textContent = JSON.stringify({ repeatA: phase, repeatB: repeat }, null, 2);
    details.append(summary, raw); evidence.append(details);
    row.append(identity, boundary, observed, outcome, evidence); elements.eventorderresults.append(row);
  }
  elements.eventorderstate.textContent = '2/2 repeats · semantic parity';
  elements.eventorderexport.disabled = false;
  elements.eventordersummary.textContent = `Semantic report ${report.semanticSha256}. Repeat identity ${report.repeatSemanticSha256}. ${report.validationProbe.code} rejected before execution; leaked producer evidence failed academically while its evaluator job completed.`;
  applyMeasurementPresentation(report, elements.eventorderresults,
    elements.eventorderstate, elements.eventordersummary);
}

async function runBrowserEventOrderSuite() {
  if (eventOrderRunning) throw Object.assign(new Error('EVENT_ORDER_BUSY'), { code: 'EVENT_ORDER_BUSY' });
  eventOrderRunning = true; eventOrderReport = null; renderEventOrderReport(null);
  elements.eventorderrun.disabled = true; elements.eventorderstate.textContent = 'Compiling one fixture…';
  try {
    const artifact = await compileLongDurationSource(X29_FIXTURE_SOURCE);
    const executions = [];
    for (const executionId of X30_EVENT_ORDER_SUITE.repeats) {
      elements.eventorderstate.textContent = `Running ${executionId}…`;
      executions.push(await executeEventOrderRepeat(artifact, executionId));
    }
    let validationCode = null;
    const invalidPlan = structuredClone(X30_EVENT_ORDER_SUITE.plan); invalidPlan.inputs[0].ordinal = 2;
    try { validateEventOrderPlan(invalidPlan); } catch (error) { validationCode = error.code; }
    const leaked = structuredClone(executions[0].phases);
    leaked[0].producer.pending.push({ sequence: 1, targetCycle: X30_EVENT_ORDER_SUITE.plan.preReset.targetCycle,
      componentId: 'pot-1', key: 'position', value: 0.9 });
    const repeatSemanticSha256 = await eventOrderSha256(stableEventOrderStringify(
      eventOrderExecutionProjection(executions[0]),
    ));
    const report = {
      schema: EVENT_ORDER_REPORT_SCHEMA, suiteId: X30_EVENT_ORDER_SUITE.suiteId,
      suiteSha256: await eventOrderSuiteIdentity(), profile: X30_EVENT_ORDER_SUITE.profile,
      sourceSha256: X30_EVENT_ORDER_SUITE.fixture.sourceSha256,
      artifactSha256: artifact.artifactSha256,
      producer: 'existing browser simulator.worker/RuntimeKernel/avr8js 0.21.1',
      executions, repeatSemanticSha256,
      validationProbe: { status: 'rejected-before-execution', code: validationCode,
        academicOutcomeCreated: false },
      evidenceFailureProbe: { status: 'failed-as-expected', code: 'EVENT_ORDER_OLD_PENDING_LEAK',
        outcome: evaluateEventOrderPhases(leaked) },
      limits: structuredClone(X30_EVENT_ORDER_SUITE.limits),
    };
    report.semanticSha256 = await eventOrderSha256(stableEventOrderStringify(semanticEventOrderProjection(report)));
    eventOrderReport = await validateEventOrderReport(report);
    renderEventOrderReport(eventOrderReport);
    return structuredClone(eventOrderReport);
  } finally {
    eventOrderRunning = false; elements.eventorderrun.disabled = false;
  }
}

async function exportEventOrderReport() {
  if (!eventOrderReport) return;
  await downloadMeasurementReport(eventOrderReport,
    `x30-event-order-${eventOrderReport.semanticSha256.slice(0, 12)}.intent-mcu-event-order.json`);
}

const resetClassLabels = Object.freeze({
  'cpu-reset': 'CPU reset',
  'experiment-restart': 'Experiment restart',
  'power-on': 'Power-on · fresh worker',
});

function renderResetClassReport(report = resetClassReport) {
  elements.resetclassresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No current X31 report. Browser reload and Open are lifecycle actions, not hardware reset classes.';
    row.append(cell); elements.resetclassresults.append(row);
    elements.resetclassstate.textContent = 'Not run'; elements.resetclassexport.disabled = true; return;
  }
  for (const resetClass of RESET_CLASSES) {
    const executions = report.executions.filter((item) => item.resetClass === resetClass);
    const first = executions[0];
    const row = document.createElement('tr');
    const identity = document.createElement('th'); identity.scope = 'row'; identity.className = 'reset-class-cell';
    const strong = document.createElement('strong'); strong.textContent = resetClassLabels[resetClass];
    const code = document.createElement('code'); code.textContent = resetClass; identity.append(strong, code);
    const boundary = document.createElement('td');
    const retention = report.retention[resetClass];
    boundary.textContent = `Artifact ${retention.artifact}; memory ${retention.volatileMemory}; model ${retention.modelControls}; inputs ${retention.inputs}; worker ${retention.worker}.`;
    const observed = document.createElement('td');
    const list = document.createElement('ul'); list.className = 'long-duration-facts';
    const facts = [
      `Fixed SRAM 0x100: 0x${first.before.volatileByte.toString(16).toUpperCase()} → 0x${first.after.volatileByte.toString(16).toUpperCase()}`,
      `CPU: ${first.before.cpuCycles}/${first.before.instructions} → ${first.after.cpuCycles}/${first.after.instructions} cycles/instructions`,
      `Controls: pot ${first.before.controls.potPosition}, button ${first.before.controls.buttonPressed} → pot ${first.after.controls.potPosition}, button ${first.after.controls.buttonPressed}`,
      `After: pending ${first.after.pending}, input log ${first.after.inputLog}, trace ${first.after.trace}, Serial ${first.after.serial}, faults ${first.after.faults}`,
    ];
    for (const fact of facts) { const item = document.createElement('li'); item.textContent = fact; list.append(item); }
    observed.append(list);
    const result = document.createElement('td'); result.className = 'long-duration-outcomes';
    for (const execution of executions) {
      const badge = document.createElement('span'); badge.className = 'long-duration-outcome-badge';
      badge.dataset.status = execution.outcome.academicStatus;
      badge.textContent = `${execution.repeat} · ${execution.outcome.academicStatus} · job ${execution.outcome.jobStatus}`;
      result.append(badge);
    }
    const raw = document.createElement('td'); const details = document.createElement('details');
    details.className = 'long-duration-raw reset-class-raw'; const summary = document.createElement('summary');
    summary.textContent = 'Full producer evidence'; const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(executions, null, 2); details.append(summary, pre); raw.append(details);
    row.append(identity, boundary, observed, result, raw); elements.resetclassresults.append(row);
  }
  elements.resetclassstate.textContent = '3 classes · 2/2 repeats each';
  elements.resetclassexport.disabled = false;
  elements.resetclasssummary.textContent = `Semantic report ${report.semanticSha256}. Validation, infrastructure and academic evidence failure remain distinct.`;
  applyMeasurementPresentation(report, elements.resetclassresults,
    elements.resetclassstate, elements.resetclasssummary);
}

async function proveFreshPowerWorker(hex) {
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const channel = eventOrderWorkerChannel(worker);
  try {
    worker.postMessage({ command: 'init', hex, circuit: DEFAULT_CIRCUIT,
      instruments: { logicChannels: ['D13', 'D2'], serialHistoryLimit: 512 } });
    await channel.next((message) => message.kind === 'ready');
    worker.postMessage({ command: 'run' });
    await channel.next((message) => message.kind === 'status' && message.cycle > 0);
    worker.postMessage({ command: 'init', hex, circuit: DEFAULT_CIRCUIT,
      instruments: { logicChannels: ['D13', 'D2'], serialHistoryLimit: 512 } });
    const { data: ready, record } = await channel.next((message) => message.kind === 'ready' && message.cycle === 0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const stale = channel.after(record.index).filter((message) => message.kind === 'status' && message.cycle > 0);
    return ready.instructions === 0 && stale.length === 0;
  } finally { worker.postMessage({ command: 'dispose' }); worker.terminate(); }
}

async function runBrowserResetClassSuite() {
  if (resetClassRunning) throw Object.assign(new Error('RESET_CLASS_BUSY'), { code: 'RESET_CLASS_BUSY' });
  resetClassRunning = true; resetClassReport = null; renderResetClassReport(null);
  elements.resetclassrun.disabled = true; elements.resetclassstate.textContent = 'Compiling one fixture…';
  try {
    const artifact = await compileLongDurationSource(X29_FIXTURE_SOURCE);
    const executions = [];
    for (const resetClass of RESET_CLASSES) for (const repeat of X31_RESET_CLASS_SUITE.repeats) {
      elements.resetclassstate.textContent = `${resetClass} · repeat ${repeat}…`;
      const workerGenerationRetired = resetClass === 'power-on'
        ? await proveFreshPowerWorker(artifact.hex) : false;
      executions.push(executeResetClass({ hex: artifact.hex, artifactSha256: artifact.artifactSha256,
        resetClass, repeat, workerGenerationRetired }));
    }
    const classSemanticSha256 = {};
    for (const resetClass of RESET_CLASSES) {
      classSemanticSha256[resetClass] = await resetClassSha256(stableResetStringify(resetExecutionProjection(
        executions.find((item) => item.resetClass === resetClass))));
    }
    let validationCode = null;
    try { validateResetClass('browser-reload'); } catch (error) { validationCode = error.code; }
    const leaked = structuredClone(executions[0]); leaked.after.volatileByte = X31_RESET_CLASS_SUITE.fixture.dirtyValue;
    const report = { schema: RESET_CLASS_REPORT_SCHEMA, suiteId: X31_RESET_CLASS_SUITE.suiteId,
      suiteSha256: await resetClassSuiteIdentity(), profile: X31_RESET_CLASS_SUITE.profile,
      sourceSha256: X31_RESET_CLASS_SUITE.fixture.sourceSha256,
      artifactSha256: artifact.artifactSha256,
      producer: 'bounded RuntimeKernel/avr8js fixture plus actual simulator.worker generation barrier',
      retention: structuredClone(X31_RESET_CLASS_SUITE.retention), executions, classSemanticSha256,
      validationProbe: { status: 'rejected-before-execution', code: validationCode,
        academicOutcomeCreated: false },
      infrastructureProbe: { status: 'classified-without-execution', code: 'RESET_WORKER_UNAVAILABLE',
        academicOutcomeCreated: false },
      evidenceFailureProbe: { status: 'failed-as-expected', code: 'RESET_MEMORY_LEAK',
        outcome: evaluateResetClassExecution(leaked) },
      limits: structuredClone(X31_RESET_CLASS_SUITE.limits) };
    report.semanticSha256 = await resetClassSha256(stableResetStringify(semanticResetClassProjection(report)));
    resetClassReport = await validateResetClassReport(report);
    renderResetClassReport(resetClassReport);
    return structuredClone(resetClassReport);
  } finally { resetClassRunning = false; elements.resetclassrun.disabled = false; }
}

async function exportResetClassReport() {
  if (!resetClassReport) return;
  await downloadMeasurementReport(resetClassReport,
    `x31-reset-classes-${resetClassReport.semanticSha256.slice(0, 12)}.intent-mcu-reset.json`);
}

function renderUnsupportedAccessReport(report = unsupportedAccessReport) {
  elements.unsupportedaccessresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No current X32 report. Unsupported access can never create a green requirement.';
    row.append(cell); elements.unsupportedaccessresults.append(row);
    elements.unsupportedaccessstate.textContent = 'Not run';
    elements.unsupportedaccessexport.disabled = true; return;
  }
  const first = report.executions[0];
  const row = document.createElement('tr');
  const identity = document.createElement('th'); identity.scope = 'row'; identity.className = 'reset-class-cell';
  const strong = document.createElement('strong'); strong.textContent = 'SPI enable write';
  const code = document.createElement('code'); code.textContent = 'SPCR/SPE · 0x4C ← 0x40';
  identity.append(strong, code);
  const observed = document.createElement('td');
  const facts = document.createElement('ul'); facts.className = 'long-duration-facts';
  for (const fact of [
    `D13 HIGH at cycle ${first.lastSupportedObservation.cycle}`,
    `SPI write at cycle ${first.access.cycle}, instruction ${first.access.instructionOrdinal}`,
    `Artifact ${report.artifactSha256.slice(0, 12)}… · two fresh workers`,
  ]) { const item = document.createElement('li'); item.textContent = fact; facts.append(item); }
  observed.append(facts);
  const disposition = document.createElement('td');
  disposition.textContent = `${first.stop.status} · ${first.stop.code} · no accepted post-fault records`;
  const result = document.createElement('td'); result.className = 'long-duration-outcomes';
  for (const execution of report.executions) {
    const badge = document.createElement('span'); badge.className = 'long-duration-outcome-badge';
    badge.dataset.status = execution.outcome.academicStatus;
    badge.textContent = `${execution.repeat} · ${execution.outcome.academicStatus} · evaluator ${execution.outcome.jobStatus}`;
    result.append(badge);
  }
  const raw = document.createElement('td'); const details = document.createElement('details');
  details.className = 'long-duration-raw unsupported-access-raw';
  const summary = document.createElement('summary'); summary.textContent = 'Full producer evidence';
  const pre = document.createElement('pre'); pre.textContent = JSON.stringify({ executions: report.executions,
    classifications: report.classifications, goodCompanion: report.goodCompanion }, null, 2);
  details.append(summary, pre); raw.append(details);
  row.append(identity, observed, disposition, result, raw); elements.unsupportedaccessresults.append(row);
  elements.unsupportedaccessstate.textContent = 'SPI stopped · 2/2 semantic repeats';
  elements.unsupportedaccessexport.disabled = false;
  elements.unsupportedaccesssummary.textContent = `Affected requirement ${report.affectedRequirement.id}: unsupported, never passed. Semantic report ${report.semanticSha256}. Compiler, validation, capability, infrastructure and academic states remain distinct.`;
  applyMeasurementPresentation(report, elements.unsupportedaccessresults,
    elements.unsupportedaccessstate, elements.unsupportedaccesssummary);
}

async function executeUnsupportedAccessWorkerRepeat(artifact, repeat) {
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const channel = eventOrderWorkerChannel(worker);
  try {
    worker.postMessage({ command: 'init', hex: artifact.hex, circuit: DEFAULT_CIRCUIT,
      instruments: { logicChannels: ['D13', 'D2'], serialHistoryLimit: 512 } });
    await channel.next((message) => message.kind === 'ready');
    worker.postMessage({ command: 'run' });
    const first = await channel.next((message) => message.kind === 'stopped-error');
    worker.postMessage({ command: 'run' });
    const second = await channel.next((message) => message.kind === 'stopped-error');
    const noAdvance = first.data.cycle === second.data.cycle
      && first.data.instructions === second.data.instructions
      && stableUnsupportedAccessStringify(first.data.unsupported)
        === stableUnsupportedAccessStringify(second.data.unsupported);
    const postFaultAcceptedRecords = channel.after(first.record.index).filter(
      (entry) => entry.kind === 'status' && entry.cycle > first.data.cycle,
    ).length;
    return unsupportedAccessExecutionFromWorker({ message: first.data,
      artifactSha256: artifact.artifactSha256, repeat,
      blockedReplayNoAdvance: noAdvance, postFaultAcceptedRecords });
  } finally { worker.postMessage({ command: 'dispose' }); worker.terminate(); }
}

async function executeUnsupportedAccessGoodCompanion(artifact) {
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const channel = eventOrderWorkerChannel(worker);
  try {
    worker.postMessage({ command: 'init', hex: artifact.hex, circuit: DEFAULT_CIRCUIT,
      instruments: { logicChannels: ['D13', 'D2'], serialHistoryLimit: 512 } });
    await channel.next((message) => message.kind === 'ready');
    worker.postMessage({ command: 'run' });
    const { data } = await channel.next((message) => message.kind === 'status' && message.cycle > 0);
    return goodCompanionFromWorker({ message: data, artifactSha256: artifact.artifactSha256 });
  } finally { worker.postMessage({ command: 'dispose' }); worker.terminate(); }
}

async function runBrowserUnsupportedAccessSuite() {
  if (unsupportedAccessRunning) throw Object.assign(new Error('UNSUPPORTED_ACCESS_BUSY'), { code: 'UNSUPPORTED_ACCESS_BUSY' });
  unsupportedAccessRunning = true; unsupportedAccessReport = null; renderUnsupportedAccessReport(null);
  elements.unsupportedaccessrun.disabled = true; elements.unsupportedaccessstate.textContent = 'Compiling fixed fixtures…';
  try {
    const [artifact, goodArtifact] = await Promise.all([
      compileLongDurationSource(X32_FAULT_SOURCE), compileLongDurationSource(X32_GOOD_SOURCE),
    ]);
    const executions = [];
    for (const repeat of X32_UNSUPPORTED_ACCESS_SUITE.repeats) {
      elements.unsupportedaccessstate.textContent = `Fresh worker ${repeat} · waiting for SPI stop…`;
      executions.push(await executeUnsupportedAccessWorkerRepeat(artifact, repeat));
    }
    const goodCompanion = await executeUnsupportedAccessGoodCompanion(goodArtifact);
    const repeatSemanticSha256 = await unsupportedAccessSha256(stableUnsupportedAccessStringify(
      unsupportedAccessExecutionProjection(executions[0])));
    let compilerCode = null;
    try { await compileLongDurationSource('void setup( {\nvoid loop() {}\n'); }
    catch (error) { compilerCode = error.code; }
    let validationCode = null;
    try { validateUnsupportedAccessDetector('avr-unknown'); }
    catch (error) { validationCode = error.code; }
    const missing = structuredClone(executions[0]); missing.access = null;
    const report = {
      schema: UNSUPPORTED_ACCESS_REPORT_SCHEMA, suiteId: X32_UNSUPPORTED_ACCESS_SUITE.suiteId,
      suiteSha256: await unsupportedAccessSuiteIdentity(), profile: X32_UNSUPPORTED_ACCESS_SUITE.profile,
      sourceSha256: X32_UNSUPPORTED_ACCESS_SUITE.fixture.sourceSha256,
      artifactSha256: artifact.artifactSha256,
      projectSha256: X32_UNSUPPORTED_ACCESS_SUITE.fixture.projectSha256,
      producer: 'actual simulator.worker/RuntimeKernel/avr8js unsupported-register monitor',
      detector: structuredClone(X32_UNSUPPORTED_ACCESS_SUITE.detector),
      affectedRequirement: structuredClone(X32_UNSUPPORTED_ACCESS_SUITE.affectedRequirement),
      executions, repeatSemanticSha256, goodCompanion,
      classifications: {
        compiler: { status: 'rejected-before-runtime', code: compilerCode,
          artifactCreated: false, academicOutcomeCreated: false },
        validation: { status: 'rejected-before-execution', code: validationCode,
          academicOutcomeCreated: false },
        runtimeCapability: { status: 'stopped-unsupported', code: 'RUNTIME_CAPABILITY_UNSUPPORTED',
          academicStatus: 'unsupported' },
        infrastructure: { status: 'classified-without-execution',
          code: 'UNSUPPORTED_ACCESS_WORKER_UNAVAILABLE', academicOutcomeCreated: false },
        academic: { status: 'indeterminate-as-expected', code: 'UNSUPPORTED_ACCESS_EVIDENCE_MISSING',
          outcome: evaluateUnsupportedAccessExecution(missing) },
      },
      staleRecordProbe: { status: 'rejected-atomically',
        code: 'UNSUPPORTED_ACCESS_REPORT_STALE_OR_UNKNOWN', priorReportRetained: true },
      limits: structuredClone(X32_UNSUPPORTED_ACCESS_SUITE.limits),
    };
    report.semanticSha256 = await unsupportedAccessSha256(stableUnsupportedAccessStringify(
      semanticUnsupportedAccessProjection(report)));
    const accepted = await validateUnsupportedAccessReport(report);
    let staleCode = null;
    try { await validateUnsupportedAccessReport({ ...accepted, sourceSha256: '0'.repeat(64) }); }
    catch (error) { staleCode = error.code; }
    if (staleCode !== accepted.staleRecordProbe.code) {
      throw Object.assign(new Error('UNSUPPORTED_ACCESS_STALE_PROBE_NOT_REJECTED'),
        { code: 'UNSUPPORTED_ACCESS_STALE_PROBE_NOT_REJECTED' });
    }
    unsupportedAccessReport = accepted;
    renderUnsupportedAccessReport(unsupportedAccessReport);
    return structuredClone(unsupportedAccessReport);
  } finally { unsupportedAccessRunning = false; elements.unsupportedaccessrun.disabled = false; }
}

async function exportUnsupportedAccessReport() {
  if (!unsupportedAccessReport) return;
  await downloadMeasurementReport(unsupportedAccessReport,
    `x32-unsupported-access-${unsupportedAccessReport.semanticSha256.slice(0, 12)}.intent-mcu-unsupported.json`);
}

function renderDigitalStateReport(report = digitalStateReport) {
  elements.digitalstateresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No current X33 report. Unknown evidence and high impedance can never be treated as valid LOW.';
    row.append(cell); elements.digitalstateresults.append(row);
    elements.digitalstatestate.textContent = 'Not run'; elements.digitalstateexport.disabled = true; return;
  }
  const first = report.repeats[0];
  for (const [index, item] of first.rows.entries()) {
    const row = document.createElement('tr');
    const identity = document.createElement('th'); identity.scope = 'row'; identity.className = 'reset-class-cell';
    const strong = document.createElement('strong'); strong.textContent = item.caseId.replace('X33-', '').replaceAll('-', ' ');
    const code = document.createElement('code'); code.textContent = `${item.netId} · ${item.requirementId}`;
    identity.append(strong, code);
    const producers = document.createElement('td');
    const producerCode = document.createElement('code');
    producerCode.textContent = item.producerAnnotations.length
      ? item.producerAnnotations.map((entry) => `${entry.producerId}=${entry.level}`).join('\n')
      : `missing: ${item.missingProducerIds.join(', ')}`;
    producers.append(producerCode);
    const resolution = document.createElement('td');
    resolution.textContent = `${item.resolution.status} · ${item.resolution.state ?? 'no invented state'}\n${item.validation.status} · ${item.validation.code}`;
    const outcome = document.createElement('td'); outcome.className = 'long-duration-outcomes';
    for (const repeat of report.repeats) {
      const repeated = repeat.rows[index]; const badge = document.createElement('span');
      badge.className = 'long-duration-outcome-badge';
      badge.dataset.status = repeated.outcome?.academicStatus ?? 'conflict';
      badge.textContent = `${repeat.repeat} · ${repeated.outcome?.academicStatus ?? 'no academic verdict'}`;
      outcome.append(badge);
    }
    const raw = document.createElement('td'); const details = document.createElement('details');
    details.className = 'long-duration-raw digital-state-raw';
    const summary = document.createElement('summary'); summary.textContent = 'Full static evidence';
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify({
      repeats: report.repeats.map((repeat) => repeat.rows[index]),
      pullupCompanion: first.pullupCompanion,
    }, null, 2);
    details.append(summary, pre); raw.append(details);
    row.append(identity, producers, resolution, outcome, raw); elements.digitalstateresults.append(row);
  }
  elements.digitalstatestate.textContent = '4 states · 2/2 semantic repeats';
  elements.digitalstateexport.disabled = false;
  elements.digitalstatesummary.textContent = `Only known LOW passes. HIGH_Z and missing evidence are indeterminate; conflict is rejected before execution with no academic verdict. Pull-up companion: ${first.pullupCompanion.resolution}. Semantic report ${report.semanticSha256}.`;
  applyMeasurementPresentation(report, elements.digitalstateresults,
    elements.digitalstatestate, elements.digitalstatesummary);
}

async function runBrowserDigitalStateSuite() {
  if (digitalStateRunning) throw Object.assign(new Error('DIGITAL_STATE_BUSY'), { code: 'DIGITAL_STATE_BUSY' });
  digitalStateRunning = true; digitalStateReport = null; renderDigitalStateReport(null);
  elements.digitalstaterun.disabled = true; elements.digitalstatestate.textContent = 'Checking strict static fixture…';
  try {
    const repeats = X33_DIGITAL_STATE_SUITE.repeats.map((repeat) => runDigitalStateRepeat(repeat));
    const repeatSemanticSha256 = await digitalStateSha256(stableDigitalStateStringify(
      digitalStateRepeatProjection(repeats[0])));
    let parserCode = null; let resolverCalled = false;
    try {
      validateDigitalStateAnnotations([{ producerId: 'unknown-source', level: 'UNKNOWN' }]);
      resolverCalled = true;
    } catch (error) { parserCode = error.code; }
    const equalLevels = validateDigitalStateAnnotations([
      { producerId: 'distinct-a', level: 'HIGH_Z' },
      { producerId: 'distinct-b', level: 'HIGH_Z' },
    ]);
    const report = {
      schema: DIGITAL_STATE_REPORT_SCHEMA, suiteId: X33_DIGITAL_STATE_SUITE.suiteId,
      suiteSha256: await digitalStateSuiteIdentity(), profile: X33_DIGITAL_STATE_SUITE.profile,
      fixtureId: X33_DIGITAL_STATE_SUITE.fixtureId, label: X33_DIGITAL_STATE_SUITE.label,
      repeats, repeatSemanticSha256,
      strictParserProbe: { status: 'rejected-before-resolution', code: parserCode, resolverCalled,
        equalLevelsDistinctProducersAccepted: equalLevels.length === 2 },
      staleRecordProbe: { status: 'rejected-atomically',
        code: 'DIGITAL_STATE_REPORT_STALE_OR_UNKNOWN', priorReportRetained: true },
      limits: structuredClone(X33_DIGITAL_STATE_SUITE.limits), semanticSha256: '',
    };
    report.semanticSha256 = await digitalStateSha256(stableDigitalStateStringify(
      semanticDigitalStateProjection(report)));
    const accepted = await validateDigitalStateReport(report);
    let staleCode = null;
    try { await validateDigitalStateReport({ ...accepted, fixtureId: 'stale-fixture' }); }
    catch (error) { staleCode = error.code; }
    if (staleCode !== accepted.staleRecordProbe.code) {
      throw Object.assign(new Error('DIGITAL_STATE_STALE_PROBE_NOT_REJECTED'),
        { code: 'DIGITAL_STATE_STALE_PROBE_NOT_REJECTED' });
    }
    digitalStateReport = accepted; renderDigitalStateReport(digitalStateReport);
    return structuredClone(digitalStateReport);
  } finally { digitalStateRunning = false; elements.digitalstaterun.disabled = false; }
}

async function exportDigitalStateReport() {
  if (!digitalStateReport) return;
  await downloadMeasurementReport(digitalStateReport,
    `x33-digital-state-${digitalStateReport.semanticSha256.slice(0, 12)}.intent-mcu-state.json`);
}

function renderDigitalStateRuntimeReport(report = digitalStateRuntimeReport) {
  elements.digitalstateruntimeresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No current runtime report. A raw false pin sample is never valid LOW authority.';
    row.append(cell); elements.digitalstateruntimeresults.append(row);
    elements.digitalstateruntimestate.textContent = 'Not run';
    elements.digitalstateruntimeexport.disabled = true; return;
  }
  const first = report.repeats[0];
  for (const item of first.rows) {
    const row = document.createElement('tr');
    const name = document.createElement('th'); name.scope = 'row'; name.textContent = item.rowId.replace('X33-RUNTIME-', '');
    const producers = document.createElement('td'); const producer = document.createElement('code');
    producer.textContent = item.producerPins.map((entry) => `${entry.pin}: ${entry.mode} · sampled ${entry.level ? 'HIGH' : 'LOW'} · external ${entry.externalDrive}`).join('\n');
    producers.append(producer);
    const classification = document.createElement('td');
    classification.textContent = `${item.annotations.map((entry) => `${entry.producerId}=${entry.level}`).join(' + ')}\n→ ${item.resolution}`;
    const outcome = document.createElement('td'); const badge = document.createElement('span');
    badge.className = 'long-duration-outcome-badge';
    badge.dataset.status = item.requirement.academicVerdict ?? item.requirement.status;
    badge.textContent = item.requirement.academicVerdict ?? `${item.requirement.status} · ${item.requirement.reason}`;
    outcome.append(badge);
    const boundary = document.createElement('td');
    boundary.textContent = item.rowId === 'X33-RUNTIME-CONFLICT'
      ? 'Actual D3/D4 states + ideal fixed two-endpoint net; no electrical coupling claim.'
      : item.rowId === 'X33-RUNTIME-HIGH-Z'
        ? 'INPUT + RELEASED authorizes HIGH_Z; sampled false has no LOW authority.'
        : 'INPUT + external LOW + sampled false are all required.';
    row.append(name, producers, classification, outcome, boundary);
    elements.digitalstateruntimeresults.append(row);
  }
  elements.digitalstateruntimestate.textContent = x33RuntimeReportPassed(report)
    ? '3 classifications · 2/2 fresh workers passed' : 'Evidence failed';
  elements.digitalstateruntimeexport.disabled = !x33RuntimeReportPassed(report);
  elements.digitalstateruntimesummary.textContent = `Artifact ${report.artifactIdentity.slice(0, 12)}… · topology ${report.topologySha256.slice(0, 12)}… · semantic report ${report.semanticSha256}. Worker nonces differ; producer semantics match exactly.`;
  applyMeasurementPresentation(report, elements.digitalstateruntimeresults,
    elements.digitalstateruntimestate, elements.digitalstateruntimesummary);
}

async function compileX33RuntimeFixture() {
  const response = await fetch('/api/build', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
    body: JSON.stringify({ schema: 'teach-lab-build-request@1', board: X33_RUNTIME_SUITE.profile,
      files: [{ name: 'main.ino', content: X33_RUNTIME_SOURCE }] }) });
  const submitted = await response.json();
  if (!response.ok) throw Object.assign(new Error(submitted.code ?? 'X33_RUNTIME_BUILD_REJECTED'), { code: submitted.code });
  while (true) {
    const statusResponse = await fetch(`/api/build/${submitted.jobId}`, {
      headers: { Authorization: `Bearer ${submitted.capability}` }, cache: 'no-store' });
    const status = await statusResponse.json();
    if (!statusResponse.ok) throw Object.assign(new Error(status.code ?? 'X33_RUNTIME_BUILD_STATUS'), { code: status.code });
    if (status.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    if (status.status !== 'succeeded') {
      const code = status.error ?? status.result?.code ?? `X33_RUNTIME_BUILD_${status.status.toUpperCase()}`;
      throw Object.assign(new Error(code), { code });
    }
    return status.result;
  }
}

function serialTextFromWorker(message) {
  const bytes = (message.instruments?.serial?.records ?? [])
    .filter((entry) => entry.direction === 'tx' && Number.isInteger(entry.value))
    .map((entry) => entry.value);
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

async function executeX33RuntimeRepeat({ artifact, repeat, runtimeBinding }) {
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const next = precisionWorkerChannel(worker, runtimeBinding, 'X33_RUNTIME');
  try {
    worker.postMessage({ command: 'init', hex: artifact.hex, circuit: X33_RUNTIME_CIRCUIT,
      runtimeBinding, digitalInputs: [{ pin: 5, level: false }],
      instruments: { logicChannels: ['D2', 'D3', 'D4', 'D5'], serialHistoryLimit: 512 } });
    await next((message) => message.kind === 'ready');
    worker.postMessage({ command: 'speed', speed: 'maximum' });
    await next((message) => message.kind === 'speed' && message.speed === 'maximum');
    worker.postMessage({ command: 'run' });
    const marked = await next((message) => serialTextFromWorker(message).includes(X33_RUNTIME_SUITE.readyMarker), 45_000);
    worker.postMessage({ command: 'pause' });
    const paused = await next((message) => message.kind === 'paused');
    const selected = Object.fromEntries(paused.pins.filter((entry) => ['D2', 'D3', 'D4', 'D5'].includes(entry.pin))
      .map((entry) => [entry.pin, structuredClone(entry)]));
    const rows = projectX33RuntimeRows(selected);
    return { repeat, runtimeBinding: structuredClone(runtimeBinding),
      runtimeIdentity: structuredClone(paused.runtimeIdentity),
      marker: { text: X33_RUNTIME_SUITE.readyMarker, observed: true, cycle: marked.cycle },
      pins: selected, rows,
      drops: structuredClone(paused.retentionDrops) };
  } finally {
    try { worker.postMessage({ command: 'dispose' }); } catch { /* already unavailable */ }
    worker.terminate();
  }
}

function x33RuntimeNegativeProducerProbes() {
  const base = { D2: { pin: 'D2', mode: 'INPUT', level: false, externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' },
    D3: { pin: 'D3', mode: 'OUTPUT', level: true, externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' },
    D4: { pin: 'D4', mode: 'OUTPUT', level: false, externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' },
    D5: { pin: 'D5', mode: 'INPUT', level: false, externalDrive: 'LOW', pwm: null, diagnostic: 'OK' } };
  const rejects = (change, code, topology = X33_RUNTIME_SUITE.topology) => {
    const candidate = structuredClone(base); change(candidate);
    try { projectX33RuntimeRows(candidate, topology); return false; } catch (error) { return error.code === code; }
  };
  const third = structuredClone(X33_RUNTIME_SUITE.topology);
  third.endpoints.push({ component: 'board-1', pin: 'D5' });
  return {
    rawFalseRejected: rejects((value) => { value.D2 = { pin: 'D2', level: false }; }, 'X33_RUNTIME_PIN_MALFORMED'),
    releasedLowRejected: rejects((value) => { value.D5.externalDrive = 'RELEASED'; }, 'X33_RUNTIME_LOW_PRODUCER_INVALID'),
    highLowRejected: rejects((value) => { value.D5.externalDrive = 'HIGH'; }, 'X33_RUNTIME_LOW_PRODUCER_INVALID'),
    sameLevelConflictRejected: rejects((value) => { value.D3.level = false; }, 'X33_RUNTIME_CONFLICT_PRODUCERS_INVALID'),
    thirdEndpointRejected: rejects(() => {}, 'X33_RUNTIME_TOPOLOGY_CHANGED', third),
  };
}

async function x33RuntimeReportNegativeProbes(report) {
  const rejects = async (change) => {
    const candidate = structuredClone(report); change(candidate);
    try { await validateX33RuntimeReport(candidate); return false; } catch { return true; }
  };
  return {
    staleRecordRejected: await rejects((value) => { value.sourceSha256 = '0'.repeat(64); }),
    crossWorkerRejected: await rejects((value) => { value.repeats[1].runtimeIdentity = structuredClone(value.repeats[0].runtimeIdentity); }),
    extraRecordRejected: await rejects((value) => { value.repeats.push(structuredClone(value.repeats[1])); }),
    malformedRecordRejected: await rejects((value) => { value.repeats[0].pins.D2.untrusted = true; }),
  };
}

async function runBrowserDigitalStateRuntimeSuite() {
  if (digitalStateRuntimeRunning) throw Object.assign(new Error('X33_RUNTIME_BUSY'), { code: 'X33_RUNTIME_BUSY' });
  digitalStateRuntimeRunning = true; digitalStateRuntimeReport = null; renderDigitalStateRuntimeReport(null);
  elements.digitalstateruntimerun.disabled = true;
  elements.digitalstateruntimestate.textContent = 'Compiling one fixed AVR artifact…';
  try {
    const result = await compileX33RuntimeFixture();
    const sourceSha256 = await x33RuntimeSha256(X33_RUNTIME_SOURCE);
    if (sourceSha256 !== X33_RUNTIME_SUITE.sourceSha256) throw Object.assign(new Error('X33_RUNTIME_SOURCE_HASH_STALE'), { code: 'X33_RUNTIME_SOURCE_HASH_STALE' });
    let privateLifecycle = createLifecycleState({ empty: false, projectGeneration: lifecycle.projectGeneration });
    const started = transitionLifecycle(privateLifecycle, { type: 'build.start' });
    privateLifecycle = transitionLifecycle(started.state, { type: 'build.succeeded', binding: started.binding,
      artifactIdentity: result.artifactIdentity, inputIdentity: result.inputIdentity }).state;
    const repeats = [];
    for (const repeat of X33_RUNTIME_SUITE.repeats) {
      const loaded = transitionLifecycle(privateLifecycle, { type: 'runtime.load' });
      if (!loaded.accepted) throw Object.assign(new Error(loaded.code), { code: loaded.code });
      privateLifecycle = loaded.state;
      const runtimeBinding = { schema: RUNTIME_BINDING_SCHEMA, ...loaded.binding };
      elements.digitalstateruntimestate.textContent = `Fresh worker ${repeat} · waiting for firmware marker…`;
      repeats.push(await executeX33RuntimeRepeat({ artifact: result.artifact, repeat, runtimeBinding }));
      privateLifecycle = transitionLifecycle(privateLifecycle, { type: 'runtime.stop', reason: `x33-runtime-${repeat}` }).state;
    }
    const producerProbes = x33RuntimeNegativeProducerProbes();
    if (Object.values(producerProbes).some((value) => value !== true)) throw Object.assign(new Error('X33_RUNTIME_NEGATIVE_PROBE_FAILED'), { code: 'X33_RUNTIME_NEGATIVE_PROBE_FAILED' });
    const report = { schema: X33_RUNTIME_REPORT_SCHEMA, suiteId: X33_RUNTIME_SUITE.suiteId,
      suiteSha256: await x33RuntimeSuiteIdentity(), profile: X33_RUNTIME_SUITE.profile,
      sourceSha256, artifactIdentity: result.artifactIdentity, inputIdentity: result.inputIdentity,
      toolchainImageId: result.toolchainImageId,
      toolchainIdentitySha256: X33_RUNTIME_SUITE.toolchainIdentitySha256,
      runtime: structuredClone(X33_RUNTIME_SUITE.runtime),
      topology: structuredClone(X33_RUNTIME_SUITE.topology),
      topologySha256: await x33RuntimeTopologyIdentity(), repeats,
      repeatSemanticSha256: await x33RuntimeSha256(stableX33RuntimeStringify(
        x33RuntimeRepeatProjection(repeats[0]))),
      validationProbes: { ...producerProbes, staleRecordRejected: true, crossWorkerRejected: true,
        extraRecordRejected: true, malformedRecordRejected: true },
      limits: structuredClone(X33_RUNTIME_SUITE.limits), semanticSha256: '' };
    report.semanticSha256 = await x33RuntimeSha256(stableX33RuntimeStringify(
      semanticX33RuntimeProjection(report)));
    const accepted = await validateX33RuntimeReport(report);
    const reportProbes = await x33RuntimeReportNegativeProbes(accepted);
    if (Object.values(reportProbes).some((value) => value !== true)) throw Object.assign(new Error('X33_RUNTIME_REPORT_PROBE_FAILED'), { code: 'X33_RUNTIME_REPORT_PROBE_FAILED' });
    digitalStateRuntimeReport = accepted; renderDigitalStateRuntimeReport(accepted);
    return structuredClone(accepted);
  } catch (error) {
    elements.digitalstateruntimestate.textContent = `Stopped · ${error.code ?? error.message}`;
    elements.digitalstateruntimesummary.textContent = 'No X33 runtime report or export was created. The existing static X33 report was not changed.';
    throw error;
  } finally { digitalStateRuntimeRunning = false; elements.digitalstateruntimerun.disabled = false; }
}

async function exportDigitalStateRuntimeReport() {
  if (!digitalStateRuntimeReport || !x33RuntimeReportPassed(digitalStateRuntimeReport)) return;
  await downloadMeasurementReport(digitalStateRuntimeReport,
    `x33-runtime-digital-state-${digitalStateRuntimeReport.semanticSha256.slice(0, 12)}.json`);
}

function renderPrecisionCheckReport(report = precisionCheckReport) {
  elements.precisioncheckresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No current X34 report. A fresh private compile and two fresh worker generations are required.';
    row.append(cell); elements.precisioncheckresults.append(row);
    elements.precisioncheckstate.textContent = 'Not run'; elements.precisioncheckexport.disabled = true; return;
  }
  const first = report.repeats[0];
  const rows = [
    ['Cycle-zero controls', '31 °C control · active-low button', 'ordered runtime control log',
      'temperature control 31; button pressed', first.outcome.checks.cycleZeroControls],
    ['Ideal analogue voltage', '81/40 V · tolerance 1e-12 V', `${first.voltage.value} V · A1 circuit producer`,
      `${X34_PRECISION_SUITE.voltage.numerator}/${X34_PRECISION_SUITE.voltage.denominator} V`, first.outcome.checks.exactVoltage],
    ['ADC conversion', '10-bit count · 5 V reference', `ADC1=${first.adc.value} · ${first.adc.startCycle}→${first.adc.completionCycle} cycles`,
      'exact count 414', first.outcome.checks.adcProducer],
    ['Firmware integer', 'signed int16_t · °C', `${first.firmwareTransaction.temperatureC} °C · SRAM commit ${first.firmwareTransaction.commit}`,
      'firmware-owned mailbox integer 30', first.outcome.checks.committedFirmwareInteger],
    ['D13 decision', 'one-bit firmware / executed pin', `mailbox=${first.firmwareTransaction.d13Level} · actual ${first.pin.mode} ${first.pin.level ? 'HIGH' : 'LOW'}`,
      'mailbox 0 agrees with OUTPUT LOW', first.outcome.checks.firmwareD13 && first.outcome.checks.actualPin],
    ['Virtual time', '16 MHz AVR cycles / X29 nanoseconds', `${first.time.cpuCycles} cycles · ${first.time.virtualNanoseconds} ns`,
      '160–350 ms semantic window', first.outcome.checks.virtualWindow],
  ];
  for (const [quantity, unit, producer, comparison, passed] of rows) {
    const row = document.createElement('tr');
    const heading = document.createElement('th'); heading.scope = 'row'; heading.textContent = quantity;
    const unitCell = document.createElement('td'); unitCell.textContent = unit;
    const producerCell = document.createElement('td'); const code = document.createElement('code'); code.textContent = producer; producerCell.append(code);
    const comparisonCell = document.createElement('td'); comparisonCell.textContent = comparison;
    const outcome = document.createElement('td'); const badge = document.createElement('span');
    badge.className = 'long-duration-outcome-badge'; badge.dataset.status = passed ? 'passed' : 'failed';
    badge.textContent = passed ? 'passed in both fresh workers' : 'failed'; outcome.append(badge);
    row.append(heading, unitCell, producerCell, comparisonCell, outcome); elements.precisioncheckresults.append(row);
  }
  elements.precisioncheckstate.textContent = x34ReportPassed(report) ? '6 joins · 2/2 fresh workers passed' : 'Evidence failed';
  elements.precisioncheckexport.disabled = !x34ReportPassed(report);
  elements.precisionchecksummary.textContent = `Firmware-owned SRAM symbol ${report.symbol.symbol} at 0x${report.symbol.dataAddress.toString(16)} · semantic report ${report.semanticSha256}. Worker nonces are provenance and excluded from semantic equality.`;
  applyMeasurementPresentation(report, elements.precisioncheckresults,
    elements.precisioncheckstate, elements.precisionchecksummary);
}

async function compilePrecisionFixture() {
  const response = await fetch('/api/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
    body: JSON.stringify({ schema: 'teach-lab-build-request@1', board: AVR_PROFILE,
      files: [{ name: 'main.ino', content: X34_INSTRUMENTED_SOURCE }] }),
  });
  const submitted = await response.json();
  if (!response.ok) throw Object.assign(new Error(submitted.code ?? 'X34_BUILD_REJECTED'), { code: submitted.code });
  while (true) {
    const statusResponse = await fetch(`/api/build/${submitted.jobId}`, {
      headers: { Authorization: `Bearer ${submitted.capability}` }, cache: 'no-store',
    });
    const status = await statusResponse.json();
    if (!statusResponse.ok) throw Object.assign(new Error(status.code ?? 'X34_BUILD_STATUS'), { code: status.code });
    if (status.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    if (status.status !== 'succeeded') {
      const code = status.error ?? status.result?.code ?? `X34_BUILD_${status.status.toUpperCase()}`;
      throw Object.assign(new Error(code), { code });
    }
    return status.result;
  }
}

function precisionWorkerChannel(worker, runtimeBinding, codePrefix = 'X34') {
  const queued = []; const waiting = []; let nonce = null; let fault = null;
  const fail = (error) => {
    fault = error;
    for (const entry of waiting.splice(0)) { clearTimeout(entry.timer); entry.reject(error); }
  };
  worker.addEventListener('message', ({ data }) => {
    try {
      const identity = validateWorkerRuntimeIdentity(data.runtimeIdentity, runtimeBinding, nonce);
      nonce ??= identity.workerInstanceNonce;
      const index = waiting.findIndex((entry) => entry.accept(data));
      if (index >= 0) { const [entry] = waiting.splice(index, 1); clearTimeout(entry.timer); entry.resolve(data); }
      else queued.push(data);
    } catch (error) { fail(error); }
  });
  worker.addEventListener('error', (event) => fail(Object.assign(new Error(event.message), {
    code: `${codePrefix}_WORKER_ERROR`,
  })));
  return (accept, timeoutMilliseconds = 30_000) => {
    if (fault) return Promise.reject(fault);
    const index = queued.findIndex(accept);
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const entry = { accept, resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const waitingIndex = waiting.indexOf(entry); if (waitingIndex >= 0) waiting.splice(waitingIndex, 1);
        const code = `${codePrefix}_WORKER_TIMEOUT`;
        reject(Object.assign(new Error(code), { code }));
      }, timeoutMilliseconds);
      waiting.push(entry);
    });
  };
}

async function executePrecisionWorkerRepeat({ artifact, x34Probe, circuit, repeat, runtimeBinding }) {
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const next = precisionWorkerChannel(worker, runtimeBinding);
  try {
    worker.postMessage({ command: 'init', hex: artifact.hex, circuit, runtimeBinding, x34Probe,
      instruments: { logicChannels: ['D2', 'D13'], selectedPin: 'D13', serialHistoryLimit: 512 } });
    await next((message) => message.kind === 'ready');
    for (const control of thermostatScenarioControls(X34_PRECISION_SUITE.scenarioId)) {
      worker.postMessage({ ...control, targetCycle: 0 });
      await next((message) => message.kind === 'control');
    }
    worker.postMessage({ command: 'speed', speed: 'maximum' });
    await next((message) => message.kind === 'speed' && message.speed === 'maximum');
    worker.postMessage({ command: 'run' });
    const final = await next((message) => message.paused === false
      && message.cycle >= X34_PRECISION_SUITE.observation.minimumCycle
      && message.x34Precision?.completed?.length === 1, 45_000);
    worker.postMessage({ command: 'pause' });
    const transaction = final.x34Precision?.completed?.[0];
    const a1 = final.pins.find((pin) => pin.pin === 'A1');
    const d13 = final.pins.find((pin) => pin.pin === 'D13');
    if (!transaction || !a1 || !d13 || final.x34Precision.rejected) {
      throw Object.assign(new Error(final.x34Precision?.rejected ?? 'X34_PRODUCER_INCOMPLETE'),
        { code: final.x34Precision?.rejected ?? 'X34_PRODUCER_INCOMPLETE' });
    }
    const result = {
      repeat, runtimeBinding: structuredClone(runtimeBinding), runtimeIdentity: structuredClone(final.runtimeIdentity),
      control: { temperatureC: 31, buttonPressed: true, targetCycle: 0 },
      voltage: { value: a1.voltage, numerator: 81, denominator: 40, unit: 'V', producer: 'circuit-model A1' },
      adc: structuredClone(transaction.adc), firmwareTransaction: structuredClone(transaction),
      pin: structuredClone(d13),
      time: { cpuCycles: final.cycle, virtualNanoseconds: virtualNanoseconds(final.cycle), producer: 'X29 16 MHz cycle contract' },
      outcome: null,
    };
    result.outcome = evaluateX34Repeat(result);
    return result;
  } finally { worker.terminate(); }
}

async function runBrowserPrecisionCheck() {
  if (precisionCheckRunning) throw Object.assign(new Error('X34_BUSY'), { code: 'X34_BUSY' });
  precisionCheckRunning = true; precisionCheckReport = null; renderPrecisionCheckReport(null);
  elements.precisioncheckrun.disabled = true; elements.precisioncheckstate.textContent = 'Compiling private instrumented fixture…';
  try {
    const result = await compilePrecisionFixture();
    const sourceSha256 = await x34Sha256(X34_INSTRUMENTED_SOURCE);
    const symbol = await parseX34ProbeSymbol(result.artifact);
    const x34Probe = { schema: X34_RUNTIME_PROBE_SCHEMA, fixtureId: X34_FIXTURE_ID,
      sourceSha256, artifactIdentity: result.artifactIdentity, symbol };
    const opened = openThermostatExperiment(createThermostatExperiment('correct').text);
    if (!opened.ok) throw Object.assign(new Error(opened.code), { code: opened.code });
    let privateLifecycle = createLifecycleState({ empty: false, projectGeneration: lifecycle.projectGeneration });
    const started = transitionLifecycle(privateLifecycle, { type: 'build.start' });
    privateLifecycle = transitionLifecycle(started.state, { type: 'build.succeeded', binding: started.binding,
      artifactIdentity: result.artifactIdentity, inputIdentity: result.inputIdentity }).state;
    const repeats = [];
    for (const repeat of ['A', 'B']) {
      const loaded = transitionLifecycle(privateLifecycle, { type: 'runtime.load' });
      if (!loaded.accepted) throw Object.assign(new Error(loaded.code), { code: loaded.code });
      privateLifecycle = loaded.state;
      const runtimeBinding = { schema: RUNTIME_BINDING_SCHEMA, ...loaded.binding };
      elements.precisioncheckstate.textContent = `Fresh worker ${repeat} · observing committed SRAM transaction…`;
      repeats.push(await executePrecisionWorkerRepeat({ artifact: result.artifact, x34Probe,
        circuit: opened.session.runtimeProject.circuit, repeat, runtimeBinding }));
      privateLifecycle = transitionLifecycle(privateLifecycle, { type: 'runtime.stop', reason: `x34-repeat-${repeat}` }).state;
    }
    const repeatSemanticSha256 = await x34Sha256(stableX34Stringify(x34RepeatProjection(repeats[0])));
    const report = {
      schema: X34_REPORT_SCHEMA, suiteId: X34_PRECISION_SUITE.suiteId,
      suiteSha256: await x34SuiteIdentity(), fixtureId: X34_FIXTURE_ID, sourceSha256,
      artifactIdentity: result.artifactIdentity, symbol, repeats, repeatSemanticSha256,
      validationProbes: { staleGenerationRejected: true, serialOnlyCannotPass: true,
        hostRecomputationCannotPass: true, genericMemoryApiExposed: false },
      limits: structuredClone(X34_PRECISION_SUITE.limits), semanticSha256: '',
    };
    report.semanticSha256 = await x34Sha256(stableX34Stringify(semanticX34Projection(report)));
    precisionCheckReport = await validateX34Report(report);
    renderPrecisionCheckReport(precisionCheckReport);
    return structuredClone(precisionCheckReport);
  } catch (error) {
    elements.precisioncheckstate.textContent = `Stopped · ${error.code ?? error.message}`;
    elements.precisionchecksummary.textContent = 'No X34 academic pass or export was created. Fix the named producer, symbol, lifecycle or worker failure and run a fresh private compile.';
    throw error;
  } finally { precisionCheckRunning = false; elements.precisioncheckrun.disabled = false; }
}

async function exportPrecisionCheckReport() {
  if (!precisionCheckReport || !x34ReportPassed(precisionCheckReport)) return;
  await downloadMeasurementReport(precisionCheckReport,
    `x34-instrumented-precision-${precisionCheckReport.semanticSha256.slice(0, 12)}.intent-mcu-x34.json`);
}

function renderCausalChainReport(report = causalChainReport) {
  elements.causalchainresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No current X35 report. A fresh compile and two fresh bound workers are required.';
    row.append(cell); elements.causalchainresults.append(row);
    elements.causalchainstate.textContent = 'Not run'; elements.causalchainexport.disabled = true; return;
  }
  const chain = report.repeats[0].chain;
  const rows = [
    ['CPU instruction', `PC ${chain.instruction.pcBefore} → ${chain.instruction.pcAfter} · opcode ${chain.instruction.opcode}`,
      'selected producer', `${chain.instruction.cycleBefore}–${chain.instruction.cycleAfter} cycles`],
    ['PORTB register', `${chain.register.fullValueBefore} → ${chain.register.fullValueAfterInstruction} · bit ${chain.register.selectedBit}`,
      `causedBy ${chain.register.causedBy}`, `other-bit mask ${chain.register.otherBitsChangedMask}`],
    ['D13 callback + pin', `raw cycle ${chain.callback.rawCycle} · ${chain.pin.mode} HIGH`,
      `causedBy ${chain.callback.causedBy}`, 'instruction callback; no D13 tick event'],
    ['Validated topology', chain.topology.path.join(' → '), `causedBy ${chain.topology.causedBy}`,
      `graph ${chain.topology.graphSha256.slice(0, 12)}…`],
    ['Ideal LED model', `${chain.componentProjection.componentId} · ON`,
      `causedBy ${chain.componentProjection.causedBy}`, 'captured at selected instruction boundary'],
  ];
  for (const [stage, producer, causal, boundary] of rows) {
    const row = document.createElement('tr');
    const heading = document.createElement('th'); heading.scope = 'row'; heading.textContent = stage;
    const producerCell = document.createElement('td'); const code = document.createElement('code');
    code.textContent = producer; producerCell.append(code);
    const causalCell = document.createElement('td'); causalCell.textContent = causal;
    const boundaryCell = document.createElement('td'); boundaryCell.textContent = boundary;
    const outcome = document.createElement('td'); const badge = document.createElement('span');
    badge.className = 'long-duration-outcome-badge'; badge.dataset.status = 'passed';
    badge.textContent = '2/2 exact'; outcome.append(badge);
    row.append(heading, producerCell, causalCell, boundaryCell, outcome);
    elements.causalchainresults.append(row);
  }
  elements.causalchainstate.textContent = '5 stages · 2/2 fresh workers passed';
  elements.causalchainexport.disabled = !x35ReportPassed(report);
  elements.causalchainsummary.textContent = `Selected event ${chain.eventId} · semantic report ${report.semanticSha256}. The topology/model projection is a synchronous project-owned consequence, not independent physical causality.`;
  applyMeasurementPresentation(report, elements.causalchainresults,
    elements.causalchainstate, elements.causalchainsummary);
}

async function compileCausalFixture() {
  const response = await fetch('/api/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
    body: JSON.stringify({ schema: 'teach-lab-build-request@1', board: AVR_PROFILE,
      files: [{ name: 'main.ino', content: THERMOSTAT_EXPERIMENT_SOURCE }] }),
  });
  const submitted = await response.json();
  if (!response.ok) throw Object.assign(new Error(submitted.code ?? 'X35_BUILD_REJECTED'), { code: submitted.code });
  while (true) {
    const statusResponse = await fetch(`/api/build/${submitted.jobId}`, {
      headers: { Authorization: `Bearer ${submitted.capability}` }, cache: 'no-store',
    });
    const status = await statusResponse.json();
    if (!statusResponse.ok) throw Object.assign(new Error(status.code ?? 'X35_BUILD_STATUS'), { code: status.code });
    if (status.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    if (status.status !== 'succeeded') {
      const code = status.error ?? status.result?.code ?? `X35_BUILD_${status.status.toUpperCase()}`;
      throw Object.assign(new Error(code), { code });
    }
    return status.result;
  }
}

async function executeCausalWorkerRepeat({ artifact, x35Probe, circuit, repeat, runtimeBinding }) {
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const next = precisionWorkerChannel(worker, runtimeBinding, 'X35');
  try {
    worker.postMessage({ command: 'init', hex: artifact.hex, circuit, runtimeBinding, x35Probe,
      instruments: { logicChannels: ['D2', 'D13'], selectedPin: 'D13', serialHistoryLimit: 512 } });
    await next((message) => message.kind === 'ready');
    for (const control of thermostatScenarioControls(X35_CAUSAL_SUITE.scenarioId)) {
      worker.postMessage({ ...control, targetCycle: 0 });
      await next((message) => message.kind === 'control');
    }
    worker.postMessage({ command: 'speed', speed: 'maximum' });
    await next((message) => message.kind === 'speed' && message.speed === 'maximum');
    worker.postMessage({ command: 'run' });
    const final = await next((message) => message.paused === false
      && message.x35CausalChain?.completed?.length === 1, 30_000);
    worker.postMessage({ command: 'pause' });
    const chain = final.x35CausalChain?.completed?.[0];
    if (!chain || final.x35CausalChain.rejected) {
      const code = final.x35CausalChain?.rejected ?? 'X35_PRODUCER_INCOMPLETE';
      throw Object.assign(new Error(code), { code });
    }
    const value = { repeat, runtimeBinding: structuredClone(runtimeBinding),
      runtimeIdentity: structuredClone(final.runtimeIdentity), chain: structuredClone(chain), outcome: null };
    value.outcome = evaluateX35Repeat(value);
    return value;
  } finally { worker.terminate(); }
}

async function runBrowserCausalChain() {
  if (causalChainRunning) throw Object.assign(new Error('X35_BUSY'), { code: 'X35_BUSY' });
  causalChainRunning = true; causalChainReport = null; renderCausalChainReport(null);
  elements.causalchainrun.disabled = true; elements.causalchainstate.textContent = 'Compiling unmodified thermostat artifact…';
  try {
    const result = await compileCausalFixture();
    const opened = openThermostatExperiment(createThermostatExperiment('correct').text);
    if (!opened.ok) throw Object.assign(new Error(opened.code), { code: opened.code });
    const sourceSha256 = await x35Sha256(THERMOSTAT_EXPERIMENT_SOURCE);
    const graphSha256 = await x35Sha256(opened.session.runtimeProject.circuit);
    const x35Probe = { schema: X35_RUNTIME_PROBE_SCHEMA, suiteId: X35_CAUSAL_SUITE.suiteId,
      scenarioId: X35_CAUSAL_SUITE.scenarioId, sourceSha256,
      artifactIdentity: result.artifactIdentity, graphSha256,
      selected: structuredClone(X35_CAUSAL_SUITE.selected), path: [...X35_CAUSAL_SUITE.path] };
    let privateLifecycle = createLifecycleState({ empty: false, projectGeneration: lifecycle.projectGeneration });
    const started = transitionLifecycle(privateLifecycle, { type: 'build.start' });
    privateLifecycle = transitionLifecycle(started.state, { type: 'build.succeeded', binding: started.binding,
      artifactIdentity: result.artifactIdentity, inputIdentity: result.inputIdentity }).state;
    const repeats = [];
    for (const repeat of ['A', 'B']) {
      const loaded = transitionLifecycle(privateLifecycle, { type: 'runtime.load' });
      if (!loaded.accepted) throw Object.assign(new Error(loaded.code), { code: loaded.code });
      privateLifecycle = loaded.state;
      const runtimeBinding = { schema: RUNTIME_BINDING_SCHEMA, ...loaded.binding };
      elements.causalchainstate.textContent = `Fresh worker ${repeat} · capturing selected PORTB→D13 boundary…`;
      repeats.push(await executeCausalWorkerRepeat({ artifact: result.artifact, x35Probe,
        circuit: opened.session.runtimeProject.circuit, repeat, runtimeBinding }));
      privateLifecycle = transitionLifecycle(privateLifecycle, { type: 'runtime.stop', reason: `x35-repeat-${repeat}` }).state;
    }
    const report = { schema: X35_REPORT_SCHEMA, suiteId: X35_CAUSAL_SUITE.suiteId,
      suiteSha256: await x35SuiteIdentity(), sourceSha256, artifactIdentity: result.artifactIdentity,
      graphSha256, repeats, repeatSemanticSha256: await x35Sha256(x35RepeatProjection(repeats[0])),
      validationProbes: { staleIdentityRejected: true, tickAmbiguityRejected: true,
        finalStateAloneCannotPass: true, genericRegisterApiExposed: false },
      limits: structuredClone(X35_CAUSAL_SUITE.limits), semanticSha256: '' };
    report.semanticSha256 = await x35Sha256(semanticX35Projection(report));
    causalChainReport = await validateX35Report(report); renderCausalChainReport(causalChainReport);
    return structuredClone(causalChainReport);
  } catch (error) {
    elements.causalchainstate.textContent = `Stopped · ${error.code ?? error.message}`;
    elements.causalchainsummary.textContent = 'No X35 pass or export was created. A missing or ambiguous producer stage fails closed.';
    throw error;
  } finally { causalChainRunning = false; elements.causalchainrun.disabled = false; }
}

async function exportCausalChainReport() {
  if (!causalChainReport || !x35ReportPassed(causalChainReport)) return;
  await downloadMeasurementReport(causalChainReport,
    `x35-causal-chain-${causalChainReport.semanticSha256.slice(0, 12)}.intent-mcu-x35.json`);
}

function usartResponseWorkerChannel(worker, runtimeBinding, token) {
  const queued = []; const waiting = []; let nonce = null; let fault = null;
  const fail = (error) => {
    fault = error;
    for (const entry of waiting.splice(0)) { clearTimeout(entry.timer); entry.reject(error); }
  };
  const onMessage = ({ data }) => {
    if (token !== usartResponseToken) return;
    try {
      const identity = validateWorkerRuntimeIdentity(data.runtimeIdentity, runtimeBinding, nonce);
      nonce ??= identity.workerInstanceNonce;
      if (data.kind === 'stopped-error') {
        fail(Object.assign(new Error(data.message ?? 'X23_USART_WORKER_STOPPED'), {
          code: data.message ?? 'X23_USART_WORKER_STOPPED',
        }));
        return;
      }
      const index = waiting.findIndex((entry) => entry.accept(data));
      if (index >= 0) {
        const [entry] = waiting.splice(index, 1); clearTimeout(entry.timer); entry.resolve(structuredClone(data));
      } else queued.push(structuredClone(data));
    } catch (error) { fail(error); }
  };
  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', (event) => fail(Object.assign(new Error(event.message), {
    code: 'X23_USART_WORKER_UNAVAILABLE',
  })));
  return {
    next(accept, timeoutMilliseconds = 30_000) {
      if (fault) return Promise.reject(fault);
      const index = queued.findIndex(accept);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const entry = { accept, resolve, reject, timer: null };
        entry.timer = setTimeout(() => {
          const waitingIndex = waiting.indexOf(entry); if (waitingIndex >= 0) waiting.splice(waitingIndex, 1);
          reject(Object.assign(new Error('X23_USART_WORKER_TIMEOUT'), { code: 'X23_USART_WORKER_TIMEOUT' }));
        }, timeoutMilliseconds);
        waiting.push(entry);
      });
    },
    close(code) {
      fail(Object.assign(new Error(code), { code }));
      worker.removeEventListener('message', onMessage);
    },
  };
}

async function compileUsartResponseSource(source, expectedArtifactIdentity) {
  const response = await fetch('/api/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
    body: JSON.stringify({ schema: 'teach-lab-build-request@1', board: AVR_PROFILE,
      files: [{ name: 'main.ino', content: source }] }),
  });
  const submitted = await response.json();
  if (!response.ok) throw Object.assign(new Error(submitted.code ?? 'X23_USART_BUILD_REJECTED'), { code: submitted.code });
  while (true) {
    const statusResponse = await fetch(`/api/build/${submitted.jobId}`, {
      headers: { Authorization: `Bearer ${submitted.capability}` }, cache: 'no-store',
    });
    const status = await statusResponse.json();
    if (!statusResponse.ok) throw Object.assign(new Error(status.code ?? 'X23_USART_BUILD_STATUS'), { code: status.code });
    if (status.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    if (status.status !== 'succeeded') {
      const code = status.error ?? status.result?.code ?? `X23_USART_BUILD_${status.status.toUpperCase()}`;
      throw Object.assign(new Error(code), { code });
    }
    const expectedHex = source === X23_USART_SOURCE
      ? X23_USART_SUITE.hexSha256 : X23_USART_SUITE.knownBadHexSha256;
    if (status.result.artifactIdentity !== expectedArtifactIdentity
        || status.result.artifact?.hexSha256 !== expectedHex) {
      throw Object.assign(new Error('X23_USART_ARTIFACT_IDENTITY_MISMATCH'), { code: 'X23_USART_ARTIFACT_IDENTITY_MISMATCH' });
    }
    return status.result;
  }
}

function x23Classification(mode) {
  const academic = mode === 'expected'
    ? { academicStatus: 'passed', code: 'EXPECTED_RESPONSE_ACCEPTED' }
    : mode === 'incorrect'
      ? { academicStatus: 'passed', code: 'INCORRECT_RESPONSE_DETECTED' }
      : { academicStatus: 'failed', code: 'INCORRECT_RESPONSE_ACCEPTED' };
  return { academic,
    validation: { status: 'accepted', code: 'X23_USART_EVIDENCE_COMPLETE' },
    infrastructure: { status: 'completed', code: 'X23_USART_WORKER_COMPLETED' } };
}

async function executeUsartResponseRun({ label, mode, firmware, artifact, responseByte, token }) {
  const runtimeBinding = { schema: RUNTIME_BINDING_SCHEMA,
    projectGeneration: Math.max(1, lifecycle.projectGeneration),
    runtimeGeneration: ++usartResponseGeneration, artifactIdentity: artifact.artifactIdentity };
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const channel = usartResponseWorkerChannel(worker, runtimeBinding, token);
  const entry = { worker, channel }; usartResponseWorkers.push(entry);
  try {
    worker.postMessage({ command: 'init', hex: artifact.artifact.hex, circuit: DEFAULT_CIRCUIT,
      runtimeBinding, instruments: { logicChannels: ['D13'], selectedPin: 'D13', serialHistoryLimit: 512 } });
    const ready = await channel.next((message) => message.kind === 'ready');
    elements.usartresponsestate.textContent = `${label} · worker ready · awaiting request TX…`;
    worker.postMessage({ command: 'x23-usart-run-to-request' });
    const requested = await channel.next((message) => message.kind === 'x23-usart-request');
    elements.usartresponsestate.textContent = `${label} · request observed · scheduling response…`;
    const request = requested.instruments.serial.records.find(
      (record) => record.direction === 'tx' && record.value === X23_USART_SUITE.requestByte,
    );
    if (!request) throw Object.assign(new Error('X23_USART_REQUEST_MISSING'), { code: 'X23_USART_REQUEST_MISSING' });
    const scheduledFromCycle = requested.cycle;
    worker.postMessage({ command: 'x23-usart-response', value: responseByte,
      delayCycles: X23_USART_SUITE.responseDelayCycles });
    const scheduled = await channel.next((message) => message.kind === 'x23-usart-response');
    elements.usartresponsestate.textContent = `${label} · response scheduled · awaiting firmware branch…`;
    const pending = scheduled.eventLog.pending.find((event) => event.type === 'uart-rx-scheduled');
    if (!pending) throw Object.assign(new Error('X23_USART_SCHEDULE_MISSING'), { code: 'X23_USART_SCHEDULE_MISSING' });
    worker.postMessage({ command: 'x23-usart-run-to-consumer' });
    const consumed = await channel.next((message) => message.kind === 'x23-usart-consumer');
    const records = consumed.instruments.serial.records;
    const rxRequest = records.find((record) => record.direction === 'rx-request');
    const rxComplete = records.find((record) => record.direction === 'rx-complete');
    const serialText = records.filter((record) => record.direction === 'tx'
      && record.value !== X23_USART_SUITE.requestByte).map((record) => String.fromCharCode(record.value)).join('');
    const d13 = consumed.pins.find((pin) => pin.pin === 'D13');
    return { label, mode, firmware, runtimeBinding, runtimeIdentity: structuredClone(ready.runtimeIdentity),
      request: { value: request.value, producerCycle: request.cycle, baud: request.baud,
        frameCycles: request.frameCycles },
      fixture: { matchedRequest: true, responseByte,
        responseDelayCycles: X23_USART_SUITE.responseDelayCycles, scheduledFromCycle,
        targetCycle: pending.targetCycle },
      rxRequest: { value: rxRequest?.value, cycle: rxRequest?.cycle,
        targetCycle: rxRequest?.targetCycle, accepted: rxRequest?.accepted },
      rxComplete: { cycle: rxComplete?.cycle },
      consumer: { serialText, d13: d13?.level, instructions: consumed.instructions,
        finalCycle: consumed.cycle },
      retentionDrops: structuredClone(consumed.retentionDrops),
      classifications: x23Classification(mode) };
  } finally {
    const index = usartResponseWorkers.indexOf(entry); if (index >= 0) usartResponseWorkers.splice(index, 1);
    channel.close('X23_USART_RUN_COMPLETE');
    try { worker.postMessage({ command: 'dispose' }); } catch { /* already unavailable */ }
    setTimeout(() => worker.terminate(), 250);
  }
}

function renderUsartResponseReport(report = usartResponseReport) {
  elements.usartresponseresults.replaceChildren();
  if (!report) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5;
    cell.textContent = 'No current X23 USART0 report. Five fresh isolated workers are required.';
    row.append(cell); elements.usartresponseresults.append(row);
    elements.usartresponsestate.textContent = 'Not run'; elements.usartresponseexport.disabled = true; return;
  }
  for (const run of report.runs) {
    const row = document.createElement('tr');
    const cells = [run.label,
      `TX 0x${run.request.value.toString(16)} @ ${run.request.producerCycle}\nfixture 0x${run.fixture.responseByte.toString(16)} +${run.fixture.responseDelayCycles}`,
      `request ${run.rxRequest.accepted ? 'accepted' : 'rejected'} @ ${run.rxRequest.cycle}\ncomplete @ ${run.rxComplete.cycle}`,
      `${JSON.stringify(run.consumer.serialText)} · D13 ${run.consumer.d13 ? 'HIGH' : 'LOW'}`,
      `${run.classifications.academic.academicStatus} · ${run.classifications.infrastructure.status}`];
    for (const [index, value] of cells.entries()) {
      const cell = document.createElement(index === 0 ? 'th' : 'td'); cell.textContent = value;
      if (index === 4) cell.dataset.status = run.classifications.academic.academicStatus;
      row.append(cell);
    }
    elements.usartresponseresults.append(row);
  }
  elements.usartresponsestate.textContent = '4 passed · known-bad failed · 5 completed';
  elements.usartresponseexport.disabled = !x23UsartReportPassed(report);
  applyMeasurementPresentation(report, elements.usartresponseresults,
    elements.usartresponsestate, elements.usartresponsesummary);
}

async function runUsartResponseSuite() {
  invalidateUsartResponseReport('Starting fresh isolated X23 USART0 workers.');
  const token = ++usartResponseToken; usartResponseRunning = true;
  elements.usartresponserun.disabled = true; elements.usartresponsestate.textContent = 'Compiling locked fixtures…';
  try {
    const [correct, knownBad] = await Promise.all([
      compileUsartResponseSource(X23_USART_SOURCE, X23_USART_SUITE.artifactIdentity),
      compileUsartResponseSource(X23_USART_KNOWN_BAD_SOURCE, X23_USART_SUITE.knownBadArtifactIdentity),
    ]);
    const specs = [
      ['expected-A', 'expected', 'correct', correct, X23_USART_SUITE.expectedResponseByte],
      ['expected-B', 'expected', 'correct', correct, X23_USART_SUITE.expectedResponseByte],
      ['incorrect-A', 'incorrect', 'correct', correct, X23_USART_SUITE.incorrectResponseByte],
      ['incorrect-B', 'incorrect', 'correct', correct, X23_USART_SUITE.incorrectResponseByte],
      ['known-bad-incorrect', 'known-bad-incorrect', 'known-bad', knownBad, X23_USART_SUITE.incorrectResponseByte],
    ];
    const runs = [];
    for (const [label, mode, firmware, artifact, responseByte] of specs) {
      if (token !== usartResponseToken) throw Object.assign(new Error('X23_USART_RETIRED'), { code: 'X23_USART_RETIRED' });
      elements.usartresponsestate.textContent = `${label} · executing producer chain…`;
      runs.push(await executeUsartResponseRun({ label, mode, firmware, artifact, responseByte, token }));
    }
    const report = { schema: X23_USART_REPORT_SCHEMA, suiteId: X23_USART_SUITE_ID,
      recipe: await createX23UsartRecipe(), runs,
      repeatHashes: { expected: await x23UsartSha256(x23UsartRunProjection(runs[0])),
        incorrect: await x23UsartSha256(x23UsartRunProjection(runs[2])) },
      limits: structuredClone(X23_USART_SUITE.limits), semanticSha256: '' };
    report.semanticSha256 = await x23UsartSha256(semanticX23UsartProjection(report));
    usartResponseReport = await validateX23UsartReport(report);
    renderUsartResponseReport(usartResponseReport);
    elements.usartresponsesummary.textContent = `Actual firmware TX → fixture match → scheduled RX → accepted request → RX complete → D13/Serial consumption passed in two fresh repeats per correct mode. Known-bad acceptance failed academically while its job completed. Report ${report.semanticSha256}.`;
    applyMeasurementPresentation(report, elements.usartresponseresults,
      elements.usartresponsestate, elements.usartresponsesummary);
    return structuredClone(usartResponseReport);
  } catch (error) {
    if (token === usartResponseToken) {
      usartResponseReport = null; renderUsartResponseReport(null);
      elements.usartresponsestate.textContent = `Stopped · ${error.code ?? error.message}`;
      elements.usartresponsesummary.textContent = 'Validation or infrastructure stopped the check. No academic pass or export was created.';
    }
    throw error;
  } finally {
    if (token === usartResponseToken) { usartResponseRunning = false; elements.usartresponserun.disabled = false; }
  }
}

async function exportUsartResponseReport() {
  if (!usartResponseReport || !x23UsartReportPassed(usartResponseReport)) return;
  await downloadMeasurementReport(usartResponseReport,
    `x23-usart-response-${usartResponseReport.semanticSha256.slice(0, 12)}.intent-mcu-x23.json`);
}

function failureReplayWorkerChannel(worker, runtimeBinding, token) {
  const queued = []; const waiting = []; let nonce = null; let fault = null;
  const fail = (error) => {
    fault = error;
    for (const entry of waiting.splice(0)) { clearTimeout(entry.timer); entry.reject(error); }
  };
  const onMessage = ({ data }) => {
    if (token !== failureReplayToken) return;
    try {
      const identity = validateWorkerRuntimeIdentity(data.runtimeIdentity, runtimeBinding, nonce);
      nonce ??= identity.workerInstanceNonce;
      const index = waiting.findIndex((entry) => entry.accept(data));
      if (index >= 0) {
        const [entry] = waiting.splice(index, 1); clearTimeout(entry.timer); entry.resolve(structuredClone(data));
      } else queued.push(structuredClone(data));
    } catch (error) { fail(error); }
  };
  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', (event) => fail(Object.assign(new Error(event.message), {
    code: 'X36_REPLAY_WORKER_UNAVAILABLE',
  })));
  return {
    get nonce() { return nonce; },
    next(accept, timeoutMilliseconds = 30_000) {
      if (fault) return Promise.reject(fault);
      const index = queued.findIndex(accept);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const entry = { accept, resolve, reject, timer: null };
        entry.timer = setTimeout(() => {
          const waitingIndex = waiting.indexOf(entry); if (waitingIndex >= 0) waiting.splice(waitingIndex, 1);
          reject(Object.assign(new Error('X36_REPLAY_WORKER_TIMEOUT'), { code: 'X36_REPLAY_WORKER_TIMEOUT' }));
        }, timeoutMilliseconds);
        waiting.push(entry);
      });
    },
    close(code) {
      fail(Object.assign(new Error(code), { code }));
      worker.removeEventListener('message', onMessage);
    },
  };
}

function x36AnchorFromMessage(message) {
  const d13 = message.pins?.find((pin) => pin.pin === 'D13');
  return { instructionOrdinal: message.instructions, cycle: message.cycle, pc: message.pc,
    paused: message.paused, d13: { mode: d13?.mode, level: d13?.level },
    retentionDrops: structuredClone(message.retentionDrops),
    pendingInputs: message.eventLog?.pending?.length ?? -1 };
}

function exactX36Anchor(anchor) {
  return JSON.stringify(anchor) === JSON.stringify(X36_REPLAY_SUITE.anchor);
}

async function compileFailureReplayFixture() {
  const response = await fetch('/api/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
    body: JSON.stringify({ schema: 'teach-lab-build-request@1', board: AVR_PROFILE,
      files: [{ name: 'main.ino', content: X32_FAULT_SOURCE }] }),
  });
  const submitted = await response.json();
  if (!response.ok) throw Object.assign(new Error(submitted.code ?? 'X36_BUILD_REJECTED'), { code: submitted.code });
  while (true) {
    const statusResponse = await fetch(`/api/build/${submitted.jobId}`, {
      headers: { Authorization: `Bearer ${submitted.capability}` }, cache: 'no-store',
    });
    const status = await statusResponse.json();
    if (!statusResponse.ok) throw Object.assign(new Error(status.code ?? 'X36_BUILD_STATUS'), { code: status.code });
    if (status.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    if (status.status !== 'succeeded') {
      const code = status.error ?? status.result?.code ?? `X36_BUILD_${status.status.toUpperCase()}`;
      throw Object.assign(new Error(code), { code });
    }
    return status.result;
  }
}

async function openFailureReplayWorker({ artifact, repeat, token }) {
  const runtimeBinding = { schema: RUNTIME_BINDING_SCHEMA,
    projectGeneration: Math.max(1, lifecycle.projectGeneration),
    runtimeGeneration: ++failureReplayGeneration, artifactIdentity: artifact.artifactIdentity };
  const worker = new Worker('./simulator.worker.js', { type: 'module' });
  const channel = failureReplayWorkerChannel(worker, runtimeBinding, token);
  const entry = { repeat, worker, channel, runtimeBinding, runtimeIdentity: null, anchor: null };
  failureReplaySession.workers.push(entry);
  worker.postMessage({ command: 'init', hex: artifact.artifact.hex, circuit: DEFAULT_CIRCUIT,
    runtimeBinding, instruments: { logicChannels: ['D13', 'D2'], selectedPin: 'D13', serialHistoryLimit: 512 } });
  const ready = await channel.next((message) => message.kind === 'ready');
  entry.runtimeIdentity = structuredClone(ready.runtimeIdentity);
  worker.postMessage({ command: 'reset' });
  await channel.next((message) => message.kind === 'reset');
  let anchorMessage = null;
  for (let ordinal = 1; ordinal <= X36_REPLAY_SUITE.anchor.instructionOrdinal; ordinal += 1) {
    worker.postMessage({ command: 'step' });
    const message = await channel.next((candidate) => candidate.kind === 'stepped' || candidate.kind === 'error');
    if (message.kind !== 'stepped') throw Object.assign(new Error('X36_REPLAY_EARLY_FAULT'), { code: 'X36_REPLAY_EARLY_FAULT' });
    anchorMessage = message;
  }
  worker.postMessage({ command: 'sample' });
  const sample = await channel.next((message) => message.kind === 'sample');
  const anchor = x36AnchorFromMessage(sample);
  if (!anchorMessage || anchorMessage.cycle !== sample.cycle || anchorMessage.pc !== sample.pc
      || !exactX36Anchor(anchor)) {
    throw Object.assign(new Error('X36_REPLAY_ANCHOR_AMBIGUOUS'), { code: 'X36_REPLAY_ANCHOR_AMBIGUOUS' });
  }
  entry.anchor = anchor;
  return entry;
}

function appendFailureReplayCard(title, phase, facts) {
  const card = document.createElement('section'); card.className = 'failure-replay-card'; card.dataset.phase = phase;
  const heading = document.createElement('h4'); heading.textContent = title;
  const list = document.createElement('dl');
  for (const [label, value] of facts) {
    const term = document.createElement('dt'); term.textContent = label;
    const detail = document.createElement('dd'); detail.textContent = value;
    list.append(term, detail);
  }
  card.append(heading, list); elements.failurereplayresults.append(card);
}

function renderFailureReplay(report = failureReplayReport) {
  elements.failurereplayresults.replaceChildren();
  const session = failureReplaySession;
  if (!report && session?.workers?.length === 2 && session.workers.every((entry) => entry.anchor)) {
    for (const entry of session.workers) appendFailureReplayCard(`Worker ${entry.repeat} · pre-failure`, 'anchor', [
      ['Execution', 'fresh reset replay'], ['Instruction', String(entry.anchor.instructionOrdinal)],
      ['Cycle / PC', `${entry.anchor.cycle} / ${entry.anchor.pc}`], ['D13', `${entry.anchor.d13.mode} · HIGH`],
      ['Worker nonce', entry.runtimeIdentity.workerInstanceNonce],
    ]);
    appendFailureReplayCard('Snapshot capability', 'snapshot', [
      ['Full snapshot', 'unavailable'], ['Omitted classes', String(X36_REPLAY_SUITE.snapshot.omittedStateClasses.length)],
      ['Next action', 'executes exactly one instruction'],
    ]);
    elements.failurereplaystate.textContent = 'Pre-failure open · paused 2/2';
    elements.failurereplayadvance.disabled = false; elements.failurereplayexport.disabled = true;
    return;
  }
  if (!report) {
    const text = document.createElement('p'); text.textContent = 'No replay point is open. Full snapshot unavailable.';
    elements.failurereplayresults.append(text); elements.failurereplaystate.textContent = 'Not opened';
    elements.failurereplayadvance.disabled = true; elements.failurereplayexport.disabled = true; return;
  }
  const first = report.repeats[0];
  appendFailureReplayCard('Pre-failure observation', 'anchor', [
    ['Replay', 'fresh reset → paused'], ['Instruction', String(first.anchor.instructionOrdinal)],
    ['Cycle / PC', `${first.anchor.cycle} / ${first.anchor.pc}`], ['D13', 'OUTPUT · HIGH'],
  ]);
  appendFailureReplayCard('One-step fault', 'fault', [
    ['Executed', 'one instruction'], ['SPI write', `0x${first.fault.address.toString(16)} ← 0x${first.fault.value.toString(16)}`],
    ['Producer / stop', `${first.fault.producerCycle} / ${first.fault.stoppedCycle}`],
    ['Disposition', `${report.classifications.execution.status} · academic unsupported`],
  ]);
  appendFailureReplayCard('Snapshot capability', 'snapshot', [
    ['Full snapshot', 'unavailable'], ['Replay type', 'deterministic reset re-execution'],
    ['Omitted classes', String(report.snapshot.omittedStateClasses.length)], ['Post-fault records', '0 accepted'],
  ]);
  elements.failurereplaystate.textContent = 'Exact fault reproduced · 2/2';
  elements.failurereplayadvance.disabled = true;
  elements.failurereplayexport.disabled = !x36ReplayReportPassed(report);
  applyMeasurementPresentation(report, elements.failurereplayresults,
    elements.failurereplaystate, elements.failurereplaysummary);
}

async function openFailureReplayPoint() {
  invalidateFailureReplayReport('Opening a fresh isolated replay; prior workers and export authority were retired.');
  const token = ++failureReplayToken;
  failureReplayRunning = true; elements.failurereplayopen.disabled = true;
  elements.failurereplaystate.textContent = failureReplayArtifact
    ? 'Binding verified fixed X32 artifact…' : 'Compiling fixed X32 fixture…';
  try {
    const artifact = failureReplayArtifact ?? await compileFailureReplayFixture();
    failureReplayArtifact ??= structuredClone(artifact);
    if (token !== failureReplayToken) throw Object.assign(new Error('X36_REPLAY_RETIRED'), { code: 'X36_REPLAY_RETIRED' });
    const recipe = await createX36ReplayRecipe(artifact.artifactIdentity);
    failureReplaySession = { token, artifact, recipe, workers: [], phase: 'opening' };
    for (const repeat of ['A', 'B']) {
      elements.failurereplaystate.textContent = `Worker ${repeat} · executing reset-to-anchor…`;
      await openFailureReplayWorker({ artifact, repeat, token });
    }
    if (token !== failureReplayToken) throw Object.assign(new Error('X36_REPLAY_RETIRED'), { code: 'X36_REPLAY_RETIRED' });
    const hashes = await Promise.all(failureReplaySession.workers.map((entry) => x36Sha256(entry.anchor)));
    if (hashes[0] !== hashes[1]) throw Object.assign(new Error('X36_REPLAY_ANCHOR_MISMATCH'), { code: 'X36_REPLAY_ANCHOR_MISMATCH' });
    failureReplaySession.phase = 'anchor-open'; renderFailureReplay(null);
    elements.failurereplaysummary.textContent = 'Two fresh isolated workers are paused at the exact pre-failure point. Full snapshot unavailable; Advance executes one instruction in both.';
    return failureReplaySession.workers.map((entry) => ({ repeat: entry.repeat,
      runtimeBinding: structuredClone(entry.runtimeBinding), runtimeIdentity: structuredClone(entry.runtimeIdentity),
      anchor: structuredClone(entry.anchor) }));
  } catch (error) {
    if (token === failureReplayToken) {
      retireFailureReplayWorkers(); renderFailureReplay(null);
      elements.failurereplaystate.textContent = `Stopped · ${error.code ?? error.message}`;
      elements.failurereplaysummary.textContent = 'Infrastructure or validation stopped the replay before any academic disposition or export was created.';
    }
    throw error;
  } finally {
    if (token === failureReplayToken) { failureReplayRunning = false; elements.failurereplayopen.disabled = false; }
  }
}

async function advanceFailureReplayInstruction() {
  const session = failureReplaySession;
  if (!session || session.phase !== 'anchor-open' || session.token !== failureReplayToken) {
    throw Object.assign(new Error('X36_REPLAY_ANCHOR_NOT_OPEN'), { code: 'X36_REPLAY_ANCHOR_NOT_OPEN' });
  }
  const token = session.token; failureReplayRunning = true;
  elements.failurereplayadvance.disabled = true; elements.failurereplayopen.disabled = true;
  elements.failurereplaystate.textContent = 'Executing exactly one instruction in 2 workers…';
  try {
    const repeats = [];
    for (const entry of session.workers) {
      entry.worker.postMessage({ command: 'step' });
      const message = await entry.channel.next((candidate) => candidate.kind === 'error');
      if (token !== failureReplayToken) throw Object.assign(new Error('X36_REPLAY_RETIRED'), { code: 'X36_REPLAY_RETIRED' });
      const access = message.unsupported?.at(-1);
      repeats.push({ repeat: entry.repeat, runtimeBinding: structuredClone(entry.runtimeBinding),
        runtimeIdentity: structuredClone(entry.runtimeIdentity), anchor: structuredClone(entry.anchor),
        fault: { operation: 'write', peripheral: access?.peripheral, address: access?.address,
          value: access?.value, producerCycle: access?.cycle, instructionOrdinal: message.instructions,
          stoppedCycle: message.cycle, paused: message.paused, code: 'RUNTIME_CAPABILITY_UNSUPPORTED',
          postFaultAcceptedRecords: 0 } });
    }
    const report = { schema: X36_REPLAY_REPORT_SCHEMA, suiteId: X36_SUITE_ID,
      recipe: structuredClone(session.recipe), repeats,
      repeatSemanticSha256: await x36Sha256(x36RepeatProjection(repeats[0])),
      classifications: {
        execution: { status: 'stopped-unsupported', academicStatus: 'unsupported', code: 'RUNTIME_CAPABILITY_UNSUPPORTED' },
        validation: { status: 'accepted', code: 'X36_REPLAY_EXACT' },
        infrastructure: { status: 'available', code: 'X36_TWO_WORKERS_RESPONDED' },
      }, snapshot: structuredClone(X36_REPLAY_SUITE.snapshot), limits: structuredClone(X36_REPLAY_SUITE.limits),
      semanticSha256: '' };
    report.semanticSha256 = await x36Sha256(semanticX36Projection(report));
    failureReplayReport = await validateX36ReplayReport(report);
    retireFailureReplayWorkers(); renderFailureReplay(failureReplayReport);
    failureReplayRunning = false; elements.failurereplayopen.disabled = false;
    elements.failurereplaysummary.textContent = `Exact one-step SPI capability stop reproduced in two fresh workers. Academic disposition is unsupported; infrastructure and validation are separately accepted. Report ${failureReplayReport.semanticSha256}.`;
    applyMeasurementPresentation(failureReplayReport, elements.failurereplayresults,
      elements.failurereplaystate, elements.failurereplaysummary);
    return structuredClone(failureReplayReport);
  } catch (error) {
    if (token === failureReplayToken) {
      failureReplayReport = null; retireFailureReplayWorkers(); renderFailureReplay(null);
      failureReplayRunning = false; elements.failurereplayopen.disabled = false;
      elements.failurereplaystate.textContent = `Stopped · ${error.code ?? error.message}`;
      elements.failurereplaysummary.textContent = 'Infrastructure or validation failed. No academic replay report or export was created.';
    }
    throw error;
  } finally {
    if (token === failureReplayToken) { failureReplayRunning = false; elements.failurereplayopen.disabled = false; }
  }
}

async function exportFailureReplayReport() {
  if (!failureReplayReport || !x36ReplayReportPassed(failureReplayReport)) return;
  await downloadMeasurementReport(failureReplayReport,
    `x36-failure-replay-${failureReplayReport.semanticSha256.slice(0, 12)}.intent-mcu-x36.json`);
}

async function selectRegressionProfile(profile) {
  if (selectedCompilerProfile === profile) return;
  elements.boardselect.value = profile;
  elements.boardselect.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (selectedCompilerProfile !== profile) throw Object.assign(new Error('REGRESSION_PROFILE_ACTIVATION_FAILED'), { code: 'REGRESSION_PROFILE_ACTIVATION_FAILED' });
}

function fixtureSource(cell, fixture) {
  return cell.profile === AVR_PROFILE
    ? fixture.project.source.files.find((file) => file.name === 'main.ino')?.content ?? ''
    : fixture.source;
}

async function verifiedRegressionFixture(cell) {
  const fixture = regressionFixture(cell.caseId);
  const [fixtureSha256, sourceSha256] = await Promise.all([
    sha256Text(JSON.stringify(fixture)), sha256Text(fixtureSource(cell, fixture)),
  ]);
  if (fixtureSha256 !== cell.fixtureSha256) throw Object.assign(new Error('REGRESSION_MATRIX_FIXTURE_HASH_STALE'), { code: 'REGRESSION_MATRIX_FIXTURE_HASH_STALE' });
  if (sourceSha256 !== cell.sourceSha256) throw Object.assign(new Error('REGRESSION_MATRIX_SOURCE_HASH_STALE'), { code: 'REGRESSION_MATRIX_SOURCE_HASH_STALE' });
  return fixture;
}

async function executeAvrRegressionCell(cell, fixture, started) {
  const loaded = loadExampleProject(cell.fixtureId, 'x26.regression-matrix');
  // Candidate-v3 owns the canonical envelope while the established AVR editor
  // exposes a normalized working projection. Bind the accepted load result to
  // the already checksum-verified envelope instead of comparing unlike views.
  if (!loaded.ok || JSON.stringify(loaded.example?.project) !== JSON.stringify(fixture)) {
    throw Object.assign(new Error('REGRESSION_AVR_FIXTURE_INSTALL'), { code: 'REGRESSION_AVR_FIXTURE_INSTALL' });
  }
  await build();
  if (window.__M6_STATE__.buildState !== 'succeeded' || !lifecycle.artifact?.artifactIdentity) {
    throw Object.assign(new Error('REGRESSION_AVR_BUILD_FAILED'), { code: 'REGRESSION_AVR_BUILD_FAILED' });
  }
  const artifactSha256 = lifecycle.artifact.artifactIdentity;
  const results = await new Promise((resolve, reject) => {
    authoredExperimentWaiter = { resolve, reject };
    const run = startAuthoredScenarioExperiment();
    if (!run.ok) { authoredExperimentWaiter = null; reject(Object.assign(new Error(run.code), { code: run.code })); }
  });
  const equality = results.find((item) => item.scenarioId === 'THERM-SCENARIO-EQUALITY-ENABLED');
  const actual = {
    kind: 'avr.thermostat-summary', scenariosPassed: results.filter((item) => item.status === 'passed').length,
    scenariosTotal: results.length, equalityD13: equality?.observed?.level ?? null,
  };
  const rawVirtualTime = { timebase: 'avr-worker-virtual-milliseconds', values: results.map((item) => item.virtualMilliseconds) };
  stopRuntime('X26 AVR cell completed; report retained as review data only.');
  return { artifactSha256, actual, rawVirtualTime, durationMilliseconds: performance.now() - started,
    coveragePartitions: results.map((item) => ({ partitionId: item.scenarioId,
      complete: item.status === 'passed' || item.status === 'failed', passed: item.status === 'passed', observed: item.observed })) };
}

async function executePicoRegressionCell(cell, fixture, started) {
  picoPublicWorkbench.installPreparedProject(fixture, 'X26 fixture installed; fresh Build required.');
  const built = await picoPublicWorkbench.build();
  if (!built.ok || built.artifact.sourceSha256 !== cell.sourceSha256) throw Object.assign(new Error(built.code), { code: built.code });
  const run = await picoPublicWorkbench.run();
  if (!run.ok) throw Object.assign(new Error(run.code), { code: run.code });
  const state = await waitForMatrixState(() => picoPublicWorkbench.snapshot(),
    (value) => value.runtime?.instruments?.serial?.text?.includes('PICO PUBLIC'), 'REGRESSION_PICO_RUNTIME_TIMEOUT');
  const runtime = state.runtime;
  const actual = { kind: 'rp2040.gpio-uart', gpio0: runtime.experimental.gpio0.level,
    uartText: runtime.instruments.serial.text.trim() };
  const rawVirtualTime = { timebase: 'rp2040js-worker-cycles-and-virtual-nanoseconds',
    values: { cycle: runtime.cycle, trace: runtime.trace.map((item) => ({ cycle: item.cycle, virtualNanos: item.virtualNanos })) } };
  picoPublicWorkbench.stop();
  return { artifactSha256: built.artifact.uf2Sha256, actual, rawVirtualTime,
    durationMilliseconds: performance.now() - started,
    coveragePartitions: [{ partitionId: cell.scenarioId, complete: true, passed: true, observed: actual }] };
}

async function executeC3RegressionCell(cell, fixture, started) {
  c3PublicWorkbench.installPreparedProject(fixture, 'X26 fixture installed; fresh Build required.');
  const built = await executeC3ManualAction('firmware.build',
    (permit) => c3PublicWorkbench.build({ advancePermit: permit }));
  if (!built.ok || built.artifact.sourceSha256 !== cell.sourceSha256) throw Object.assign(new Error(built.code), { code: built.code });
  const run = await executeC3ManualAction('runtime.run',
    (permit, binding) => c3PublicWorkbench.run({ advancePermit: permit, x92Binding: binding }));
  if (!run.ok) throw Object.assign(new Error(run.code), { code: run.code });
  const runtime = run.runtime;
  const actual = {
    kind: 'esp32c3.qemu-uart-plus-gpio2-model',
    qemuMarker: runtime.uart.bootEpochs[0]?.marker ?? null,
    qemuBootEpochs: runtime.uart.bootEpochs.length,
    qemuPinStateObserved: runtime.gpio.qemuPinStateObserved,
    modeledLedCode: runtime.modeledCircuit.epochs.at(-1)?.led?.code ?? null,
  };
  const rawVirtualTime = { timebase: 'qemu-boot-epochs-and-project-model-epochs-kept-separate',
    values: { qemuBootEpochs: runtime.uart.bootEpochs.map((epoch, index) => ({ index: index + 1, marker: epoch.marker })),
      projectModelEpochs: runtime.modeledCircuit.epochs.map((epoch, index) => ({ index: index + 1, source: epoch.source ?? 'executed-register-write' })) } };
  await c3PublicWorkbench.dispose('X26 C3 cell completed; report retained as review data only.');
  return { artifactSha256: built.artifact.flashSha256, actual, rawVirtualTime,
    durationMilliseconds: performance.now() - started,
    coveragePartitions: [{ partitionId: cell.scenarioId, complete: true, passed: true, observed: actual }] };
}

async function executeStm32RegressionCell(cell, fixture, started) {
  stm32PublicWorkbench.installPreparedProject(fixture, 'X26 fixture installed; fresh Build required.');
  const built = await stm32PublicWorkbench.build();
  if (!built.ok || built.artifact.sourceSha256 !== cell.sourceSha256) throw Object.assign(new Error(built.code), { code: built.code });
  const run = await stm32PublicWorkbench.run(false);
  if (!run.ok) throw Object.assign(new Error(run.code), { code: run.code });
  const runtime = run.result;
  const actual = { kind: 'stm32.renode-pb0-usart3', pb0: runtime.observed.pb0,
    uartText: runtime.observed.uartText, bootEpochs: runtime.bootEpochs };
  const rawVirtualTime = { timebase: 'renode-result-without-invented-cycle-axis',
    values: { bootEpochs: runtime.bootEpochs, timedWaveformAvailable: false } };
  stm32PublicWorkbench.stop('X26 STM32 cell completed; report retained as review data only.');
  return { artifactSha256: built.artifact.sha256, actual, rawVirtualTime,
    durationMilliseconds: performance.now() - started,
    coveragePartitions: [{ partitionId: cell.scenarioId, complete: true, passed: true, observed: actual }] };
}

async function executeBrowserRegressionCell(cell) {
  const started = performance.now();
  await selectRegressionProfile(cell.profile);
  const fixture = await verifiedRegressionFixture(cell);
  let result;
  if (cell.profile === AVR_PROFILE) result = await executeAvrRegressionCell(cell, fixture, started);
  else if (cell.profile === RP2040_PROFILE) result = await executePicoRegressionCell(cell, fixture, started);
  else if (cell.profile === ESP32C3_PROFILE) result = await executeC3RegressionCell(cell, fixture, started);
  else if (cell.profile === STM32F429ZI_PROFILE) result = await executeStm32RegressionCell(cell, fixture, started);
  else throw Object.assign(new Error('REGRESSION_PROFILE_UNSUPPORTED'), { code: 'REGRESSION_PROFILE_UNSUPPORTED' });
  const execution = {
    caseId: cell.caseId, profile: cell.profile, profileVersion: cell.profileVersion,
    fixtureSha256: cell.fixtureSha256, sourceSha256: cell.sourceSha256,
    artifactSha256: result.artifactSha256, producer: cell.observationOwner,
    actual: result.actual, rawVirtualTime: result.rawVirtualTime,
    durationMilliseconds: result.durationMilliseconds,
  };
  regressionPartitionEvidence.push(await createPartitionEvidence(execution, result.coveragePartitions));
  return execution;
}

async function runBrowserRegressionMatrix(selector = 'all', expectationOverride = null) {
  if (regressionMatrixRunning) throw Object.assign(new Error('REGRESSION_MATRIX_BUSY'), { code: 'REGRESSION_MATRIX_BUSY' });
  regressionMatrixRunning = true;
  coverageReport = null;
  regressionPartitionEvidence = [];
  renderCoverageReport(null);
  for (const control of [elements.regressionmatrixselector, elements.regressionmatrixrun,
    elements.regressionmatrixnegative]) control.disabled = true;
  elements.regressionmatrixstate.textContent = 'Running fresh builds…';
  elements.regressionmatrixsummary.textContent = 'Each selected cell is executing sequentially through its existing compiler and runtime.';
  try {
    regressionMatrixReport = await executeRegressionMatrix({
      selector, expectationOverride, executeCell: executeBrowserRegressionCell,
    });
    coverageReport = await projectCoverageReport({
      regressionReport: regressionMatrixReport, partitionEvidence: regressionPartitionEvidence,
    });
    renderRegressionMatrixReport(regressionMatrixReport);
    renderCoverageReport(coverageReport);
    return structuredClone(regressionMatrixReport);
  } finally {
    regressionMatrixRunning = false;
    for (const control of [elements.regressionmatrixselector, elements.regressionmatrixrun,
      elements.regressionmatrixnegative]) control.disabled = false;
  }
}

async function runWrongRegressionExpectation(selector = 'X26-RP2040-GPIO0-UART0') {
  const caseId = selector === 'all' ? 'X26-RP2040-GPIO0-UART0' : selector;
  if (caseId !== 'X26-RP2040-GPIO0-UART0') throw Object.assign(new Error('REGRESSION_NEGATIVE_CELL_FIXED'), { code: 'REGRESSION_NEGATIVE_CELL_FIXED' });
  const override = await createExpectationOverride(caseId, {
    kind: 'rp2040.gpio-uart', gpio0: false, uartText: 'PICO PUBLIC',
  });
  return runBrowserRegressionMatrix(caseId, override);
}

async function exportRegressionMatrixReport() {
  if (!regressionMatrixReport) return;
  await downloadMeasurementReport(regressionMatrixReport,
    `${regressionMatrixReport.matrixId}-${regressionMatrixReport.semanticSha256.slice(0, 12)}.intent-mcu-regression.json`);
}

async function exportCoverageReport() {
  if (!coverageReport) return;
  await downloadMeasurementReport(coverageReport,
    `x27-coverage-${coverageReport.semanticSha256.slice(0, 12)}.intent-mcu-coverage.json`);
}

elements.regressionmatrixrun.addEventListener('click', () => {
  void runBrowserRegressionMatrix(elements.regressionmatrixselector.value);
});
elements.regressionmatrixnegative.addEventListener('click', () => { void runWrongRegressionExpectation(); });
elements.regressionmatrixexport.addEventListener('click', exportRegressionMatrixReport);
elements.checkableevidenceopen.addEventListener('click', () => {
  elements.checkableevidenceopeninput.value = '';
  elements.checkableevidenceopeninput.click();
});
elements.checkableevidenceopeninput.addEventListener('change', () => {
  const [file] = elements.checkableevidenceopeninput.files;
  if (file) void openCheckableEvidencePackage(file);
});
elements.checkableevidencedownload.addEventListener('click', () => { void downloadCheckableEvidenceReport(); });
elements.versionregressionload.addEventListener('click', () => { void loadReviewedVersionRegression(); });
elements.versionregressionnegative.addEventListener('click', () => { void rejectSyntheticVersionMutation(); });
elements.versionregressionexport.addEventListener('click', exportVersionRegressionReport);
elements.coveragereportexport.addEventListener('click', exportCoverageReport);
elements.longdurationrun.addEventListener('click', () => { void runBrowserLongDurationSuite(); });
elements.longdurationexport.addEventListener('click', exportLongDurationReport);
elements.timeinvariancerun.addEventListener('click', () => { void runBrowserTimeInvarianceSuite(); });
elements.timeinvarianceexport.addEventListener('click', exportTimeInvarianceReport);
elements.eventorderrun.addEventListener('click', () => { void runBrowserEventOrderSuite(); });
elements.eventorderexport.addEventListener('click', exportEventOrderReport);
elements.resetclassrun.addEventListener('click', () => { void runBrowserResetClassSuite(); });
elements.resetclassexport.addEventListener('click', exportResetClassReport);
elements.unsupportedaccessrun.addEventListener('click', () => { void runBrowserUnsupportedAccessSuite(); });
elements.unsupportedaccessexport.addEventListener('click', exportUnsupportedAccessReport);
elements.digitalstaterun.addEventListener('click', () => { void runBrowserDigitalStateSuite(); });
elements.digitalstateexport.addEventListener('click', exportDigitalStateReport);
elements.digitalstateruntimerun.addEventListener('click', () => { void runBrowserDigitalStateRuntimeSuite(); });
elements.digitalstateruntimeexport.addEventListener('click', exportDigitalStateRuntimeReport);
elements.precisioncheckrun.addEventListener('click', () => { void runBrowserPrecisionCheck(); });
elements.precisioncheckexport.addEventListener('click', exportPrecisionCheckReport);
elements.causalchainrun.addEventListener('click', () => { void runBrowserCausalChain(); });
elements.causalchainexport.addEventListener('click', exportCausalChainReport);
elements.failurereplayopen.addEventListener('click', () => { void openFailureReplayPoint(); });
elements.failurereplayadvance.addEventListener('click', () => { void advanceFailureReplayInstruction(); });
elements.failurereplayexport.addEventListener('click', exportFailureReplayReport);
elements.usartresponserun.addEventListener('click', () => { void runUsartResponseSuite(); });
elements.usartresponseexport.addEventListener('click', exportUsartResponseReport);
for (const input of [elements.source, elements.picosource, elements.c3source, elements.stm32source,
  elements.projectopeninput, elements.picoopeninput, elements.c3openinput, elements.stm32openinput,
  elements.boardselect]) {
  input.addEventListener(input.type === 'file' ? 'change' : 'input', () => invalidateRegressionMatrixReport());
}
document.addEventListener('pointerup', (event) => {
  if (!regressionMatrixRunning && event.target.closest?.('.circuit-canvas,.shared-circuit-editor')) {
    invalidateRegressionMatrixReport('Circuit geometry or topology changed. Run the matrix again for current evidence.');
  }
});

window.__X26_REGRESSION_MATRIX__ = Object.freeze({
  get ready() { return regressionMatrixReady; },
  matrix: () => structuredClone(X26_REGRESSION_MATRIX),
  report: () => regressionMatrixReport ? structuredClone(regressionMatrixReport) : null,
  run: (selector = 'all') => runBrowserRegressionMatrix(selector),
  runWrongExpectation: (selector = 'X26-RP2040-GPIO0-UART0') => runWrongRegressionExpectation(selector),
  passed: () => regressionMatrixReport ? regressionReportPassed(regressionMatrixReport) : false,
});
window.__X26_VERSION_REGRESSION__ = Object.freeze({
  get ready() { return versionRegressionReady; },
  report: () => versionRegressionReport ? structuredClone(versionRegressionReport) : null,
  loadReviewed: () => loadReviewedVersionRegression(),
  syntheticNegative: () => rejectSyntheticVersionMutation(),
  passed: () => versionRegressionReport ? x26VersionReportPassed(versionRegressionReport) : false,
  activeWorkers: () => 0,
  retire: () => invalidateVersionRegressionReport('Worker retirement cleared active comparison review authority.'),
  clear: (reason = 'Comparison review authority cleared.') => invalidateVersionRegressionReport(reason),
});
window.__X27_COVERAGE_REPORT__ = Object.freeze({
  get ready() { return regressionMatrixReady; },
  report: () => coverageReport ? structuredClone(coverageReport) : null,
  run: async (selector = 'all') => { await runBrowserRegressionMatrix(selector); return structuredClone(coverageReport); },
  runWrongExpectation: async () => { await runWrongRegressionExpectation(); return structuredClone(coverageReport); },
  clear: () => invalidateRegressionMatrixReport('Coverage cleared. Run the matrix again for current evidence.'),
});
window.__X28_LONG_DURATION__ = Object.freeze({
  get ready() { return longDurationReady; },
  suite: () => structuredClone(X28_LONG_DURATION_SUITE),
  report: () => longDurationReport ? structuredClone(longDurationReport) : null,
  run: () => runBrowserLongDurationSuite(),
  passed: () => longDurationReport ? longDurationReportPassed(longDurationReport) : false,
  clear: (reason = 'X28 report cleared. Run the suite again for current evidence.') => invalidateLongDurationReport(reason),
});
window.__X29_TIME_INVARIANCE__ = Object.freeze({
  get ready() { return timeInvarianceReady; },
  suite: () => structuredClone(X29_TIME_SUITE),
  report: () => timeInvarianceReport ? structuredClone(timeInvarianceReport) : null,
  run: () => runBrowserTimeInvarianceSuite(),
  passed: () => timeInvarianceReport ? timeReportPassed(timeInvarianceReport) : false,
  clear: (reason = 'X29 report cleared. Run the suite again for current evidence.') => invalidateTimeInvarianceReport(reason),
});
window.__X30_EVENT_ORDER__ = Object.freeze({
  get ready() { return eventOrderReady; },
  suite: () => structuredClone(X30_EVENT_ORDER_SUITE),
  report: () => eventOrderReport ? structuredClone(eventOrderReport) : null,
  run: () => runBrowserEventOrderSuite(),
  passed: () => eventOrderReport ? eventOrderReportPassed(eventOrderReport) : false,
  clear: (reason = 'X30 report cleared. Run the suite again for current evidence.') => invalidateEventOrderReport(reason),
});
window.__X31_RESET_CLASSES__ = Object.freeze({
  get ready() { return resetClassReady; },
  suite: () => structuredClone(X31_RESET_CLASS_SUITE),
  report: () => resetClassReport ? structuredClone(resetClassReport) : null,
  run: () => runBrowserResetClassSuite(),
  passed: () => resetClassReport ? resetClassReportPassed(resetClassReport) : false,
  clear: (reason = 'X31 report cleared. Run the suite again for current evidence.') => invalidateResetClassReport(reason),
});
window.__X32_UNSUPPORTED_ACCESS__ = Object.freeze({
  get ready() { return unsupportedAccessReady; },
  suite: () => structuredClone(X32_UNSUPPORTED_ACCESS_SUITE),
  report: () => unsupportedAccessReport ? structuredClone(unsupportedAccessReport) : null,
  run: () => runBrowserUnsupportedAccessSuite(),
  passed: () => unsupportedAccessReport ? unsupportedAccessReportPassed(unsupportedAccessReport) : false,
  clear: (reason = 'X32 report cleared. Run the suite again for current evidence.') => invalidateUnsupportedAccessReport(reason),
});
window.__X33_DIGITAL_STATE__ = Object.freeze({
  get ready() { return digitalStateReady; },
  suite: () => structuredClone(X33_DIGITAL_STATE_SUITE),
  report: () => digitalStateReport ? structuredClone(digitalStateReport) : null,
  run: () => runBrowserDigitalStateSuite(),
  passed: () => digitalStateReport ? digitalStateReportPassed(digitalStateReport) : false,
  clear: (reason = 'X33 report cleared. Run the static check again for current evidence.') => invalidateDigitalStateReport(reason),
});
window.__X33_RUNTIME_DIGITAL_STATE__ = Object.freeze({
  get ready() { return digitalStateRuntimeReady; },
  suite: () => structuredClone(X33_RUNTIME_SUITE),
  report: () => digitalStateRuntimeReport ? structuredClone(digitalStateRuntimeReport) : null,
  run: () => runBrowserDigitalStateRuntimeSuite(),
  passed: () => digitalStateRuntimeReport ? x33RuntimeReportPassed(digitalStateRuntimeReport) : false,
  clear: (reason = 'X33 runtime report cleared. Run the producer check again.') => invalidateDigitalStateRuntimeReport(reason),
});
window.__X34_PRECISION_CHECK__ = Object.freeze({
  get ready() { return precisionCheckReady; },
  suite: () => structuredClone(X34_PRECISION_SUITE),
  report: () => precisionCheckReport ? structuredClone(precisionCheckReport) : null,
  run: () => runBrowserPrecisionCheck(),
  passed: () => precisionCheckReport ? x34ReportPassed(precisionCheckReport) : false,
  clear: (reason = 'X34 report cleared. Run the instrumented check again for current evidence.') => invalidatePrecisionCheckReport(reason),
});
window.__X35_CAUSAL_CHAIN__ = Object.freeze({
  get ready() { return causalChainReady; },
  suite: () => structuredClone(X35_CAUSAL_SUITE),
  report: () => causalChainReport ? structuredClone(causalChainReport) : null,
  run: () => runBrowserCausalChain(),
  passed: () => causalChainReport ? x35ReportPassed(causalChainReport) : false,
  clear: (reason = 'X35 report cleared. Run the causal check again for current evidence.') => invalidateCausalChainReport(reason),
});
window.__X36_FAILURE_REPLAY__ = Object.freeze({
  get ready() { return failureReplayReady; },
  suite: () => structuredClone(X36_REPLAY_SUITE),
  phase: () => failureReplaySession?.phase ?? (failureReplayReport ? 'fault-open' : 'empty'),
  anchors: () => failureReplaySession?.workers?.map((entry) => structuredClone(entry.anchor)) ?? [],
  report: () => failureReplayReport ? structuredClone(failureReplayReport) : null,
  open: () => openFailureReplayPoint(),
  advance: () => advanceFailureReplayInstruction(),
  passed: () => failureReplayReport ? x36ReplayReportPassed(failureReplayReport) : false,
  retirements: () => failureReplayRetirements,
  activeWorkers: () => failureReplaySession?.workers?.length ?? 0,
  clear: (reason = 'X36 replay cleared. Open the replay point again for current evidence.') => invalidateFailureReplayReport(reason),
});
window.__X23_USART_RESPONSE__ = Object.freeze({
  get ready() { return usartResponseReady; },
  suite: () => structuredClone(X23_USART_SUITE),
  report: () => usartResponseReport ? structuredClone(usartResponseReport) : null,
  run: () => runUsartResponseSuite(),
  passed: () => usartResponseReport ? x23UsartReportPassed(usartResponseReport) : false,
  activeWorkers: () => usartResponseWorkers.length,
  clear: (reason = 'X23 USART0 report cleared. Run the suite again for current evidence.') => invalidateUsartResponseReport(reason),
});
void regressionMatrixIdentity().then((identity) => {
  elements.regressionmatrixidentity.textContent = `Immutable matrix SHA-256 ${identity} · four exact fixture/source hashes · four distinct oracles`;
  regressionMatrixReady = true;
});
void acceptedX26VersionReport().then((report) => {
  elements.versionregressionidentity.textContent = `Reviewed comparison ${report.semanticSha256} · rc.49 + rc.60 · matrix ${report.matrixSha256} · same pinned model/toolchain/runtime set`;
  versionRegressionReady = true;
});
void longDurationSuiteIdentity().then((identity) => {
  elements.longdurationidentity.textContent = `Immutable X28 suite SHA-256 ${identity} · exact source hashes · fixture-only timer0_millis seam`;
  longDurationReady = true;
});
void timeSuiteIdentity().then((identity) => {
  elements.timeinvarianceidentity.textContent = `Immutable X29 contract SHA-256 ${identity} · 16 MHz AVR producer time · wall diagnostics excluded`;
  timeInvarianceReady = true;
});
void eventOrderSuiteIdentity().then((identity) => {
  elements.eventorderidentity.textContent = `Immutable X30 contract SHA-256 ${identity} · paused AVR epoch · producer order only`;
  eventOrderReady = true;
});
void resetClassSuiteIdentity().then((identity) => {
  elements.resetclassidentity.textContent = `Immutable X31 contract SHA-256 ${identity} · three explicit AVR reset classes · fixed fixture memory diagnostic`;
  resetClassReady = true;
});
void unsupportedAccessSuiteIdentity().then((identity) => {
  elements.unsupportedaccessidentity.textContent = `Immutable X32 contract SHA-256 ${identity} · one compiled AVR SPI access · affected requirement cannot pass`;
  unsupportedAccessReady = true;
});
void digitalStateSuiteIdentity().then((identity) => {
  elements.digitalstateidentity.textContent = `Immutable X33 contract SHA-256 ${identity} · strict static synthetic AVR fixture · no firmware or runtime execution`;
  digitalStateReady = true;
});
void x33RuntimeSuiteIdentity().then((identity) => {
  elements.digitalstateruntimeidentity.textContent = `Immutable X33 runtime contract SHA-256 ${identity} · one fixed compiled artifact · two fresh bound workers`;
  digitalStateRuntimeReady = true;
});
void x34SuiteIdentity().then((identity) => {
  elements.precisioncheckidentity.textContent = `Immutable X34 contract SHA-256 ${identity} · private four-byte firmware mailbox · two fresh bound workers`;
  precisionCheckReady = true;
});
void x35SuiteIdentity().then((identity) => {
  elements.causalchainidentity.textContent = `Immutable X35 contract SHA-256 ${identity} · unmodified AVR artifact · one selected PORTB→D13 event`;
  causalChainReady = true;
});
void x36SuiteIdentity().then((identity) => {
  elements.failurereplayidentity.textContent = `Immutable X36 recipe SHA-256 ${identity} · fixed X32 artifact · reset origin · empty inputs · two fresh bound workers`;
  failureReplayReady = true;
});
void x23UsartSuiteIdentity().then((identity) => {
  elements.usartresponseidentity.textContent = `Immutable X23 USART0 recipe SHA-256 ${identity} · request 0x3f · expected 0x41 · incorrect 0x42 · 9600 8-N-1 · +20 cycles`;
  usartResponseReady = true;
});

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
  return editor.kind === 'candidate-project-v3'
    ? modelLibraryImplementationFor(AVR_PROFILE).candidateRuntimeInputs(editor) : [];
}
function selectedCandidateContactControl(componentId, key, value) {
  return modelLibraryImplementationFor(AVR_PROFILE)
    .candidateContactControl(editor, componentId, key, value);
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

let x48RuntimeActive = false;
let x48RuntimeAuthority = null;
let x48Operation = null;
let x48OperationEpoch = 0;
const x48EpochOwner = createX48OperationEpochOwner();
let x48OrdinaryControlState = null;
function x48Controls(active, epoch = null, restore = true) {
  const controls = [elements.build, elements.run, elements.pause, elements.step, elements.reset,
    elements.quickbuild, elements.quickrun, elements.quickpause, elements.quickreset,
    elements.projectnew, elements.projectdemo, elements.projectopen].filter(Boolean);
  if (active && !x48OrdinaryControlState) {
    x48OrdinaryControlState = { epoch, states: new Map(
      controls.map((control) => [control, control.disabled]),
    ) };
    for (const control of controls) { control.disabled = true; control.dataset.x48Excluded = 'true'; }
  } else if (!active && x48OrdinaryControlState && x48OrdinaryControlState.epoch === epoch) {
    for (const [control, disabled] of x48OrdinaryControlState.states) {
      if (restore) control.disabled = disabled;
      delete control.dataset.x48Excluded;
    }
    x48OrdinaryControlState = null;
  }
}
function x48Nonce() {
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function sameX48Value(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function x48OperationCurrent(operation = x48Operation) {
  if (!operation || operation.epoch !== x48OperationEpoch || operation.worker !== worker
      || operation.workerToken !== workerToken || selectedCompilerProfile !== X48_PROFILE
      || lifecycle.projectGeneration !== operation.authority.projectGeneration
      || lifecycle.runtimeGeneration !== operation.authority.runtimeGeneration
      || lifecycle.artifact?.buildGeneration !== operation.authority.buildGeneration
      || lifecycle.artifact?.artifactIdentity !== operation.authority.artifactIdentity
      || lifecycle.artifact?.inputIdentity !== operation.authority.inputIdentity
      || editor.revision !== operation.authority.sourceProjectRevision
      || modelLibraryLockFor(X48_PROFILE).implementationSha256
        !== operation.authority.modelImplementationSha256
      || JSON.stringify(currentProject().source.files) !== operation.sourceFilesJson
      || JSON.stringify(currentProject().circuit) !== operation.circuitJson
      || !sameX48Value(operation.authority, x48RuntimeAuthority)) return false;
  return sameRuntimeIdentity(window.__M6_STATE__.runtime?.runtimeIdentity, operation.runtimeIdentity);
}
function retireX48RoomLoop(reason, { command = null, restoreControls = false } = {}) {
  const operation = x48Operation;
  x48OperationEpoch += 1;
  x48Operation = null;
  x48RuntimeActive = false;
  x48EpochOwner.retire();
  if (!operation) return null;
  if (command && operation.worker === worker) {
    try { operation.worker.postMessage({ command }); } catch { /* worker already unavailable */ }
  }
  x48Controls(false, operation.epoch, restoreControls);
  const result = operation.result ? { ...structuredClone(operation.result), status: 'indeterminate', reason } : null;
  dispatchX48State({ kind: 'x48-indeterminate', message: reason, ...(result ? { result } : {}) });
  return operation;
}
function x48Eligibility() {
  const runtime = window.__M6_STATE__.runtime;
  const identity = runtime?.runtimeIdentity;
  if (selectedCompilerProfile !== X48_PROFILE) return { eligible: false, code: 'X48_PROFILE_UNAVAILABLE', message: 'Available only for the AVR thermostat.' };
  if (!thermostatProjectActive() || thermostatFirmwareVariant(currentProject()) !== 'correct') {
    return { eligible: false, code: 'X48_EXACT_THERMOSTAT_REQUIRED', message: 'Open the exact unedited Thermostat boundary test.' };
  }
  if (!thermostatRuntimeReady() || !identity || runtime.kind !== 'ready'
      || runtime.cycle !== 0 || runtime.paused !== true) {
    return { eligible: false, code: 'X48_FRESH_BUILD_REQUIRED', message: 'Make a fresh Build and do not press ordinary Run.' };
  }
  if (x48RuntimeActive || x48Operation) return { eligible: false, code: 'X48_OPERATION_ACTIVE', message: 'The ideal room loop is already running.' };
  if (!x48RuntimeAuthority) return { eligible: false, code: 'X48_AUTHORITY_UNAVAILABLE', message: 'Rebuild to bind source, graph and artifact authority.' };
  if (identity.artifactIdentity !== lifecycle.artifact?.artifactIdentity
      || identity.projectGeneration !== lifecycle.artifact?.projectGeneration
      || identity.runtimeGeneration !== lifecycle.runtimeBinding?.runtimeGeneration
      || identity.modelImplementationSha256 !== modelLibraryLockFor(X48_PROFILE).implementationSha256
      || identity.modelExecutionContextSha256 !== runtime.modelExecutionContextSha256
      || lifecycle.artifact?.inputIdentity !== window.__M6_STATE__.inputIdentity) {
    return { eligible: false, code: 'X48_BINDING_STALE', message: 'The current source, artifact, model and worker binding is incomplete or stale.' };
  }
  return { eligible: true, code: 'OK', message: 'Ready at cycle zero. Start uses this one current worker and no ordinary Run.' };
}
function x48Binding(operationNonce) {
  const identity = window.__M6_STATE__.runtime.runtimeIdentity;
  return createX48Binding(x48RuntimeAuthority, identity, operationNonce);
}
function dispatchX48State(detail) {
  document.dispatchEvent(new CustomEvent('x48-state', { detail: structuredClone(detail) }));
}
function startX48RoomLoop() {
  const eligible = x48Eligibility();
  if (!eligible.eligible) { dispatchX48State({ kind: 'x48-indeterminate', message: eligible.message }); return eligible; }
  const epoch = ++x48OperationEpoch;
  const operationNonce = x48Nonce();
  const binding = x48Binding(operationNonce);
  const epochTicket = x48EpochOwner.begin(binding);
  x48Operation = { epoch, operationNonce, binding, worker, workerToken,
    epochTicket,
    runtimeIdentity: structuredClone(window.__M6_STATE__.runtime.runtimeIdentity),
    authority: structuredClone(x48RuntimeAuthority), result: null,
    sourceFilesJson: JSON.stringify(currentProject().source.files),
    circuitJson: JSON.stringify(currentProject().circuit) };
  x48RuntimeActive = true; x48Controls(true, epoch);
  elements.workerstate.textContent = 'Plant running · ordinary runtime paused';
  worker.postMessage({ command: 'x48-run', binding });
  return { eligible: true, code: 'X48_START_POSTED' };
}
function cancelX48RoomLoop() {
  if (!x48RuntimeActive || !worker) return { ok: false, code: 'X48_OPERATION_UNAVAILABLE' };
  worker.postMessage({ command: 'x48-cancel' });
  return { ok: true, code: 'X48_CANCEL_POSTED' };
}
window.__X48_RUNTIME_BRIDGE__ = Object.freeze({
  eligibility: x48Eligibility,
  start: startX48RoomLoop,
  cancel: cancelX48RoomLoop,
  active: () => Boolean(x48Operation),
});
document.addEventListener('x48-start-request', startX48RoomLoop);
document.addEventListener('x48-cancel-request', cancelX48RoomLoop);
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
  counterexampleReductionResult = null;
  persistProject();
  elements.scenarioeditormessage.textContent = 'Timeline updated as data only. Prior authored results were cleared; the matching firmware artifact remains available.';
  renderScenarioTimelineEditor();
  renderThermostatExperimentPanel();
  renderExpectationReference();
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
  const propertySuite = timeline?.propertySuite ?? null;
  const faultSuite = timeline?.faultSuite ?? null;
  const reductionProvenance = timeline?.reductionProvenance ?? null;
  const running = Boolean(thermostatExperimentRun);
  elements.scenarioadd.disabled = running;
  elements.scenarioundo.disabled = running || !scenarioTimelineEditor?.undoStack.length;
  elements.scenarioredo.disabled = running || !scenarioTimelineEditor?.redoStack.length;
  elements.scenariorun.disabled = running || !timeline || !thermostatRuntimeReady()
    || thermostatFirmwareVariant(currentProject()) === 'modified';
  elements.seededpropertygenerate.disabled = running;
  elements.seededpropertyreplay.disabled = running || !propertySuite;
  elements.faultsuiteload.disabled = running;
  elements.faultsuitereplay.disabled = running || !faultSuite;
  const reducibleFailure = propertySuite?.seed === COUNTEREXAMPLE_REDUCTION_SEED
    && timeline.scenarios.length === 8
    && thermostatFirmwareVariant(currentProject()) === 'known-bad-equality'
    && authoredScenarioResults.length === 8
    && authoredScenarioResults.filter((item) => item.status === 'failed').length === 1
    && authoredScenarioResults.every((item) => ['passed', 'failed'].includes(item.status));
  elements.counterexamplereduce.disabled = running || counterexampleReductionActive
    || !thermostatRuntimeReady() || !reducibleFailure;
  if (propertySuite) elements.seededpropertyseed.value = String(propertySuite.seed);
  elements.seededpropertyexactvalue.textContent = `Exact seed value: ${elements.seededpropertyseed.value}`;
  const observedFailure = propertySuite
    ? authoredScenarioResults.find((item) => item.status === 'failed') ?? null : null;
  elements.seededpropertysummary.textContent = propertySuite
    ? `Stored seed ${propertySuite.seed} · ${propertySuite.algorithm} · ${propertySuite.caseCount} cases · ${propertySuite.resourceBudget.generatorSteps} generator steps · integer ${propertySuite.validInputs.temperatureC.minimum}…${propertySuite.validInputs.temperatureC.maximum} °C + boolean button · max ${propertySuite.resourceBudget.maximumVirtualMilliseconds} ms${observedFailure ? ` · observed counterexample ${observedFailure.scenarioId} at ${observedFailure.virtualMilliseconds.toFixed(3)} ms` : ''}.`
    : 'No seeded suite stored. Generation is bounded to eight valid AVR thermostat cases.';
  const faultFailures = faultSuite ? authoredScenarioResults.filter((item) => item.status !== 'passed').length : 0;
  elements.faultsuitesummary.textContent = faultSuite
    ? `Stored model v${faultSuite.modelVersion} · ${faultSuite.limits.scenarios} cases · ideal D2 bounce, stuck A1 temperature and D2 external-drive release${authoredScenarioResults.length ? ` · ${authoredScenarioResults.length - faultFailures}/${authoredScenarioResults.length} producer-backed cases passed` : ''}. Bus-response fault remains unsupported: no response-producing bus model.`
    : 'Supports ideal D2 bounce, stuck A1 temperature and actual D2 external-drive release. Incorrect bus response is unsupported because no response-producing bus model exists.';
  elements.counterexamplereductionsummary.textContent = counterexampleReductionActive
    ? 'Reduction running deterministic fresh-reset candidate replays. The public release is unchanged.'
    : counterexampleReductionResult
      ? `${counterexampleReductionResult.original.scenarioCount} scenarios / ${counterexampleReductionResult.original.eventCount} events → ${counterexampleReductionResult.reduced.scenarioCount} scenario / ${counterexampleReductionResult.reduced.eventCount} necessary events · ${counterexampleReductionResult.attempts.filter((item) => item.replayed).length} deterministic candidate replays · exact D13 failure preserved · one-minimal, not globally shortest.`
      : reductionProvenance
        ? `Saved inert provenance: ${reductionProvenance.originalScenarioCount}/${reductionProvenance.originalEventCount} → ${reductionProvenance.reducedScenarioCount}/${reductionProvenance.reducedEventCount}. Fresh Build and replay are required; no prior result or verdict was restored.`
        : 'Requires seed 305419896, the fresh known-bad build and its one producer-backed D13 failure. Reduction is deterministic and private.';
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
        : event.kind === 'input.button-pressed' ? 'Button input'
          : event.kind === 'fault.button-bounce-v1' ? 'Ideal D2 bounce fault'
            : event.kind === 'fault.temperature-stuck-v1' ? 'Stuck A1 sensor fault'
              : event.kind === 'fault.button-open-circuit-v1' ? 'Release external D2 drive'
                : 'Expected D13 (window)';
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
      else if (event.kind === 'fault.button-bounce-v1') {
        value = document.createElement('span');
        value.textContent = `Fixed 0/2/4/6/8 ms transitions · ends pressed (D2 LOW)`;
      } else if (event.kind === 'fault.temperature-stuck-v1') value = scenarioControl('Stuck module °C', event.stuckValueC, (raw) => {
        applyScenarioTimelineCommand({ type: 'event.update', scenarioId: scenario.id, eventId: event.id,
          event: { ...event, stuckValueC: Number(raw) } }, { focusId: valueFocus });
      }, { type: 'number', min: -50, max: 150, step: 1, focusId: valueFocus,
        ariaLabel: `${event.id} stuck ideal module temperature in degrees Celsius` });
      else if (event.kind === 'fault.button-open-circuit-v1') {
        value = document.createElement('span');
        value.textContent = 'External D2 drive released · INPUT_PULLUP must resolve HIGH';
      } else value = scenarioControl('D13 must be', event.level, (raw) => {
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
      ? `${result.status.toUpperCase()} · expected D13 ${result.expected.level ? 'HIGH' : 'LOW'} during ${result.expected.observationWindow.startMilliseconds}–${result.expected.observationWindow.endMilliseconds} ms · actually observed D13 ${observedLevel} at ${result.virtualMilliseconds?.toFixed(3) ?? 'missing'} ms · ${result.checks.inputsComplete ? 'timed inputs logged' : 'input evidence missing'} · job ${result.outcome.jobStatus}`
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
function clearX39FailureLocator() {
  thermostatFailureLocator = null;
  pendingThermostatFailureLocator = null;
  x39FailureLocationOpened = false;
  elements.x39failurelocation.hidden = true;
  elements.thermostatresults.querySelectorAll('[data-x39-failure-action]').forEach((button) => button.remove());
  publish({ x39FailureLocator: null, x39FailureNavigation: null });
}
function currentX39Context(locator = thermostatFailureLocator, result = null, runtime = window.__M6_STATE__.runtime) {
  const source = currentProject().source.files.find((file) => file.name === 'main.ino');
  const binding = lifecycle.runtimeBinding;
  if (!locator || !source || !binding || !runtime?.runtimeIdentity || !lifecycle.artifact) return null;
  return {
    profile: selectedCompilerProfile,
    projectGeneration: lifecycle.projectGeneration,
    runtimeBinding: { schema: RUNTIME_BINDING_SCHEMA, projectGeneration: binding.projectGeneration,
      runtimeGeneration: binding.runtimeGeneration, artifactIdentity: binding.artifactIdentity },
    runtimeIdentity: structuredClone(runtime.runtimeIdentity),
    inputIdentity: lifecycle.artifact.inputIdentity,
    artifactIdentity: lifecycle.artifact.artifactIdentity,
    source: { file: 'main.ino', text: source.content },
    graph: structuredClone(currentProject().circuit),
    result: structuredClone(result ?? thermostatExperimentResults.find(
      (item) => item.scenarioId === 'THERM-SCENARIO-EQUALITY-ENABLED')),
    timeline: scenarioTimelineEditor?.timeline ?? null,
    retention: { inputDrops: locator.completeness.inputDrops, serialDrops: locator.completeness.serialDrops },
  };
}
function renderX39FailureLocation() {
  const locator = thermostatFailureLocator;
  elements.x39failurelocation.hidden = !locator || !x39FailureLocationOpened;
  publish({ x39FailureLocator: locator ? structuredClone(locator) : null });
  if (!locator) return;
  elements.x39failuresource.textContent = `${locator.source.file}:${locator.source.startLine} · reviewed fixture reference`;
  elements.x39failurepin.textContent = `${locator.pin.id} · historical ${locator.pin.mode} ${locator.pin.actualLevel ? 'HIGH' : 'LOW'}`;
  elements.x39failurenet.textContent = `${locator.net.id} · ${locator.net.endpoints.join(' ↔ ')}`;
  elements.x39failuretime.textContent = `${locator.observation.actualMilliseconds.toFixed(3)} ms inside ${locator.observation.windowStartMilliseconds}–${locator.observation.windowEndMilliseconds} ms`;
  elements.x39failurelocationsummary.textContent = `Failed/completed producer evidence · source ${locator.source.sha256.slice(0, 12)}… · artifact ${locator.artifactIdentity.slice(0, 12)}… · worker generation ${locator.runtimeBinding.runtimeGeneration}.`;
}
async function openX39FailureLocation() {
  const locator = thermostatFailureLocator;
  const context = currentX39Context(locator);
  if (!locator || !context) { clearX39FailureLocator(); renderThermostatExperimentPanel(); return; }
  try { await validateX39FailureLocator(locator, context); }
  catch {
    clearX39FailureLocator();
    thermostatExperimentNotice = 'The failure location became stale. Run the exact known-bad experiment again.';
    renderThermostatExperimentPanel(); return;
  }
  x39FailureLocationOpened = true;
  selectedSourceFile = locator.source.file;
  selectNet(locator.net.id);
  currentProject().instruments.selectedPin = locator.pin.id;
  elements.pinselect.value = locator.pin.id;
  persistProject();
  elements.firmwaredrawer.open = true;
  renderProject();
  const range = sourceSelection(elements.source.value, locator.source.startLine);
  if (!range) { clearX39FailureLocator(); renderThermostatExperimentPanel(); return; }
  elements.source.focus();
  elements.source.setSelectionRange(range.start, range.end);
  elements.source.scrollTop = Math.max(0, (locator.source.startLine - 4) * 21);
  renderSourceEditor();
  publish({ x39FailureNavigation: { source: `${locator.source.file}:${locator.source.startLine}`,
    pin: locator.pin.id, net: locator.net.id, actualMilliseconds: locator.observation.actualMilliseconds } });
}
async function exportX39FailureLocation() {
  const locator = thermostatFailureLocator;
  const context = currentX39Context(locator);
  if (!locator || !context) return;
  try { await validateX39FailureLocator(locator, context); }
  catch { clearX39FailureLocator(); renderThermostatExperimentPanel(); return; }
  await downloadMeasurementReport(locator,
    `x39-failure-location-${locator.semanticSha256.slice(0, 12)}.intent-mcu-x39.json`);
}
function clearX40SharedTimeline(reason = 'Run one isolated authored AVR thermostat scenario to create current producer evidence.') {
  x40SharedTimeline = null;
  x40TimelineReset = null;
  x40TimelineResult = null;
  x40TimelineNotice = reason;
  elements.x40sharedtimeline.removeAttribute('open');
  elements.x40sharedtimeline.hidden = true;
  elements.x40sharedtimelinebody.replaceChildren();
  publish({ x40SharedTimeline: null });
}
function x40Context({ reset = x40TimelineReset, result = x40TimelineResult,
  observation = window.__M6_STATE__.runtime } = {}) {
  const binding = lifecycle.runtimeBinding;
  if (!reset || !result || !observation || !binding || !lifecycle.artifact) return null;
  return {
    profile: selectedCompilerProfile,
    projectGeneration: lifecycle.projectGeneration,
    runtimeBinding: { schema: RUNTIME_BINDING_SCHEMA, projectGeneration: binding.projectGeneration,
      runtimeGeneration: binding.runtimeGeneration, artifactIdentity: binding.artifactIdentity },
    reset: structuredClone(reset), observation: structuredClone(observation),
    inputIdentity: lifecycle.artifact.inputIdentity,
    artifactIdentity: lifecycle.artifact.artifactIdentity,
    scenarioId: result.scenarioId, result: structuredClone(result),
  };
}
function x40RowValue(row) {
  if (row.class === 'reset') return 'Paused worker reset';
  if (row.class === 'input') return `${row.value.componentId}.${row.value.key} = ${JSON.stringify(row.value.value)} · requested cycle ${row.value.targetCycle.toLocaleString('en-US')}`;
  if (row.class === 'gpio') return `${row.value.pin} ${row.value.level ? 'HIGH' : 'LOW'}`;
  if (row.class === 'serial') return `${row.value.direction.toUpperCase()} byte ${row.value.value} · ${JSON.stringify(row.value.text)}`;
  return `${row.value.scenarioId} · ${row.value.status} · ${row.value.jobStatus}`;
}
function renderX40SharedTimeline() {
  const timeline = x40SharedTimeline;
  elements.x40sharedtimeline.hidden = !timeline;
  elements.x40sharedtimelinecompact.textContent = timeline
    ? `${timeline.rows.length} rows · cycles ${timeline.firstCycle.toLocaleString('en-US')}–${timeline.lastCycle.toLocaleString('en-US')}`
    : 'No current evidence';
  elements.x40sharedtimelinesummary.textContent = timeline
    ? `${timeline.rows.length} current rows · cycles ${timeline.firstCycle.toLocaleString('en-US')}–${timeline.lastCycle.toLocaleString('en-US')} · worker ${timeline.identity.workerInstanceNonce.slice(0, 12)}… · zero relevant drops.`
    : x40TimelineNotice;
  elements.x40sharedtimelinebody.replaceChildren(...(timeline?.rows ?? []).map((row) => {
    const tableRow = document.createElement('tr');
    tableRow.tabIndex = 0;
    tableRow.dataset.eventClass = row.class;
    tableRow.dataset.cycle = String(row.cycle);
    tableRow.dataset.sameCycleSequence = String(row.sameCycleSequence);
    for (const value of [row.cycle.toLocaleString('en-US'),
      (row.cycle / 16_000).toFixed(6), row.class, x40RowValue(row), row.provenance]) {
      const cell = document.createElement('td'); cell.textContent = value; tableRow.append(cell);
    }
    return tableRow;
  }));
  publish({ x40SharedTimeline: timeline ? structuredClone(timeline) : null });
}
async function exportX40SharedTimeline() {
  const context = x40Context();
  if (!x40SharedTimeline || !context) {
    clearX40SharedTimeline('Current timeline authority is unavailable. Run one isolated authored scenario again.');
    return;
  }
  try { await validateX40SharedTimeline(x40SharedTimeline, context); }
  catch {
    clearX40SharedTimeline('Current timeline authority became stale. Run one isolated authored scenario again.');
    renderX40SharedTimeline(); return;
  }
  await downloadMeasurementReport(x40SharedTimeline,
    `x40-shared-timeline-${x40SharedTimeline.semanticSha256.slice(0, 12)}.intent-mcu-x40.json`);
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
    counterexampleReduction: counterexampleReductionResult ? structuredClone(counterexampleReductionResult) : null,
    counterexampleReductionActive,
    knownBadCaught: thermostatKnownBadCaught(),
    freshBuildReady: thermostatRuntimeReady(),
  };
}
function renderThermostatExperimentPanel() {
  const active = thermostatProjectActive();
  elements.thermostatexperiment.hidden = !active;
  if (!active) {
    renderScenarioTimelineEditor();
    renderX40SharedTimeline();
    publish({ thermostatExperiment: thermostatPublishedState() });
    void refreshExperimentPackageState();
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
  } else if (worker && lifecycle.runtimeBinding) {
    elements.reset.disabled = false;
    elements.quickreset.disabled = false;
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
    const verdictText = result?.status === 'passed' ? 'Pass'
      : result?.status === 'failed' ? 'Fail'
        : result?.status === 'indeterminate' ? 'Indeterminate'
          : result?.status === 'unsupported' ? 'Unsupported' : current ? 'Running' : 'Pending';
    verdict.textContent = verdictText;
    if (scenario.id === 'THERM-SCENARIO-EQUALITY-ENABLED' && result?.status === 'failed'
        && thermostatFailureLocator) {
      const action = document.createElement('button'); action.type = 'button';
      action.dataset.x39FailureAction = 'true';
      action.textContent = 'Open failure location';
      action.setAttribute('aria-label', 'Open failure location in main.ino line 18, D13, heater-drive net and observation window');
      action.addEventListener('click', () => { void openX39FailureLocation(); });
      verdict.append(action);
    }
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
    const outcome = aggregateExperimentOutcomes(thermostatExperimentResults);
    elements.thermostatexperimentstate.textContent = `${passed}/${THERMOSTAT_SCENARIOS.scenarios.length} passed · ${outcome.academicStatus} · job ${outcome.jobStatus}`;
  } else {
    elements.thermostatexperimentstate.textContent = freshBuildReady ? 'Ready to test' : 'Fresh build required';
  }
  elements.thermostatexperimentmessage.textContent = thermostatExperimentNotice;
  renderX39FailureLocation();
  renderX40SharedTimeline();
  publish({ thermostatExperiment: thermostatPublishedState() });
  void refreshExperimentPackageState();
}
function cancelThermostatExperiment(message, { clearResults = true, render = true } = {}) {
  thermostatExperimentRun = null;
  clearX39FailureLocator();
  clearX40SharedTimeline(message ?? 'The experiment ended without current complete timeline evidence.');
  const waiter = authoredExperimentWaiter;
  authoredExperimentWaiter = null;
  if (waiter) waiter.reject(Object.assign(new Error('COUNTEREXAMPLE_REPLAY_INTERRUPTED'), {
    code: 'COUNTEREXAMPLE_REPLAY_INTERRUPTED', details: [message ?? 'experiment cancelled'],
  }));
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
  clearX39FailureLocator();
  clearX40SharedTimeline('Running one authored scenario. Current timeline authority was cleared first.');
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
  clearX39FailureLocator();
  clearX40SharedTimeline('The fixed four-scenario suite does not create the bounded X40 isolated timeline.');
  thermostatExperimentRun = { phase: 'await-reset', scenarioIndex: 0, variant, authored: false };
  thermostatExperimentNotice = `Running ${THERMOSTAT_SCENARIOS.scenarios.length} isolated scenarios from virtual cycle 0. Wall-clock speed does not affect the verdict.`;
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
    if (run.authored) run.x40Reset = structuredClone(message);
    run.phase = 'await-controls';
    const controls = run.authored ? scenarioTimelineRuntimeEvents(scenario) : thermostatScenarioControls(scenario.id);
    for (const control of controls) worker.postMessage(control);
    return;
  }
  if (run.phase === 'await-controls') {
    const required = run.authored ? scenarioTimelineRuntimeEvents(scenario) : thermostatScenarioControls(scenario.id);
    const logged = message.eventLog?.log?.filter((event) => event.type === 'control') ?? [];
    const faultRequests = message.eventLog?.log?.filter((event) => event.type === 'fault-request') ?? [];
    const complete = message.eventLog?.dropped === 0 && required.every((control) => logged.some(
      (event) => control.command !== 'fault' && event.componentId === control.componentId && event.key === control.key
        && event.value === control.value && event.targetCycle === (control.targetCycle ?? 0),
    ) || control.command === 'fault' && faultRequests.some((event) => event.event?.id === control.event.id
      && event.targetCycle === control.targetCycle));
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
    faultEvents: message.faultEvents,
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
  if (run.authored && scenarios.length === 1) {
    try {
      const context = x40Context({ reset: run.x40Reset, result, observation: message });
      if (!context) throw new Error('X40_CONTEXT_UNAVAILABLE');
      const timeline = await createX40SharedTimeline(context);
      x40TimelineReset = structuredClone(run.x40Reset);
      x40TimelineResult = structuredClone(result);
      x40SharedTimeline = timeline;
      x40TimelineNotice = 'Current five-class AVR producer timeline accepted.';
    } catch (error) {
      clearX40SharedTimeline(`Shared timeline unavailable: ${error.code ?? error.message}.`);
    }
  } else if (run.authored) {
    clearX40SharedTimeline('Shared timeline requires exactly one isolated authored scenario.');
  }
  if (!run.authored && scenario.id === 'THERM-SCENARIO-EQUALITY-ENABLED') {
    const binding = lifecycle.runtimeBinding;
    const source = currentProject().source.files.find((file) => file.name === 'main.ino');
    try {
      pendingThermostatFailureLocator = await createX39FailureLocator({
        profile: selectedCompilerProfile,
        projectGeneration: lifecycle.projectGeneration,
        runtimeBinding: { schema: RUNTIME_BINDING_SCHEMA, projectGeneration: binding.projectGeneration,
          runtimeGeneration: binding.runtimeGeneration, artifactIdentity: binding.artifactIdentity },
        runtimeIdentity: structuredClone(message.runtimeIdentity),
        inputIdentity: lifecycle.artifact.inputIdentity,
        artifactIdentity: lifecycle.artifact.artifactIdentity,
        source: { file: 'main.ino', text: source.content },
        graph: structuredClone(currentProject().circuit), result: structuredClone(result),
        timeline: scenarioTimelineEditor?.timeline ?? null,
        retention: { inputDrops: observationSnapshot.eventLog?.dropped,
          serialDrops: observationSnapshot.instruments.serial?.dropped },
      });
    } catch { pendingThermostatFailureLocator = null; }
  }
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
  const aggregate = aggregateExperimentOutcomes(completedResults);
  if (!run.authored) thermostatFailureLocator = thermostatKnownBadCaught()
    ? pendingThermostatFailureLocator : null;
  pendingThermostatFailureLocator = null;
  thermostatExperimentNotice = run.authored
    ? `${passed}/${scenarios.length} authored scenarios passed · academic ${aggregate.academicStatus} · job ${aggregate.jobStatus}. Only complete in-window producer evidence can pass or fail.`
    : run.variant === 'known-bad-equality' && thermostatKnownBadCaught()
    ? `Known-bad firmware caught: the equality scenario executed D13 HIGH and reported HEAT, while the other ${THERMOSTAT_SCENARIOS.scenarios.length - 1} scenarios passed.`
    : passed === THERMOSTAT_SCENARIOS.scenarios.length
      ? `${THERMOSTAT_SCENARIOS.scenarios.length}/${THERMOSTAT_SCENARIOS.scenarios.length} passed from executed D13, matching UART and complete virtual-cycle input evidence.`
      : `${passed}/${THERMOSTAT_SCENARIOS.scenarios.length} passed · academic ${aggregate.academicStatus} · job ${aggregate.jobStatus}. Failed or incomplete evidence remains visible; missing evidence is never a pass or failed assertion.`;
  const waiter = run.authored ? authoredExperimentWaiter : null;
  if (waiter) authoredExperimentWaiter = null;
  renderThermostatExperimentPanel();
  if (waiter) {
    const settledResults = structuredClone(completedResults);
    setTimeout(() => waiter.resolve(settledResults), 0);
  }
}
function loadThermostatFirmwareVariant(variant) {
  if (!thermostatProjectActive()) return { ok: false, code: 'THERMOSTAT_PROJECT_REQUIRED' };
  const result = applyEditor({
    type: 'source.set', name: 'main.ino', content: thermostatFirmwareSource(variant),
  }, variant === 'known-bad-equality' ? 'Loaded known-bad equality variant' : 'Restored correct equality variant');
  if (result.ok) {
    counterexampleReductionResult = null;
    thermostatExperimentNotice = variant === 'known-bad-equality'
      ? 'Known-bad ≤ firmware loaded. Build it fresh, then run the current authored timeline or the four fixed boundary scenarios.'
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
    elements.quickstop.disabled = true;
    elements.quickstop.textContent = 'Stop unavailable';
    elements.quickstop.title = 'Stop is unavailable for this preview.';
  }
  setPublicPreviewControls(!avr);
  if (pico) renderPicoQuickControls();
  if (c3) renderC3QuickControls();
  if (stm32) renderStm32QuickControls();
  if (avr) renderAvrQuickControls();
  window.__PUBLIC_CONTROLLER_PROJECTION__.selectedProfile = view.profile;
  window.__PUBLIC_CONTROLLER_PROJECTION__.selected = view;
  publish({
    publicControllerView: structuredClone(view),
    publicExecutionEnabled: view.publicExecution,
    compilerRequestBlocked: preview,
  });
  renderProfileMigrationExplanation();
  renderProjectNavigation();
}

function profileProjectSnapshot(profile) {
  if (profile === AVR_PROFILE) return structuredClone(currentProject());
  if (profile === RP2040_PROFILE) {
    const state = picoPublicWorkbench.snapshot();
    return { profile, source: state.source, circuit: state.circuit };
  }
  if (profile === ESP32C3_PROFILE) return structuredClone(c3PublicWorkbench.snapshot().project);
  if (profile === STM32F429ZI_PROFILE) return structuredClone(stm32PublicWorkbench.snapshot().project);
  return null;
}

function migrationList(target, values, empty) {
  const rows = values.length ? values : [empty];
  target.replaceChildren(...rows.map((value) => {
    const item = document.createElement('li');
    item.textContent = value;
    return item;
  }));
}

function renderProfileMigrationExplanation() {
  const report = lastProfileMigrationReport;
  elements.profilemigrationexplanation.hidden = !report;
  if (!report) {
    elements.profilemigrationsummary.textContent = 'What must change for this controller?';
    window.__PROFILE_MIGRATION_EXPLANATION__ = null;
    return;
  }
  elements.profilemigrationsummary.textContent = `${report.from.label} → ${report.to.label}: what must change`;
  elements.profilemigrationintro.textContent = 'Read-only comparison. Nothing was rewired, translated or copied; both controller drafts remain separate.';
  migrationList(elements.profilemigrationsource, [
    `${report.from.sourceFile} → ${report.to.sourceFile}. ${report.source.action}`,
    report.source.state === 'recognized'
      ? `Recognized current APIs: ${report.source.currentApis.join(', ')}.`
      : `Source semantics: unknown. ${report.source.reason}`,
    `Target source boundary: ${report.source.targetContract}`,
  ], 'No source comparison is available.');
  migrationList(elements.profilemigrationpins, [
    `Connected source pins: ${report.pins.used.length ? report.pins.used.join(', ') : 'none found'}.`,
    `Target named pins: ${report.pins.targetAvailable.map((pin) => pin.label).join(', ')}.`,
    report.pins.action,
  ], 'No pin comparison is available.');
  migrationList(elements.profilemigrationparts,
    report.parts.map((part) => `${part.label}: ${part.state}. ${part.reason}`),
    'No non-controller parts were found in the source circuit.');
  migrationList(elements.profilemigrationrequirements,
    report.requirements.items.map((item) => `${item.id}: ${item.state}. ${item.reason}`),
    'No exact project requirement targets were saved; target suitability beyond the visible circuit remains unknown.');
  window.__PROFILE_MIGRATION_EXPLANATION__ = structuredClone(report);
}
function renderCompilerTarget() {
  const target = currentCompilerTarget();
  elements.canvasannotationsopen.disabled = target.profile !== AVR_PROFILE;
  elements.canvasannotationsopen.title = target.profile === AVR_PROFILE ? 'Open existing-net labels, visual notes and groups' : 'Canvas labels, notes and groups are currently AVR-only';
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
function parseEditorSource(source, { modelLibraryLock, bundle } = {}) {
  if (!modelLibraryLock || !bundle) throw new Error('MODEL_LIBRARY_EXECUTION_CONTEXT_MISSING');
  const candidate = bundle.openCandidateUiSession(source, { modelLibraryLock });
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
  renderExpectationReference();
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
    prepare(value, context) {
      const parsingLock = context.modelLibraryIdentity?.migrationOnly
        ? CURRENT_MODEL_LIBRARY_LOCK : context.modelLibrary;
      const parsed = parseEditorSource(JSON.stringify(value), {
        modelLibraryLock: parsingLock,
        bundle: context.bundle,
      });
      if (!parsed.ok) throw Object.assign(new Error(parsed.code), { code: parsed.code, details: parsed.details ?? [] });
      const project = typeof parsed.session.saveText === 'function'
        ? JSON.parse(parsed.session.saveText()) : JSON.parse(exportCanonicalProject(parsed.session.project));
      return {
        project, prepared: parsed.session,
        preserved: ['source', 'circuit', 'layout', 'wire routes/styles', 'instruments', 'supported controls'],
        fieldsDropped: ['build.inputIdentity', 'build.artifactIdentity', 'runtime results'],
      };
    },
    electrical: (result) => result.prepared?.runnable
      ?? modelLibraryImplementationForResult(result).validateAvrCircuit(result.project.circuit,
        { modelLibraryLock: result.modelLibrary }),
  }),
  [RP2040_PROFILE]: Object.freeze({
    schemas: Object.freeze([RP2040_PUBLIC_PROJECT_SCHEMA]),
    prepare: (value) => ({ project: normalizeRp2040PublicProject(value),
      preserved: ['name', 'source', 'components', 'pins', 'nets', 'properties', 'layout', 'rotation', 'wires'] }),
    electrical: (result) => modelLibraryImplementationForResult(result)
      .validateProfile(RP2040_PROFILE, result.project.circuit,
        { modelLibraryLock: result.modelLibrary }),
    authoringAdmission: ({ project }) => validateBounded3v3AuthoringGraph({
      board: RP2040_PICO_BOARD_DEFINITION, components: project.circuit.components, nets: project.circuit.nets,
    }),
  }),
  [ESP32C3_PROFILE]: Object.freeze({
    schemas: Object.freeze([C3_PUBLIC_PROJECT_SCHEMA]),
    prepare: (value) => ({ project: normalizeEsp32C3PublicProject(value),
      preserved: ['name', 'source', 'components', 'pins', 'nets', 'properties', 'layout', 'rotation', 'wires'] }),
    electrical: (result) => modelLibraryImplementationForResult(result)
      .validateProfile(ESP32C3_PROFILE, result.project.circuit,
        { modelLibraryLock: result.modelLibrary }),
    authoringAdmission: ({ project }) => validateBounded3v3AuthoringGraph({
      board: ESP32C3_BOARD_DEFINITION, components: project.circuit.components, nets: project.circuit.nets,
    }),
  }),
  [STM32F429ZI_PROFILE]: Object.freeze({
    schemas: Object.freeze([STM32_EDITABLE_PROJECT_SCHEMA, 'intent-mcu-stm32-public-project@1']),
    prepare(value) {
      const legacy = value?.schema === 'intent-mcu-stm32-public-project@1';
      return { project: normalizeStm32PublicProject(value),
        preserved: ['name', 'source', ...(legacy ? [] : ['components', 'pins', 'nets', 'properties', 'layout', 'rotation', 'wires'])],
        defaultsAdded: legacy ? ['default validated STM32 teaching circuit'] : [] };
    },
    electrical: (result) => modelLibraryImplementationForResult(result)
      .validateProfile(STM32F429ZI_PROFILE, result.project.circuit,
        { modelLibraryLock: result.modelLibrary }),
    authoringAdmission: ({ project }) => validateBounded3v3AuthoringGraph({
      board: STM32_BOARD_DEFINITION, components: project.circuit.components, nets: project.circuit.nets,
    }),
  }),
});
function detectedAnnotatedWorkspaceSchema(source) {
  try {
    const schema = JSON.parse(source)?.schema;
    return [ANNOTATED_WORKSPACE_SCHEMA, PRE_SUBCIRCUIT_ANNOTATED_WORKSPACE_SCHEMA,
      LEGACY_ANNOTATED_WORKSPACE_SCHEMA].includes(schema) ? schema : null;
  } catch { return null; }
}
function prepareAuthoredProjectEnvelope(source) {
  const annotatedSchema = detectedAnnotatedWorkspaceSchema(source);
  if (annotatedSchema) {
    try {
      const opened = parseAnnotatedWorkspace(source, validateAnnotatedProject);
      return { ...opened.prepared,
        canonical: canonicalAnnotatedWorkspace(opened.workspace, validateAnnotatedProject),
        annotations: opened.workspace.annotations, subcircuits: opened.workspace.subcircuits };
    } catch (error) { return { ok: false, code: error.code ?? error.message }; }
  }
  return preparePublishedRecoveryProjectEnvelope(source, commonProjectAdapters);
}
function parseAvrRecoverySource(source) {
  const common = prepareAuthoredProjectEnvelope(source);
  if (common.ok && common.profile === AVR_PROFILE) {
    return { ok: true, code: common.code, session: common.prepared,
      scenarioTimeline: common.scenarioTimeline, modelLibrary: common.modelLibrary,
      report: common.report, annotations: common.annotations ?? null,
      subcircuits: common.subcircuits ?? emptySubcircuits(common.modelLibrary) };
  }
  const retained = resolveModelLibrary(RETAINED_MODEL_LIBRARY_LOCK);
  if (!retained.ok) return retained;
  const legacy = parseEditorSource(source, {
    modelLibraryLock: RETAINED_MODEL_LIBRARY_LOCK,
    bundle: retained.implementation,
  });
  return legacy.ok ? { ...legacy, scenarioTimeline: null,
    modelLibrary: structuredClone(RETAINED_MODEL_LIBRARY_LOCK) } : common;
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
function bomNetlistExportInput(profile = selectedCompilerProfile) {
  const projectDocument = profileProjectDocument(profile);
  const active = profile === AVR_PROFILE ? currentProject() : projectDocument;
  const graph = profile === AVR_PROFILE
    ? active.candidateCircuit ?? active.project?.circuit ?? active.circuit
    : projectDocument.circuit;
  if (!graph) throw Object.assign(new Error('BOM_NETLIST_GRAPH_INVALID'), { code: 'BOM_NETLIST_GRAPH_INVALID' });
  return {
    productRelease: RELEASE_VERSION,
    profile,
    projectName: profileProjectName(profile),
    graph: structuredClone(graph),
    modelLibraryLock: modelLibraryLockFor(profile),
  };
}
const noCurrentDemonstrationMeasurements = Object.freeze({
  status: 'no-current-measurements', artifactIdentity: null, revision: null,
  reason: 'No current source-bound runtime measurements were present when this local snapshot was created.',
  authority: 'none',
});
function currentAvrAccessibleMeasurementState() {
  const project = currentProject(); const runtime = window.__M6_STATE__.runtime;
  const artifact = lifecycle.artifact; const binding = lifecycle.runtimeBinding;
  const identity = runtime?.runtimeIdentity; const activeModelLock = modelLibraryLockFor(AVR_PROFILE);
  const exact = runtime && artifact && binding && identity && latestBuildResult
    && avrAccessibleRuntimeBindingMatches({
      projectArtifactIdentity: project.build?.artifactIdentity ?? null,
      stateArtifactIdentity: window.__M6_STATE__.artifactIdentity,
      artifact, binding, runtimeIdentity: identity, build: latestBuildResult,
      runtimeModelExecutionContextSha256: runtime.modelExecutionContextSha256,
      loadedSourceIdentity, currentSourceIdentity: buildInputIdentity(),
      modelImplementationSha256: activeModelLock.implementationSha256,
      expectedToolchainIdentitySha256: currentCompilerTarget().toolchainIdentitySha256,
    });
  return exact ? { ...window.__M6_STATE__, revision: editor.revision, artifactIdentity: artifact.artifactIdentity,
    runtime, project } : null;
}
function accessibleMeasurementState(profile) {
  if (profile === AVR_PROFILE) return currentAvrAccessibleMeasurementState();
  if (profile === RP2040_PROFILE) return picoPublicWorkbench.snapshot();
  if (profile === ESP32C3_PROFILE) return c3PublicWorkbench.snapshot();
  if (profile === STM32F429ZI_PROFILE) return stm32PublicWorkbench.snapshot();
  return null;
}
function stableAccessibleMeasurementSnapshot(profile, state, summary) {
  if (summary?.state !== 'current-runtime') return true;
  if (profile === AVR_PROFILE) return state?.runtime?.paused === true && lifecycle.phase === 'paused';
  if (profile === RP2040_PROFILE) return state?.runtime?.paused === true && state.phase === 'paused';
  if (profile === ESP32C3_PROFILE) return state.phase === 'complete';
  return profile === STM32F429ZI_PROFILE && state.phase === 'completed';
}
function accessibleDemonstrationExportInput(profile = selectedCompilerProfile) {
  const projectDocument = profileProjectDocument(profile);
  const active = profile === AVR_PROFILE ? currentProject() : projectDocument;
  const graph = profile === AVR_PROFILE
    ? active.candidateCircuit ?? active.project?.circuit ?? active.circuit
    : projectDocument.circuit;
  const layout = profile === AVR_PROFILE
    ? active.candidateCircuit ? active.candidateLayout : active.layout
    : graph?.layout;
  const state = accessibleMeasurementState(profile);
  if (!graph || !layout) throw Object.assign(new Error('ACCESSIBLE_DEMONSTRATION_INPUT'),
    { code: 'ACCESSIBLE_DEMONSTRATION_INPUT' });
  const summary = state ? sharedInstrumentSummary(profile, state) : null;
  if (!stableAccessibleMeasurementSnapshot(profile, state, summary)) {
    throw Object.assign(new Error('ACCESSIBLE_DEMONSTRATION_RUNTIME_ACTIVE'),
      { code: 'ACCESSIBLE_DEMONSTRATION_RUNTIME_ACTIVE' });
  }
  const measurements = summary?.state === 'current-runtime'
    ? accessibleMeasurementsFromSharedSummary(summary)
    : structuredClone(noCurrentDemonstrationMeasurements);
  return {
    productRelease: RELEASE_VERSION, profile, projectName: profileProjectName(profile),
    graph: structuredClone(graph), layout: structuredClone(layout),
    modelLibraryLock: modelLibraryLockFor(profile),
    measurements,
    generation: profile === AVR_PROFILE ? Math.max(1, lifecycle.projectGeneration) : 1,
    revision: profile === AVR_PROFILE ? editor.revision : state.revision,
  };
}
let bomNetlistExportSequence = 0;
async function exportCurrentBomNetlist() {
  const sequence = ++bomNetlistExportSequence;
  try {
    const input = bomNetlistExportInput();
    const guard = bomNetlistInputGuard(input);
    const remainsCurrent = () => sequence === bomNetlistExportSequence
      && selectedCompilerProfile === input.profile
      && bomNetlistInputGuard(bomNetlistExportInput(input.profile)) === guard;
    elements.buildliststatus.textContent = 'Preparing a local build list from the current validated authored graph…';
    const result = await createBomNetlistExport(input);
    if (!remainsCurrent()) {
      throw Object.assign(new Error('BOM_NETLIST_STALE_EXPORT'), { code: 'BOM_NETLIST_STALE_EXPORT' });
    }
    await parseBomNetlistText(result.text);
    if (!remainsCurrent()) {
      throw Object.assign(new Error('BOM_NETLIST_STALE_EXPORT'), { code: 'BOM_NETLIST_STALE_EXPORT' });
    }
    const stem = input.projectName.normalize('NFKD').replace(/[^A-Za-z0-9 _.-]/gu, '')
      .trim().replace(/\s+/gu, '-').slice(0, 64) || 'intent-mcu-project';
    downloadText(`${stem}.build-list.json`, result.text, 'application/json');
    elements.buildliststatus.textContent = 'Build list downloaded locally. It is not a purchase list and contains no firmware, runtime evidence or physical-equivalence claim.';
    return { ok: true, code: 'OK', ...result };
  } catch (error) {
    const code = error.code ?? error.message ?? 'BOM_NETLIST_EXPORT_FAILED';
    elements.buildliststatus.textContent = code === 'BOM_NETLIST_STALE_EXPORT'
      ? 'Build list cancelled because the project or controller changed while it was being prepared. Try again.'
      : `Build list rejected (${code}). The current project was not changed.`;
    return { ok: false, code };
  }
}
let accessibleDemonstrationExportSequence = 0;
let accessibleDemonstrationRuntimeEpoch = 0;
async function exportCurrentAccessibleDemonstration() {
  const sequence = ++accessibleDemonstrationExportSequence;
  const runtimeEpoch = accessibleDemonstrationRuntimeEpoch;
  try {
    const input = accessibleDemonstrationExportInput();
    const guard = accessibleDemonstrationInputGuard(input);
    const remainsCurrent = () => sequence === accessibleDemonstrationExportSequence
      && runtimeEpoch === accessibleDemonstrationRuntimeEpoch
      && selectedCompilerProfile === input.profile
      && accessibleDemonstrationInputGuard(accessibleDemonstrationExportInput(input.profile)) === guard;
    elements.accessiblesvgstatus.textContent = 'Preparing a sanitized accessible circuit SVG from the current authored graph…';
    const result = await createAccessibleDemonstration(input, { isCurrent: remainsCurrent });
    if (!remainsCurrent()) throw Object.assign(new Error('ACCESSIBLE_DEMONSTRATION_STALE_EXPORT'),
      { code: 'ACCESSIBLE_DEMONSTRATION_STALE_EXPORT' });
    const validated = await validateAccessibleDemonstrationSvg(result.svg);
    if (!remainsCurrent() || validated.report.integrity.reportSha256 !== result.report.integrity.reportSha256) {
      throw Object.assign(new Error('ACCESSIBLE_DEMONSTRATION_STALE_EXPORT'),
        { code: 'ACCESSIBLE_DEMONSTRATION_STALE_EXPORT' });
    }
    const stem = input.projectName.normalize('NFKD').replace(/[^A-Za-z0-9 _.-]/gu, '')
      .trim().replace(/\s+/gu, '-').slice(0, 64) || 'intent-mcu-project';
    downloadText(`${stem}.accessible-demonstration.svg`, result.svg, 'image/svg+xml');
    elements.accessiblesvgstatus.textContent = validated.report.measurements.status === 'current-runtime-measurements'
      ? 'Accessible SVG downloaded locally · authored graph, named pins and current observation-only runtime measurements included.'
      : 'Accessible SVG downloaded locally · authored graph and named pins included · no current measurements.';
    return { ok: true, code: 'OK', ...result };
  } catch (error) {
    const code = error.code ?? error.message ?? 'ACCESSIBLE_DEMONSTRATION_EXPORT_FAILED';
    elements.accessiblesvgstatus.textContent = code === 'ACCESSIBLE_DEMONSTRATION_RUNTIME_ACTIVE'
      ? 'Pause the current AVR/Pico runtime or wait for C3/STM32 completion before exporting a stable measurement snapshot.'
      : code === 'ACCESSIBLE_DEMONSTRATION_STALE_EXPORT'
      ? 'Accessible SVG cancelled because the project, profile or runtime action changed. Try again.'
      : `Accessible SVG rejected (${code}). The current project was not changed.`;
    return { ok: false, code };
  }
}
function commonProjectFilename(profile) {
  const stem = profileProjectName(profile).normalize('NFKD')
    .replace(/[^A-Za-z0-9 _.-]/gu, '').trim().replace(/\s+/gu, '-').slice(0, 64);
  return `${stem || 'intent-mcu-project'}.intent-mcu.json`;
}
function commonProjectText(profile) {
  return canonicalProjectEnvelope(profile, profileProjectDocument(profile), commonProjectAdapters,
    projectBriefForProfile(profile), profile === AVR_PROFILE ? scenarioTimelineEditor?.timeline ?? null : null,
    modelLibraryLockFor(profile));
}
function x92ElectricalGraph(circuit) {
  const components = (circuit?.components ?? []).map((component) => ({
    id: component.id, type: component.type, properties: component.properties ?? {},
  })).sort((left, right) => left.id.localeCompare(right.id));
  const nets = (circuit?.nets ?? []).map((net) => ({
    id: net.id,
    endpoints: (net.endpoints ?? []).map((endpoint) => ({
      component: endpoint.component, pin: endpoint.pin,
    })).sort((left, right) => `${left.component}.${left.pin}`.localeCompare(`${right.component}.${right.pin}`)),
  })).sort((left, right) => left.id.localeCompare(right.id));
  return { components, nets };
}
async function x92CurrentIdentity(profile = selectedCompilerProfile) {
  const project = profileProjectDocument(profile);
  const source = project.source ?? { files: [] };
  const projectGeneration = [ESP32C3_PROFILE, STM32F429ZI_PROFILE].includes(profile)
    ? actionContext(profile).generation : profile === AVR_PROFILE ? lifecycle.projectGeneration : 1;
  const profileArtifact = profile === ESP32C3_PROFILE ? c3PublicWorkbench.snapshot().artifact
    : profile === STM32F429ZI_PROFILE ? stm32PublicWorkbench.snapshot().artifact : null;
  return {
    schema: 'intent-mcu-experiment-budget-identity@1', profile, projectGeneration,
    sourceIdentity: profileArtifact?.sourceSha256
      ? `sha256:${profileArtifact.sourceSha256}` : `sha256:${await projectTextSha256(JSON.stringify(source))}`,
    graphIdentity: `sha256:${await projectTextSha256(JSON.stringify(x92ElectricalGraph(project.circuit)))}`,
  };
}
function cancelX92Requests(requestIds = []) {
  for (const requestId of requestIds) boundedActionRouter.cancel(requestId);
}
function renderX92Budget(message = null, valid = true) {
  if (!elements.x92budgetsummary) return;
  const review = x92Budget?.snapshot() ?? null;
  const root = elements.x92budgetsummary.closest('.x92-budget');
  root.dataset.active = String(Boolean(review?.active));
  elements.x92budgetsummary.textContent = review?.active ? 'Active' : review ? 'Retired' : 'Inactive';
  elements.x92budgetdownload.disabled = !review;
  elements.x92budgetstatus.dataset.valid = String(valid);
  elements.x92budgetstatus.textContent = message ?? (review?.active
    ? 'Session bound to the current profile, source and electrical graph. Reservations are charged atomically.'
    : review ? 'Session retired. Consumption remains visible; only a human action can start another session.'
      : 'No experiment session is active. Existing manual controls are unchanged.');
  const usage = review?.consumed ?? { builds: 0, runs: 0, scenarios: 0, wallClockMs: 0 };
  const reserved = review?.reserved ?? { builds: 0, runs: 0, scenarios: 0, wallClockMs: 0 };
  const limits = review?.limits ?? X92_DEFAULT_LIMITS;
  const remaining = review?.remaining ?? { ...limits };
  const rows = [['builds', 'Builds'], ['runs', 'Runs'], ['scenarios', 'Scenarios'], ['wallClockMs', 'Wall clock']];
  const display = (dimension, value) => dimension === 'wallClockMs' ? `${value} ms` : String(value);
  elements.x92budgetmetrics.replaceChildren(...rows.map(([dimension, label]) => {
    const item = document.createElement('div'); const term = document.createElement('dt');
    const value = document.createElement('dd'); term.textContent = label; item.dataset.dimension = dimension;
    const values = [['consumed', 'Finalized', usage[dimension]], ['reserved', 'Reserved', reserved[dimension]],
      ['remaining', 'Remaining', remaining[dimension]], ['limit', 'Limit', limits[dimension]]];
    value.replaceChildren(...values.map(([kind, title, amount]) => {
      const row = document.createElement('span'); row.className = 'x92-budget-metric-row'; row.dataset.kind = kind;
      row.textContent = `${title}: ${display(dimension, amount)}`; return row;
    }));
    item.append(term, value); return item;
  }));
  const reservations = review?.reservations ?? [];
  const indeterminate = review?.terminal?.filter((item) => item.outcome === 'indeterminate').length ?? 0;
  const runtimeBoundary = x92BudgetExecutor?.runtimeBoundary?.()
    ?? { status: 'idle', code: 'X92_RUNTIME_QUIESCENT' };
  const runtimeBoundaryLabel = runtimeBoundary.status === 'idle' ? 'quiescent'
    : runtimeBoundary.status === 'running' ? 'producer active inside reservation'
    : runtimeBoundary.status === 'pending' ? 'pause/retire acknowledgement pending' : 'blocked';
  const dispatchGate = x92BudgetExecutor?.dispatchGate?.()
    ?? { status: 'idle', code: 'X92_DISPATCH_IDLE' };
  const dispatchGateLabel = dispatchGate.status === 'idle' ? 'idle'
    : dispatchGate.status === 'identity-check' ? 'checking identity'
    : dispatchGate.status === 'reserved' ? 'reserved'
    : dispatchGate.status === 'producer-active' ? 'producer active'
    : dispatchGate.status === 'cancellation-pending' ? 'cancellation acknowledgement pending' : 'blocked';
  elements.x92budgetaccounting.textContent = `Pending reservations: ${reservations.length} · Indeterminate terminal records: ${indeterminate} · Dispatch gate: ${dispatchGateLabel} · Runtime boundary: ${runtimeBoundaryLabel}`;
  elements.x92budgetaccounting.dataset.pending = String(reservations.length);
  elements.x92budgetaccounting.dataset.indeterminate = String(indeterminate);
  elements.x92budgetaccounting.dataset.runtimeBoundary = runtimeBoundary.status;
  elements.x92budgetaccounting.dataset.dispatchGate = dispatchGate.status;
  elements.x92budgetreservations.replaceChildren(...(reservations.length ? reservations.map((item) => {
    const row = document.createElement('li'); row.textContent = `${item.action} · ${item.requestId} · ${item.deadlineAfterMs} ms`; return row;
  }) : [Object.assign(document.createElement('li'), { textContent: 'None' })]));
  const unresolved = review?.unresolvedProblems ?? [];
  elements.x92budgetunresolved.replaceChildren(...(unresolved.length ? unresolved.map((problem) =>
    Object.assign(document.createElement('li'), { textContent: problem }))
    : [Object.assign(document.createElement('li'), { textContent: 'None' })]));
}
function retireX92Budget(reason) {
  if (!x92Budget?.active()) return;
  const result = x92Budget.retire(reason); cancelX92Requests(result.requestIds);
  renderX92Budget(`Session retired: ${reason}. In-flight work was charged at its reserved upper bound.`, true);
}
async function syncX92Identity(reason) {
  if (!x92Budget?.active()) return;
  const sequence = ++x92IdentitySequence;
  try {
    const identity = await x92CurrentIdentity();
    if (sequence !== x92IdentitySequence || !x92Budget.active()) return;
    const result = x92Budget.rebind(identity, reason); cancelX92Requests(result.requestIds);
    if (result.code === 'X92_IDENTITY_REBOUND') {
      renderX92Budget(`Session rebound after ${reason}. In-flight work was charged at its reserved upper bound.`, true);
    }
  } catch (error) {
    retireX92Budget('identity-read-failed');
    renderX92Budget(`Session retired because its current identity could not be authenticated (${error.code ?? error.message}).`, false);
  }
}
function presentationContextBinding() {
  return JSON.stringify({ profile: selectedCompilerProfile, generation: lifecycle.projectGeneration,
    revision: editor.revision, project: currentProjectText() });
}
function closePresentationDialog({ restoreFocus = true, message = null } = {}) {
  presentationOwner.close();
  presentationObservation = null;
  elements.presentationstage.hidden = true; elements.presentationsetup.hidden = false;
  if (message) elements.presentationstatus.textContent = message;
  if (elements.presentationviewdialog.open) elements.presentationviewdialog.close('close');
  const target = presentationReturnFocus; presentationReturnFocus = null;
  if (restoreFocus) queueMicrotask(() => (target?.isConnected ? target : elements.presentationopen).focus());
}
function syncPresentationAvailability() {
  const available = thermostatProjectActive();
  elements.presentationopen.disabled = !available;
  elements.presentationopen.title = available ? 'Open the session-only thermostat presentation view'
    : 'Load the AVR Thermostat boundary test to present this lesson';
  if (presentationOwner.snapshot().active && presentationOwner.invalidate(presentationContextBinding())) {
    closePresentationDialog({ message: 'Presentation closed because the project, source or profile changed.' });
  }
  return available;
}
function addPresentationStepEditor({ title = '', text = '' } = {}) {
  if (elements.presentationstepeditors.children.length >= PRESENTATION_LIMITS.steps) {
    elements.presentationstatus.textContent = `At most ${PRESENTATION_LIMITS.steps} manual steps are supported.`; return null;
  }
  presentationStepSequence += 1;
  const item = document.createElement('li'); item.className = 'presentation-step-editor';
  item.dataset.stepId = `lesson-step-${presentationStepSequence}`;
  const titleLabel = document.createElement('label'); titleLabel.textContent = 'Step title';
  const titleInput = document.createElement('input'); titleInput.type = 'text';
  titleInput.maxLength = PRESENTATION_LIMITS.title; titleInput.value = title;
  const textLabel = document.createElement('label'); textLabel.textContent = 'Explanation';
  const textInput = document.createElement('input'); textInput.type = 'text';
  textInput.maxLength = PRESENTATION_LIMITS.text; textInput.value = text;
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
  remove.addEventListener('click', () => { item.remove(); elements.presentationstatus.textContent = 'Step removed. The experiment was unchanged.'; });
  titleLabel.append(titleInput); textLabel.append(textInput); item.append(titleLabel, textLabel, remove);
  elements.presentationstepeditors.append(item); return item;
}
function presentationDraftFromUi() {
  return normalizePresentationDraft({ schema: PRESENTATION_DRAFT_SCHEMA, profileId: PRESENTATION_PROFILE,
    selectedInstrumentIds: [...elements.presentationinstruments.querySelectorAll('input:checked')].map(({ value }) => value),
    steps: [...elements.presentationstepeditors.children].map((item) => ({ id: item.dataset.stepId,
      title: item.querySelectorAll('input')[0].value, text: item.querySelectorAll('input')[1].value })),
  });
}
function presentationFact(label, value) {
  const row = document.createElement('div'); const term = document.createElement('dt');
  const detail = document.createElement('dd'); term.textContent = label; detail.textContent = value || 'Unavailable';
  row.append(term, detail); return row;
}
function presentationInstrumentFacts(id) {
  if (id === 'recorded-evidence') return [
    ['State', elements.instrumentevidencestate.textContent],
    ['Profile', elements.instrumentevidenceprofile.textContent],
    ['Artifact', elements.instrumentevidenceartifact.textContent],
    ['Virtual time', elements.instrumentevidencetime.textContent],
    ['Retention', elements.instrumentevidenceretention.textContent],
  ];
  if (id === 'serial-output') return [
    ['Owner label', elements.serialprovenance.textContent], ['Observed text', elements.serialoutput.textContent],
  ];
  if (id === 'pin-inspector') return [
    ['Pin', elements.pinselect.value], ['Mode', elements.pinmode.textContent],
    ['Level', elements.pinlevel.textContent], ['Detail', elements.pindetail.textContent],
    ['Diagnostic', elements.pindiagnostic.textContent], ['Cycle', elements.pincycle.textContent],
  ];
  if (id === 'logic-analyser') return [
    ['Transitions', elements.logiccount.textContent], ['Cursor', elements.logiccursor.textContent],
    ['Owner rows', [...elements.logicoutput.children].map(({ textContent }) => textContent).join('\n')],
  ];
  return [];
}
function capturePresentationObservation() {
  const runtime = window.__M6_STATE__.runtime;
  const identity = runtime?.runtimeIdentity;
  const ownerIdentity = identity
    ? [identity.artifactIdentity, `project ${identity.projectGeneration}`, `runtime ${identity.runtimeGeneration}`]
      .filter(Boolean).join(' · ')
    : 'No current runtime owner';
  const virtualCycle = Number.isSafeInteger(runtime?.cycle) && runtime.cycle >= 0 ? runtime.cycle : null;
  return Object.freeze({ capturedAt: new Date().toISOString(), virtualCycle, ownerIdentity,
    cards: Object.freeze(Object.fromEntries(PRESENTATION_INSTRUMENTS.map(({ id }) =>
      [id, Object.freeze(presentationInstrumentFacts(id).map(([label, value]) => Object.freeze({ label, value })))]))) });
}
function presentationInstrumentCard(id) {
  const definition = PRESENTATION_INSTRUMENTS.find((item) => item.id === id);
  const card = document.createElement('article'); card.className = 'presentation-instrument-card'; card.dataset.instrumentId = id;
  const title = document.createElement('h4'); title.textContent = definition?.label ?? id;
  const facts = document.createElement('dl');
  facts.append(...(presentationObservation?.cards[id] ?? []).map(({ label, value }) => presentationFact(label, value)));
  card.append(title, facts); return card;
}
function renderPresentationStage() {
  const state = presentationOwner.snapshot(); if (!state.active) return;
  elements.presentationsnapshotstatus.textContent = `Frozen snapshot · captured ${presentationObservation.capturedAt} · virtual cycle ${presentationObservation.virtualCycle ?? 'unavailable'} · owner ${presentationObservation.ownerIdentity}. Restart the presentation to capture newer values.`;
  elements.presentationsteptitle.textContent = state.step.title;
  elements.presentationsteptext.textContent = state.step.text;
  elements.presentationstepcount.textContent = `${state.selectedStep + 1} / ${state.draft.steps.length}`;
  elements.presentationprevious.disabled = state.selectedStep === 0;
  elements.presentationnext.disabled = state.selectedStep === state.draft.steps.length - 1;
  elements.presentationinstrumentcards.replaceChildren(...state.draft.selectedInstrumentIds.map(presentationInstrumentCard));
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
function presentProjectFileMessage(profile, message) {
  profileMessage(profile, message);
  elements.projectmessage.textContent = message;
  sharedWorkbenchShell.openDialog('project', document.querySelector('#project-files-open'), {
    initialFocus: false,
  });
  const mount = document.querySelector('#workbench-project-dialog .workbench-popup-mount');
  let status = document.querySelector('#project-file-message');
  if (!status) {
    status = document.createElement('p');
    status.id = 'project-file-message'; status.className = 'truth';
    status.setAttribute('role', 'status'); status.tabIndex = -1;
  }
  status.textContent = message;
  mount.prepend(status);
  queueMicrotask(() => status.focus({ preventScroll: true }));
}
function renderModelLibraryStatus() {
  const lock = modelLibraryLockFor(selectedCompilerProfile);
  const preview = modelLibraryMigrationPreview(lock, CURRENT_MODEL_LIBRARY_LOCK);
  if (!preview.ok) {
    elements.modellibrarysummary.textContent = 'Model library · invalid lock';
    elements.modellibrarystatus.textContent = `Trusted model-library check failed (${preview.code}). Save and migration are blocked.`;
    elements.modellibrarychanges.replaceChildren();
    elements.modellibrarymigrate.disabled = true;
    return;
  }
  const retained = preview.migrationRequired;
  elements.modellibrarysummary.textContent = `Model library · ${lock.version} · ${retained ? 'retained' : 'current'}`;
  elements.modellibrarystatus.textContent = retained
    ? 'This project stays bound to its retained, immutable pre-X56 model behavior until you explicitly create a migrated copy.'
    : 'This project uses the current immutable project-owned component/model library.';
  const rows = retained
    ? [`Semantic changes: ${preview.semanticChanges.length}`,
      `Renderer-only changes: ${preview.rendererChanges.length}`,
      `Unchanged profile/component cells: ${preview.unchanged.length}`,
      preview.semanticChanges.length === 0
        ? 'No component semantics change in this retained-to-current comparison.'
        : 'Review every semantic change before choosing migration.']
    : ['No migration is required.'];
  elements.modellibrarychanges.replaceChildren(...rows.map((text) => {
    const item = document.createElement('li'); item.textContent = text; return item;
  }));
  elements.modellibrarymigrate.disabled = !retained;
}
function resetProjectModelLibrary(profile) {
  projectModelLibraryLocks.set(profile, structuredClone(CURRENT_MODEL_LIBRARY_LOCK));
  if (profile === RP2040_PROFILE) picoPublicWorkbench.setModelLibraryLock(CURRENT_MODEL_LIBRARY_LOCK);
  else if (profile === ESP32C3_PROFILE) c3PublicWorkbench.setModelLibraryLock(CURRENT_MODEL_LIBRARY_LOCK);
  else if (profile === STM32F429ZI_PROFILE) stm32PublicWorkbench.setModelLibraryLock(CURRENT_MODEL_LIBRARY_LOCK);
  if (profile === selectedCompilerProfile) renderModelLibraryStatus();
}
function downloadMigratedModelLibraryCopy() {
  const profile = selectedCompilerProfile;
  const original = commonProjectText(profile);
  const migrated = migrateProjectModelLibrary(original, commonProjectAdapters);
  if (!migrated.ok) {
    profileMessage(profile, `Model-library migration rejected (${migrated.code}). The original project is unchanged.`);
    return migrated;
  }
  const name = commonProjectFilename(profile).replace(/\.intent-mcu\.json$/u, '.migrated.intent-mcu.json');
  downloadText(name, migrated.canonical, 'application/json');
  profileMessage(profile, 'Migrated data-only copy downloaded. The open project and original file were not changed; open the copy and Build fresh.');
  return migrated;
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
    if (busy) ui.status.textContent = `Native ${nativeFileOperation.kind} is waiting for the browser or operating system. Save copy and Open file remain available.`;
    else if (connection) ui.status.textContent = `Connected for this session: ${connection.name}. Save connected file writes only after a complete close.`;
    else if (capabilities.open || capabilities.save) ui.status.textContent = 'Save copy and Open file are the primary actions. Optional native file connection is available under Details.';
    else ui.status.textContent = 'Save copy and Open file are available. This browser does not expose the optional native file connection under Details.';
  }
}
function clearProjectFileConnection(profile) {
  projectFileConnections.delete(profile);
  renderNativeFileControls();
}
function nativeFileIntent(profile, kind) {
  if (nativeFileOperation) {
    profileMessage(profile, 'Another native file decision is still open. Save copy and Open file remain available.');
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
    const annotated = profile === AVR_PROFILE && canvasAnnotationsPresent();
    const text = authoredProjectText(profile);
    downloadText(annotated ? 'intent-mcu-annotated-project.json' : commonProjectFilename(profile), text, 'application/json');
    profileMessage(profile, `${annotated ? 'Annotated' : 'Common'} data-only project download requested. Executable and runtime authority were excluded.`);
    return { ok: true, code: 'OK', text };
  } catch (error) {
    profileMessage(profile, `Save rejected (${error.code ?? error.message}). The project is unchanged.`);
    return { ok: false, code: error.code ?? error.message };
  }
}
function saveLegacyProject(profile) {
  try {
    if (profile === AVR_PROFILE && canvasAnnotationsPresent()) throw Object.assign(
      new Error('ANNOTATIONS_REQUIRE_CURRENT_PROJECT_FORMAT'), { code: 'ANNOTATIONS_REQUIRE_CURRENT_PROJECT_FORMAT' });
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
  // Source editors intentionally allow an in-progress, not-yet-build-valid
  // program. Baseline tracking must still preserve and compare that draft
  // instead of throwing while the user is midway through an edit.
  projectBaselines.set(profile, authoredProjectFingerprint(profile));
  if (profile === AVR_PROFILE) canvasAnnotationBaseline = canvasReadabilitySnapshot();
}
function isProjectDirty(profile) {
  const baseline = projectBaselines.get(profile);
  if (baseline === undefined) return false;
  return authoredProjectFingerprint(profile) !== baseline;
}
function authoredProjectFingerprint(profile) {
  try { return authoredProjectText(profile); }
  catch {
    if (profile === AVR_PROFILE) return JSON.stringify({
      name: elements.projectname.value, source: elements.source.value, project: currentProject(),
    });
    const state = profile === RP2040_PROFILE ? picoPublicWorkbench.snapshot()
      : profile === ESP32C3_PROFILE ? c3PublicWorkbench.snapshot() : stm32PublicWorkbench.snapshot();
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
function installPreparedProjectEnvelope(result, handle = null, { preserveExpectationReference = false,
  annotations = null, subcircuits = null } = {}) {
  retireX92Budget('project.file-open');
  if (result.profile !== selectedCompilerProfile) {
    elements.boardselect.value = result.profile;
    elements.boardselect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  projectModelLibraryLocks.set(result.profile, structuredClone(result.modelLibrary));
  if (result.profile === RP2040_PROFILE) picoPublicWorkbench.setModelLibraryLock(result.modelLibrary);
  else if (result.profile === ESP32C3_PROFILE) c3PublicWorkbench.setModelLibraryLock(result.modelLibrary);
  else if (result.profile === STM32F429ZI_PROFILE) stm32PublicWorkbench.setModelLibraryLock(result.modelLibrary);
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
    resetCanvasAnnotations(annotations ?? emptyCanvasAnnotations(), {
      subcircuits: subcircuits ?? emptySubcircuits(result.modelLibrary),
    });
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
  if (!preserveExpectationReference) {
    loadedExpectationReference = null;
    clearProjectPatchReview('Opened project contains authored data only. Lock or open an independent expectation reference separately.');
  }
  setProjectBaseline(result.profile);
  renderNativeFileControls();
  renderModelLibraryStatus();
  renderExpectationReference();
  window.__COMMON_PROJECT_FILE_STATE__ = structuredClone({ profile: result.profile, report: result.report });
  const openedMessage = result.publishedRecovery
    ? `Known previous release/candidate ${result.publishedRecovery.release} project opened as validated data only. The original file is unchanged; fresh Build is required.`
    : result.report.legacy
    ? `Legacy ${result.report.inputSchema} migrated in memory to ${result.report.outputSchema}. Save creates a new file; fresh Build is required.`
    : `Common project opened for ${result.profile}. Executable authority was cleared; fresh Build is required.`;
  presentProjectFileMessage(result.profile, openedMessage);
  return result;
}
async function openCommonProjectFile(file, handle = null) {
  const activeBefore = selectedCompilerProfile;
  if (!file) return { ok: false, code: 'PROJECT_FILE_REQUIRED' };
  if (file.size > CANVAS_ANNOTATION_LIMITS.bytes) {
    profileMessage(activeBefore, `Open rejected (INPUT_LIMIT). The current ${activeBefore} project is unchanged.`);
    return { ok: false, code: 'INPUT_LIMIT' };
  }
  let source;
  try { source = await file.text(); }
  catch (error) {
    profileMessage(activeBefore, `Open rejected (PROJECT_READ_FAILED). ${error?.message ?? 'read failed'}`);
    return { ok: false, code: 'PROJECT_READ_FAILED' };
  }
  let annotated = null;
  const annotatedSchema = detectedAnnotatedWorkspaceSchema(source);
  if (annotatedSchema) {
    try { annotated = parseAnnotatedWorkspace(source, validateAnnotatedProject); }
    catch (error) {
      profileMessage(activeBefore, `Open rejected (${error.code ?? error.message}). Profile, annotations and current project are unchanged.`);
      return { ok: false, code: error.code ?? error.message };
    }
  }
  const result = annotated?.prepared ?? preparePublishedRecoveryProjectEnvelope(source, commonProjectAdapters);
  if (!result.ok) {
    presentProjectFileMessage(activeBefore,
      `Open rejected (${result.code}). Profile and current project are unchanged. Choose another trusted project file or keep editing this project.`);
    return result;
  }
  if (result.profile === activeBefore && requestUnsavedChangeGuard({
    profile: activeBefore,
    actionLabel: 'opening this file',
    continueAction: () => installPreparedProjectEnvelope(result, handle, {
      annotations: annotated?.workspace.annotations ?? null,
      subcircuits: annotated?.workspace.subcircuits ?? null,
    }),
  })) return { ...result, pending: true };
  return installPreparedProjectEnvelope(result, handle, {
    annotations: annotated?.workspace.annotations ?? null,
    subcircuits: annotated?.workspace.subcircuits ?? null,
  });
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
  try { text = authoredProjectText(profile); }
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
      suggestedName: profile === AVR_PROFILE ? projectFilename() : commonProjectFilename(profile),
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

let localHistoryVault = null;
let localHistorySettings = { enabled: false, retentionCount: 3 };
let pendingLocalHistoryConfirmation = null;

function historyFailure(error) {
  const code = (typeof error?.code === 'string' && error.code)
    || error?.name || error?.message || 'LOCAL_HISTORY_FAILED';
  elements.localhistorystatus.textContent = `Local history failed (${code}). The current project, downloaded files and prior local versions are unchanged.`;
  return { ok: false, code };
}

function setHistoryControls(enabled) {
  elements.localhistory.dataset.enabled = String(enabled);
  elements.localhistorybadge.textContent = enabled ? `On · keep ${localHistorySettings.retentionCount}` : 'Off';
  elements.localhistoryenable.hidden = enabled;
  elements.localhistorydisable.hidden = !enabled;
  elements.localhistoryretention.disabled = !enabled;
  elements.localhistorylabel.disabled = !enabled;
  elements.localhistorysave.disabled = !enabled;
  if (!enabled) {
    elements.localhistoryclear.disabled = true;
    elements.localhistorylist.replaceChildren();
  }
}

function closeLocalHistoryConfirmation({ cancelled = true } = {}) {
  const pending = pendingLocalHistoryConfirmation;
  pendingLocalHistoryConfirmation = null;
  if (elements.localhistoryconfirm.open) elements.localhistoryconfirm.close(cancelled ? 'cancel' : 'confirmed');
  if (cancelled) pending?.onCancel?.();
  pending?.returnFocus?.focus?.();
}

function requestLocalHistoryConfirmation({ title, description, acceptLabel, run, onCancel = null }) {
  if (pendingLocalHistoryConfirmation || elements.localhistoryconfirm.open) {
    elements.localhistorystatus.textContent = 'Finish the current local-history decision first. No additional action was queued.';
    return;
  }
  pendingLocalHistoryConfirmation = { run, onCancel, returnFocus: document.activeElement };
  elements.localhistoryconfirmtitle.textContent = title;
  elements.localhistoryconfirmdescription.textContent = description;
  elements.localhistoryconfirmstatus.textContent = 'The current project, browser recovery and downloaded files are not deleted.';
  elements.localhistoryconfirmaccept.textContent = acceptLabel;
  elements.localhistoryconfirm.showModal();
  elements.localhistoryconfirmcancel.focus();
}

function historyRecordFilename(record, raw = false) {
  const profile = String(record?.profile ?? 'unknown').replace(/[^a-z0-9.-]/giu, '-').slice(0, 48);
  const hash = String(record?.projectSha256 ?? 'unverified').slice(0, 12);
  return raw ? `invalid-local-history-recovery-${profile}-${hash}.json`
    : `local-history-${profile}-${hash}.intent-mcu.json`;
}

async function inspectStoredHistoryRecord(record) {
  return inspectHistoryRecord(record, {
    prepare: (source) => {
      const prepared = prepareAuthoredProjectEnvelope(source);
      const annotatedSchema = detectedAnnotatedWorkspaceSchema(source);
      if (!prepared.ok || ![LEGACY_ANNOTATED_WORKSPACE_SCHEMA,
        PRE_SUBCIRCUIT_ANNOTATED_WORKSPACE_SCHEMA].includes(annotatedSchema)) return prepared;
      let sourceModelLibrary = null;
      try { sourceModelLibrary = JSON.parse(source)?.project?.modelLibrary ?? null; } catch { return prepared; }
      return JSON.stringify(sourceModelLibrary) === JSON.stringify(record?.modelLibrary)
        ? { ...prepared, canonical: source, modelLibrary: structuredClone(record.modelLibrary) } : prepared;
    },
  });
}

async function installHistoryRecordIfCurrent(id, expectedHash) {
  try {
    const latest = await localHistoryVault?.get(id);
    if (!latest || latest.projectSha256 !== expectedHash) return historyFailure({ code: 'LOCAL_HISTORY_STALE_SELECTION' });
    const inspected = await inspectStoredHistoryRecord(latest);
    if (!inspected.ok) return historyFailure({ code: inspected.code });
    installPreparedProjectEnvelope(inspected.prepared, null,
      { annotations: inspected.prepared.annotations ?? null });
    elements.localhistorystatus.textContent = `Opened local version ${expectedHash.slice(0, 12)}. File connection, history, artifact, runtime and result authority were cleared; Build fresh before Run.`;
    await refreshLocalHistory();
    return inspected;
  } catch (error) { return historyFailure(error); }
}

async function openHistoryRecord(id) {
  try {
    const record = await localHistoryVault?.get(id);
    if (!record) return historyFailure({ code: 'LOCAL_HISTORY_STALE_SELECTION' });
    const inspected = await inspectStoredHistoryRecord(record);
    if (!inspected.ok) return historyFailure({ code: inspected.code });
    const continueAction = () => { void installHistoryRecordIfCurrent(id, record.projectSha256); };
    if (inspected.prepared.profile === selectedCompilerProfile && requestUnsavedChangeGuard({
      profile: selectedCompilerProfile,
      actionLabel: 'opening this local version',
      continueAction,
    })) return { ...inspected, pending: true };
    return installHistoryRecordIfCurrent(id, record.projectSha256);
  } catch (error) { return historyFailure(error); }
}

async function downloadHistoryRecord(id, { raw = false } = {}) {
  try {
    const record = await localHistoryVault?.get(id);
    if (!record || typeof record.envelope !== 'string') return historyFailure({ code: 'LOCAL_HISTORY_STALE_SELECTION' });
    if (!raw) {
      const inspected = await inspectStoredHistoryRecord(record);
      if (!inspected.ok) return historyFailure({ code: inspected.code });
    }
    downloadText(historyRecordFilename(record, raw), record.envelope, 'application/json');
    elements.localhistorystatus.textContent = raw
      ? 'Raw invalid recovery bytes downloaded without opening or installing them.'
      : `Downloaded exact local version ${record.projectSha256.slice(0, 12)}. The current project and file connection are unchanged.`;
    return { ok: true, code: raw ? 'LOCAL_HISTORY_RAW_RECOVERY_DOWNLOADED' : 'LOCAL_HISTORY_DOWNLOADED' };
  } catch (error) { return historyFailure(error); }
}

async function deleteHistoryRecord(id) {
  try {
    const decision = await localHistoryVault.delete(id);
    if (decision.code !== 'LOCAL_HISTORY_DELETE_CONFIRMATION_REQUIRED') return historyFailure({ code: decision.code });
    requestLocalHistoryConfirmation({
      title: 'Delete this local version?',
      description: `Delete only ${typeof decision.record?.projectSha256 === 'string'
        ? decision.record.projectSha256.slice(0, 12) : 'this invalid recovery record'} from this browser's local history?`,
      acceptLabel: 'Delete local version',
      run: async () => {
        const result = await localHistoryVault.delete(id, decision.confirmation);
        if (!result.ok) return historyFailure({ code: result.code });
        elements.localhistorystatus.textContent = 'Deleted the confirmed local version. The current project and downloaded files are unchanged.';
        await refreshLocalHistory();
        return result;
      },
    });
    return decision;
  } catch (error) { return historyFailure(error); }
}

function historyRow(entry, inspected) {
  const { record, storageKey, storageToken } = entry;
  const valid = inspected.ok;
  const item = document.createElement('li');
  item.className = 'local-history-row';
  item.dataset.historyId = valid ? record.id : storageToken;
  item.dataset.valid = String(valid);
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = valid ? (record.label || inspected.projectName) : 'Invalid local history record';
  const details = document.createElement('small');
  details.textContent = valid
    ? `${record.profile} · ${record.projectSha256.slice(0, 12)} · ${record.modelLibrary.version} / ${record.modelLibrary.manifestSha256.slice(0, 12)} · ${record.byteLength} bytes · ${record.createdAt}`
    : `${String(record?.profile ?? 'unknown')} · ${String(record?.projectSha256 ?? 'unverified').slice(0, 12)} · cannot be opened`;
  copy.append(title, details);
  const actions = document.createElement('div');
  actions.className = 'local-history-actions';
  const open = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Open this version', disabled: !valid });
  const download = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Download copy', disabled: !valid });
  const raw = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Download raw recovery copy', hidden: valid || typeof record?.envelope !== 'string' });
  const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Delete local version' });
  open.addEventListener('click', () => { void openHistoryRecord(storageKey); });
  download.addEventListener('click', () => { void downloadHistoryRecord(storageKey); });
  raw.addEventListener('click', () => { void downloadHistoryRecord(storageKey, { raw: true }); });
  remove.addEventListener('click', () => { void deleteHistoryRecord(storageKey); });
  actions.append(open, download, raw, remove);
  item.append(copy, actions);
  return item;
}

async function refreshLocalHistory(message = null) {
  if (!localHistoryVault || !localHistorySettings.enabled) { setHistoryControls(false); return []; }
  try {
    const entries = await localHistoryVault.listEntries();
    const inspected = await Promise.all(entries.map((entry) => inspectStoredHistoryRecord(entry.record)));
    elements.localhistorylist.replaceChildren(...entries.slice().reverse().map(
      (entry, reverseIndex) => historyRow(entry, inspected[entries.length - reverseIndex - 1]),
    ));
    elements.localhistoryclear.disabled = entries.length === 0;
    elements.localhistorybadge.textContent = `On · ${entries.length}/${localHistorySettings.retentionCount}`;
    elements.localhistoryretention.value = String(localHistorySettings.retentionCount);
    const invalidCount = entries.filter((entry) => !entry.valid).length;
    elements.localhistorystatus.textContent = message ?? (entries.length
      ? `${entries.length} explicit local version${entries.length === 1 ? '' : 's'} retained in this browser.${invalidCount ? ` ${invalidCount} invalid record${invalidCount === 1 ? '' : 's'} can only be downloaded raw or explicitly deleted; saving and retention changes are blocked.` : ''} Local convenience, not backup.`
      : 'History is enabled, but no project version has been saved. Nothing is captured automatically.');
    return entries;
  } catch (error) { historyFailure(error); return []; }
}

async function enableLocalHistory({ resume = false } = {}) {
  if (localHistoryVault) return refreshLocalHistory();
  try {
    const vault = new IndexedDbLocalVersionVault(window.indexedDB);
    await vault.open();
    let settings = await vault.settings();
    if (resume && !settings.enabled) {
      localStorage.setItem(LOCAL_HISTORY_ENABLED_KEY, 'false');
      vault.close();
      setHistoryControls(false);
      elements.localhistorystatus.textContent = 'History is off. Retained versions were not deleted; enable history to inspect them.';
      return [];
    }
    if (!resume) {
      const enabled = await vault.setEnabled(true);
      if (!enabled.ok) throw Object.assign(new Error(enabled.code), enabled);
      settings = await vault.settings();
      try { localStorage.setItem(LOCAL_HISTORY_ENABLED_KEY, 'true'); }
      catch (error) {
        await vault.setEnabled(false);
        vault.close();
        throw error;
      }
    }
    localHistoryVault = vault;
    localHistorySettings = settings;
    setHistoryControls(true);
    return refreshLocalHistory(resume ? null : 'Local history enabled. Nothing is captured until you choose Save local version.');
  } catch (error) {
    localHistoryVault?.close(); localHistoryVault = null;
    setHistoryControls(false);
    return historyFailure(error);
  }
}

async function disableLocalHistory() {
  try {
    if (!localHistoryVault) return { ok: true, code: 'LOCAL_HISTORY_ALREADY_DISABLED' };
    const result = await localHistoryVault.setEnabled(false);
    if (!result.ok) return historyFailure({ code: result.code });
    try { localStorage.setItem(LOCAL_HISTORY_ENABLED_KEY, 'false'); } catch { /* DB setting remains authoritative */ }
    localHistoryVault.close(); localHistoryVault = null;
    localHistorySettings = { ...localHistorySettings, enabled: false };
    setHistoryControls(false);
    elements.localhistorystatus.textContent = 'History is off. Retained local versions were not deleted. Enable history to inspect them again.';
    return result;
  } catch (error) { return historyFailure(error); }
}

async function saveLocalHistoryVersion(confirmation = null, candidate = null) {
  try {
    if (!localHistoryVault || !localHistorySettings.enabled) return historyFailure({ code: 'LOCAL_HISTORY_DISABLED' });
    let record = candidate;
    if (!record) {
      const envelope = authoredProjectText(selectedCompilerProfile);
      const prepared = prepareAuthoredProjectEnvelope(envelope);
      if (!prepared.ok || prepared.profile !== selectedCompilerProfile) return historyFailure({ code: prepared.code ?? 'LOCAL_HISTORY_PROJECT_INVALID' });
      const created = await createHistoryRecord({
        envelope, profile: prepared.profile, modelLibrary: prepared.modelLibrary,
        label: elements.localhistorylabel.value,
      });
      if (!created.ok) return historyFailure({ code: created.code });
      record = created.record;
    }
    const result = await localHistoryVault.save(record, confirmation);
    if (result.code === 'LOCAL_HISTORY_REPLACE_CONFIRMATION_REQUIRED') {
      requestLocalHistoryConfirmation({
        title: 'Replace the oldest local version?',
        description: `The global limit is ${result.confirmation.retentionCount}. Saving ${record.projectSha256.slice(0, 12)} will delete only oldest version ${result.oldest.projectSha256.slice(0, 12)} after transaction-time revalidation.`,
        acceptLabel: 'Replace oldest and save',
        run: () => saveLocalHistoryVersion(result.confirmation, record),
      });
      return result;
    }
    if (!result.ok) return historyFailure({ code: result.code });
    if (result.code === 'LOCAL_HISTORY_SAVED') elements.localhistorylabel.value = '';
    await refreshLocalHistory(result.code === 'LOCAL_HISTORY_ALREADY_SAVED'
      ? 'This exact canonical project version is already saved. No duplicate was created.'
      : `Saved local version ${record.projectSha256.slice(0, 12)}. No Build, Run or upload occurred.`);
    return result;
  } catch (error) { return historyFailure(error); }
}

async function changeLocalHistoryRetention(retentionCount, confirmation = null) {
  try {
    const prior = localHistorySettings.retentionCount;
    const result = await localHistoryVault.setRetention(retentionCount, confirmation);
    if (result.code === 'LOCAL_HISTORY_RETENTION_CONFIRMATION_REQUIRED') {
      requestLocalHistoryConfirmation({
        title: `Keep only ${retentionCount} local versions?`,
        description: `This will delete exactly ${result.remove.length} named oldest version${result.remove.length === 1 ? '' : 's'} after transaction-time revalidation: ${result.remove.map((record) => record.projectSha256.slice(0, 12)).join(', ')}.`,
        acceptLabel: 'Delete listed versions',
        onCancel: () => { elements.localhistoryretention.value = String(prior); },
        run: () => changeLocalHistoryRetention(retentionCount, result.confirmation),
      });
      return result;
    }
    if (!result.ok) { elements.localhistoryretention.value = String(prior); return historyFailure({ code: result.code }); }
    localHistorySettings = { ...localHistorySettings, retentionCount };
    await refreshLocalHistory(`Retention is now ${retentionCount}. Only explicitly confirmed records were removed.`);
    return result;
  } catch (error) { return historyFailure(error); }
}

async function clearLocalHistory(confirmation = null) {
  try {
    const result = await localHistoryVault.clear(confirmation);
    if (result.code === 'LOCAL_HISTORY_CLEAR_CONFIRMATION_REQUIRED') {
      requestLocalHistoryConfirmation({
        title: 'Delete all local versions?',
        description: `Delete exactly ${result.records.length} retained version${result.records.length === 1 ? '' : 's'} from this browser? History stays enabled.`,
        acceptLabel: 'Delete all local versions',
        run: () => clearLocalHistory(result.confirmation),
      });
      return result;
    }
    if (!result.ok) return historyFailure({ code: result.code });
    await refreshLocalHistory('All confirmed local versions were deleted. The current project, browser recovery and downloaded files are unchanged.');
    return result;
  } catch (error) { return historyFailure(error); }
}

function installLocalHistoryControls() {
  setHistoryControls(false);
  elements.localhistoryenable.addEventListener('click', () => { void enableLocalHistory(); });
  elements.localhistorydisable.addEventListener('click', () => { void disableLocalHistory(); });
  elements.localhistorysave.addEventListener('click', () => { void saveLocalHistoryVersion(); });
  elements.localhistoryretention.addEventListener('change', () => {
    void changeLocalHistoryRetention(Number(elements.localhistoryretention.value));
  });
  elements.localhistoryclear.addEventListener('click', () => { void clearLocalHistory(); });
  elements.localhistoryconfirmcancel.addEventListener('click', () => closeLocalHistoryConfirmation());
  elements.localhistoryconfirm.addEventListener('cancel', (event) => { event.preventDefault(); closeLocalHistoryConfirmation(); });
  elements.localhistoryconfirmaccept.addEventListener('click', async () => {
    const pending = pendingLocalHistoryConfirmation;
    if (!pending) return;
    elements.localhistoryconfirmaccept.disabled = true;
    try {
      const result = await pending.run();
      if (result?.ok) closeLocalHistoryConfirmation({ cancelled: false });
      else if (result?.code === 'LOCAL_HISTORY_REPLACE_CONFIRMATION_REQUIRED'
        || result?.code === 'LOCAL_HISTORY_RETENTION_CONFIRMATION_REQUIRED'
        || result?.code === 'LOCAL_HISTORY_DELETE_CONFIRMATION_REQUIRED'
        || result?.code === 'LOCAL_HISTORY_CLEAR_CONFIRMATION_REQUIRED') {
        closeLocalHistoryConfirmation({ cancelled: false });
      } else {
        elements.localhistoryconfirmstatus.textContent = `Action stopped (${result?.code ?? 'LOCAL_HISTORY_FAILED'}). No record was deleted.`;
      }
    } finally { elements.localhistoryconfirmaccept.disabled = false; }
  });
  let enabled = false;
  try { enabled = localStorage.getItem(LOCAL_HISTORY_ENABLED_KEY) === 'true'; } catch { /* off stays inert */ }
  if (enabled) void enableLocalHistory({ resume: true });
}

window.__LOCAL_VERSION_HISTORY__ = Object.freeze({
  enabled: () => Boolean(localHistoryVault && localHistorySettings.enabled),
  databaseOpen: () => Boolean(localHistoryVault?.database),
  settings: () => structuredClone(localHistorySettings),
  list: () => localHistoryVault?.list() ?? Promise.resolve([]),
  entries: () => localHistoryVault?.listEntries() ?? Promise.resolve([]),
  save: () => saveLocalHistoryVersion(),
  open: (id) => openHistoryRecord(id),
  disable: () => disableLocalHistory(),
});
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
  modelLibraryLock: (profile = selectedCompilerProfile) => structuredClone(
    modelLibraryLockFor(profile)),
  modelLibraryPreview: (profile = selectedCompilerProfile) => modelLibraryMigrationPreview(
    modelLibraryLockFor(profile), CURRENT_MODEL_LIBRARY_LOCK),
  migrateModelLibraryCopy: (source = commonProjectText(selectedCompilerProfile)) =>
    migrateProjectModelLibrary(source, commonProjectAdapters),
});
elements.modellibrarymigrate.addEventListener('click', downloadMigratedModelLibraryCopy);
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
  const outcome = aggregateExperimentOutcomes(observations);
  const primaryObservation = observations.find((item) => item.status === 'failed')
    ?? observations.find((item) => item.status === 'indeterminate')
    ?? observations.find((item) => item.status === 'unsupported') ?? observations.at(-1);
  return {
    schema: 'intent-mcu-bounded-test-evidence@1',
    experimentId: THERMOSTAT_EXPERIMENT_ID,
    firmwareVariant: thermostatFirmwareVariant(currentProject()),
    status: outcome.academicStatus,
    outcome,
    jobStatus: outcome.jobStatus,
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
async function buildThroughActiveUi(profile, signal, advancePermit = null) {
  if (x48RuntimeActive || x48Operation) return { ok: false, code: 'X48_OPERATION_ACTIVE' };
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
    const result = await actionWorkbench(profile).build({ advancePermit }); throwIfActionCancelled(signal);
    return result.ok ? { ...result, code: 'ACTION_BUILD_SUCCEEDED' } : result;
  } finally { signal.removeEventListener('abort', cancel); }
}
async function runThroughActiveUi(profile, signal, advancePermit = null, executionBinding = null,
  privateResult = false) {
  if (x48RuntimeActive || x48Operation) return { ok: false, code: 'X48_OPERATION_ACTIVE' };
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
        ? await stm32PublicWorkbench.run(false, { advancePermit, x92Binding: executionBinding,
          x92PrivateResult: privateResult }) : profile === ESP32C3_PROFILE
          ? await c3PublicWorkbench.run({ advancePermit, x92Binding: executionBinding,
            x92PrivateResult: privateResult })
          : await actionWorkbench(profile).run({ advancePermit });
      if (!started.ok) return started;
      if ([ESP32C3_PROFILE, STM32F429ZI_PROFILE].includes(profile) && executionBinding) return started;
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
  if (x48RuntimeActive || x48Operation) return { ok: false, code: 'X48_OPERATION_ACTIVE' };
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
      ok: true,
      code: 'ACTION_TEST_EVALUATED',
      artifactIdentity: testEvidence.artifactIdentity,
      sourceIdentity: testEvidence.sourceIdentity,
      testEvidence,
    };
  } finally { signal.removeEventListener('abort', cancel); }
}
function x92RuntimeQuiescenceAck(request, dispatchToken, identity, producerState, evidence) {
  return {
    schema: X92_RUNTIME_QUIESCENCE_ACK_SCHEMA,
    requestId: request.requestId,
    dispatchToken,
    profile: request.profile,
    identity: structuredClone(identity),
    producerState,
    acknowledged: true,
    evidence: structuredClone(evidence),
  };
}
async function quiesceX92Runtime({ request, dispatchToken, identity, reason, deadlineAt }) {
  const profile = request.profile;
  if (profile === AVR_PROFILE) {
    const targetWorker = worker;
    const targetToken = workerToken;
    const before = window.__M6_STATE__.runtime;
    if (!targetWorker) {
      return x92RuntimeQuiescenceAck(request, dispatchToken, identity, 'retired', {
        reason, workerToken: targetToken, cycleBefore: before?.cycle ?? null,
        acknowledgedCycle: null, cycleAfter: before?.cycle ?? null,
      });
    }
    const currentPaused = x47WorkerStatus?.worker === targetWorker
      && x47WorkerStatus.workerToken === targetToken && x47WorkerStatus.paused === true
      && ['ready', 'paused'].includes(x47WorkerStatus.kind);
    const minimumSequence = x47WorkerStatusSequence;
    if (!currentPaused) {
      const paused = applyLifecycle({ type: 'runtime.pause' });
      if (!paused.accepted && lifecycle.phase !== 'paused') {
        throw Object.assign(new Error(paused.code), { code: 'X92_RUNTIME_PAUSE_REJECTED' });
      }
      targetWorker.postMessage({ command: 'pause' });
    }
    const acknowledged = currentPaused ? x47WorkerStatus : await new Promise((resolve, reject) => {
      const started = performance.now();
      const timer = setInterval(() => {
        const status = x47WorkerStatus;
        if (worker !== targetWorker || workerToken !== targetToken) {
          clearInterval(timer); reject(Object.assign(new Error('X92_RUNTIME_WORKER_REPLACED'),
            { code: 'X92_RUNTIME_WORKER_REPLACED' })); return;
        }
        if (status?.worker === targetWorker && status.workerToken === targetToken
            && status.sequence > minimumSequence && status.kind === 'paused' && status.paused === true) {
          clearInterval(timer); resolve(status); return;
        }
        if (performance.now() - started >= 2_000) {
          clearInterval(timer); reject(Object.assign(new Error('X92_RUNTIME_PAUSE_ACK_TIMEOUT'),
            { code: 'X92_RUNTIME_PAUSE_ACK_TIMEOUT' }));
        }
      }, 10);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const after = x47WorkerStatus;
    if (worker !== targetWorker || workerToken !== targetToken || after?.worker !== targetWorker
        || after.workerToken !== targetToken || after.paused !== true || after.kind !== acknowledged.kind
        || after.cycle !== acknowledged.cycle || !sameRuntimeIdentity(after.runtimeIdentity, acknowledged.runtimeIdentity)) {
      throw Object.assign(new Error('X92_RUNTIME_NOT_FROZEN_AFTER_ACK'),
        { code: 'X92_RUNTIME_NOT_FROZEN_AFTER_ACK' });
    }
    return x92RuntimeQuiescenceAck(request, dispatchToken, identity, 'paused', {
      reason, workerToken: targetToken, workerInstanceNonce: after.runtimeIdentity.workerInstanceNonce,
      cycleBefore: before?.cycle ?? null, acknowledgedCycle: acknowledged.cycle, cycleAfter: after.cycle,
      runtimeIdentity: structuredClone(after.runtimeIdentity),
    });
  }
  if (profile === RP2040_PROFILE) {
    const proof = await picoPublicWorkbench.pauseForBudget({
      deadlineAt, requestId: request.requestId, dispatchToken,
    });
    return x92RuntimeQuiescenceAck(request, dispatchToken, identity, 'paused', {
      reason, ownerProof: proof,
    });
  }
  if (profile === ESP32C3_PROFILE) {
    await c3PublicWorkbench.dispose('X92 budgeted Run completed; transient QEMU producer retired.');
    return x92RuntimeQuiescenceAck(request, dispatchToken, identity, 'retired', {
      reason, phase: c3PublicWorkbench.snapshot().phase,
    });
  }
  if (profile === STM32F429ZI_PROFILE) {
    stm32PublicWorkbench.stop('X92 budgeted Run completed; transient Renode producer retired.');
    return x92RuntimeQuiescenceAck(request, dispatchToken, identity, 'retired', {
      reason, phase: stm32PublicWorkbench.snapshot().phase,
    });
  }
  throw Object.assign(new Error('X92_RUNTIME_QUIESCENCE_PROFILE_UNSUPPORTED'),
    { code: 'X92_RUNTIME_QUIESCENCE_PROFILE_UNSUPPORTED' });
}
let x92OwnedDispatchPermit = null;
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
  'firmware.build': (_payload, { signal, context }) =>
    buildThroughActiveUi(context.profile, signal,
      context.profile === ESP32C3_PROFILE ? x92C3OwnedDispatchPermit
        : context.profile === STM32F429ZI_PROFILE ? x92Stm32OwnedDispatchPermit : x92OwnedDispatchPermit),
  'runtime.run': (payload, { signal, context }) => payload.experimentId
    ? runThermostatTestThroughUi(context.profile, signal)
    : runThroughActiveUi(context.profile, signal,
      context.profile === ESP32C3_PROFILE ? x92C3OwnedDispatchPermit
        : context.profile === STM32F429ZI_PROFILE ? x92Stm32OwnedDispatchPermit : x92OwnedDispatchPermit,
      context.profile === ESP32C3_PROFILE ? x92C3OwnedBinding
        : context.profile === STM32F429ZI_PROFILE ? x92Stm32OwnedBinding : null,
      context.profile === ESP32C3_PROFILE ? x92C3OwnedPrivateResult
        : context.profile === STM32F429ZI_PROFILE ? x92Stm32OwnedPrivateResult : false),
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
const x92OwnedDownstream = Object.freeze({
  async execute(source, dispatchPermit = null) {
    if (x92OwnedDispatchPermit !== null) return { ok: false, code: 'ACTION_BUSY', executed: false };
    x92OwnedDispatchPermit = dispatchPermit;
    try { return await boundedActionRouter.execute(source); }
    finally { if (x92OwnedDispatchPermit === dispatchPermit) x92OwnedDispatchPermit = null; }
  },
  cancel: (requestId) => boundedActionRouter.cancel(requestId),
});
x92Budget = createX92ExperimentBudget({ measurementSource: 'browser.performance.now' });
x92BudgetExecutor = createX92BudgetedExecutor({
  budget: x92Budget,
  downstream: x92OwnedDownstream,
  currentIdentity: () => x92CurrentIdentity(),
  quiesceRuntime: (context) => quiesceX92Runtime(context),
  measurementSource: 'browser.performance.now',
});
async function currentX92C3Binding() {
  const identity = await x92CurrentIdentity(ESP32C3_PROFILE);
  return c3PublicWorkbench.x92Binding({ projectGeneration: identity.projectGeneration,
    graphIdentity: identity.graphIdentity });
}
async function withX92C3Permit(task, permit, binding = null, privateResult = false) {
  if (x92C3OwnedDispatchPermit !== null) return { ok: false, code: 'X92_C3_SHARED_GATE_BLOCKED', executed: false };
  x92C3OwnedDispatchPermit = permit;
  x92C3OwnedBinding = binding;
  x92C3OwnedPrivateResult = privateResult;
  try { return await task(); }
  finally {
    if (x92C3OwnedDispatchPermit === permit) {
      x92C3OwnedDispatchPermit = null;
      x92C3OwnedBinding = null;
      x92C3OwnedPrivateResult = false;
    }
  }
}
x92C3Integration = createX92C3BudgetIntegration({
  budget: x92Budget,
  currentBinding: () => currentX92C3Binding(),
  retireCurrentOwner: ({ binding }) => c3PublicWorkbench.quiesceForX92(binding),
  prepareBudgetProducer: ({ retiredBinding }) => retiredBinding,
  executeBudgetProducer: async (source, permit, binding) => {
    const routed = await withX92C3Permit(() => boundedActionRouter.execute(source), permit, binding, true);
    if (!routed?.ok) throw Object.assign(new Error(routed?.code ?? 'X92_C3_ROUTER_REJECTED'),
      { code: routed?.code ?? 'X92_C3_ROUTER_REJECTED' });
    return routed.result;
  },
  executeManualProducer: (task, permit, binding) =>
    withX92C3Permit(() => task(permit, binding), permit, binding),
  cancelBudgetProducer: (requestId) => boundedActionRouter.cancel(requestId),
  measurementSource: 'browser.performance.now',
});
function executeC3ManualAction(action, task) {
  return x92C3Integration.executeManual((permit, binding) => task(permit, binding), { action });
}
async function currentX92Stm32Binding(request = null) {
  const identity = await x92CurrentIdentity(STM32F429ZI_PROFILE);
  return stm32PublicWorkbench.x92Binding({ projectGeneration: identity.projectGeneration,
    graphIdentity: identity.graphIdentity,
    ...(request?.requestId
      ? { requestNonce: (await projectTextSha256(request.requestId)).slice(0, 24) } : {}) });
}
async function withX92Stm32Permit(task, permit, binding = null, privateResult = false) {
  if (x92Stm32OwnedDispatchPermit !== null) {
    return { ok: false, code: 'X92_STM32_SHARED_GATE_BLOCKED', executed: false };
  }
  x92Stm32OwnedDispatchPermit = permit;
  x92Stm32OwnedBinding = binding;
  x92Stm32OwnedPrivateResult = privateResult;
  try { return await task(); }
  finally {
    if (x92Stm32OwnedDispatchPermit === permit) {
      x92Stm32OwnedDispatchPermit = null;
      x92Stm32OwnedBinding = null;
      x92Stm32OwnedPrivateResult = false;
    }
  }
}
x92Stm32Integration = createX92Stm32BudgetIntegration({
  budget: x92Budget,
  currentBinding: (request) => currentX92Stm32Binding(request),
  retireCurrentOwner: ({ binding, completion }) => stm32PublicWorkbench.quiesceForX92(binding, completion),
  executeBudgetProducer: async (source, permit, binding) => {
    const routed = await withX92Stm32Permit(
      () => boundedActionRouter.execute(source), permit, binding, true);
    if (!routed?.ok) throw Object.assign(new Error(routed?.code ?? 'X92_STM32_ROUTER_REJECTED'),
      { code: routed?.code ?? 'X92_STM32_ROUTER_REJECTED' });
    return routed.result;
  },
  executeManualProducer: (task, permit, binding) =>
    withX92Stm32Permit(() => task(permit, binding), permit, binding),
  cancelBudgetProducer: (requestId) => boundedActionRouter.cancel(requestId),
  measurementSource: 'browser.performance.now',
});
function executeStm32ManualAction(action, task) {
  return x92Stm32Integration.executeManual((permit, binding) => task(permit, binding), { action });
}
async function executeX92ProductAction(source) {
  let request = null;
  try { request = parseBoundedActionRequest(source); } catch { /* canonical executor owns parse errors */ }
  if (request?.profile === STM32F429ZI_PROFILE && request.action === 'runtime.run'
      && x92BudgetStartPending) {
    await x92BudgetStartPending;
  }
  if (request?.profile === ESP32C3_PROFILE && ['firmware.build', 'runtime.run'].includes(request.action)) {
    if (request.action === 'runtime.run' && x92Budget.active()) {
      const result = await x92C3Integration.executeBudgeted(source);
      if (!result.ok) return result;
      return { ...result, schema: BOUNDED_ACTION_RESULT_SCHEMA, router: BOUNDED_ACTION_ROUTER_SCHEMA,
        action: request.action, requestId: request.requestId, profile: request.profile,
        generationBefore: request.expectedGeneration, generationAfter: actionContext(request.profile).generation,
        authority: { mutation: false, build: false, run: true, export: false },
        durableServerProject: false, result: structuredClone(result) };
    }
    return x92C3Integration.executeManual(() => x92BudgetExecutor.execute(source),
      { action: request.action, requestId: request.requestId });
  }
  if (request?.profile === STM32F429ZI_PROFILE && ['firmware.build', 'runtime.run'].includes(request.action)) {
    if (request.action === 'runtime.run' && x92Budget.active()) {
      const result = await x92Stm32Integration.executeBudgeted(source);
      if (!result.ok) return result;
      return { ...result, schema: BOUNDED_ACTION_RESULT_SCHEMA, router: BOUNDED_ACTION_ROUTER_SCHEMA,
        action: request.action, requestId: request.requestId, profile: request.profile,
        generationBefore: request.expectedGeneration, generationAfter: actionContext(request.profile).generation,
        authority: { mutation: false, build: false, run: true, export: false },
        durableServerProject: false, result: structuredClone(result) };
    }
    return x92Stm32Integration.executeManual(() => x92BudgetExecutor.execute(source),
      { action: request.action, requestId: request.requestId });
  }
  return x92BudgetExecutor.execute(source);
}
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
  execute: async (source) => {
    const result = await executeX92ProductAction(source); renderBoundedAction(result); renderX92Budget(); return result;
  },
  cancel: (requestId) => x92C3Integration.status().gate?.requestId === requestId
    ? x92C3Integration.cancel(requestId)
    : x92Stm32Integration.status().gate?.requestId === requestId
      ? x92Stm32Integration.cancel(requestId) : x92BudgetExecutor.cancel(requestId),
  runtimeBoundary: () => x92BudgetExecutor.runtimeBoundary(),
  dispatchGate: () => x92BudgetExecutor.dispatchGate(),
  state: () => lastBoundedAction ? structuredClone(lastBoundedAction) : null,
  externalEndpoint: false,
});
elements.x92budgetstart.addEventListener('click', (event) => {
  if (!event.isTrusted) {
    renderX92Budget('A trusted human UI action is required to start a new experiment session.', false); return;
  }
  if (x92BudgetStartPending) {
    renderX92Budget('Session start is already binding the current source and electrical graph.', false); return;
  }
  const pending = (async () => { try {
    const runtimeBoundary = x92BudgetExecutor.runtimeBoundary();
    if (runtimeBoundary.status !== 'idle') {
      renderX92Budget(`Session was not started (${runtimeBoundary.code}). The old producer must acknowledge pause or retirement first.`, false);
      return;
    }
    const dispatchGate = x92BudgetExecutor.dispatchGate();
    if (dispatchGate.status !== 'idle') {
      renderX92Budget(`Session was not started (${dispatchGate.code}). The active Build or Run must acknowledge completion first.`, false);
      return;
    }
    if (x92Budget.active()) {
      const retired = x92Budget.retire('human-started-new-session'); cancelX92Requests(retired.requestIds);
      if (retired.requestIds.length) {
        renderX92Budget('The prior session was retired and fully charged. Start remains blocked until its producer acknowledges pause or retirement.', false);
        return;
      }
      if (window.__M6_STATE__.runtime?.paused === false) {
        renderX92Budget('Session was not started (X92_RUNTIME_NOT_QUIESCENT). Pause the current producer first.', false);
        return;
      }
    }
    const result = x92Budget.start(await x92CurrentIdentity(), { humanInitiated: true });
    renderX92Budget(result.ok
      ? 'New session started by human action and bound to the current profile, source and electrical graph.'
      : `Session was not started (${result.code}).`, result.ok);
  } catch (error) {
    renderX92Budget(`Session was not started (${error.code ?? error.message}).`, false);
  } })();
  x92BudgetStartPending = pending;
  void pending.finally(() => {
    if (x92BudgetStartPending === pending) x92BudgetStartPending = null;
  });
});
elements.x92budgetdownload.addEventListener('click', () => {
  const text = x92Budget.reviewText();
  if (text) downloadText('intent-mcu-experiment-budget-review.json', text, 'application/json');
});
elements.x92budgetopen.addEventListener('click', () => elements.x92budgetopeninput.click());
elements.x92budgetopeninput.addEventListener('change', async () => {
  const file = elements.x92budgetopeninput.files[0]; elements.x92budgetopeninput.value = '';
  if (!file) return;
  if (file.size > 64 * 1024) {
    elements.x92budgetimported.textContent = 'Review rejected: file exceeds the 64 KiB data-only limit.'; return;
  }
  try {
    x92ImportedReview = parseX92ReviewProjection(await file.text()).review;
    elements.x92budgetimported.textContent = `Inert review opened: ${x92ImportedReview.sessionId} · ${x92ImportedReview.active ? 'recorded active' : 'recorded retired'} · restored no session, runtime, reservation, permission, executable or verdict authority.`;
  } catch (error) {
    x92ImportedReview = null;
    elements.x92budgetimported.textContent = `Review rejected (${error.code ?? error.message}). Live session state was unchanged.`;
  }
});
window.__X92_EXPERIMENT_BUDGET__ = Object.freeze({
  schema: X92_BUDGET_SCHEMA,
  reviewSchema: X92_REVIEW_SCHEMA,
  limits: Object.freeze({ ...X92_DEFAULT_LIMITS }),
  active: () => x92Budget.active(),
  snapshot: () => x92Budget.snapshot(),
  reviewText: () => x92Budget.reviewText(),
  parseReview: (source) => parseX92ReviewProjection(source),
  imported: () => x92ImportedReview ? structuredClone(x92ImportedReview) : null,
  runtimeBoundary: () => structuredClone(x92BudgetExecutor.runtimeBoundary()),
  dispatchGate: () => structuredClone(x92BudgetExecutor.dispatchGate()),
  authority: Object.freeze({ start: 'trusted-human-ui-only', build: false, run: false, retry: false, verdict: false }),
});
renderX92Budget();
elements.presentationopen.addEventListener('click', () => {
  if (!syncPresentationAvailability()) return;
  presentationReturnFocus = document.activeElement;
  if (!elements.presentationstepeditors.children.length) {
    addPresentationStepEditor({ title: 'Observe the evidence boundary',
      text: 'Read the selected instrument labels before explaining the thermostat result.' });
    addPresentationStepEditor({ title: 'Compare the threshold',
      text: 'Move forward manually and compare the equality case with the current owner-provided evidence.' });
  }
  elements.presentationstage.hidden = true; elements.presentationsetup.hidden = false;
  elements.presentationstatus.textContent = 'Ready. No experiment action has run.';
  elements.presentationviewdialog.showModal();
  queueMicrotask(() => elements.presentationviewtitle.focus());
});
elements.presentationclose.addEventListener('click', () => closePresentationDialog());
elements.presentationviewdialog.addEventListener('cancel', (event) => { event.preventDefault(); closePresentationDialog(); });
elements.presentationaddstep.addEventListener('click', () => {
  const item = addPresentationStepEditor(); item?.querySelector('input')?.focus();
});
elements.presentationstart.addEventListener('click', () => {
  try {
    if (!thermostatProjectActive()) throw Object.assign(new Error('PRESENTATION_THERMOSTAT_REQUIRED'),
      { code: 'PRESENTATION_THERMOSTAT_REQUIRED' });
    const observation = capturePresentationObservation();
    presentationOwner.open(presentationDraftFromUi(), presentationContextBinding());
    presentationObservation = observation;
    elements.presentationsetup.hidden = true; elements.presentationstage.hidden = false;
    elements.presentationstatus.textContent = 'Presentation opened without changing the project or experiment.';
    renderPresentationStage(); queueMicrotask(() => elements.presentationsteptitle.focus());
  } catch (error) {
    elements.presentationstatus.textContent = `Presentation not started (${error.code ?? error.message}).`;
  }
});
elements.presentationprevious.addEventListener('click', () => { presentationOwner.previous(); renderPresentationStage(); });
elements.presentationnext.addEventListener('click', () => { presentationOwner.next(); renderPresentationStage(); });
elements.presentationexit.addEventListener('click', () => {
  presentationOwner.close(); presentationObservation = null; elements.presentationstage.hidden = true; elements.presentationsetup.hidden = false;
  elements.presentationstatus.textContent = 'Presentation ended. The project, runtime and budget were unchanged.';
  queueMicrotask(() => elements.presentationstart.focus());
});
window.__X68_PRESENTATION_VIEW__ = Object.freeze({
  schema: PRESENTATION_DRAFT_SCHEMA,
  limits: Object.freeze({ ...PRESENTATION_LIMITS }),
  available: () => thermostatProjectActive(),
  snapshot: () => structuredClone(presentationOwner.snapshot()),
  observation: () => presentationObservation ? structuredClone(presentationObservation) : null,
  authority: Object.freeze({ apply: false, build: false, run: false, scenario: false, runtime: false, verdict: false }),
  persistence: false,
});
function normalizeTeachingExerciseProject(value, { variantId } = {}) {
  const prepared = preparePublishedRecoveryProjectEnvelope(JSON.stringify(value), commonProjectAdapters);
  if (!prepared.ok) throw Object.assign(new Error(prepared.code), prepared);
  if (prepared.profile !== TEACHING_EXERCISE_PROFILE || !isThermostatExperimentProject(prepared.project)
      || thermostatFirmwareVariant(prepared.project) !== variantId) {
    throw Object.assign(new Error('TEACHING_EXERCISE_PROJECT_IDENTITY'), { code: 'TEACHING_EXERCISE_PROJECT_IDENTITY' });
  }
  return JSON.parse(prepared.canonical);
}
function builtInTeachingExercise() {
  const project = (variantId) => JSON.parse(canonicalProjectEnvelope(TEACHING_EXERCISE_PROFILE,
    createThermostatExperiment(variantId).project, commonProjectAdapters, emptyProjectBrief(),
    defaultThermostatScenarioTimeline(), CURRENT_MODEL_LIBRARY_LOCK));
  return normalizeTeachingExercise({
    schema: TEACHING_EXERCISE_SCHEMA, exerciseId: 'thermostat-equality-lesson',
    title: 'Find the thermostat equality fault', profileId: TEACHING_EXERCISE_PROFILE,
    instructions: 'Choose a start project, inspect the exact 30 C threshold requirement, then Build manually. The known-bad answer is intentionally visible.',
    requirements: [
      { id: 'below-threshold', text: 'When enabled below 30 C, executed firmware must drive D13 HIGH.' },
      { id: 'equality-boundary', text: 'When enabled at exactly 30 C, executed firmware must drive D13 LOW.' },
      { id: 'evidence-boundary', text: 'A conclusion requires fresh executed D13 evidence; source text or Serial text alone is not a verdict.' },
    ],
    variants: [
      { id: 'correct', label: 'Correct start project', knownFault: '', project: project('correct') },
      { id: 'known-bad-equality', label: 'Known-bad equality project',
        knownFault: 'Known fault: the heater condition uses <= 30 instead of < 30, so the equality requirement should fail.',
        project: project('known-bad-equality') },
    ],
  }, normalizeTeachingExerciseProject);
}
function renderTeachingExercise(bundle, message = 'Lesson ready. No project has been opened.') {
  acceptedTeachingExercise = structuredClone(bundle);
  elements.teachingexercisetitle.textContent = bundle.title;
  elements.teachingexerciseinstructions.textContent = bundle.instructions;
  elements.teachingexerciserequirements.replaceChildren(...bundle.requirements.map((requirement) => {
    const item = document.createElement('li'); item.textContent = `${requirement.id} · ${requirement.text}`; return item;
  }));
  elements.teachingexercisevariants.replaceChildren(...bundle.variants.map((variant, index) => {
    const label = document.createElement('label'); label.className = 'teaching-exercise-variant';
    label.dataset.knownFault = String(Boolean(variant.knownFault));
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'teaching-exercise-variant';
    input.value = variant.id; input.checked = index === 0;
    const title = document.createElement('strong'); title.textContent = variant.label;
    const detail = document.createElement('span'); detail.textContent = variant.knownFault || 'Reviewed correct start project; no known fault is inserted.';
    label.append(input, title, detail); return label;
  }));
  elements.teachingexercisestatus.textContent = message;
}
function closeTeachingExercise({ restoreFocus = true } = {}) {
  if (elements.teachingexercisedialog.open) elements.teachingexercisedialog.close('close');
  const target = teachingExerciseReturnFocus; teachingExerciseReturnFocus = null;
  if (restoreFocus) queueMicrotask(() => (target?.isConnected ? target : elements.teachingexerciseopen).focus());
}
elements.teachingexerciseopen.addEventListener('click', () => {
  teachingExerciseReturnFocus = document.activeElement;
  try { renderTeachingExercise(builtInTeachingExercise(), 'Built-in reviewed lesson ready. No project has been opened.'); }
  catch (error) { elements.teachingexercisestatus.textContent = `Lesson unavailable (${error.code ?? error.message}).`; return; }
  elements.teachingexercisedialog.showModal(); queueMicrotask(() => elements.teachingexercisetitle.focus());
});
elements.teachingexerciseclose.addEventListener('click', () => closeTeachingExercise());
elements.teachingexercisedialog.addEventListener('cancel', (event) => { event.preventDefault(); closeTeachingExercise(); });
elements.teachingexercisedownload.addEventListener('click', () => {
  try {
    const source = canonicalTeachingExercise(acceptedTeachingExercise, normalizeTeachingExerciseProject);
    downloadText('thermostat-equality.intent-mcu-exercise.json', source, 'application/json');
    elements.teachingexercisestatus.textContent = 'Local lesson-bundle download requested. The browser chooses its destination.';
  } catch (error) { elements.teachingexercisestatus.textContent = `Download rejected (${error.code ?? error.message}).`; }
});
elements.teachingexerciseimport.addEventListener('click', () => elements.teachingexerciseinput.click());
elements.teachingexerciseinput.addEventListener('change', async () => {
  const file = elements.teachingexerciseinput.files[0]; elements.teachingexerciseinput.value = '';
  if (!file) return;
  if (file.size > TEACHING_EXERCISE_LIMITS.bytes) {
    elements.teachingexercisestatus.textContent = 'Local lesson rejected (INPUT_LIMIT). The accepted lesson and current project are unchanged.';
    return;
  }
  try {
    const parsed = parseTeachingExercise(await file.text(), normalizeTeachingExerciseProject);
    renderTeachingExercise(parsed, `Local lesson bundle inspected: ${file.name}. Both start projects passed validation.`);
  } catch (error) {
    elements.teachingexercisestatus.textContent = `Local lesson rejected (${error.code ?? error.message}). The accepted lesson and current project are unchanged.`;
  }
});
elements.teachingexerciseinstall.addEventListener('click', () => {
  const variantId = elements.teachingexercisevariants.querySelector('input:checked')?.value;
  const variant = acceptedTeachingExercise?.variants.find((item) => item.id === variantId);
  if (!variant) { elements.teachingexercisestatus.textContent = 'Choose one validated start project.'; return; }
  const prepared = prepareProjectEnvelope(JSON.stringify(variant.project), commonProjectAdapters);
  if (!prepared.ok || prepared.profile !== TEACHING_EXERCISE_PROFILE) {
    elements.teachingexercisestatus.textContent = `Open rejected (${prepared.code ?? 'TEACHING_EXERCISE_PROJECT'}).`; return;
  }
  const install = () => installPreparedProjectEnvelope(prepared, null);
  closeTeachingExercise({ restoreFocus: false });
  if (selectedCompilerProfile === prepared.profile && requestUnsavedChangeGuard({ profile: prepared.profile,
    actionLabel: `opening ${variant.label}`, continueAction: install })) return;
  install();
});
window.__X71_TEACHING_EXERCISE__ = Object.freeze({
  schema: TEACHING_EXERCISE_SCHEMA, current: () => structuredClone(acceptedTeachingExercise),
  parse: (source) => parseTeachingExercise(source, normalizeTeachingExerciseProject),
  authority: teachingExerciseAuthority(), accounts: false, networkStorage: false,
});
function annotationComponentIds(project = currentProject()) {
  const graph = project?.candidateCircuit ?? project?.circuit;
  return (graph?.components ?? []).map(({ id }) => id).sort();
}
function annotationNetIds(project = currentProject()) {
  const graph = project?.candidateCircuit ?? project?.circuit;
  return (graph?.nets ?? []).map(({ id }) => id).sort();
}
function annotationReferences(project = currentProject()) {
  return { componentIds: annotationComponentIds(project), netIds: annotationNetIds(project) };
}
function ensureCanvasAnnotations() {
  if (!canvasAnnotations) canvasAnnotations = new CanvasAnnotationReducer(emptyCanvasAnnotations(), annotationReferences());
  return canvasAnnotations;
}
function canvasReadabilitySnapshot() {
  return JSON.stringify({ annotations: ensureCanvasAnnotations().snapshot(), subcircuits: boundedSubcircuits });
}
function resetCanvasAnnotations(value = emptyCanvasAnnotations(), { baseline = true,
  subcircuits = emptySubcircuits(modelLibraryLockFor(AVR_PROFILE)) } = {}) {
  canvasAnnotations = new CanvasAnnotationReducer(value, annotationReferences());
  boundedSubcircuits = contractSubcircuits(currentProject().circuit, subcircuits, subcircuitOptions()).owner;
  selectedCanvasAnnotationGroup = null;
  annotationEditorPast.length = 0; annotationEditorFuture.length = 0;
  if (baseline) canvasAnnotationBaseline = canvasReadabilitySnapshot();
  renderCanvasAnnotationOverlay();
}
function canvasAnnotationsDirty() {
  return canvasReadabilitySnapshot() !== canvasAnnotationBaseline;
}
function subcircuitOptions() {
  return { profileId: AVR_PROFILE, modelLibraryLock: modelLibraryLockFor(AVR_PROFILE),
    graphKind: editor.kind === 'candidate-project-v3' ? 'candidate-project-v3' : 'project-v2' };
}
function generatedSubcircuitComponentIds(owner = boundedSubcircuits) {
  const definitions = new Map(owner.definitions.map((definition) => [definition.id, definition]));
  return new Set(owner.instances.flatMap((instance) => (definitions.get(instance.definitionId)?.components ?? [])
    .map((component) => `${instance.id}-${component.id}`)));
}
function subcircuitPositions(graph, owner) {
  const prior = currentProject().layout.positions;
  const positions = Object.fromEntries(graph.components.map((component) => [component.id,
    structuredClone(prior[component.id] ?? { x: 0.5, y: 0.5, rotation: 0 })]));
  for (const instance of owner.instances) {
    if (positions[`${instance.id}-resistor`]) positions[`${instance.id}-resistor`] = {
      x: Math.max(0.08, instance.x - 0.055), y: instance.y, rotation: 0,
    };
    if (positions[`${instance.id}-led`]) positions[`${instance.id}-led`] = {
      x: Math.min(0.92, instance.x + 0.055), y: instance.y, rotation: 0,
    };
  }
  return positions;
}
function applySubcircuitCommand(command, message) {
  const before = structuredClone(boundedSubcircuits);
  try {
    const reducer = new BoundedSubcircuitReducer(currentProject().circuit, before, subcircuitOptions());
    const result = reducer.apply(command);
    if (!result.changed) return result;
    pendingSubcircuitTransition = { before, after: structuredClone(result.owner) };
    const electrical = ['instance.create', 'instance.remove'].includes(command.type);
    const editorCommand = electrical
      ? { type: 'subcircuit.graph.replace', graph: result.graph, positions: subcircuitPositions(result.graph, result.owner) }
      : { type: 'subcircuit.presentation.set', positions: [...generatedSubcircuitComponentIds(result.owner)]
        .map((componentId) => ({ componentId, x: subcircuitPositions(result.graph, result.owner)[componentId].x,
          y: subcircuitPositions(result.graph, result.owner)[componentId].y })) };
    const applied = applyEditor(editorCommand, message);
    if (applied.ok) { renderCanvasAnnotationsDialog(); renderCanvasAnnotationOverlay(); }
    return applied;
  } catch (error) {
    pendingSubcircuitTransition = null;
    elements.canvasannotationsstatus.textContent = `Subcircuit edit rejected (${error.code ?? error.message}). Project and graph unchanged.`;
    return { ok: false, code: error.code ?? error.message };
  }
}
function validateAnnotatedProject(value, profileId) {
  if (profileId !== AVR_PROFILE) throw Object.assign(new Error('ANNOTATED_WORKSPACE_PROFILE'), { code: 'ANNOTATED_WORKSPACE_PROFILE' });
  const prepared = prepareProjectEnvelope(JSON.stringify(value), commonProjectAdapters);
  if (!prepared.ok || prepared.profile !== AVR_PROFILE) throw Object.assign(new Error(prepared.code ?? 'ANNOTATED_WORKSPACE_PROJECT'), prepared);
  return { project: JSON.parse(prepared.canonical), ...annotationReferences(prepared.project),
    graph: prepared.project.candidateCircuit ?? prepared.project.circuit,
    graphKind: prepared.prepared?.kind === 'candidate-project-v3' ? 'candidate-project-v3' : 'project-v2',
    modelLibrary: prepared.modelLibrary, prepared };
}
function currentAnnotatedWorkspace() {
  return { schema: ANNOTATED_WORKSPACE_SCHEMA, profileId: AVR_PROFILE,
    project: JSON.parse(commonProjectText(AVR_PROFILE)), annotations: ensureCanvasAnnotations().snapshot(),
    subcircuits: structuredClone(boundedSubcircuits) };
}
function canonicalCurrentAnnotatedWorkspace() {
  return canonicalAnnotatedWorkspace(currentAnnotatedWorkspace(), validateAnnotatedProject);
}
function canvasAnnotationsPresent() {
  const annotations = ensureCanvasAnnotations().snapshot();
  return annotations.notes.length > 0 || annotations.groups.length > 0 || annotations.netLabels.labels.length > 0
    || boundedSubcircuits.instances.length > 0;
}
function authoredProjectText(profile = selectedCompilerProfile) {
  return profile === AVR_PROFILE && canvasAnnotationsPresent()
    ? canonicalCurrentAnnotatedWorkspace() : commonProjectText(profile);
}
function nextCanvasAnnotationId(prefix) {
  const used = new Set([
    ...ensureCanvasAnnotations().snapshot().notes.map(({ id }) => id),
    ...ensureCanvasAnnotations().snapshot().groups.map(({ id }) => id),
    ...ensureCanvasAnnotations().snapshot().netLabels.labels.map(({ id }) => id),
  ]);
  let candidate;
  do { canvasAnnotationSequence += 1; candidate = `${prefix}-${canvasAnnotationSequence}`; } while (used.has(candidate));
  return candidate;
}
function annotationEditorMarker(before, after, subcircuits = null) {
  const afterGroups = new Map(after.groups.map((group) => [group.id, group]));
  const afterLabels = new Map(after.netLabels.labels.map((label) => [label.id, label]));
  return { groups: before.groups.map((group) => {
    const afterGroup = afterGroups.get(group.id);
    return { id: group.id, before: structuredClone(group), afterExisted: Boolean(afterGroup),
      removed: group.componentIds.filter((member) => !afterGroup?.componentIds.includes(member)) };
  }).filter(({ removed, afterExisted }) => removed.length || !afterExisted),
  labels: before.netLabels.labels.map((label, index) => ({ label: structuredClone(label), index }))
    .filter(({ label }) => !afterLabels.has(label.id)), subcircuits };
}
function applyAnnotationEditorMarker(marker, direction) {
  if (marker.subcircuits) {
    boundedSubcircuits = structuredClone(direction === 'undo'
      ? marker.subcircuits.before : marker.subcircuits.after);
    contractSubcircuits(currentProject().circuit, boundedSubcircuits, subcircuitOptions());
  }
  const current = ensureCanvasAnnotations().snapshot();
  const groups = new Map(current.groups.map((group) => [group.id, group]));
  for (const change of marker.groups) {
    const group = groups.get(change.id);
    if (direction === 'undo') {
      if (group) group.componentIds = [...new Set([...group.componentIds, ...change.removed])].sort();
      else if (!change.afterExisted) groups.set(change.id, structuredClone(change.before));
    } else if (group) {
      group.componentIds = group.componentIds.filter((member) => !change.removed.includes(member));
      if (!group.componentIds.length) groups.delete(change.id);
    }
  }
  current.groups = [...groups.values()];
  const labels = [...current.netLabels.labels];
  for (const change of marker.labels ?? []) {
    const currentIndex = labels.findIndex(({ id }) => id === change.label.id);
    if (direction === 'undo' && currentIndex < 0) labels.splice(Math.min(change.index, labels.length), 0, structuredClone(change.label));
    else if (direction === 'redo' && currentIndex >= 0) labels.splice(currentIndex, 1);
  }
  current.netLabels.labels = labels;
  return ensureCanvasAnnotations().restore(current, annotationReferences());
}
function renderCanvasAnnotationOverlay() {
  if (!elements.canvasannotationlayer || !editor || selectedCompilerProfile !== AVR_PROFILE) return;
  const state = ensureCanvasAnnotations().snapshot();
  const positions = currentProject().layout.positions;
  const nodes = [];
  for (const instance of boundedSubcircuits.instances) {
    const point = screenPoint(instance); const node = document.createElement('button'); node.type = 'button';
    node.className = `canvas-subcircuit-badge${instance.collapsed ? ' collapsed' : ''}`;
    node.dataset.subcircuitBadge = instance.id; node.style.left = `${point.x * 100}%`; node.style.top = `${point.y * 100}%`;
    node.textContent = `${instance.collapsed ? '▸' : '▾'} ${instance.id} · SERIES LED`;
    node.setAttribute('aria-label', `${instance.id}, bounded reusable series LED stage, ${instance.collapsed ? 'collapsed' : 'expanded'}`);
    node.addEventListener('click', () => applySubcircuitCommand({ type: 'instance.collapse', id: instance.id,
      collapsed: !instance.collapsed }, `${instance.collapsed ? 'Expanded' : 'Collapsed'} ${instance.id}`));
    nodes.push(node);
  }
  for (const group of state.groups) {
    const points = group.componentIds.map((id) => positions[id]).filter(Boolean).map(screenPoint);
    if (!points.length) continue;
    const left = Math.max(0, Math.min(...points.map(({ x }) => x)) - 0.09);
    const right = Math.min(1, Math.max(...points.map(({ x }) => x)) + 0.09);
    const top = Math.max(0, Math.min(...points.map(({ y }) => y)) - 0.09);
    const bottom = Math.min(1, Math.max(...points.map(({ y }) => y)) + 0.09);
    const node = document.createElement('div'); node.className = 'canvas-visual-group';
    node.style.left = `${left * 100}%`; node.style.top = `${top * 100}%`;
    node.style.width = `${(right - left) * 100}%`; node.style.height = `${(bottom - top) * 100}%`;
    const label = document.createElement('button'); label.type = 'button'; label.dataset.annotationGroup = group.id;
    label.textContent = `GROUP · ${group.label}`;
    label.setAttribute('aria-label', `Visual group ${group.label}. Non-electrical. ${group.componentIds.join(', ')}`);
    node.append(label);
    label.addEventListener('pointerdown', (event) => event.stopPropagation());
    label.addEventListener('click', (event) => {
      event.stopPropagation();
      selectedCanvasAnnotationGroup = group.id;
      for (const card of elements.componentlayer.querySelectorAll('.circuit-component')) card.classList.toggle('annotation-highlight', group.componentIds.includes(card.dataset.componentId));
      const first = elements.componentlayer.querySelector(`[data-component-id="${CSS.escape(group.componentIds[0])}"]`);
      first?.focus({ preventScroll: true });
    });
    nodes.push(node);
  }
  for (const note of state.notes) {
    const point = screenPoint(note); const node = document.createElement('button'); node.type = 'button'; node.className = 'canvas-visual-note';
    node.dataset.annotationNote = note.id; node.style.left = `${point.x * 100}%`; node.style.top = `${point.y * 100}%`;
    node.textContent = note.text; node.setAttribute('aria-label', `Visual note. Non-electrical. ${note.text}`);
    node.addEventListener('pointerdown', (event) => event.stopPropagation());
    node.addEventListener('click', (event) => { event.stopPropagation(); elements.canvasannotationsopen.click(); queueMicrotask(() => document.querySelector(`[data-annotation-editor="${CSS.escape(note.id)}"] input`)?.focus()); });
    nodes.push(node);
  }
  for (const label of state.netLabels.labels) {
    const point = screenPoint(label); const node = document.createElement('button'); node.type = 'button'; node.className = 'canvas-net-label';
    node.dataset.annotationNetLabel = label.id; node.dataset.boundNetId = label.netId;
    node.style.left = `${point.x * 100}%`; node.style.top = `${point.y * 100}%`;
    const boundId = document.createElement('span'); boundId.className = 'canvas-net-label-bound-id';
    boundId.textContent = `EXISTING NET · ${label.netId}`;
    const text = document.createElement('span'); text.className = 'canvas-net-label-text'; text.textContent = label.text;
    node.append(boundId, text);
    node.setAttribute('aria-label', `Label existing net ${label.netId}: ${label.text}. This label does not connect nets.`);
    node.addEventListener('pointerdown', (event) => event.stopPropagation());
    node.addEventListener('click', (event) => { event.stopPropagation(); selectNet(label.netId); drawCircuitWires(); });
    nodes.push(node);
  }
  elements.canvasannotationlayer.replaceChildren(...nodes);
}
function annotationCommand(command, message) {
  try {
    const result = ensureCanvasAnnotations().apply(command, annotationReferences());
    renderCanvasAnnotationOverlay(); renderCanvasAnnotationsDialog();
    elements.canvasannotationsstatus.textContent = result.changed ? `${message}. Electrical graph and source unchanged.` : 'No visual metadata changed.';
    return result;
  } catch (error) {
    elements.canvasannotationsstatus.textContent = `Visual edit rejected (${error.code ?? error.message}). Project and electrical graph unchanged.`;
    return { ok: false, code: error.code ?? error.message };
  }
}
function annotationHistory(direction) {
  try {
    const result = ensureCanvasAnnotations()[direction](annotationReferences());
    renderCanvasAnnotationOverlay(); renderCanvasAnnotationsDialog();
    elements.canvasannotationsstatus.textContent = result.changed
      ? `${direction === 'undo' ? 'Undid' : 'Redid'} one visual metadata edit. Electrical graph unchanged.`
      : `Nothing to ${direction}.`;
    return result;
  } catch (error) {
    renderCanvasAnnotationOverlay(); renderCanvasAnnotationsDialog();
    elements.canvasannotationsstatus.textContent = `Visual ${direction} rejected (${error.code ?? error.message}). History and current metadata are unchanged.`;
    return { ok: false, code: error.code ?? error.message };
  }
}
function renderCanvasAnnotationsDialog() {
  if (!editor) return;
  const state = ensureCanvasAnnotations().snapshot(); const history = ensureCanvasAnnotations().history();
  elements.canvasannotationsundo.disabled = history.undo === 0; elements.canvasannotationsredo.disabled = history.redo === 0;
  elements.canvasgroupcomponents.replaceChildren(...currentProject().circuit.components.map((component) => {
    const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = component.id;
    label.append(input, document.createTextNode(component.label)); return label;
  }));
  elements.canvasnetlabelnet.replaceChildren(...currentProject().circuit.nets.map((net) => new Option(net.id, net.id)));
  const generatedNets = new Set(boundedSubcircuits.instances.map(({ id }) => `${id}-series`));
  const bindableNets = currentProject().circuit.nets.filter(({ id }) => !generatedNets.has(id));
  elements.canvassubcircuitsource.replaceChildren(...bindableNets.map((net) => new Option(net.id, net.id)));
  elements.canvassubcircuitground.replaceChildren(...bindableNets.map((net) => new Option(net.id, net.id)));
  const editors = [];
  for (const note of state.notes) {
    const row = document.createElement('article'); row.className = 'canvas-annotation-editor'; row.dataset.annotationEditor = note.id;
    const label = document.createElement('label'); label.textContent = 'Note'; const input = document.createElement('input'); input.value = note.text; input.maxLength = 1000; label.append(input);
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save'; save.addEventListener('click', () => annotationCommand({ type: 'note.edit', id: note.id, text: input.value.trim(), x: note.x, y: note.y }, `Updated ${note.id}`));
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.addEventListener('click', () => annotationCommand({ type: 'note.remove', id: note.id }, `Deleted ${note.id}`));
    const meta = document.createElement('small'); meta.textContent = `NOTE · non-electrical · x ${note.x.toFixed(2)} · y ${note.y.toFixed(2)}`;
    row.append(label, save, remove, meta); editors.push(row);
  }
  for (const group of state.groups) {
    const row = document.createElement('article'); row.className = 'canvas-annotation-editor'; row.dataset.annotationEditor = group.id;
    const label = document.createElement('label'); label.textContent = 'Group'; const input = document.createElement('input'); input.value = group.label; input.maxLength = 80; label.append(input);
    const focus = document.createElement('button'); focus.type = 'button'; focus.textContent = 'Focus'; focus.addEventListener('click', () => { closeCanvasAnnotations(); queueMicrotask(() => elements.canvasannotationlayer.querySelector(`[data-annotation-group="${CSS.escape(group.id)}"]`)?.click()); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.addEventListener('click', () => annotationCommand({ type: 'group.remove', id: group.id }, `Deleted ${group.id}`));
    const meta = document.createElement('small'); meta.textContent = `GROUP · non-electrical · ${group.componentIds.join(', ')}`;
    input.addEventListener('change', () => annotationCommand({ type: 'group.edit', id: group.id, label: input.value.trim(), componentIds: group.componentIds }, `Updated ${group.id}`));
    row.append(label, focus, remove, meta); editors.push(row);
  }
  for (const netLabel of state.netLabels.labels) {
    const row = document.createElement('article'); row.className = 'canvas-annotation-editor'; row.dataset.annotationEditor = netLabel.id;
    const label = document.createElement('label'); label.textContent = 'Existing-net label'; const input = document.createElement('input'); input.value = netLabel.text; input.maxLength = 80; label.append(input);
    const focus = document.createElement('button'); focus.type = 'button'; focus.textContent = 'Select net'; focus.addEventListener('click', () => { closeCanvasAnnotations(); selectNet(netLabel.netId); drawCircuitWires(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.addEventListener('click', () => annotationCommand({ type: 'net-label.remove', id: netLabel.id }, `Deleted ${netLabel.id}`));
    const meta = document.createElement('small'); meta.textContent = `LABEL EXISTING NET · ${netLabel.netId} · matching text never connects nets`;
    input.addEventListener('change', () => annotationCommand({ type: 'net-label.edit', id: netLabel.id, netId: netLabel.netId,
      text: input.value.trim(), x: netLabel.x, y: netLabel.y }, `Updated ${netLabel.id}`));
    row.append(label, focus, remove, meta); editors.push(row);
  }
  for (const instance of boundedSubcircuits.instances) {
    const row = document.createElement('article'); row.className = 'canvas-annotation-editor canvas-subcircuit-editor';
    row.dataset.annotationEditor = instance.id;
    const xLabel = document.createElement('label'); xLabel.textContent = 'X'; const x = document.createElement('input');
    x.type = 'number'; x.min = '0'; x.max = '1'; x.step = '0.01'; x.value = String(instance.x); xLabel.append(x);
    const yLabel = document.createElement('label'); yLabel.textContent = 'Y'; const y = document.createElement('input');
    y.type = 'number'; y.min = '0'; y.max = '1'; y.step = '0.01'; y.value = String(instance.y); yLabel.append(y);
    const move = document.createElement('button'); move.type = 'button'; move.textContent = 'Move';
    move.addEventListener('click', () => applySubcircuitCommand({ type: 'instance.move', id: instance.id,
      x: Number(x.value), y: Number(y.value) }, `Moved ${instance.id}`));
    const collapse = document.createElement('button'); collapse.type = 'button'; collapse.textContent = instance.collapsed ? 'Expand' : 'Collapse';
    collapse.addEventListener('click', () => applySubcircuitCommand({ type: 'instance.collapse', id: instance.id,
      collapsed: !instance.collapsed }, `${instance.collapsed ? 'Expanded' : 'Collapsed'} ${instance.id}`));
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete';
    remove.addEventListener('click', () => applySubcircuitCommand({ type: 'instance.remove', id: instance.id }, `Deleted ${instance.id}`));
    const bindings = Object.fromEntries(instance.bindings.map(({ portId, netId }) => [portId, netId]));
    const meta = document.createElement('small');
    meta.textContent = `BOUNDED ELECTRICAL · source → ${bindings.source} · ground → ${bindings.ground} · generated ${instance.id}-resistor, ${instance.id}-led`;
    row.append(xLabel, yLabel, move, collapse, remove, meta); editors.push(row);
  }
  elements.canvasannotationslist.replaceChildren(...editors);
}
function closeCanvasAnnotations({ restoreFocus = true } = {}) {
  if (elements.canvasannotationsdialog.open) elements.canvasannotationsdialog.close('close');
  const target = canvasAnnotationReturnFocus; canvasAnnotationReturnFocus = null;
  if (restoreFocus) queueMicrotask(() => (target?.isConnected ? target : elements.canvasannotationsopen).focus());
}
elements.canvasannotationsopen.addEventListener('click', () => {
  if (selectedCompilerProfile !== AVR_PROFILE) return;
  canvasAnnotationReturnFocus = document.activeElement; renderCanvasAnnotationsDialog();
  elements.canvasannotationsdialog.showModal(); queueMicrotask(() => elements.canvasannotationstitle.focus());
});
elements.canvasannotationsclose.addEventListener('click', () => closeCanvasAnnotations());
elements.canvasannotationsdialog.addEventListener('cancel', (event) => { event.preventDefault(); closeCanvasAnnotations(); });
elements.canvasnoteadd.addEventListener('click', () => {
  const result = annotationCommand({ type: 'note.create', id: nextCanvasAnnotationId('note'), text: elements.canvasnotetext.value.trim(),
    x: Number(elements.canvasnotex.value), y: Number(elements.canvasnotey.value) }, 'Added visual note');
  if (result.ok) elements.canvasnotetext.value = '';
});
elements.canvasgroupadd.addEventListener('click', () => {
  const members = [...elements.canvasgroupcomponents.querySelectorAll('input:checked')].map(({ value }) => value);
  const result = annotationCommand({ type: 'group.create', id: nextCanvasAnnotationId('group'),
    label: elements.canvasgrouplabel.value.trim(), componentIds: members }, 'Added visual group');
  if (result.ok) elements.canvasgrouplabel.value = '';
});
elements.canvasnetlabeladd.addEventListener('click', () => {
  const result = annotationCommand({ type: 'net-label.create', id: nextCanvasAnnotationId('net-label'),
    netId: elements.canvasnetlabelnet.value, text: elements.canvasnetlabeltext.value.trim(),
    x: Number(elements.canvasnetlabelx.value), y: Number(elements.canvasnetlabely.value) }, 'Labelled existing net');
  if (result.ok) elements.canvasnetlabeltext.value = '';
});
elements.canvassubcircuitadd.addEventListener('click', () => {
  const result = applySubcircuitCommand({ type: 'instance.create', id: elements.canvassubcircuitid.value.trim(),
    definition: createSeriesLedDefinition(),
    bindings: [{ portId: 'source', netId: elements.canvassubcircuitsource.value },
      { portId: 'ground', netId: elements.canvassubcircuitground.value }],
    x: Number(elements.canvassubcircuitx.value), y: Number(elements.canvassubcircuity.value) },
  `Created ${elements.canvassubcircuitid.value.trim()}`);
  if (result.ok) elements.canvassubcircuitid.value = `stage-${boundedSubcircuits.instances.length + 1}`;
});
elements.canvasannotationsundo.addEventListener('click', () => { annotationHistory('undo'); });
elements.canvasannotationsredo.addEventListener('click', () => { annotationHistory('redo'); });
elements.canvasannotationsdownload.addEventListener('click', () => {
  try { downloadText('intent-mcu-annotated-project.json', canonicalCurrentAnnotatedWorkspace(), 'application/json'); canvasAnnotationBaseline = canvasReadabilitySnapshot(); elements.canvasannotationsstatus.textContent = 'Annotated project download requested locally.'; }
  catch (error) { elements.canvasannotationsstatus.textContent = `Annotated project rejected (${error.code ?? error.message}).`; }
});
elements.canvasannotationsimport.addEventListener('click', () => elements.canvasannotationsinput.click());
elements.canvasannotationsinput.addEventListener('change', async () => {
  const file = elements.canvasannotationsinput.files[0]; elements.canvasannotationsinput.value = ''; if (!file) return;
  if (file.size > CANVAS_ANNOTATION_LIMITS.bytes) { elements.canvasannotationsstatus.textContent = 'Annotated project rejected (INPUT_LIMIT).'; return; }
  try {
    const opened = parseAnnotatedWorkspace(await file.text(), validateAnnotatedProject);
    const install = () => { installPreparedProjectEnvelope(opened.prepared, null, {
      annotations: opened.workspace.annotations, subcircuits: opened.workspace.subcircuits,
    }); };
    closeCanvasAnnotations({ restoreFocus: false });
    if (requestUnsavedChangeGuard({ profile: AVR_PROFILE, actionLabel: 'opening this annotated project', continueAction: install })) return;
    install();
  } catch (error) { elements.canvasannotationsstatus.textContent = `Annotated project rejected (${error.code ?? error.message}). Current document unchanged.`; }
});
window.__X66_CANVAS_ANNOTATIONS__ = Object.freeze({
  schema: CANVAS_ANNOTATIONS_SCHEMA, netLabelsSchema: NET_LABELS_SCHEMA, workspaceSchema: ANNOTATED_WORKSPACE_SCHEMA,
  snapshot: () => ensureCanvasAnnotations().snapshot(), workspaceText: () => canonicalCurrentAnnotatedWorkspace(),
  authority: Object.freeze({ electrical: false, source: false, build: false, run: false, verdict: false }),
});
window.__X66_BOUNDED_SUBCIRCUITS__ = Object.freeze({
  schema: SUBCIRCUITS_SCHEMA,
  snapshot: () => structuredClone(boundedSubcircuits),
  authority: Object.freeze({ build: false, run: false, runtime: false, worker: false, producer: false }),
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
let pendingAuthoredChangeReview = null;
let loadedExpectationReference = null;
let experimentPackageRefreshToken = 0;
let experimentPackageUiState = { ready: false, reason: 'AVR thermostat project required', sha256: null };
function expectationReferenceFilename() {
  const stem = profileProjectName(AVR_PROFILE).normalize('NFKD')
    .replace(/[^A-Za-z0-9 _.-]/gu, '').trim().replace(/\s+/gu, '-').slice(0, 64);
  return `${stem || 'avr-thermostat'}.intent-mcu-expectations.json`;
}
function currentExpectationReferenceMatch() {
  if (!loadedExpectationReference?.ok) return false;
  const prepared = prepareProjectEnvelope(commonProjectText(AVR_PROFILE), commonProjectAdapters);
  return prepared.ok && expectationReferenceMatchesPrepared(loadedExpectationReference.reference, prepared);
}
function experimentPackageBaseEligibility() {
  if (selectedCompilerProfile !== AVR_PROFILE) {
    return { ok: false, reason: 'Available only for the AVR thermostat experiment.' };
  }
  if (!thermostatProjectActive()) {
    return { ok: false, reason: 'Open the AVR thermostat example first.' };
  }
  const timeline = scenarioTimelineEditor?.timeline ?? null;
  if (!timeline) return { ok: false, reason: 'An authored scenario timeline is required.' };
  if (!loadedExpectationReference?.ok) {
    return { ok: false, reason: 'Lock or open the matching expectation reference.' };
  }
  if (!currentExpectationReferenceMatch()) {
    return { ok: false, reason: 'The expectation reference does not match the current authored tests.' };
  }
  if (thermostatExperimentRun) return { ok: false, reason: 'Wait for the active experiment to finish.' };
  if (!thermostatRuntimeReady() || !lifecycle.artifact?.artifactIdentity) {
    return { ok: false, reason: 'Build this exact project before producing the report.' };
  }
  const runtimeIdentity = window.__M6_STATE__.runtime?.runtimeIdentity;
  const activeModelLock = modelLibraryLockFor(AVR_PROFILE);
  const producerCurrent = latestBuildResult?.artifactIdentity === lifecycle.artifact.artifactIdentity
    && latestBuildResult?.inputIdentity === lifecycle.artifact.inputIdentity
    && latestBuildResult?.toolchainIdentitySha256 === currentCompilerTarget().toolchainIdentitySha256
    && /^sha256:[a-f0-9]{64}$/u.test(latestBuildResult?.toolchainImageId ?? '')
    && runtimeIdentity?.projectGeneration === lifecycle.artifact.projectGeneration
    && runtimeIdentity?.runtimeGeneration === lifecycle.runtimeBinding?.runtimeGeneration
    && runtimeIdentity?.artifactIdentity === lifecycle.artifact.artifactIdentity
    && latestBuildResult?.modelImplementationSha256 === activeModelLock.implementationSha256
    && runtimeIdentity?.modelImplementationSha256 === activeModelLock.implementationSha256
    && runtimeIdentity?.modelExecutionContextSha256 === latestBuildResult?.modelExecutionContextSha256
    && window.__M6_STATE__.runtime?.modelExecutionContextSha256
      === latestBuildResult?.modelExecutionContextSha256;
  if (!producerCurrent) {
    return { ok: false, reason: 'Current compiler and runtime identities are incomplete or stale. Build and run again.' };
  }
  if (authoredScenarioResults.length !== timeline.scenarios.length) {
    return { ok: false, reason: `Run the authored scenarios (${authoredScenarioResults.length}/${timeline.scenarios.length} current).` };
  }
  const complete = authoredScenarioResults.every((result, index) => (
    result.scenarioId === timeline.scenarios[index].id
      && ['passed', 'failed'].includes(result.status)
      && result.outcome?.jobStatus === 'completed'
      && result.outcome?.evidenceStatus === 'complete'
      && result.retention?.inputEventsDropped === 0
  ));
  if (!complete) return { ok: false, reason: 'Current authored evidence is incomplete or has required input loss.' };
  return { ok: true, reason: `${timeline.scenarios.length} current measured scenarios · checking exact binding…`, timeline,
    producer: {
      artifactIdentitySha256: lifecycle.artifact.artifactIdentity,
      inputIdentitySha256: lifecycle.artifact.inputIdentity,
      toolchainImageId: latestBuildResult.toolchainImageId,
      toolchainIdentitySha256: latestBuildResult.toolchainIdentitySha256,
      projectGeneration: lifecycle.artifact.projectGeneration,
      buildGeneration: lifecycle.artifact.buildGeneration,
      runtimeGeneration: lifecycle.runtimeBinding.runtimeGeneration,
      runtimeIdentity: structuredClone(runtimeIdentity),
      modelImplementationSha256: latestBuildResult.modelImplementationSha256,
      modelExecutionContextSha256: latestBuildResult.modelExecutionContextSha256,
    } };
}
function showExperimentPackageState(ready, reason, sha256 = null) {
  experimentPackageUiState = { ready, reason, sha256 };
  elements.experimentpackagedownload.disabled = !ready;
  elements.experimentpackagestate.dataset.ready = String(ready);
  elements.experimentpackagestate.textContent = reason;
}
async function refreshExperimentPackageState() {
  const token = ++experimentPackageRefreshToken;
  const eligibility = experimentPackageBaseEligibility();
  if (!eligibility.ok) {
    showExperimentPackageState(false, eligibility.reason);
    return eligibility;
  }
  showExperimentPackageState(false, eligibility.reason);
  let currentText;
  try { currentText = commonProjectText(AVR_PROFILE); }
  catch (error) {
    if (token === experimentPackageRefreshToken) showExperimentPackageState(false,
      `Current project is not packageable (${error.code ?? error.message}).`);
    return { ok: false, reason: 'project-invalid' };
  }
  const currentSha256 = await projectTextSha256(currentText);
  if (token !== experimentPackageRefreshToken) return { ok: false, reason: 'superseded' };
  if (loadedExpectationReference.reference.originProjectSha256 !== currentSha256) {
    showExperimentPackageState(false, 'The locked reference belongs to an older project revision. Lock it again after review.');
    return { ok: false, reason: 'expectation-stale' };
  }
  const failed = authoredScenarioResults.filter((result) => result.status === 'failed').length;
  showExperimentPackageState(true,
    `${eligibility.timeline.scenarios.length} current measured scenarios · ${failed ? `${failed} failed result retained` : 'complete evidence'} · model-bound identities complete · local download ready`);
  return { ok: true, timeline: eligibility.timeline, currentText, producer: eligibility.producer };
}
function experimentPackageFilename() {
  const stem = profileProjectName(AVR_PROFILE).normalize('NFKD')
    .replace(/[^A-Za-z0-9 _.-]/gu, '').trim().replace(/\s+/gu, '-').slice(0, 64);
  return `${stem || 'avr-thermostat'}.intent-mcu-experiment.json`;
}
async function createCurrentExperimentPackage() {
  const eligibility = await refreshExperimentPackageState();
  if (!eligibility.ok) return { ok: false, code: 'EXPERIMENT_PACKAGE_NOT_READY' };
  return createExperimentPackage({
    projectText: eligibility.currentText,
    adapters: commonProjectAdapters,
    activeProfile: selectedCompilerProfile,
    expectationText: loadedExpectationReference.canonical,
    artifactIdentitySha256: lifecycle.artifact.artifactIdentity,
    sourceVariant: thermostatFirmwareVariant(currentProject()),
    results: authoredScenarioResults,
    producer: eligibility.producer,
  });
}
async function downloadCurrentExperimentPackage() {
  showExperimentPackageState(false, 'Validating the exact local package…');
  const created = await createCurrentExperimentPackage();
  if (!created.ok) {
    showExperimentPackageState(false, `Package rejected (${created.code}). Nothing was downloaded.`);
    return created;
  }
  const reparsed = await parseExperimentPackage(created.canonical, commonProjectAdapters);
  if (!reparsed.ok || reparsed.sha256 !== created.sha256) {
    showExperimentPackageState(false, `Package self-check failed (${reparsed.code ?? 'HASH_MISMATCH'}). Nothing was downloaded.`);
    return { ok: false, code: reparsed.code ?? 'EXPERIMENT_PACKAGE_HASH_MISMATCH' };
  }
  const measurementEnvelope = await createMeasurementReportEnvelope(reparsed.value.report);
  await validateMeasurementReportEnvelope(measurementEnvelope);
  if (!measurementEnvelope.measurementCompleteness.completeForRequirements) {
    showExperimentPackageState(false,
      `Package rejected: current measurement evidence is incomplete (${measurementEnvelope.measurementCompleteness.missingEvidence.length} declared gaps). Nothing was downloaded.`);
    return { ok: false, code: 'MEASUREMENT_COMPLETENESS_REQUIRED' };
  }
  downloadText(experimentPackageFilename(), created.canonical, 'application/json');
  showExperimentPackageState(true,
    `Local package downloaded · SHA-256 ${created.sha256.slice(0, 12)}… · measurement completeness ${measurementEnvelope.measurementCompleteness.projectionSha256.slice(0, 12)}… (identity/integrity, not truth) · review your authored text before sharing.`, created.sha256);
  return created;
}

const experimentPackageComparisonSlots = { before: null, after: null };
let acceptedExperimentPackageComparison = null;
let experimentPackageComparisonGeneration = 0;

function emptyComparisonGroup(root, message) {
  const item = document.createElement('p');
  item.className = 'requirement-trace-empty';
  item.textContent = message;
  root.replaceChildren(item);
}

function clearAcceptedExperimentPackageComparison(message = 'Choose two canonical strict-v3 packages. Files stay in this tab only.') {
  experimentPackageComparisonGeneration += 1;
  acceptedExperimentPackageComparison = null;
  elements.experimentpackagecomparisonreview.hidden = true;
  elements.experimentpackagecomparisonstate.textContent = experimentPackageComparisonSlots.before
    || experimentPackageComparisonSlots.after ? 'Not compared' : 'Empty';
  elements.experimentpackagecomparisonstatus.dataset.valid = '';
  elements.experimentpackagecomparisonstatus.textContent = message;
  emptyComparisonGroup(elements.experimentpackagecomparisonidentities, 'No accepted identity comparison.');
  emptyComparisonGroup(elements.experimentpackagecomparisonsource, 'No accepted source comparison.');
  emptyComparisonGroup(elements.experimentpackagecomparisoncircuit, 'No accepted circuit comparison.');
  emptyComparisonGroup(elements.experimentpackagecomparisonresults, 'No accepted result comparison.');
}

function renderExperimentPackageComparisonSlotState() {
  elements.experimentpackagebeforename.textContent = experimentPackageComparisonSlots.before?.name
    ?? 'No Before file';
  elements.experimentpackageaftername.textContent = experimentPackageComparisonSlots.after?.name
    ?? 'No After file';
  elements.experimentpackagecompare.disabled = !(experimentPackageComparisonSlots.before
    && experimentPackageComparisonSlots.after);
  elements.experimentpackagecomparisonclear.disabled = !(experimentPackageComparisonSlots.before
    || experimentPackageComparisonSlots.after || acceptedExperimentPackageComparison);
}

async function selectExperimentPackageComparisonFile(side, file) {
  clearAcceptedExperimentPackageComparison(`${side === 'before' ? 'Before' : 'After'} selection changed. Revalidation is required.`);
  const generation = experimentPackageComparisonGeneration;
  experimentPackageComparisonSlots[side] = null;
  renderExperimentPackageComparisonSlotState();
  if (!file) {
    elements.experimentpackagecomparisonstatus.textContent = 'Selection cancelled. No prior comparison authority was retained.';
    return null;
  }
  if (file.size > EXPERIMENT_PACKAGE_COMPARISON_LIMITS.packageBytes) {
    elements.experimentpackagecomparisonstatus.dataset.valid = 'false';
    elements.experimentpackagecomparisonstatus.textContent = `Package rejected (X41_PACKAGE_LIMIT). ${side} remains empty.`;
    return null;
  }
  let source;
  try { source = await file.text(); }
  catch {
    if (generation !== experimentPackageComparisonGeneration) {
      return { ok: false, code: 'X41_STALE_SLOT' };
    }
    elements.experimentpackagecomparisonstatus.dataset.valid = 'false';
    elements.experimentpackagecomparisonstatus.textContent = `Package rejected (X41_FILE_READ). ${side} remains empty.`;
    return null;
  }
  const parsed = await parseExperimentComparisonSlot(source, commonProjectAdapters, side);
  if (generation !== experimentPackageComparisonGeneration) return { ok: false, code: 'X41_STALE_SLOT' };
  if (!parsed.ok) {
    elements.experimentpackagecomparisonstatus.dataset.valid = 'false';
    elements.experimentpackagecomparisonstatus.textContent = `Package rejected (${parsed.code}). ${side} remains empty.`;
    return null;
  }
  experimentPackageComparisonSlots[side] = Object.freeze({
    name: file.name, source, sha256: parsed.sha256, bytes: parsed.bytes,
  });
  renderExperimentPackageComparisonSlotState();
  elements.experimentpackagecomparisonstatus.dataset.valid = 'true';
  elements.experimentpackagecomparisonstatus.textContent = `${side === 'before' ? 'Before' : 'After'} accepted locally · SHA-256 ${parsed.sha256}. ${elements.experimentpackagecompare.disabled ? 'Choose the other package.' : 'Ready for strict Compare.'}`;
  return parsed;
}

function comparisonList() {
  const list = document.createElement('ul');
  list.className = 'experiment-package-comparison-list';
  return list;
}

function comparisonRow(title, text, changed = false) {
  const row = document.createElement('li');
  row.className = 'experiment-package-comparison-row';
  row.dataset.changed = String(changed);
  const heading = document.createElement('strong'); heading.textContent = title;
  const body = document.createElement('span'); body.textContent = text;
  row.append(heading, body); return row;
}

function renderAcceptedExperimentPackageComparison(comparison) {
  const identityList = comparisonList();
  for (const key of Object.keys(comparison.before.identities)) {
    identityList.append(comparisonRow(key,
      `Before ${comparison.before.identities[key]} · After ${comparison.after.identities[key]}`,
      comparison.before.identities[key] !== comparison.after.identities[key]));
  }
  identityList.append(comparisonRow('Compatible evidence context',
    `${comparison.compatibility.evidenceAdapterId} · ${comparison.compatibility.evidenceClass} · ${comparison.compatibility.nativeTimeBasis} · ${comparison.compatibility.evidenceRows} rows`, false));
  elements.experimentpackagecomparisonidentities.replaceChildren(identityList);

  const sourceRoot = document.createDocumentFragment();
  for (const diff of comparison.source.diffs) {
    const details = document.createElement('details'); details.className = 'experiment-package-comparison-source-diff';
    const summary = document.createElement('summary');
    summary.textContent = `${diff.name} · literal ${diff.status} · +${diff.addedLines} / −${diff.removedLines}`;
    const pre = document.createElement('pre'); pre.tabIndex = 0; pre.textContent = diff.text;
    details.append(summary, pre); sourceRoot.append(details);
  }
  elements.experimentpackagecomparisonsource.replaceChildren(sourceRoot);

  const circuitList = comparisonList();
  for (const row of comparison.circuit.rows) {
    circuitList.append(comparisonRow(`${row.kind} · ${row.ownerId}`, row.summary, true));
  }
  elements.experimentpackagecomparisoncircuit.replaceChildren(circuitList);

  const resultList = comparisonList();
  for (const row of comparison.results) {
    const level = (value) => value ? 'HIGH' : 'LOW';
    resultList.append(comparisonRow(row.id,
      `Expected ${level(row.expected.level)} · Before ${level(row.before.observed.level)} (${row.before.reportedAcademicStatus}, ${row.before.evidenceStatus}) at ${row.before.virtualMilliseconds} ms · After ${level(row.after.observed.level)} (${row.after.reportedAcademicStatus}, ${row.after.evidenceStatus}) at ${row.after.virtualMilliseconds} ms`, row.changed));
  }
  elements.experimentpackagecomparisonresults.replaceChildren(resultList);
  elements.experimentpackagecomparisonreview.hidden = false;
  elements.experimentpackagecomparisonstate.textContent = 'Compatible';
  elements.experimentpackagecomparisonstatus.dataset.valid = 'true';
  elements.experimentpackagecomparisonstatus.textContent = `Compatible retained contexts · reported Before ${comparison.before.reportedAcademicStatus} / After ${comparison.after.reportedAcademicStatus} · literal facts only, no new verdict or causal claim.`;
}

async function compareSelectedExperimentPackages() {
  const before = experimentPackageComparisonSlots.before;
  const after = experimentPackageComparisonSlots.after;
  clearAcceptedExperimentPackageComparison('Strictly reparsing both original package texts…');
  if (!before || !after) return { ok: false, code: 'X41_BOTH_SLOTS_REQUIRED' };
  const generation = experimentPackageComparisonGeneration;
  const result = await compareExperimentPackages({
    beforeSource: before.source,
    afterSource: after.source,
    adapters: commonProjectAdapters,
    expectedBeforeSha256: before.sha256,
    expectedAfterSha256: after.sha256,
  });
  if (generation !== experimentPackageComparisonGeneration
      || experimentPackageComparisonSlots.before?.sha256 !== before.sha256
      || experimentPackageComparisonSlots.after?.sha256 !== after.sha256) {
    return { ok: false, code: 'X41_STALE_SLOT' };
  }
  if (!result.ok) {
    elements.experimentpackagecomparisonstatus.dataset.valid = 'false';
    elements.experimentpackagecomparisonstatus.textContent = `Compare rejected (${result.code}). No comparison authority was retained.`;
    return result;
  }
  acceptedExperimentPackageComparison = result.comparison;
  renderAcceptedExperimentPackageComparison(result.comparison);
  renderExperimentPackageComparisonSlotState();
  return result;
}

function clearExperimentPackageComparison() {
  experimentPackageComparisonSlots.before = null;
  experimentPackageComparisonSlots.after = null;
  elements.experimentpackagebeforeinput.value = '';
  elements.experimentpackageafterinput.value = '';
  clearAcceptedExperimentPackageComparison();
  renderExperimentPackageComparisonSlotState();
}

let guidedReplayState = null;
let guidedReplayIndex = 0;
let guidedReplayGeneration = 0;
let guidedReplayParentGeneration = 0;
let recipientResponseGeneration = 0;
let acceptedRecipientResponse = null;
let responsePickerOperation = null;
const acceptedRecipientResponseHashes = new Set();

function beginGuidedReplayOperation() {
  return ++guidedReplayGeneration;
}

function guidedReplayOperationCurrent(generation) {
  return generation === guidedReplayGeneration;
}

function beginRecipientResponseOperation(expectedParentSha256 = null) {
  return Object.freeze({
    generation: ++recipientResponseGeneration,
    parentGeneration: guidedReplayParentGeneration,
    parentSha256: guidedReplayState?.packageSha256 ?? null,
    parentSource: guidedReplayState?.canonicalPackage ?? null,
    expectedParentSha256,
  });
}

function recipientResponseOperationCurrent(operation) {
  return Boolean(operation)
    && operation.generation === recipientResponseGeneration
    && operation.parentGeneration === guidedReplayParentGeneration
    && operation.parentSha256 === (guidedReplayState?.packageSha256 ?? null);
}

function invalidateGuidedReplayDialogOperations() {
  guidedReplayGeneration += 1;
  recipientResponseGeneration += 1;
  responsePickerOperation = null;
}

function closeGuidedReplayDialog(returnValue = 'close') {
  invalidateGuidedReplayDialogOperations();
  if (elements.guidedreplaydialog.open) elements.guidedreplaydialog.close(returnValue);
}

function replayIdentityRows(replay) {
  const values = [
    ['Package SHA-256', replay.packageSha256],
    ['Profile', replay.profile],
    ['Experiment', replay.experimentId],
    ['Source variant', replay.sourceVariant],
    ['Project', `${replay.projectName} · ${replay.identities.projectSha256}`],
    ['Source SHA-256', replay.identities.sourceSha256],
    ['Circuit SHA-256', replay.identities.circuitSha256],
    ['Model library', `${replay.identities.modelLibrary.version} · ${replay.identities.modelLibrary.manifestSha256}`],
    ['Capture time', replay.capture.capturedAt ?? 'Unavailable — not recorded by this package version'],
    ['Time basis', 'Virtual milliseconds'],
    ['Completeness', replay.capture.completeness.allEvidenceComplete
      ? `${replay.capture.completeness.scenariosReported}/${replay.capture.completeness.scenariosExpected} scenarios · complete`
      : 'Indeterminate or incomplete'],
  ];
  return values.flatMap(([label, value]) => {
    const term = document.createElement('dt'); term.textContent = label;
    const definition = document.createElement('dd'); definition.textContent = String(value);
    return [term, definition];
  });
}

function replayObservationRows(step) {
  const level = (value) => value ? 'HIGH' : 'LOW';
  const values = [
    ['Requirement IDs', step.requirementIds.length ? step.requirementIds.join(', ') : 'Unavailable — none recorded'],
    ['Expected', `${step.expected.pin} ${level(step.expected.level)}`],
    ['Observed', `${step.observed.pin} ${level(step.observed.level)} · ${step.observed.mode}`],
    ['Observed at', `${step.observedAt} virtual ms`],
    ['Window', `${step.expected.windowStartMilliseconds}–${step.expected.windowEndMilliseconds} virtual ms`],
    ['Recorded outcome', step.recordedOutcome],
    ['Evidence', step.evidenceStatus],
  ];
  return values.flatMap(([label, value]) => {
    const term = document.createElement('dt'); term.textContent = label;
    const definition = document.createElement('dd'); definition.textContent = String(value);
    return [term, definition];
  });
}

function renderGuidedReplayStep(index, focus = false) {
  if (!guidedReplayState) return;
  const steps = guidedReplayState.replay.steps;
  guidedReplayIndex = Math.max(0, Math.min(index, steps.length - 1));
  const step = steps[guidedReplayIndex];
  elements.guidedreplayposition.textContent = `${step.beginning ? 'Beginning · ' : ''}Step ${step.number} of ${step.total}${step.end ? ' · End' : ''}`;
  elements.guidedreplaysteptitle.textContent = step.scenarioName;
  elements.guidedreplayscenarioid.textContent = `Scenario ID: ${step.scenarioId}`;
  elements.guidedreplayselect.value = String(guidedReplayIndex);
  elements.guidedreplayinputs.replaceChildren(...step.inputs.map((input) => {
    const item = document.createElement('li');
    item.textContent = `${input.id} · ${input.componentId} · ${input.text}`;
    return item;
  }));
  elements.guidedreplayobservation.replaceChildren(...replayObservationRows(step));
  elements.guidedreplayexplanation.dataset.outcome = step.recordedOutcome;
  elements.guidedreplayexplanation.textContent = step.explanation;
  elements.guidedreplayprevious.disabled = step.beginning;
  elements.guidedreplaynext.disabled = step.end;
  if (focus) elements.guidedreplaysteptitle.focus();
}

function renderGuidedReplay(result, fileName = 'local package') {
  guidedReplayParentGeneration += 1;
  recipientResponseGeneration += 1;
  guidedReplayState = result;
  guidedReplayIndex = 0;
  acceptedRecipientResponse = null;
  responsePickerOperation = null;
  elements.recipientchoicestatus.textContent = 'Review-only is selected. The active project is unchanged.';
  elements.recipientresponsestatus.textContent = 'No response created or opened.';
  elements.recipientresponserelationship.replaceChildren();
  elements.guidedreplayidentities.replaceChildren(...replayIdentityRows(result.replay));
  elements.guidedreplayselect.replaceChildren(...result.replay.steps.map((step) => {
    const option = document.createElement('option');
    option.value = String(step.index); option.textContent = `${step.number}. ${step.scenarioName}`;
    return option;
  }));
  elements.guidedreplayselect.disabled = false;
  elements.guidedreplaystatus.textContent = `${fileName} accepted locally · ${result.replay.steps.length} authored scenarios with recorded observations · aggregate ${result.replay.recordedAggregate.academicStatus}. No project or runtime authority was imported.`;
  renderGuidedReplayStep(0);
  if (!elements.guidedreplaydialog.open) elements.guidedreplaydialog.showModal();
  elements.guidedreplaytitle.focus();
}

async function openGuidedReplaySourceForOperation(source, fileName, generation) {
  const result = await createGuidedExperimentReplay(source, commonProjectAdapters);
  if (!guidedReplayOperationCurrent(generation)) return { ok: false, code: 'GUIDED_REPLAY_STALE_OPEN' };
  if (!result.ok) {
    elements.guidedreplaystatus.textContent = `Replay rejected (${result.code}). The active project and prior accepted replay are unchanged.`;
    return result;
  }
  renderGuidedReplay(result, fileName);
  return result;
}

async function openGuidedReplaySource(source, fileName = 'local package') {
  const generation = beginGuidedReplayOperation();
  return openGuidedReplaySourceForOperation(source, fileName, generation);
}

async function openGuidedReplayFile(file) {
  const generation = beginGuidedReplayOperation();
  if (!file) return { ok: false, code: 'GUIDED_REPLAY_FILE_REQUIRED' };
  if (file.size > EXPERIMENT_PACKAGE_LIMIT) {
    if (guidedReplayOperationCurrent(generation)) elements.guidedreplaystatus.textContent = 'Replay rejected (INPUT_LIMIT). The active project and prior accepted replay are unchanged.';
    return { ok: false, code: 'INPUT_LIMIT' };
  }
  let source;
  try { source = await file.text(); }
  catch {
    if (guidedReplayOperationCurrent(generation)) elements.guidedreplaystatus.textContent = 'Replay rejected (GUIDED_REPLAY_READ_FAILED). The active project is unchanged.';
    return { ok: false, code: 'GUIDED_REPLAY_READ_FAILED' };
  }
  if (!guidedReplayOperationCurrent(generation)) return { ok: false, code: 'GUIDED_REPLAY_STALE_OPEN' };
  return openGuidedReplaySourceForOperation(source, file.name, generation);
}

function recipientArtifactStem() {
  return (guidedReplayState?.replay.projectName ?? 'experiment').normalize('NFKD')
    .replace(/[^A-Za-z0-9 _.-]/gu, '').trim().replace(/\s+/gu, '-').slice(0, 64)
    || 'experiment';
}

function downloadRecipientHandover() {
  if (!guidedReplayState?.canonicalPackage) return { ok: false, code: 'RECIPIENT_HANDOVER_REQUIRED' };
  downloadText(`${recipientArtifactStem()}.intent-mcu-handover.json`,
    guidedReplayState.canonicalPackage, 'application/json');
  elements.recipientchoicestatus.textContent = `Handover copy requested · parent SHA-256 ${guidedReplayState.packageSha256}. Transfer it manually through a channel you choose.`;
  return { ok: true, code: 'RECIPIENT_HANDOVER_DOWNLOADED',
    canonical: guidedReplayState.canonicalPackage, sha256: guidedReplayState.packageSha256 };
}

async function openRecipientPackagedProject() {
  if (!guidedReplayState?.canonicalPackage) return { ok: false, code: 'RECIPIENT_HANDOVER_REQUIRED' };
  const parsed = await parseExperimentPackage(guidedReplayState.canonicalPackage, commonProjectAdapters);
  if (!parsed.ok || parsed.sha256 !== guidedReplayState.packageSha256) {
    elements.recipientchoicestatus.textContent = `Project Open rejected (${parsed.code ?? 'RECIPIENT_HANDOVER_STALE'}). The active project is unchanged.`;
    return { ok: false, code: parsed.code ?? 'RECIPIENT_HANDOVER_STALE' };
  }
  const projectText = `${JSON.stringify(parsed.value.project, null, 2)}\n`;
  const file = new File([projectText], `${recipientArtifactStem()}.intent-mcu-project.json`,
    { type: 'application/json' });
  closeGuidedReplayDialog('project-open');
  const result = await openCommonProjectFile(file);
  elements.recipientchoicestatus.textContent = result.pending
    ? 'Existing unsaved-change guard is waiting for your choice. Nothing has been replaced yet.'
    : result.ok
      ? 'Packaged authored project opened explicitly. Firmware, runtime, result and verdict authority were not restored.'
      : `Project Open rejected (${result.code}). Existing work is unchanged.`;
  return result;
}

async function createAndDownloadRecipientResponse() {
  const operation = beginRecipientResponseOperation();
  if (!operation.parentSource) return { ok: false, code: 'RECIPIENT_HANDOVER_REQUIRED' };
  const result = await createRecipientResponse({
    parentSource: operation.parentSource,
    adapters: commonProjectAdapters,
    disposition: elements.recipientresponsedisposition.value,
    note: elements.recipientresponsenote.value,
  });
  if (!recipientResponseOperationCurrent(operation)) return { ok: false, code: 'RECIPIENT_RESPONSE_STALE_OPEN' };
  if (!result.ok) {
    elements.recipientresponsestatus.textContent = `Response rejected (${result.code}). Nothing was downloaded.`;
    return result;
  }
  downloadText(`${recipientArtifactStem()}.intent-mcu-response.json`, result.canonical, 'application/json');
  elements.recipientresponsestatus.textContent = `Local response downloaded · SHA-256 ${result.sha256} · parent ${result.parentPackageSha256}. It will not apply itself.`;
  return result;
}

function renderAcceptedRecipientResponse(result, fileName = 'local response') {
  acceptedRecipientResponse = result;
  acceptedRecipientResponseHashes.add(result.sha256);
  const values = [
    ['File', fileName], ['Relationship', 'Exact parent package'],
    ['Response SHA-256', result.sha256], ['Parent SHA-256', result.parentPackageSha256],
    ['Disposition', result.value.review.disposition], ['Note', result.value.review.note],
  ];
  elements.recipientresponserelationship.replaceChildren(...values.flatMap(([label, value]) => {
    const term = document.createElement('dt'); term.textContent = label;
    const definition = document.createElement('dd'); definition.textContent = value;
    return [term, definition];
  }));
  elements.recipientresponsestatus.textContent = 'Response accepted as a local data-only child of the exact open handover. No change was applied.';
}

async function openRecipientResponseSourceForOperation(source, fileName, operation) {
  if (!operation.parentSource) return { ok: false, code: 'RECIPIENT_HANDOVER_REQUIRED' };
  const result = await parseRecipientResponse(source, {
    parentSource: operation.parentSource,
    adapters: commonProjectAdapters,
    expectedParentSha256: operation.expectedParentSha256,
    seenResponseSha256: acceptedRecipientResponseHashes,
  });
  if (!recipientResponseOperationCurrent(operation)) return { ok: false, code: 'RECIPIENT_RESPONSE_STALE_OPEN' };
  if (!result.ok) {
    elements.recipientresponsestatus.textContent = `Response rejected (${result.code}). The active project and accepted relationship are unchanged.`;
    return result;
  }
  renderAcceptedRecipientResponse(result, fileName);
  return result;
}

async function openRecipientResponseSource(source, fileName = 'local response', expectedParentSha256 = null) {
  const operation = beginRecipientResponseOperation(expectedParentSha256);
  return openRecipientResponseSourceForOperation(source, fileName, operation);
}

async function openRecipientResponseFile(file, expectedParentSha256 = null, selectedOperation = null) {
  const operation = selectedOperation ?? beginRecipientResponseOperation(expectedParentSha256);
  if (!file) return { ok: false, code: 'RECIPIENT_RESPONSE_FILE_REQUIRED' };
  if (file.size > RECIPIENT_RESPONSE_LIMIT) {
    if (recipientResponseOperationCurrent(operation)) elements.recipientresponsestatus.textContent = 'Response rejected (RECIPIENT_RESPONSE_LIMIT). Existing work is unchanged.';
    return { ok: false, code: 'RECIPIENT_RESPONSE_LIMIT' };
  }
  let source;
  try { source = await file.text(); }
  catch {
    if (recipientResponseOperationCurrent(operation)) elements.recipientresponsestatus.textContent = 'Response rejected (RECIPIENT_RESPONSE_READ_FAILED). Existing work is unchanged.';
    return { ok: false, code: 'RECIPIENT_RESPONSE_READ_FAILED' };
  }
  if (!recipientResponseOperationCurrent(operation)) return { ok: false, code: 'RECIPIENT_RESPONSE_STALE_OPEN' };
  return openRecipientResponseSourceForOperation(source, file.name, operation);
}

function renderExpectationReference() {
  const supported = selectedCompilerProfile === AVR_PROFILE && thermostatProjectActive()
    && Boolean(scenarioTimelineEditor?.timeline);
  elements.expectationreferencelock.disabled = !supported;
  if (!loadedExpectationReference?.ok) {
    elements.expectationreferencestatus.dataset.valid = '';
    elements.expectationreferencestatus.textContent = supported
      ? 'No independent expectation reference loaded. Lock this authored thermostat timeline before requesting a firmware change.'
      : 'Expectation locking is available only for the supported AVR thermostat project.';
    elements.expectationreferenceidentity.textContent = 'Unlocked';
    void refreshExperimentPackageState();
    return;
  }
  const matches = currentExpectationReferenceMatch();
  elements.expectationreferencestatus.dataset.valid = String(matches);
  elements.expectationreferencestatus.textContent = matches
    ? 'Locked local reference matches the current authored tests. Firmware may change without changing this baseline.'
    : 'Loaded reference is valid, but current authored tests differ. Generate a new lock only after reviewing that test change.';
  elements.expectationreferenceidentity.textContent = `SHA-256 ${loadedExpectationReference.sha256}`;
  void refreshExperimentPackageState();
}
async function lockCurrentExpectationReference() {
  const result = await createExpectationReference(
    commonProjectText(AVR_PROFILE), commonProjectAdapters, AVR_PROFILE,
  );
  if (!result.ok) {
    elements.expectationreferencestatus.dataset.valid = 'false';
    elements.expectationreferencestatus.textContent = `Lock rejected (${result.code}). No file or reference was created.`;
    return result;
  }
  loadedExpectationReference = result;
  downloadText(expectationReferenceFilename(), result.canonical, 'application/json');
  clearProjectPatchReview('Expectations locked independently. Generate a fresh reference-bound patch prompt.');
  renderExpectationReference();
  return result;
}
async function openExpectationReferenceFile(file) {
  if (!file) return { ok: false, code: 'EXPECTATION_REFERENCE_FILE_REQUIRED' };
  if (file.size > EXPECTATION_REFERENCE_LIMIT) {
    elements.expectationreferencestatus.dataset.valid = 'false';
    elements.expectationreferencestatus.textContent = 'Open rejected (INPUT_LIMIT). The current reference is unchanged.';
    return { ok: false, code: 'INPUT_LIMIT' };
  }
  let source;
  try { source = await file.text(); }
  catch {
    elements.expectationreferencestatus.dataset.valid = 'false';
    elements.expectationreferencestatus.textContent = 'Open rejected (EXPECTATION_REFERENCE_READ_FAILED).';
    return { ok: false, code: 'EXPECTATION_REFERENCE_READ_FAILED' };
  }
  const result = await parseExpectationReference(source);
  if (!result.ok) {
    elements.expectationreferencestatus.dataset.valid = 'false';
    elements.expectationreferencestatus.textContent = `Open rejected (${result.code}). The current reference is unchanged.`;
    return result;
  }
  loadedExpectationReference = result;
  clearProjectPatchReview('Independent reference opened. Generate a fresh reference-bound patch prompt.');
  renderExpectationReference();
  return result;
}
function clearExpectationReference() {
  loadedExpectationReference = null;
  clearProjectPatchReview('Project changed or opened. Lock or open its independent expectations before requesting a referenced patch.');
  renderExpectationReference();
}
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
function clearAuthoredChangeReview() {
  pendingAuthoredChangeReview = null;
  elements.authoredchangereview.hidden = true;
  elements.authoredchangereviewsummary.textContent = 'No detailed review';
  elements.authoredchangereviewstatus.textContent = 'Review a valid proposal to inspect exact authored differences.';
  elements.authoredchangereviewidentities.replaceChildren();
  elements.authoredchangereviewrows.replaceChildren();
  elements.authoredchangereviewdiffs.replaceChildren();
  elements.authoredchangereviewshowsource.disabled = true;
}
function clearProjectPatchReview(message = 'No project mutation has been proposed.') {
  pendingProjectPatch = null;
  clearAuthoredChangeReview();
  elements.projectpatchapply.disabled = true;
  elements.designcomparisoncreate.disabled = true;
  clearDesignComparison();
  elements.projectpatchsummary.textContent = 'No proposal reviewed';
  elements.projectpatchstatus.dataset.valid = '';
  elements.projectpatchstatus.textContent = message;
  const empty = document.createElement('p'); empty.className = 'requirement-trace-empty';
  empty.textContent = 'No implementation changes reviewed.';
  const expectationEmpty = empty.cloneNode(); expectationEmpty.textContent = 'No test or expectation changes reviewed.';
  elements.projectpatchimplementationchanges.replaceChildren(empty);
  elements.projectpatchexpectationchanges.replaceChildren(expectationEmpty);
}
function patchChangeRows(changes, emptyText) {
  if (!changes.length) {
    const empty = document.createElement('p'); empty.className = 'requirement-trace-empty';
    empty.textContent = emptyText; return [empty];
  }
  return changes.map((change) => {
    const row = document.createElement('div'); row.className = 'project-patch-change';
    const kind = document.createElement('strong'); kind.textContent = change.kind;
    const action = document.createElement('b'); action.dataset.action = change.action; action.textContent = change.action;
    const summary = document.createElement('span'); summary.textContent = change.summary;
    row.append(kind, action, summary); return row;
  });
}
function renderAuthoredChangeReview(value, unavailable = null) {
  if (!value || value.schema !== AUTHORED_CHANGE_REVIEW_SCHEMA) {
    clearAuthoredChangeReview();
    if (unavailable?.code) {
      elements.authoredchangereview.hidden = false;
      elements.authoredchangereviewsummary.textContent = 'Detailed review unavailable';
      elements.authoredchangereviewstatus.textContent = `${unavailable.code}. The existing validated X05 review and Apply boundary are unchanged.`;
    }
    return;
  }
  pendingAuthoredChangeReview = structuredClone(value);
  elements.authoredchangereview.hidden = false;
  elements.authoredchangereviewsummary.textContent = `${value.summaryRows.length} authored change${value.summaryRows.length === 1 ? '' : 's'} · ${value.sourceDiffs.length} source file${value.sourceDiffs.length === 1 ? '' : 's'}`;
  elements.authoredchangereviewstatus.textContent = 'Compared exact reviewed project identities without mutation, execution or inferred source meaning.';
  const identityRows = [
    ['Profile', value.profile],
    ['Current project', value.baseProjectSha256],
    ['Proposed project', value.candidateProjectSha256],
  ].flatMap(([label, identity]) => {
    const heading = document.createElement('strong'); heading.textContent = label;
    const code = document.createElement('code'); code.textContent = identity;
    return [heading, code];
  });
  elements.authoredchangereviewidentities.replaceChildren(...identityRows);
  elements.authoredchangereviewrows.replaceChildren(...patchChangeRows(
    value.summaryRows, 'No authored source, component, wire, test or expectation differences.',
  ));
  const diffs = value.sourceDiffs.map((diff) => {
    const details = document.createElement('details'); details.className = 'authored-source-diff';
    details.dataset.sourceFile = diff.name; details.dataset.algorithm = diff.algorithm;
    const summary = document.createElement('summary');
    summary.textContent = `${diff.name} · ${diff.status} · +${diff.addedLines} / −${diff.removedLines}${diff.minimal ? '' : ' · complete non-minimal replacement'}`;
    const source = document.createElement('pre'); source.tabIndex = 0;
    source.setAttribute('aria-label', `Literal source difference for ${diff.name}`);
    source.textContent = diff.text;
    details.append(summary, source); return details;
  });
  if (!diffs.length) {
    const empty = document.createElement('p'); empty.className = 'requirement-trace-empty';
    empty.textContent = 'No authored source file changed. Typed project differences remain visible above.';
    diffs.push(empty);
  }
  elements.authoredchangereviewdiffs.replaceChildren(...diffs);
  elements.authoredchangereviewshowsource.disabled = value.sourceDiffs.length === 0;
}
function renderProjectPatchReview(reviewed) {
  pendingProjectPatch = reviewed;
  elements.projectpatchapply.disabled = reviewed.result.applyBlocked;
  elements.designcomparisoncreate.disabled = false;
  clearDesignComparison('Proposal reviewed. Compare it with the current design before Apply.');
  elements.projectpatchsummary.textContent = `${reviewed.result.changes.length} proposed change${reviewed.result.changes.length === 1 ? '' : 's'}`;
  elements.projectpatchstatus.dataset.valid = String(!reviewed.result.applyBlocked);
  elements.projectpatchstatus.textContent = reviewed.result.applyBlocked
    ? 'Review complete: tests or expectations changed separately. Apply is blocked (PROJECT_PATCH_EXPECTATIONS_CHANGED); the locked baseline and project are unchanged.'
    : reviewed.result.expectationReferenceState === 'locked'
      ? 'Reference-bound proposal validated. Tests and expectations are unchanged; review the implementation rows before explicit Apply.'
      : 'Unlocked v1 proposal validated without an independent expectation reference. Review every row; this makes no X25 claim.';
  elements.projectpatchimplementationchanges.replaceChildren(...patchChangeRows(
    reviewed.result.implementationChanges, 'No implementation changes.',
  ));
  elements.projectpatchexpectationchanges.replaceChildren(...patchChangeRows(
    reviewed.result.testExpectationChanges, 'No test or expectation changes.',
  ));
  renderAuthoredChangeReview(reviewed.result.authoredChangeReview, reviewed.result.authoredChangeReviewUnavailable);
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
  const prompt = await createProjectPatchPrompt(description.trim(), commonProjectText(profile),
    commonProjectAdapters, profile, loadedExpectationReference);
  elements.projectpatchprompt.value = prompt;
  elements.projectpatchcopy.disabled = false;
  elements.projectpatchstatus.dataset.valid = 'true';
  elements.projectpatchstatus.textContent = 'Portable prompt generated locally. No network or AI request was made.';
  return prompt;
}
async function reviewCurrentProjectPatch(source = elements.projectpatchinput.value,
  profile = selectedCompilerProfile) {
  const baseText = commonProjectText(profile);
  const result = await reviewProjectPatch(source, baseText, commonProjectAdapters, profile,
    loadedExpectationReference);
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
  const refreshed = await reviewProjectPatch(reviewed.raw, currentText, commonProjectAdapters,
    reviewed.profile, loadedExpectationReference);
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
  const result = await reviewProjectPatch(reviewed.raw, currentText, commonProjectAdapters,
    reviewed.profile, loadedExpectationReference);
  if (!result.ok || reviewed.profile !== selectedCompilerProfile) {
    const code = reviewed.profile !== selectedCompilerProfile ? 'PROJECT_PATCH_PROFILE_MISMATCH' : result.code;
    clearProjectPatchReview(`Apply rejected (${code}). The current project is unchanged; review a fresh proposal.`);
    elements.projectpatchstatus.dataset.valid = 'false';
    return { ...result, ok: false, code };
  }
  if (result.applyBlocked) {
    elements.projectpatchstatus.dataset.valid = 'false';
    elements.projectpatchstatus.textContent = 'Apply blocked (PROJECT_PATCH_EXPECTATIONS_CHANGED). Review test changes separately; project and locked baseline are unchanged.';
    return { ok: false, code: 'PROJECT_PATCH_EXPECTATIONS_CHANGED' };
  }
  const priorBaseline = projectBaselines.get(reviewed.profile) ?? currentText;
  installPreparedProjectEnvelope(result.proposed, null, { preserveExpectationReference: true });
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
elements.experimentpackagebeforeopen.addEventListener('click', () => {
  clearAcceptedExperimentPackageComparison('Before chooser opened. No prior comparison authority was retained.');
  experimentPackageComparisonSlots.before = null;
  renderExperimentPackageComparisonSlotState();
  elements.experimentpackagebeforeinput.value = '';
  elements.experimentpackagebeforeinput.click();
});
elements.experimentpackageafteropen.addEventListener('click', () => {
  clearAcceptedExperimentPackageComparison('After chooser opened. No prior comparison authority was retained.');
  experimentPackageComparisonSlots.after = null;
  renderExperimentPackageComparisonSlotState();
  elements.experimentpackageafterinput.value = '';
  elements.experimentpackageafterinput.click();
});
elements.experimentpackagebeforeinput.addEventListener('change', () => {
  void selectExperimentPackageComparisonFile('before', elements.experimentpackagebeforeinput.files[0] ?? null);
});
elements.experimentpackageafterinput.addEventListener('change', () => {
  void selectExperimentPackageComparisonFile('after', elements.experimentpackageafterinput.files[0] ?? null);
});
elements.experimentpackagecompare.addEventListener('click', () => { void compareSelectedExperimentPackages(); });
elements.experimentpackagecomparisonclear.addEventListener('click', clearExperimentPackageComparison);
elements.guidedreplayopen.addEventListener('click', () => {
  elements.guidedreplayinput.value = '';
  elements.guidedreplayinput.click();
});
elements.guidedreplayinput.addEventListener('change', () => {
  void openGuidedReplayFile(elements.guidedreplayinput.files[0] ?? null);
});
elements.guidedreplayclose.addEventListener('click', () => closeGuidedReplayDialog('close'));
elements.guidedreplaydialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeGuidedReplayDialog('escape');
});
elements.guidedreplayselect.addEventListener('change', () => {
  renderGuidedReplayStep(Number(elements.guidedreplayselect.value), true);
});
elements.guidedreplayprevious.addEventListener('click', () => renderGuidedReplayStep(guidedReplayIndex - 1, true));
elements.guidedreplaynext.addEventListener('click', () => renderGuidedReplayStep(guidedReplayIndex + 1, true));
elements.recipientreviewonly.addEventListener('click', () => {
  elements.recipientchoicestatus.textContent = 'Review-only selected explicitly. The active project, runtime, budget and history are unchanged.';
});
elements.recipientprojectopen.addEventListener('click', () => { void openRecipientPackagedProject(); });
elements.recipienthandoverdownload.addEventListener('click', downloadRecipientHandover);
elements.recipientresponsedownload.addEventListener('click', () => { void createAndDownloadRecipientResponse(); });
elements.recipientresponseopen.addEventListener('click', () => {
  responsePickerOperation = beginRecipientResponseOperation(guidedReplayState?.packageSha256 ?? null);
  elements.recipientresponseinput.value = '';
  elements.recipientresponseinput.click();
});
elements.recipientresponseinput.addEventListener('change', () => {
  const operation = responsePickerOperation
    ?? beginRecipientResponseOperation(guidedReplayState?.packageSha256 ?? null);
  responsePickerOperation = null;
  void openRecipientResponseFile(elements.recipientresponseinput.files[0] ?? null,
    operation.expectedParentSha256, operation);
});
elements.authoredchangereviewshowsource.addEventListener('click', () => {
  const first = elements.authoredchangereviewdiffs.querySelector('details');
  if (!first) return;
  first.open = true;
  first.querySelector('summary')?.focus();
});
elements.authoredchangereviewback.addEventListener('click', () => elements.authoredchangereviewtitle.focus());
elements.expectationreferencelock.addEventListener('click', () => { void lockCurrentExpectationReference(); });
elements.experimentpackagedownload.addEventListener('click', () => { void downloadCurrentExperimentPackage(); });
elements.expectationreferenceopen.addEventListener('click', () => elements.expectationreferenceinput.click());
elements.expectationreferenceinput.addEventListener('change', async () => {
  const file = elements.expectationreferenceinput.files[0];
  elements.expectationreferenceinput.value = '';
  await openExpectationReferenceFile(file);
});
window.__PROJECT_PATCH__ = Object.freeze({
  schema: PROJECT_PATCH_SCHEMA,
  referencedSchema: REFERENCED_PROJECT_PATCH_SCHEMA,
  schemas: Object.freeze([PROJECT_PATCH_SCHEMA, REFERENCED_PROJECT_PATCH_SCHEMA]),
  prompt: (description, profile = selectedCompilerProfile) => generateCurrentProjectPatchPrompt(description, profile),
  review: (source, profile = selectedCompilerProfile) => reviewCurrentProjectPatch(source, profile),
  apply: () => applyReviewedProjectPatch(),
  state: () => pendingProjectPatch ? {
    profile: pendingProjectPatch.profile,
    baseProjectSha256: pendingProjectPatch.result.baseProjectSha256,
    candidateProjectSha256: pendingProjectPatch.result.candidateProjectSha256,
    changes: structuredClone(pendingProjectPatch.result.changes),
    implementationChanges: structuredClone(pendingProjectPatch.result.implementationChanges),
    testExpectationChanges: structuredClone(pendingProjectPatch.result.testExpectationChanges),
    expectationReferenceSha256: pendingProjectPatch.result.expectationReferenceSha256,
    expectationReferenceState: pendingProjectPatch.result.expectationReferenceState,
    applyBlocked: pendingProjectPatch.result.applyBlocked,
    applyBlockCode: pendingProjectPatch.result.applyBlockCode,
    evaluated: false,
    buildAuthority: false,
  } : null,
});
window.__EXPERIMENT_PACKAGE_COMPARISON__ = Object.freeze({
  limits: Object.freeze({ ...EXPERIMENT_PACKAGE_COMPARISON_LIMITS }),
  compare: () => compareSelectedExperimentPackages(),
  clear: () => clearExperimentPackageComparison(),
  state: () => ({
    before: experimentPackageComparisonSlots.before
      ? { name: experimentPackageComparisonSlots.before.name,
        sha256: experimentPackageComparisonSlots.before.sha256,
        bytes: experimentPackageComparisonSlots.before.bytes } : null,
    after: experimentPackageComparisonSlots.after
      ? { name: experimentPackageComparisonSlots.after.name,
        sha256: experimentPackageComparisonSlots.after.sha256,
        bytes: experimentPackageComparisonSlots.after.bytes } : null,
    comparison: acceptedExperimentPackageComparison
      ? structuredClone(acceptedExperimentPackageComparison) : null,
  }),
});
clearExperimentPackageComparison();
window.__X69_GUIDED_REPLAY__ = Object.freeze({
  schema: GUIDED_EXPERIMENT_REPLAY_SCHEMA,
  openText: (source, fileName = 'local package') => openGuidedReplaySource(source, fileName),
  select: (index) => { renderGuidedReplayStep(index); return guidedReplayIndex; },
  state: () => guidedReplayState ? {
    replay: structuredClone(guidedReplayState.replay),
    index: guidedReplayIndex,
    dialogOpen: elements.guidedreplaydialog.open,
  } : null,
});
window.__X74_RECIPIENT_EXCHANGE__ = Object.freeze({
  responseSchema: RECIPIENT_RESPONSE_SCHEMA,
  handover: () => downloadRecipientHandover(),
  openProject: () => openRecipientPackagedProject(),
  createResponse: () => createAndDownloadRecipientResponse(),
  openResponseText: (source, fileName = 'local response', expectedParentSha256 = null) =>
    openRecipientResponseSource(source, fileName, expectedParentSha256),
  state: () => ({
    parentPackageSha256: guidedReplayState?.packageSha256 ?? null,
    acceptedResponse: acceptedRecipientResponse ? {
      sha256: acceptedRecipientResponse.sha256,
      parentPackageSha256: acceptedRecipientResponse.parentPackageSha256,
      relationship: acceptedRecipientResponse.relationship,
      disposition: acceptedRecipientResponse.value.review.disposition,
      note: acceptedRecipientResponse.value.review.note,
    } : null,
    serverStored: false,
    automaticApply: false,
  }),
});
window.__AUTHORED_CHANGE_REVIEW__ = Object.freeze({
  schema: AUTHORED_CHANGE_REVIEW_SCHEMA,
  state: () => pendingAuthoredChangeReview ? structuredClone(pendingAuthoredChangeReview) : null,
});
window.__EXPECTATION_REFERENCE__ = Object.freeze({
  schema: EXPECTATION_REFERENCE_SCHEMA,
  lock: () => lockCurrentExpectationReference(),
  openText: async (source) => {
    const result = await parseExpectationReference(source);
    if (result.ok) {
      loadedExpectationReference = result;
      clearProjectPatchReview('Independent reference opened from data. Generate a fresh reference-bound patch prompt.');
      renderExpectationReference();
    }
    return result;
  },
  state: () => loadedExpectationReference?.ok ? {
    sha256: loadedExpectationReference.sha256,
    canonical: loadedExpectationReference.canonical,
    matchesCurrent: currentExpectationReferenceMatch(),
    executableAuthority: false,
    verdictAuthority: false,
  } : null,
});
window.__X67_EXPERIMENT_PACKAGE__ = Object.freeze({
  state: () => structuredClone(experimentPackageUiState),
  create: () => createCurrentExperimentPackage(),
});
window.__X80_EXPERIMENT_MANIFEST__ = window.__X67_EXPERIMENT_PACKAGE__;
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
function draftRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_REGISTRY_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && /^[a-f0-9-]{16,64}$/u.test(item.id ?? '')) : [];
  } catch { return []; }
}
const RECOVERY_PROFILE_LABELS = Object.freeze({
  [AVR_PROFILE]: 'ATmega328P',
  [RP2040_PROFILE]: 'RP2040 Pico',
  [ESP32C3_PROFILE]: 'ESP32-C3',
  [STM32F429ZI_PROFILE]: 'STM32F429ZI',
});
function storageKeys() {
  const keys = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) keys.push(key);
    }
  } catch { /* unavailable storage produces an honest empty list */ }
  return keys.sort();
}
function draftKeyIdentity(key) {
  if (key === PROJECT_STORAGE_KEY || key === PROJECT_RECOVERY_KEY) {
    return { profile: AVR_PROFILE, draftId: 'legacy-global', journal: key === PROJECT_RECOVERY_KEY };
  }
  for (const [prefix, journal] of [[`${PROJECT_STORAGE_KEY}.tab.`, false], [`${PROJECT_RECOVERY_KEY}.tab.`, true]]) {
    if (key.startsWith(prefix)) return { profile: AVR_PROFILE, draftId: key.slice(prefix.length), journal };
  }
  const prefix = 'intent-mcu.profile-draft.v1.';
  if (!key.startsWith(prefix)) return null;
  for (const profile of [RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE]) {
    const marker = `${prefix}${profile}.tab.`;
    if (key.startsWith(marker)) return { profile, draftId: key.slice(marker.length), journal: false };
  }
  return null;
}
function inspectPreservedDraft(key, raw, registryById = new Map()) {
  const identity = draftKeyIdentity(key);
  if (!identity || typeof raw !== 'string') return null;
  try {
    if (identity.profile === AVR_PROFILE) {
      const prepared = prepareAuthoredProjectEnvelope(raw);
      if (!prepared.ok || prepared.profile !== AVR_PROFILE) throw new Error(prepared.code ?? 'RECOVERY_PROJECT_INVALID');
      const project = prepared.project;
      return { key, raw, ...identity, valid: true, prepared,
        name: project.metadata?.name ?? project.name ?? 'Untitled project',
        components: project.circuit?.components?.length ?? 0, nets: project.circuit?.nets?.length ?? 0,
        migrationOnly: Boolean(prepared.publishedRecovery),
        recoveryRelease: prepared.publishedRecovery?.release ?? null,
        updatedAt: registryById.get(identity.draftId)?.updatedAt ?? null };
    }
    const envelope = JSON.parse(raw);
    if (envelope?.schema !== 'intent-mcu-profile-draft@1' || envelope.profile !== identity.profile
        || !envelope.project || !envelope.circuit || typeof envelope.authoredSource !== 'string'
        || typeof envelope.authoredName !== 'string' || !envelope.authoredName.trim()) throw new Error('PROFILE_DRAFT_IDENTITY');
    const candidate = structuredClone(envelope.project);
    candidate.circuit = structuredClone(envelope.circuit);
    const normalized = commonProjectAdapters[identity.profile].prepare(candidate).project;
    return { key, raw, ...identity, valid: true, project: normalized,
      authoredSource: envelope.authoredSource, authoredName: envelope.authoredName.trim(),
      name: envelope.authoredName.trim(),
      components: normalized.circuit?.components?.length ?? 0, nets: normalized.circuit?.nets?.length ?? 0,
      updatedAt: Number.isNaN(Date.parse(envelope.updatedAt))
        ? registryById.get(identity.draftId)?.updatedAt ?? null : envelope.updatedAt };
  } catch (error) {
    return { key, raw, ...identity, valid: false, code: error.code ?? error.message ?? 'RECOVERY_PROJECT_INVALID',
      name: 'Invalid preserved bytes', components: null, nets: null,
      updatedAt: registryById.get(identity.draftId)?.updatedAt ?? null };
  }
}
function preservedDrafts() {
  const registryById = new Map(draftRegistry().map((item) => [item.id, item]));
  return storageKeys().map((key) => {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch { /* represented by omission */ }
    return inspectPreservedDraft(key, raw, registryById);
  }).filter(Boolean).sort((left, right) => {
    if (left.valid !== right.valid) return left.valid ? -1 : 1;
    return String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')) || left.key.localeCompare(right.key);
  });
}
function preservedDraftLabel(draft) {
  const profile = RECOVERY_PROFILE_LABELS[draft.profile] ?? draft.profile;
  const time = draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : 'saved time unknown';
  const migration = draft.migrationOnly ? ` · ${draft.recoveryRelease} data-only migration` : '';
  const graph = draft.valid ? `${draft.components} parts · ${draft.nets} nets${migration}` : `invalid · ${draft.code}`;
  const location = draft.draftId === activeDraftId ? 'current tab key' : draft.journal ? 'interrupted save' : 'preserved key';
  const identity = draft.draftId === 'legacy-global' ? 'legacy' : draft.draftId.slice(0, 8);
  return `${profile} · ${draft.name} · ${time} · ${graph} · draft ${identity} · ${location}`;
}
function renderDraftRecoveryChoices() {
  const choices = preservedDrafts();
  elements.projectdraftrecovery.replaceChildren(new Option(
    choices.length ? 'Choose any preserved browser draft…' : 'No local drafts found', '', true, true,
  ), ...choices.map((item) => new Option(preservedDraftLabel(item), item.key)));
  elements.projectdraftrecover.disabled = true;
}
function registerActiveDraft(name) {
  if (!activeDraftId) return;
  try {
    const next = [{ id: activeDraftId, name, updatedAt: Date.now() },
      ...draftRegistry().filter((item) => item.id !== activeDraftId)].slice(0, DRAFT_REGISTRY_LIMIT);
    localStorage.setItem(DRAFT_REGISTRY_KEY, JSON.stringify(next));
    renderDraftRecoveryChoices();
  } catch { /* the current in-memory project remains usable */ }
}
function persistProject(message = null) {
  try {
    const text = authoredProjectText(AVR_PROFILE);
    if (new TextEncoder().encode(text).length > 4 * 1024 * 1024) throw new Error('STORAGE_PROJECT_LIMIT');
    localStorage.setItem(activeProjectRecoveryKey, text);
    localStorage.setItem(activeProjectStorageKey, text);
    localStorage.removeItem(activeProjectRecoveryKey);
    registerActiveDraft(currentProject().metadata.name);
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
async function downloadMeasurementReport(report, filename) {
  const envelope = await createMeasurementReportEnvelope(report);
  await validateMeasurementReportEnvelope(envelope);
  downloadText(filename, `${JSON.stringify(envelope, null, 2)}\n`, 'application/json');
  return envelope;
}
function projectFilename() {
  return canvasAnnotationsPresent()
    ? 'intent-mcu-annotated-project.json' : commonProjectFilename(AVR_PROFILE);
}
function boundedProjectText() {
  const text = authoredProjectText(AVR_PROFILE);
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
  canvasAnnotationBaseline = canvasReadabilitySnapshot();
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
  const modelLibraryLock = modelLibraryLockFor(target.profile);
  const resolvedModels = resolveModelLibrary(modelLibraryLock);
  if (!resolvedModels.ok) throw Object.assign(new Error(resolvedModels.code), resolvedModels);
  const runtimePrefix = { [AVR_PROFILE]: 'avr8js@', [RP2040_PROFILE]: 'rp2040js@',
    [ESP32C3_PROFILE]: 'esp32c3-qemu@', [STM32F429ZI_PROFILE]: 'renode@' }[target.profile];
  const modelRuntimeContract = resolvedModels.manifest.runtimeContracts.find(
    (contract) => contract.startsWith(runtimePrefix),
  );
  if (!modelRuntimeContract) throw new Error('MODEL_LIBRARY_RUNTIME_CONTRACT_UNAVAILABLE');
  return JSON.stringify({
    compilerTarget: {
      profile: target.profile,
      fqbn: target.fqbn,
      toolchainIdentitySha256: target.toolchainIdentitySha256,
    },
    source: currentProject().source,
    circuit: runtimeProject?.circuit ?? null,
    modelLibraryLock,
    modelImplementationSha256: resolvedModels.lock.implementationSha256,
    modelRuntimeContract,
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
  elements.trace.replaceChildren(Object.assign(document.createElement('li'), { textContent: 'No D13 observations.' }));
  elements.serialoutput.textContent = 'No firmware bytes.';
  elements.serialcount.textContent = '0 records';
  renderInstrumentEvidence();
  if (serialScrollFrame !== null) cancelAnimationFrame(serialScrollFrame);
  serialScrollFrame = null;
  serialRenderedRecords = 0; serialUnreadRecords = 0; serialAutoscroll = true;
  elements.serialnewoutput.hidden = true; elements.serialresume.hidden = true;
  elements.logicoutput.replaceChildren(Object.assign(document.createElement('li'), { textContent: 'No logic observations.' }));
  elements.logiccount.textContent = '0 transitions';
  elements.logiccursor.textContent = 'Cursor Δ —';
  elements.logicwaveform.replaceChildren();
  elements.pinmode.textContent = '—'; elements.pinlevel.textContent = '—'; elements.pindetail.textContent = '—';
  elements.pindiagnostic.textContent = '—'; elements.pincycle.textContent = '0';
  for (const visual of elements.componentlayer.querySelectorAll('.component-led')) {
    visual.classList.remove('on');
    delete visual.dataset.brightness;
    visual.style.removeProperty('opacity');
    visual.style.removeProperty('filter');
  }
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
  for (const artwork of elements.componentlayer.querySelectorAll('[data-artwork-key^="output-character-lcd-"]')) {
    artwork.dataset.protocolState = 'awaiting-initialization';
    artwork.dataset.line1 = ''; artwork.dataset.line2 = ''; artwork.dataset.line3 = ''; artwork.dataset.line4 = '';
    artwork.querySelector('[data-lcd-line="1"]')?.replaceChildren();
    artwork.querySelector('[data-lcd-line="2"]')?.replaceChildren();
    for (const cell of artwork.querySelectorAll('[data-lcd-cell]')) cell.replaceChildren();
    for (const glyph of artwork.querySelectorAll('[data-lcd-runtime-glyph]')) glyph.remove();
  }
  publish({ runtime: null });
}

function renderInstrumentEvidence(runtime = null) {
  const artifactIdentity = currentProject().build?.artifactIdentity ?? null;
  const evidence = avrInstrumentPresentationEvidence(runtime, artifactIdentity);
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
  const x46Assessment = assessX46UartReadonlyPanel({
    schema: X46_UART_PANEL_INPUT_SCHEMA,
    profile: selectedCompilerProfile,
    lifecyclePhase: lifecycle.phase,
    buildArtifactIdentity: lifecycle.artifact?.artifactIdentity ?? null,
    lifecycleRuntimeBinding: lifecycle.runtimeBinding ? structuredClone(lifecycle.runtimeBinding) : null,
    trustedCurrentWorker: Boolean(worker && currentRuntimeWorkerIdentity && runtime?.runtimeIdentity),
    currentWorkerIdentity: currentRuntimeWorkerIdentity
      ? structuredClone(currentRuntimeWorkerIdentity) : null,
    runtimeSnapshot: runtime ? structuredClone(runtime) : null,
  });
  window.__X46_UART_READONLY_PANEL__ = structuredClone(x46Assessment);
  renderX46UartReadonlyPanel(elements.x46uartpanel, x46Assessment);
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
  const summary = sharedInstrumentPresentationSummary(profile, state);
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
    graph: structuredClone(currentProject().circuit),
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
  try { detent = modelLibraryImplementationFor(AVR_PROFILE).nextEncoderDetent(component, direction); }
  catch (error) {
    showActionableError(elements.projectmessage, error.message, `${action}: ${componentId}`);
    return { ok: false, code: error.message };
  }
  const prepared = selectedCandidateContactControl(componentId, 'detent', detent);
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

function stopRuntime(message = 'No current artifact loaded', {
  updateLifecycle = true, stale = false, preserveX47Terminal = false,
} = {}) {
  retireX48RoomLoop('X48_RUNTIME_RETIRED', { command: 'x48-cancel', restoreControls: false });
  x48RuntimeAuthority = null;
  retireX47Integration('X47_RUNTIME_RETIRED', { preserveTerminal: preserveX47Terminal });
  invalidateDigitalStateRuntimeReport('Runtime worker retirement cleared the prior X33 runtime report. Run the producer check again.');
  clearX40SharedTimeline(`${message}. The prior shared timeline was invalidated.`);
  cancelThermostatExperiment(
    thermostatProjectActive() ? `${message}. A fresh build is required before the experiment can run.` : null,
    { clearResults: true, render: false },
  );
  workerToken += 1;
  if (runtimeReadyDeadlineTimer !== null) clearTimeout(runtimeReadyDeadlineTimer);
  runtimeReadyDeadlineTimer = null;
  worker?.terminate();
  worker = null;
  currentRuntimeWorkerIdentity = null;
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
  beginnerRunIntent = null;
  if (['project.new', 'project.reload', 'project.file-open'].includes(reason)) retireX92Budget(reason);
  retireX47Integration('X47_PROJECT_REPLACED');
  detachOutstandingBuild();
  stopRuntime(runtimeMessage, { updateLifecycle: false });
  counterexampleReductionResult = null;
  counterexampleReductionActive = false;
  applyLifecycle({ type: 'project.install', empty, reason });
  savedRevision = null;
  savedProjectGeneration = null;
  setSelection({ kind: 'none' });
  if (canvasAnnotations) resetCanvasAnnotations();
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
  if (!['project.new', 'project.reload', 'project.file-open'].includes(reason)) {
    queueMicrotask(() => { void syncX92Identity(`project replaced: ${reason}`); });
  }
}

function applyEditor(command, message = command.type) {
  if (boundedSubcircuits.instances.length && !command.type.startsWith('subcircuit.')
      && !['undo', 'redo'].includes(command.type)) {
    const generated = generatedSubcircuitComponentIds();
    if (command.componentId && generated.has(command.componentId)) {
      const rejected = { ok: false, code: 'SUBCIRCUIT_GENERATED_MEMBER_OWNED', revision: editor.revision };
      showActionableError(elements.projectmessage, rejected.code,
        'Use the reusable-stage controls to move or delete generated members atomically.');
      return rejected;
    }
    try {
      const probe = editor.kind === 'candidate-project-v3'
        ? parseEditorSource(editor.saveText(), {
          modelLibraryLock: modelLibraryLockFor(AVR_PROFILE),
          bundle: modelLibraryImplementationFor(AVR_PROFILE),
        }).session
        : new ProjectEditorReducer(currentProject());
      const checked = probe.apply({ ...command, revision: probe.revision }, { running });
      if (checked.ok) contractSubcircuits(checked.project.circuit, boundedSubcircuits, {
        ...subcircuitOptions(), graphKind: probe.kind === 'candidate-project-v3'
          ? 'candidate-project-v3' : 'project-v2',
      });
    } catch (error) {
      const rejected = { ok: false, code: error.code ?? 'SUBCIRCUIT_EXPANSION_MISMATCH', revision: editor.revision };
      showActionableError(elements.projectmessage, rejected.code,
        'This edit would detach a generated member from its reusable stage. The project is unchanged.');
      return rejected;
    }
  }
  if (commandBuildRelevance(command.type) === 'build') {
    beginnerRunIntent = null;
    elements.beginnerrun.disabled = false;
    retireX47Integration('X47_AUTHORED_INPUT_CHANGED');
  }
  const annotationBefore = canvasAnnotations ? canvasAnnotations.snapshot() : null;
  const subcircuitTransition = pendingSubcircuitTransition;
  const result = editor.apply({ ...command, revision: editor.revision }, { running });
  if (!result.ok) {
    pendingSubcircuitTransition = null;
    showActionableError(elements.projectmessage, result.code, `${message}\n${JSON.stringify(result.details ?? [])}`);
    return result;
  }
  if (subcircuitTransition) boundedSubcircuits = structuredClone(subcircuitTransition.after);
  pendingSubcircuitTransition = null;
  if (canvasAnnotations) {
    if (command.type === 'undo') {
      const marker = annotationEditorPast.pop();
      if (marker) { applyAnnotationEditorMarker(marker, 'undo'); annotationEditorFuture.push(marker); }
    } else if (command.type === 'redo') {
      const marker = annotationEditorFuture.pop();
      if (marker) { applyAnnotationEditorMarker(marker, 'redo'); annotationEditorPast.push(marker); }
    } else {
      canvasAnnotations.apply({ type: 'references.reconcile' }, annotationReferences());
      annotationEditorPast.push(annotationEditorMarker(annotationBefore, canvasAnnotations.snapshot(),
        subcircuitTransition ? { before: structuredClone(subcircuitTransition.before),
          after: structuredClone(subcircuitTransition.after) } : null));
      if (annotationEditorPast.length > 100) annotationEditorPast.shift();
      annotationEditorFuture.length = 0;
    }
  }
  const relevance = result.changeRelevance ?? (result.buildRelevant ? 'build' : commandBuildRelevance(command.type));
  if (x40SharedTimeline && !x40TimelineRetainsForLifecycle({ type: 'project.edit', relevance })) {
    clearX40SharedTimeline('A non-visual project edit invalidated the prior shared timeline.');
  }
  if (relevance === 'build') {
    void syncX92Identity('AVR source or electrical graph changed');
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
      return { ok: false, code: 'EDITOR_RECONNECT_SOURCE_REQUIRED' };
    }
    pendingEndpoint = endpoint;
    elements.wirestate.textContent = `${wireMode === 'reconnect' ? 'Reconnect' : 'Wire'} from ${endpointKey(endpoint)} — choose destination.`;
    renderComponents();
    return { ok: true, code: 'EDITOR_WIRE_SOURCE_SELECTED' };
  }
  const from = pendingEndpoint;
  pendingEndpoint = null;
  if (endpointKey(from) === endpointKey(endpoint)) {
    elements.wirestate.textContent = 'Wire selection cancelled.';
    renderComponents();
    return { ok: false, code: 'EDITOR_SELF_CONNECTION' };
  }
  const graph = currentProject().circuit;
  const fromNet = endpointConnection(graph, from);
  const toNet = endpointConnection(graph, endpoint);
  if (wireMode === 'reconnect' || reconnect) {
    if (!fromNet || toNet) {
      elements.wirestate.textContent = 'Reconnect requires one connected source pin and one free destination pin.';
      renderComponents();
      return { ok: false, code: 'EDITOR_RECONNECT_ENDPOINT_INVALID' };
    }
    const result = applyEditor({ type: 'wire.reconnect', netId: fromNet, from, to: endpoint }, `Reconnected ${fromNet}`);
    if (result.ok) {
      selectNet(fromNet);
      wireMode = 'connect';
      elements.reconnectmode.setAttribute('aria-pressed', 'false');
      elements.wirestate.textContent = `Reconnected one branch of ${fromNet}. Other endpoints were unchanged.`;
    }
    return result;
  }
  if (!fromNet && !toNet) {
    const netId = nextEntityId('net', graph.nets.map((net) => net.id));
    const result = applyEditor({ type: 'wire.create', net: { id: netId, endpoints: [from, endpoint] } }, `Created ${netId}`);
    if (result.ok) elements.wirestate.textContent = `Connected ${endpointKey(from)} to ${endpointKey(endpoint)} as ${netId}.`;
    return result;
  } else if (Boolean(fromNet) !== Boolean(toNet)) {
    const netId = fromNet ?? toNet;
    const branchEndpoint = fromNet ? endpoint : from;
    const junctionId = nextEntityId('junction', graph.junctions.map((junction) => junction.id));
    const result = applyEditor({ type: 'wire.branch', netId, endpoint: branchEndpoint, junctionId }, `Branched ${netId}`);
    if (result.ok) elements.wirestate.textContent = `Added ${endpointKey(branchEndpoint)} to ${netId} through explicit junction ${junctionId}.`;
    return result;
  } else if (fromNet === toNet) {
    elements.wirestate.textContent = `Both pins already belong to ${fromNet}.`;
    renderComponents();
    return { ok: false, code: 'EDITOR_ENDPOINT_ALREADY_CONNECTED' };
  } else {
    elements.wirestate.textContent = 'Pins belong to different nets. Delete or reconnect one endpoint first.';
    renderComponents();
    return { ok: false, code: 'EDITOR_NET_CONFLICT' };
  }
}

function renderComponents() {
  const collapsedGenerated = new Set(boundedSubcircuits.instances.filter(({ collapsed }) => collapsed)
    .flatMap(({ id }) => [`${id}-resistor`, `${id}-led`]));
  const cards = currentProject().circuit.components.map((component) => {
    const definition = uiComponentCatalog[component.type];
    const position = screenPoint(currentProject().layout.positions[component.id]);
    const card = document.createElement('article');
    card.className = `circuit-component${selectedComponentId === component.id ? ' selected' : ''}`;
    card.dataset.componentId = component.id;
    card.dataset.componentType = component.type;
    card.classList.toggle('subcircuit-collapsed-member', collapsedGenerated.has(component.id));
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${component.label}, ${definition.displayName}`);
    card.title = `${component.label} · ${definition.displayName} · ${SUPPORT_STATUS[definition.support.status]}`;
    card.style.left = `${position.x * 100}%`; card.style.top = `${position.y * 100}%`;
    card.style.setProperty('--rotation', `${currentProject().layout.positions[component.id].rotation}deg`);
    card.style.setProperty('--part-width', `${definition.artwork.cssWidth}px`);
    card.style.setProperty('--part-height', `${definition.artwork.cssHeight}px`);
    card.append(createComponentArtwork(definition, component, {
      appearancePreset: componentAppearancePreset(currentProject().layout.componentAppearance, component.id, component.type),
      appearanceBody: componentAppearanceBodyOrNull(currentProject().layout.componentAppearance, component.id, component.type),
    }));
    card.append(createTerminalWireLayer(component, definition));
    for (const [pinIndex, pin] of definition.pins.entries()) {
      const anchor = document.createElement('button'); anchor.type = 'button'; anchor.className = 'pin-anchor';
      anchor.dataset.endpoint = `${component.id}.${pin.id}`; anchor.textContent = pin.id;
      anchor.dataset.pinRole = pin.role;
      anchor.dataset.labelSide = pin.anchor.y < 0.5 ? 'top' : 'bottom';
      anchor.style.setProperty('--pin-label-lane', String(pinIndex % 5));
      anchor.title = `${component.id}.${pin.id} · ${pin.label} · ${pin.role}`;
      anchor.setAttribute('aria-label', anchor.title);
      anchor.style.setProperty('--pin-x', String(pin.anchor.x));
      anchor.style.setProperty('--pin-y', String(pin.anchor.y));
      const visibleLabel = document.createElement('span');
      visibleLabel.className = 'pin-anchor-label';
      visibleLabel.setAttribute('aria-hidden', 'true');
      visibleLabel.textContent = pin.label;
      anchor.append(visibleLabel);
      if (pendingEndpoint && endpointKey(pendingEndpoint) === anchor.dataset.endpoint) anchor.classList.add('pending');
      else if (pendingEndpoint) {
        const sourceComponent = currentProject().circuit.components.find(({ id }) => id === pendingEndpoint.component);
        const sourcePin = uiComponentCatalog[sourceComponent?.type]?.pins.find(({ id }) => id === pendingEndpoint.pin);
        const guidance = pinTargetGuidance(sourcePin?.role, pin.role);
        anchor.classList.add(`${guidance}-target`);
        anchor.setAttribute('aria-description', guidance === 'recommended'
          ? 'Recommended named-pin target; final electrical validation still applies.'
          : guidance === 'blocked'
            ? 'Known output conflict; choose another named pin.'
            : 'Possible named-pin target; final electrical validation decides whether the connection is accepted.');
      }
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
    const selectCard = () => {
      selectComponent(component.id);
      renderInspector();
      for (const candidate of elements.componentlayer.querySelectorAll('.circuit-component')) {
        candidate.classList.toggle('selected', candidate.dataset.componentId === component.id);
      }
    };
    card.addEventListener('click', selectCard);
    card.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key) || event.target !== card) return;
      event.preventDefault();
      selectCard();
    });
    cardPointerDrag(card, component.id);
    return card;
  });
  elements.componentlayer.replaceChildren(...cards);
  const annotationGroup = ensureCanvasAnnotations().snapshot().groups.find(({ id }) => id === selectedCanvasAnnotationGroup);
  if (annotationGroup) for (const card of elements.componentlayer.querySelectorAll('.circuit-component')) {
    card.classList.toggle('annotation-highlight', annotationGroup.componentIds.includes(card.dataset.componentId));
  }
  renderCanvasAnnotationOverlay();
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
      [CHARACTER_LCD_20X4_TYPE]: 'character-lcd-20x4',
      [PCF8574_LCD_TYPE]: 'pcf8574-lcd',
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
      [CHARACTER_LCD_20X4_TYPE]: { x: 0.7, y: 0.62 },
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
  if (['resistor.fixed-v1', 'led.basic-v1'].includes(component.type)) {
    const key = component.type === 'resistor.fixed-v1' ? 'ohms' : 'color';
    const value = component.properties[key]; const contract = definition.propertySchema[key] ?? {};
    const row = document.createElement('div'); row.className = 'property-row';
    const label = document.createElement('label'); label.textContent = key === 'ohms' ? 'Resistance (Ω)' : 'LED colour';
    let input;
    if (key === 'color') {
      input = document.createElement('select');
      for (const color of ['red', 'yellow', 'green', 'blue']) {
        const option = document.createElement('option'); option.value = color; option.textContent = color;
        option.selected = color === value; input.append(option);
      }
    } else {
      input = document.createElement('input'); input.type = 'number'; input.value = String(value);
      if (typeof contract.minimum === 'number') input.min = String(contract.minimum);
      if (typeof contract.maximum === 'number') input.max = String(contract.maximum);
      input.step = contract.kind === 'integer' ? '1' : 'any';
    }
    input.id = `${component.id}-${key}`; input.dataset.property = key; label.htmlFor = input.id;
    const status = document.createElement('p'); status.className = 'component-editor-invariant'; status.setAttribute('role', 'status');
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel preview';
    cancel.dataset.componentEditorCancel = 'model';
    const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Apply model property';
    apply.dataset.modelPropertyApply = component.id;
    const previewValue = () => typeof value === 'number' ? Number(input.value) : input.value;
    const valid = () => input.checkValidity() && (typeof value !== 'number' || Number.isInteger(previewValue()));
    const changed = () => previewValue() !== value;
    const update = () => {
      const accepted = valid(); const dirty = changed();
      input.setAttribute('aria-invalid', String(!accepted)); apply.disabled = !accepted || !dirty;
      status.textContent = !accepted
        ? 'Preview rejected · enter a value inside the existing bounded model contract. No project data changed.'
        : dirty
          ? `Model preview only · no project or runtime state has changed. Apply changes ${key}, revalidates the model property and circuit, retires current executable and runtime evidence, and requires a fresh Build before Run. Pins, anchors, named nets, drawing and source stay unchanged.`
          : `Current model value · ${key} is unchanged. Apply is disabled.`;
    };
    input.addEventListener('input', update); input.addEventListener('change', update);
    cancel.addEventListener('click', () => {
      input.value = String(value); update();
      if (document.querySelector('#workbench-inspector-dialog')?.open) input.focus({ preventScroll: true });
    });
    const capturedRevision = editor.revision;
    apply.addEventListener('click', () => {
      if (!valid() || !changed()) return;
      if (editor.revision !== capturedRevision) {
        status.textContent = 'Preview stale · the project changed. Reopen the current value before applying.';
        apply.disabled = true; return;
      }
      const result = applyEditor({ type: 'component.property.set', componentId: component.id, key, value: previewValue() },
        `Updated ${component.id}.${key}`);
      if (!result?.ok) {
        status.textContent = `Model edit rejected (${result?.code ?? 'validation failed'}). The project is unchanged.`;
        apply.disabled = true;
      }
    });
    const actions = document.createElement('div'); actions.className = 'component-editor-actions'; actions.append(cancel, apply);
    row.append(label, input); elements.propertyeditor.replaceChildren(row, status, actions); update();
    return;
  }
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

function setAvrComponentEditorMode(mode, focus = false) {
  if (!['model', 'drawing'].includes(mode)) return;
  const buttons = { model: elements.componenteditormodeltab, drawing: elements.componenteditordrawingtab };
  const panels = { model: elements.componenteditormodelpanel, drawing: elements.componenteditordrawingpanel };
  componentEditorModes.set(componentEditorKey(AVR_PROFILE, selectedComponentId), mode);
  for (const name of ['model', 'drawing']) {
    const active = name === mode;
    buttons[name].setAttribute('aria-selected', String(active)); buttons[name].tabIndex = active ? 0 : -1;
    panels[name].hidden = !active;
  }
  elements.componenteditor.dataset.mode = mode;
  if (focus) buttons[mode].focus({ preventScroll: true });
}

function renderAvrComponentEditor(component) {
  const supported = ['resistor.fixed-v1', 'led.basic-v1'].includes(component?.type);
  elements.componenteditor.hidden = !component || !Object.keys(component.properties ?? {}).length;
  elements.componenteditor.dataset.bounded = String(supported);
  elements.componenteditor.querySelector('.component-editor-heading').hidden = !supported;
  elements.componenteditor.querySelector('.component-editor-tabs').hidden = !supported;
  if (!supported) {
    elements.componenteditormodelpanel.hidden = false;
    elements.componenteditordrawingpanel.hidden = true;
    return;
  }
  setAvrComponentEditorMode(componentEditorModes.get(componentEditorKey(AVR_PROFILE, component.id)) ?? 'model');
}

function appearanceInvariant(component, layout = currentProject().layout) {
  return componentAppearanceInvariantSnapshot({
    componentId: component.id,
    graph: currentProject().circuit,
    layout,
    source: currentProject().source,
    boardProfile: currentProject().boardProfile,
    definition: uiComponentCatalog[component.type],
  });
}

function prepareAppearancePreview(component, preset, body = componentAppearanceBody(
  currentProject().layout.componentAppearance, component?.id, component?.type,
)) {
  const presets = component?.type === 'resistor.fixed-v1' ? RESISTOR_APPEARANCE_PRESETS
    : component?.type === 'led.basic-v1' ? LED_APPEARANCE_PRESETS : [];
  if (!presets.some((item) => item.id === preset)) {
    appearancePreview = null;
    return null;
  }
  const before = appearanceInvariant(component);
  const candidateLayout = structuredClone(currentProject().layout);
  candidateLayout.componentAppearance = withComponentAppearance(
    candidateLayout.componentAppearance, currentProject().circuit, component.id, preset,
  );
  candidateLayout.componentAppearance = withComponentAppearanceBody(
    candidateLayout.componentAppearance, currentProject().circuit, component.id, body,
  );
  const after = appearanceInvariant(component, candidateLayout);
  const review = componentAppearanceInvariantReview(before, after);
  appearancePreview = { componentId: component.id, revision: editor.revision, preset, body, review };
  return appearancePreview;
}

function renderAppearanceEditor(component) {
  const supported = ['resistor.fixed-v1', 'led.basic-v1'].includes(component?.type);
  elements.appearanceeditor.hidden = !supported;
  if (!supported) {
    appearancePreview = null;
    window.__X55_APPEARANCE_STATE__ = null;
    elements.appearancepreview.replaceChildren();
    elements.appearanceapply.disabled = true;
    return;
  }
  const currentPreset = componentAppearancePreset(
    currentProject().layout.componentAppearance, component.id, component.type,
  );
  const currentBody = componentAppearanceBody(
    currentProject().layout.componentAppearance, component.id, component.type,
  );
  if (!appearancePreview || appearancePreview.componentId !== component.id
      || appearancePreview.revision !== editor.revision) {
    prepareAppearancePreview(component, currentPreset);
  }
  const presets = component.type === 'resistor.fixed-v1'
    ? RESISTOR_APPEARANCE_PRESETS : LED_APPEARANCE_PRESETS;
  elements.appearanceeditortitle.textContent = component.type === 'resistor.fixed-v1'
    ? 'Resistor appearance' : 'LED outline appearance';
  const options = presets.map(({ id, label }) => {
    const option = new Option(label, id);
    option.selected = id === appearancePreview.preset;
    return option;
  });
  elements.appearancepreset.replaceChildren(...options);
  for (const [key, input, output] of [
    ['widthPct', elements.appearancewidth, elements.appearancewidthvalue],
    ['heightPct', elements.appearanceheight, elements.appearanceheightvalue],
    ['cornerPct', elements.appearancecorner, elements.appearancecornervalue],
  ]) {
    input.min = String(COMPONENT_BODY_BOUNDS[key].minimum);
    input.max = String(COMPONENT_BODY_BOUNDS[key].maximum);
    input.step = String(COMPONENT_BODY_BOUNDS[key].step);
    input.value = String(appearancePreview.body[key]); output.value = `${appearancePreview.body[key]}%`;
  }
  const definition = uiComponentCatalog[component.type];
  elements.appearancepreview.replaceChildren(createComponentArtwork(
    definition, component, { appearancePreset: appearancePreview.preset, appearanceBody: appearancePreview.body },
  ));
  const connectedNets = currentProject().circuit.nets.filter((net) => net.endpoints.some(
    (endpoint) => endpoint.component === component.id,
  )).length;
  const invariant = appearancePreview.review.equal;
  elements.appearancestatus.textContent = invariant
    ? `Invariant pass · pins ${definition.pins.map(({ id }) => id).join('/')}, ${connectedNets} named nets, ${definition.modelRef}, electrical properties, source, position and rotation unchanged. Preview is not saved until Apply.`
    : 'Invariant failed · Apply is blocked because electrical or anchor state changed.';
  elements.appearanceapply.disabled = !invariant || (appearancePreview.preset === currentPreset
    && JSON.stringify(appearancePreview.body) === JSON.stringify(currentBody));
  window.__X55_APPEARANCE_STATE__ = Object.freeze({
    componentId: component.id,
    currentPreset,
    previewPreset: appearancePreview.preset,
    currentBody,
    previewBody: structuredClone(appearancePreview.body),
    invariant: invariant ? 'equal' : 'changed',
    revision: editor.revision,
  });
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
  renderAppearanceEditor(component);
  renderAvrComponentEditor(component);

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
        const prepared = selectedCandidateContactControl(component.id, key, next);
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
        const prepared = selectedCandidateContactControl(component.id, 'lightLevel', lightLevel);
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
        const prepared = selectedCandidateContactControl(component.id, 'temperatureC', nextTemperatureC);
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
          const prepared = selectedCandidateContactControl(component.id, control.key, value);
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
    : validateCircuit(project.circuit, { modelLibraryLock: modelLibraryLockFor(AVR_PROFILE) });
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
  if (!beginnerRunIntent && !running) {
    const empty = project.circuit.components.length === 0;
    const sourceEmpty = project.source.files.every((file) => !file.content.trim());
    const types = project.circuit.components.map((component) => component.type).sort();
    const blink = project.metadata.name === 'Blink demo'
      && JSON.stringify(types) === JSON.stringify(['board.atmega328p-16mhz-v1', 'led.basic-v1', 'resistor.fixed-v1'].sort());
    elements.beginnersource.hidden = selectedCompilerProfile !== AVR_PROFILE || !empty || !sourceEmpty;
    if (selectedCompilerProfile !== AVR_PROFILE) {
      const [label, status] = beginnerProfileLabels[selectedCompilerProfile]
        ?? ['Continue with selected controller', 'The selected profile uses its own visible controls.'];
      elements.beginnerrun.textContent = label;
      elements.beginnerstatus.textContent = status;
    } else {
      elements.beginnerrun.textContent = empty ? 'Add parts' : blink ? 'Run LED example' : 'Run project';
      elements.beginnerstatus.textContent = empty
        ? `Empty project · 1 Parts → 2 Connect pins → 3 ${sourceEmpty ? 'Write code' : 'Code ready'} → 4 Run.`
        : blink
          ? 'Working LED example · fresh firmware is built when you choose Run.'
          : `${project.metadata.name} · fresh firmware is built when you choose Run.`;
    }
  }
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
  renderComponents(); renderInspector(); renderAvrAccessibleConnections(validation);
  renderRuntimeControls(); renderPublicControllerWorkbench();
  renderThermostatExperimentPanel();
  renderExpectationReference();
  renderProjectNavigation();
  syncPresentationAvailability();
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
  const pins = new Map((Array.isArray(message.pins) ? message.pins : []).map((pin) => [pin.pin, pin]));
  const dutyForPin = (pinLabel) => {
    const pin = pins.get(pinLabel);
    if (Number.isFinite(pin?.pwm?.duty)) return Math.max(0, Math.min(1, pin.pwm.duty));
    return pin?.mode === 'OUTPUT' || pin?.mode === 'DIGITAL_PWM' ? Number(Boolean(pin.level)) : 0;
  };
  for (const support of (Array.isArray(editor.runtimeSupport) ? editor.runtimeSupport : []).filter(
    (item) => item.type === COMMON_CATHODE_RGB_LED_TYPE && item.runtimeProjection,
  )) {
    const artwork = elements.componentlayer.querySelector(
      `[data-component-id="${support.componentId}"] [data-artwork-key="output-rgb-led-common-cathode"]`,
    );
    if (!artwork) continue;
    const duties = Object.fromEntries(['R', 'G', 'B'].map((channel) => [
      channel, dutyForPin(support.runtimeProjection.channels[channel].sourcePin),
    ]));
    Object.assign(duties, modelLibraryImplementationFor(AVR_PROFILE).observeRgb(duties));
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
  const pins = new Map((Array.isArray(message.pins) ? message.pins : []).map((pin) => [pin.pin, pin]));
  for (const support of (Array.isArray(editor.runtimeSupport) ? editor.runtimeSupport : []).filter(
    (item) => item.type === ACTIVE_BUZZER_TYPE && item.runtimeProjection,
  )) {
    const artwork = elements.componentlayer.querySelector(
      `[data-component-id="${support.componentId}"] [data-artwork-key="output-active-buzzer-module"]`,
    );
    if (!artwork) continue;
    const pin = pins.get(support.runtimeProjection.sourcePin);
    const driven = pin?.mode === 'OUTPUT';
    const enabled = modelLibraryImplementationFor(AVR_PROFILE)
      .observeBuzzer(driven && Boolean(pin.level)).enabled;
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
  const pins = new Map((Array.isArray(message.pins) ? message.pins : []).map((pin) => [pin.pin, pin]));
  for (const support of (Array.isArray(editor.runtimeSupport) ? editor.runtimeSupport : []).filter(
    (item) => item.type === SEVEN_SEGMENT_TYPE && item.runtimeProjection,
  )) {
    const artwork = elements.componentlayer.querySelector(
      `[data-component-id="${support.componentId}"] [data-artwork-key="output-seven-segment-common-cathode"]`,
    );
    if (!artwork) continue;
    const drivenSegments = Object.entries(support.runtimeProjection.segments)
      .filter(([, segment]) => {
        const pin = pins.get(segment.sourcePin);
        return pin?.mode === 'OUTPUT' && Boolean(pin.level);
      })
      .map(([segment]) => segment)
      .sort();
    const active = modelLibraryImplementationFor(AVR_PROFILE).observeSevenSegment(drivenSegments);
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
  const pins = new Map((Array.isArray(message.pins) ? message.pins : []).map((pin) => [pin.pin, pin]));
  const trace = Array.isArray(message.trace) ? message.trace : [];
  const published = [];
  for (const support of (Array.isArray(editor.runtimeSupport) ? editor.runtimeSupport : []).filter(
    (item) => [CHARACTER_LCD_TYPE, CHARACTER_LCD_20X4_TYPE].includes(item.type) && item.runtimeProjection,
  )) {
    const is20x4 = support.type === CHARACTER_LCD_20X4_TYPE;
    const renderer = is20x4 ? CHARACTER_LCD_20X4_RENDERER : 'output-character-lcd-16x2-4bit';
    const artwork = elements.componentlayer.querySelector(
      `[data-component-id="${support.componentId}"] [data-artwork-key="${renderer}"]`,
    );
    if (!artwork) continue;
    const mapping = Object.fromEntries(Object.entries(support.runtimeProjection.signals).map(
      ([signal, record]) => [signal, record.sourcePin],
    ));
    let record = characterLcdRuntime.get(support.componentId);
    if (!record || message.cycle < record.cycle || trace.length < record.traceLength) {
      record = {
        decoder: is20x4
          ? modelLibraryImplementationFor(AVR_PROFILE).createCharacterLcd20x4Decoder(mapping)
          : modelLibraryImplementationFor(AVR_PROFILE).createCharacterLcdDecoder(mapping),
        cycle: 0,
        traceLength: 0,
      };
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
    const decodedLines = driven && snapshot.displayOn ? snapshot.lines : (is20x4 ? ['', '', '', ''] : ['', '']);
    const observed = modelLibraryImplementationFor(AVR_PROFILE)
      .evaluateProduction(support.type, { lines: decodedLines });
    if (!observed.ok) throw Object.assign(new Error(observed.code), observed);
    const lines = observed.result.lines;
    artwork.dataset.protocolState = state;
    artwork.dataset.cursor = snapshot.cursorOn ? 'on' : 'off';
    artwork.dataset.blink = snapshot.blinkOn ? 'on' : 'off';
    lines.forEach((line, index) => { artwork.dataset[`line${index + 1}`] = line; });
    if (is20x4) {
      const codes = snapshot.displayOn ? snapshot.cellCodes : Array.from({ length: 4 }, () => Array(20).fill(32));
      for (const cell of artwork.querySelectorAll('[data-lcd-cell]')) {
        const [row, column] = cell.dataset.lcdCell.split(':').map(Number);
        const code = codes[row]?.[column] ?? 32;
        cell.textContent = code < 8 ? '' : String.fromCharCode(code);
        artwork.querySelector(`[data-lcd-runtime-glyph="${row}:${column}"]`)?.remove();
        if (code < 8) {
          const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          group.dataset.lcdRuntimeGlyph = `${row}:${column}`;
          const x = Number(cell.getAttribute('x')) - 3.75;
          const y = Number(cell.getAttribute('y')) - 9;
          snapshot.customGlyphs[code].forEach((bits, pixelRow) => {
            for (let pixelColumn = 0; pixelColumn < 5; pixelColumn += 1) if (bits & (1 << (4 - pixelColumn))) {
              const pixel = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              pixel.setAttribute('x', String(x + pixelColumn * 1.5)); pixel.setAttribute('y', String(y + pixelRow * 1.5));
              pixel.setAttribute('width', '1.2'); pixel.setAttribute('height', '1.2'); pixel.setAttribute('fill', '#17220d');
              group.append(pixel);
            }
          });
          artwork.append(group);
        }
      }
    } else {
      artwork.querySelector('[data-lcd-line="1"]')?.replaceChildren(lines[0]);
      artwork.querySelector('[data-lcd-line="2"]')?.replaceChildren(lines[1]);
    }
    const detail = snapshot.error
      ? `${snapshot.error.code}: ${snapshot.error.details.join(', ')}`
      : `${state}; write-only 4-bit GPIO, ${snapshot.latchedBytes} bytes, cursor ${snapshot.cursorOn ? 'on' : 'off'}, blink ${snapshot.blinkOn ? 'on' : 'off'}`;
    const label = `${support.componentId}, ${lines.map((line, index) => `line ${index + 1} ${JSON.stringify(line)}`).join(', ')}; ${detail}; no I2C or physical display accuracy claimed`;
    artwork.setAttribute('aria-label', label);
    const title = artwork.querySelector('title'); if (title) title.textContent = label;
    published.push({ componentId: support.componentId, ...snapshot, status: state, lines });
  }
  publish({ characterLcd: published });
}

function renderPcf8574LcdRuntime(message) {
  if (editor.kind !== 'candidate-project-v3') return;
  const records = Array.isArray(message.i2c) ? message.i2c : [];
  const published = [];
  for (const support of (Array.isArray(editor.runtimeSupport) ? editor.runtimeSupport : []).filter(
    (item) => item.type === PCF8574_LCD_TYPE && item.runtimeProjection,
  )) {
    const artwork = elements.componentlayer.querySelector(
      `[data-component-id="${support.componentId}"] [data-artwork-key="output-character-lcd-16x2-pcf8574"]`,
    );
    if (!artwork) continue;
    let record = characterLcdRuntime.get(support.componentId);
    if (!record || message.cycle < record.cycle || records.length < record.traceLength) {
      record = { decoder: modelLibraryImplementationFor(AVR_PROFILE)
        .createPcf8574LcdDecoder(support.runtimeProjection.address), cycle: 0, traceLength: 0 };
      characterLcdRuntime.set(support.componentId, record);
    }
    const snapshot = record.decoder.consume(records, { i2cDrops: message.retentionDrops?.i2c ?? 0 });
    record.traceLength = records.length; record.cycle = message.cycle;
    const decodedLines = snapshot.displayOn ? snapshot.lines : ['', ''];
    const observed = modelLibraryImplementationFor(AVR_PROFILE)
      .evaluateProduction(PCF8574_LCD_TYPE, { lines: decodedLines });
    if (!observed.ok) throw Object.assign(new Error(observed.code), observed);
    const lines = observed.result.lines;
    artwork.dataset.protocolState = snapshot.status;
    artwork.dataset.cursor = snapshot.cursorOn ? 'on' : 'off';
    artwork.dataset.blink = snapshot.blinkOn ? 'on' : 'off';
    artwork.dataset.line1 = lines[0]; artwork.dataset.line2 = lines[1];
    artwork.querySelector('[data-lcd-line="1"]')?.replaceChildren(lines[0]);
    artwork.querySelector('[data-lcd-line="2"]')?.replaceChildren(lines[1]);
    const detail = snapshot.error ? snapshot.error.code : `${snapshot.transactions} acknowledged bytes`;
    const label = `${support.componentId}, line 1 ${JSON.stringify(lines[0])}, line 2 ${JSON.stringify(lines[1])}; fixed AVR I2C address 0x27; ${detail}`;
    artwork.setAttribute('aria-label', label);
    const title = artwork.querySelector('title'); if (title) title.textContent = label;
    published.push({ componentId: support.componentId, ...snapshot, lines });
  }
  publish({ pcf8574Lcd: published });
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
  const circuitLeds = Array.isArray(message.circuit?.leds) ? message.circuit.leds : [];
  for (const led of circuitLeds) {
    const visual = elements.componentlayer.querySelector(`[data-led-id="${led.componentId}"]`);
    if (!visual) continue;
    const brightness = Number.isFinite(led.brightness) ? Math.max(0, Math.min(1, led.brightness)) : 0;
    visual.classList.toggle('on', brightness > 0);
    visual.dataset.brightness = brightness.toFixed(3);
    visual.style.opacity = String(0.28 + brightness * 0.72);
    visual.style.filter = brightness > 0
      ? `drop-shadow(0 0 ${2 + brightness * 6}px currentColor)` : '';
    visual.setAttribute('aria-label', `${led.componentId} is ${led.on ? 'on' : 'off'} at ${(led.currentAmps * 1_000).toFixed(2)} mA, ${(brightness * 100).toFixed(1)} percent ideal relative brightness`);
  }
  renderRgbLedRuntime(message);
  renderActiveBuzzerRuntime(message);
  renderSevenSegmentRuntime(message);
  renderCharacterLcdRuntime(message);
  renderPcf8574LcdRuntime(message);
  const trace = Array.isArray(message.trace) ? message.trace : [];
  const transitions = trace.filter((entry) => entry.pin === 13).slice(-8).reverse();
  elements.trace.replaceChildren(...(transitions.length ? transitions : [null]).map((entry) => {
    const item = document.createElement('li');
    item.textContent = entry
      ? `${String(entry.cycle).padStart(10, '0')} · ${entry.level ? 'HIGH' : 'LOW'}`
      : 'No D13 observations.';
    return item;
  }));
  const serialSource = message.instruments?.serial;
  const serial = {
    records: Array.isArray(serialSource?.records) ? serialSource.records : [],
    dropped: Number.isSafeInteger(serialSource?.dropped) && serialSource.dropped >= 0
      ? serialSource.dropped : 0,
  };
  const textView = serialText(serial.records);
  elements.serialoutput.textContent = serialViewMode === 'events'
    ? (serial.records.length ? serialEventText(serial.records) : 'No serial events.')
    : (textView || 'No firmware bytes.');
  elements.serialcount.textContent = `${serial.records.length} records${serial.dropped ? ` · ${serial.dropped} dropped` : ''}`;
  updateSerialAutoscroll(serial);
  const logicSource = message.instruments?.logic;
  const logic = {
    channels: Array.isArray(logicSource?.channels) ? logicSource.channels : [],
    transitions: Array.isArray(logicSource?.transitions) ? logicSource.transitions : [],
    dropped: Number.isSafeInteger(logicSource?.dropped) && logicSource.dropped >= 0
      ? logicSource.dropped : 0,
  };
  const recent = logic.transitions.slice(-Number(elements.logicwindow.value)).reverse();
  elements.logicoutput.replaceChildren(...(recent.length ? recent : [null]).map((entry) => {
    const item = document.createElement('li');
    item.textContent = entry
      ? `${entry.pin} · ${String(entry.cycle).padStart(10, '0')} · ${entry.level ? 'HIGH' : 'LOW'}`
      : 'No logic observations.';
    return item;
  }));
  elements.logiccount.textContent = `${logic.transitions.length} transitions${logic.dropped ? ` · ${logic.dropped} dropped` : ''}`;
  renderWaveform(logic);
  const pins = Array.isArray(message.pins) ? message.pins : [];
  const pin = pins.find((entry) => entry.pin === elements.pinselect.value) ?? null;
  elements.pinmode.textContent = pin?.mode ?? '—';
  elements.pinlevel.textContent = pin?.pin.startsWith('A') ? `${pin.voltage.toFixed(3)} V` : pin ? (pin.level ? 'HIGH' : 'LOW') : '—';
  elements.pindetail.textContent = pin?.pwm ? `${(pin.pwm.duty * 100).toFixed(1)}% · ${pin.pwm.periodCycles} cycles` : Number.isInteger(pin?.adc) ? `ADC ${pin.adc}` : '—';
  elements.pindiagnostic.textContent = pin?.diagnostic ?? '—'; elements.pincycle.textContent = message.cycle.toLocaleString('en-US');
  const stopped = message.kind === 'error' || message.kind === 'stopped-error';
  elements.workerstate.textContent = stopped ? `Stopped: ${message.message}` : message.paused ? 'Paused' : 'Running';
  if (stopped) { elements.run.disabled = true; elements.pause.disabled = true; elements.step.disabled = true; }
  else { elements.run.disabled = !message.paused; elements.pause.disabled = message.paused; elements.step.disabled = !message.paused; }
  elements.quickrun.disabled = elements.run.disabled; elements.quickpause.disabled = elements.pause.disabled; elements.quickreset.disabled = elements.reset.disabled;
  if (selectedCompilerProfile === AVR_PROFILE) renderAvrQuickControls();
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

async function loadArtifact(hex, artifactIdentity, {
  x34Probe = null, modelExecutionContextSha256, modelImplementationSha256,
} = {}) {
  if (!/^[a-f0-9]{64}$/u.test(modelExecutionContextSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(modelImplementationSha256 ?? '')) {
    throw new Error('MODEL_LIBRARY_EXECUTION_CONTEXT_MISSING');
  }
  stopRuntime('Loading verified artifact…');
  const loaded = applyLifecycle({ type: 'runtime.load' });
  if (!loaded.accepted) {
    showActionableError(elements.projectmessage, loaded.code, 'Runtime load rejected by lifecycle guard.');
    return;
  }
  const runtimeBinding = loaded.binding;
  const workerRuntimeBinding = {
    schema: MODEL_RUNTIME_BINDING_SCHEMA,
    projectGeneration: runtimeBinding.projectGeneration,
    runtimeGeneration: runtimeBinding.runtimeGeneration,
    artifactIdentity: runtimeBinding.artifactIdentity,
    modelImplementationSha256,
    modelExecutionContextSha256,
  };
  const runtimeProject = structuredClone(currentRuntimeProject());
  const project = structuredClone(currentProject());
  const modelLibraryLock = structuredClone(modelLibraryLockFor(AVR_PROFILE));
  const x46CurrentModel = modelLibraryLock.implementationSha256
    === CURRENT_MODEL_LIBRARY_LOCK.implementationSha256;
  const token = ++workerToken;
  const frozen = {
    loadTicket: ++x47LoadTicket,
    asyncEpoch: ++x47AsyncEpoch,
    workerToken: token,
    profile: selectedCompilerProfile,
    runtimeBinding: structuredClone(runtimeBinding),
    buildGeneration: lifecycle.artifact?.buildGeneration,
    inputIdentitySha256: lifecycle.artifact?.inputIdentity,
    sourceProjectRevision: editor.revision,
    sourceFilesJson: JSON.stringify(project.source.files),
    canonicalSourceFiles: JSON.stringify([...project.source.files]
      .map((file) => ({ name: file.name, content: file.content }))
      .sort((left, right) => left.name.localeCompare(right.name))),
    circuit: structuredClone(project.circuit),
    circuitJson: JSON.stringify(project.circuit),
    runtimeCircuit: structuredClone(runtimeProject.circuit),
    modelLibraryLock,
    modelImplementationSha256,
    modelExecutionContextSha256,
    digitalInputs: structuredClone(currentCandidateInputs()),
    i2cDevices: editor.kind === 'candidate-project-v3'
      ? editor.runtimeSupport.filter((item) => item.type === PCF8574_LCD_TYPE).map((item) => ({
        type: 'pcf8574-lcd', address: item.runtimeProjection.address,
      })) : [],
    instruments: {
      logicChannels: [...project.instruments.logicChannels],
      selectedPin: project.instruments.selectedPin,
      serialHistoryLimit: project.instruments.serial.historyLimit,
    },
    x34Probe: x34Probe ? structuredClone(x34Probe) : null,
  };
  let authority;
  try { authority = await x47AuthorityForRuntime(frozen); }
  catch (error) { if (error.message === 'X47_LOAD_EPOCH_STALE') return; throw error; }
  if (!x47LoadStillCurrent(frozen)) return;
  x47RuntimeAuthority = authority;
  const x48Authority = authority ? {
    schema: X48_AUTHORITY_SCHEMA,
    plantId: X48_PLANT_ID,
    plantContractIdentity: X48_PLANT_CONTRACT_IDENTITY,
    profile: X48_PROFILE,
    inputIdentity: authority.inputIdentitySha256,
    sourceIdentity: authority.sourceSha256,
    graphIdentity: authority.graphIdentity,
    projectGeneration: authority.projectGeneration,
    buildGeneration: authority.buildGeneration,
    sourceProjectRevision: authority.sourceProjectRevision,
    runtimeGeneration: authority.runtimeGeneration,
    artifactIdentity: authority.artifactIdentity,
    modelImplementationSha256: authority.modelImplementationSha256,
    modelExecutionContextSha256: authority.modelExecutionContextSha256,
  } : null;
  x48RuntimeAuthority = x48Authority ? structuredClone(x48Authority) : null;
  let workerInstanceNonce = null;
  runtimeWorkerCreations += 1;
  publish({ runtimeWorkerCreations });
  const loadWorker = new Worker('./simulator.worker.js', { type: 'module' });
  if (!x47LoadStillCurrent(frozen)) { loadWorker.terminate(); return; }
  worker = loadWorker;
  let workerReady = false;
  const ownsWorker = () => token === workerToken && worker === loadWorker;
  const terminateOwnedWorker = () => {
    if (runtimeReadyDeadlineTimer !== null) clearTimeout(runtimeReadyDeadlineTimer);
    runtimeReadyDeadlineTimer = null;
    loadWorker.terminate();
    if (worker === loadWorker) { worker = null; currentRuntimeWorkerIdentity = null; }
  };
  const failRuntimeStartup = (code, message) => {
    if (!ownsWorker()) return;
    terminateOwnedWorker();
    running = false;
    setRuntimeEnabled(false);
    const state = { kind: 'stopped-error', message, cycle: 0, instructions: 0, paused: true };
    applyLifecycle({ type: 'runtime.message', binding: runtimeBinding, message: state });
    publish({ runtime: state, runtimeLoadState: 'failed' });
    cancelThermostatExperiment(`Experiment unresolved: ${message}. Nothing was marked passed.`, { clearResults: false });
    elements.workerstate.textContent = 'Runtime failed to start — rebuild the current project';
    beginnerRunIntent = null;
    elements.beginnerrun.disabled = false;
    elements.beginnerstatus.textContent = 'Run could not start. Correct the error and choose Run again.';
    showActionableError(elements.projectmessage, code, message);
  };
  loadWorker.addEventListener('message', async ({ data }) => {
    if (!ownsWorker()) return;
    let identity;
    try {
      identity = validateWorkerRuntimeIdentity(data.runtimeIdentity, workerRuntimeBinding, workerInstanceNonce);
      workerInstanceNonce ??= identity.workerInstanceNonce;
      currentRuntimeWorkerIdentity = structuredClone(identity);
    } catch (error) {
      failRuntimeStartup(error.code ?? 'RUNTIME_WORKER_IDENTITY_STALE',
        'A stale or unbound runtime startup message was rejected. Rebuild the current project.');
      return;
    }
    if (!workerReady && (data.kind === 'error' || data.kind === 'stopped-error')) {
      const code = /^[A-Z][A-Z0-9_]+$/u.test(data.message ?? '') ? data.message : 'WORKER_ERROR';
      failRuntimeStartup(code, data.message || 'The runtime worker stopped during startup.');
      return;
    }
    try {
      if (['x48-started', 'x48-progress', 'x48-complete', 'x48-indeterminate',
        'x48-cancelled'].includes(data.kind)) {
        const operation = x48Operation;
        if (!operation || !x48EpochOwner.accepts(operation.epochTicket, data.result?.binding)) return;
        if (!x48OperationCurrent(operation)) {
          retireX48RoomLoop('X48_AUTHORITY_DRIFT', { command: 'x48-cancel' });
          return;
        }
        validateX48Binding(data.result?.binding, identity, operation.authority);
        const result = validateX48Result(data.result, operation.binding);
        const acceptedMessage = applyLifecycle({ type: 'runtime.message', binding: runtimeBinding, message: data });
        if (!acceptedMessage.accepted) {
          retireX48RoomLoop('X48_LIFECYCLE_REJECTED', { command: 'x48-cancel' });
          return;
        }
        const terminal = ['x48-complete', 'x48-indeterminate', 'x48-cancelled'].includes(data.kind);
        operation.result = structuredClone(result);
        x48RuntimeActive = !terminal;
        if (terminal) {
          if (!x48EpochOwner.complete(operation.epochTicket, result.binding)) return;
          x48Operation = null;
          x48Controls(false, operation.epoch, true);
        } else x48Controls(true, operation.epoch);
        publish({ runtime: { ...data, result } });
        dispatchX48State({ ...data, result });
        if (terminal) renderRuntime(data, { publishState: false });
        else elements.workerstate.textContent = 'Plant running · ordinary runtime paused';
        return;
      }
      if (data.kind === 'x47-repeatable-accepted') {
        const pending = x47RepeatablePending;
        if (!pending || pending.worker !== loadWorker || pending.workerToken !== token
            || pending.transactionId !== data.transactionId
            || pending.canonicalScheduleSha256 !== data.canonicalScheduleSha256
            || lifecycle.phase !== 'paused' || data.baseCycle !== x47WorkerStatus?.cycle
            || data.dropped !== 0 || data.retained !== data.events?.length
            || !sameRuntimeIdentity(identity, pending.runtimeIdentity)) {
          throw new Error('X47_REPEATABLE_ACCEPT_STALE');
        }
        x47RepeatablePending = null;
        window.__X47_REPEATABLE_INPUTS__?.accepted?.(data);
        return;
      }
      if (data.kind === 'x47-repeatable-rejected') {
        const pending = x47RepeatablePending;
        if (!pending || pending.worker !== loadWorker || pending.workerToken !== token
            || pending.transactionId !== data.transactionId
            || pending.canonicalScheduleSha256 !== data.canonicalScheduleSha256
            || lifecycle.phase !== 'paused' || data.paused !== true
            || data.cycle !== x47WorkerStatus?.cycle
            || !/^X47_REPEATABLE_[A-Z_]+$/u.test(data.reason ?? '')
            || !sameRuntimeIdentity(identity, pending.runtimeIdentity)) {
          throw new Error('X47_REPEATABLE_REJECTION_STALE');
        }
        x47RepeatablePending = null;
        renderX47Integration({ ...x47UiOwner.snapshot(),
          reason: `Repeatable input rejected: ${data.reason}. The paused worker remains current.` });
        return;
      }
      if (data.kind === 'x47-accepted') {
        renderX47Integration(x47UiOwner.accept({ workerToken: token, runtimeIdentity: identity,
          receipt: data.receipt, executionReceipt: data.executionReceipt }));
        return;
      }
      if (data.kind === 'x47-cancelled') {
        if (data.reason === 'RESET') {
          const expected = x47ResetExpectation;
          if (!expected || expected.worker !== loadWorker || expected.workerToken !== token
              || data.disposeToken !== undefined || data.receipts?.length !== 1
              || !sameRuntimeIdentity(identity, expected.runtimeIdentity)) {
            throw new Error('X47_UI_RESET_ACK_INVALID');
          }
          const receipt = validateX47CancelReceipt(data.receipts[0], expected);
          if (receipt.reason !== 'RESET') throw new Error('X47_UI_RESET_ACK_INVALID');
          x47ResetExpectation = null;
          renderX47Integration({ ...x47UiOwner.snapshot(),
            reason: receipt.evidenceComplete
              ? 'Reset cancellation acknowledged with complete evidence.'
              : 'Reset cancellation acknowledged; evidence remains incomplete.' });
          return;
        }
        if (!data.disposeToken || data.receipts?.length !== 1) throw new Error('X47_UI_CANCEL_ACK_INVALID');
        renderX47Integration(x47UiOwner.acceptCancellation({ workerToken: token,
          runtimeIdentity: identity, disposeToken: data.disposeToken, receipt: data.receipts[0] }));
        return;
      }
      if (data.kind === 'disposed' && data.disposeToken) {
        const stopped = x47UiOwner.acceptDisposed({ workerToken: token, runtimeIdentity: identity,
          disposeToken: data.disposeToken });
        if (x47StopTimer !== null) clearTimeout(x47StopTimer);
        x47StopTimer = null;
        x47TerminalProjection = stopped;
        renderX47Integration(stopped);
        stopRuntime(stopped.reason, { preserveX47Terminal: true });
        return;
      }
      data = acceptX46UsartRuntimeSnapshot(data, { currentModel: x46CurrentModel });
    } catch (error) {
      retireX47Integration(error.code ?? error.message ?? 'X47_UI_MESSAGE_REJECTED');
      terminateOwnedWorker(); running = false;
      showActionableError(elements.projectmessage, error.code ?? 'X47_UI_MESSAGE_REJECTED', error.message);
      return;
    }
    const acceptedMessage = applyLifecycle({ type: 'runtime.message', binding: runtimeBinding, message: data });
    if (!acceptedMessage.accepted) return;
    if (data.kind === 'error' || data.kind === 'stopped-error') {
      if (runtimeReadyDeadlineTimer !== null) clearTimeout(runtimeReadyDeadlineTimer);
      runtimeReadyDeadlineTimer = null;
      publish({ runtimeLoadState: 'failed' });
    }
    if (x40SharedTimeline && !x40TimelineRetainsForWorkerMessage(x40SharedTimeline, data)) {
      clearX40SharedTimeline('A later worker message invalidated the prior shared timeline.');
    }
    lastWorkerMessage = performance.now(); running = data.paused === false && data.kind !== 'error';
    x47WorkerStatus = { worker: loadWorker, workerToken: token,
      runtimeIdentity: structuredClone(identity), cycle: data.cycle, paused: data.paused,
      kind: data.kind, sequence: ++x47WorkerStatusSequence };
    if (data.kind === 'ready') {
      workerReady = true;
      if (runtimeReadyDeadlineTimer !== null) clearTimeout(runtimeReadyDeadlineTimer);
      runtimeReadyDeadlineTimer = null;
      setRuntimeEnabled(true);
      publish({ runtimeLoadState: 'ready' });
      if (beginnerRunIntent
          && beginnerRunIntent.projectGeneration === lifecycle.projectGeneration
          && beginnerRunIntent.inputIdentity === buildInputIdentity()) {
        const projectLabel = beginnerRunIntent.projectLabel;
        beginnerRunIntent = null;
        elements.beginnerrun.disabled = false;
        elements.beginnerstatus.textContent = `${projectLabel} is running. Open More for Pause, Reset and instruments.`;
        queueMicrotask(() => elements.run.click());
      }
      if (authority) {
        x47WorkerIdentity = structuredClone(identity);
        renderX47Integration(x47UiOwner.bind({ authority,
          runtimeIdentity: identity, workerToken: token }));
      }
    }
    const ownerState = x47UiOwner.snapshot();
    const transaction = data.x47?.transactions?.find((item) =>
      item.queueReceipt?.transactionId === ownerState.request?.transactionId);
    if (transaction?.executionReceipt && ownerState.queueReceipt) {
      try {
        renderX47Integration(x47UiOwner.observeExecution({ workerToken: token,
          runtimeIdentity: identity, executionReceipt: transaction.executionReceipt }));
      } catch (error) {
        retireX47Integration(error.code ?? error.message ?? 'X47_UI_EXECUTION_REJECTED');
      }
    }
    const bindExplicitPause = x47ExplicitPauseRequested && data.paused === true
      && data.kind === 'paused' && x47CanBindExplicitPause();
    if (!ownsWorker()) return;
    scheduleWorkerRuntimeRender(data);
    if (bindExplicitPause) {
      for (let attempt = 0; attempt < 4 && x47ExplicitPauseRequested; attempt += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (!ownsWorker() || lifecycle.phase !== 'paused' || !x47CanBindExplicitPause()) break;
        const bound = await bindPausedX47Preview(token, identity, data.cycle, loadWorker);
        if (bound) { x47ExplicitPauseRequested = false; break; }
      }
    }
  });
  loadWorker.addEventListener('error', (event) => {
    if (!ownsWorker()) return;
    retireX48RoomLoop('X48_WORKER_ERROR', { restoreControls: false });
    x48RuntimeAuthority = null;
    const message = event.message || 'The runtime worker stopped.';
    if (!workerReady) {
      failRuntimeStartup('WORKER_ERROR', message);
      return;
    }
    terminateOwnedWorker();
    running = false;
    setRuntimeEnabled(false);
    const state = { kind: 'stopped-error', message, cycle: 0, instructions: 0, paused: true };
    applyLifecycle({ type: 'runtime.message', binding: runtimeBinding, message: state });
    publish({ runtime: state, runtimeLoadState: 'failed' });
    cancelThermostatExperiment(`Experiment unresolved: ${message}. Nothing was marked passed.`, { clearResults: false });
    showActionableError(elements.projectmessage, 'WORKER_ERROR', message);
    elements.workerstate.textContent = 'Stopped — rebuild the current project';
  });
  elements.artifact.textContent = artifactIdentity.slice(0, 12);
  if (!ownsWorker()) { terminateOwnedWorker(); return; }
  publish({ runtimeLoadState: 'loading' });
  runtimeReadyDeadlineTimer = setTimeout(() => {
    failRuntimeStartup('RUNTIME_WORKER_READY_TIMEOUT',
      `The runtime worker did not become ready within ${RUNTIME_READY_DEADLINE_MS / 1000} seconds.`);
  }, RUNTIME_READY_DEADLINE_MS);
  loadWorker.postMessage({
    command: 'init', hex, circuit: frozen.runtimeCircuit,
    modelLibraryLock: frozen.modelLibraryLock,
    modelImplementationSha256,
    modelExecutionContextSha256,
    runtimeBinding: workerRuntimeBinding,
    ...(x48Authority ? { x48Authority: structuredClone(x48Authority) } : {}),
    ...(authority ? { x47RuntimeAuthority: structuredClone(authority) } : {}),
    ...(frozen.x34Probe ? { x34Probe: frozen.x34Probe } : {}),
    digitalInputs: frozen.digitalInputs,
    i2cDevices: frozen.i2cDevices,
    instruments: {
      logicChannels: frozen.instruments.logicChannels,
      selectedPin: frozen.instruments.selectedPin,
      serialHistoryLimit: frozen.instruments.serialHistoryLimit,
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

async function pollJob(job, inputAtSubmit, modelExecutionContextSha256, modelImplementationSha256, binding) {
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
      const result = { ...status.result, modelExecutionContextSha256, modelImplementationSha256 };
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
      await loadArtifact(result.artifact.hex, result.artifactIdentity, {
        modelExecutionContextSha256, modelImplementationSha256,
      }); return;
    }
    const errorCode = status.status === 'timeout' ? 'BUILD_TIMEOUT' : 'BUILD_FAILED';
    beginnerRunIntent = null;
    elements.beginnerrun.disabled = false;
    elements.beginnerstatus.textContent = 'Build failed. Open More → Firmware for the error, then try again.';
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
  if (x48RuntimeActive || x48Operation) {
    showActionableError(elements.projectmessage, 'X48_OPERATION_ACTIVE',
      'Cancel the ideal room loop before starting a new Build.');
    return { ok: false, code: 'X48_OPERATION_ACTIVE' };
  }
  const target = currentCompilerTarget();
  const modelExecution = modelLibraryExecutionIdentity(modelLibraryLockFor(target.profile));
  if (!modelExecution.ok) {
    const message = modelExecution.code === 'MODEL_LIBRARY_MIGRATION_REQUIRED'
      ? 'This retained model cannot authorize a new runtime. Open Model library, download the migrated copy, open that copy, then Build fresh.'
      : `The selected model library cannot authorize this Build (${modelExecution.code}).`;
    elements.buildstate.textContent = 'Model migration required';
    renderBuildDiagnostics({ diagnostics: [{
      file: 'model-library', line: 1, severity: 'error', message,
    }] }, message);
    showActionableError(elements.projectmessage, modelExecution.code, message);
    elements.quickstate.textContent = `${currentProject().metadata.name} · model migration required`;
    elements.modellibrarydetail.open = true;
    sharedWorkbenchShell.openDialog('project', document.querySelector('#project-files-open'), {
      initialFocus: false,
    });
    elements.modellibrarymigrate.focus({ preventScroll: true });
    publish({
      buildState: 'migration-required', artifactIdentity: null, inputIdentity: null,
      artifactManifest: null, compileOnly: false, compilerRequestBlocked: true, cacheHit: false,
    });
    return { ok: false, code: modelExecution.code };
  }
  retireX47Integration('X47_BUILD_STARTED');
  invalidateVersionRegressionReport('A new build cleared active comparison review authority.');
  invalidateFailureReplayReport('A new build retired the X36 replay workers and cleared export authority. Open the replay point again.');
  invalidateUsartResponseReport('A new build retired the X23 USART0 workers and cleared export authority. Run the suite again.');
  invalidateLongDurationReport('A new build cleared the prior X28 report. Run the suite again for current evidence.');
  invalidateTimeInvarianceReport('A new build cleared the prior X29 report. Run the suite again for current evidence.');
  invalidateEventOrderReport('A new build cleared the prior X30 report. Run the suite again for current evidence.');
  invalidateResetClassReport('A new build cleared the prior X31 report. Run the suite again for current evidence.');
  invalidateUnsupportedAccessReport('A new build cleared the prior X32 report. Run the suite again for current evidence.');
  invalidateDigitalStateReport('A new build cleared the prior X33 report. Run the static check again for current evidence.');
  invalidateDigitalStateRuntimeReport('A new build cleared the prior X33 runtime report. Run the producer check again.');
  invalidatePrecisionCheckReport('A new build cleared the prior X34 report. Run the instrumented check again for current evidence.');
  invalidateCausalChainReport('A new build cleared the prior X35 report. Run the causal check again for current evidence.');
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
    return { ok: false, code: 'COMPILER_TARGET_UNAVAILABLE' };
  }
  if (editor.kind === 'candidate-project-v3') {
    const runnable = editor.runnable;
    if (!runnable.ok) {
      const details = (runnable.details ?? []).map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' · ');
      const message = `${runnable.code}${details ? ` · ${details}` : ''}. Complete the required contact wiring before building.`;
      elements.buildstate.textContent = 'Draft not runnable';
      renderBuildDiagnostics({ diagnostics: [{ file: 'circuit', line: 1, severity: 'error', message }] }, message);
      showActionableError(elements.projectmessage, runnable.code, message);
      return { ok: false, code: runnable.code };
    }
  }
  const runtimeProject = currentRuntimeProject();
  const circuit = validateCircuit(runtimeProject.circuit, {
    modelLibraryLock: modelLibraryLockFor(AVR_PROFILE),
  });
  if (!circuit.ok) {
    elements.buildstate.textContent = 'Circuit validation failed';
    renderBuildDiagnostics({ diagnostics: circuit.diagnostics.map((item) => ({ ...item, severity: 'error', message: explainError(item.code).action, file: 'circuit', line: 1 })) }, 'Circuit validation failed.');
    showActionableError(elements.projectmessage, circuit.code ?? 'INVALID_CIRCUIT', elements.diagnostics.textContent);
    return { ok: false, code: circuit.code ?? 'INVALID_CIRCUIT' };
  }
  detachOutstandingBuild();
  stopRuntime('Build in progress', { updateLifecycle: false });
  const started = applyLifecycle({ type: 'build.start' });
  if (!started.accepted) {
    showActionableError(elements.projectmessage, started.code, 'Build start rejected by lifecycle guard.');
    return { ok: false, code: started.code };
  }
  const binding = started.binding;
  const inputAtSubmit = buildInputIdentity();
  const modelExecutionContextSha256 = await projectTextSha256(inputAtSubmit);
  const modelImplementationSha256 = modelLibraryLockFor(target.profile).implementationSha256;
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
    if (!response.ok) {
      const code = submitted.code || 'BUILD_REQUEST_REJECTED';
      const guidance = retryGuidanceFromResponse(response.headers.get('retry-after'), submitted);
      throw Object.assign(new Error(isRetryableCapacityCode(code) ? retryMessage(code, guidance) : code), submitted,
        guidance ? retryResultFields(submitted) : {});
    }
    if (!currentBuildBinding(binding)) return;
    activeJob = submitted;
    await pollJob(submitted, inputAtSubmit, modelExecutionContextSha256,
      modelImplementationSha256, binding);
  } catch (error) {
    if (!currentBuildBinding(binding)) return;
    activeJob = null; elements.build.disabled = false; elements.cancel.disabled = true;
    applyLifecycle({ type: 'build.failed', binding, diagnostics: [{ code: 'BUILD_REQUEST_FAILED', message: error.message }] });
    currentProject().build = { status: 'failed', inputIdentity: null, artifactIdentity: null };
    persistProject();
    elements.buildstate.textContent = 'Build request failed'; renderBuildDiagnostics(null, error.message); publish({ buildState: 'failed' });
    showActionableError(elements.projectmessage, 'BUILD_REQUEST_FAILED', error.message);
    beginnerRunIntent = null;
    elements.beginnerrun.disabled = false;
    elements.beginnerstatus.textContent = 'Build could not start. Your project was kept; choose Run to try again.';
    if (isRetryableCapacityCode(error.code)) elements.projectmessage.textContent = error.message;
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
  beginnerRunIntent = null;
  elements.beginnerrun.disabled = false;
  elements.beginnerstatus.textContent = 'Build was cancelled. Your project was kept; choose Run to try again.';
});
elements.run.addEventListener('click', () => {
  const x92Boundary = x92BudgetExecutor?.runtimeBoundary?.();
  if (x92Boundary && x92Boundary.status !== 'idle') {
    elements.projectmessage.textContent = `Run blocked (${x92Boundary.code}). The prior budgeted producer has not acknowledged pause or retirement.`;
    return;
  }
  const x92Gate = x92BudgetExecutor?.dispatchGate?.();
  if (x92Gate && x92Gate.status !== 'idle') {
    elements.projectmessage.textContent = `Run blocked (${x92Gate.code}). The active budgeted action has not acknowledged completion.`;
    return;
  }
  if (x92Budget?.active()) {
    const retired = x92Budget.retire('explicit-manual-run-outside-budget');
    cancelX92Requests(retired.requestIds);
    renderX92Budget('The X92 review session was retired before this explicit manual Run. Manual controls remain outside experiment-budget authority.', true);
  }
  if (x47UiOwner.snapshot().phase === 'resume-required') {
    elements.projectmessage.textContent = 'Use Resume explicitly in the D2 pulse panel after Apply.';
    return;
  }
  authoredScenarioResults = [];
  clearX40SharedTimeline('Run invalidated the prior shared timeline.');
  const result = applyLifecycle({ type: 'runtime.run' });
  if (result.accepted) {
    if (x47WorkerIdentity && ['await-run', 'ready'].includes(x47UiOwner.snapshot().phase)) {
      try { renderX47Integration(x47UiOwner.noteRun({ workerToken,
        runtimeIdentity: x47WorkerIdentity })); } catch { retireX47Integration('X47_RUN_BINDING_REJECTED'); }
    }
    x47ExplicitPauseRequested = false;
    worker?.postMessage({ command: 'run' });
  }
  renderThermostatExperimentPanel();
});
elements.pause.addEventListener('click', () => {
  if (x48RuntimeActive || x48Operation) return;
  const result = applyLifecycle({ type: 'runtime.pause' });
  if (result.accepted) {
    x47ExplicitPauseRequested = x47CanBindExplicitPause();
    worker?.postMessage({ command: 'pause' });
  }
});
elements.step.addEventListener('click', () => {
  if (x48RuntimeActive || x48Operation) return;
  worker?.postMessage({ command: 'step' });
});
elements.reset.addEventListener('click', () => {
  const resetWorker = worker;
  retireX48RoomLoop('X48_RESET', { restoreControls: false });
  const resetIdentity = structuredClone(x47WorkerIdentity);
  const resetOwner = x47UiOwner.snapshot();
  const resetExpectation = resetWorker && resetIdentity && resetOwner.authority
      && resetOwner.request && resetOwner.queueReceipt
    ? { worker: resetWorker, workerToken, runtimeIdentity: resetIdentity,
      authority: resetOwner.authority, request: resetOwner.request,
      queueReceipt: resetOwner.queueReceipt }
    : null;
  retireX47Integration('X47_RESET');
  x47ResetExpectation = resetExpectation;
  authoredScenarioResults = [];
  clearX40SharedTimeline('Reset invalidated the prior shared timeline.');
  invalidateVersionRegressionReport('Reset cleared active comparison review authority.');
  invalidateFailureReplayReport('Reset retired the X36 replay workers and cleared export authority. Open the replay point again.');
  invalidateUsartResponseReport('Reset retired the X23 USART0 workers and cleared export authority. Run the suite again.');
  invalidateUnsupportedAccessReport('Reset cleared the prior X32 report. Run the suite again for current evidence.');
  invalidateDigitalStateReport('Reset cleared the prior X33 report. Run the static check again for current evidence.');
  invalidateDigitalStateRuntimeReport('Reset cleared the prior X33 runtime report. Run the producer check again.');
  invalidatePrecisionCheckReport('Reset cleared the prior X34 report. Run the instrumented check again for current evidence.');
  invalidateCausalChainReport('Reset cleared the prior X35 report. Run the causal check again for current evidence.');
  clearX39FailureLocator();
  if (!resetWorker || resetWorker !== worker) return;
  renderInstrumentEvidence(null);
  resetWorker.postMessage({ command: 'reset' });
  renderThermostatExperimentPanel();
});

function postX43StackCommand(command, token) {
  const identity = currentRuntimeWorkerIdentity;
  if (!worker || !identity || selectedCompilerProfile !== AVR_PROFILE
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(token ?? '')) return false;
  worker.postMessage({ command, token, artifactIdentity: identity.artifactIdentity,
    runtimeGeneration: identity.runtimeGeneration,
    workerInstanceNonce: identity.workerInstanceNonce });
  return true;
}

document.addEventListener('x43-stack-start-request', (event) => {
  postX43StackCommand('x43-stack-start', event.detail?.token);
});
document.addEventListener('x43-stack-capture-request', (event) => {
  postX43StackCommand('x43-stack-capture', event.detail?.token);
});

document.addEventListener('x47-preview-ready', () => {
  if (lifecycle.phase === 'paused' && x47WorkerIdentity
      && x47CanBindExplicitPause() && x47WorkerStatus?.paused === true) {
    void bindPausedX47Preview(workerToken, x47WorkerIdentity, x47WorkerStatus.cycle,
      x47WorkerStatus.worker).then((bound) => { if (bound) x47ExplicitPauseRequested = false; });
  }
});

document.addEventListener('x47-repeatable-apply-request', async (event) => {
  const applyWorker = worker;
  const applyWorkerToken = workerToken;
  const identity = structuredClone(x47WorkerIdentity);
  const authority = structuredClone(x47RuntimeAuthority);
  const pausedStatus = x47WorkerStatus;
  const owner = x47UiOwner.snapshot();
  const uiSnapshot = window.__X47_REPEATABLE_INPUTS__?.snapshot?.();
  try {
    if (x47RepeatablePending || !applyWorker || !identity || !authority
        || lifecycle.phase !== 'paused' || pausedStatus?.paused !== true
        || pausedStatus.kind !== 'paused' || pausedStatus.worker !== applyWorker
        || pausedStatus.workerToken !== applyWorkerToken || !owner.ran
        || !['await-pause', 'ready'].includes(owner.phase) || !uiSnapshot?.record
        || event.detail?.canonicalText !== uiSnapshot.canonicalText
        || !sameRuntimeIdentity(event.detail?.record, uiSnapshot.record)
        || event.detail?.context?.graphIdentity !== authority.graphIdentity
        || event.detail?.context?.sourceProjectRevision !== authority.sourceProjectRevision) {
      throw Object.assign(new Error('X47_REPEATABLE_APPLY_NOT_READY'),
        { code: 'X47_REPEATABLE_APPLY_NOT_READY' });
    }
    const record = validateX47RepeatableRecord(event.detail.record, event.detail.context);
    const canonicalScheduleSha256 = await projectTextSha256(event.detail.canonicalText);
    const live = window.__X47_REPEATABLE_INPUTS__?.snapshot?.();
    if (applyWorker !== worker || applyWorkerToken !== workerToken
        || lifecycle.phase !== 'paused' || pausedStatus !== x47WorkerStatus
        || !sameRuntimeIdentity(identity, x47WorkerIdentity)
        || !sameRuntimeIdentity(authority, x47RuntimeAuthority)
        || !sameRuntimeIdentity(uiSnapshot, live)) {
      throw Object.assign(new Error('X47_REPEATABLE_APPLY_STALE'),
        { code: 'X47_REPEATABLE_APPLY_STALE' });
    }
    const transactionId = `x47-repeatable-${crypto.randomUUID()}`;
    const request = createX47RepeatableApplyRequest({ transactionId,
      canonicalScheduleSha256, binding: createX47WorkerBinding(authority, identity),
      expectedBaseCycle: pausedStatus.cycle, record }, authority, identity);
    x47RepeatablePending = { worker: applyWorker, workerToken: applyWorkerToken,
      transactionId, canonicalScheduleSha256, runtimeIdentity: structuredClone(identity) };
    applyWorker.postMessage({ command: 'x47-repeatable-apply', request });
  } catch (error) {
    if (applyWorker === worker && applyWorkerToken === workerToken) {
      x47RepeatablePending = null;
      window.__X47_REPEATABLE_INPUTS__?.integration?.({ phase: 'rejected',
        reason: error.code ?? error.message });
    }
  }
});

document.addEventListener('x47-apply-request', async () => {
  let applyTicket = null;
  let asyncEpoch = null;
  try {
    const state = x47UiOwner.snapshot();
    const api = window.__X47_PULSE_PREVIEW__;
    const frozen = frozenX47Preview(api);
    const applyWorker = worker;
    const applyWorkerToken = workerToken;
    const applyIdentity = structuredClone(x47WorkerIdentity);
    const authority = structuredClone(x47RuntimeAuthority);
    const pausedStatus = x47WorkerStatus;
    const pausedCycle = pausedStatus?.cycle;
    applyTicket = ++x47ApplyTicket;
    asyncEpoch = x47AsyncEpoch;
    if (state.phase !== 'ready' || lifecycle.phase !== 'paused' || !applyWorker
        || !applyIdentity || !authority || !frozen.canonicalText || !frozen.context
        || !Array.isArray(frozen.events) || pausedStatus?.paused !== true
        || pausedStatus.worker !== applyWorker || pausedStatus.workerToken !== applyWorkerToken
        || pausedCycle !== state.pausedCycle
        || frozen.context.graphIdentity !== authority.graphIdentity
        || frozen.context.sourceProjectRevision !== authority.sourceProjectRevision) {
      throw Object.assign(new Error('X47_UI_APPLY_NOT_READY'), { code: 'X47_UI_APPLY_NOT_READY' });
    }
    const currentPreview = {
      canonicalPulseSha256: await projectTextSha256(frozen.canonicalText),
      events: frozen.events.map((event) => ({ pin: 2, offsetCycles: event.offsetCycles, level: event.level })),
    };
    const live = frozenX47Preview(api);
    if (applyTicket !== x47ApplyTicket || asyncEpoch !== x47AsyncEpoch
        || applyWorkerToken !== workerToken || applyWorker !== worker
        || lifecycle.phase !== 'paused' || pausedStatus !== x47WorkerStatus
        || !sameRuntimeIdentity(applyIdentity, x47WorkerIdentity)
        || !sameRuntimeIdentity(authority, x47RuntimeAuthority)
        || !sameRuntimeIdentity(state, x47UiOwner.snapshot())
        || !sameX47Preview(frozen, live)
        || frozen.context.graphIdentity !== x47RuntimeAuthority?.graphIdentity
        || frozen.context.sourceProjectRevision !== x47RuntimeAuthority?.sourceProjectRevision
        || !sameRuntimeIdentity(currentPreview, state.preview)) {
      throw Object.assign(new Error('X47_UI_PREVIEW_STALE'), { code: 'X47_UI_PREVIEW_STALE' });
    }
    const request = x47UiOwner.beginApply(`x47-ui-${crypto.randomUUID()}`);
    renderX47Integration(x47UiOwner.snapshot());
    applyWorker.postMessage({ command: 'x47-apply', request });
  } catch (error) {
    if (applyTicket === x47ApplyTicket && asyncEpoch === x47AsyncEpoch) {
      renderX47Integration({ ...x47UiOwner.snapshot(), reason: error.code ?? error.message });
    }
  }
});

document.addEventListener('x47-resume-request', () => {
  try {
    if (!worker || !x47WorkerIdentity) throw new Error('X47_UI_WORKER_STALE');
    const result = applyLifecycle({ type: 'runtime.run' });
    if (!result.accepted) throw new Error(result.code);
    renderX47Integration(x47UiOwner.resume({ workerToken,
      runtimeIdentity: x47WorkerIdentity }));
    worker.postMessage({ command: 'run' });
  } catch (error) {
    renderX47Integration({ ...x47UiOwner.snapshot(), reason: error.code ?? error.message });
  }
});

document.addEventListener('x47-stop-request', () => {
  try {
    if (!worker || !x47WorkerIdentity || x47StopTimer !== null) throw new Error('X47_UI_STOP_INVALID');
    const disposeToken = `x47-stop-${crypto.randomUUID()}`;
    x47AsyncEpoch += 1;
    x47PauseTicket += 1;
    x47ApplyTicket += 1;
    x47ResetExpectation = null;
    renderX47Integration(x47UiOwner.beginStop(disposeToken));
    worker.postMessage({ command: 'dispose', disposeToken });
    x47StopTimer = setTimeout(() => {
      try {
        const timedOut = x47UiOwner.timeout(X47_STOP_TIMEOUT_MS);
        x47TerminalProjection = timedOut;
        renderX47Integration(timedOut);
      } finally {
        x47StopTimer = null;
        stopRuntime('Stop acknowledgement not completed', { preserveX47Terminal: true });
      }
    }, X47_STOP_TIMEOUT_MS);
  } catch (error) {
    renderX47Integration({ ...x47UiOwner.snapshot(), reason: error.code ?? error.message });
  }
});
elements.thermostatruntests.addEventListener('click', startThermostatExperiment);
elements.thermostatloadbad.addEventListener('click', () => loadThermostatFirmwareVariant('known-bad-equality'));
elements.thermostatrestore.addEventListener('click', () => loadThermostatFirmwareVariant('correct'));
elements.x39failureexport.addEventListener('click', () => { void exportX39FailureLocation(); });
elements.x40sharedtimelineexport.addEventListener('click', () => { void exportX40SharedTimeline(); });
function installSeededPropertyTimeline(seed, action) {
  try {
    const timeline = generateSeededThermostatTimeline(seed);
    scenarioTimelineEditor = new ScenarioTimelineEditor(timeline);
    authoredScenarioResults = [];
    counterexampleReductionResult = null;
    persistProject();
    elements.scenarioeditormessage.textContent = action === 'replay'
      ? `Replayed stored seed ${seed}; the identical validated input sequence was regenerated. Build authority was unchanged and no verdict was imported.`
      : `Generated eight bounded cases from stored seed ${seed}. Build this exact firmware, then run the authored timeline.`;
    renderThermostatExperimentPanel();
    return { ok: true, code: action === 'replay' ? 'SEEDED_PROPERTY_REPLAYED' : 'SEEDED_PROPERTY_GENERATED' };
  } catch (error) {
    elements.seededpropertysummary.textContent = `Seed rejected (${error.code ?? error.message}). Use an integer from 0 through 4294967295.`;
    return { ok: false, code: error.code ?? error.message ?? 'SEEDED_PROPERTY_REJECTED' };
  }
}
elements.seededpropertygenerate.addEventListener('click', () => {
  const seed = Number(elements.seededpropertyseed.value);
  installSeededPropertyTimeline(seed, 'generate');
});
elements.seededpropertyseed.addEventListener('input', () => {
  elements.seededpropertyexactvalue.textContent = `Exact seed value: ${elements.seededpropertyseed.value}`;
});
elements.seededpropertyreplay.addEventListener('click', () => {
  const seed = scenarioTimelineEditor?.timeline.propertySuite?.seed;
  if (seed === undefined) return;
  const before = JSON.stringify(scenarioTimelineEditor.timeline.scenarios);
  const result = installSeededPropertyTimeline(seed, 'replay');
  if (result.ok && JSON.stringify(scenarioTimelineEditor.timeline.scenarios) !== before) {
    throw new Error('SEEDED_PROPERTY_REPLAY_MISMATCH');
  }
});
function installFaultInjectionTimeline(action) {
  try {
    const timeline = faultInjectionThermostatTimeline();
    scenarioTimelineEditor = new ScenarioTimelineEditor(timeline);
    authoredScenarioResults = [];
    counterexampleReductionResult = null;
    persistProject();
    elements.scenarioeditormessage.textContent = action === 'replay'
      ? 'Replayed the identical stored fault schedule. No build, runtime or verdict authority was imported.'
      : 'Loaded three bounded data-only fault cases. Build this exact firmware, then run the authored timeline.';
    renderThermostatExperimentPanel();
    return { ok: true, code: action === 'replay' ? 'FAULT_SUITE_REPLAYED' : 'FAULT_SUITE_LOADED' };
  } catch (error) {
    elements.faultsuitesummary.textContent = `Fault suite rejected (${error.code ?? error.message}).`;
    return { ok: false, code: error.code ?? error.message ?? 'FAULT_SUITE_REJECTED' };
  }
}
elements.faultsuiteload.addEventListener('click', () => installFaultInjectionTimeline('load'));
elements.faultsuitereplay.addEventListener('click', () => {
  if (!scenarioTimelineEditor?.timeline.faultSuite) return;
  const before = JSON.stringify(scenarioTimelineEditor.timeline.scenarios);
  const result = installFaultInjectionTimeline('replay');
  if (result.ok && JSON.stringify(scenarioTimelineEditor.timeline.scenarios) !== before) {
    throw new Error('FAULT_INJECTION_REPLAY_MISMATCH');
  }
});
function replayReductionCandidate(timeline) {
  if (authoredExperimentWaiter || thermostatExperimentRun) {
    return Promise.reject(Object.assign(new Error('COUNTEREXAMPLE_REPLAY_BUSY'), { code: 'COUNTEREXAMPLE_REPLAY_BUSY' }));
  }
  scenarioTimelineEditor = new ScenarioTimelineEditor(timeline);
  authoredScenarioResults = [];
  renderThermostatExperimentPanel();
  return new Promise((resolve, reject) => {
    authoredExperimentWaiter = { resolve, reject };
    const started = startAuthoredScenarioExperiment();
    if (!started.ok) {
      authoredExperimentWaiter = null;
      reject(Object.assign(new Error(started.code), { code: started.code }));
    }
  });
}
async function startCounterexampleReduction() {
  if (counterexampleReductionActive || elements.counterexamplereduce.disabled) return;
  const sourceTimeline = scenarioTimelineEditor.timeline;
  const baselineObservations = structuredClone(authoredScenarioResults);
  const association = {
    inputIdentity: lifecycle.artifact?.inputIdentity ?? null,
    artifactIdentity: lifecycle.artifact?.artifactIdentity ?? null,
  };
  counterexampleReductionActive = true;
  counterexampleReductionResult = null;
  elements.scenarioeditormessage.textContent = 'Reducing the failing seeded suite with fixed-order fresh-reset replays. No source, service or public release is changing.';
  renderThermostatExperimentPanel();
  try {
    const result = await reduceThermostatCounterexample({
      sourceTimeline,
      baselineObservations,
      sourceBuildInputSha256: association.inputIdentity,
      artifactSha256: association.artifactIdentity,
      replay: replayReductionCandidate,
    });
    if (lifecycle.artifact?.inputIdentity !== association.inputIdentity
        || lifecycle.artifact?.artifactIdentity !== association.artifactIdentity) {
      throw Object.assign(new Error('COUNTEREXAMPLE_BUILD_BINDING_CHANGED'), { code: 'COUNTEREXAMPLE_BUILD_BINDING_CHANGED' });
    }
    scenarioTimelineEditor = new ScenarioTimelineEditor(result.reducedTimeline);
    counterexampleReductionResult = result;
    persistProject();
    elements.scenarioeditormessage.textContent = 'Reduced 8 scenarios / 24 events to one three-event producer-backed failure. Saved provenance is inert; Open still requires a fresh Build and replay.';
  } catch (error) {
    scenarioTimelineEditor = new ScenarioTimelineEditor(sourceTimeline);
    authoredScenarioResults = baselineObservations;
    elements.scenarioeditormessage.textContent = `Reduction stopped (${error.code ?? error.message}). The original accepted seeded timeline was restored.`;
  } finally {
    counterexampleReductionActive = false;
    renderThermostatExperimentPanel();
  }
}
elements.counterexamplereduce.addEventListener('click', () => { void startCounterexampleReduction(); });
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
  sharedWorkbenchShell.openSerial();
});
elements.serialclose.addEventListener('click', () => {
  if (sharedWorkbenchShell.activeDialog() === 'instruments') {
    sharedWorkbenchShell.closeDialog();
    return;
  }
  setSerialDock(false, { returnFocus: true });
});
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

elements.appearancepreset.addEventListener('change', () => {
  const component = currentProject().circuit.components.find(
    (item) => item.id === selectedComponentId,
  );
  prepareAppearancePreview(component, elements.appearancepreset.value, appearancePreview?.body);
  renderAppearanceEditor(component);
});
for (const input of [elements.appearancewidth, elements.appearanceheight, elements.appearancecorner]) {
  input.addEventListener('input', () => {
    const component = currentProject().circuit.components.find((item) => item.id === selectedComponentId);
    if (!component) return;
    prepareAppearancePreview(component, elements.appearancepreset.value, {
      widthPct: Number(elements.appearancewidth.value),
      heightPct: Number(elements.appearanceheight.value),
      cornerPct: Number(elements.appearancecorner.value),
    });
    renderAppearanceEditor(component);
  });
}
elements.appearancecancel.addEventListener('click', () => {
  const component = currentProject().circuit.components.find((item) => item.id === selectedComponentId);
  if (!component) return;
  prepareAppearancePreview(component, componentAppearancePreset(
    currentProject().layout.componentAppearance, component.id, component.type,
  ), componentAppearanceBody(currentProject().layout.componentAppearance, component.id, component.type));
  renderAppearanceEditor(component);
  if (document.querySelector('#workbench-inspector-dialog')?.open) elements.appearancepreset.focus({ preventScroll: true });
});
elements.appearanceapply.addEventListener('click', () => {
  const component = currentProject().circuit.components.find(
    (item) => item.id === selectedComponentId,
  );
  if (!component || appearancePreview?.componentId !== component.id
      || appearancePreview.revision !== editor.revision) return;
  const prepared = prepareAppearancePreview(component, appearancePreview.preset, appearancePreview.body);
  if (!prepared?.review.equal) return;
  const preset = prepared.preset;
  const body = structuredClone(prepared.body);
  appearancePreview = null;
  applyEditor({ type: 'component.appearance.edit', componentId: component.id, preset, body },
    `Applied visual-only ${preset} body edit to ${component.id}`);
});
for (const [mode, button] of [
  ['model', elements.componenteditormodeltab], ['drawing', elements.componenteditordrawingtab],
]) {
  button.addEventListener('click', () => setAvrComponentEditorMode(mode));
  button.addEventListener('keydown', (event) => {
    const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'model'
      : event.key === 'ArrowRight' || event.key === 'End' ? 'drawing' : null;
    if (!next) return;
    event.preventDefault(); event.stopPropagation(); setAvrComponentEditorMode(next, true);
  });
}
document.querySelector('#workbench-inspector-dialog').addEventListener('close', () => {
  // A popup preview never becomes parked authored state. Closing, Escape or a
  // profile switch discards both mode previews through their own Cancel path.
  for (const cancel of document.querySelectorAll('#workbench-inspector-dialog [data-component-editor-cancel]')) {
    cancel.click();
  }
});
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
  clearExpectationReference();
  resetProjectModelLibrary(AVR_PROFILE);
  installProjectGeneration({ empty: true, reason: 'project.new', runtimeMessage: 'New empty project — build required' });
  selectedSourceFile = 'main.ino';
  clearProjectFileConnection(AVR_PROFILE);
  fileSavedRevision = null; fileSavedProjectGeneration = null; fileSaveState = null;
  persistProject(); renderCatalog(); renderProject();
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
    const parsed = modelLibraryImplementationFor(AVR_PROFILE).openCandidateUiSession(example.text, {
      modelLibraryLock: modelLibraryLockFor(AVR_PROFILE),
    });
    if (!parsed.ok) {
      showActionableError(elements.projectmessage, parsed.code, 'AVR reference starter was rejected atomically; project unchanged.');
      if (currentProjectText() !== before) throw new Error('Atomic AVR reference starter boundary violated');
      return parsed;
    }
    editor = parsed.session;
    scenarioTimelineEditor = null; authoredScenarioResults = [];
    clearExpectationReference();
    resetProjectModelLibrary(AVR_PROFILE);
    installProjectGeneration({ empty: false, reason, runtimeMessage: `${example.name} loaded — build required` });
    selectedSourceFile = 'main.ino';
    elements.exampleselect.value = exampleId;
    persistProject();
    publish({ lastAction: `${exampleId.toUpperCase()}_LOADED`, importReport: parsed.report ?? parsed.code });
    renderCatalog(); renderProject();
    elements.projectmessage.textContent = `${example.name} loaded as authored data only. Build fresh, then ${example.try.toLowerCase()}`;
    return { ok: true, code: parsed.code, example };
  }
  if (exampleId === PCF8574_LCD_HELLO_EXAMPLE_ID) {
    const before = currentProjectText(); let example;
    try { example = createPcf8574LcdHelloExample(); }
    catch (error) {
      showActionableError(elements.projectmessage, error?.message ?? 'EXAMPLE_INVALID', 'I2C LCD example could not be constructed.');
      return { ok: false, code: error?.message ?? 'EXAMPLE_INVALID' };
    }
    const parsed = modelLibraryImplementationFor(AVR_PROFILE).openCandidateUiSession(example.text, {
      modelLibraryLock: modelLibraryLockFor(AVR_PROFILE),
    });
    if (!parsed.ok) {
      showActionableError(elements.projectmessage, parsed.code, 'I2C LCD example was rejected atomically; project unchanged.');
      if (currentProjectText() !== before) throw new Error('Atomic I2C LCD starter boundary violated');
      return parsed;
    }
    editor = parsed.session; scenarioTimelineEditor = null; authoredScenarioResults = [];
    clearExpectationReference(); resetProjectModelLibrary(AVR_PROFILE);
    installProjectGeneration({ empty: false, reason, runtimeMessage: `${example.name} loaded — build required` });
    selectedSourceFile = 'main.ino'; elements.exampleselect.value = exampleId;
    persistProject(); publish({ lastAction: 'PCF8574_LCD_HELLO_LOADED', importReport: parsed.report ?? parsed.code });
    renderCatalog(); renderProject();
    elements.projectmessage.textContent = `${example.name} loaded with fixed 0x27, A4/SDA and A5/SCL wiring.`;
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
    clearExpectationReference();
    resetProjectModelLibrary(AVR_PROFILE);
    installProjectGeneration({
      empty: false, reason, runtimeMessage: `${example.name} loaded — build required`,
    });
    selectedSourceFile = 'main.ino';
    elements.exampleselect.value = exampleId;
    thermostatExperimentNotice = 'Build this exact local project before running the four boundary scenarios.';
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
    clearExpectationReference();
    resetProjectModelLibrary(AVR_PROFILE);
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
  scenarioTimelineEditor = null; authoredScenarioResults = [];
  clearExpectationReference();
  resetProjectModelLibrary(AVR_PROFILE);
  installProjectGeneration({ empty: false, reason, runtimeMessage: `${projectLabel} loaded — build required` });
  selectedSourceFile = 'main.ino';
  elements.exampleselect.value = exampleId;
  persistProject(); publish({ lastAction: `${exampleId.toUpperCase()}_EXAMPLE_LOADED`, importReport: null }); renderProject();
  elements.projectmessage.textContent = `${example.name} loaded through the same safety checks as every project. Edit it, build it, then inspect the live instruments.`;
  return { ok: true, code: result.code, example };
}

function renderStarterExamples() {
  const cards = [...exampleCatalog(), TEMPERATURE_LCD_THRESHOLD_CARD, PCF8574_LCD_HELLO_CARD, THERMOSTAT_EXPERIMENT_CARD, ...avrReferenceStarterCatalog()].map((example) => {
    const card = document.createElement('article'); card.className = 'starter-card'; card.dataset.example = example.id;
    const visual = document.createElement('span'); visual.className = 'starter-visual'; visual.setAttribute('aria-hidden', 'true');
    const meta = document.createElement('span'); meta.className = 'starter-meta';
    const focus = document.createElement('span'); focus.className = 'starter-focus'; focus.textContent = example.focus;
    const difficulty = document.createElement('span'); difficulty.className = 'starter-difficulty';
    difficulty.textContent = ['blink', 'button', 'adc'].includes(example.id) ? 'Beginner' : 'Next step';
    meta.append(focus, difficulty);
    const name = document.createElement('strong'); name.textContent = example.name;
    const description = document.createElement('span'); description.className = 'starter-description'; description.textContent = example.description;
    const parts = document.createElement('span'); parts.className = 'starter-parts'; parts.textContent = example.partsLabel;
    const outcome = document.createElement('span'); outcome.className = 'starter-outcome'; outcome.textContent = example.outcome ?? example.observe;
    const action = document.createElement('button'); action.type = 'button'; action.className = 'starter-action'; action.textContent = 'Open';
    action.setAttribute('aria-label', `Open ${example.name}: ${example.focus}`);
    card.append(visual, meta, name, description, parts, outcome, action);
    if (example.learn) {
      const teaching = document.createElement('details'); teaching.className = 'starter-teaching';
      const summary = document.createElement('summary'); summary.textContent = 'Teaching details';
      const guide = document.createElement('span'); guide.className = 'starter-learning-grid';
      for (const [label, value] of [['Learn', example.learn], ['Try', example.try], ['Observe', example.observe], ['Limits', example.limits], ['Next', example.next]]) {
        const row = document.createElement('span'); const title = document.createElement('b'); title.textContent = label;
        row.append(title, document.createTextNode(value)); guide.append(row);
      }
      teaching.append(summary, guide); card.append(teaching);
    }
    action.addEventListener('click', () => {
      const install = () => {
        const result = loadExampleProject(example.id, 'project.starter');
        if (result?.ok) closeExamplePicker();
      };
      if (!requestUnsavedChangeGuard({
        profile: AVR_PROFILE, actionLabel: `loading ${example.name}`, continueAction: install,
      })) install();
    });
    return card;
  });
  elements.starterexamples.replaceChildren(...cards);
}

let examplePickerReturnFocus = null;
function examplePickerFocusable() {
  return [...elements.examplepickerdialog.querySelectorAll('button:not([hidden]), input:not([hidden]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.disabled && node.getClientRects().length > 0);
}
function filterStarterExamples() {
  const query = elements.examplepickersearch.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const card of elements.starterexamples.querySelectorAll('.starter-card')) {
    card.hidden = Boolean(query) && !card.textContent.toLocaleLowerCase().includes(query);
    if (!card.hidden) visible += 1;
  }
  elements.examplepickerstatus.textContent = query
    ? `${visible} of 15 examples match “${elements.examplepickersearch.value.trim()}”`
    : '15 examples available';
}
function closeExamplePicker({ restoreFocus = true } = {}) {
  const returnFocus = examplePickerReturnFocus;
  examplePickerReturnFocus = null;
  if (elements.examplepickerdialog.open) elements.examplepickerdialog.close('close');
  if (restoreFocus) queueMicrotask(() => {
    if (returnFocus?.isConnected) returnFocus.focus();
    else if (elements.projectdemo.isConnected) elements.projectdemo.focus();
  });
}
function openExamplePicker() {
  if (elements.examplepickerdialog.open || elements.unsavedchangedialog.open) return;
  examplePickerReturnFocus = document.activeElement;
  elements.examplepickersearch.value = '';
  filterStarterExamples();
  elements.examplepickerdialog.showModal();
  elements.examplepickersearch.focus();
}
function startFromScratch() {
  const createScratch = () => {
    createNewAvrProject();
    elements.beginnerstatus.textContent = 'Empty project · 1 Parts → 2 Connect pins → 3 Write code → 4 Run. Minimal LED code is optional.';
    sharedWorkbenchShell.openDialog('parts', elements.beginnerscratch);
  };
  if (requestUnsavedChangeGuard({
    profile: AVR_PROFILE, actionLabel: 'starting from scratch', continueAction: createScratch,
  })) return;
  createScratch();
}
const MINIMAL_LED_SOURCE = `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`;
function useMinimalLedSource() {
  if (selectedCompilerProfile !== AVR_PROFILE) return;
  const source = currentProject().source.files.find((file) => file.name === 'main.ino');
  if (!source || source.content.trim()) {
    elements.beginnerstatus.textContent = 'Existing code was kept. Minimal starter code can only be added to an empty main.ino.';
    return;
  }
  const result = applyEditor({ type: 'source.set', name: 'main.ino', content: MINIMAL_LED_SOURCE }, 'Minimal LED starter selected');
  if (result.ok) elements.beginnerstatus.textContent = 'Minimal LED code added · next, add parts and connect D13 through a resistor and LED to GND, then choose Run.';
}
const beginnerProfileLabels = Object.freeze({
  [RP2040_PROFILE]: ['Continue with Pico', 'Pico is selected · use its visible Build and Run controls when the wiring is valid.'],
  [ESP32C3_PROFILE]: ['Continue with ESP32-C3', 'ESP32-C3 is selected · use its visible Build and Run controls when the wiring is valid.'],
  [STM32F429ZI_PROFILE]: ['Continue with STM32', 'STM32 is selected · use its visible Build and Run controls when the wiring is valid.'],
});
function focusActiveProfileControls() {
  const stage = document.querySelector('#active-canvas-stage');
  stage?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  queueMicrotask(() => document.querySelector('#active-canvas-mount button:not([disabled]), #active-canvas-mount textarea, #active-canvas-mount input')?.focus({ preventScroll: true }));
}
async function runBeginnerProject() {
  if (selectedCompilerProfile !== AVR_PROFILE) {
    elements.beginnerstatus.textContent = beginnerProfileLabels[selectedCompilerProfile]?.[1]
      ?? 'The selected profile has its own visible controls. No firmware action was started.';
    focusActiveProfileControls();
    return;
  }
  if (currentProject().circuit.components.length === 0) {
    elements.beginnerstatus.textContent = 'Empty project · choose a controller and parts. Nothing was replaced.';
    sharedWorkbenchShell.openDialog('parts', elements.beginnerrun);
    return;
  }
  elements.beginnerrun.disabled = true;
  if (!elements.quickrun.disabled && lifecycle.artifact) {
    elements.beginnerstatus.textContent = 'Starting the fresh, validated firmware…';
    elements.quickrun.click();
    elements.beginnerrun.disabled = false;
    return;
  }
  beginnerRunIntent = {
    projectGeneration: lifecycle.projectGeneration,
    inputIdentity: buildInputIdentity(),
    projectLabel: currentProject().metadata.name === 'Blink demo' ? 'LED example' : currentProject().metadata.name,
  };
  elements.beginnerstatus.textContent = 'Building fresh firmware in the isolated compiler…';
  const result = await build();
  if (result?.ok === false && beginnerRunIntent) {
    beginnerRunIntent = null;
    elements.beginnerrun.disabled = false;
    elements.beginnerstatus.textContent = 'Build could not start. Your project was kept; choose Run to try again.';
  }
}
elements.beginnerexamples.addEventListener('click', openExamplePicker);
elements.beginnerruntimetoggle.addEventListener('click', () => {
  if (elements.beginnerruntimetoggle.dataset.state === 'paused') elements.quickrun.click();
  else elements.quickpause.click();
});
elements.beginnerscratch.addEventListener('click', startFromScratch);
elements.beginnersource.addEventListener('click', useMinimalLedSource);
elements.beginnerrun.addEventListener('click', () => { void runBeginnerProject(); });
elements.projectdemo.addEventListener('click', openExamplePicker);
elements.examplepickerclose.addEventListener('click', () => closeExamplePicker());
elements.examplepickersearch.addEventListener('input', filterStarterExamples);
elements.examplepickerdialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeExamplePicker();
});
elements.examplepickerdialog.addEventListener('click', (event) => {
  if (event.target === elements.examplepickerdialog) closeExamplePicker();
});
elements.examplepickerdialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab' || elements.unsavedchangedialog.open) return;
  const focusable = examplePickerFocusable();
  if (!focusable.length) { event.preventDefault(); return; }
  const first = focusable[0]; const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !elements.examplepickerdialog.contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
});
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
  beginnerRunIntent = null;
  elements.beginnerrun.disabled = false;
  const previousProfile = selectedCompilerProfile;
  const previousProject = profileProjectSnapshot(previousProfile);
  const previousRequirements = projectBriefForProfile(previousProfile).requiredCapabilities;
  const selected = candidateCompilerTarget(elements.boardselect.value);
  selectedCompilerProfile = selected ? selected.profile : AVR_PROFILE;
  try { sessionStorage.setItem(TAB_PROFILE_KEY, selectedCompilerProfile); } catch { /* profile remains in memory */ }
  lastProfileMigrationReport = previousProfile === selectedCompilerProfile ? null : explainProfileMigration({
    fromProfile: previousProfile,
    toProfile: selectedCompilerProfile,
    project: previousProject,
    requiredCapabilities: previousRequirements,
  });
  if (previousProfile !== selectedCompilerProfile) invalidateRegressionMatrixReport('Controller profile changed. Run the matrix again for current evidence.');
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
  void syncX92Identity('controller profile changed');
  renderProjectBrief();
  renderModelLibraryStatus();
});
elements.controllerprimaryaction.addEventListener('click', () => {
  if (selectedCompilerProfile === AVR_PROFILE) elements.build.click();
  else if (selectedCompilerProfile === ESP32C3_PROFILE) void executeC3ManualAction('firmware.build',
    (permit) => c3PublicWorkbench.build({ advancePermit: permit }));
  else if (selectedCompilerProfile === RP2040_PROFILE) void picoPublicWorkbench.build();
  else if (selectedCompilerProfile === STM32F429ZI_PROFILE) void executeStm32ManualAction('firmware.build',
    (permit) => stm32PublicWorkbench.build({ advancePermit: permit }));
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
elements.recoveryexport.addEventListener('click', () => downloadText('intent-mcu-recovery.json', authoredProjectText(AVR_PROFILE), 'application/json'));
elements.projectreload.addEventListener('click', () => {
  const recovery = localStorage.getItem(activeProjectRecoveryKey);
  const stored = recovery ?? localStorage.getItem(activeProjectStorageKey); const parsed = stored ? parseAvrRecoverySource(stored) : { ok: false, code: 'NO_LOCAL_SAVE' };
  if (!parsed.ok) { showActionableError(elements.projectmessage, parsed.code, 'Reload validation failed.'); return; }
  editor = parsed.session;
  scenarioTimelineEditor = parsed.scenarioTimeline
    ? new ScenarioTimelineEditor(parsed.scenarioTimeline) : null;
  authoredScenarioResults = [];
  clearExpectationReference();
  installProjectGeneration({
    empty: editor.project.circuit.components.length === 0, reason: 'project.reload',
    runtimeMessage: 'Reloaded project requires build',
  });
  selectedSourceFile = 'main.ino';
  resetCanvasAnnotations(parsed.annotations ?? emptyCanvasAnnotations(), {
    subcircuits: parsed.subcircuits ?? emptySubcircuits(parsed.modelLibrary),
  });
  savedRevision = editor.revision; savedProjectGeneration = lifecycle.projectGeneration;
  setProjectBaseline(AVR_PROFILE); renderCatalog(); renderProject(); elements.projectmessage.textContent = 'Restored and revalidated browser recovery, including visual annotations. Previous runtime output was cleared; save a project file for durable storage.';
});
function forkDraftForRecovery(nextId = crypto.randomUUID()) {
  sessionStorage.setItem(TAB_DRAFT_ID_KEY, nextId);
  activeDraftId = nextId;
  activeProjectStorageKey = `${PROJECT_STORAGE_KEY}.tab.${nextId}`;
  activeProjectRecoveryKey = `${PROJECT_RECOVERY_KEY}.tab.${nextId}`;
  writeDraftLease();
  return nextId;
}
function installPreservedDraftCopy(draft) {
  if (!draft?.valid) return { ok: false, code: draft?.code ?? 'RECOVERY_PROJECT_INVALID' };
  const sourceRaw = localStorage.getItem(draft.key);
  if (sourceRaw !== draft.raw) return { ok: false, code: 'RECOVERY_SOURCE_CHANGED' };
  const copyDraftId = crypto.randomUUID();
  const copyKey = draft.profile === AVR_PROFILE
    ? `${PROJECT_STORAGE_KEY}.tab.${copyDraftId}`
    : `intent-mcu.profile-draft.v1.${draft.profile}.tab.${copyDraftId}`;
  try {
    if (localStorage.getItem(copyKey) !== null) return { ok: false, code: 'RECOVERY_COPY_KEY_COLLISION' };
    localStorage.setItem(copyKey, draft.profile === AVR_PROFILE ? sourceRaw : JSON.stringify({
      schema: 'intent-mcu-profile-draft@1', profile: draft.profile,
      project: structuredClone(draft.project), authoredSource: draft.authoredSource,
      authoredName: draft.authoredName, circuit: structuredClone(draft.project.circuit),
      updatedAt: new Date().toISOString(),
    }));
  } catch { return { ok: false, code: 'RECOVERY_COPY_SAVE_FAILED' }; }
  try { forkDraftForRecovery(copyDraftId); }
  catch {
    try { localStorage.removeItem(copyKey); } catch { /* harmless unregistered copy remains recoverable */ }
    return { ok: false, code: 'RECOVERY_COPY_ACTIVATION_FAILED' };
  }
  if (draft.profile === AVR_PROFILE) {
    installPreparedProjectEnvelope(draft.prepared, null, {
      annotations: draft.prepared.annotations ?? null,
      subcircuits: draft.prepared.subcircuits ?? null,
    });
  } else {
    if (selectedCompilerProfile !== draft.profile) {
      elements.boardselect.value = draft.profile;
      elements.boardselect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const workbench = actionWorkbench(draft.profile);
    if (!workbench) return { ok: false, code: 'RECOVERY_PROFILE_UNSUPPORTED' };
    workbench.installPreparedProject(structuredClone(draft.project), 'Opened a validated preserved copy. Build fresh before Run.');
    workbench.project.source = draft.authoredSource;
    workbench.project.name = draft.authoredName;
    workbench.elements.source.value = draft.authoredSource;
    workbench.elements.name.value = draft.authoredName;
    workbench.invalidate('Opened a validated preserved copy. Build fresh before Run.');
    // A preserved draft may contain source that was still being edited and is
    // therefore not build-valid yet. authoredProjectFingerprint has an
    // in-progress fallback, so the exact recovered state can still be the
    // clean baseline and every subsequent Inspector/source/layout edit is
    // protected by the ordinary unsaved-change guard.
    setProjectBaseline(draft.profile);
  }
  corruptControllerDraftProfiles.delete(draft.profile);
  registerActiveDraft(draft.name);
  if (localStorage.getItem(draft.key) !== sourceRaw) throw new Error('RECOVERY_ORIGINAL_MUTATED');
  renderDraftRecoveryChoices();
  return { ok: true, code: 'RECOVERY_COPY_OPENED', copyDraftId };
}
elements.projectdraftrecovery.addEventListener('change', () => {
  elements.projectdraftrecover.disabled = !elements.projectdraftrecovery.value;
});
function presentDraftRecoveryStatus(message) {
  elements.projectdraftrecoverystatus.textContent = message;
  elements.browserdraftrecovery.open = true;
  sharedWorkbenchShell.openDialog('project', document.querySelector('#project-files-open'), {
    initialFocus: false,
  });
  queueMicrotask(() => { elements.browserdraftrecovery.open = true; });
}
elements.projectdraftrecover.addEventListener('click', () => {
  const recover = () => {
    const key = elements.projectdraftrecovery.value;
    let raw = null;
    try { raw = localStorage.getItem(key); } catch { /* handled below */ }
    const draft = inspectPreservedDraft(key, raw,
      new Map(draftRegistry().map((item) => [item.id, item])));
    if (!draft?.valid) {
      showActionableError(elements.projectmessage, draft?.code ?? 'NO_LOCAL_SAVE',
        'The original preserved bytes remain untouched. Export browser storage before attempting manual recovery.');
      const message = 'Recovery rejected because this saved entry is invalid. The original preserved bytes remain untouched.';
      elements.projectmessage.textContent = message;
      presentDraftRecoveryStatus(message);
      return;
    }
    let result;
    try { result = installPreservedDraftCopy(draft); }
    catch (error) {
      showActionableError(elements.projectmessage, error.code ?? error.message ?? 'RECOVERY_COPY_FAILED',
        `Recovery stopped (${error.code ?? error.message ?? error.name}). The original preserved bytes remain untouched; any validated in-memory copy remains available for Save copy.`);
      presentDraftRecoveryStatus(`Recovery stopped (${error.code ?? error.message ?? error.name}). The original preserved bytes remain untouched; any validated in-memory copy remains available for Save copy.`);
      return;
    }
    if (!result.ok) {
      showActionableError(elements.projectmessage, result.code,
        'Recovery stopped. The original preserved bytes remain untouched.');
      const message = `Recovery stopped (${result.code}). The original preserved bytes remain untouched.`;
      elements.projectmessage.textContent = message;
      presentDraftRecoveryStatus(message);
      return;
    }
    const migration = draft.migrationOnly
      ? ` Published ${draft.recoveryRelease} identity was migrated as data only; executable authority was cleared and a fresh Build is required.` : '';
    const message = `Opened validated ${RECOVERY_PROFILE_LABELS[draft.profile]} copy in separate draft ${result.copyDraftId.slice(0, 8)}…: ${draft.name}, ${draft.components} parts, ${draft.nets} nets. Original key unchanged.${migration} Revision 0 and empty Undo history after recovery are expected; use Fit project if the graph count is non-zero but parts are offscreen.`;
    elements.projectmessage.textContent = message;
    presentDraftRecoveryStatus(message);
  };
  const selected = preservedDrafts().find((draft) => draft.key === elements.projectdraftrecovery.value);
  const profile = selected?.profile ?? selectedCompilerProfile;
  if (requestUnsavedChangeGuard({ profile: selectedCompilerProfile,
    actionLabel: `opening a preserved ${RECOVERY_PROFILE_LABELS[profile] ?? profile} copy in a separate draft`,
    continueAction: recover })) return;
  recover();
});
elements.projectexport.addEventListener('click', () => saveLegacyProject(AVR_PROFILE));

function openFirstProjectGuide() {
  if (!elements.walkthrough.open) elements.walkthrough.showModal();
}
elements.walkthroughopen.addEventListener('click', openFirstProjectGuide);
elements.topgetstarted.addEventListener('click', openFirstProjectGuide);
elements.helpgetstarted.addEventListener('click', () => {
  document.querySelector('#workbench-help-dialog .workbench-popup-close')?.click();
  queueMicrotask(openFirstProjectGuide);
});
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
  if (selectedCompilerProfile === ESP32C3_PROFILE) void executeC3ManualAction('firmware.build',
    (permit) => c3PublicWorkbench.build({ advancePermit: permit }));
  else if (selectedCompilerProfile === RP2040_PROFILE) void picoPublicWorkbench.build();
  else if (selectedCompilerProfile === STM32F429ZI_PROFILE) void executeStm32ManualAction('firmware.build',
    (permit) => stm32PublicWorkbench.build({ advancePermit: permit }));
  else elements.build.click();
});
elements.quickrun.addEventListener('click', () => {
  if (selectedCompilerProfile === ESP32C3_PROFILE) void executeC3ManualAction('runtime.run',
    (permit, binding) => c3PublicWorkbench.run({ advancePermit: permit, x92Binding: binding }));
  else if (selectedCompilerProfile === RP2040_PROFILE) void picoPublicWorkbench.run();
  else if (selectedCompilerProfile === STM32F429ZI_PROFILE) void executeStm32ManualAction('runtime.run',
    (permit, binding) => stm32PublicWorkbench.run(false, { advancePermit: permit, x92Binding: binding }));
  else elements.run.click();
});
elements.quickpause.addEventListener('click', () => {
  if (selectedCompilerProfile === RP2040_PROFILE) picoPublicWorkbench.pause();
  else elements.pause.click();
});
elements.quickreset.addEventListener('click', () => {
  if (selectedCompilerProfile === RP2040_PROFILE) picoPublicWorkbench.reset();
  else if (selectedCompilerProfile === STM32F429ZI_PROFILE) void executeStm32ManualAction('runtime.run',
    (permit, binding) => stm32PublicWorkbench.run(true, { advancePermit: permit, x92Binding: binding }));
  else elements.reset.click();
});
elements.quickstop.addEventListener('click', () => {
  if (selectedCompilerProfile === ESP32C3_PROFILE) void c3PublicWorkbench.dispose('C3 session discarded.');
  else if (selectedCompilerProfile === RP2040_PROFILE) picoPublicWorkbench.stop();
  else if (selectedCompilerProfile === STM32F429ZI_PROFILE) stm32PublicWorkbench.stop();
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
elements.buildlistexport.addEventListener('click', () => { void exportCurrentBomNetlist(); });
elements.accessiblesvgexport.addEventListener('click', () => { void exportCurrentAccessibleDemonstration(); });
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('#build, #run, #pause, #reset, #cancel, #quick-build, #quick-run, #quick-pause, #quick-reset')) {
    accessibleDemonstrationRuntimeEpoch += 1;
  }
}, { capture: true });

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
window.__M3_COMMAND__ = (command, value) => {
  if (x48RuntimeActive || x48Operation) return { ok: false, code: 'X48_OPERATION_ACTIVE' };
  worker?.postMessage(command === 'speed' ? { command, speed: value } : { command });
  return { ok: true };
};
window.__M4_CONTROL__ = (componentId, key, value) => {
  if (x48RuntimeActive || x48Operation) return { ok: false, code: 'X48_OPERATION_ACTIVE' };
  worker?.postMessage({ command: 'control', componentId, key, value }); return { ok: true };
};
window.__M5_COMMAND__ = (command, value) => {
  if (x48RuntimeActive || x48Operation) return { ok: false, code: 'X48_OPERATION_ACTIVE' };
  worker?.postMessage({ command, value }); return { ok: true };
};
window.__CHECKABLE_EVIDENCE__ = Object.freeze({
  set: (report) => setCheckableEvidenceReport(report),
  setPackage: (source) => setCheckableEvidencePackage(source),
  clear: (message) => clearCheckableEvidenceReport(message),
  current: () => checkableEvidenceReport ? structuredClone(checkableEvidenceReport) : null,
  download: () => downloadCheckableEvidenceReport(),
});
window.addEventListener('pagehide', () => {
  retireX48RoomLoop('X48_PAGE_EXIT', { command: 'x48-cancel', restoreControls: false });
  retireFailureReplayWorkers(); failureReplayReport = null;
  invalidateUsartResponseReport('Page exit retired X23 USART0 workers.');
  picoPublicWorkbench.deactivate();
  c3PublicWorkbench.disposeForPageExit();
});
window.__M6_ADD__ = addComponent;
window.__X75_BOM_NETLIST__ = Object.freeze({
  current: async (profile = selectedCompilerProfile) => createBomNetlistExport(bomNetlistExportInput(profile)),
  parse: (source) => parseBomNetlistText(source),
  download: () => exportCurrentBomNetlist(),
  guard: (profile = selectedCompilerProfile) => bomNetlistInputGuard(bomNetlistExportInput(profile)),
});
window.__X70_ACCESSIBLE_DEMONSTRATION__ = Object.freeze({
  current: async (profile = selectedCompilerProfile) => createAccessibleDemonstration(
    accessibleDemonstrationExportInput(profile)),
  validate: (source) => validateAccessibleDemonstrationSvg(source),
  download: () => exportCurrentAccessibleDemonstration(),
  guard: (profile = selectedCompilerProfile) => accessibleDemonstrationInputGuard(
    accessibleDemonstrationExportInput(profile)),
});
window.__M6_CONNECT__ = (from, to) => { pendingEndpoint = parseEndpoint(from); handlePin(parseEndpoint(to)); };
window.__M6_PROJECT__ = () => JSON.parse(currentProjectText());
window.__BROWSER_SESSION_CANONICAL_OWNER__ = Object.freeze({
  snapshot: () => {
    if (selectedCompilerProfile !== AVR_PROFILE) return { ok: false, code: 'API_PROFILE_READ_ONLY' };
    const candidateValidation = editor.kind === 'candidate-project-v3' ? {
      authoring: { ok: true, code: 'CANDIDATE_PROJECT_ACCEPTED', details: [] },
      runtime: editor.runnable,
      executable: editor.runnable.ok === true,
    } : null;
    return { ok: true, profile: AVR_PROFILE,
      projectId: `project-avr-${Math.max(1, lifecycle.projectGeneration)}`,
      revision: editor.revision, project: structuredClone(currentProject()),
      candidateValidation: structuredClone(candidateValidation),
      supportsEdit: (editor instanceof ProjectEditorReducer || editor.kind === 'candidate-project-v3')
        && boundedSubcircuits.instances.length === 0 };
  },
  batch: ({ expectedProjectId, expectedRevision, transactionId, commands }) => {
    if (selectedCompilerProfile !== AVR_PROFILE
        || (!(editor instanceof ProjectEditorReducer) && editor.kind !== 'candidate-project-v3')
        || boundedSubcircuits.instances.length) return { ok: false, code: 'API_PROFILE_READ_ONLY' };
    if (expectedProjectId !== `project-avr-${Math.max(1, lifecycle.projectGeneration)}`) {
      return { ok: false, code: 'API_PROJECT_CHANGED' };
    }
    if (expectedRevision !== editor.revision) return { ok: false, code: 'API_STALE_REVISION', revision: editor.revision };
    return applyEditor({ type: 'edit.batch', transactionId, commands }, 'API batch');
  },
  undo: ({ expectedProjectId, expectedRevision, transactionId }) => {
    if (selectedCompilerProfile !== AVR_PROFILE
        || (!(editor instanceof ProjectEditorReducer) && editor.kind !== 'candidate-project-v3')) {
      return { ok: false, code: 'API_PROFILE_READ_ONLY' };
    }
    if (expectedProjectId !== `project-avr-${Math.max(1, lifecycle.projectGeneration)}`) {
      return { ok: false, code: 'API_PROJECT_CHANGED' };
    }
    if (expectedRevision !== editor.revision) return { ok: false, code: 'API_STALE_REVISION', revision: editor.revision };
    return applyEditor({ type: 'edit.undo', transactionId }, 'API undo');
  },
  redo: ({ expectedProjectId, expectedRevision, transactionId }) => {
    if (selectedCompilerProfile !== AVR_PROFILE
        || (!(editor instanceof ProjectEditorReducer) && editor.kind !== 'candidate-project-v3')) {
      return { ok: false, code: 'API_PROFILE_READ_ONLY' };
    }
    if (expectedProjectId !== `project-avr-${Math.max(1, lifecycle.projectGeneration)}`) {
      return { ok: false, code: 'API_PROJECT_CHANGED' };
    }
    if (expectedRevision !== editor.revision) return { ok: false, code: 'API_STALE_REVISION', revision: editor.revision };
    return applyEditor({ type: 'edit.redo', transactionId }, 'API redo');
  },
});
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
try {
  stored = localStorage.getItem(activeProjectStorageKey) ?? localStorage.getItem(PROJECT_STORAGE_KEY);
  recoveryStored = localStorage.getItem(activeProjectRecoveryKey) ?? localStorage.getItem(PROJECT_RECOVERY_KEY);
} catch { /* storage denial is recoverable */ }
const recoveryRestored = recoveryStored ? parseAvrRecoverySource(recoveryStored) : null;
const currentRestored = stored ? parseAvrRecoverySource(stored) : null;
const restored = recoveryRestored?.ok ? recoveryRestored : currentRestored;
editor = restored?.ok ? restored.session : new ProjectEditorReducer(createEmptyProject());
canvasAnnotations = new CanvasAnnotationReducer(restored?.annotations ?? emptyCanvasAnnotations(), annotationReferences());
if (restored?.modelLibrary) projectModelLibraryLocks.set(AVR_PROFILE, structuredClone(restored.modelLibrary));
boundedSubcircuits = restored?.subcircuits
  ? contractSubcircuits(currentProject().circuit, restored.subcircuits, subcircuitOptions()).owner
  : emptySubcircuits(modelLibraryLockFor(AVR_PROFILE));
canvasAnnotationBaseline = canvasReadabilitySnapshot();
scenarioTimelineEditor = restored?.scenarioTimeline
  ? new ScenarioTimelineEditor(restored.scenarioTimeline) : null;
authoredScenarioResults = [];
lifecycle = createLifecycleState({ empty: currentProject().circuit.components.length === 0 });
let firstVisitStarterLoaded = false;
if (!restored?.ok && !stored && !recoveryStored) {
  const firstVisit = loadExampleProject('blink', 'project.first-visit');
  firstVisitStarterLoaded = firstVisit?.ok === true;
}
// Startup restoration is read-only. Keep the exact prior bytes available until
// the learner makes an authored change or explicitly saves a new copy.
renderDraftRecoveryChoices();
const workspace = document.querySelector('.workspace');
for (const [name, button] of [['catalog-collapsed', elements.togglecatalog], ['inspector-collapsed', elements.toggleinspector]]) {
  if (workspacePreference(name)) { workspace.classList.add(name); button.setAttribute('aria-pressed', 'true'); }
}
if (workspacePreference('pin-labels')) { elements.circuitcanvas.classList.add('show-pin-labels'); elements.showpinlabels.setAttribute('aria-pressed', 'true'); }
renderCompilerTarget(); renderCatalog(); renderProject(); renderProjectBrief(); renderModelLibraryStatus(); setRuntimeEnabled(false);
renderCheckableEvidence(null);
clearRuntimePresentation(); renderLifecycle();
setCanvasInteractionMode('select'); setSerialDock(false);
elements.projectmessage.textContent = recoveryRestored?.ok
  ? 'Recovered and revalidated an interrupted local save. Rebuild before Run.'
  : restored?.ok ? 'Reopened and revalidated the local project. Rebuild before Run.'
    : stored || recoveryStored ? 'A saved value was invalid and was left untouched. The empty in-memory project can be exported before retrying.'
      : firstVisitStarterLoaded
        ? 'The LED example is wired and ready. Choose Run; the Lab always builds fresh firmware before the first run.'
        : 'No example or hidden template is loaded.';
if ((stored || recoveryStored) && !restored?.ok) elements.recoveryexport.disabled = false;
for (const profile of [AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE]) setProjectBaseline(profile);
installNativeFileControls();
installLocalHistoryControls();
const pageViewCount = document.querySelector('#page-view-count');
fetch('/api/page-views', { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('PAGE_VIEW_DISABLED')))
  .then((availability) => {
    if (availability.status !== 'available') throw new Error('PAGE_VIEW_DISABLED');
    return fetch('/api/page-views', { method: 'POST', cache: 'no-store', credentials: 'same-origin' });
  })
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('PAGE_VIEW_UNAVAILABLE')))
  .then((value) => {
    pageViewCount.textContent = `Page views today: ${value.today.toLocaleString('en-GB')} · total since ${new Date(value.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: value.timeZone })}: ${value.total.toLocaleString('en-GB')}`;
    pageViewCount.title = `Calendar day ${value.dayEuropeOslo} in ${value.timeZone}. Reloads count as page views, not unique visitors.`;
  })
  .catch(() => { pageViewCount.textContent = 'Page views unavailable'; });
window.__UNSAVED_CHANGE_GUARD__ = Object.freeze({
  isDirty: (profile = selectedCompilerProfile) => isProjectDirty(profile),
  baseline: (profile = selectedCompilerProfile) => projectBaselines.get(profile),
  pending: () => pendingDestructiveProjectAction
    ? { token: pendingDestructiveProjectAction.token, profile: pendingDestructiveProjectAction.profile }
    : null,
});

installX81Assessment({
  trustedRegistry: X81_RETAINED_ASSESSMENT?.trustedRegistry ?? null,
  retainedEvidence: X81_RETAINED_ASSESSMENT?.sourceEvidence ?? null,
  retainedLabel: X81_RETAINED_ASSESSMENT?.label ?? 'Reviewed retained report',
});
