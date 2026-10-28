// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { PASSIVE_PIEZO_DEFINITION, PASSIVE_PIEZO_RENDERER } from './passive-piezo-v1.mjs';
const NS = 'http://www.w3.org/2000/svg';
function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createPassivePiezoArtwork(documentObject, definition = PASSIVE_PIEZO_DEFINITION,
  component = { id: 'passive-piezo-preview', label: definition.displayName }, { thumbnail = false } = {}) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== PASSIVE_PIEZO_RENDERER) throw new TypeError('PASSIVE_PIEZO_ARTWORK_CONTRACT');
  const label = thumbnail ? `${definition.displayName}, visual transition observer`
    : `${component.label}, resting visual transition observer; no audio or calibrated frequency`;
  const svg = element(documentObject, 'svg', { class: `passive-piezo-artwork${thumbnail ? ' passive-piezo-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': PASSIVE_PIEZO_RENDERER, 'data-drive-state': 'rest', 'data-transition-active': 'false' });
  svg.append(element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 17, y: 8, width: 86, height: 65, rx: 10, fill: '#112833', stroke: '#48d6e8', 'stroke-width': 2 }),
    element(documentObject, 'circle', { cx: 60, cy: 39, r: 25, class: 'passive-piezo-disc', fill: '#19252c', stroke: '#91a9b2', 'stroke-width': 2 }),
    element(documentObject, 'circle', { cx: 60, cy: 39, r: 8, fill: '#293b44', stroke: '#6f8790', 'stroke-width': 1.5 }),
    element(documentObject, 'path', { d: 'M88 28 Q101 39 88 50', class: 'passive-piezo-transition', fill: 'none', stroke: '#f7d44a', 'stroke-width': 3, opacity: 0.15 }),
    element(documentObject, 'circle', { cx: 26, cy: 21, r: 3, class: 'passive-piezo-status', fill: '#53656d', stroke: '#91a7ae' }),
    ...[['SIGNAL', 41, '#f7d44a'], ['GND', 79, '#d9e4e5']].flatMap(([pin, x, color]) => [
      element(documentObject, 'text', { x, y: 81, fill: color, 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, pin),
      element(documentObject, 'line', { x1: x, y1: 83, x2: x, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      element(documentObject, 'circle', { cx: x, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': pin }),
    ]));
  return svg;
}
