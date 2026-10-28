// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const root = process.env.PASSIVE_PIEZO_BROWSER_ROOT;
if (!root) throw new Error('PASSIVE_PIEZO_BROWSER_ROOT required');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const relative = pathname === '/' ? 'dist/index.html'
    : pathname.startsWith('/examples/') ? pathname.slice(1) : `dist/${pathname.slice(1)}`;
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.setInputFiles('#project-open-input', path.join(root, 'examples/indicators-actuators/avr-passive-piezo.intent-mcu.json'));
    await page.waitForSelector('[data-component-id="passive-piezo-1"] [data-artwork-key="output-passive-piezo"]');
    const state = await page.evaluate(() => {
      const artwork = document.querySelector('[data-component-id="passive-piezo-1"] [data-artwork-key="output-passive-piezo"]');
      const project = window.__M6_PROJECT__();
      return { driveState: artwork.dataset.driveState, transitionActive: artwork.dataset.transitionActive,
        terminals: [...artwork.querySelectorAll('[data-terminal-pin]')].map((node) => node.dataset.terminalPin),
        label: artwork.getAttribute('aria-label'), type: project.candidateCircuit.components.find((item) => item.id === 'passive-piezo-1')?.type,
        hasAudio: Boolean(document.querySelector('audio')) };
    });
    assert(state.type === 'output.passive-piezo-v1', `identity ${JSON.stringify(state)}`);
    assert(JSON.stringify(state.terminals) === JSON.stringify(['SIGNAL', 'GND']), `terminals ${JSON.stringify(state)}`);
    assert(state.driveState === 'rest' && state.transitionActive === 'false', `initial state ${JSON.stringify(state)}`);
    assert(/no audio or calibrated frequency/u.test(state.label) && !state.hasAudio, `boundary ${JSON.stringify(state)}`);
    if (await page.locator('#workbench-project-dialog[open]').count()) await page.locator('#workbench-project-dialog .workbench-popup-close').click();
    await page.click('#toggle-catalog');
    await page.evaluate(() => {
      const search = document.querySelector('#catalog-search'); search.value = 'passive piezo'; search.dispatchEvent(new Event('input', { bubbles: true }));
      const status = document.querySelector('#catalog-status'); status.value = 'partial'; status.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert(await page.locator('.catalog-item[data-type="output.passive-piezo-v1"]').count() === 1, 'drawer entry missing');
    assert(errors.length === 0, errors.join('\n'));
    process.stdout.write(JSON.stringify({ ok: true, state }) + '\n');
  } finally { await browser.close(); server.close(); }
})().catch((error) => { server.close(); console.error(error); process.exitCode = 1; });
