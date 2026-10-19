// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  LIGHT_ANALOGUE_SENSOR_DEFINITION,
  LIGHT_ANALOGUE_SENSOR_RENDERER,
} from './light-analogue-sensor-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createLightAnalogueSensorArtwork(
  documentObject,
  definition = LIGHT_ANALOGUE_SENSOR_DEFINITION,
  component = { id: 'light-sensor-preview', label: definition.displayName, controls: { lightLevel: 0.5 } },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== LIGHT_ANALOGUE_SENSOR_RENDERER) {
    throw new TypeError('LIGHT_SENSOR_ARTWORK_CONTRACT');
  }
  const level = Number.isFinite(component?.controls?.lightLevel) ? component.controls.lightLevel : 0.5;
  const percent = Math.round(level * 100);
  const label = thumbnail
    ? `${definition.displayName}, idealized signal`
    : `${component.label}, idealized light ${percent} percent, ${(level * 5).toFixed(2)} volt output`;
  const glow = 0.16 + level * 0.74;
  const svg = element(documentObject, 'svg', {
    class: `light-sensor-artwork${thumbnail ? ' light-sensor-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': LIGHT_ANALOGUE_SENSOR_RENDERER,
    'data-light-level': level.toFixed(2),
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 8, y: 8, width: 104, height: 76, rx: 9, fill: '#0d6570', stroke: '#4bd9df', 'stroke-width': 2 }),
    element(documentObject, 'path', { d: 'M16 65 H104 M24 20 H42 M78 20 H96', fill: 'none', stroke: '#65b5a7', 'stroke-width': 1.5, opacity: 0.75 }),
    element(documentObject, 'circle', { cx: 60, cy: 38, r: 21, fill: '#11191d', stroke: '#9ac6c9', 'stroke-width': 2 }),
    element(documentObject, 'circle', { cx: 60, cy: 38, r: 13, fill: '#f6df62', stroke: '#fff0a2', 'stroke-width': 2, opacity: glow }),
    element(documentObject, 'path', { d: 'M54 29 C61 25 70 31 67 38 C65 44 58 47 52 43', fill: 'none', stroke: '#5f4912', 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
    element(documentObject, 'text', { x: 60, y: 67, fill: '#d9f6ff', 'font-size': 9, 'font-family': 'system-ui, sans-serif', 'text-anchor': 'middle', 'font-weight': 750 }, 'LIGHT → AOUT'),
    element(documentObject, 'line', { x1: 24, y1: 78, x2: 24, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 60, y1: 78, x2: 60, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 96, y1: 78, x2: 96, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'circle', { cx: 24, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': 'VCC' }),
    element(documentObject, 'circle', { cx: 60, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': 'GND' }),
    element(documentObject, 'circle', { cx: 96, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': 'AOUT' }),
  );
  return svg;
}
