// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

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

function resistor(svg, definition, component) {
  append(svg,
    element('line', { x1: 4, y1: 24, x2: 43, y2: 24, class: 'metal-lead' }),
    element('line', { x1: 107, y1: 24, x2: 146, y2: 24, class: 'metal-lead' }),
    element('path', { d: 'M 40 16 Q 44 10 52 10 H 98 Q 106 10 110 16 V 32 Q 106 38 98 38 H 52 Q 44 38 40 32 Z', class: 'resistor-body' }),
  );
  resistorBands(component.properties.ohms).forEach((color, index) => {
    svg.append(element('rect', { x: 55 + index * 13, y: 11, width: 5, height: 26, rx: 1, fill: color }));
  });
  drawTerminals(svg, definition, 2.8);
}

function led(svg, definition, component) {
  const color = component.properties.color;
  append(svg,
    element('line', { x1: 27, y1: 55, x2: 27, y2: 94, class: 'metal-lead' }),
    element('line', { x1: 46, y1: 57, x2: 46, y2: 94, class: 'metal-lead' }),
    element('path', { d: 'M 18 53 V 35 A 18 18 0 0 1 54 35 V 53 Z', class: `component-led ${color}`, 'data-led-id': component.id, role: 'img', 'aria-label': `${component.label} is off` }),
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

const renderers = Object.freeze({
  'board-atmega328p': board,
  'resistor-axial': resistor,
  'led-through-hole': led,
  'button-tactile': button,
  'potentiometer-rotary': potentiometer,
});

export function createComponentArtwork(definition, component, { thumbnail = false } = {}) {
  const svg = element('svg', {
    class: `component-artwork${thumbnail ? ' catalog-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '),
    role: 'img', 'aria-label': thumbnail ? definition.displayName : `${component.label}, ${definition.displayName}`,
    'data-artwork-key': definition.artwork.renderer,
  });
  svg.append(element('title', {}, thumbnail ? definition.displayName : component.label));
  const renderer = renderers[definition.artwork.renderer];
  if (!renderer) throw new Error(`Unknown artwork renderer: ${definition.artwork.renderer}`);
  renderer(svg, definition, component);
  return svg;
}
