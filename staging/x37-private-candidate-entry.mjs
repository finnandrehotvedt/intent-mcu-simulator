// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { X37_REVIEWED_ROUTE, createX37OrdinaryCandidateRoute } from '../src/x37-ordinary-candidate-route.mjs';
import { installX37WorkbenchCandidate } from './x37-workbench-candidate-controller.mjs';

export function installReviewedX37PrivateCandidate(options = {}) {
  const route = createX37OrdinaryCandidateRoute({ routeIdentity: X37_REVIEWED_ROUTE, ...options });
  return installX37WorkbenchCandidate({ enabled: true, capability: route.capability,
    compileParticipant: route.compileParticipant, createRuntimePair: route.createRuntimePair,
    createProductAdapter: route.createProductAdapter, disposeRuntimePair: route.disposeRuntimePair,
    requestUnsavedGuard: options.requestUnsavedGuard, downloadText: options.downloadText });
}
