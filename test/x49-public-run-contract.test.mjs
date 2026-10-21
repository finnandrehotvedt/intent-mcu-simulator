// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/x49-private-runtime-manifest.json' with { type: 'json' };
import {
  acceptX49PublicArtifact, captureX49PublicAuthority, prepareX49PublicBuild,
  x49PublicAuthorityStillCurrent,
} from '../src/x49-public-run-contract.mjs';
import { X49_INSTRUMENTED_SOURCE_SHA256 } from '../src/x49-instrumented-fixture-contract.mjs';
import { x49BuildResult, x49PublicState } from './x49-public-fixtures.mjs';

test('X49 public contract freezes source, graph, profile, generation and toolchain authority', async () => {
  const state = x49PublicState();
  const authority = await captureX49PublicAuthority(state);
  assert.equal(await x49PublicAuthorityStillCurrent(authority, state), true);
  const request = await prepareX49PublicBuild(authority);
  assert.equal(request.files.length, 1);
  assert.equal(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.files[0].content))
    .then((bytes) => [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, '0')).join('')),
  X49_INSTRUMENTED_SOURCE_SHA256);
  const claim = { jobId: 'job-1', capability: 'capability', inputIdentity: 'a'.repeat(64) };
  const accepted = await acceptX49PublicArtifact({ claim, result: await x49BuildResult(), authority, manifest });
  assert.equal(accepted.experimentBinding.graphIdentity, authority.graphIdentity);
  assert.equal(accepted.probe.symbol.dataAddress, 0x100);

  const changed = x49PublicState(); changed.revision += 1;
  assert.equal(await x49PublicAuthorityStillCurrent(authority, changed), false);
  const sourceDrift = x49PublicState(); sourceDrift.project.project.source.files[0].content += '\n// drift';
  await assert.rejects(captureX49PublicAuthority(sourceDrift), { code: 'X49_PUBLIC_SOURCE_AUTHORITY_INVALID' });
  const graphDrift = x49PublicState(); graphDrift.project.candidateCircuit.components[0].label = 'drift';
  await assert.rejects(captureX49PublicAuthority(graphDrift), { code: 'X49_PUBLIC_GRAPH_AUTHORITY_INVALID' });
  const running = x49PublicState(); running.lifecycle.phase = 'running';
  await assert.rejects(captureX49PublicAuthority(running), { code: 'X49_PUBLIC_NORMAL_OPERATION_ACTIVE' });
  const artifactDrift = await x49BuildResult(); artifactDrift.toolchainIdentitySha256 = '0'.repeat(64);
  await assert.rejects(acceptX49PublicArtifact({ claim, result: artifactDrift, authority, manifest }),
    { code: 'X49_PUBLIC_BUILD_RESULT_INVALID' });
});
