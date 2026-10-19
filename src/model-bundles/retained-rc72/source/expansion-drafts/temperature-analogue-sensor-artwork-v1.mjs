// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  TEMPERATURE_ANALOGUE_SENSOR_DEFINITION,
  TEMPERATURE_ANALOGUE_SENSOR_RENDERER,
  temperatureCToVoltage,
} from './temperature-analogue-sensor-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createTemperatureAnalogueSensorArtwork(
  documentObject,
  definition = TEMPERATURE_ANALOGUE_SENSOR_DEFINITION,
  component = { id: 'temperature-sensor-preview', label: definition.displayName, controls: { temperatureC: 25 } },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== TEMPERATURE_ANALOGUE_SENSOR_RENDERER) {
    throw new TypeError('TEMPERATURE_SENSOR_ARTWORK_CONTRACT');
  }
  const temperatureC = Number.isFinite(component?.controls?.temperatureC)
    ? component.controls.temperatureC : 25;
  const voltage = temperatureCToVoltage(temperatureC);
  const normalized = (temperatureC + 50) / 200;
  const mercuryY = 53 - normalized * 27;
  const label = thumbnail
    ? `${definition.displayName}, idealized signal`
    : `${component.label}, idealized temperature ${temperatureC} degrees Celsius, ${voltage.toFixed(3)} volt output`;
  const svg = element(documentObject, 'svg', {
    class: `temperature-sensor-artwork${thumbnail ? ' temperature-sensor-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': TEMPERATURE_ANALOGUE_SENSOR_RENDERER,
    'data-temperature-c': String(temperatureC),
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 8, y: 8, width: 104, height: 76, rx: 9, fill: '#174a68', stroke: '#61c6ef', 'stroke-width': 2 }),
    element(documentObject, 'path', { d: 'M16 67 H104 M24 18 H43 M77 18 H96', fill: 'none', stroke: '#4f91a8', 'stroke-width': 1.5, opacity: 0.8 }),
    element(documentObject, 'rect', { x: 51, y: 18, width: 18, height: 39, rx: 9, fill: '#e8f4f6', stroke: '#b7d7df', 'stroke-width': 2 }),
    element(documentObject, 'circle', { cx: 60, cy: 56, r: 11, fill: '#e8f4f6', stroke: '#b7d7df', 'stroke-width': 2 }),
    element(documentObject, 'rect', { x: 57, y: mercuryY, width: 6, height: 57 - mercuryY, rx: 3, fill: '#ff725e' }),
    element(documentObject, 'circle', { cx: 60, cy: 56, r: 7, fill: '#ff725e' }),
    element(documentObject, 'text', { x: 86, y: 40, fill: '#d9f6ff', 'font-size': 10, 'font-family': 'system-ui, sans-serif', 'text-anchor': 'middle', 'font-weight': 800 }, `${temperatureC} °C`),
    element(documentObject, 'text', { x: 86, y: 54, fill: '#8fdcf4', 'font-size': 7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle' }, `${voltage.toFixed(2)} V`),
    element(documentObject, 'text', { x: 24, y: 77, fill: '#d9f6ff', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle' }, 'VCC'),
    element(documentObject, 'text', { x: 60, y: 77, fill: '#d9f6ff', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle' }, 'GND'),
    element(documentObject, 'text', { x: 96, y: 77, fill: '#d9f6ff', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle' }, 'AOUT'),
    element(documentObject, 'line', { x1: 24, y1: 80, x2: 24, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 60, y1: 80, x2: 60, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 96, y1: 80, x2: 96, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'circle', { cx: 24, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': 'VCC' }),
    element(documentObject, 'circle', { cx: 60, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': 'GND' }),
    element(documentObject, 'circle', { cx: 96, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': 'AOUT' }),
  );
  return svg;
}
