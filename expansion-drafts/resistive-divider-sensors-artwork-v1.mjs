// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { FLEX_DIVIDER_TYPE, LDR_DIVIDER_TYPE, NTC_DIVIDER_TYPE,
  resistiveDividerSensorResistance, resistiveDividerSensorValue,
  resistiveDividerSensorVoltage } from './resistive-divider-sensors-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (d, name, attrs = {}, text = null) => { const node = d.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== null) node.textContent = text; return node; };
const line = (d, x1, y1, x2, y2, extra = {}) => el(d, 'line', { x1, y1, x2, y2,
  stroke: '#5ce1e6', 'stroke-width': 3, 'stroke-linecap': 'round', ...extra });
const terminal = (d, id, x) => el(d, 'circle', { cx: x, cy: 98, r: 4, fill: '#07111b',
  stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': id });

export function createResistiveDividerSensorArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) {
    throw new TypeError('RESISTIVE_DIVIDER_SENSOR_ARTWORK');
  }
  const value = resistiveDividerSensorValue(component);
  const volts = resistiveDividerSensorVoltage(component.type, value);
  const ohms = resistiveDividerSensorResistance(component.type, value);
  const label = `${component.label}, ${value}, ${volts.toFixed(2)} volts`;
  const svg = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'aria-label': label, 'data-artwork-key': definition.artwork.renderer,
    'data-divider-volts': volts.toFixed(4), 'data-sensor-ohms': ohms.toFixed(2) });
  svg.append(el(documentObject, 'title', {}, label), el(documentObject, 'rect', {
    x: 10, y: 8, width: 112, height: 82, rx: 10, fill: '#0b1c29', stroke: '#31526a', 'stroke-width': 2,
  }), terminal(documentObject, 'VCC', 25), terminal(documentObject, 'GND', 66),
  terminal(documentObject, 'AOUT', 107), line(documentObject, 25, 98, 25, 78),
  line(documentObject, 66, 98, 66, 78), line(documentObject, 107, 98, 107, 60),
  line(documentObject, 66, 60, 107, 60));
  if (component.type === LDR_DIVIDER_TYPE) {
    svg.append(el(documentObject, 'circle', { cx: 47, cy: 43, r: 19, fill: '#213c51', stroke: '#ffbf47', 'stroke-width': 3 }),
      line(documentObject, 24, 18, 35, 28, { stroke: '#ffbf47' }),
      line(documentObject, 34, 14, 42, 24, { stroke: '#ffbf47' }),
      el(documentObject, 'path', { d: 'M35 43h7l4-8 7 16 5-8h7', fill: 'none', stroke: '#a8ff3f', 'stroke-width': 3 }));
  } else if (component.type === NTC_DIVIDER_TYPE) {
    svg.append(el(documentObject, 'path', { d: 'M25 58h10l5-14 8 27 8-27 8 27 8-27 5 14h10', fill: 'none', stroke: '#a8ff3f', 'stroke-width': 3 }),
      el(documentObject, 'text', { x: 66, y: 30, fill: '#ffbf47', 'font-size': 12, 'text-anchor': 'middle' }, 'NTC'));
  } else if (component.type === FLEX_DIVIDER_TYPE) {
    const bend = 12 + value * 25;
    svg.append(el(documentObject, 'path', { d: `M25 65 Q66 ${65 - bend} 107 65`, fill: 'none', stroke: '#a8ff3f', 'stroke-width': 8, 'stroke-linecap': 'round' }),
      el(documentObject, 'path', { d: `M28 65 Q66 ${68 - bend} 104 65`, fill: 'none', stroke: '#17334a', 'stroke-width': 2 }));
  }
  svg.append(el(documentObject, 'text', { x: 66, y: 84, fill: '#cce7ef', 'font-size': 8,
    'text-anchor': 'middle' }, `${(ohms / 1000).toFixed(1)} kΩ · ${volts.toFixed(2)} V`));
  return svg;
}
