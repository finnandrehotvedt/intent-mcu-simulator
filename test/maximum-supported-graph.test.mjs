// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { CIRCUIT_LIMITS, COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { PROJECT_EXPORT_LIMIT } from '../src/project-v2.mjs';
import { PROJECT_HISTORY_LIMIT } from '../src/project-editor.mjs';
import { ROUTE_POINT_LIMIT } from '../src/route-model.mjs';
import { createContactPersistenceDraft } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { PROJECT_PERFORMANCE_BUDGET as contract } from './project-performance-budget-contract.mjs';
import { createMaximumSupportedGraphFixture } from './maximum-supported-graph-fixture.mjs';

test('performance contract derives exact current project and route limits', () => {
  assert.deepEqual(CIRCUIT_LIMITS, { components: 64, nets: 128, endpoints: 256 });
  assert.equal(PROJECT_EXPORT_LIMIT, contract.hardLimits.projectExportBytes);
  assert.equal(PROJECT_HISTORY_LIMIT, contract.hardLimits.editorHistoryEntries);
  assert.equal(ROUTE_POINT_LIMIT, contract.hardLimits.routePointsPerBranch);
  const boardPins = COMPONENT_CATALOG['board.atmega328p-16mhz-v1'].pins.length;
  const maxOrdinaryPartPins = Math.max(...Object.values(COMPONENT_CATALOG)
    .filter((item) => item.selectable && item.type !== 'board.atmega328p-16mhz-v1')
    .map((item) => item.pins.length));
  assert.equal(boardPins + 63 * maxOrdinaryPartPins, contract.practicalV2Maximum.availablePins);
  assert.equal(Math.floor(contract.practicalV2Maximum.availablePins / 2), contract.practicalV2Maximum.twoEndpointNets);
});

test('maximum candidate fixture reaches every hard graph limit and remains accepted as a safe draft', () => {
  const fixture = createMaximumSupportedGraphFixture();
  assert.deepEqual(fixture.counts, {
    components: contract.maximumCandidateFixture.components,
    nets: contract.maximumCandidateFixture.nets,
    endpoints: contract.maximumCandidateFixture.endpoints,
  });
  assert.equal(fixture.validationCode, 'PROJECT_CONTACT_DRAFT');
  assert.equal(fixture.runnable.ok, false);
  assert.match(fixture.runnable.code, /CHARACTER_LCD_VCC_DISCONNECTED/u);
  assert(Buffer.byteLength(fixture.text) < contract.hardLimits.projectExportBytes);
});

test('one record beyond each hard graph limit rejects before rendering', () => {
  const { project } = createMaximumSupportedGraphFixture();
  const componentOverflow = structuredClone(project);
  componentOverflow.candidateCircuit.components.push({
    ...structuredClone(componentOverflow.candidateCircuit.components[1]), id: 'lcd-64', label: 'LCD 64',
  });
  componentOverflow.candidateLayout.positions['lcd-64'] = { x: 0.5, y: 0.5, rotation: 0 };
  assert.equal(createContactPersistenceDraft(
    componentOverflow.project, componentOverflow.candidateCircuit,
    componentOverflow.candidateLayout, componentOverflow.compiledFixture,
  ).code, 'PROJECT_CONTACT_COMPONENT_LIMIT');

  const netOverflow = structuredClone(project);
  netOverflow.candidateCircuit.nets.push({
    id: 'net-128', endpoints: [{ component: 'lcd-50', pin: 'RS' }, { component: 'lcd-50', pin: 'RW' }],
  });
  assert.equal(createContactPersistenceDraft(
    netOverflow.project, netOverflow.candidateCircuit,
    netOverflow.candidateLayout, netOverflow.compiledFixture,
  ).code, 'PROJECT_CONTACT_NET_LIMIT');

  const endpointOverflow = structuredClone(project);
  endpointOverflow.candidateCircuit.nets[0].endpoints.push({ component: 'lcd-50', pin: 'E' });
  assert.equal(createContactPersistenceDraft(
    endpointOverflow.project, endpointOverflow.candidateCircuit,
    endpointOverflow.candidateLayout, endpointOverflow.compiledFixture,
  ).code, 'PROJECT_CONTACT_ENDPOINT_LIMIT');
});
