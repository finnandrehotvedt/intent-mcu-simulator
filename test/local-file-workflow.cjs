// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

function assert(condition, message) { if (!condition) throw new Error(message); }
function progress(stage) { console.log(JSON.stringify({ browser: browserName, stage })); }

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });

  const fallbackContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const fallback = await fallbackContext.newPage();
  const mutationRequests = [];
  fallback.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) mutationRequests.push(`${request.method()} ${request.url()}`);
  });
  await fallback.goto(base, { waitUntil: 'domcontentloaded' });
  await fallback.waitForFunction(() => window.__M11_READY__ === true);
  await fallback.evaluate(() => { window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; });
  await fallback.click('#project-demo');
  await fallback.fill('#project-name', 'Local file trainer');
  await fallback.locator('#project-name').press('Tab');
  const canonical = await fallback.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  const [download] = await Promise.all([fallback.waitForEvent('download'), fallback.click('#project-save')]);
  assert(download.suggestedFilename() === 'Local-file-trainer.intent-mcu.json', 'fallback save filename is not deterministic');
  const downloadPath = await download.path();
  assert((await fallback.textContent('#project-message')).includes('browser chooses the download location'), 'fallback location ownership is not explained');
  assert((await fallback.textContent('#project-state')).includes('download requested'), 'fallback state overclaims a completed native write');
  await fallback.click('#project-new');
  await fallback.click('#unsaved-discard');
  await fallback.setInputFiles('#project-open-input', downloadPath);
  await fallback.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Common project opened'));
  assert(JSON.stringify(await fallback.evaluate(() => window.__M6_PROJECT__())) === canonical, 'fallback save/open changed canonical project bytes');
  assert(mutationRequests.length === 0, `file workflow made server mutation request: ${mutationRequests.join(', ')}`);
  progress('fallback-download-open');
  await fallbackContext.close();

  const nativeContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await nativeContext.addInitScript(() => {
    window.__LOCAL_FILE_TEXT__ = '';
    window.__LOCAL_FILE_HANDLE__ = {
      name: 'native.intent-mcu.json',
      async createWritable() {
        return {
          async write(blob) { window.__LOCAL_FILE_TEXT__ = await blob.text(); },
          async close() {},
        };
      },
      async getFile() { return new File([window.__LOCAL_FILE_TEXT__], this.name, { type: 'application/json' }); },
    };
    window.showSaveFilePicker = async () => window.__LOCAL_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__LOCAL_FILE_HANDLE__];
  });
  const native = await nativeContext.newPage();
  const nativeMutations = [];
  native.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) nativeMutations.push(`${request.method()} ${request.url()}`);
  });
  await native.goto(base, { waitUntil: 'domcontentloaded' });
  await native.waitForFunction(() => window.__M11_READY__ === true);
  await native.click('#project-demo');
  await native.fill('#project-name', 'Native file trainer');
  await native.locator('#project-name').press('Tab');
  const nativeCanonical = await native.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  const [nativeDownload] = await Promise.all([native.waitForEvent('download'), native.click('#project-save')]);
  const nativeText = require('node:fs').readFileSync(await nativeDownload.path(), 'utf8');
  await native.evaluate((text) => { window.__LOCAL_FILE_TEXT__ = text; }, nativeText);
  assert(JSON.stringify(JSON.parse(nativeText).project) === nativeCanonical, 'common download changed native-authored project bytes');
  assert((await native.textContent('#project-state')).includes('download requested'), 'common download state is not explicit');
  await native.click('#project-new');
  await native.click('#unsaved-discard');
  await native.click('#project-open');
  await native.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Common project opened'));
  assert(JSON.stringify(await native.evaluate(() => window.__M6_PROJECT__())) === nativeCanonical, 'native save/open changed canonical project bytes');
  const beforeCancel = await native.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await native.evaluate(() => {
    window.showOpenFilePicker = async () => { throw new DOMException('cancelled', 'AbortError'); };
  });
  await native.click('#project-open');
  assert((await native.textContent('#project-message')).includes('Open cancelled'), 'native cancel is not explained');
  assert(await native.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === beforeCancel, 'cancelled open changed project state');
  await native.setInputFiles('#project-open-input', {
    name: 'invalid.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":'),
  });
  await native.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Open rejected'));
  assert((await native.textContent('#project-message')).includes('unchanged'), 'invalid open is not explained');
  assert(await native.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === beforeCancel, 'invalid open changed project state');
  for (const viewport of [
    { width: 1440, height: 900 }, { width: 768, height: 900 },
    { width: 390, height: 844 }, { width: 320, height: 720 },
  ]) {
    await native.setViewportSize(viewport);
    const responsive = await native.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      save: Boolean(document.querySelector('#project-save')?.getClientRects().length),
      open: Boolean(document.querySelector('#project-open')?.getClientRects().length),
    }));
    assert(responsive.overflow <= 1 && responsive.save && responsive.open, `file controls overflow at ${viewport.width}px`);
  }
  assert(nativeMutations.length === 0, `native file workflow made server mutation request: ${nativeMutations.join(', ')}`);
  progress('deterministic-download-native-open-cancel-invalid-responsive');
  await nativeContext.close();

  console.log(JSON.stringify({ browser: browserName, result: 'pass', account: false, serverProjectWrites: 0 }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
