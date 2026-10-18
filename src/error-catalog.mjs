// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { faultDiagnostic } from './fault-diagnostics.mjs';

const CATALOG = Object.freeze({
  EDITOR_STALE_REVISION: 'The project changed before this edit finished. Try the action again.',
  EDITOR_ROUTE: 'That route would not stay orthogonal. Select a straight section and try again.',
  EDITOR_BRANCH_REQUIRED: 'Select one branch of a junction net; a two-pin net can only be removed as a whole.',
  PROJECT_SHAPE: 'This file is not a supported project. Export it again from the simulator or choose another file.',
  PROJECT_VERSION: 'This project uses an unsupported version. Use the migration option for older projects.',
  NO_LOCAL_SAVE: 'There is no browser recovery copy yet. Save a project file or continue editing before trying recovery.',
  FILE_SAVE_FAILED: 'The project file was not saved. Check browser file permission, retry the connected save, or choose Download copy.',
  PROJECT_READ_FAILED: 'The project file could not be read. Choose an accessible JSON project file and try again.',
  INPUT_LIMIT: 'The selected file is too large. Choose a project smaller than 1 MB.',
  BOARD_COUNT: 'Add exactly one supported controller before building.',
  INVALID_CIRCUIT: 'Complete the highlighted circuit issues before building.',
  BUILD_REQUEST_FAILED: 'The compiler service could not start this build. Check the service and try again.',
  BUILD_TIMEOUT: 'The build exceeded its time limit. Reduce the source or try again.',
  BUILD_FAILED: 'The firmware did not compile. Fix the first compiler diagnostic, then build again.',
  COMPILER_TARGET_UNAVAILABLE: 'This controller cannot build yet. Install and verify its compiler target before trying Build.',
  ADAPTER_EXECUTION_BLOCKED: 'This firmware compiled, but Run is unavailable because this controller has no verified runtime adapter.',
  WORKER_WATCHDOG: 'The virtual controller stopped responding. Reset it or rebuild the current project.',
  WORKER_ERROR: 'The virtual controller stopped. Rebuild the current project, then try Run again.',
  PROMPT_SOURCE_BOUNDARY: 'The proposal tried to change data outside the circuit. Generate a new wiring proposal and try again.',
});

export function explainError(code, technical = '') {
  const stableCode = typeof code === 'string' && code ? code : 'UNEXPECTED_ERROR';
  const fault = faultDiagnostic(stableCode);
  let action = fault?.action ?? CATALOG[stableCode];
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
    technical: String(technical || fault?.modelBoundary || stableCode).slice(0, 8_192),
  };
}
