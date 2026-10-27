// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { MINI_BREADBOARD_TYPE, TERMINAL_BLOCK_2_POSITION_TYPE,
  CONNECTION_HARDWARE_DEFINITIONS } from './connection-hardware-components-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attrs = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== null) node.textContent = text;
  return node;
};
const wireHandle = (documentObject, id, x, y) => el(documentObject, 'circle', {
  cx: x, cy: y, r: 4, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2,
  'data-terminal-pin': id,
});
const contact = (documentObject, id, x, y, radius = 3) => el(documentObject, 'circle', {
  cx: x, cy: y, r: radius, fill: '#07111b', stroke: '#7c9bab', 'stroke-width': 1.5,
  'data-contact-terminal': id,
});

function createBreadboard(documentObject, definition, component) {
  const svg = el(documentObject, 'svg', { viewBox: '0 0 240 130', role: 'img',
    'aria-label': component.label + ', authoring only',
    'data-artwork-key': definition.artwork.renderer, 'data-execution': 'authoring-only' });
  svg.append(el(documentObject, 'title', {},
    'Four-row mini breadboard: A–E and F–J are separate five-contact groups across the centre gap'),
  el(documentObject, 'rect', { x: 8, y: 7, width: 224, height: 116, rx: 9,
    fill: '#e8edf0', stroke: '#5ce1e6', 'stroke-width': 2 }),
  el(documentObject, 'rect', { x: 112, y: 14, width: 16, height: 102, rx: 3,
    fill: '#9eacb4' }),
  el(documentObject, 'text', { x: 120, y: 126, fill: '#cce7ef', 'font-size': 8,
    'text-anchor': 'middle' }, '8 × 5-CONTACT GROUPS · NO RAILS'));
  const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const xs = [34, 49, 64, 79, 94, 146, 161, 176, 191, 206];
  columns.forEach((column, index) => svg.append(el(documentObject, 'text', {
    x: xs[index], y: 17, fill: '#102535', 'font-size': 8, 'text-anchor': 'middle',
  }, column)));
  for (let row = 1; row <= 4; row += 1) {
    const y = 29 + (row - 1) * 25;
    svg.append(el(documentObject, 'text', { x: 19, y: y + 3, fill: '#102535',
      'font-size': 8, 'text-anchor': 'middle' }, String(row)));
    columns.forEach((column, index) => svg.append(contact(documentObject,
      column + row, xs[index], y)));
    svg.append(wireHandle(documentObject, 'L' + row, 6, y),
      wireHandle(documentObject, 'R' + row, 234, y));
  }
  return svg;
}

function createTerminalBlock(documentObject, definition, component) {
  const svg = el(documentObject, 'svg', { viewBox: '0 0 150 100', role: 'img',
    'aria-label': component.label + ', authoring only',
    'data-artwork-key': definition.artwork.renderer, 'data-execution': 'authoring-only' });
  svg.append(el(documentObject, 'title', {},
    'Two-position feed-through terminal block: wire clamp and PCB leg are common only within each pole'),
  el(documentObject, 'rect', { x: 7, y: 8, width: 136, height: 82, rx: 8,
    fill: '#17472f', stroke: '#5ce1e6', 'stroke-width': 2 }),
  el(documentObject, 'line', { x1: 75, y1: 10, x2: 75, y2: 88,
    stroke: '#07111b', 'stroke-width': 4 }));
  for (const [index, x] of [38, 112].entries()) {
    const pole = index + 1;
    svg.append(
      el(documentObject, 'circle', { cx: x, cy: 39, r: 20, fill: '#0f2d22',
        stroke: '#ffbf47', 'stroke-width': 3 }),
      el(documentObject, 'path', { d: 'M ' + (x - 10) + ' 39 H ' + (x + 10) + ' M ' + x + ' 29 V 49',
        stroke: '#cce7ef', 'stroke-width': 3, 'stroke-linecap': 'round' }),
      contact(documentObject, 'P' + pole + '-WIRE', x, 16, 3.5),
      contact(documentObject, 'P' + pole + '-PCB', x, 78, 3.5),
      wireHandle(documentObject, 'P' + pole, x, 93),
      el(documentObject, 'text', { x, y: 70, fill: '#cce7ef', 'font-size': 9,
        'text-anchor': 'middle' }, 'P' + pole),
    );
  }
  return svg;
}

export function createConnectionHardwareArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type
      || !CONNECTION_HARDWARE_DEFINITIONS[component.type]) {
    throw new TypeError('CONNECTION_HARDWARE_COMPONENT_ARTWORK');
  }
  if (component.type === MINI_BREADBOARD_TYPE) {
    return createBreadboard(documentObject, definition, component);
  }
  if (component.type === TERMINAL_BLOCK_2_POSITION_TYPE) {
    return createTerminalBlock(documentObject, definition, component);
  }
  throw new TypeError('CONNECTION_HARDWARE_COMPONENT_ARTWORK');
}
