// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MIGRATION_PROFILES, explainProfileMigration,
} from '../src/profile-migration-explanation.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const PICO = 'board.rp2040-pico-v1';
const C3 = 'board.esp32-c3-devmodule-v1';
const STM32 = 'board.stm32f429zi-nucleo144-v1';

const projects = {
  [AVR]: () => ({
    boardProfile: AVR,
    source: { files: [{ name: 'main.ino', content: 'void setup() {}\nvoid loop() {}\n' }] },
    circuit: {
      components: [
        { id: 'board-1', type: AVR },
        { id: 'button-1', type: 'button.momentary-v1' },
      ],
      nets: [
        { id: 'signal', endpoints: [{ component: 'board-1', pin: 'D2' }, { component: 'button-1', pin: 'A' }] },
        { id: 'ground', endpoints: [{ component: 'board-1', pin: 'GND1' }, { component: 'button-1', pin: 'B' }] },
      ],
    },
  }),
  [PICO]: () => ({
    profile: PICO,
    source: '/* Intent MCU Simulator public RP2040 source v1 */\nint main(void)\n{\n  intent_gpio0_output(1u);\n  intent_uart0_text("PICO LED ON");\n  intent_halt();\n}\n',
    circuit: {
      components: [{ id: 'pico-1', type: PICO }, { id: 'resistor-1', type: 'resistor.fixed-v1' }, { id: 'led-1', type: 'led.basic-v1' }],
      nets: [{ id: 'signal', endpoints: [{ component: 'pico-1', pin: 'GP0' }, { component: 'resistor-1', pin: 'A' }] }, { id: 'ground', endpoints: [{ component: 'pico-1', pin: 'GND3' }, { component: 'led-1', pin: 'CATHODE' }] }],
    },
  }),
  [C3]: () => ({
    profile: C3,
    source: '// Copyright 2026 IntentForce\n// SPDX-License-Identifier: Apache-2.0\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(2, OUTPUT);\n  digitalWrite(2, HIGH);\n  Serial.println("C3_LED_ON");\n}\n\nvoid loop() {\n  delay(1000);\n}\n',
    circuit: {
      components: [{ id: 'c3-1', type: C3 }, { id: 'resistor-1', type: 'resistor.fixed-v1' }, { id: 'led-1', type: 'led.basic-v1' }],
      nets: [{ id: 'signal', endpoints: [{ component: 'c3-1', pin: 'GPIO2' }, { component: 'resistor-1', pin: 'A' }] }, { id: 'ground', endpoints: [{ component: 'c3-1', pin: 'GND' }, { component: 'led-1', pin: 'CATHODE' }] }],
    },
  }),
  [STM32]: () => ({
    profile: STM32,
    source: '/* Intent MCU Simulator public STM32F429 source v1 */\nint main(void)\n{\n  intent_pb0_output(1u);\n  intent_usart3_text("STM32 LED ON");\n  intent_halt();\n}\n',
    circuit: {
      components: [{ id: 'stm32-1', type: STM32 }, { id: 'resistor-1', type: 'resistor.fixed-v1' }, { id: 'led-1', type: 'led.basic-v1' }],
      nets: [{ id: 'signal', endpoints: [{ component: 'stm32-1', pin: 'PB0' }, { component: 'resistor-1', pin: 'A' }] }, { id: 'ground', endpoints: [{ component: 'stm32-1', pin: 'GND' }, { component: 'led-1', pin: 'CATHODE' }] }],
    },
  }),
};

test('X65 explains all 12 directed profile pairs without changing project bytes', () => {
  let pairs = 0;
  for (const fromProfile of MIGRATION_PROFILES) for (const toProfile of MIGRATION_PROFILES) {
    if (fromProfile === toProfile) continue;
    const project = projects[fromProfile]();
    const before = JSON.stringify(project);
    const report = explainProfileMigration({ fromProfile, toProfile, project });
    assert.equal(report.from.profile, fromProfile);
    assert.equal(report.to.profile, toProfile);
    assert.equal(report.automaticMigration, false);
    assert.equal(report.mutatesProject, false);
    assert.equal(report.pins.automaticMap, false);
    assert.match(report.source.action, /not copied or translated/u);
    assert.match(report.pins.action, /manually|incomplete wiring/u);
    assert.equal(JSON.stringify(project), before);
    pairs += 1;
  }
  assert.equal(pairs, 12);
});

test('X65 names the exact bounded source APIs and never equates controller pins', () => {
  const pico = explainProfileMigration({ fromProfile: PICO, toProfile: C3, project: projects[PICO]() });
  assert.deepEqual(pico.source.currentApis, ['intent_gpio0_output', 'intent_uart0_text', 'intent_halt']);
  assert.deepEqual(pico.pins.used.sort(), ['GND3', 'GP0']);
  assert.match(pico.pins.action, /GP0.*not aliases for GPIO2/u);

  const c3 = explainProfileMigration({ fromProfile: C3, toProfile: STM32, project: projects[C3]() });
  assert(c3.source.currentApis.includes('digitalWrite'));
  assert.match(c3.pins.action, /GPIO2.*not aliases for PB0/u);

  const stm32 = explainProfileMigration({ fromProfile: STM32, toProfile: AVR, project: projects[STM32]() });
  assert(stm32.source.currentApis.includes('intent_pb0_output'));
  assert.match(stm32.pins.action, /PB0.*not aliases for D0/u);

  const avr = explainProfileMigration({ fromProfile: AVR, toProfile: PICO, project: projects[AVR]() });
  assert.equal(avr.source.state, 'unknown');
  assert.match(avr.source.reason, /not inferred/u);
  assert.match(avr.pins.action, /D2.*not aliases for GP0/u);
});

test('X65 preserves unknown and unresolved requirements instead of inventing support', () => {
  const project = projects[AVR]();
  const requiredCapabilities = [
    { id: 'NEED-UNKNOWN', kind: 'peripheral', target: 'spi', requirementIds: ['REQ-1'] },
    { id: 'NEED-OPEN', kind: 'component', target: '?', requirementIds: ['REQ-2'] },
    { id: 'NEED-BUTTON', kind: 'component', target: 'button.momentary-v1', requirementIds: ['REQ-3'] },
  ];
  const before = JSON.stringify(requiredCapabilities);
  const report = explainProfileMigration({ fromProfile: AVR, toProfile: PICO, project, requiredCapabilities });
  assert.deepEqual(report.requirements.items.map((item) => item.state), ['unknown', 'unresolved', 'unsupported']);
  assert.equal(report.requirements.evaluated, false);
  assert.equal(report.requirements.buildAuthority, false);
  assert.equal(JSON.stringify(requiredCapabilities), before);
});
