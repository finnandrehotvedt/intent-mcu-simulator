// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { FLOW_PULSE_SENSOR_TYPE, digitalPulseLevel } from './digital-pulse-sensors-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text; return node;
};

export function createDigitalPulseSensorArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) {
    throw new TypeError('DIGITAL_PULSE_SENSOR_ARTWORK');
  }
  const high = digitalPulseLevel(component);
  const root = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'data-artwork-key': definition.artwork.renderer,
    'aria-label': `${component.label}, manually authored output ${high ? 'high' : 'low'}` });
  root.append(
    el(documentObject, 'rect', { x: 10, y: 7, width: 100, height: 72, rx: 8,
      fill: '#102b3a', stroke: high ? '#a8ff3f' : '#43758a', 'stroke-width': 2 }),
    el(documentObject, 'text', { x: 60, y: 18, 'text-anchor': 'middle', fill: '#dbe8ed',
      'font-size': 8, 'font-family': 'sans-serif' }, high ? 'MANUAL LEVEL · HIGH' : 'MANUAL LEVEL · LOW'),
  );
  if (component.type === FLOW_PULSE_SENSOR_TYPE) {
    root.append(
      el(documentObject, 'path', { d: 'M18 44 H41 M79 44 H102', fill: 'none', stroke: '#5ce1e6', 'stroke-width': 8 }),
      el(documentObject, 'circle', { cx: 60, cy: 44, r: 21, fill: '#194c61', stroke: '#7ee7ff', 'stroke-width': 2 }),
      ...[0, 120, 240].map((angle) => el(documentObject, 'path', { d: 'M60 44 L60 27 Q71 31 67 41 Z',
        fill: high ? '#a8ff3f' : '#f4c84a', transform: `rotate(${angle} 60 44)` })),
      el(documentObject, 'circle', { cx: 60, cy: 44, r: 4, fill: '#dbe8ed' }),
    );
  } else {
    root.append(
      el(documentObject, 'line', { x1: 60, y1: 38, x2: 60, y2: 69, stroke: '#dbe8ed', 'stroke-width': 3 }),
    );
    for (const [index, angle] of [0, 120, 240].entries()) {
      const group = el(documentObject, 'g', { transform: `rotate(${angle} 60 39)` });
      group.append(
        el(documentObject, 'line', { x1: 60, y1: 39, x2: 60, y2: 24, stroke: '#7ee7ff', 'stroke-width': 3 }),
        el(documentObject, 'circle', { cx: 60, cy: 20, r: 7, fill: high ? '#a8ff3f' : ['#f4c84a', '#ff8290', '#5ce1e6'][index] }),
      );
      root.append(group);
    }
    root.append(el(documentObject, 'circle', { cx: 60, cy: 39, r: 5, fill: '#dbe8ed' }));
  }
  for (const [pin, x, color] of [['VCC', 22, '#ef3340'], ['GND', 60, '#dbe8ed'], ['OUT', 98, high ? '#a8ff3f' : '#5ce1e6']]) {
    root.append(
      el(documentObject, 'line', { x1: x, y1: 69, x2: x, y2: 88, stroke: color, 'stroke-width': 3 }),
      el(documentObject, 'circle', { cx: x, cy: 91, r: 4, fill: '#07111b', stroke: color,
        'stroke-width': 2, 'data-terminal-pin': pin }),
      el(documentObject, 'text', { x, y: 99, 'text-anchor': 'middle', fill: '#dbe8ed',
        'font-size': 7, 'font-family': 'sans-serif' }, pin),
    );
  }
  return root;
}
