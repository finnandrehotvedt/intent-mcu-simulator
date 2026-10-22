// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSUMPTION_PROJECT_ENVELOPE_SCHEMA, CAPABILITY_PROJECT_ENVELOPE_SCHEMA,
  LEGACY_PROJECT_BRIEF_SCHEMA, LEGACY_PROJECT_ENVELOPE_SCHEMA,
  PREVIOUS_PROJECT_BRIEF_SCHEMA, PREVIOUS_PROJECT_ENVELOPE_SCHEMA,
  PROJECT_BRIEF_SCHEMA, PROJECT_ENVELOPE_SCHEMA, SCENARIOLESS_PROJECT_ENVELOPE_SCHEMA,
  TRACE_PROJECT_BRIEF_SCHEMA, TRACE_PROJECT_ENVELOPE_SCHEMA,
  canonicalProjectEnvelope, emptyProjectBrief, migrateProjectModelLibrary, prepareProjectEnvelope,
} from '../src/project-envelope.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK, RC111_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_ALL_PROFILE_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_LED_OUTLINE_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_UX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK,
  PRIOR_CURRENT_MODEL_LIBRARY_LOCK, RETAINED_MODEL_LIBRARY_LOCK,
} from '../src/model-library.mjs';

const profile = 'board.example-v1';
const adapters = {
  [profile]: {
    schemas: ['example-project@1'],
    prepare(value) {
      if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['layout', 'name', 'profile', 'schema'].sort())
        || value.schema !== 'example-project@1' || value.profile !== profile
        || typeof value.name !== 'string' || typeof value.layout?.rotation !== 'number') throw new Error('EXAMPLE_INVALID');
      return { project: structuredClone(value), prepared: { accepted: true } };
    },
  },
};
const project = { schema: 'example-project@1', profile, name: 'Example', layout: { rotation: 90 } };

test('canonical envelope is deterministic and reopens with explicit profile identity', () => {
  const text = canonicalProjectEnvelope(profile, project, adapters);
  const opened = prepareProjectEnvelope(text, adapters);
  assert.equal(opened.ok, true);
  assert.equal(opened.profile, profile);
  assert.deepEqual(opened.project, project);
  assert.equal(opened.canonical, text);
  assert.equal(JSON.parse(text).schema, PROJECT_ENVELOPE_SCHEMA);
});

test('known legacy project migrates without changing its authored document', () => {
  const opened = prepareProjectEnvelope(JSON.stringify(project), adapters);
  assert.equal(opened.code, 'PROJECT_ENVELOPE_MIGRATED');
  assert.equal(opened.report.legacy, true);
  assert.equal(prepareProjectEnvelope(opened.canonical, adapters).canonical, opened.canonical);
});

test('v1 envelope migrates with an explicit empty inert brief', () => {
  const old = { schema: LEGACY_PROJECT_ENVELOPE_SCHEMA, profile, project };
  const opened = prepareProjectEnvelope(JSON.stringify(old), adapters);
  assert.equal(opened.code, 'PROJECT_ENVELOPE_MIGRATED');
  assert.deepEqual(opened.brief, emptyProjectBrief());
  assert.equal(JSON.parse(opened.canonical).schema, PROJECT_ENVELOPE_SCHEMA);
  assert(opened.report.defaultsAdded.includes('empty project brief'));
});

test('rc31 v2 envelope migrates criteria to explicit empty traceability and assumptions', () => {
  const previous = {
    schema: TRACE_PROJECT_ENVELOPE_SCHEMA,
    profile,
    brief: { schema: LEGACY_PROJECT_BRIEF_SCHEMA, purpose: 'Legacy goal', inputs: [], outputs: [],
      boundaryCases: [], acceptanceCriteria: [{ id: 'REQ-OLD', text: 'Old criterion' }] },
    project,
  };
  const opened = prepareProjectEnvelope(JSON.stringify(previous), adapters);
  assert.equal(opened.code, 'PROJECT_ENVELOPE_MIGRATED');
  assert.deepEqual(opened.brief.acceptanceCriteria[0], {
    id: 'REQ-OLD', text: 'Old criterion', codeRefs: [], testRefs: [],
  });
  assert.deepEqual(opened.brief.openAssumptions, []);
  assert(opened.report.defaultsAdded.includes('empty requirement code/test references'));
  assert.equal(JSON.parse(opened.canonical).schema, PROJECT_ENVELOPE_SCHEMA);
});

