// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const PROJECT_PERFORMANCE_BUDGET_SCHEMA = 'intent-mcu-project-performance-budget@1';

export const PROJECT_PERFORMANCE_BUDGET = Object.freeze({
  schema: PROJECT_PERFORMANCE_BUDGET_SCHEMA,
  environment: Object.freeze({
    browser: 'Chromium via Playwright 1.55.0',
    mode: 'headless',
    viewport: Object.freeze({ width: 1440, height: 1000, deviceScaleFactor: 1 }),
    rounds: 7,
  }),
  hardLimits: Object.freeze({
    components: 64,
    nets: 128,
    endpoints: 256,
    routePointsPerBranch: 32,
    editorHistoryEntries: 64,
    projectExportBytes: 1_048_576,
    sourceFiles: 8,
    sourceBytes: 131_072,
  }),
  practicalV2Maximum: Object.freeze({
    components: 64,
    availablePins: 213,
    twoEndpointNets: 106,
    connectedEndpoints: 212,
    reason: 'One 24-pin board plus 63 current three-pin v2 parts; one endpoint remains unpaired.',
  }),
  maximumCandidateFixture: Object.freeze({
    components: 64,
    nets: 128,
    endpoints: 256,
    runnable: false,
    purpose: 'Structurally and electrically safe maximum validator/render fixture, not a learner circuit.',
  }),
  regressionBudgetMilliseconds: Object.freeze({
    coldReady: 2_000,
    supportedLearnerRender: 500,
    maximumImportRender: 6_000,
    select: 250,
    move: 6_000,
    undo: 6_000,
    routeEdit: 6_000,
  }),
  maximumHeapDeltaBytes: 134_217_728,
  qualification: 'Budgets gate the recorded desktop environment with headroom; they are not arbitrary-device guarantees.',
});
