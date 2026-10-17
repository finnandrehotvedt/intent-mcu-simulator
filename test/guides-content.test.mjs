// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (name) => readFile(new URL(`../staging/${name}`, import.meta.url), 'utf8');

test('public guides cover every narrow controller and the exact recovery boundary', async () => {
  const [controllers, components, examples, support, index, sitemap, llms] = await Promise.all([
    read('controllers.html'), read('components.html'), read('examples.html'), read('support.html'),
    read('index.html'), read('sitemap.xml'), read('llms.txt'),
  ]);
  for (const id of ['pico-first-project', 'esp32c3-first-project', 'stm32-first-project']) {
    assert(examples.includes(`id="${id}"`), id);
    assert(controllers.includes(`/examples.html#${id}`), `controller link ${id}`);
    assert(support.includes(`/examples.html#${id}`), `support link ${id}`);
  }
  for (const phrase of [
    'GP0 physical pin 1 → series resistor → LED anode',
    'GPIO2 J1 pin 4 → series resistor → LED anode',
    'PB0 CN11 pin 34 → series resistor → LED anode',
    'Add missing part', 'no cable is inferred', 'fresh Build',
  ]) assert(examples.includes(phrase) || support.includes(phrase) || components.includes(phrase), phrase);
  assert(components.includes('id="narrow-profile-parts"')
    && components.includes('resistor.fixed-v1') && components.includes('led.basic-v1'));
  assert(support.includes('Pico directly downloads <code>.intent-mcu.json</code>')
    && support.includes('ESP32-C3 and STM32 directly download <code>.json</code>'));
  assert(index.includes('/examples.html#narrow-controller-guides'));
  assert(examples.includes('id="thermostat-boundary-test"')
    && examples.includes('executed D13 and matching UART evidence'));
  assert(controllers.includes('/examples.html#thermostat-boundary-test')
    && support.includes('between 160 and 350 virtual milliseconds'));
  assert(llms.includes('/examples.html#thermostat-boundary-test')
    && llms.includes('known-bad equality variant'));
  assert.equal((sitemap.match(/<lastmod>2026-10-17<\/lastmod>/gu) ?? []).length, 5);
  assert(llms.includes('Open never restores executable authority')
    && llms.includes('/examples.html#stm32-first-project'));
});
