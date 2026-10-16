// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  DIGITAL_LIGHT_THRESHOLD_DEFINITION,
  DIGITAL_LIGHT_THRESHOLD_RENDERER,
} from './digital-light-threshold-module-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createDigitalLightThresholdArtwork(
  documentObject,
  definition = DIGITAL_LIGHT_THRESHOLD_DEFINITION,
  component = {
    id: 'light-threshold-preview',
    label: definition.displayName,
    controls: {
      lightLevelPercent: 40,
      thresholdPercent: 50,
      hysteresisPercentagePoints: 5,
      outputActive: false,
    },
  },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== DIGITAL_LIGHT_THRESHOLD_RENDERER) {
    throw new TypeError('DIGITAL_LIGHT_THRESHOLD_ARTWORK_CONTRACT');
  }
  const controls = component.controls;
  const outputLevel = controls.outputActive ? 'LOW' : 'HIGH';
  const label = thumbnail
    ? `${definition.displayName}, idealized active-low signal`
    : `${component.label}, idealized light ${controls.lightLevelPercent} percent, threshold ${controls.thresholdPercent} percent, hysteresis ${controls.hysteresisPercentagePoints} percentage points, DOUT ${outputLevel}`;
  const svg = element(documentObject, 'svg', {
    class: `digital-light-threshold-artwork${thumbnail ? ' digital-light-threshold-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': DIGITAL_LIGHT_THRESHOLD_RENDERER,
    'data-output-level': outputLevel,
  });
  const activeColour = controls.outputActive ? '#ffbf47' : '#79e08f';
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 8, y: 8, width: 104, height: 76, rx: 9, fill: '#193c54', stroke: '#62c8ef', 'stroke-width': 2 }),
    element(documentObject, 'circle', { cx: 32, cy: 35, r: 11, fill: '#ffd663', stroke: '#fff0ad', 'stroke-width': 2 }),
    element(documentObject, 'path', { d: 'M32 14V8 M32 62V56 M11 35H17 M47 35H53 M17 20L21 24 M43 46L47 50 M17 50L21 46 M43 24L47 20', fill: 'none', stroke: '#ffd663', 'stroke-width': 2.4, 'stroke-linecap': 'round' }),
    element(documentObject, 'path', { d: 'M60 48 H72 L78 28 L84 57 L90 38 H104', fill: 'none', stroke: '#70d8ff', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
    element(documentObject, 'circle', { cx: 101, cy: 22, r: 5.5, fill: activeColour, stroke: '#d9f6ff', 'stroke-width': 1.5 }),
    element(documentObject, 'text', { x: 74, y: 18, fill: '#d9f6ff', 'font-size': 7.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, `${controls.lightLevelPercent}%`),
    element(documentObject, 'text', { x: 76, y: 69, fill: '#a8e6f6', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle' }, `T${controls.thresholdPercent} H${controls.hysteresisPercentagePoints}`),
    element(documentObject, 'text', { x: 24, y: 78, fill: '#d9f6ff', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle' }, 'VCC'),
    element(documentObject, 'text', { x: 60, y: 78, fill: '#d9f6ff', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle' }, 'GND'),
    element(documentObject, 'text', { x: 98.4, y: 78, fill: '#d9f6ff', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle' }, 'DOUT'),
    element(documentObject, 'line', { x1: 24, y1: 81, x2: 24, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 60, y1: 81, x2: 60, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 98.4, y1: 81, x2: 98.4, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'circle', { cx: 24, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': 'VCC' }),
    element(documentObject, 'circle', { cx: 60, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': 'GND' }),
    element(documentObject, 'circle', { cx: 98.4, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': 'DOUT' }),
  );
  return svg;
}
