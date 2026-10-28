// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs'); const http = require('node:http'); const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const root = process.env.DC_MOTOR_ENCODER_BROWSER_ROOT; if (!root) throw new Error('DC_MOTOR_ENCODER_BROWSER_ROOT required');
const server = http.createServer((request, response) => { const pathname = new URL(request.url, 'http://x').pathname;
  if (pathname === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><main id="root"></main>'); return; }
  const file = path.resolve(root, pathname.slice(1)); if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': pathname.endsWith('.mjs') ? 'text/javascript' : 'application/json' }); fs.createReadStream(file).pipe(response); });
const assert = (value, message) => { if (!value) throw new Error(message); };
(async () => { await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); const browser = await chromium.launch({ headless: true });
  try { const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async () => { const model = await import('/expansion-drafts/dc-motor-encoder-v1.mjs');
      const artwork = await import('/expansion-drafts/dc-motor-encoder-artwork-v1.mjs'); const component = model.createDcMotorEncoderComponent('motor', 'Motor encoder', 2);
      const svg = artwork.createDcMotorEncoderArtwork(document, model.DC_MOTOR_ENCODER_DEFINITION, component); document.querySelector('#root').append(svg);
      const editor = new model.DcMotorEncoderEditor(component); const invalid = editor.setDetent(1000); const cw = editor.step('cw'); editor.undo(); editor.redo();
      return { renderer: svg.dataset.renderer, pins: [...svg.querySelectorAll('[data-terminal-pin]')].map((node) => node.dataset.terminalPin),
        marker: Boolean(svg.querySelector('[data-encoder-marker]')), invalid: invalid.code, detent: cw.component.controls.detent,
        persisted: model.DcMotorEncoderEditor.openText(editor.saveText()).ok,
        forbidden: model.DC_MOTOR_ENCODER_MODEL_ENTRY.forbiddenInferences };
    });
    assert(result.renderer === 'output-dc-motor-encoder', JSON.stringify(result)); assert(JSON.stringify(result.pins) === JSON.stringify(['M1','M2','EA','ECOM','EB']), JSON.stringify(result));
    assert(result.marker && result.invalid === 'DC_MOTOR_ENCODER_DETENT_RANGE' && result.detent === 3 && result.persisted, JSON.stringify(result));
    assert(result.forbidden.includes('pwm-to-encoder') && result.forbidden.includes('artwork-to-encoder'), JSON.stringify(result));
    process.stdout.write(`${JSON.stringify({ ok: true, component: 'CMP-069', result })}\n`);
  } finally { await browser.close(); server.close(); } })().catch((error) => { server.close(); console.error(error); process.exitCode = 1; });
