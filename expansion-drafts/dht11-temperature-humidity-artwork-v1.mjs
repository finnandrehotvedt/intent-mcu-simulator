// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { DHT11_DEFINITION, DHT11_RENDERER } from './dht11-temperature-humidity-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createDht11Artwork(
  documentObject,
  definition = DHT11_DEFINITION,
  component = { id: 'dht11-preview', label: definition.displayName, controls: { temperatureC: 25, humidityPercent: 50 } },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== DHT11_RENDERER) {
    throw new TypeError('DHT11_ARTWORK_CONTRACT');
  }
  const temperatureC = Number.isInteger(component?.controls?.temperatureC) ? component.controls.temperatureC : 25;
  const humidityPercent = Number.isInteger(component?.controls?.humidityPercent) ? component.controls.humidityPercent : 50;
  const label = thumbnail ? `${definition.displayName}, digital sensor`
    : `${component.label}, simulated ${temperatureC} degrees Celsius and ${humidityPercent} percent relative humidity`;
  const svg = el(documentObject, 'svg', {
    class: `dht11-artwork${thumbnail ? ' dht11-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': DHT11_RENDERER,
    'data-temperature-c': temperatureC,
    'data-humidity-percent': humidityPercent,
  });
  svg.append(
    el(documentObject, 'title', {}, label),
    el(documentObject, 'rect', { x: 20, y: 7, width: 90, height: 74, rx: 7, fill: '#167eb7', stroke: '#82d8ff', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 28, y: 14, width: 74, height: 45, rx: 4, fill: '#126c9d', stroke: '#9ae2ff', 'stroke-width': 1.5 }),
    ...Array.from({ length: 5 }, (_, row) => Array.from({ length: 7 }, (_, column) =>
      el(documentObject, 'rect', { x: 33 + column * 9.3, y: 18 + row * 7.3, width: 5.5, height: 3.5, rx: 1, fill: '#d5f4ff', opacity: 0.9 }))).flat(),
    el(documentObject, 'text', { x: 65, y: 70, 'text-anchor': 'middle', fill: '#eefaff', 'font-size': 9, 'font-family': 'system-ui, sans-serif', 'font-weight': 800 }, 'DHT11'),
    el(documentObject, 'text', { x: 65, y: 80, 'text-anchor': 'middle', fill: '#bdeaff', 'font-size': 6.8, 'font-family': 'ui-monospace, monospace' }, `${temperatureC} °C · ${humidityPercent}% RH`),
  );
  for (const [pin, x, color] of [['VCC', 34, '#ef5b62'], ['DATA', 65, '#f0d357'], ['GND', 96, '#d7e1e8']]) {
    svg.append(
      el(documentObject, 'line', { x1: x, y1: 81, x2: x, y2: 99, stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      el(documentObject, 'circle', { cx: x, cy: 102, r: 4, fill: '#111820', stroke: color, 'stroke-width': 1.8, 'data-terminal-pin': pin }),
      el(documentObject, 'text', { x, y: 94, 'text-anchor': 'middle', fill: '#eefaff', 'font-size': 6.3, 'font-family': 'ui-monospace, monospace' }, pin),
    );
  }
  return svg;
}
