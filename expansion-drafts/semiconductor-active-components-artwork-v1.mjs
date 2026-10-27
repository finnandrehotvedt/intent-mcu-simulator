// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { OPTOCOUPLER_TYPE, P_CHANNEL_MOSFET_TYPE,
  SEMICONDUCTOR_ACTIVE_DEFINITIONS } from './semiconductor-active-components-v1.mjs';

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
const terminal = (documentObject, id, x, y) => el(documentObject, 'circle', {
  cx: x, cy: y, r: 3.5, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2,
  'data-terminal-pin': id,
});

function pmosArtwork(documentObject, component) {
  const svg = el(documentObject, 'svg', { viewBox: '0 0 170 110', role: 'img',
    'aria-label': `${component.label}, authoring only`,
    'data-artwork-key': SEMICONDUCTOR_ACTIVE_DEFINITIONS[component.type].artwork.renderer,
    'data-execution': 'authoring-only' });
  svg.append(el(documentObject, 'title', {}, `${component.label}, raw three-terminal authoring-only MOSFET`),
    terminal(documentObject, 'GATE', 8, 52), terminal(documentObject, 'DRAIN', 162, 24),
    terminal(documentObject, 'SOURCE', 162, 82),
    el(documentObject, 'circle', { cx: 96, cy: 53, r: 37, fill: '#102535', stroke: '#35708b', 'stroke-width': 2 }),
    line(documentObject, 12, 52, 57, 52),
    el(documentObject, 'circle', { cx: 63, cy: 52, r: 6, fill: '#07111b', stroke: '#5ce1e6', 'stroke-width': 3 }),
    line(documentObject, 72, 31, 72, 75, { stroke: '#ffbf47', 'stroke-width': 5 }),
    line(documentObject, 72, 34, 120, 24, { stroke: '#ffbf47' }), line(documentObject, 120, 24, 158, 24),
    line(documentObject, 72, 72, 120, 82, { stroke: '#ffbf47' }), line(documentObject, 120, 82, 158, 82),
    line(documentObject, 72, 53, 108, 53, { stroke: '#ffbf47' }),
    el(documentObject, 'text', { x: 85, y: 106, fill: '#cce7ef', 'font-size': 9,
      'text-anchor': 'middle' }, 'P-MOS · D G S'));
  return svg;
}

function optocouplerArtwork(documentObject, component) {
  const svg = el(documentObject, 'svg', { viewBox: '0 0 170 110', role: 'img',
    'aria-label': `${component.label}, authoring only`,
    'data-artwork-key': SEMICONDUCTOR_ACTIVE_DEFINITIONS[component.type].artwork.renderer,
    'data-execution': 'authoring-only' });
  svg.append(el(documentObject, 'title', {}, `${component.label}, raw four-terminal authoring-only optocoupler`),
    terminal(documentObject, 'ANODE', 8, 25), terminal(documentObject, 'CATHODE', 8, 79),
    terminal(documentObject, 'COLLECTOR', 162, 25), terminal(documentObject, 'EMITTER', 162, 79),
    el(documentObject, 'rect', { x: 35, y: 10, width: 100, height: 84, rx: 10,
      fill: '#102535', stroke: '#35708b', 'stroke-width': 2, 'stroke-dasharray': '5 4' }),
    line(documentObject, 12, 25, 48, 25), line(documentObject, 12, 79, 48, 79),
    line(documentObject, 48, 18, 48, 34, { stroke: '#ffbf47', 'stroke-width': 4 }),
    el(documentObject, 'polygon', { points: '51,17 51,35 67,26', fill: '#172b3b',
      stroke: '#ffbf47', 'stroke-width': 3 }),
    line(documentObject, 67, 26, 67, 79, { stroke: '#ffbf47' }),
    line(documentObject, 105, 36, 105, 70, { stroke: '#ffbf47', 'stroke-width': 4 }),
    line(documentObject, 105, 42, 126, 25, { stroke: '#ffbf47' }), line(documentObject, 126, 25, 158, 25),
    line(documentObject, 105, 64, 126, 79, { stroke: '#ffbf47' }), line(documentObject, 126, 79, 158, 79),
    line(documentObject, 76, 34, 94, 43, { stroke: '#a8ff3f', 'stroke-width': 2 }),
    line(documentObject, 76, 48, 94, 57, { stroke: '#a8ff3f', 'stroke-width': 2 }),
    el(documentObject, 'text', { x: 85, y: 106, fill: '#cce7ef', 'font-size': 9,
      'text-anchor': 'middle' }, 'LED → phototransistor'));
  return svg;
}

export function createSemiconductorActiveArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type
      || !SEMICONDUCTOR_ACTIVE_DEFINITIONS[component.type]) {
    throw new TypeError('SEMICONDUCTOR_ACTIVE_COMPONENT_ARTWORK');
  }
  if (component.type === P_CHANNEL_MOSFET_TYPE) return pmosArtwork(documentObject, component);
  if (component.type === OPTOCOUPLER_TYPE) return optocouplerArtwork(documentObject, component);
  throw new TypeError('SEMICONDUCTOR_ACTIVE_COMPONENT_ARTWORK');
}

