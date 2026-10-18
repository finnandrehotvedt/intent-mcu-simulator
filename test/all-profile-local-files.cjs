// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.LOCAL_FILES_URL || 'http://127.0.0.1:18766';
const profiles = [
  {
    name: 'RP2040 Pico', option: 'board.rp2040-pico-v1', global: '__RP2040_PUBLIC_WORKBENCH__',
    nameInput: '#pico-project-name', sourceInput: '#pico-source', save: '#pico-save',
    open: '#pico-open', openInput: '#pico-open-input', message: '#pico-message',
    extension: '.intent-mcu.json', schema: 'intent-mcu-rp2040-public-project@1',
    sourceEdit: (value) => value.replace('intent_gpio0_output(1u)', 'intent_gpio0_output(0u)')
      .replace('PICO PUBLIC', 'PICO FILE'),
    sourceLead: 'A',
  },
  {
    name: 'ESP32-C3', option: 'board.esp32-c3-devmodule-v1', global: '__ESP32C3_PUBLIC_WORKBENCH__',
    nameInput: '#c3-project-name', sourceInput: '#c3-source', save: '#c3-save',
    open: '#c3-open', openInput: '#c3-open-input', message: '#c3-message',
    extension: '.intent-mcu.json', schema: 'intent-mcu-esp32c3-public-project@1',
    sourceEdit: (value) => value.replace('C3_PUBLIC', 'C3_FILE').replace('digitalWrite(2, HIGH)', 'digitalWrite(2, LOW)'),
    sourceLead: 'B',
  },
  {
    name: 'STM32F429ZI', option: 'board.stm32f429zi-nucleo144-v1', global: '__STM32_PUBLIC_WORKBENCH__',
    nameInput: '#stm32-project-name', sourceInput: '#stm32-source', save: '#stm32-save',
    open: '#stm32-open', openInput: '#stm32-open-input', message: '#stm32-message',
    extension: '.intent-mcu.json', schema: 'intent-mcu-stm32-public-project@2',
    sourceEdit: (value) => value.replace('intent_pb0_output(1u)', 'intent_pb0_output(0u)')
      .replace('STM32 PUBLIC', 'STM32 FILE'),
    sourceLead: 'B',
  },
];

function cleanProject(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertDataOnly(text, name) {
  assert(!/"(?:capability|sessionId|firmwareBytes|uf2Sha256|flashSha256|elfSha256|runtime|executable|secret|password|cookie)"\s*:/iu.test(text),
    `${name}: project file contains executable authority or secret state`);
}

async function ready(page) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
}

async function choose(page, profile) {
  await page.selectOption('#board-select', profile.option);
  await page.waitForFunction((global) => window[global]?.state().active === true, profile.global);
}

