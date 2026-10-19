// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  CHARACTER_LCD_DEFINITION,
  CHARACTER_LCD_RENDERER,
} from './character-lcd-16x2-4bit-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createCharacterLcdArtwork(
  documentObject,
  definition = CHARACTER_LCD_DEFINITION,
  component = { id: 'character-lcd-preview', label: definition.displayName },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== CHARACTER_LCD_RENDERER) {
    throw new TypeError('CHARACTER_LCD_ARTWORK_CONTRACT');
  }
  const label = thumbnail
    ? `${definition.displayName}, bounded write-only GPIO decoder`
    : `${component.label}, awaiting supported 4-bit initialization; blank 16 by 2 idealized character display, no I2C or physical display accuracy claimed`;
  const svg = element(documentObject, 'svg', {
    class: `character-lcd-artwork${thumbnail ? ' character-lcd-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': CHARACTER_LCD_RENDERER,
    'data-protocol-state': 'awaiting-initialization',
    'data-line1': '',
    'data-line2': '',
  });
  const cells = [];
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      cells.push(element(documentObject, 'rect', {
        x: 21 + column * 11.15, y: 28 + row * 31, width: 9.2, height: 23,
        rx: 1.2, class: 'lcd-character-cell', fill: '#789830', opacity: 0.22,
      }));
    }
  }
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 4, y: 3, width: 212, height: 103, rx: 8, fill: '#176e67', stroke: '#5cd2c4', 'stroke-width': 2 }),
    element(documentObject, 'circle', { cx: 13, cy: 13, r: 4, fill: '#07121d', stroke: '#d8c15d', 'stroke-width': 1.5 }),
    element(documentObject, 'circle', { cx: 207, cy: 13, r: 4, fill: '#07121d', stroke: '#d8c15d', 'stroke-width': 1.5 }),
    element(documentObject, 'rect', { x: 14, y: 19, width: 192, height: 71, rx: 5, fill: '#1b280d', stroke: '#b8d85d', 'stroke-width': 2 }),
    element(documentObject, 'rect', { x: 18, y: 23, width: 184, height: 63, rx: 2, fill: '#9fbd49', opacity: 0.9, class: 'character-lcd-screen' }),
    ...cells,
    element(documentObject, 'text', { x: 110, y: 47, class: 'character-lcd-line', 'data-lcd-line': '1', fill: '#17220d', 'font-size': 13, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, ''),
    element(documentObject, 'text', { x: 110, y: 78, class: 'character-lcd-line', 'data-lcd-line': '2', fill: '#17220d', 'font-size': 13, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, ''),
    element(documentObject, 'text', { x: 110, y: 100, fill: '#9de9df', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, '16 × 2 · GPIO 4-BIT · WRITE ONLY'),
    ...[
      ['VCC', 10, '#ffca59'], ['GND', 35, '#d9e4e5'], ['RS', 60, '#8de8f4'],
      ['RW', 85, '#d9e4e5'], ['E', 110, '#9cf545'], ['D4', 135, '#ff8895'],
      ['D5', 160, '#ff8895'], ['D6', 185, '#ff8895'], ['D7', 210, '#ff8895'],
    ].flatMap(([pin, x, color]) => [
      element(documentObject, 'text', { x, y: 113, fill: color, 'font-size': 5.7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, pin),
      element(documentObject, 'line', { x1: x, y1: 116, x2: x, y2: 124, stroke: '#c9d2d4', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      element(documentObject, 'circle', { cx: x, cy: 124, r: 3.3, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.4, 'data-terminal-pin': pin }),
    ]),
  );
  return svg;
}
