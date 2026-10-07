// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const CATALOG = Object.freeze({
  EDITOR_STALE_REVISION: 'The project changed before this edit finished. Try the action again.',
  EDITOR_ROUTE: 'That route would not stay orthogonal. Select a straight section and try again.',
  EDITOR_BRANCH_REQUIRED: 'Select one branch of a junction net; a two-pin net can only be removed as a whole.',
  PROJECT_SHAPE: 'This file is not a supported project. Export it again from the simulator or choose another file.',
  PROJECT_VERSION: 'This project uses an unsupported version. Use the migration option for older projects.',
  NO_LOCAL_SAVE: 'There is no saved project in this browser yet. Choose Save local first.',
  INPUT_LIMIT: 'The selected file is too large. Choose a project smaller than 1 MB.',
  BOARD_COUNT: 'Add exactly one supported controller before building.',
  INVALID_CIRCUIT: 'Complete the highlighted circuit issues before building.',
  BUILD_REQUEST_FAILED: 'The compiler service could not start this build. Check the service and try again.',
  BUILD_TIMEOUT: 'The build exceeded its time limit. Reduce the source or try again.',
  BUILD_FAILED: 'The firmware did not compile. Fix the first compiler diagnostic, then build again.',
  WORKER_WATCHDOG: 'The virtual controller stopped responding. Reset it or rebuild the current project.',
  WORKER_ERROR: 'The virtual controller stopped. Rebuild the current project, then try Run again.',
  PROMPT_SOURCE_BOUNDARY: 'The proposal tried to change data outside the circuit. Generate a new wiring proposal and try again.',
});

export function explainError(code, technical = '') {
  const stableCode = typeof code === 'string' && code ? code : 'UNEXPECTED_ERROR';
  let action = CATALOG[stableCode];
  if (!action && /^(?:INVALID_|MISSING_|CONFLICTING_|UNSUPPORTED_|AMBIGUOUS_)/u.test(stableCode)) {
    action = 'Review the circuit diagnostics, correct the named connection, then try again.';
  }
  if (!action && /^(?:PROJECT_|IMPORT_|V1_)/u.test(stableCode)) {
    action = 'The project was left unchanged. Correct the file or choose a compatible import mode.';
  }
  if (!action && /^(?:EDITOR_)/u.test(stableCode)) {
    action = 'The edit was not applied. Review the current selection and try again.';
  }
  if (!action) action = 'The action did not complete. Review the technical details, then try again.';
  return {
    code: stableCode,
    action,
    technical: String(technical || stableCode).slice(0, 8_192),
  };
}