test('rc32 v3 envelope migrates with an explicit empty unresolved assumption list', () => {
  const previous = {
    schema: ASSUMPTION_PROJECT_ENVELOPE_SCHEMA, profile,
    brief: { schema: TRACE_PROJECT_BRIEF_SCHEMA, purpose: 'Traceable goal', inputs: [], outputs: [],
      boundaryCases: [], acceptanceCriteria: [{ id: 'REQ-OLD', text: 'Old criterion',
        codeRefs: ['main.c:1'], testRefs: ['TEST-OLD'] }] }, project,
  };
  const opened = prepareProjectEnvelope(JSON.stringify(previous), adapters);
  assert.equal(opened.code, 'PROJECT_ENVELOPE_MIGRATED');
  assert.deepEqual(opened.brief.openAssumptions, []);
  assert(opened.report.defaultsAdded.includes('empty unresolved assumption list'));
});

test('rc33 v4 envelope migrates with an explicit empty required capability list', () => {
  const previous = {
    schema: CAPABILITY_PROJECT_ENVELOPE_SCHEMA, profile,
    brief: { schema: PREVIOUS_PROJECT_BRIEF_SCHEMA, purpose: 'Questioned goal', inputs: [], outputs: [],
      boundaryCases: [], acceptanceCriteria: [{ id: 'REQ-OLD', text: 'Old criterion', codeRefs: [], testRefs: [] }],
      openAssumptions: [{ id: 'ASK-PIN', kind: 'pin', question: 'Which pin?', requirementIds: ['REQ-OLD'] }] }, project,
  };
  const opened = prepareProjectEnvelope(JSON.stringify(previous), adapters);
  assert.equal(opened.code, 'PROJECT_ENVELOPE_MIGRATED');
  assert.deepEqual(opened.brief.requiredCapabilities, []);
  assert(opened.report.defaultsAdded.includes('empty required capability list'));
});

test('rc42 v5 envelope migrates with an explicit empty scenario timeline', () => {
  const previous = { schema: SCENARIOLESS_PROJECT_ENVELOPE_SCHEMA, profile,
    brief: emptyProjectBrief(), project };
  const opened = prepareProjectEnvelope(JSON.stringify(previous), adapters);
  assert.equal(opened.code, 'PROJECT_ENVELOPE_MIGRATED');
  assert.equal(opened.scenarioTimeline, null);
  assert(opened.report.defaultsAdded.includes('empty scenario timeline'));
});

