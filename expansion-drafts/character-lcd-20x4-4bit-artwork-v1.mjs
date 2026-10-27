// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  CHARACTER_LCD_20X4_DEFINITION,
  CHARACTER_LCD_20X4_RENDERER,
} from './character-lcd-20x4-4bit-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createCharacterLcd20x4Artwork(
  documentObject,
  definition = CHARACTER_LCD_20X4_DEFINITION,
  component = { id: 'character-lcd-20x4-preview', label: definition.displayName },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== CHARACTER_LCD_20X4_RENDERER) {
    throw new TypeError('CHARACTER_LCD_20X4_ARTWORK_CONTRACT');
  }
  const label = thumbnail
    ? `${definition.displayName}, bounded AVR write-only GPIO decoder with eight CGRAM slots`
    : `${component.label}, blank 20 by 4 idealized character display with eight visible custom-glyph slots; no physical display accuracy claimed`;
  const svg = el(documentObject, 'svg', {
    class: `character-lcd-artwork character-lcd-20x4-artwork${thumbnail ? ' character-lcd-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': CHARACTER_LCD_20X4_RENDERER,
    'data-protocol-state': 'awaiting-initialization',
    'data-line1': '', 'data-line2': '', 'data-line3': '', 'data-line4': '',
  });
  const cells = [];
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 20; column += 1) {
    const x = 24 + column * 10.7;
    const y = 35 + row * 27;
    cells.push(
      el(documentObject, 'rect', { x: x - 4.4, y: y - 16, width: 8.8, height: 21, rx: 1, class: 'lcd-character-cell', fill: '#789830', opacity: 0.2 }),
      el(documentObject, 'text', { x, y, 'data-lcd-cell': `${row}:${column}`, fill: '#17220d', 'font-size': 11, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, ''),
    );
  }
  const pins = [['VCC', 12, '#ffca59'], ['GND', 41, '#d9e4e5'], ['RS', 70, '#8de8f4'],
    ['RW', 99, '#d9e4e5'], ['E', 128, '#9cf545'], ['D4', 157, '#ff8895'],
    ['D5', 186, '#ff8895'], ['D6', 215, '#ff8895'], ['D7', 244, '#ff8895']];
  svg.append(
    el(documentObject, 'title', {}, label),
    el(documentObject, 'rect', { x: 3, y: 3, width: 254, height: 151, rx: 9, fill: '#176e67', stroke: '#5cd2c4', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 13, y: 13, width: 234, height: 116, rx: 5, fill: '#1b280d', stroke: '#b8d85d', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 17, y: 17, width: 226, height: 108, rx: 2, fill: '#9fbd49', opacity: 0.9, class: 'character-lcd-screen' }),
    ...cells,
    el(documentObject, 'text', { x: 130, y: 145, fill: '#9de9df', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, '20 × 4 · GPIO 4-BIT · 8 CGRAM GLYPHS'),
    ...pins.flatMap(([pin, x, color]) => [
      el(documentObject, 'text', { x, y: 164, fill: color, 'font-size': 5.7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, pin),
      el(documentObject, 'line', { x1: x, y1: 167, x2: x, y2: 175, stroke: '#c9d2d4', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      el(documentObject, 'circle', { cx: x, cy: 175, r: 3.3, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.4, 'data-terminal-pin': pin }),
    ]),
  );
  return svg;
}
