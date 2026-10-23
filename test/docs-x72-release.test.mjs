// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { avrReferenceStarterCatalog } from '../src/avr-reference-starters.mjs';
import { publicControllerViews } from '../src/public-controller-workbench-view.mjs';
import { exampleCatalog } from '../src/example-projects.mjs';
import { RELEASE_VERSION } from '../src/release-metadata.mjs';
import { THERMOSTAT_EXPERIMENT_CARD } from '../src/thermostat-experiment.mjs';
import { THERMOSTAT_SCENARIOS } from '../src/thermostat-experiment-contract.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('public documentation facts derive from the current release and canonical catalogs', async () => {
  const [controllers, components, examples, support, llms, sitemap] = await Promise.all([
    read('../staging/controllers.html'), read('../staging/components.html'),
    read('../staging/examples.html'), read('../staging/support.html'),
    read('../staging/llms.txt'), read('../staging/sitemap.xml'),
  ]);
  const avrCount = exampleCatalog().length + 1 + 1 + avrReferenceStarterCatalog().length;
  assert.equal(RELEASE_VERSION, '1.1.0-rc.126');
  assert.equal(avrCount, 15);
  assert.equal(THERMOSTAT_SCENARIOS.scenarios.length, 4);
  assert.match(THERMOSTAT_EXPERIMENT_CARD.outcome, /four reset-isolated/u);
  for (const page of [controllers, components, examples, support, llms]) {
    assert.match(page, /1\.1\.0-rc\.125/u);
    assert.doesNotMatch(page, /1\.1\.0-rc\.41/u);
  }
  assert.match(controllers, /four reset-isolated boundary scenarios/u);
  assert.match(examples, /four reset-isolated virtual-time scenarios/u);
  assert.match(llms, /fifteen validated AVR starters/u);
  assert.match(llms, /four reset-isolated virtual-time scenarios/u);
  assert.match(llms, /finite resistor-and-LED reusable subcircuit/u);
  assert.match(support, /X66[^·]+complete only against their bounded original criteria/u);
  assert.match(support, /X46 remains partial beyond this bounded USART0 TX increment/u);
  assert.match(support, /X 85\/2\/9/u);
  assert.match(support, /no account[^\n]+nested or general-purpose subcircuit authority/u);
  assert.match(sitemap, /<lastmod>2026-10-21<\/lastmod>/u);
});

test('docs preserve canonical runtime/model boundaries and explain the Build privacy boundary', async () => {
  const [controllers, support, llms] = await Promise.all([
    read('../staging/controllers.html'), read('../staging/support.html'), read('../staging/llms.txt'),
  ]);
  const views = publicControllerViews();
  assert.equal(views.length, 4);
  assert.ok(views.every((view) => view.publicExecution === true));
  assert.match(controllers, /actual QEMU CPU\/UART \+ separate GPIO2 model/iu);
  assert.match(controllers, /Actual Renode PB0\/USART3 subset/u);
  assert.match(controllers, /QEMU pin state is not observed/u);
  assert.match(controllers, /ideal teaching circuit, not analogue or physical-board equivalence/u);
  for (const text of [support, llms]) {
    assert.match(text, /same-origin isolated compiler/u);
    assert.match(text, /temporary/u);
    assert.match(text, /no account|no durable server project/u);
  }
  assert.match(support, /Your saved project stays in your chosen local file or local browser recovery/u);
  assert.match(support, /no project-selected command, package, hook or network download/u);
  assert.match(support, /Older recognized files map to the finite retained pre-X56 model resolver only after complete validation/u);
  assert.match(support, /explicit preview-and-download action that creates a new data-only copy and never overwrites the open original/u);
  assert.match(support, /complete retained USART0 TX byte records/u);
  assert.match(support, /UART framing bits, RX traffic, a physical voltage waveform, noise, I2C or SPI/u);
  assert.match(support, /Search current project/u);
  assert.match(support, /query and results are not saved or sent to a search service/u);
  assert.match(support, /profile, generation, revision or graph changed/u);
  assert.match(llms, /transient local presentation/u);
  assert.match(llms, /saved requirement\/test owners and AVR scenario owners/u);
  assert.match(support, /typed authored facts/u);
  assert.match(support, /literal source-file difference/u);
  assert.match(support, /does not infer what source code means/u);
  assert.match(llms, /typed authored facts/u);
  assert.match(llms, /literal source-file difference/u);
});