async function authorBrief(page, label) {
  const before = await page.evaluate(() => JSON.stringify(window.__COMMON_PROJECT_FILES__.prepare(
    window.__COMMON_PROJECT_FILES__.current(),
  ).project));
  const values = {
    purpose: `Prove the bounded ${label} teaching circuit behavior.`,
    inputs: 'Named digital input\nReset',
    outputs: 'Observed LED state\nSerial evidence',
    boundaries: 'Reset at startup\nDisconnected ground',
    acceptance: 'REQ-LED-ON | Observed output is active for the supported input | main.c:1-8 | TEST-LED-ON\nREQ-RESET | Reset does not manufacture a passing observation | main.c:9-12 | TEST-RESET',
    assumptions: 'ASK-VOLTAGE | voltage | Which supply voltage is required? | REQ-LED-ON\nASK-PIN | pin | Which named pin is required? | REQ-LED-ON\nASK-TIMING | timing | What timing limit is required? | REQ-RESET',
    capabilities: 'NEED-GPIO | peripheral | gpio | REQ-LED-ON',
  };
  await page.fill('#project-brief-purpose', values.purpose);
  await page.fill('#project-brief-inputs', values.inputs);
  await page.fill('#project-brief-outputs', values.outputs);
  await page.fill('#project-brief-boundaries', values.boundaries);
  await page.fill('#project-brief-acceptance', values.acceptance);
  await page.fill('#project-brief-assumptions', values.assumptions);
  await page.fill('#project-brief-capabilities', values.capabilities);
  const result = await page.evaluate(() => ({
    status: window.__PROJECT_BRIEF__.status(),
    project: JSON.stringify(window.__COMMON_PROJECT_FILES__.prepare(window.__COMMON_PROJECT_FILES__.current()).project),
    evaluation: document.querySelector('#project-brief-evaluation').textContent,
  }));
  assert.equal(result.status.ok, true, `${label}: brief invalid`);
  assert.equal(result.status.evaluated, false, `${label}: brief claimed evaluation`);
  assert.equal(result.project, before, `${label}: brief changed source or circuit project bytes`);
  assert.match(result.evaluation, /2 criteria · Not evaluated/u);
  assert.deepEqual(result.status.brief.acceptanceCriteria[0].codeRefs, ['main.c:1-8']);
  assert.deepEqual(result.status.brief.acceptanceCriteria[0].testRefs, ['TEST-LED-ON']);
  assert.deepEqual(result.status.brief.openAssumptions.map((item) => item.kind), ['voltage', 'pin', 'timing']);
  assert.deepEqual(result.status.brief.requiredCapabilities, [
    { id: 'NEED-GPIO', kind: 'peripheral', target: 'gpio', requirementIds: ['REQ-LED-ON'] },
  ]);
  assert.equal(await page.evaluate(() => window.__PROJECT_FEASIBILITY__.current().items[0].state), 'available');
  assert.deepEqual(await page.locator('.open-assumption-status').allTextContents(),
    ['Unresolved', 'Unresolved', 'Unresolved']);
  if (label === 'ATmega328P') {
    await page.evaluate(() => document.querySelector('#prompt-generate').click());
    const prompt = await page.inputValue('#prompt-output');
    assert.match(prompt, /ASK-VOLTAGE/u);
    assert.match(prompt, /ASK-PIN/u);
    assert.match(prompt, /ASK-TIMING/u);
    assert.match(prompt, /Do not claim or infer support/u);
  }
  return result.status.brief;
}

async function assertOpenTraceabilityIsDataOnly(page, profile, label) {
  const rows = await page.evaluate((selected) => window.__REQUIREMENT_TRACEABILITY__.current(selected), profile);
  assert.equal(rows.length, 2, `${label}: missing requirement trace rows`);
  assert.deepEqual(rows[0].requirement.codeRefs, ['main.c:1-8'], `${label}: code refs changed`);
  assert.deepEqual(rows[0].requirement.testRefs, ['TEST-LED-ON'], `${label}: test refs changed`);
  assert(rows.every((row) => row.state === 'untested' && row.result === null && row.evaluated === false),
    `${label}: Open restored a result or verdict`);
}

async function authored(page, profile) {
  return page.evaluate(({ global, nameInput, schema }) => {
    const state = window[global].state();
    if (global === '__RP2040_PUBLIC_WORKBENCH__') {
      return { schema, name: document.querySelector(nameInput).value, profile: state.profile,
        source: state.source, circuit: state.circuit };
    }
    return state.project;
  }, { global: profile.global, nameInput: profile.nameInput, schema: profile.schema });
}

async function openThroughChooser(page, profile, filePath) {
  const started = Date.now();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(profile.open)]);
  await chooser.setFiles(filePath);
  await page.waitForFunction(({ global }) => window[global].state().message.includes('opened')
    || window[global].state().message.includes('revalidated'), { global: profile.global });
  return Date.now() - started;
}