test('pre-X56 v6 maps unambiguously to the retained finite snapshot and preserves scenario data', () => {
  const scenarioTimeline = null;
  const previous = { schema: PREVIOUS_PROJECT_ENVELOPE_SCHEMA, profile,
    brief: emptyProjectBrief(), scenarioTimeline, project };
  const opened = prepareProjectEnvelope(JSON.stringify(previous), adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.modelLibrary, RETAINED_MODEL_LIBRARY_LOCK);
  assert.equal(opened.modelLibraryRetained, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  assert.equal(opened.scenarioTimeline, scenarioTimeline);
});

test('rejected private X56 envelope and lock revisions never silently migrate', () => {
  const rejected = { schema: 'intent-mcu-project-envelope@7', profile,
    modelLibrary: { schema: 'intent-mcu-model-library-lock@1', libraryId: 'intent-mcu-public-models',
      version: 'rejected-private', manifestSha256: 'a'.repeat(64) },
    brief: emptyProjectBrief(), scenarioTimeline: null, project };
  assert.equal(prepareProjectEnvelope(JSON.stringify(rejected), adapters).code,
    'MODEL_LIBRARY_REJECTED_PRIVATE_REVISION');
});

test('model-library migration creates a deterministic current copy without changing original bytes or authority', () => {
  const previous = JSON.stringify({ schema: PREVIOUS_PROJECT_ENVELOPE_SCHEMA, profile,
    brief: emptyProjectBrief(), scenarioTimeline: null, project });
  const migrated = migrateProjectModelLibrary(previous, adapters);
  const repeated = migrateProjectModelLibrary(previous, adapters);
  assert.equal(migrated.ok, true);
  assert.deepEqual(repeated, migrated);
  assert.equal(migrated.originalUnchanged, previous);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.equal(migrated.preview.semanticChanges.length, 0);
  assert.equal(migrated.preview.rendererChanges.length, 0);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(migrateProjectModelLibrary(migrated.canonical, adapters).code, 'MODEL_LIBRARY_ALREADY_CURRENT');
});

test('accepted public rc.111 envelope reopens and migrates without changing saved bytes or authority', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null, RC111_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, RC111_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(migrated.preview.semanticChanges, []);
  assert.deepEqual(migrated.preview.rendererChanges, []);
  assert.equal(migrated.preview.unchanged.length, 25);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('prior X56 saved envelope reopens only for explicit data migration with runtime authority cleared', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null, PRIOR_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.modelLibrary, PRIOR_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('public rc.100 envelope reopens only for explicit data migration with runtime authority cleared', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null,
    PRE_X55_ALL_PROFILE_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X55_ALL_PROFILE_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('public rc.101 envelope reopens only for explicit data migration with runtime authority cleared', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null,
    PRE_X55_LED_OUTLINE_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X55_LED_OUTLINE_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('public rc.102 envelope reopens only for explicit data migration with runtime authority cleared', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null,
    PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('first private bounded-body envelope migrates data-only after the lead continuity fix', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null,
    PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('public rc.103 envelope migrates data-only after the no-op Apply correction', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null,
    PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('private no-op Apply envelope migrates data-only after the split editor', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null,
    PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('private split-editor envelope migrates data-only after model copy correction', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null,
    PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('pre-control-label X55 envelope is data-migration-only and cannot retain runtime authority', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null,
    PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('accepted rc.95 envelope is data-migration-only under the reviewed UX identity', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null, PRE_UX_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_UX_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('pre-X55 current envelope is data-migration-only and cannot retain runtime authority', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null, PRE_X55_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X55_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('pre-X47 saved project data migrates unchanged while old runtime authority is cleared', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null, PRE_X47_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X47_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  assert.equal(opened.report.modelLibrary.migrationAvailable, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).project, project);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('pre-validation X47 project data migrates while its old runtime authority is cleared', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null, PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('pre-UI X47 project data migrates while its old runtime authority is cleared', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null, PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('pre-async X47 project data migrates while its old runtime authority is cleared', () => {
  const oldEnvelope = canonicalProjectEnvelope(
    profile, project, adapters, emptyProjectBrief(), null, PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK,
  );
  const opened = prepareProjectEnvelope(oldEnvelope, adapters);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.deepEqual(opened.modelLibrary, PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(opened.report.executableAuthorityCleared, true);
  const migrated = migrateProjectModelLibrary(oldEnvelope, adapters);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.originalUnchanged, oldEnvelope);
  assert.equal(migrated.executableAuthorityCleared, true);
  assert.deepEqual(JSON.parse(migrated.canonical).modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
});

test('current envelope rejects a rehashed or unknown model-library lock atomically', () => {
  const envelope = JSON.parse(canonicalProjectEnvelope(profile, project, adapters));
  envelope.modelLibrary = { ...envelope.modelLibrary, version: 'forged', manifestSha256: 'a'.repeat(64) };
  assert.equal(prepareProjectEnvelope(JSON.stringify(envelope), adapters).code, 'MODEL_LIBRARY_LOCK_UNTRUSTED');
});

test('X01 brief round-trips purpose, inputs, outputs, boundaries and unevaluated acceptance IDs', () => {
  const brief = {
    schema: PROJECT_BRIEF_SCHEMA,
    purpose: 'Turn the teaching LED on only when the button is pressed.',
    inputs: ['D2 button level'],
    outputs: ['D13 LED level'],
    boundaryCases: ['Reset while button is pressed', 'Disconnected ground'],
    acceptanceCriteria: [
      { id: 'REQ-LED-ON', text: 'Observed D13 is HIGH while D2 is LOW.',
        codeRefs: ['main.ino:12-18'], testRefs: ['TEST-BUTTON-LOW'] },
      { id: 'REQ-RESET', text: 'Reset does not manufacture a passing observation.',
        codeRefs: ['main.ino:4'], testRefs: ['TEST-RESET'] },
    ],
    openAssumptions: [
      { id: 'ASK-VOLTAGE', kind: 'voltage', question: 'Which supply voltage is required?',
        requirementIds: ['REQ-LED-ON'] },
    ],
    requiredCapabilities: [
      { id: 'NEED-GPIO', kind: 'peripheral', target: 'gpio', requirementIds: ['REQ-LED-ON'] },
    ],
  };
  const text = canonicalProjectEnvelope(profile, project, adapters, brief);
  const opened = prepareProjectEnvelope(text, adapters);
  assert.deepEqual(opened.brief, brief);
  assert.deepEqual(JSON.parse(opened.canonical).brief, brief);
  assert.equal(opened.canonical, text);
});

test('X01 brief rejects unknown fields, duplicate IDs, malformed IDs and result authority', () => {
  const base = { schema: PROJECT_BRIEF_SCHEMA, purpose: '', inputs: [], outputs: [],
    boundaryCases: [], acceptanceCriteria: [], openAssumptions: [], requiredCapabilities: [] };
  const wrap = (brief) => JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile,
    modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, brief,
    scenarioTimeline: null, project });
  assert.equal(prepareProjectEnvelope(wrap({ ...base, extra: true }), adapters).code, 'PROJECT_BRIEF_SHAPE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'REQ-1', text: 'One', codeRefs: [], testRefs: [] },
    { id: 'REQ-1', text: 'Two', codeRefs: [], testRefs: [] },
  ] }), adapters).code, 'PROJECT_BRIEF_CRITERION_DUPLICATE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'bad id', text: 'No', codeRefs: [], testRefs: [] },
  ] }), adapters).code, 'PROJECT_BRIEF_CRITERION_ID');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, verdict: 'passed' }), adapters).code, 'PROJECT_BRIEF_SHAPE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'REQ-1', text: 'No', codeRefs: ['/etc/passwd'], testRefs: [] },
  ] }), adapters).code, 'PROJECT_BRIEF_CODE_REFERENCE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'REQ-1', text: 'No', codeRefs: [], testRefs: ['bad test'] },
  ] }), adapters).code, 'PROJECT_BRIEF_TEST_REFERENCE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'REQ-1', text: 'No', codeRefs: ['main.c', 'main.c'], testRefs: [] },
  ] }), adapters).code, 'PROJECT_BRIEF_REFERENCE_DUPLICATE');
});

