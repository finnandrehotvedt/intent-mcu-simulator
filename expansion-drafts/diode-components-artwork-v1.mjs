// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { DIODE_COMPONENT_DEFINITIONS, SCHOTTKY_DIODE_TYPE,
  SILICON_DIODE_TYPE, ZENER_DIODE_TYPE } from './diode-components-v1.mjs';

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
const path = (documentObject, d, extra = {}) => el(documentObject, 'path', {
  d, fill: 'none', stroke: '#ffbf47', 'stroke-width': 4, 'stroke-linecap': 'round',
  'stroke-linejoin': 'round', ...extra,
});

export function createDiodeArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type
      || !DIODE_COMPONENT_DEFINITIONS[component.type]) throw new TypeError('DIODE_COMPONENT_ARTWORK');
  const svg = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'aria-label': `${component.label}, authoring only`, 'data-artwork-key': definition.artwork.renderer,
    'data-execution': 'authoring-only' });
  svg.append(el(documentObject, 'title', {}, `${component.label}, raw two-terminal authoring-only diode`),
    terminal(documentObject, 'ANODE', 8), terminal(documentObject, 'CATHODE', 142),
    line(documentObject, 12, 40, 53, 40), line(documentObject, 97, 40, 138, 40),
    el(documentObject, 'polygon', { points: '54,18 54,62 91,40', fill: '#172b3b',
      stroke: '#ffbf47', 'stroke-width': 4, 'stroke-linejoin': 'round' }));
  if (component.type === SILICON_DIODE_TYPE) {
    svg.append(line(documentObject, 94, 17, 94, 63, { stroke: '#ffbf47', 'stroke-width': 5 }));
  } else if (component.type === SCHOTTKY_DIODE_TYPE) {
    svg.append(path(documentObject, 'M94 17 L94 27 L102 27 M94 53 L86 53 L86 63'));
  } else if (component.type === ZENER_DIODE_TYPE) {
    svg.append(path(documentObject, 'M86 18 L96 24 L96 56 L104 62'));
  }
  const value = component.type === ZENER_DIODE_TYPE
    ? `${component.properties.zenerVoltageVolts} V Zener`
    : `${component.properties.nominalForwardVoltageVolts} V nominal`;
  svg.append(el(documentObject, 'text', { x: 75, y: 82, fill: '#cce7ef', 'font-size': 9,
    'text-anchor': 'middle' }, value));
  return svg;
}
