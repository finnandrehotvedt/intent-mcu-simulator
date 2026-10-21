// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { ARTWORK_RENDERER_IDS } from '../src/component-catalog.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(name, attributes = {}, text = null) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

function append(parent, ...children) { parent.append(...children); return parent; }

const palette = Object.freeze({
  black: '#17191c', brown: '#7a3d1d', red: '#d33b35', orange: '#e77c24', yellow: '#e6c83c',
  green: '#3f9a55', blue: '#346cc7', violet: '#7c4cac', grey: '#818991', white: '#e7e8df', gold: '#d4a72c',
});

function resistorBands(ohms) {
  const value = Math.max(1, Math.round(Number(ohms) || 220));
  const exponent = Math.max(0, Math.floor(Math.log10(value)) - 1);
  const leading = Math.round(value / (10 ** exponent));
  const digits = [Math.floor(leading / 10) % 10, leading % 10, exponent];
  const names = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
  return [...digits.map((digit) => palette[names[Math.min(9, digit)]]), palette.gold];
}

function drawTerminals(svg, definition, radius = 2.2) {
  const [, , width, height] = definition.artwork.viewBox;
  for (const pin of definition.pins) {
    svg.append(element('circle', {
      class: 'art-terminal', 'data-terminal-pin': pin.id,
      cx: pin.anchor.x * width, cy: pin.anchor.y * height, r: radius,
    }));
  }
}

function board(svg, definition) {
  append(svg,
    element('rect', { x: 5, y: 4, width: 150, height: 72, rx: 7, class: 'board-pcb' }),
    element('rect', { x: 7, y: 24, width: 31, height: 28, rx: 3, class: 'board-usb' }),
    element('rect', { x: 43, y: 31, width: 54, height: 19, rx: 2, class: 'board-chip' }),
    element('rect', { x: 112, y: 26, width: 27, height: 29, rx: 3, class: 'board-module' }),
    element('circle', { cx: 147, cy: 63, r: 7, class: 'board-jack' }),
    element('ellipse', { cx: 83, cy: 58, rx: 12, ry: 5, class: 'board-crystal' }),
  );
  for (const [x, y] of [[13, 12], [147, 12], [13, 68], [147, 68]]) {
    svg.append(element('circle', { cx: x, cy: y, r: 3.2, class: 'mount-hole' }));
  }
  for (let index = 0; index < 7; index += 1) {
    svg.append(element('path', { d: `M ${52 + index * 8} 29 V 23 H ${107 + index * 3}`, class: 'board-trace' }));
  }
  drawTerminals(svg, definition, 1.9);
}

function rp2040PicoBoard(svg, definition) {
  append(svg,
    element('rect', { x: 13, y: 5, width: 106, height: 290, rx: 24, class: 'pico-board-pcb' }),
    element('rect', { x: 46, y: 4, width: 40, height: 30, rx: 5, class: 'pico-board-usb' }),
    element('rect', { x: 37, y: 99, width: 58, height: 58, rx: 6, class: 'pico-board-chip' }),
    element('rect', { x: 43, y: 196, width: 46, height: 24, rx: 4, class: 'pico-board-flash' }),
    element('circle', { cx: 66, cy: 68, r: 5, class: 'pico-board-led' }),
    element('text', { x: 66, y: 84, class: 'pico-board-led-label', 'text-anchor': 'middle' }, 'GPIO25 · ONBOARD'),
    element('text', { x: 66, y: 247, class: 'pico-board-title', 'text-anchor': 'middle' }, 'RP2040'),
    element('text', { x: 66, y: 263, class: 'pico-board-subtitle', 'text-anchor': 'middle' }, '3.3 V · PUBLIC SUBSET'),
    element('text', { x: 21, y: 25, class: 'pico-board-pin-label' }, '1 · GP0'),
    element('text', { x: 21, y: 61, class: 'pico-board-pin-label' }, '3 · GND'),
  );
  for (let row = 0; row < 20; row += 1) {
    const y = 27 + row * 13;
    svg.append(element('circle', { cx: 8, cy: y, r: 3.3, class: [0, 2].includes(row) ? 'pico-board-pin proven' : 'pico-board-pin' }));
    svg.append(element('circle', { cx: 124, cy: y, r: 3.3, class: 'pico-board-pin' }));
  }
  for (let index = 0; index < 8; index += 1) {
    svg.append(element('path', { d: `M 42 ${171 + index * 7} H ${90 - index * 2}`, class: 'board-trace' }));
  }
  drawTerminals(svg, definition, 3.1);
}