test('X03 assumptions remain unresolved data and reject malformed or authority-bearing claims', () => {
  const criterion = { id: 'REQ-1', text: 'Known requirement', codeRefs: [], testRefs: [] };
  const base = { schema: PROJECT_BRIEF_SCHEMA, purpose: '', inputs: [], outputs: [],
    boundaryCases: [], acceptanceCriteria: [criterion], openAssumptions: [], requiredCapabilities: [] };
  const wrap = (brief) => JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile,
    modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, brief,
    scenarioTimeline: null, project });
  const valid = { id: 'ASK-PIN', kind: 'pin', question: 'Which pin is required?', requirementIds: ['REQ-1'] };
  assert.equal(prepareProjectEnvelope(wrap({ ...base, openAssumptions: [valid] }), adapters).ok, true);
  assert.equal(prepareProjectEnvelope(wrap({ ...base, openAssumptions: [{ ...valid, kind: 'bus' }] }), adapters).code,
    'PROJECT_BRIEF_ASSUMPTION_KIND');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, openAssumptions: [valid, valid] }), adapters).code,
    'PROJECT_BRIEF_ASSUMPTION_DUPLICATE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, openAssumptions: [{ ...valid, requirementIds: ['REQ-MISSING'] }] }), adapters).code,
    'PROJECT_BRIEF_ASSUMPTION_REQUIREMENT_UNKNOWN');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, openAssumptions: [{ ...valid, status: 'supported' }] }), adapters).code,
    'PROJECT_BRIEF_ASSUMPTION_SHAPE');
});

