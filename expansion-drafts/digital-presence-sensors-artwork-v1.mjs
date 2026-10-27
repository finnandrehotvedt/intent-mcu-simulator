// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  CAPACITIVE_TOUCH_TYPE,
  HALL_SWITCH_TYPE,
  PIR_MOTION_TYPE,
  digitalPresenceActive,
} from './digital-presence-sensors-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createDigitalPresenceSensorArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) {
    throw new TypeError('DIGITAL_PRESENCE_SENSOR_ARTWORK');
  }
  const active = digitalPresenceActive(component);
  const root = el(documentObject, 'svg', {
    viewBox: definition.artwork.viewBox.join(' '),
    role: 'img',
    'data-artwork-key': definition.artwork.renderer,
    'aria-label': `${component.label}, output ${active ? 'high' : 'low'}`,
  });
  root.append(
    el(documentObject, 'rect', { x: 10, y: 7, width: 100, height: 72, rx: 8,
      fill: '#123d37', stroke: active ? '#a8ff3f' : '#4f8f80', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 17, y: 14, width: 86, height: 55, rx: 5,
      fill: '#0b2624', stroke: '#2a6c61', 'stroke-width': 1 }),
  );
  if (component.type === CAPACITIVE_TOUCH_TYPE) {
    root.append(
      el(documentObject, 'circle', { cx: 60, cy: 40, r: 19,
        fill: active ? '#f4c84a' : '#b07f20', stroke: '#ffe79a', 'stroke-width': 2 }),
      el(documentObject, 'path', { d: 'M38 40 C42 25 49 19 60 17 M82 40 C78 25 71 19 60 17',
        fill: 'none', stroke: '#f4c84a', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      el(documentObject, 'text', { x: 60, y: 44, 'text-anchor': 'middle',
        fill: '#10221f', 'font-size': 10, 'font-family': 'sans-serif', 'font-weight': 700 }, 'TOUCH'),
    );
  } else if (component.type === PIR_MOTION_TYPE) {
    root.append(
      el(documentObject, 'circle', { cx: 60, cy: 39, r: 23,
        fill: active ? '#f7fff1' : '#d6ded8', stroke: '#effff2', 'stroke-width': 2 }),
      el(documentObject, 'path', { d: 'M38 39 H82 M41 29 H79 M41 49 H79 M60 16 V62 M49 19 C43 31 43 47 49 59 M71 19 C77 31 77 47 71 59',
        fill: 'none', stroke: '#91a69b', 'stroke-width': 1 }),
      el(documentObject, 'circle', { cx: 60, cy: 39, r: active ? 5 : 3, fill: active ? '#a8ff3f' : '#6f8077' }),
    );
  } else if (component.type === HALL_SWITCH_TYPE) {
    root.append(
      el(documentObject, 'rect', { x: 49, y: 25, width: 22, height: 29, rx: 3,
        fill: '#20272d', stroke: active ? '#a8ff3f' : '#8797a5', 'stroke-width': 2 }),
      el(documentObject, 'text', { x: 60, y: 43, 'text-anchor': 'middle',
        fill: '#dbe8ed', 'font-size': 9, 'font-family': 'sans-serif' }, 'HALL'),
      el(documentObject, 'path', { d: 'M31 24 V49 C31 65 46 65 46 49 V24 H39 V48 C39 54 38 56 35 56 C32 56 31 54 31 48 V24 Z',
        fill: active ? '#ef3340' : '#8b1725', stroke: '#ff9ba3', 'stroke-width': 1.5 }),
      el(documentObject, 'text', { x: 34.5, y: 21, 'text-anchor': 'middle',
        fill: '#ffb7bd', 'font-size': 7, 'font-family': 'sans-serif' }, 'N S'),
    );
  }
  const terminals = [
    ['VCC', 22, '#ef3340'], ['GND', 60, '#dbe8ed'], ['OUT', 98, active ? '#a8ff3f' : '#5ce1e6'],
  ];
  for (const [pin, x, color] of terminals) {
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
