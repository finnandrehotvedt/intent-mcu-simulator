// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export async function resolveX37ProducerArtifacts({ mode, compile, loadRetained }) {
  if (!['compile', 'retained'].includes(mode) || typeof compile !== 'function'
      || typeof loadRetained !== 'function') throw Object.assign(new Error('X37_ARTIFACT_SOURCE_CONFIGURATION'), { code: 'X37_ARTIFACT_SOURCE_CONFIGURATION' });
  if (mode === 'retained') return { mode, artifacts: await loadRetained(), compileCalls: 0 };
  return { mode, artifacts: await compile(), compileCalls: 2 };
}
