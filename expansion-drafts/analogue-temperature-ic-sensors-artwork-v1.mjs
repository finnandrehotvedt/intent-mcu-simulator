// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  ANALOGUE_TEMPERATURE_IC_DEFINITIONS,
  LM35_TEMPERATURE_TYPE,
  TMP36_TEMPERATURE_TYPE,
  analogueTemperatureIcValue,
  analogueTemperatureIcVoltage,
} from './analogue-temperature-ic-sensors-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createAnalogueTemperatureIcArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type
      || !ANALOGUE_TEMPERATURE_IC_DEFINITIONS[component.type]) {
    throw new TypeError('ANALOGUE_TEMPERATURE_IC_ARTWORK');
  }
  const temperatureC = analogueTemperatureIcValue(component);
  const voltage = analogueTemperatureIcVoltage(component.type, temperatureC);
  const part = component.type === TMP36_TEMPERATURE_TYPE ? 'TMP36' : 'LM35';
  const accent = component.type === TMP36_TEMPERATURE_TYPE ? '#ffb84d' : '#66d9a8';
  const root = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'data-artwork-key': definition.artwork.renderer,
    'aria-label': `${component.label}, ideal ${temperatureC.toFixed(1)} degrees Celsius, ${voltage.toFixed(2)} volts` });
  root.append(
    el(documentObject, 'rect', { x: 8, y: 5, width: 104, height: 76, rx: 8,
      fill: '#102531', stroke: accent, 'stroke-width': 2 }),
    el(documentObject, 'path', { d: 'M36 57 V32 A24 24 0 0 1 84 32 V57 Z',
      fill: '#172027', stroke: '#d8edf2', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 36, y: 52, width: 48, height: 8, rx: 2,
      fill: '#263945', stroke: '#8ba4ad', 'stroke-width': 1 }),
    el(documentObject, 'text', { x: 60, y: 38, 'text-anchor': 'middle', fill: accent,
      'font-size': 12, 'font-family': 'sans-serif', 'font-weight': 'bold' }, part),
    el(documentObject, 'text', { x: 60, y: 49, 'text-anchor': 'middle', fill: '#d8edf2',
      'font-size': 8, 'font-family': 'sans-serif' }, `${temperatureC.toFixed(1)} °C`),
    el(documentObject, 'text', { x: 60, y: 17, 'text-anchor': 'middle', fill: '#d8edf2',
      'font-size': 7, 'font-family': 'sans-serif' }, `${voltage.toFixed(2)} V IDEAL`),
  );
  for (const [pin, label, x, color] of [
    ['VCC', '+VS', 34, '#ef6670'], ['AOUT', 'VOUT', 60, '#5ce1e6'], ['GND', 'GND', 86, '#dbe8ed'],
  ]) {
    root.append(
      el(documentObject, 'line', { x1: x, y1: 59, x2: x, y2: 88, stroke: color, 'stroke-width': 3 }),
      el(documentObject, 'circle', { cx: x, cy: 91, r: 4, fill: '#07111b', stroke: color,
        'stroke-width': 2, 'data-terminal-pin': pin }),
      el(documentObject, 'text', { x, y: 99, 'text-anchor': 'middle', fill: '#dbe8ed',
        'font-size': 7, 'font-family': 'sans-serif' }, label),
    );
  }
  if (component.type === LM35_TEMPERATURE_TYPE) {
    root.append(el(documentObject, 'text', { x: 102, y: 70, 'text-anchor': 'end', fill: '#8acdb5',
      'font-size': 6, 'font-family': 'sans-serif' }, '10 mV/°C'));
  } else {
    root.append(el(documentObject, 'text', { x: 102, y: 70, 'text-anchor': 'end', fill: '#ffd18a',
      'font-size': 6, 'font-family': 'sans-serif' }, '+500 mV'));
  }
  return root;
}
