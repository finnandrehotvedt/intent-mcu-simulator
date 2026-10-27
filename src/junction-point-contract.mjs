// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const JUNCTION_POINT_REQUIREMENT_ID = 'CMP-019';
export const JUNCTION_POINT_PROFILES = Object.freeze({
  'board.atmega328p-16mhz-v1': Object.freeze({
    representation: 'explicit-junction-record',
    explicitJunctionIdentity: true,
    runtimeBoundary: 'Topology participates only in a fresh project-specific AVR Build; this contract grants no independent runtime authority.',
  }),
  'board.rp2040-pico-v1': Object.freeze({
    representation: 'validated-multi-endpoint-net',
    explicitJunctionIdentity: false,
    runtimeBoundary: 'The canonical example is authoring-only and has no executable projection.',
  }),
  'board.esp32-c3-devmodule-v1': Object.freeze({
    representation: 'validated-multi-endpoint-net',
    explicitJunctionIdentity: false,
    runtimeBoundary: 'The canonical example is authoring-only and has no executable projection.',
  }),
  'board.stm32f429zi-nucleo144-v1': Object.freeze({
    representation: 'validated-multi-endpoint-net',
    explicitJunctionIdentity: false,
    runtimeBoundary: 'The canonical example is authoring-only and has no executable projection.',
  }),
});
export const JUNCTION_POINT_LIMITATIONS = Object.freeze([
  'A junction is authored graph topology, not a decorative or physical component.',
  'Only endpoints in the declared branched net are electrically joined; a different net crossing at the same drawing point remains separate.',
  'The contract does not model contact resistance, current capacity, voltage drop, heating, parasitics, arcing, insulation, safety certification or physical hardware.',
  'Opening or drawing a junction never restores or creates executable authority.',
]);

const endpointKey = ({ component, pin }) => `${component}.${pin}`;
const samePoint = (left, right) => left && right
  && Math.abs(left.x - right.x) < 1e-9 && Math.abs(left.y - right.y) < 1e-9;
const failure = (code, details = {}) => ({ ok: false, code, details });

function routeContainsPoint(layout, netId, point) {
  const route = layout?.wireRoutes?.[netId];
  return route?.schema === 'intent-mcu-route@1' && Array.isArray(route.branches)
    && route.branches.some(({ points }) => Array.isArray(points)
      && points.some((candidate) => samePoint(candidate, point)));
}

export function inspectJunctionPoint({
  profile, graph, layout, junctionNetId, crossingNetId, junctionId = null, crossingPoint,
}) {
  const behavior = JUNCTION_POINT_PROFILES[profile];
  if (!behavior) return failure('JUNCTION_PROFILE_UNAVAILABLE', { profile });
  if (!graph || !Array.isArray(graph.nets) || !layout || !crossingPoint
      || typeof junctionNetId !== 'string' || typeof crossingNetId !== 'string'
      || junctionNetId === crossingNetId) return failure('JUNCTION_CONTRACT_SHAPE');
  const junctionNet = graph.nets.find(({ id }) => id === junctionNetId);
  const crossingNet = graph.nets.find(({ id }) => id === crossingNetId);
  if (!junctionNet || !crossingNet) return failure('JUNCTION_NET_MISSING');
  if (junctionNet.endpoints.length < 3) {
    return failure('JUNCTION_REQUIRES_THREE_ENDPOINTS', { endpoints: junctionNet.endpoints.length });
  }
  if (crossingNet.endpoints.length < 2) return failure('JUNCTION_CROSSING_NET_INVALID');
  const junctionEndpoints = new Set(junctionNet.endpoints.map(endpointKey));
  const sharedEndpoints = crossingNet.endpoints.map(endpointKey)
    .filter((key) => junctionEndpoints.has(key));
  if (sharedEndpoints.length) return failure('JUNCTION_CROSSING_REUSES_ENDPOINT', { sharedEndpoints });
  if (behavior.explicitJunctionIdentity) {
    const junction = Array.isArray(graph.junctions)
      ? graph.junctions.find(({ id }) => id === junctionId) : null;
    if (!junction || junction.net !== junctionNetId) {
      return failure('JUNCTION_EXPLICIT_IDENTITY_MISSING', { junctionId, junctionNetId });
    }
  } else if (junctionId !== null) {
    return failure('JUNCTION_PROFILE_HAS_NO_EXPLICIT_IDENTITY', { profile, junctionId });
  }
  if (!routeContainsPoint(layout, junctionNetId, crossingPoint)
      || !routeContainsPoint(layout, crossingNetId, crossingPoint)) {
    return failure('JUNCTION_CROSSING_POINT_MISSING', { crossingPoint });
  }
  return {
    ok: true,
    requirementId: JUNCTION_POINT_REQUIREMENT_ID,
    representation: behavior.representation,
    junctionNetId,
    crossingNetId,
    endpointCount: junctionNet.endpoints.length,
    crossingElectricallyConnected: false,
  };
}