async function saveNarrow(page, profile) {
  await choose(page, profile);
  const expectedBrief = await authorBrief(page, profile.name);
  const name = `${profile.name} file contract`;
  await page.fill(profile.nameInput, name);
  await page.fill(profile.sourceInput, profile.sourceEdit(await page.inputValue(profile.sourceInput)));
  const edits = await page.evaluate(({ global, sourceLead }) => {
    const api = window[global];
    assertResult(api.setComponentProperty('resistor-1', 'ohms', 109));
    assertResult(api.setComponentProperty('led-1', 'color', 'green'));
    assertResult(api.moveCircuitComponent('resistor-1', 0.57, 0.34));
    assertResult(api.rotateCircuitComponent('resistor-1'));
    api.selectCircuit({ kind: 'net', id: 'net-series' });
    assertResult(api.deleteSelected());
    assertResult(api.activateEndpoint({ component: 'resistor-1', pin: sourceLead }));
    assertResult(api.activateEndpoint({ component: 'led-1', pin: 'ANODE' }));
    function assertResult(result) { if (!result?.ok) throw new Error(result?.code || 'edit failed'); }
    return api.state();
  }, { global: profile.global, sourceLead: profile.sourceLead });
  assert(edits.circuitValid ?? edits.circuitAccepted, `${profile.name}: edited circuit is not valid`);
  const expected = await authored(page, profile);
  const started = Date.now();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(profile.save)]);
  const filePath = await download.path();
  const saveMs = Date.now() - started;
  const filename = download.suggestedFilename();
  assert(filename.endsWith(profile.extension), `${profile.name}: unexpected filename ${filename}`);
  const text = fs.readFileSync(filePath, 'utf8');
  const saved = JSON.parse(text);
  assert.equal(saved.schema, 'intent-mcu-project-envelope@6', `${profile.name}: envelope schema`);
  assert.equal(saved.profile, profile.option, `${profile.name}: envelope profile`);
  assert.equal(saved.project.schema, profile.schema, `${profile.name}: nested schema`);
  assert.deepEqual(saved.brief, expectedBrief, `${profile.name}: brief not saved with circuit`);
  assert.deepEqual(saved.project, expected, `${profile.name}: downloaded file differs from authored data`);
  assertDataOnly(text, profile.name);
  assert.equal(saved.project.circuit.layout.positions['resistor-1'].rotation, 90);
  assert.equal(saved.project.circuit.components.find((item) => item.id === 'resistor-1').properties.ohms, 109);
  assert.equal(saved.project.circuit.components.find((item) => item.id === 'led-1').properties.color, 'green');
  assert.equal(saved.project.circuit.nets.filter((net) => net.id === 'net-series').length, 1);
  return { profile, expected, expectedBrief, filePath, filename, saveMs, saved };
}