function esp32C3Board(svg, definition) {
  append(svg,
    element('rect', { x: 12, y: 5, width: 136, height: 210, rx: 18, class: 'c3-editor-board-pcb' }),
    element('rect', { x: 52, y: 3, width: 56, height: 28, rx: 5, class: 'c3-editor-board-usb' }),
    element('rect', { x: 44, y: 67, width: 72, height: 56, rx: 7, class: 'c3-editor-board-chip' }),
    element('rect', { x: 37, y: 137, width: 86, height: 30, rx: 5, class: 'c3-editor-board-module' }),
    element('text', { x: 80, y: 190, class: 'c3-editor-board-title', 'text-anchor': 'middle' }, 'ESP32-C3'),
    element('text', { x: 80, y: 204, class: 'c3-editor-board-subtitle', 'text-anchor': 'middle' }, 'PROJECT GPIO2 MODEL'),
    element('text', { x: 145, y: 48, class: 'c3-editor-board-pin-label', 'text-anchor': 'end' }, 'J1·4 GPIO2'),
    element('text', { x: 145, y: 158, class: 'c3-editor-board-pin-label', 'text-anchor': 'end' }, 'J1·6 GND'),
  );
  for (let row = 0; row < 12; row += 1) {
    const y = 28 + row * 15;
    svg.append(element('circle', { cx: 8, cy: y, r: 3.2, class: 'c3-editor-board-pin' }));
    svg.append(element('circle', { cx: 152, cy: y, r: 3.2, class: [2, 9].includes(row) ? 'c3-editor-board-pin proven' : 'c3-editor-board-pin' }));
  }
  for (let index = 0; index < 7; index += 1) {
    svg.append(element('path', { d: `M 39 ${42 + index * 13} H ${121 - index * 4}`, class: 'board-trace' }));
  }
  drawTerminals(svg, definition, 3.2);
}

function stm32F429ziBoard(svg, definition) {
  append(svg,
    element('rect', { x: 13, y: 5, width: 164, height: 220, rx: 18, class: 'stm32-editor-board-pcb' }),
    element('rect', { x: 20, y: 72, width: 38, height: 62, rx: 5, class: 'stm32-editor-board-module' }),
    element('rect', { x: 75, y: 70, width: 65, height: 64, rx: 6, class: 'stm32-editor-board-chip' }),
    element('rect', { x: 61, y: 8, width: 68, height: 27, rx: 4, class: 'stm32-editor-board-usb' }),
    element('text', { x: 107, y: 98, class: 'stm32-editor-board-chip-label', 'text-anchor': 'middle' }, 'F429ZI'),
    element('text', { x: 95, y: 174, class: 'stm32-editor-board-title', 'text-anchor': 'middle' }, 'STM32F429ZI'),
    element('text', { x: 95, y: 190, class: 'stm32-editor-board-subtitle', 'text-anchor': 'middle' }, 'ACTUAL RENODE PB0'),
    element('text', { x: 174, y: 64, class: 'stm32-editor-board-pin-label', 'text-anchor': 'end' }, 'CN11·34 PB0'),
    element('text', { x: 174, y: 160, class: 'stm32-editor-board-pin-label', 'text-anchor': 'end' }, 'CN11·35 GND'),
  );
  for (let row = 0; row < 14; row += 1) {
    const y = 29 + row * 14;
    svg.append(element('circle', { cx: 8, cy: y, r: 3.1, class: 'stm32-editor-board-pin' }));
    svg.append(element('circle', { cx: 182, cy: y, r: 3.1,
      class: [3, 10].includes(row) ? 'stm32-editor-board-pin proven' : 'stm32-editor-board-pin' }));
  }
  for (let index = 0; index < 8; index += 1) {
    svg.append(element('path', { d: `M 61 ${43 + index * 14} H ${145 - index * 3}`, class: 'board-trace' }));
  }
  drawTerminals(svg, definition, 3.3);
}

function resistor(svg, definition, component, { appearancePreset = 'standard-beige' } = {}) {
  const preset = appearancePreset === 'cool-blue' ? 'cool-blue' : 'standard-beige';
  append(svg,
    element('line', { x1: 4, y1: 24, x2: 43, y2: 24, class: 'metal-lead' }),
    element('line', { x1: 107, y1: 24, x2: 146, y2: 24, class: 'metal-lead' }),
    element('path', { d: 'M 40 16 Q 44 10 52 10 H 98 Q 106 10 110 16 V 32 Q 106 38 98 38 H 52 Q 44 38 40 32 Z', class: `resistor-body appearance-${preset}` }),
  );
  resistorBands(component.properties.ohms).forEach((color, index) => {
    svg.append(element('rect', { x: 55 + index * 13, y: 11, width: 5, height: 26, rx: 1, fill: color }));
  });
  drawTerminals(svg, definition, 2.8);
}

