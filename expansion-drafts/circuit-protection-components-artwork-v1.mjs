// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { FUSE_TYPE, RESETTABLE_FUSE_PTC_TYPE,
  CIRCUIT_PROTECTION_DEFINITIONS } from './circuit-protection-components-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attrs = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== null) node.textContent = text;
  return node;
};
const line = (documentObject, x1, y1, x2, y2, extra = {}) => el(documentObject, 'line', {
  x1, y1, x2, y2, stroke: '#5ce1e6', 'stroke-width': 3, 'stroke-linecap': 'round', ...extra,
});
const terminal = (documentObject, id, x) => el(documentObject, 'circle', {
  cx: x, cy: 40, r: 3.5, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2,
  'data-terminal-pin': id,
});

export function createCircuitProtectionArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type
      || !CIRCUIT_PROTECTION_DEFINITIONS[component.type]) {
    throw new TypeError('CIRCUIT_PROTECTION_COMPONENT_ARTWORK');
  }
  const ptc = component.type === RESETTABLE_FUSE_PTC_TYPE;
  if (![FUSE_TYPE, RESETTABLE_FUSE_PTC_TYPE].includes(component.type)) {
    throw new TypeError('CIRCUIT_PROTECTION_COMPONENT_ARTWORK');
  }
  const svg = el(documentObject, 'svg', { viewBox: '0 0 160 80', role: 'img',
    'aria-label': `${component.label}, authoring only`,
    'data-artwork-key': definition.artwork.renderer, 'data-execution': 'authoring-only' });
  svg.append(el(documentObject, 'title', {}, `${component.label}, raw two-terminal authoring-only protection symbol`),
    terminal(documentObject, 'A', 8), terminal(documentObject, 'B', 152),
    line(documentObject, 12, 40, 42, 40), line(documentObject, 118, 40, 148, 40),
    el(documentObject, 'rect', { x: 42, y: 24, width: 76, height: 32, rx: ptc ? 12 : 3,
      fill: '#102535', stroke: '#ffbf47', 'stroke-width': 3 }),
    ptc
      ? el(documentObject, 'path', { d: 'M 51 40 H 62 L 68 31 L 78 49 L 88 31 L 98 49 L 108 40',
        fill: 'none', stroke: '#ffbf47', 'stroke-width': 3, 'stroke-linecap': 'round',
        'stroke-linejoin': 'round' })
      : line(documentObject, 49, 40, 111, 40, { stroke: '#ffbf47', 'stroke-width': 4 }),
    el(documentObject, 'text', { x: 80, y: 73, fill: '#cce7ef', 'font-size': 9,
      'text-anchor': 'middle' }, ptc ? 'PTC · RESETTABLE · A/B' : 'FUSE · A/B'));
  return svg;
}
