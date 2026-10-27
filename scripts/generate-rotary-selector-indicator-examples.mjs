#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { LED_BAR_GRAPH_TYPE, RGB_COMMON_ANODE_TYPE, ROTARY_SELECTOR_TYPE,
  createRotarySelectorIndicator } from '../expansion-drafts/rotary-selector-indicators-v1.mjs';
import { createCandidateUiComponent, openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { createComponent } from '../src/circuit-engine.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/rotary-selector-indicators/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const adapter = Object.freeze({ schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']), prepare(value) {
  const opened = openCandidateUiSession(JSON.stringify(value)); if (!opened.ok) throw new Error(opened.code);
  return { project: JSON.parse(opened.session.saveText()) };
} });
const adapters = Object.freeze({ [AVR]: adapter });
const envelope = (project) => canonicalProjectEnvelope(AVR, project, adapters, emptyProjectBrief(), null, CURRENT_MODEL_LIBRARY_LOCK);
const sourceFor = (body) => `void setup() { ${body.setup} Serial.begin(115200); }\nvoid loop() { ${body.loop} delay(120); }\n`;

function cleanSession(source, name) {
  const draft = createEditableContactDraft(source); if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = name;
  const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project));
  if (!opened.ok) throw new Error(opened.code);
  const session = opened.session;
  const apply = (command) => { const result = session.apply({ ...command, revision: session.revision });
    if (!result.ok) throw new Error(`${name}:${command.type}:${result.code}:${JSON.stringify(result.details)}`); };
  for (const component of session.visualProject.circuit.components) {
    if (component.id !== 'board-1') apply({ type: 'component.remove', componentId: component.id });
  }
  return { session, apply };
}
const add = (apply, component, x, y) => apply({ type: 'component.add', component, position: { x, y, rotation: 0 } });
const wire = (apply, id, left, right) => apply({ type: 'wire.create', net: { id, endpoints: [left, right] } });

function selectorProject() {
  const { session, apply } = cleanSession(sourceFor({ setup: 'pinMode(7, INPUT_PULLUP);',
    loop: 'Serial.println(digitalRead(7));' }), 'Four-position rotary selector');
  add(apply, createRotarySelectorIndicator(ROTARY_SELECTOR_TYPE, 'rotary-selector-1'), 0.7, 0.5);
  wire(apply, 'net-selector-com-d7', { component: 'rotary-selector-1', pin: 'COM' }, { component: 'board-1', pin: 'D7' });
  for (const [position, pin] of [['P1', 'GND1'], ['P2', '5V'], ['P3', 'GND2']]) {
    wire(apply, `net-selector-${position.toLowerCase()}`, { component: 'rotary-selector-1', pin: position }, { component: 'board-1', pin });
  }
  apply({ type: 'wire.branch', netId: 'net-selector-p2', endpoint: { component: 'rotary-selector-1', pin: 'P4' },
    junctionId: 'junction-selector-power-p4' });
  return JSON.parse(session.saveText());
}

function commonAnodeProject() {
  const { session, apply } = cleanSession(sourceFor({ setup: 'pinMode(3, OUTPUT); pinMode(5, OUTPUT); pinMode(6, OUTPUT);',
    loop: 'analogWrite(3, 0); analogWrite(5, 128); analogWrite(6, 255);' }), 'Active-low common-anode RGB LED');
  add(apply, createRotarySelectorIndicator(RGB_COMMON_ANODE_TYPE, 'rgb-common-anode-1'), 0.76, 0.48);
  wire(apply, 'net-rgb-ca-common', { component: 'rgb-common-anode-1', pin: 'COM' }, { component: 'board-1', pin: '5V' });
  for (const [index, channel] of ['R', 'G', 'B'].entries()) {
    const resistorId = `rgb-ca-resistor-${index + 1}`;
    add(apply, createComponent(resistorId, 'resistor.fixed-v1', { properties: { ohms: 330 } }), 0.55, 0.35 + index * 0.13);
    wire(apply, `net-rgb-ca-${channel.toLowerCase()}-led`, { component: 'rgb-common-anode-1', pin: channel }, { component: resistorId, pin: 'A' });
    wire(apply, `net-rgb-ca-${channel.toLowerCase()}-gpio`, { component: resistorId, pin: 'B' }, { component: 'board-1', pin: ['D3', 'D5', 'D6'][index] });
  }
  return JSON.parse(session.saveText());
}

