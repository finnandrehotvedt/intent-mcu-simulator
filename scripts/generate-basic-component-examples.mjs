#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createExampleProject } from '../src/example-projects.mjs';
import { canonicalProjectJson, parseProjectV2 } from '../src/project-v2.mjs';
import { POTENTIOMETER_3V3_TYPE, validateBounded3v3AuthoringGraph } from '../src/bounded-3v3-authoring-contracts.mjs';
import { Rp2040PicoCircuitEditor, RP2040_PICO_BOARD_DEFINITION } from '../src/rp2040-pico-circuit.mjs';
import { Esp32C3CircuitEditor, ESP32C3_BOARD_DEFINITION } from '../src/esp32c3-public-circuit.mjs';
import { Stm32CircuitEditor, STM32_BOARD_DEFINITION } from '../src/stm32-public-circuit.mjs';
import { RP2040_PUBLIC_PROJECT_SCHEMA, RP2040_PUBLIC_SOURCE, normalizeRp2040PublicProject } from '../src/rp2040-public-workbench.mjs';
import { C3_PUBLIC_PROJECT_SCHEMA, C3_PUBLIC_SOURCE, normalizeEsp32C3PublicProject } from '../src/esp32c3-public-workbench.mjs';
import { STM32_EDITABLE_PROJECT_SCHEMA, STM32_PUBLIC_SOURCE, normalizeStm32PublicProject } from '../src/stm32-public-workbench.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const ROOT = new URL('../examples/basic-components/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const profiles = Object.freeze({
  'board.atmega328p-16mhz-v1': 'authoring and executable adapter available after a fresh isolated Build',
  'board.rp2040-pico-v1': 'bounded LED execution plus 3.3 V potentiometer authoring; ADC firmware unavailable',
  'board.esp32-c3-devmodule-v1': 'bounded LED model output plus 3.3 V potentiometer authoring; ADC firmware unavailable',
  'board.stm32f429zi-nucleo144-v1': 'bounded LED execution plus 3.3 V potentiometer authoring; ADC firmware unavailable',
});
const trimmerProfiles = Object.freeze({
  'board.atmega328p-16mhz-v1': 'authoring and executable adapter available after a fresh isolated Build',
  'board.rp2040-pico-v1': 'exact top-adjust trimmer model unavailable; no cross-profile authoring or ADC firmware claim',
  'board.esp32-c3-devmodule-v1': 'exact top-adjust trimmer model unavailable; no cross-profile authoring or ADC firmware claim',
  'board.stm32f429zi-nucleo144-v1': 'exact top-adjust trimmer model unavailable; no cross-profile authoring or ADC firmware claim',
});
const projects = Object.freeze({
  blink: createExampleProject('blink'), adc: createExampleProject('adc'), trimmer: createExampleProject('trimmer'),
});
const files = new Map(Object.entries(projects).map(([id, value]) => [`avr-${id}.intent-mcu.json`, canonicalProjectJson(value.project)]));
const authoringProfiles = [
  { id: 'pico', profile: 'board.rp2040-pico-v1', schema: RP2040_PUBLIC_PROJECT_SCHEMA, source: RP2040_PUBLIC_SOURCE,
    Editor: Rp2040PicoCircuitEditor, normalize: normalizeRp2040PublicProject, board: RP2040_PICO_BOARD_DEFINITION,
    boardId: 'pico-1', pin: 'GP26', highPin: 'GP1', lowPin: 'GND8' },
  { id: 'esp32-c3', profile: 'board.esp32-c3-devmodule-v1', schema: C3_PUBLIC_PROJECT_SCHEMA, source: C3_PUBLIC_SOURCE,
    Editor: Esp32C3CircuitEditor, normalize: normalizeEsp32C3PublicProject, board: ESP32C3_BOARD_DEFINITION,
    boardId: 'c3-1', pin: 'GPIO0', highPin: 'GPIO3', lowPin: 'GND8' },
  { id: 'stm32', profile: 'board.stm32f429zi-nucleo144-v1', schema: STM32_EDITABLE_PROJECT_SCHEMA, source: STM32_PUBLIC_SOURCE,
    Editor: Stm32CircuitEditor, normalize: normalizeStm32PublicProject, board: STM32_BOARD_DEFINITION,
    boardId: 'stm32-1', pin: 'PB0', highPin: 'PB1', lowPin: 'GND20', occupiedNet: 'net-pb0' },
];
const envelopeAdapters = Object.fromEntries(authoringProfiles.map((definition) => [definition.profile, {
  schemas: [definition.schema], prepare: (value) => ({ project: definition.normalize(value), preserved: ['circuit'] }),
  authoringAdmission: ({ project }) => validateBounded3v3AuthoringGraph({ board: definition.board,
    components: project.circuit.components, nets: project.circuit.nets }),
}]));
const crossProfileSeries = authoringProfiles.map((definition) => {
  const circuit = new definition.Editor().snapshot().draft;
  const file = `${definition.id}-series-led.intent-mcu.json`;
  const project = { schema: definition.schema, name: `${definition.id} series resistor and LED`,
    profile: definition.profile, source: definition.source, circuit };
  const bytes = canonicalProjectEnvelope(definition.profile, project, envelopeAdapters, emptyProjectBrief());
  files.set(file, bytes);
  return { id: `${definition.id}-series-led`, profile: definition.profile, file,
    componentIds: circuit.components.map(({ id }) => id),
    exactNets: circuit.nets.map(({ id, endpoints }) => ({ id,
      endpoints: endpoints.map(({ component, pin }) => `${component}.${pin}`) })),
    projectSha256: sha256(bytes), sourceSha256: sha256(definition.source),
    expectedVisibleBehavior: 'Opening restores the board, resistor and LED with the validated named series wiring.',
    firmware: 'the bounded profile supports only its documented output subset; this file makes no broader peripheral claim' };
});
const crossProfileAuthoring = authoringProfiles.map((definition) => {
  const editor = new definition.Editor();
  if (!editor.addMissingComponent(POTENTIOMETER_3V3_TYPE, { x: 0.44, y: 0.72 }).ok) throw new Error('POT_EXAMPLE_ADD_FAILED');
  if (definition.occupiedNet) {
    editor.select({ kind: 'net', id: definition.occupiedNet });
    if (!editor.deleteSelected().ok) throw new Error('POT_EXAMPLE_DISCONNECT_FAILED');
  }
  if (!editor.connectEndpoints({ component: definition.boardId, pin: definition.pin },
    { component: 'potentiometer-1', pin: 'WIPER' }).ok) throw new Error('POT_EXAMPLE_CONNECT_FAILED');
  if (!editor.connectEndpoints({ component: definition.boardId, pin: definition.highPin },
    { component: 'potentiometer-1', pin: 'HIGH' }).ok) throw new Error('POT_EXAMPLE_HIGH_CONNECT_FAILED');
  if (!editor.connectEndpoints({ component: definition.boardId, pin: definition.lowPin },
    { component: 'potentiometer-1', pin: 'LOW' }).ok) throw new Error('POT_EXAMPLE_LOW_CONNECT_FAILED');
  const file = `${definition.id}-potentiometer-combined.intent-mcu.json`;
  const project = { schema: definition.schema, name: `${definition.id} combined potentiometer authoring`,
    profile: definition.profile, source: definition.source, circuit: editor.snapshot().draft };
  const bytes = `${JSON.stringify(project, null, 2)}\n`;
  files.set(file, bytes);
  return { id: `${definition.id}-potentiometer-combined`, profile: definition.profile, file,
    componentIds: project.circuit.components.map(({ id }) => id),
    namedPins: { HIGH: `${definition.boardId}.${definition.highPin}`,
      WIPER: `${definition.boardId}.${definition.pin}`, LOW: `${definition.boardId}.${definition.lowPin}` },
    projectSha256: sha256(bytes), sourceSha256: null,
    expectedVisibleBehavior: 'Opening restores the board, resistor, LED and 10 kΩ potentiometer with all three named wires attached.',
    model: 'validated passive data-only 0–3.3 V authoring graph; HIGH is attached to an authoring-only GPIO, not a proven supply',
    firmware: 'unavailable for potentiometer ADC and no powered-divider behavior is claimed on this bounded profile' };
});
const definitions = [
  { id: 'avr-series-resistor', requirementIds: ['CMP-001'], file: 'avr-blink.intent-mcu.json',
    componentType: 'resistor.fixed-v1', namedPins: { A: 'D13', B: 'LED.ANODE' }, value: '220 Ω',
    expectedBehavior: 'The validated 220 Ω series path limits the ideal D13 LED model.',
    limits: 'Ideal resistance in supported low-voltage teaching topologies; no tolerance, power or thermal model.',
    crossProfileAuthoring: crossProfileSeries },
  { id: 'avr-analogue-potentiometer', requirementIds: ['CMP-002'], file: 'avr-adc.intent-mcu.json',
    componentType: 'potentiometer.linear-v1', namedPins: { HIGH: '5V', WIPER: 'A0', LOW: 'GND1' }, value: '10 kΩ linear',
    expectedBehavior: 'Turning the control maps linearly from 0–5 V to AVR ADC counts 0–1023.',
    limits: 'Ideal unloaded linear divider; no tolerance, contact noise, loading or logarithmic taper.',
    crossProfileAuthoring },
  { id: 'avr-trimmer-calibration', requirementIds: ['CMP-003'], file: 'avr-trimmer.intent-mcu.json',
    componentType: 'potentiometer.trimmer-v1', namedPins: { HIGH: '5V', WIPER: 'A1', LOW: 'GND1' }, value: '10 kΩ linear top-adjust',
    expectedBehavior: 'Moving the retained position control maps linearly from 0–5 V to AVR A1 ADC counts 0–1023.',
    limits: 'Ideal unloaded divider; no tolerance, loading, contact noise, end-stop, screw mechanics, turn count, power or thermal model.',
    crossProfileAuthoring: [], profileBehavior: trimmerProfiles },
  { id: 'avr-series-led', requirementIds: ['CMP-037'], file: 'avr-blink.intent-mcu.json',
    componentType: 'led.basic-v1', namedPins: { ANODE: '220Ω.B', CATHODE: 'GND1' }, value: 'red 5 mm',
    expectedBehavior: 'Compiled D13 HIGH/LOW changes the visible LED and logic trace together.',
    limits: 'Bounded polarity, series-current and relative-brightness model; no physical optical or thermal accuracy.',
    crossProfileAuthoring: crossProfileSeries },
];
for (const [file, bytes] of files) {
  if (file.startsWith('avr-') && !parseProjectV2(bytes).ok) throw new Error('BASIC_COMPONENT_PROJECT_INVALID');
}
const manifest = { schema: 'intent-mcu-basic-component-example-manifest@1',
  entries: definitions.map((entry) => {
    const bytes = files.get(entry.file); const parsed = JSON.parse(bytes);
    return { ...entry, sourceSha256: sha256(parsed.source.files[0].content), projectSha256: sha256(bytes),
      profileBehavior: entry.profileBehavior ?? profiles,
      provenance: 'Original project-owned component artwork, circuit factory, firmware example and canonical project format.' };
  }) };
files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of files) if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) throw new Error(`BASIC_COMPONENT_ARTIFACT_STALE:${file}`);
}