async function verifyNarrowOpen(browser, record, wrongProfilePath) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const mutations = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`); });
  await ready(page);
  await choose(page, record.profile);
  const firstOpenMs = await openThroughChooser(page, record.profile, record.filePath);
  assert.deepEqual(await authored(page, record.profile), record.expected, `${record.profile.name}: fresh-page Open changed authored data`);
  assert.deepEqual(await page.evaluate(() => window.__PROJECT_BRIEF__.current()), record.expectedBrief,
    `${record.profile.name}: fresh-page Open changed project brief`);
  await assertOpenTraceabilityIsDataOnly(page, record.profile.option, record.profile.name);
  assert.equal(await page.evaluate((profile) => window.__COMMON_PROJECT_FILES__.current(profile), record.profile.option),
    fs.readFileSync(record.filePath, 'utf8'), `${record.profile.name}: canonical envelope bytes changed after Open`);
  let state = await page.evaluate((global) => window[global].state(), record.profile.global);
  assert.equal(state.circuitEditor.canUndo, false, `${record.profile.name}: Open restored history`);
  assert.equal(state.artifact, null, `${record.profile.name}: Open restored artifact`);
  assert.equal(state.runtime, null, `${record.profile.name}: Open restored runtime`);
  assert.equal(state.runnable, false, `${record.profile.name}: Open restored runnable authority`);

  const first = cleanProject(await authored(page, record.profile));
  const repeatOpenMs = await openThroughChooser(page, record.profile, record.filePath);
  assert.deepEqual(await authored(page, record.profile), first, `${record.profile.name}: repeated Open duplicated or changed data`);
  state = await page.evaluate((global) => window[global].state(), record.profile.global);
  assert.equal(state.circuitEditor.catalog.parts.length, 3, `${record.profile.name}: repeated Open changed catalogue`);
  assert.equal(first.circuit.components.length, 3, `${record.profile.name}: repeated Open duplicated components`);
  assert.equal(first.circuit.nets.length, 3, `${record.profile.name}: repeated Open duplicated nets`);

  const unchanged = JSON.stringify(await authored(page, record.profile));
  await page.locator(record.profile.openInput).evaluate((node) => node.dispatchEvent(new Event('change', { bubbles: true })));
  assert.equal(JSON.stringify(await authored(page, record.profile)), unchanged, `${record.profile.name}: cancelled file input changed project`);

  const malformed = { name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":') };
  await page.setInputFiles(record.profile.openInput, malformed);
  await page.waitForFunction((message) => document.querySelector(message).textContent.includes('Open rejected'), record.profile.message);
  assert.equal(JSON.stringify(await authored(page, record.profile)), unchanged, `${record.profile.name}: malformed Open changed project`);

  await page.setInputFiles(record.profile.openInput, { name: 'oversized.json', mimeType: 'application/json',
    buffer: Buffer.alloc(1024 * 1024 + 1, 0x20) });
  await page.waitForTimeout(50);
  assert.equal(JSON.stringify(await authored(page, record.profile)), unchanged, `${record.profile.name}: oversized Open changed project`);

  const wrongProfile = cleanProject(record.saved);
  wrongProfile.profile = 'board.atmega328p-16mhz-v1';
  await page.setInputFiles(record.profile.openInput, { name: 'wrong-profile.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(wrongProfile)) });
  await page.waitForFunction((message) => document.querySelector(message).textContent.includes('Open rejected'), record.profile.message);
  assert.equal(JSON.stringify(await authored(page, record.profile)), unchanged, `${record.profile.name}: wrong-profile Open changed project`);

  const unsupported = cleanProject(record.saved);
  unsupported.project.circuit.components.find((item) => item.id === 'resistor-1').properties.watts = 0.25;
  await page.setInputFiles(record.profile.openInput, { name: 'unsupported-property.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(unsupported)) });
  await page.waitForFunction((message) => document.querySelector(message).textContent.includes('Open rejected'), record.profile.message);
  assert.equal(JSON.stringify(await authored(page, record.profile)), unchanged, `${record.profile.name}: unsupported property changed project`);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(({ save, open }) => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    saveVisible: Boolean(document.querySelector(save)?.getClientRects().length),
    openVisible: Boolean(document.querySelector(open)?.getClientRects().length),
  }), { save: record.profile.save, open: record.profile.open });
  assert(mobile.overflow <= 1 && mobile.saveVisible && mobile.openVisible,
    `${record.profile.name}: mobile file controls invalid ${JSON.stringify(mobile)}`);
  assert.deepEqual(errors, [], `${record.profile.name}: browser errors`);
  assert.deepEqual(mutations, [], `${record.profile.name}: file flow made server mutations`);
  assert.equal((await context.cookies()).length, 0, `${record.profile.name}: cookies`);
  await context.close();
  return { firstOpenMs, repeatOpenMs, mobile };
}

async function saveAvr(page) {
  await page.evaluate(() => { window.showOpenFilePicker = undefined; });
  await page.click('#project-demo');
  await page.fill('#project-name', 'AVR file contract');
  await page.locator('#project-name').press('Tab');
  const source = (await page.inputValue('#source')).replaceAll('delay(300)', 'delay(250)');
  await page.fill('#source', source);
  await page.locator('#source').press('Tab');
  const resistor = page.locator('#component-layer [data-component-id="resistor-1"]');
  await resistor.click({ force: true });
  await page.click('#rotate-component');
  await resistor.focus();
  await page.keyboard.press('ArrowRight');
  const project = await page.evaluate(() => window.__M6_PROJECT__());
  const netId = project.circuit.nets[0].id;
  await page.selectOption('#selected-net', netId);
  await page.selectOption('#wire-color', '#5f8cff');
  const expectedBrief = await authorBrief(page, 'ATmega328P');
  const expected = await page.evaluate(() => window.__M6_PROJECT__());
  const started = Date.now();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  const filePath = await download.path();
  const saveMs = Date.now() - started;
  const text = fs.readFileSync(filePath, 'utf8');
  const saved = JSON.parse(text);
  assert.equal(saved.schema, 'intent-mcu-project-envelope@6', 'AVR: envelope schema');
  assert.equal(saved.profile, 'board.atmega328p-16mhz-v1', 'AVR: envelope profile');
  assert.deepEqual(saved.project, expected, 'AVR: downloaded file differs from canonical authored project');
  assert.deepEqual(saved.brief, expectedBrief, 'AVR: brief not saved with circuit');
  assert.equal(saved.project.build.artifactIdentity, null, 'AVR: saved artifact identity');
  assert.equal(saved.project.build.inputIdentity, null, 'AVR: saved input identity');
  assertDataOnly(text, 'AVR');
  return { profile: { name: 'ATmega328P' }, expected, expectedBrief, filePath,
    filename: download.suggestedFilename(), saveMs, saved };
}

async function verifyAvrOpen(browser, record, wrongProfilePath) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; });
  const page = await context.newPage();
  await ready(page);
  const firstOpenMs = Date.now();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#project-open')]);
  await chooser.setFiles(record.filePath);
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Common project opened'));
  const firstMs = Date.now() - firstOpenMs;
  assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), record.expected, 'AVR: fresh-page Open changed project');
  assert.deepEqual(await page.evaluate(() => window.__PROJECT_BRIEF__.current()), record.expectedBrief,
    'AVR: fresh-page Open changed project brief');
  await assertOpenTraceabilityIsDataOnly(page, 'board.atmega328p-16mhz-v1', 'AVR');
  assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current('board.atmega328p-16mhz-v1')),
    fs.readFileSync(record.filePath, 'utf8'), 'AVR: canonical envelope bytes changed after Open');
  const unchanged = JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__()));
  const repeatStarted = Date.now();
  const [repeatChooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#project-open')]);
  await repeatChooser.setFiles(record.filePath);
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Common project opened'));
  const repeatMs = Date.now() - repeatStarted;
  assert.equal(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())), unchanged, 'AVR: repeated Open changed project');
  for (const file of [
    { name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":') },
    { name: 'wrong-profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      ...record.saved, profile: 'board.rp2040-pico-v1',
    })) },
    (() => {
      const value = cleanProject(record.saved);
      value.project.circuit.components.find((item) => item.id === 'resistor-1').properties.watts = 0.25;
      return { name: 'unsupported-property.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) };
    })(),
  ]) {
    await page.setInputFiles('#project-open-input', file);
    await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Open rejected'));
    await page.waitForTimeout(50);
    assert.equal(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())), unchanged, 'AVR: rejected Open changed project');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    saveVisible: Boolean(document.querySelector('#project-save')?.getClientRects().length),
    openVisible: Boolean(document.querySelector('#project-open')?.getClientRects().length),
  }));
  assert(mobile.overflow <= 1 && mobile.saveVisible && mobile.openVisible, `AVR mobile ${JSON.stringify(mobile)}`);
  await context.close();
  return { firstOpenMs: firstMs, repeatOpenMs: repeatMs, mobile };
}

async function verifyCrossProfileRouting(browser, pico, c3) {
  const context = await browser.newContext({ viewport: { width: 1265, height: 900 } });
  const page = await context.newPage();
  await ready(page);
  await choose(page, pico.profile);
  await page.fill(pico.profile.nameInput, 'PARKED PICO BEFORE C3 OPEN');
  await page.locator(pico.profile.nameInput).press('Tab');
  const parked = await authored(page, pico.profile);
  await page.setInputFiles(pico.profile.openInput, c3.filePath);
  await page.waitForFunction((profile) => document.querySelector('#board-select').value === profile, c3.profile.option);
  assert.deepEqual(await authored(page, c3.profile), c3.expected, 'valid cross-family Open did not route to the declared C3 profile');
  await choose(page, pico.profile);
  assert.deepEqual(await authored(page, pico.profile), parked, 'cross-family Open changed the parked Pico draft');
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const saveContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await saveContext.addInitScript(() => {
    window.showSaveFilePicker = () => new Promise(() => {});
  });
  const page = await saveContext.newPage();
  await ready(page);
  const avr = await saveAvr(page);
  const narrow = [];
  for (const profile of profiles) {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    narrow.push(await saveNarrow(page, profile));
  }
  await verifyCrossProfileRouting(browser, narrow[0], narrow[1]);
  const opened = { ATmega328P: await verifyAvrOpen(browser, avr, narrow[0].filePath) };
  for (let index = 0; index < narrow.length; index += 1) {
    const record = narrow[index];
    const wrong = narrow[(index + 1) % narrow.length].filePath;
    opened[record.profile.name] = await verifyNarrowOpen(browser, record, wrong);
  }
  const result = {
    status: 'pass',
    files: [avr, ...narrow].map((item) => ({
      profile: item.profile.name, filename: item.filename, bytes: fs.statSync(item.filePath).size,
      saveMs: item.saveMs, firstOpenMs: opened[item.profile.name].firstOpenMs,
      repeatOpenMs: opened[item.profile.name].repeatOpenMs,
    })),
    freshPageFileChooser: true,
    avrSaveIgnoresUnavailableNativePicker: true,
    authoredDataDeepCompared: true,
    dataOnlyNoExecutableOrSecrets: true,
    malformedWrongProfileUnsupportedAtomic: true,
    repeatedOpenNoDuplicates: true,
    cancelledInputNoChange: true,
    desktopMobile: true,
    serverProjectWrites: 0,
  };
  await saveContext.close();
  await browser.close();
  process.stdout.write(`${JSON.stringify(result)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