test('X04 required capabilities reject status claims, duplicates and unknown requirement links', () => {
  const criterion = { id: 'REQ-1', text: 'Known requirement', codeRefs: [], testRefs: [] };
  const base = { schema: PROJECT_BRIEF_SCHEMA, purpose: '', inputs: [], outputs: [], boundaryCases: [],
    acceptanceCriteria: [criterion], openAssumptions: [], requiredCapabilities: [] };
  const wrap = (brief) => JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile,
    modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, brief,
    scenarioTimeline: null, project });
  const valid = { id: 'NEED-GPIO', kind: 'peripheral', target: 'gpio', requirementIds: ['REQ-1'] };
  assert.equal(prepareProjectEnvelope(wrap({ ...base, requiredCapabilities: [valid] }), adapters).ok, true);
  assert.equal(prepareProjectEnvelope(wrap({ ...base, requiredCapabilities: [valid, valid] }), adapters).code,
    'PROJECT_BRIEF_CAPABILITY_DUPLICATE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, requiredCapabilities: [{ ...valid, kind: 'library' }] }), adapters).code,
    'PROJECT_BRIEF_CAPABILITY_KIND');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, requiredCapabilities: [{ ...valid, target: 'Bad Target' }] }), adapters).code,
    'PROJECT_BRIEF_CAPABILITY_TARGET');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, requiredCapabilities: [{ ...valid, requirementIds: ['REQ-X'] }] }), adapters).code,
    'PROJECT_BRIEF_CAPABILITY_REQUIREMENT_UNKNOWN');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, requiredCapabilities: [{ ...valid, status: 'available' }] }), adapters).code,
    'PROJECT_BRIEF_CAPABILITY_SHAPE');
});

test('strict failures reject duplicate keys, unknown versions and profile mismatches', () => {
  assert.equal(prepareProjectEnvelope('{"schema":"x","schema":"y"}', adapters).code, 'DUPLICATE_KEY');
  assert.equal(prepareProjectEnvelope('{"schema":"unknown@1"}', adapters).code, 'PROJECT_ENVELOPE_VERSION');
  const mismatch = { schema: PROJECT_ENVELOPE_SCHEMA, profile, modelLibrary: CURRENT_MODEL_LIBRARY_LOCK,
    brief: emptyProjectBrief(), scenarioTimeline: null,
    project: { ...project, profile: 'board.other-v1' } };
  assert.equal(prepareProjectEnvelope(JSON.stringify(mismatch), adapters).code, 'PROJECT_ENVELOPE_PROFILE_MISMATCH');
});

test('executable and runtime authority are rejected from normalized project data', () => {
  const authorityAdapters = { [profile]: { schemas: ['bad@1'], prepare: (value) => ({ project: value }) } };
  for (const field of ['artifact', 'firmwareHex', 'runtime', 'sessionId', 'capability', 'verdict']) {
    const value = { schema: 'bad@1', profile, [field]: 'not allowed' };
    assert.equal(prepareProjectEnvelope(JSON.stringify(value), authorityAdapters).code,
      'PROJECT_ENVELOPE_EXECUTABLE_AUTHORITY');
  }
});

test('raw authority is rejected before an adapter can silently discard it', () => {
  const strippingAdapters = { [profile]: {
    schemas: ['strip@1'],
    prepare: (value) => ({ project: { schema: value.schema, profile: value.profile, name: 'stripped' } }),
  } };
  const raw = { schema: 'strip@1', profile, name: 'unsafe', firmwareBytes: 'AA==' };
  assert.equal(prepareProjectEnvelope(JSON.stringify(raw), strippingAdapters).code,
    'PROJECT_ENVELOPE_EXECUTABLE_AUTHORITY');
});

test('documented dirty-null legacy artifact metadata remains inert and accepted', () => {
  const inertAdapters = { [profile]: { schemas: ['inert@1'], prepare: (value) => ({ project: value }) } };
  const value = { schema: 'inert@1', profile,
    artifact: { status: 'dirty', inputIdentitySha256: null, artifactIdentitySha256: null } };
  assert.equal(prepareProjectEnvelope(JSON.stringify(value), inertAdapters).ok, true);
});
