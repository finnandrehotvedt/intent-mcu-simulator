// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  COMMON_CATHODE_RGB_LED_DEFINITION,
  COMMON_CATHODE_RGB_LED_RENDERER,
} from './common-cathode-rgb-led-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createCommonCathodeRgbLedArtwork(
  documentObject,
  definition = COMMON_CATHODE_RGB_LED_DEFINITION,
  component = { id: 'rgb-led-preview', label: definition.displayName },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== COMMON_CATHODE_RGB_LED_RENDERER) {
    throw new TypeError('RGB_LED_ARTWORK_CONTRACT');
  }
  const label = thumbnail
    ? `${definition.displayName}, idealized PWM indicator`
    : `${component.label}, common cathode RGB LED, commanded PWM mix red 0 percent, green 0 percent, blue 0 percent; no physical colour accuracy claimed`;
  const svg = element(documentObject, 'svg', {
    class: `rgb-led-artwork${thumbnail ? ' rgb-led-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': COMMON_CATHODE_RGB_LED_RENDERER,
    'data-r-duty': '0', 'data-g-duty': '0', 'data-b-duty': '0',
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'path', { d: 'M27 58 V36 A33 33 0 0 1 93 36 V58 Z', fill: '#dbe7e8', opacity: 0.72, stroke: '#f3ffff', 'stroke-width': 2 }),
    element(documentObject, 'path', { d: 'M31 58 V38 A29 29 0 0 1 89 38 V58 Z', fill: '#15232c', stroke: '#78909a', 'stroke-width': 1.5 }),
    element(documentObject, 'circle', { cx: 60, cy: 38, r: 19, class: 'rgb-led-mix', fill: '#26343d', stroke: '#d8e7e8', 'stroke-width': 1.6 }),
    element(documentObject, 'path', { d: 'M43 48 A19 19 0 0 1 49 23', class: 'rgb-led-channel rgb-red', 'data-rgb-channel': 'R', fill: 'none', stroke: '#ff4057', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.22 }),
    element(documentObject, 'path', { d: 'M50 22 A19 19 0 0 1 70 22', class: 'rgb-led-channel rgb-green', 'data-rgb-channel': 'G', fill: 'none', stroke: '#49e57b', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.22 }),
    element(documentObject, 'path', { d: 'M71 23 A19 19 0 0 1 77 48', class: 'rgb-led-channel rgb-blue', 'data-rgb-channel': 'B', fill: 'none', stroke: '#55a5ff', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.22 }),
    element(documentObject, 'path', { d: 'M45 25 C50 17 61 14 70 18', fill: 'none', stroke: '#ffffff', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.48 }),
    element(documentObject, 'path', { d: 'M27 58 H93', fill: 'none', stroke: '#d5e1e2', 'stroke-width': 2 }),
    element(documentObject, 'text', { x: 18, y: 76, fill: '#ff8d9b', 'font-size': 7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, 'R'),
    element(documentObject, 'text', { x: 46, y: 76, fill: '#80ee9e', 'font-size': 7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, 'G'),
    element(documentObject, 'text', { x: 74, y: 76, fill: '#8fc2ff', 'font-size': 7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, 'B'),
    element(documentObject, 'text', { x: 102, y: 76, fill: '#d9e4e5', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, 'COM'),
    ...[
      ['R', 18], ['G', 46], ['B', 74], ['COM', 102],
    ].flatMap(([pin, x]) => [
      element(documentObject, 'line', { x1: x, y1: 79, x2: x, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      element(documentObject, 'circle', { cx: x, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': pin }),
    ]),
  );
  return svg;
}
