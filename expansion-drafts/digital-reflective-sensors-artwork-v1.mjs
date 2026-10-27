// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  IR_OBSTACLE_SENSOR_TYPE,
  LINE_TRACKING_SENSOR_TYPE,
  digitalReflectiveSensorActive,
} from './digital-reflective-sensors-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createDigitalReflectiveSensorArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) {
    throw new TypeError('DIGITAL_REFLECTIVE_SENSOR_ARTWORK');
  }
  const active = digitalReflectiveSensorActive(component);
  const root = el(documentObject, 'svg', {
    viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'data-artwork-key': definition.artwork.renderer,
    'aria-label': `${component.label}, active-low output ${active ? 'low' : 'high'}`,
  });
  root.append(
    el(documentObject, 'rect', { x: 10, y: 7, width: 100, height: 72, rx: 8,
      fill: '#33214b', stroke: active ? '#ffcc4d' : '#8569a8', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 17, y: 14, width: 86, height: 55, rx: 5,
      fill: '#1c1330', stroke: '#63488b', 'stroke-width': 1 }),
  );
  if (component.type === IR_OBSTACLE_SENSOR_TYPE) {
    root.append(
      el(documentObject, 'circle', { cx: 41, cy: 40, r: 11, fill: '#161c25',
        stroke: '#8be9fd', 'stroke-width': 2 }),
      el(documentObject, 'circle', { cx: 41, cy: 40, r: 4, fill: active ? '#ffcc4d' : '#53616c' }),
      el(documentObject, 'circle', { cx: 66, cy: 40, r: 11, fill: '#161c25',
        stroke: '#ff79c6', 'stroke-width': 2 }),
      el(documentObject, 'path', { d: 'M77 30 Q90 40 77 50 M82 25 Q101 40 82 55', fill: 'none',
        stroke: active ? '#ffcc4d' : '#7c698e', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      el(documentObject, 'rect', { x: 97, y: 24, width: 6, height: 32, rx: 2,
        fill: '#d7dce2', stroke: '#ffffff', 'stroke-width': 1 }),
    );
  } else if (component.type === LINE_TRACKING_SENSOR_TYPE) {
    root.append(
      el(documentObject, 'circle', { cx: 47, cy: 34, r: 10, fill: '#161c25',
        stroke: '#8be9fd', 'stroke-width': 2 }),
      el(documentObject, 'circle', { cx: 73, cy: 34, r: 10, fill: '#161c25',
        stroke: '#ff79c6', 'stroke-width': 2 }),
      el(documentObject, 'path', { d: 'M43 45 L38 58 M77 45 L82 58', fill: 'none',
        stroke: active ? '#ffcc4d' : '#7c698e', 'stroke-width': 2 }),
      el(documentObject, 'rect', { x: 27, y: 58, width: 66, height: 7, rx: 3,
        fill: active ? '#08090b' : '#e8eef2', stroke: '#9ba9b2', 'stroke-width': 1 }),
      el(documentObject, 'text', { x: 60, y: 54, 'text-anchor': 'middle', fill: '#cdb8e8',
        'font-size': 7, 'font-family': 'sans-serif' }, active ? 'DARK LINE' : 'LIGHT SURFACE'),
    );
  }
  for (const [pin, x, color] of [
    ['VCC', 22, '#ef3340'], ['GND', 60, '#dbe8ed'], ['OUT', 98, active ? '#ffcc4d' : '#5ce1e6'],
  ]) {
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
