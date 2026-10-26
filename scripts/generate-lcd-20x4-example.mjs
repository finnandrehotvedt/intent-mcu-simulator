// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalProjectEnvelope } from '../src/project-envelope.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';

const source = `// Original educational example: AVR 20x4 LCD with one 5x8 CGRAM heart.
const byte LCD_RS=3, LCD_E=4, LCD_D4=7, LCD_D5=8, LCD_D6=10, LCD_D7=12;
const byte rowAddress[4] = {0x00, 0x40, 0x14, 0x54};
void lcdPulse(){ digitalWrite(LCD_E,HIGH); delayMicroseconds(2); digitalWrite(LCD_E,LOW); delayMicroseconds(60); }
void lcdNibble(byte v){ digitalWrite(LCD_D4,v&1); digitalWrite(LCD_D5,v&2); digitalWrite(LCD_D6,v&4); digitalWrite(LCD_D7,v&8); lcdPulse(); }
void lcdSend(byte v,bool data){ digitalWrite(LCD_RS,data?HIGH:LOW); lcdNibble(v>>4); lcdNibble(v&15); }
void lcdCommand(byte v){ lcdSend(v,false); if(v==1||v==2) delayMicroseconds(1600); }
void lcdWrite(byte v){ lcdSend(v,true); }
void lcdText(const char *v){ while(*v) lcdWrite(*v++); }
void lcdAt(byte row,byte column){ lcdCommand(0x80 | (rowAddress[row] + column)); }
void lcdGlyph(byte slot,const byte rows[8]){ lcdCommand(0x40 | ((slot&7)<<3)); for(byte i=0;i<8;i++) lcdWrite(rows[i]&0x1f); }
void setup(){
  pinMode(LCD_RS,OUTPUT); pinMode(LCD_E,OUTPUT); pinMode(LCD_D4,OUTPUT); pinMode(LCD_D5,OUTPUT); pinMode(LCD_D6,OUTPUT); pinMode(LCD_D7,OUTPUT);
  digitalWrite(LCD_RS,LOW); digitalWrite(LCD_E,LOW); delay(20); lcdNibble(3); delayMicroseconds(4200); lcdNibble(3); delayMicroseconds(150); lcdNibble(3); delayMicroseconds(150); lcdNibble(2);
  lcdCommand(0x28); lcdCommand(0x0c); lcdCommand(0x06); lcdCommand(0x01); lcdCommand(0x0f);
  const byte heart[8]={0,10,31,31,14,4,0,0}; lcdGlyph(1,heart);
  lcdAt(0,0); lcdText("Teach the Company"); lcdAt(1,0); lcdText("20x4 GPIO ready");
  lcdAt(2,0); lcdText("CGRAM heart:"); lcdWrite(1); lcdAt(3,0); lcdText("Rows 00 40 14 54");
  Serial.begin(9600); Serial.println("LCD20X4=CGRAM_READY");
}
void loop(){}
`;

const inputUrl = new URL('../examples/lcd/parallel-hd44780-16x2.intent-mcu.json', import.meta.url);
const outputUrl = new URL('../examples/lcd/parallel-hd44780-20x4-cgram.intent-mcu.json', import.meta.url);
const envelope = JSON.parse(await readFile(inputUrl, 'utf8'));
envelope.modelLibrary = structuredClone(CURRENT_MODEL_LIBRARY_LOCK);
envelope.project.project.metadata.name = 'AVR 20×4 character display with custom glyph';
envelope.project.project.source.files[0].content = source;
const display = envelope.project.candidateCircuit.components.find((item) => item.id === 'character-lcd-1');
display.type = 'output.character-lcd-20x4-4bit-v1';
display.label = '20×4 display with CGRAM heart';
const canonical = canonicalProjectEnvelope(
  envelope.profile, envelope.project, Object.freeze({ [envelope.profile]: {
    schemas: Object.freeze([envelope.project.schema]),
    prepare(value) {
      const opened = openCandidateUiSession(JSON.stringify(value));
      if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
      return { project: JSON.parse(opened.session.saveText()) };
    },
  } }),
  envelope.brief, envelope.scenarioTimeline, envelope.modelLibrary,
);
await writeFile(outputUrl, canonical);
const parsed = JSON.parse(canonical);
console.log(JSON.stringify({
  file: outputUrl.pathname,
  projectSha256: createHash('sha256').update(canonical).digest('hex'),
  sourceSha256: createHash('sha256').update(parsed.project.project.source.files[0].content).digest('hex'),
}));
