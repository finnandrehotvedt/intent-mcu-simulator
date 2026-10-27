// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { NPN_BJT_TYPE, PNP_BJT_TYPE, N_CHANNEL_MOSFET_TYPE,
  TRANSISTOR_COMPONENT_DEFINITIONS } from './transistor-components-v1.mjs';

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
const marker = (documentObject, id, reverse = false) => {
  const node = el(documentObject, 'marker', { id, viewBox: '0 0 10 10', refX: reverse ? 1 : 9,
    refY: 5, markerWidth: 6, markerHeight: 6, orient: reverse ? 'auto-start-reverse' : 'auto' });
  node.append(el(documentObject, 'path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#ffbf47' }));
  return node;
};

function bjtArtwork(documentObject, component) {
  const svg = el(documentObject, 'svg', { viewBox: '0 0 160 104', role: 'img',
    'aria-label': `${component.label}, authoring only`,
    'data-artwork-key': TRANSISTOR_COMPONENT_DEFINITIONS[component.type].artwork.renderer,
    'data-execution': 'authoring-only' });
  const defs = el(documentObject, 'defs'); defs.append(marker(documentObject, 'bjt-arrow'));
  svg.append(defs, el(documentObject, 'title', {}, `${component.label}, raw three-terminal authoring-only transistor`),
    terminal(documentObject, 'BASE', 8, 52), terminal(documentObject, 'COLLECTOR', 152, 22),
    terminal(documentObject, 'EMITTER', 152, 82),
    el(documentObject, 'circle', { cx: 91, cy: 52, r: 35, fill: '#102535', stroke: '#35708b', 'stroke-width': 2 }),
    line(documentObject, 12, 52, 65, 52), line(documentObject, 67, 30, 67, 74, { stroke: '#ffbf47', 'stroke-width': 5 }),
    line(documentObject, 67, 39, 113, 22, { stroke: '#ffbf47' }), line(documentObject, 113, 22, 148, 22),
    line(documentObject, 67, 65, 113, 82, { stroke: '#ffbf47' }), line(documentObject, 113, 82, 148, 82));
  const arrow = component.type === NPN_BJT_TYPE
    ? line(documentObject, 92, 74, 111, 81, { stroke: '#ffbf47', 'marker-end': 'url(#bjt-arrow)' })
    : line(documentObject, 111, 81, 91, 73, { stroke: '#ffbf47', 'marker-end': 'url(#bjt-arrow)' });
  svg.append(arrow, el(documentObject, 'text', { x: 80, y: 101, fill: '#cce7ef', 'font-size': 9,
    'text-anchor': 'middle' }, component.type === NPN_BJT_TYPE ? 'NPN · C B E' : 'PNP · C B E'));
  return svg;
}

function mosfetArtwork(documentObject, component) {
  const svg = el(documentObject, 'svg', { viewBox: '0 0 160 104', role: 'img',
    'aria-label': `${component.label}, authoring only`,
    'data-artwork-key': TRANSISTOR_COMPONENT_DEFINITIONS[component.type].artwork.renderer,
    'data-execution': 'authoring-only' });
  svg.append(el(documentObject, 'title', {}, `${component.label}, raw three-terminal authoring-only MOSFET`),
    terminal(documentObject, 'GATE', 8, 52), terminal(documentObject, 'DRAIN', 152, 22),
    terminal(documentObject, 'SOURCE', 152, 82),
    el(documentObject, 'circle', { cx: 91, cy: 52, r: 35, fill: '#102535', stroke: '#35708b', 'stroke-width': 2 }),
    line(documentObject, 12, 52, 57, 52), line(documentObject, 61, 30, 61, 74, { stroke: '#5ce1e6', 'stroke-width': 5 }),
    line(documentObject, 73, 32, 73, 72, { stroke: '#ffbf47', 'stroke-width': 5 }),
    line(documentObject, 73, 34, 113, 22, { stroke: '#ffbf47' }), line(documentObject, 113, 22, 148, 22),
    line(documentObject, 73, 70, 113, 82, { stroke: '#ffbf47' }), line(documentObject, 113, 82, 148, 82),
    line(documentObject, 73, 52, 105, 52, { stroke: '#ffbf47' }),
    el(documentObject, 'text', { x: 80, y: 101, fill: '#cce7ef', 'font-size': 9,
      'text-anchor': 'middle' }, 'N-MOS · D G S'));
  return svg;
}

export function createTransistorArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type
      || !TRANSISTOR_COMPONENT_DEFINITIONS[component.type]) {
    throw new TypeError('TRANSISTOR_COMPONENT_ARTWORK');
  }
  if (component.type === N_CHANNEL_MOSFET_TYPE) return mosfetArtwork(documentObject, component);
  if ([NPN_BJT_TYPE, PNP_BJT_TYPE].includes(component.type)) return bjtArtwork(documentObject, component);
  throw new TypeError('TRANSISTOR_COMPONENT_ARTWORK');
}