function led(svg, definition, component, { appearancePreset = 'round-5mm' } = {}) {
  const color = component.properties.color;
  const outline = appearancePreset === 'soft-square'
    ? 'M 17 53 V 29 Q 17 17 29 17 H 43 Q 55 17 55 29 V 53 Z'
    : 'M 18 53 V 35 A 18 18 0 0 1 54 35 V 53 Z';
  append(svg,
    element('line', { x1: 27, y1: 55, x2: 27, y2: 94, class: 'metal-lead' }),
    element('line', { x1: 46, y1: 57, x2: 46, y2: 94, class: 'metal-lead' }),
    element('path', { d: outline, class: `component-led ${color} appearance-${appearancePreset}`, 'data-led-id': component.id, role: 'img', 'aria-label': `${component.label} is off` }),
    element('path', { d: 'M 20 52 H 54', class: 'led-rim' }),
    element('path', { d: 'M 47 35 V 48', class: 'led-cathode-flat' }),
    element('ellipse', { cx: 30, cy: 30, rx: 5, ry: 8, class: 'led-highlight' }),
  );
  drawTerminals(svg, definition, 3);
}

function button(svg, definition) {
  append(svg,
    element('line', { x1: 8, y1: 20, x2: 8, y2: 58, class: 'metal-lead' }),
    element('line', { x1: 92, y1: 20, x2: 92, y2: 58, class: 'metal-lead' }),
    element('line', { x1: 18, y1: 15, x2: 18, y2: 63, class: 'switch-common' }),
    element('line', { x1: 82, y1: 15, x2: 82, y2: 63, class: 'switch-common' }),
    element('rect', { x: 17, y: 10, width: 66, height: 58, rx: 7, class: 'button-body' }),
    element('rect', { x: 27, y: 19, width: 46, height: 40, rx: 7, class: 'button-frame' }),
    element('circle', { cx: 50, cy: 39, r: 15, class: 'button-cap' }),
  );
  for (const [x, y, label] of [[8, 20, 'A1'], [8, 58, 'A2'], [92, 20, 'B1'], [92, 58, 'B2']]) {
    svg.append(element('circle', { cx: x, cy: y, r: 2.2, class: 'art-terminal-secondary', 'data-physical-terminal': label }));
  }
  drawTerminals(svg, definition, 3);
}

function potentiometer(svg, definition) {
  append(svg,
    element('rect', { x: 18, y: 30, width: 74, height: 52, rx: 8, class: 'pot-body' }),
    element('circle', { cx: 55, cy: 45, r: 31, class: 'pot-case' }),
    element('circle', { cx: 55, cy: 45, r: 18, class: 'pot-shaft' }),
    element('line', { x1: 55, y1: 45, x2: 65, y2: 34, class: 'pot-index' }),
    element('line', { x1: 21, y1: 79, x2: 21, y2: 94, class: 'metal-lead' }),
    element('line', { x1: 55, y1: 78, x2: 55, y2: 98, class: 'metal-lead' }),
    element('line', { x1: 89, y1: 79, x2: 89, y2: 94, class: 'metal-lead' }),
  );
  drawTerminals(svg, definition, 3);
}

function serialInstrument(svg) {
  append(svg,
    element('rect', { x: 4, y: 5, width: 92, height: 50, rx: 6, class: 'board-module' }),
    element('rect', { x: 12, y: 13, width: 76, height: 25, rx: 3, class: 'board-chip' }),
    element('circle', { cx: 18, cy: 47, r: 3, fill: '#a8ff3f' }),
    element('line', { x1: 27, y1: 47, x2: 84, y2: 47, class: 'board-trace' }),
  );
}

const renderers = Object.freeze({
  'board-atmega328p': board,
  'board-rp2040-pico': rp2040PicoBoard,
  'board-esp32-c3-profile': esp32C3Board,
  'board-stm32f429zi-profile': stm32F429ziBoard,
  'resistor-axial': resistor,
  'led-through-hole': led,
  'button-tactile': button,
  'potentiometer-rotary': potentiometer,
  'instrument-serial': serialInstrument,
});

export const COMPONENT_ARTWORK_RENDERER_IDS = Object.freeze(Object.keys(renderers));
if (JSON.stringify(COMPONENT_ARTWORK_RENDERER_IDS) !== JSON.stringify(ARTWORK_RENDERER_IDS)) {
  throw new Error('Artwork renderer registry does not match the component catalogue contract.');
}

export function createComponentArtwork(definition, component, options = {}) {
  const { thumbnail = false, appearancePreset } = options;
  const svg = element('svg', {
    class: `component-artwork${thumbnail ? ' catalog-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '),
    role: 'img', 'aria-label': thumbnail ? definition.displayName : `${component.label}, ${definition.displayName}`,
    'data-artwork-key': definition.artwork.renderer,
  });
  svg.append(element('title', {}, thumbnail ? definition.displayName : component.label));
  const renderer = renderers[definition.artwork.renderer];
  if (!renderer) throw new Error(`Unknown artwork renderer: ${definition.artwork.renderer}`);
  renderer(svg, definition, component, { appearancePreset });
  return svg;
}
