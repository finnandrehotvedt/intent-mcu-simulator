// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createCharacterLcdComponent } from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import { BUTTON_PULLUP_FIXTURE_REFERENCE } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  CANDIDATE_LAYOUT_SCHEMA,
  canonicalContactPersistenceDraftJson,
  createContactPersistenceDraft,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createTemperatureLcdThresholdExample } from '../expansion-drafts/temperature-lcd-threshold-example-v1.mjs';

const SIGNAL_PINS = Object.freeze(['RS', 'RW', 'E', 'D4', 'D5', 'D6', 'D7']);

function position(index) {
  return {
    x: 0.04 + (index % 8) * 0.13,
    y: 0.05 + Math.floor(index / 8) * 0.13,
    rotation: 0,
  };
}

export function createMaximumSupportedGraphFixture() {
  const base = createTemperatureLcdThresholdExample().project.project;
  const board = structuredClone(base.circuit.components.find((item) => item.id === 'board-1'));
  const components = [
    board,
    ...Array.from({ length: 63 }, (_, index) => createCharacterLcdComponent(`lcd-${index + 1}`)),
  ];
  const available = components.slice(1).flatMap((component) => SIGNAL_PINS.map((pin) => ({
    component: component.id, pin,
  })));
  const nets = Array.from({ length: 128 }, (_, index) => ({
    id: `net-${index}`,
    endpoints: [available[index * 2], available[index * 2 + 1]],
  }));
  const candidateCircuit = {
    schema: 'teach-lab-circuit@2', components, nets, junctions: [],
  };
  const candidateLayout = {
    schema: CANDIDATE_LAYOUT_SCHEMA,
    positions: Object.fromEntries(components.map((component, index) => [component.id, position(index)])),
    wireRoutes: {},
    viewport: { zoom: 0.5, panX: 0, panY: 0 },
  };
  const draft = createContactPersistenceDraft(
    base, candidateCircuit, candidateLayout, BUTTON_PULLUP_FIXTURE_REFERENCE,
  );
  if (!draft.ok) throw new Error(draft.code);
  return {
    project: draft.project,
    text: canonicalContactPersistenceDraftJson(draft.project),
    validationCode: draft.code,
    runnable: draft.reconstruction.runnable,
    counts: {
      components: candidateCircuit.components.length,
      nets: candidateCircuit.nets.length,
      endpoints: candidateCircuit.nets.reduce((sum, net) => sum + net.endpoints.length, 0),
    },
  };
}
