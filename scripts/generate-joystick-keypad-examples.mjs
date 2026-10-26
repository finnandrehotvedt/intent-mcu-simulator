#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { ANALOG_JOYSTICK_TYPE, KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE,
  createJoystickKeypad } from '../expansion-drafts/joystick-keypads-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/joystick-keypads/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const adapter = Object.freeze({ schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']), prepare(value) {
  const opened = openCandidateUiSession(JSON.stringify(value)); if (!opened.ok) throw new Error(opened.code);
  return { project: JSON.parse(opened.session.saveText()) };
} });
const envelope = (project) => canonicalProjectEnvelope(AVR, project, { [AVR]: adapter }, emptyProjectBrief(), null, CURRENT_MODEL_LIBRARY_LOCK);
const endpoint = (component, pin) => ({ component, pin });
function sessionFor(source, name) {
  const draft = createEditableContactDraft(source); if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = name;
  const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)); if (!opened.ok) throw new Error(opened.code);
  const session = opened.session; const apply = (command) => { const result = session.apply({ ...command, revision: session.revision });
    if (!result.ok) throw new Error(`${name}:${command.type}:${result.code}:${JSON.stringify(result.details)}`); };
  for (const component of session.visualProject.circuit.components) if (component.id !== 'board-1') apply({ type: 'component.remove', componentId: component.id });
  return { session, apply };
}
const add = (apply, component) => apply({ type: 'component.add', component, position: { x: 0.7, y: 0.52, rotation: 0 } });
const wire = (apply, id, left, right) => apply({ type: 'wire.create', net: { id, endpoints: [left, right] } });
const branch = (apply, netId, component, pin, suffix) => apply({ type: 'wire.branch', netId,
  endpoint: endpoint(component, pin), junctionId: `junction-${suffix}` });

function joystickProject() {
  const source = 'void setup(){pinMode(2,INPUT_PULLUP);Serial.begin(115200);}\nvoid loop(){Serial.print(analogRead(A0));Serial.print(",");Serial.print(analogRead(A1));Serial.print(",");Serial.println(digitalRead(2));delay(120);}\n';
  const { session, apply } = sessionFor(source, 'Two-axis analogue joystick');
  const component = createJoystickKeypad(ANALOG_JOYSTICK_TYPE, 'joystick-1'); component.controls = { x: 0.25, y: 0.75, pressed: false }; add(apply, component);
  wire(apply, 'net-joystick-vcc', endpoint('board-1', '5V'), endpoint(component.id, 'VCC'));
  wire(apply, 'net-joystick-gnd', endpoint('board-1', 'GND1'), endpoint(component.id, 'GND'));
  wire(apply, 'net-joystick-x', endpoint('board-1', 'A0'), endpoint(component.id, 'VRX'));
  wire(apply, 'net-joystick-y', endpoint('board-1', 'A1'), endpoint(component.id, 'VRY'));
  wire(apply, 'net-joystick-switch', endpoint('board-1', 'D2'), endpoint(component.id, 'SW'));
  return JSON.parse(session.saveText());
}
function keypadProject(type, id, name, columns) {
  const source = `const byte rows[4]={2,3,4,5}; const byte cols[${columns}]={${columns === 3 ? '6,7,8' : '6,7,8,9'}};\nvoid setup(){Serial.begin(115200);for(byte r:rows){pinMode(r,OUTPUT);digitalWrite(r,HIGH);}for(byte c:cols)pinMode(c,INPUT_PULLUP);}\nvoid loop(){for(byte r=0;r<4;r++){digitalWrite(rows[r],LOW);for(byte c=0;c<${columns};c++)if(!digitalRead(cols[c])){Serial.print(r+1);Serial.println(c+1);}digitalWrite(rows[r],HIGH);}delay(20);}\n`;
  const { session, apply } = sessionFor(source, name); const component = createJoystickKeypad(type, id); component.controls.pressedKey = 'R2C2'; add(apply, component);
  ['R1','R2','R3','R4'].forEach((pin, index) => wire(apply, `net-${id}-${pin.toLowerCase()}`, endpoint('board-1', `D${index + 2}`), endpoint(id, pin)));
  for (let index = 1; index <= columns; index += 1) wire(apply, `net-${id}-c${index}`, endpoint('board-1', `D${index + 5}`), endpoint(id, `C${index}`));
  return JSON.parse(session.saveText());
}
const definitions = [
  { id: 'avr-analog-joystick', requirementIds: ['CMP-028'], file: 'avr-analog-joystick.intent-mcu.json', project: joystickProject(), expectedBehavior: 'A0 and A1 report the selected X/Y positions while D2 is an independent active-low push input.', namedPins: { VCC: '5V', GND: 'GND', VRX: 'A0', VRY: 'A1', SW: 'D2' } },
  { id: 'avr-matrix-keypad-3x4', requirementIds: ['CMP-029'], file: 'avr-matrix-keypad-3x4.intent-mcu.json', project: keypadProject(KEYPAD_3X4_TYPE, 'keypad-3x4-1', '3×4 matrix keypad', 3), expectedBehavior: 'Firmware scans D2–D5 rows and reads D6–D8 columns; one selected key closes only its named row-column contact.', namedPins: { rows: 'R1–R4 → D2–D5', columns: 'C1–C3 → D6–D8' } },
  { id: 'avr-matrix-keypad-4x4', requirementIds: ['CMP-030'], file: 'avr-matrix-keypad-4x4.intent-mcu.json', project: keypadProject(KEYPAD_4X4_TYPE, 'keypad-4x4-1', '4×4 matrix keypad', 4), expectedBehavior: 'Firmware scans D2–D5 rows and reads D6–D9 columns; one selected key closes only its named row-column contact.', namedPins: { rows: 'R1–R4 → D2–D5', columns: 'C1–C4 → D6–D9' } },
];
const outputs = definitions.map((entry) => { const bytes = envelope(entry.project); return { ...entry, bytes,
  projectSha256: sha256(bytes), sourceSha256: sha256(entry.project.project.source.files[0].content) }; });
const manifest = { schema: 'intent-mcu-joystick-keypad-example-manifest@1', profile: AVR, modelLibrary: CURRENT_MODEL_LIBRARY_LOCK,
  entries: outputs.map(({ project, bytes, ...entry }) => ({ ...entry, profileBehavior: { [AVR]: 'authoring and executable adapter available after a fresh isolated Build', 'board.rp2040-pico-v1': 'unavailable', 'board.esp32-c3-devmodule-v1': 'unavailable', 'board.stm32f429zi-nucleo144-v1': 'unavailable' }, provenance: 'Original project-owned model, SVG artwork, deterministic projection, firmware source and canonical project envelope.' })) };
const files = new Map(outputs.map(({ file, bytes }) => [file, bytes])); files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) { await mkdir(ROOT, { recursive: true }); for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes); }
else for (const [file, bytes] of files) if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) throw new Error(`JOYSTICK_KEYPAD_ARTIFACT_STALE:${file}`);
