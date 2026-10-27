// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION,
  FOUR_DIGIT_SEVEN_SEGMENT_RENDERER,
} from './seven-segment-four-digit-common-cathode-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

const SEGMENT_PATHS = Object.freeze({
  a: 'M8 7 L12 4 H34 L38 7 L34 10 H12 Z',
  b: 'M39 9 L42 12 V27 L38 31 L35 27 V13 Z',
  c: 'M38 34 L42 38 V53 L39 57 L35 53 V38 Z',
  d: 'M8 59 L12 56 H34 L38 59 L34 62 H12 Z',
  e: 'M7 34 L11 38 V53 L7 57 L3 53 V38 Z',
  f: 'M7 9 L11 13 V27 L7 31 L3 27 V12 Z',
  g: 'M8 33 L12 30 H34 L38 33 L34 36 H12 Z',
});
const TERMINALS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp', 'DIG1', 'DIG2', 'DIG3', 'DIG4']);

export function createFourDigitSevenSegmentArtwork(
  documentObject,
  definition = FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION,
  component = { id: 'four-digit-seven-segment-preview', label: definition.displayName },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS
      || definition.artwork.renderer !== FOUR_DIGIT_SEVEN_SEGMENT_RENDERER) {
    throw new TypeError('FOUR_DIGIT_SEVEN_SEGMENT_ARTWORK_CONTRACT');
  }
  const label = thumbnail
    ? `${definition.displayName}, idealized multiplexed numeric indicator`
    : `${component.label}, blank four-digit common-cathode multiplexed display; sampled commanded state only, no physical brightness, package-current or refresh-rate accuracy claimed`;
  const svg = element(documentObject, 'svg', {
    class: `four-digit-seven-segment-artwork${thumbnail ? ' four-digit-seven-segment-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': FOUR_DIGIT_SEVEN_SEGMENT_RENDERER,
    'data-digit1-segments': '', 'data-digit2-segments': '',
    'data-digit3-segments': '', 'data-digit4-segments': '',
    'data-digit1-decimal-point': 'false', 'data-digit2-decimal-point': 'false',
    'data-digit3-decimal-point': 'false', 'data-digit4-decimal-point': 'false',
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 10, y: 3, width: 240, height: 88, rx: 10, fill: '#161d24', stroke: '#71828d', 'stroke-width': 2 }),
    element(documentObject, 'rect', { x: 15, y: 8, width: 230, height: 78, rx: 6, fill: '#090d12', stroke: '#293741', 'stroke-width': 1.2 }),
  );
  [0, 1, 2, 3].forEach((digitIndex) => {
    const x = 23 + digitIndex * 56;
    svg.append(
      ...Object.entries(SEGMENT_PATHS).map(([segment, d]) => element(documentObject, 'path', {
        d, transform: `translate(${x} 13)`, class: 'four-digit-seven-segment-bar',
        fill: '#4f171d', stroke: '#74262f', 'stroke-width': 1.1,
        'data-four-digit-index': digitIndex + 1, 'data-four-digit-segment': segment,
      })),
      element(documentObject, 'circle', {
        cx: x + 45, cy: 72, r: 3.4, class: 'four-digit-seven-segment-bar',
        fill: '#4f171d', stroke: '#74262f', 'stroke-width': 1.1,
        'data-four-digit-index': digitIndex + 1, 'data-four-digit-segment': 'dp',
      }),
      element(documentObject, 'text', {
        x: x + 22, y: 12, fill: '#7bdde8', 'font-size': 5.4,
        'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800,
      }, `D${digitIndex + 1}`),
    );
  });
  svg.append(
    element(documentObject, 'text', { x: 130, y: 101, fill: '#7bdde8', 'font-size': 6, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, '4 DIGIT · CC · MUX'),
    ...TERMINALS.flatMap((terminal, index) => {
      const x = 11 + index * (238 / 11);
      return [
        element(documentObject, 'text', { x, y: 115, fill: terminal.startsWith('DIG') ? '#8fe0ff' : '#ff8895', 'font-size': terminal.startsWith('DIG') ? 4.5 : 6.2, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, terminal),
        element(documentObject, 'line', { x1: x, y1: 120, x2: x, y2: 133, stroke: '#c9d2d4', 'stroke-width': 3.2, 'stroke-linecap': 'round' }),
        element(documentObject, 'circle', { cx: x, cy: 133, r: 3.1, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.3, 'data-terminal-pin': terminal }),
      ];
    }),
  );
  return svg;
}