function barGraphProject() {
  const pins = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11'];
  const { session, apply } = cleanSession(sourceFor({ setup: 'for (byte p=2;p<=11;p++) pinMode(p, OUTPUT);',
    loop: 'for (byte p=2;p<=11;p++) digitalWrite(p, p<=6 ? HIGH : LOW);' }), 'Ten-segment LED bar graph');
  add(apply, createRotarySelectorIndicator(LED_BAR_GRAPH_TYPE, 'led-bar-1'), 0.74, 0.5);
  add(apply, createCandidateUiComponent('reference.ground-v1', 'bar-ground-1'), 0.74, 0.82);
  for (let segment = 1; segment <= 10; segment += 1) {
    const resistorId = `bar-resistor-${segment}`;
    add(apply, createComponent(resistorId, 'resistor.fixed-v1', { properties: { ohms: 330 } }), 0.45, 0.12 + segment * 0.065);
    wire(apply, `net-bar-${segment}-drive`, { component: 'board-1', pin: pins[segment - 1] }, { component: resistorId, pin: 'A' });
    wire(apply, `net-bar-${segment}-anode`, { component: resistorId, pin: 'B' }, { component: 'led-bar-1', pin: `A${segment}` });
    if (segment === 1) wire(apply, 'net-bar-ground', { component: 'led-bar-1', pin: 'K1' }, { component: 'bar-ground-1', pin: 'REF' });
    else apply({ type: 'wire.branch', netId: 'net-bar-ground', endpoint: { component: 'led-bar-1', pin: `K${segment}` },
      junctionId: `junction-bar-ground-${segment}` });
  }
  return JSON.parse(session.saveText());
}

const definitions = [
  { id: 'avr-rotary-selector-4', requirementIds: ['CMP-036'], file: 'avr-rotary-selector-4.intent-mcu.json', project: selectorProject(),
    expectedBehavior: 'Positions 1–4 connect COM to exactly P1–P4; D7 reads the selected explicit GND or 5 V reference.',
    namedPins: { COM: 'D7', P1: 'GND1', P2: '5V', P3: 'GND2', P4: '5V' } },
  { id: 'avr-rgb-common-anode', requirementIds: ['CMP-039'], file: 'avr-rgb-common-anode.intent-mcu.json', project: commonAnodeProject(),
    expectedBehavior: 'D3/D5/D6 sink three independently resisted channels; LOW is bright and HIGH is dark.',
    namedPins: { R: 'D3 through 330 Ω', G: 'D5 through 330 Ω', B: 'D6 through 330 Ω', COM: '5V' } },
  { id: 'avr-led-bar-graph', requirementIds: ['CMP-040'], file: 'avr-led-bar-graph.intent-mcu.json', project: barGraphProject(),
    expectedBehavior: 'D2–D11 independently illuminate ten separately resisted segments with ten explicit ground returns.',
    namedPins: { anodes: 'A1–A10 through 330 Ω to D2–D11', cathodes: 'K1–K10 to explicit 0 V reference' } },
];
const outputs = definitions.map((entry) => { const bytes = envelope(entry.project);
  return { ...entry, bytes, projectSha256: sha256(bytes), sourceSha256: sha256(entry.project.project.source.files[0].content) }; });
const manifest = { schema: 'intent-mcu-rotary-selector-indicator-example-manifest@1', profile: AVR,
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, entries: outputs.map(({ project, bytes, ...entry }) => ({ ...entry,
    profileBehavior: { [AVR]: 'authoring and executable adapter available after a fresh isolated Build',
      'board.rp2040-pico-v1': 'this exact 5 V model is unavailable', 'board.esp32-c3-devmodule-v1': 'this exact 5 V model is unavailable',
      'board.stm32f429zi-nucleo144-v1': 'this exact 5 V model is unavailable' },
    provenance: 'Original project-owned model, SVG artwork, deterministic projection, firmware source and canonical project envelope.' })) };
const files = new Map(outputs.map(({ file, bytes }) => [file, bytes]));
files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) { await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else for (const [file, bytes] of files) if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) throw new Error(`ROTARY_SELECTOR_INDICATOR_ARTIFACT_STALE:${file}`);
