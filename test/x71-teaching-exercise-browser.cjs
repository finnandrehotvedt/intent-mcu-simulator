// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X71_URL || 'http://host.docker.internal:18898/dist/';
const output = process.env.X71_OUTPUT || '/tmp/x71-teaching-exercise';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const producers = []; const mutations = []; const outside = []; const errors = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/api\/(build|run|scenario|worker)/u.test(url.pathname)) producers.push(`${request.method()} ${url.pathname}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== new URL(base).origin) outside.push(url.href);
  });
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X71_TEACHING_EXERCISE__);
    await page.click('#project-files-open');
    await page.click('#teaching-exercise-open');
    await page.waitForSelector('#teaching-exercise-dialog[open]');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'teaching-exercise-title');
    assert.equal(await page.locator('#teaching-exercise-requirements li').count(), 3);
    assert.match(await page.locator('[data-known-fault="true"]').innerText(), /Known fault.*<= 30/u);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#teaching-exercise-download')]);
    const bundlePath = await download.path();
    const bundleText = fs.readFileSync(bundlePath, 'utf8');
    const bundle = JSON.parse(bundleText);
    assert.equal(bundle.schema, 'intent-mcu-teaching-exercise@1');
    assert.deepEqual(bundle.variants.map(({ id }) => id), ['correct', 'known-bad-equality']);
    await page.setInputFiles('#teaching-exercise-input', { name: 'teacher.intent-mcu-exercise.json',
      mimeType: 'application/json', buffer: Buffer.from(bundleText) });
    await page.waitForFunction(() => document.querySelector('#teaching-exercise-status').textContent.includes('Both start projects passed validation'));
    const acceptedBeforeMalformed = await page.evaluate(() => window.__X71_TEACHING_EXERCISE__.current());
    const projectBeforeMalformed = await page.evaluate(() => window.__M6_PROJECT__());
    const malformed = structuredClone(bundle); malformed.variants[1].project.project.project.source.files[0].content = 'invalid second start project';
    await page.setInputFiles('#teaching-exercise-input', { name: 'malformed.intent-mcu-exercise.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) });
    await page.waitForFunction(() => document.querySelector('#teaching-exercise-status').textContent.includes('rejected'));
    assert.deepEqual(await page.evaluate(() => window.__X71_TEACHING_EXERCISE__.current()), acceptedBeforeMalformed);
    assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), projectBeforeMalformed);
    await page.screenshot({ path: `${output}/x71-teaching-exercise-1366x900.png`, fullPage: false });

    await page.check('input[name="teaching-exercise-variant"][value="correct"]');
    await page.click('#teaching-exercise-install');
    await page.waitForFunction(() => window.__M6_STATE__.lifecycle.phase === 'editing' && window.__M6_STATE__.artifactIdentity === null);
    const correct = await page.evaluate(() => ({ project: window.__M6_PROJECT__(), source: document.querySelector('#source').value,
      runtime: window.__M6_STATE__.runtime, artifact: window.__M6_STATE__.artifactIdentity }));
    assert.equal(correct.runtime, null); assert.equal(correct.artifact, null);

    await page.click('#project-files-open');
    await page.click('#teaching-exercise-open');
    await page.check('input[name="teaching-exercise-variant"][value="known-bad-equality"]');
    await page.click('#teaching-exercise-install');
    await page.waitForFunction((source) => document.querySelector('#source').value !== source, correct.source);
    const knownBad = await page.evaluate(() => ({ project: window.__M6_PROJECT__(), source: document.querySelector('#source').value,
      runtime: window.__M6_STATE__.runtime, artifact: window.__M6_STATE__.artifactIdentity }));
    assert.notEqual(knownBad.source, correct.source); assert.equal(knownBad.runtime, null); assert.equal(knownBad.artifact, null);
    assert.deepEqual(knownBad.project.candidateCircuit, correct.project.candidateCircuit);

    await page.evaluate((source) => { const input = document.querySelector('#source'); input.value = `${source}\n// unsaved student note`; input.dispatchEvent(new Event('input', { bubbles: true })); }, knownBad.source);
    await page.click('#project-files-open');
    await page.click('#teaching-exercise-open');
    await page.check('input[name="teaching-exercise-variant"][value="correct"]');
    await page.click('#teaching-exercise-install');
    await page.waitForSelector('#unsaved-change-dialog[open]');
    await page.click('#unsaved-keep');
    assert.match(await page.inputValue('#source'), /unsaved student note/u);
    if (!await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) await page.click('#project-files-open');
    await page.click('#teaching-exercise-open');
    await page.check('input[name="teaching-exercise-variant"][value="correct"]');
    await page.click('#teaching-exercise-install');
    await page.waitForSelector('#unsaved-change-dialog[open]');
    await page.click('#unsaved-discard');
    await page.waitForFunction((source) => document.querySelector('#source').value === source, correct.source);

    assert.deepEqual(producers, []); assert.deepEqual(mutations, []); assert.deepEqual(outside, []);
    assert.equal((await context.cookies()).length, 0); assert.deepEqual(errors, []);
    const result = { result: 'pass', requirements: 3, variants: 2, localRoundtrip: true, malformedSecondAtomic: true,
      distinctSources: true, circuitIdentityPreserved: true, unsavedKeep: true, unsavedDiscard: true,
      nativeRuntimeRestored: false, producers: producers.length, mutations: mutations.length,
      outsideRequests: outside.length, cookies: 0 };
    fs.writeFileSync(`${output}/x71-teaching-exercise.json`, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
