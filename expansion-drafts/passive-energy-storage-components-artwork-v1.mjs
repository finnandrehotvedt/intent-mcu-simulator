// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { ELECTROLYTIC_CAPACITOR_TYPE, FIXED_INDUCTOR_TYPE,
  NONPOLAR_CAPACITOR_TYPE } from './passive-energy-storage-components-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attrs = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== null) node.textContent = text;
  return node;
};
const terminal = (documentObject, id, x) => el(documentObject, 'circle', {
  cx: x, cy: 40, r: 3.5, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2,
  'data-terminal-pin': id,
});
const line = (documentObject, x1, y1, x2, y2, extra = {}) => el(documentObject, 'line', {
  x1, y1, x2, y2, stroke: '#5ce1e6', 'stroke-width': 3, 'stroke-linecap': 'round', ...extra,
});

export function createPassiveEnergyStorageArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) {
    throw new TypeError('PASSIVE_ENERGY_STORAGE_ARTWORK');
  }
  const svg = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'aria-label': `${component.label}, authoring only`, 'data-artwork-key': definition.artwork.renderer,
    'data-execution': 'authoring-only' });
  svg.append(el(documentObject, 'title', {}, `${component.label}, raw two-terminal authoring-only component`));
  if (component.type === NONPOLAR_CAPACITOR_TYPE) {
    svg.append(terminal(documentObject, 'A', 8), terminal(documentObject, 'B', 122),
      line(documentObject, 12, 40, 54, 40), line(documentObject, 76, 40, 118, 40),
      line(documentObject, 56, 18, 56, 62, { stroke: '#ffbf47', 'stroke-width': 5 }),
      line(documentObject, 74, 18, 74, 62, { stroke: '#ffbf47', 'stroke-width': 5 }),
      el(documentObject, 'text', { x: 65, y: 76, fill: '#cce7ef', 'font-size': 9,
        'text-anchor': 'middle' }, `${component.properties.capacitanceFarads} F`));
  } else if (component.type === ELECTROLYTIC_CAPACITOR_TYPE) {
    svg.append(terminal(documentObject, 'POSITIVE', 8), terminal(documentObject, 'NEGATIVE', 122),
      line(documentObject, 12, 40, 54, 40), line(documentObject, 76, 40, 118, 40),
      line(documentObject, 56, 17, 56, 63, { stroke: '#ffbf47', 'stroke-width': 5 }),
      el(documentObject, 'path', { d: 'M75 17 Q88 40 75 63', fill: 'none', stroke: '#ffbf47', 'stroke-width': 5 }),
      el(documentObject, 'text', { x: 43, y: 20, fill: '#a8ff3f', 'font-size': 16,
        'font-weight': '700', 'text-anchor': 'middle' }, '+'),
      el(documentObject, 'text', { x: 65, y: 76, fill: '#cce7ef', 'font-size': 9,
        'text-anchor': 'middle' }, `${component.properties.capacitanceFarads} F`));
  } else if (component.type === FIXED_INDUCTOR_TYPE) {
    svg.append(terminal(documentObject, 'A', 8), terminal(documentObject, 'B', 122),
      line(documentObject, 12, 40, 31, 40), line(documentObject, 99, 40, 118, 40),
      el(documentObject, 'path', { d: 'M31 40 C31 18 48 18 48 40 C48 18 65 18 65 40 C65 18 82 18 82 40 C82 18 99 18 99 40',
        fill: 'none', stroke: '#ffbf47', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      el(documentObject, 'text', { x: 65, y: 76, fill: '#cce7ef', 'font-size': 9,
        'text-anchor': 'middle' }, `${component.properties.inductanceHenries} H`));
  } else throw new TypeError('PASSIVE_ENERGY_STORAGE_TYPE');
  return svg;
}
