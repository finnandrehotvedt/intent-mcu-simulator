// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import { createObservedDigitalNetResolver, createAvrX37RuntimeSeam,
  createRp2040X37RuntimeSeam } from './x37-existing-runtime-seams.mjs';
import { runX37TurnaroundOrchestration } from './x37-turnaround-orchestrator.mjs';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function teardownX37Pair(pair, method) {
  if (!exactKeys(pair ?? {}, ['avr', 'rp']) || !['retire', 'dispose'].includes(method)) {
    fail('X37_PRODUCT_ADAPTER_TEARDOWN_INVALID');
  }
  const results = []; const errors = [];
  for (const id of ['avr', 'rp']) {
    try { results.push(pair[id][method]()); } catch (error) { errors.push({ participantId: id, code: error.code ?? error.message }); }
  }
  return Object.freeze({ results, errors });
}

export function createX37ProductAdapter({ schedulerContract, identities, artifacts, runtimes,
  builds, runtimePair, lifecycleOwner, validateBuild, maxTotalInstructions = 1_000_000,
  maxAdvanceCalls = 32 } = {}) {
  const selectedBuilds = builds ?? artifacts; const selectedRuntimes = runtimePair ?? runtimes;
  const owner = lifecycleOwner ?? (() => ({ builds: selectedBuilds }));
  if (!exactKeys(identities ?? {}, ['avr', 'rp']) && typeof lifecycleOwner !== 'function') {
    fail('X37_PRODUCT_ADAPTER_LIVE_OWNER_REQUIRED');
  }
  if (!exactKeys(selectedBuilds ?? {}, ['avr', 'rp'])
      || !exactKeys(selectedRuntimes ?? {}, ['avr', 'rp']) || typeof validateBuild !== 'function') {
    fail('X37_PRODUCT_ADAPTER_INPUT_INVALID');
  }
  for (const id of ['avr', 'rp']) {
    const artifact = selectedBuilds[id]; const live = owner();
    const identity = identities?.[id] ?? { participantId: id,
      projectGeneration: live.projectGeneration, runtimeGeneration: live.runtimeGeneration };
    if (!identity || !artifact || !validateBuild(id, artifact, identity, live)
        || artifact.projectGeneration !== identity.projectGeneration
        || artifact.runtimeGeneration !== identity.runtimeGeneration
        || artifact.participantId !== id || artifact.profile !== (id === 'avr' ? 'avr' : 'rp2040')
        || !/^[0-9a-f]{64}$/u.test(artifact.artifactIdentity ?? '')
        || !/^[0-9a-f]{64}$/u.test(artifact.modelLibrarySha256 ?? '')
        || !/^[0-9a-f]{64}$/u.test(artifact.toolchainSha256 ?? '')) fail('X37_PRODUCT_ADAPTER_STALE_BUILD');
  }
  const identityOwner = (id) => () => {
    const live = owner(); const build = live.builds?.[id];
    if (!build || build.artifactIdentity !== selectedBuilds[id].artifactIdentity) {
      fail('X37_PRODUCT_ADAPTER_LIVE_BINDING_STALE');
    }
    return identities?.[id] ?? { participantId: id,
      projectGeneration: live.projectGeneration, runtimeGeneration: live.runtimeGeneration };
  };
  const seams = {
    avr: createAvrX37RuntimeSeam({ runtime: selectedRuntimes.avr, identityOwner: identityOwner('avr'),
      schedulerContract, maxTotalInstructions, maxAdvanceCalls }),
    rp: createRp2040X37RuntimeSeam({ runtime: selectedRuntimes.rp, identityOwner: identityOwner('rp'),
      schedulerContract, maxTotalInstructions, maxAdvanceCalls }),
  };
  const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0',
    driverParticipantIds: ['avr', 'rp'], idleLevel: true });
  return Object.freeze({
    run(inputApplied) { return runX37TurnaroundOrchestration({ seams, schedulerContract, net, inputApplied }); },
    pause() { return teardownX37Pair(seams, 'retire'); },
    retire() { return teardownX37Pair(seams, 'retire'); },
    dispose() { return teardownX37Pair(seams, 'dispose').errors; },
  });
}
