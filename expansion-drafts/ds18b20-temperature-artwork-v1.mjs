// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { DS18B20_DEFINITION, DS18B20_RENDERER } from './ds18b20-temperature-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createDs18b20Artwork(
  documentObject,
  definition = DS18B20_DEFINITION,
  component = { id: 'ds18b20-preview', label: definition.displayName, controls: { temperatureC: 23.5 } },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== DS18B20_RENDERER) {
    throw new TypeError('DS18B20_ARTWORK_CONTRACT');
  }
  const temperatureC = Number.isFinite(component?.controls?.temperatureC)
    ? component.controls.temperatureC : 23.5;
  const shown = Number(temperatureC.toFixed(4));
  const label = thumbnail ? `${definition.displayName}, digital probe`
    : `${component.label}, simulated ${shown} degrees Celsius`;
  const svg = el(documentObject, 'svg', {
    class: `ds18b20-artwork${thumbnail ? ' ds18b20-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': DS18B20_RENDERER,
    'data-temperature-c': shown,
  });
  svg.append(
    el(documentObject, 'title', {}, label),
    el(documentObject, 'path', { d: 'M47 26 C70 26 78 18 93 18 C111 18 119 29 119 42', fill: 'none', stroke: '#273646', 'stroke-width': 7, 'stroke-linecap': 'round' }),
    el(documentObject, 'path', { d: 'M47 26 C70 26 78 18 93 18 C111 18 119 29 119 42', fill: 'none', stroke: '#7592a8', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    el(documentObject, 'rect', { x: 14, y: 17, width: 39, height: 18, rx: 8, fill: '#cad5dc', stroke: '#f7fbfd', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 17, y: 20, width: 27, height: 4, rx: 2, fill: '#f8fbfc', opacity: 0.85 }),
    el(documentObject, 'path', { d: 'M14 22 L8 22 L8 30 L14 30', fill: '#8b9aa3', stroke: '#e6edf1', 'stroke-width': 1.5 }),
    el(documentObject, 'rect', { x: 91, y: 40, width: 52, height: 37, rx: 6, fill: '#152332', stroke: '#6eb9e8', 'stroke-width': 2 }),
    el(documentObject, 'text', { x: 117, y: 53, 'text-anchor': 'middle', fill: '#dff5ff', 'font-size': 8.5, 'font-family': 'system-ui, sans-serif', 'font-weight': 800 }, 'DS18B20'),
    el(documentObject, 'text', { x: 117, y: 66, 'text-anchor': 'middle', fill: '#8fd7ff', 'font-size': 8, 'font-family': 'ui-monospace, monospace' }, `${shown} °C`),
  );
  for (const [pin, x, color] of [['VCC', 102, '#ef5b62'], ['DQ', 117, '#f0d357'], ['GND', 132, '#d7e1e8']]) {
    svg.append(
      el(documentObject, 'line', { x1: x, y1: 77, x2: x, y2: 98, stroke: color, 'stroke-width': 3.2, 'stroke-linecap': 'round' }),
      el(documentObject, 'circle', { cx: x, cy: 103, r: 4, fill: '#111820', stroke: color, 'stroke-width': 1.8, 'data-terminal-pin': pin }),
      el(documentObject, 'text', { x, y: 91, 'text-anchor': 'middle', fill: '#eefaff', 'font-size': 5.8, 'font-family': 'ui-monospace, monospace' }, pin),
    );
  }
  return svg;
}
