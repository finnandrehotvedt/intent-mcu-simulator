// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import {
  PCF8574_LCD_DEFINITION,
  PCF8574_LCD_GEOMETRY_16X2,
  PCF8574_LCD_GEOMETRY_20X4,
  PCF8574_LCD_RENDERER,
} from './pcf8574-lcd-backpack-v1.mjs';
const NS = 'http://www.w3.org/2000/svg';
const el = (d, n, a = {}, t = null) => { const x = d.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) x.setAttribute(k, String(v)); if (t !== null) x.textContent = t; return x; };
export function createPcf8574LcdArtwork(documentObject, definition = PCF8574_LCD_DEFINITION, component = { id: 'pcf8574-lcd-preview', label: definition.displayName }, { thumbnail = false } = {}) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== PCF8574_LCD_RENDERER) throw new TypeError('PCF8574_LCD_ARTWORK_CONTRACT');
  const geometry = component?.properties?.geometry === PCF8574_LCD_GEOMETRY_20X4
    ? PCF8574_LCD_GEOMETRY_20X4 : PCF8574_LCD_GEOMETRY_16X2;
  const label = thumbnail ? `${definition.displayName}, ${geometry}, fixed address 0x27` : `${component.label}, ${geometry}, fixed 0x27 AVR I2C write-only display; awaiting firmware initialization`;
  const svg = el(documentObject, 'svg', { class: `character-lcd-artwork pcf8574-lcd-artwork${thumbnail ? ' character-lcd-thumbnail' : ''}`, viewBox: '0 0 220 130', role: 'img', 'aria-label': label, 'data-artwork-key': PCF8574_LCD_RENDERER, 'data-protocol-state': 'awaiting-initialization', 'data-geometry': geometry, 'data-line1': '', 'data-line2': '', 'data-line3': '', 'data-line4': '' });
  svg.append(el(documentObject, 'title', {}, label), el(documentObject, 'rect', { x: 4, y: 3, width: 212, height: 103, rx: 8, fill: '#176e67', stroke: '#5cd2c4', 'stroke-width': 2 }), el(documentObject, 'rect', { x: 15, y: 16, width: 190, height: 66, rx: 4, fill: '#9fbd49', stroke: '#1b280d', 'stroke-width': 3 }));
  const rows = geometry === PCF8574_LCD_GEOMETRY_20X4
    ? [[1, 31], [2, 47], [3, 63], [4, 79]] : [[1, 43], [2, 69]];
  for (const [row, y] of rows) svg.append(el(documentObject, 'text', { x: 110, y, 'data-lcd-line': row, class: 'character-lcd-line', 'text-anchor': 'middle', fill: '#17220d', 'font-size': geometry === PCF8574_LCD_GEOMETRY_20X4 ? 9 : 13, 'font-family': 'ui-monospace, monospace', 'font-weight': 800 }, ''));
  svg.append(el(documentObject, 'rect', { x: 62, y: 87, width: 96, height: 18, rx: 3, fill: '#123c48', stroke: '#62d9e7' }), el(documentObject, 'text', { x: 110, y: 99, 'text-anchor': 'middle', fill: '#d6fbff', 'font-size': 7, 'font-family': 'ui-monospace, monospace', 'font-weight': 800 }, `PCF8574 · 0x27 · ${geometry}`));
  for (const [pin, x, color] of [['VCC', 28, '#ffca59'], ['GND', 82, '#d9e4e5'], ['SDA', 138, '#8de8f4'], ['SCL', 192, '#9cf545']]) svg.append(el(documentObject, 'text', { x, y: 114, fill: color, 'font-size': 6, 'text-anchor': 'middle', 'font-family': 'ui-monospace, monospace', 'font-weight': 800 }, pin), el(documentObject, 'line', { x1: x, y1: 117, x2: x, y2: 124, stroke: '#c9d2d4', 'stroke-width': 3.5, 'stroke-linecap': 'round' }), el(documentObject, 'circle', { cx: x, cy: 124, r: 3.3, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.4, 'data-terminal-pin': pin }));
  return svg;
}
