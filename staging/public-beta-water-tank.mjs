// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const PROJECT_PATH = './examples/exact-visuino-water-tank.intent-mcu.json';
const PROJECT_BYTES = 57410;
const PROJECT_SHA256 = '9e7fe28d34e76bf4eb7c9710f5bd8e0db7be1b74f22a615ddd9d16771ee0af6b';
const PROJECT_NAME = 'Exact Visuino water-tank controller';
const CARD_ID = 'avr-visuino-water-tank-public-beta';

const toHex = (bytes) => [...new Uint8Array(bytes)]
  .map((value) => value.toString(16).padStart(2, '0')).join('');

async function waitForWorkbench() {
  while (window.__M11_READY__ !== true) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

function setStatus(message) {
  const status = document.querySelector('#beginner-status');
  if (status) status.textContent = message;
}

async function openPublicBetaProject(trigger) {
  const controls = [...document.querySelectorAll('[data-public-beta-water-tank-action]')];
  for (const control of controls) control.disabled = true;
  setStatus('Checking the exact water-tank public-beta project…');
  try {
    const response = await fetch(PROJECT_PATH, {
      cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== PROJECT_BYTES) throw new Error('byte count changed');
    const digest = toHex(await crypto.subtle.digest('SHA-256', bytes));
    if (digest !== PROJECT_SHA256) throw new Error('SHA-256 changed');

    const input = document.querySelector('#project-open-input');
    if (!input) throw new Error('project file input unavailable');
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'exact-visuino-water-tank.intent-mcu.json', {
      type: 'application/json', lastModified: 0,
    }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    setStatus('Water-tank public beta checked and opened as data only · Build fresh before Run.');

    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (window.__M6_PROJECT__?.()?.project?.metadata?.name === PROJECT_NAME) {
        const dialog = document.querySelector('#example-picker-dialog');
        if (dialog?.open) dialog.close('opened-public-beta');
        document.querySelector('#active-canvas-stage')?.scrollIntoView({
          behavior: 'smooth', block: 'nearest',
        });
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } catch (error) {
    setStatus(`Water-tank example unavailable (${error.message}). The current project was kept unchanged.`);
    trigger?.focus();
  } finally {
    for (const control of controls) control.disabled = false;
  }
}

function createPickerCard() {
  const card = document.createElement('article');
  card.className = 'starter-card';
  card.dataset.example = CARD_ID;
  card.innerHTML = `
    <span class="starter-visual" aria-hidden="true"></span>
    <span class="starter-meta"><span class="starter-focus">Compiled control + visible five-state demo</span><span class="starter-difficulty">Public beta</span></span>
    <strong>Exact water-tank controller</strong>
    <span class="starter-description">Open the tested AVR public-beta project with tank level, AUTO/MANUAL, source interlock, pump/alarm LEDs and a 20×4 LCD.</span>
    <span class="starter-parts">ATmega328P · three switches · ADC · LEDs · I2C LCD</span>
    <span class="starter-outcome">Build once, Run, then reproduce the five visible video states.</span>
    <button type="button" class="starter-action" data-public-beta-water-tank-action aria-label="Open Exact water-tank controller: Compiled control and visible five-state demo">Open</button>`;
  card.querySelector('button').addEventListener('click', (event) => {
    void openPublicBetaProject(event.currentTarget);
  });
  return card;
}

await waitForWorkbench();
setStatus('Public beta · open the tested water-tank controller, or run the working LED example.');
const direct = document.querySelector('#beginner-water-tank');
direct?.setAttribute('data-public-beta-water-tank-action', '');
direct?.addEventListener('click', (event) => { void openPublicBetaProject(event.currentTarget); });
const gallery = document.querySelector('#starter-examples');
if (gallery && !gallery.querySelector(`[data-example="${CARD_ID}"]`)) {
  gallery.insertBefore(createPickerCard(), gallery.children[1] ?? null);
}
