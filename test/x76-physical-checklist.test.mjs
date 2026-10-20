// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CONTROLLER_CAPABILITIES } from '../src/controller-capabilities.mjs';
import {
  PHYSICAL_CHECKLIST_BASELINE_COMMIT,
  PHYSICAL_CHECKLIST_DEFINITIONS,
  PHYSICAL_CHECKLIST_DEFINITION_SHA256,
  PHYSICAL_CHECKLIST_LIMIT,
  canonicalPhysicalChecklistText,
  createPhysicalChecklist,
  parsePhysicalChecklistText,
} from '../src/physical-verification-checklist.mjs';

const clone = (value) => structuredClone(value);

test('X76 has exactly four owner-derived profiles and 23 finite canonical items', () => {
  assert.equal(PHYSICAL_CHECKLIST_BASELINE_COMMIT, '9baecd8f110dd1dc666e0a3525a83bc65e619071');
  assert.equal(PHYSICAL_CHECKLIST_DEFINITIONS.length, 4);
  assert.equal(PHYSICAL_CHECKLIST_DEFINITIONS.reduce((total, value) => total + value.items.length, 0), 23);
  assert.equal(createHash('sha256').update(JSON.stringify(PHYSICAL_CHECKLIST_DEFINITIONS)).digest('hex'),
    PHYSICAL_CHECKLIST_DEFINITION_SHA256);
  for (const definition of PHYSICAL_CHECKLIST_DEFINITIONS) {
    assert.equal(definition.label, CONTROLLER_CAPABILITIES.profiles[definition.profile].label);
    const checklist = createPhysicalChecklist(definition.profile);
    assert.equal(checklist.productRelease, '1.1.0-rc.87');
    assert.equal(checklist.profile, definition.profile);
    assert.equal(checklist.controllerModel, definition.profile);
    assert.equal(checklist.evidenceBoundary.physicalEvidencePresent, false);
    assert(checklist.items.every((item) => item.status === 'manual-not-measured'
      || item.status === 'profile-unavailable'));
    assert.deepEqual(checklist.authority, { apply: false, build: false, run: false, flash: false,
      deviceAccess: false, verdict: false, certification: false });
    const text = canonicalPhysicalChecklistText(checklist);
    assert.deepEqual(parsePhysicalChecklistText(text), checklist);
    assert.equal(canonicalPhysicalChecklistText(parsePhysicalChecklistText(text)), text);
  }
});

test('an rc83 checklist is rejected without silent migration', () => {
  const current = createPhysicalChecklist('board.atmega328p-16mhz-v1');
  const prior = clone(current);
  prior.productRelease = '1.1.0-rc.83';
  const priorText = JSON.stringify(prior);
  assert.throws(() => parsePhysicalChecklistText(priorText), /PHYSICAL_CHECKLIST_IDENTITY/u);
  assert.equal(JSON.stringify(prior), priorText);
  assert.equal(current.productRelease, '1.1.0-rc.87');
});

test('manual observation is bounded self-attested data and never grants verdict or certification', () => {
  const checklist = createPhysicalChecklist('board.atmega328p-16mhz-v1');
  checklist.items[0].status = 'manual-recorded';
  checklist.items[0].observation = {
    value: '4.98', unit: 'V', method: 'user-entered bench note', conditions: 'example load',
    reference: '', notes: '😀'.repeat(500),
  };
  checklist.evidenceBoundary.physicalEvidencePresent = true;
  const accepted = parsePhysicalChecklistText(canonicalPhysicalChecklistText(checklist));
  assert.equal(accepted.evidenceBoundary.physicalEvidencePresent, true);
  assert.equal(accepted.evidenceBoundary.independentlyVerified, false);
  assert.equal(accepted.evidenceBoundary.certification, false);
  assert(Object.values(accepted.authority).every((value) => value === false));
  const tooLong = clone(checklist);
  tooLong.items[0].observation.notes = '😀'.repeat(501);
  assert.throws(() => canonicalPhysicalChecklistText(tooLong), /PHYSICAL_CHECKLIST_STRING/u);
});

test('strict parser rejects unknown identity, shape, ordering, status, evidence and authority atomically', () => {
  const original = createPhysicalChecklist('board.esp32-c3-devmodule-v1');
  const originalText = canonicalPhysicalChecklistText(original);
  const cases = [
    ['extra', (value) => { value.extra = true; }, /PHYSICAL_CHECKLIST_IDENTITY/u],
    ['unknown profile', (value) => { value.profile = 'board.unknown-v1'; }, /PROFILE_UNKNOWN/u],
    ['model mismatch', (value) => { value.controllerModel = 'board.rp2040-pico-v1'; }, /PROFILE_UNKNOWN/u],
    ['release mismatch', (value) => { value.productRelease = '1.1.0-rc.80'; }, /IDENTITY/u],
    ['baseline mismatch', (value) => { value.sourceCommit = '0'.repeat(40); }, /IDENTITY/u],
    ['definition mismatch', (value) => { value.definitionSha256 = '0'.repeat(64); }, /IDENTITY/u],
    ['unknown item', (value) => { value.items[0].id = 'c3-fictional'; }, /ITEM_IDENTITY/u],
    ['reordered item', (value) => { [value.items[0], value.items[1]] = [value.items[1], value.items[0]]; }, /ITEM_IDENTITY/u],
    ['unknown basis', (value) => { value.items[0].simulatorBasis = 'certified'; }, /ITEM_IDENTITY/u],
    ['locked changed', (value) => { value.items.at(-1).status = 'not-applicable'; }, /UNAVAILABLE_STATUS/u],
    ['false evidence flag', (value) => { value.evidenceBoundary.physicalEvidencePresent = true; }, /EVIDENCE_FLAG/u],
    ['independent claim', (value) => { value.evidenceBoundary.independentlyVerified = true; }, /BOUNDARY/u],
    ['authority', (value) => { value.authority.deviceAccess = true; }, /AUTHORITY/u],
  ];
  for (const [name, mutate, expected] of cases) {
    const value = clone(original); mutate(value);
    assert.throws(() => parsePhysicalChecklistText(JSON.stringify(value)), expected, name);
    assert.equal(canonicalPhysicalChecklistText(original), originalText, `${name} changed original`);
  }
  assert.throws(() => parsePhysicalChecklistText(originalText.replace('"schema":', '"schema":"duplicate","schema":')),
    /DUPLICATE_KEY/u);
  assert.throws(() => parsePhysicalChecklistText(' '.repeat(PHYSICAL_CHECKLIST_LIMIT + 1)), /INPUT_LIMIT/u);
});

test('discovery and page copy preserve absent/manual/non-certification boundaries', async () => {
  const [page, controllers, support, llms, sitemap, build] = await Promise.all([
    readFile(new URL('../staging/physical-checklist.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/controllers.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/support.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/llms.txt', import.meta.url), 'utf8'),
    readFile(new URL('../staging/sitemap.xml', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/build-staging.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /Physical evidence absent/u);
  assert.match(page, /not independently verified/u);
  assert.match(page, /does not access USB, Serial, WebUSB, WebSerial, HID, Bluetooth/u);
  for (const text of [controllers, support, llms, sitemap, build]) assert.match(text, /physical-checklist/u);
});
