// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  SEVEN_SEGMENT_DEFINITION,
  SEVEN_SEGMENT_RENDERER,
} from './seven-segment-common-cathode-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

const SEGMENT_PATHS = Object.freeze({
  a: 'M52 14 L61 8 H99 L107 14 L99 20 H61 Z',
  b: 'M109 17 L115 23 V39 L108 46 L102 39 V24 Z',
  c: 'M108 49 L115 56 V72 L109 79 L102 72 V56 Z',
  d: 'M52 82 L61 76 H99 L107 82 L99 88 H61 Z',
  e: 'M48 49 L55 56 V72 L48 79 L41 72 V56 Z',
  f: 'M48 17 L55 24 V39 L48 46 L41 39 V23 Z',
  g: 'M52 47 L60 41 H99 L107 47 L99 53 H60 Z',
});

export function createSevenSegmentArtwork(
  documentObject,
  definition = SEVEN_SEGMENT_DEFINITION,
  component = { id: 'seven-segment-preview', label: definition.displayName },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== SEVEN_SEGMENT_RENDERER) {
    throw new TypeError('SEVEN_SEGMENT_ARTWORK_CONTRACT');
  }
  const label = thumbnail
    ? `${definition.displayName}, idealized seven-channel indicator`
    : `${component.label}, blank common-cathode seven-segment display; commanded segment state only, no physical brightness or package-current accuracy claimed`;
  const svg = element(documentObject, 'svg', {
    class: `seven-segment-artwork${thumbnail ? ' seven-segment-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': SEVEN_SEGMENT_RENDERER,
    'data-active-segments': '',
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 31, y: 2, width: 96, height: 91, rx: 10, fill: '#161d24', stroke: '#71828d', 'stroke-width': 2 }),
    element(documentObject, 'rect', { x: 35, y: 5, width: 88, height: 85, rx: 7, fill: '#090d12', stroke: '#293741', 'stroke-width': 1.2 }),
    ...Object.entries(SEGMENT_PATHS).map(([segment, d]) => element(documentObject, 'path', {
      d,
      class: 'seven-segment-bar',
      fill: '#4f171d',
      stroke: '#74262f',
      'stroke-width': 1.3,
      'data-seven-segment': segment,
    })),
    element(documentObject, 'text', { x: 13, y: 18, fill: '#7bdde8', 'font-size': 6, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, '1 DIGIT'),
    ...[
      ['a', 12], ['b', 31], ['c', 51], ['d', 70],
      ['e', 90], ['f', 109], ['g', 129], ['COM', 148],
    ].flatMap(([pin, x]) => [
      element(documentObject, 'text', { x, y: 104, fill: pin === 'COM' ? '#d9e4e5' : '#ff8895', 'font-size': pin === 'COM' ? 5.4 : 7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, pin),
      element(documentObject, 'line', { x1: x, y1: 108, x2: x, y2: 116, stroke: '#c9d2d4', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      element(documentObject, 'circle', { cx: x, cy: 116, r: 3.3, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.4, 'data-terminal-pin': pin }),
    ]),
  );
  return svg;
}
