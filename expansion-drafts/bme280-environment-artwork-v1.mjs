// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { BME280_DEFINITION, BME280_RENDERER } from './bme280-environment-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createBme280Artwork(
  documentObject,
  definition = BME280_DEFINITION,
  component = { id: 'bme280-preview', label: definition.displayName,
    controls: { temperatureC: 23.5, humidityPercent: 50, pressureHpa: 1013.2 } },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== BME280_RENDERER) {
    throw new TypeError('BME280_ARTWORK_CONTRACT');
  }
  const temperatureC = Number.isFinite(component?.controls?.temperatureC) ? component.controls.temperatureC : 23.5;
  const humidityPercent = Number.isFinite(component?.controls?.humidityPercent) ? component.controls.humidityPercent : 50;
  const pressureHpa = Number.isFinite(component?.controls?.pressureHpa) ? component.controls.pressureHpa : 1013.2;
  const label = thumbnail ? `${definition.displayName}, I2C environment sensor`
    : `${component.label}, simulated ${temperatureC} degrees Celsius, ${humidityPercent} percent relative humidity and ${pressureHpa} hectopascals`;
  const svg = el(documentObject, 'svg', {
    class: `bme280-artwork${thumbnail ? ' bme280-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': BME280_RENDERER,
    'data-temperature-c': temperatureC,
    'data-humidity-percent': humidityPercent,
    'data-pressure-hpa': pressureHpa,
  });
  svg.append(
    el(documentObject, 'title', {}, label),
    el(documentObject, 'rect', { x: 10, y: 7, width: 160, height: 82, rx: 10, fill: '#176f72', stroke: '#0c3d45', 'stroke-width': 2.5 }),
    el(documentObject, 'circle', { cx: 24, cy: 21, r: 5, fill: '#d7ece9', stroke: '#0c3d45', 'stroke-width': 1.5 }),
    el(documentObject, 'circle', { cx: 156, cy: 21, r: 5, fill: '#d7ece9', stroke: '#0c3d45', 'stroke-width': 1.5 }),
    el(documentObject, 'rect', { x: 61, y: 18, width: 58, height: 37, rx: 4, fill: '#26343b', stroke: '#d8e4e3', 'stroke-width': 1.2 }),
    ...Array.from({ length: 8 }, (_, index) => el(documentObject, 'line', {
      x1: 64 + index * 7.3, y1: 15, x2: 64 + index * 7.3, y2: 18,
      stroke: '#d8b45b', 'stroke-width': 2,
    })),
    ...Array.from({ length: 8 }, (_, index) => el(documentObject, 'line', {
      x1: 64 + index * 7.3, y1: 55, x2: 64 + index * 7.3, y2: 58,
      stroke: '#d8b45b', 'stroke-width': 2,
    })),
    el(documentObject, 'text', { x: 90, y: 34, 'text-anchor': 'middle', fill: '#eff7f6', 'font-size': 9, 'font-family': 'system-ui, sans-serif', 'font-weight': 800 }, 'BME280'),
    el(documentObject, 'text', { x: 90, y: 46, 'text-anchor': 'middle', fill: '#afd4d0', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace' }, 'I²C · 0x76'),
    el(documentObject, 'text', { x: 90, y: 70, 'text-anchor': 'middle', fill: '#ffffff', 'font-size': 7.5, 'font-family': 'ui-monospace, monospace' }, `${temperatureC}°C · ${humidityPercent}%`),
    el(documentObject, 'text', { x: 90, y: 81, 'text-anchor': 'middle', fill: '#d9f0ed', 'font-size': 7, 'font-family': 'ui-monospace, monospace' }, `${pressureHpa} hPa`),
  );
  for (const [pin, x, color] of [['VCC', 24, '#ef5b62'], ['GND', 68, '#95a9b3'], ['SDA', 112, '#e5b93c'], ['SCL', 156, '#71b7e6']]) {
    svg.append(
      el(documentObject, 'line', { x1: x, y1: 89, x2: x, y2: 109, stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
      el(documentObject, 'circle', { cx: x, cy: 114, r: 4, fill: '#111820', stroke: color, 'stroke-width': 1.8, 'data-terminal-pin': pin }),
      el(documentObject, 'text', { x, y: 104, 'text-anchor': 'middle', fill: '#ecf8f7', 'font-size': 6.2, 'font-family': 'ui-monospace, monospace' }, pin),
    );
  }
  return svg;
}
