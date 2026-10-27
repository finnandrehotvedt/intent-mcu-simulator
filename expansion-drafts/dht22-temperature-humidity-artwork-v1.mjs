// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { DHT22_DEFINITION, DHT22_RENDERER } from './dht22-temperature-humidity-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createDht22Artwork(
  documentObject,
  definition = DHT22_DEFINITION,
  component = { id: 'dht22-preview', label: definition.displayName, controls: { temperatureC: 23.5, humidityPercent: 50 } },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== DHT22_RENDERER) {
    throw new TypeError('DHT22_ARTWORK_CONTRACT');
  }
  const temperatureC = Number.isFinite(component?.controls?.temperatureC) ? component.controls.temperatureC : 23.5;
  const humidityPercent = Number.isFinite(component?.controls?.humidityPercent) ? component.controls.humidityPercent : 50;
  const label = thumbnail ? `${definition.displayName}, decimal digital sensor`
    : `${component.label}, simulated ${temperatureC} degrees Celsius and ${humidityPercent} percent relative humidity`;
  const svg = el(documentObject, 'svg', {
    class: `dht22-artwork${thumbnail ? ' dht22-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': DHT22_RENDERER,
    'data-temperature-c': temperatureC,
    'data-humidity-percent': humidityPercent,
  });
  svg.append(
    el(documentObject, 'title', {}, label),
    el(documentObject, 'rect', { x: 20, y: 6, width: 90, height: 76, rx: 8, fill: '#f3f7f9', stroke: '#9fb6c2', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 29, y: 14, width: 72, height: 42, rx: 4, fill: '#dbe7ec', stroke: '#7897a6', 'stroke-width': 1.5 }),
    ...Array.from({ length: 6 }, (_, row) => el(documentObject, 'line', {
      x1: 35, y1: 18 + row * 6.4, x2: 95, y2: 18 + row * 6.4,
      stroke: '#7897a6', 'stroke-width': 2.3, 'stroke-linecap': 'round',
    })),
    el(documentObject, 'path', { d: 'M27 61 H103', stroke: '#bccbd2', 'stroke-width': 1.5 }),
    el(documentObject, 'text', { x: 65, y: 70, 'text-anchor': 'middle', fill: '#24434f', 'font-size': 9, 'font-family': 'system-ui, sans-serif', 'font-weight': 800 }, 'DHT22'),
    el(documentObject, 'text', { x: 65, y: 80, 'text-anchor': 'middle', fill: '#456875', 'font-size': 6.8, 'font-family': 'ui-monospace, monospace' }, `${temperatureC} °C · ${humidityPercent}% RH`),
  );
  for (const [pin, x, color] of [['VCC', 34, '#ef5b62'], ['DATA', 65, '#e5b93c'], ['GND', 96, '#7f98a4']]) {
    svg.append(
      el(documentObject, 'line', { x1: x, y1: 82, x2: x, y2: 99, stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      el(documentObject, 'circle', { cx: x, cy: 102, r: 4, fill: '#111820', stroke: color, 'stroke-width': 1.8, 'data-terminal-pin': pin }),
      el(documentObject, 'text', { x, y: 94, 'text-anchor': 'middle', fill: '#24434f', 'font-size': 6.3, 'font-family': 'ui-monospace, monospace' }, pin),
    );
  }
  return svg;
}
