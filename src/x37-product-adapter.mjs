// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import { createObservedDigitalNetResolver, createAvrX37RuntimeSeam,
  createRp2040X37RuntimeSeam } from './x37-existing-runtime-seams.mjs';
import { runX37TurnaroundOrchestration } from './x37-turnaround-orchestrator.mjs';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function createX37ProductAdapter({ schedulerContract, identities, artifacts, runtimes,
  maxTotalInstructions = 1_000_000, maxAdvanceCalls = 32 } = {}) {
  if (!exactKeys(identities ?? {}, ['avr', 'rp']) || !exactKeys(artifacts ?? {}, ['avr', 'rp'])
      || !exactKeys(runtimes ?? {}, ['avr', 'rp'])) fail('X37_PRODUCT_ADAPTER_INPUT_INVALID');
  for (const id of ['avr', 'rp']) {
    const identity = identities[id]; const artifact = artifacts[id];
    if (!identity || !artifact || artifact.projectGeneration !== identity.projectGeneration
        || typeof artifact.artifactIdentity !== 'string') fail('X37_PRODUCT_ADAPTER_STALE_BUILD');
  }
  const seams = {
    avr: createAvrX37RuntimeSeam({ runtime: runtimes.avr, identityOwner: () => identities.avr,
      schedulerContract, maxTotalInstructions, maxAdvanceCalls }),
    rp: createRp2040X37RuntimeSeam({ runtime: runtimes.rp, identityOwner: () => identities.rp,
      schedulerContract, maxTotalInstructions, maxAdvanceCalls }),
  };
  const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0',
    driverParticipantIds: ['avr', 'rp'], idleLevel: true });
  return Object.freeze({
    run(inputApplied) { return runX37TurnaroundOrchestration({ seams, schedulerContract, net, inputApplied }); },
    retire() { return [seams.avr.retire(), seams.rp.retire()]; },
    dispose() { return [seams.avr.dispose(), seams.rp.dispose()]; },
  });
}
