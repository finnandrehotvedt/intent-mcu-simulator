// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  TRAFFIC_LIGHT_DEFINITION,
  TRAFFIC_LIGHT_RENDERER,
} from './traffic-light-module-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createTrafficLightArtwork(
  documentObject,
  definition = TRAFFIC_LIGHT_DEFINITION,
  component = { id: 'traffic-light-preview', label: definition.displayName },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== TRAFFIC_LIGHT_RENDERER) {
    throw new TypeError('TRAFFIC_LIGHT_ARTWORK_CONTRACT');
  }
  const label = thumbnail
    ? `${definition.displayName}, ideal red amber green indicator`
    : `${component.label}, common-cathode traffic light; red, amber and green lamps are off; no physical light or road-signal compliance claimed`;
  const svg = element(documentObject, 'svg', {
    class: `traffic-light-artwork${thumbnail ? ' traffic-light-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': TRAFFIC_LIGHT_RENDERER,
    'data-red-on': 'false', 'data-amber-on': 'false', 'data-green-on': 'false',
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 21, y: 5, width: 78, height: 132, rx: 13, fill: '#181d21', stroke: '#a7b0b5', 'stroke-width': 2.5 }),
    element(documentObject, 'rect', { x: 28, y: 12, width: 64, height: 118, rx: 9, fill: '#090c0e', stroke: '#3b444a', 'stroke-width': 1.5 }),
    ...[
      ['RED', 38, '#5b161f', '#ff4057'],
      ['AMBER', 71, '#5f4d0d', '#ffd84d'],
      ['GREEN', 104, '#123f24', '#48ed7c'],
    ].flatMap(([channel, cy, fill, stroke]) => [
      element(documentObject, 'path', { d: `M31 ${cy - 8} Q60 ${cy - 28} 89 ${cy - 8}`, fill: '#222a2f', stroke: '#566169', 'stroke-width': 1 }),
      element(documentObject, 'circle', { cx: 60, cy, r: 19, class: 'traffic-light-lamp', 'data-traffic-channel': channel, fill, stroke, 'stroke-width': 2 }),
      element(documentObject, 'ellipse', { cx: 53, cy: cy - 7, rx: 5, ry: 7, fill: '#ffffff', opacity: 0.14 }),
    ]),
    element(documentObject, 'text', { x: 60, y: 151, fill: '#dbe6eb', 'font-size': 7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, 'TRAFFIC'),
    ...[
      ['RED', 17, '#ff8795'], ['AMBER', 46, '#ffe38a'], ['GREEN', 77, '#8ff0aa'], ['COM', 106, '#d9e4e5'],
    ].flatMap(([pin, x, fill]) => [
      element(documentObject, 'text', { x, y: 160, fill, 'font-size': 5.7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, pin),
      element(documentObject, 'line', { x1: x, y1: 164, x2: x, y2: 172, stroke: '#c9d2d4', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      element(documentObject, 'circle', { cx: x, cy: 172, r: 3.4, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.4, 'data-terminal-pin': pin }),
    ]),
  );
  return svg;
}
