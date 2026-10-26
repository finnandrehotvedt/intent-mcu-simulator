// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const output = process.argv[2];
if (!output) throw new Error('FIXTURE_OUTPUT_REQUIRED');

const source = `// Original acceptance firmware: bounded write-only 16x2 LCD over six GPIO pins.
const byte lcdRs = 3;
const byte lcdEnable = 4;
const byte lcdData[4] = {5, 6, 7, 8};

void lcdNibble(byte value) {
  for (byte bit = 0; bit < 4; bit++) digitalWrite(lcdData[bit], (value >> bit) & 1);
  digitalWrite(lcdEnable, HIGH);
  delayMicroseconds(1);
  digitalWrite(lcdEnable, LOW);
  delayMicroseconds(50);
}

void lcdByte(byte value, bool data) {
  digitalWrite(lcdRs, data ? HIGH : LOW);
  lcdNibble(value >> 4);
  lcdNibble(value & 0x0f);
}

void lcdCommand(byte value) {
  lcdByte(value, false);
  if (value == 0x01 || value == 0x02) delay(2);
}

void lcdText(const char *value) { while (*value) lcdByte(*value++, true); }

void showHello() {
  lcdCommand(0x80); lcdText("Hello, Company! ");
  lcdCommand(0xc0); lcdText("GPIO 4-bit ready");
  Serial.println("LCD=HELLO");
}

void showUpdated() {
  lcdCommand(0x80); lcdText("Updated by AVR  ");
  lcdCommand(0xc0); lcdText("Count: 42       ");
  Serial.println("LCD=UPDATED");
}

void setup() {
  pinMode(lcdRs, OUTPUT); pinMode(lcdEnable, OUTPUT);
  for (byte bit = 0; bit < 4; bit++) pinMode(lcdData[bit], OUTPUT);
  digitalWrite(lcdRs, LOW); digitalWrite(lcdEnable, LOW); delay(20);
  lcdNibble(0x3); delay(5); lcdNibble(0x3); delayMicroseconds(150);
  lcdNibble(0x3); delayMicroseconds(150); lcdNibble(0x2); delayMicroseconds(150);
  lcdCommand(0x28); lcdCommand(0x0c); lcdCommand(0x06); lcdCommand(0x01);
  Serial.begin(9600); showHello();
}

void loop() {
  if (!Serial.available()) return;
  const char command = Serial.read();
  if (command == 'u') showUpdated();
  if (command == 'c') { lcdCommand(0x0f); lcdCommand(0x01); lcdCommand(0x8f); lcdText("XY"); Serial.println("LCD=WRAP12"); }
  if (command == 'r') { lcdCommand(0x01); lcdCommand(0xcf); lcdText("QR"); Serial.println("LCD=WRAP21"); }
  if (command == 'o') { lcdCommand(0x08); Serial.println("LCD=OFF"); }
  if (command == 'n') { lcdCommand(0x0f); Serial.println("LCD=ON"); }
}
`;

const draft = createEditableContactDraft(source);
if (!draft.ok) throw new Error(draft.code);
draft.project.project.metadata.name = 'Write-only 16x2 GPIO character display proof';
draft.project.project.instruments.selectedPin = 'D4';
draft.project.project.instruments.logicChannels = ['D3', 'D4', 'D5', 'D6', 'D7', 'D8'];
await mkdir(output, { recursive: true });
const adapter = Object.freeze({
  schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
  prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()) };
  },
});
const project = JSON.parse(canonicalContactPersistenceDraftJson(draft.project));
const envelope = canonicalProjectEnvelope(
  'board.atmega328p-16mhz-v1', project,
  Object.freeze({ 'board.atmega328p-16mhz-v1': adapter }),
  emptyProjectBrief(), null, CURRENT_MODEL_LIBRARY_LOCK,
);
await writeFile(path.join(output, 'character-lcd-16x2-4bit-draft.json'), envelope);
