// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  BALL_VIBRATION_SWITCH_TYPE,
  CONTACT_SENSOR_DEFINITIONS,
  FLOAT_SWITCH_TYPE,
  TILT_SWITCH_TYPE,
  contactSensorRuntimeState,
} from './contact-sensors-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createContactSensorArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition !== CONTACT_SENSOR_DEFINITIONS[component?.type]) {
    throw new TypeError('CONTACT_SENSOR_ARTWORK');
  }
  const { closed } = contactSensorRuntimeState(component);
  const root = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'data-artwork-key': definition.artwork.renderer,
    'aria-label': `${component.label}, ideal contact ${closed ? 'closed' : 'open'}` });
  root.append(el(documentObject, 'rect', { x: 10, y: 6, width: 106, height: 72, rx: 10,
    fill: '#0b1c29', stroke: '#3a7891', 'stroke-width': 2 }));
  if (component.type === FLOAT_SWITCH_TYPE) {
    root.append(
      el(documentObject, 'path', { d: 'M22 44 Q38 38 54 44 T86 44 T106 44 V62 H22 Z',
        fill: '#176c92', opacity: 0.75 }),
      el(documentObject, 'line', { x1: 64, y1: 18, x2: 64, y2: 54,
        stroke: '#dbe8ed', 'stroke-width': 3 }),
      el(documentObject, 'rect', { x: 49, y: closed ? 31 : 45, width: 30, height: 12, rx: 6,
        fill: closed ? '#a8ff3f' : '#ffd35c', stroke: '#effcff', 'stroke-width': 1.5 }),
      el(documentObject, 'text', { x: 64, y: 18, 'text-anchor': 'middle', fill: '#dbe8ed',
        'font-size': 7, 'font-family': 'sans-serif' }, closed ? 'LIQUID HIGH' : 'LIQUID LOW'),
    );
  } else if (component.type === TILT_SWITCH_TYPE) {
    const group = el(documentObject, 'g', {
      transform: closed ? 'rotate(18 63 39)' : 'rotate(-18 63 39)',
    });
    group.append(
      el(documentObject, 'rect', { x: 34, y: 25, width: 58, height: 28, rx: 14,
        fill: '#243b49', stroke: '#dbe8ed', 'stroke-width': 2 }),
      el(documentObject, 'circle', { cx: closed ? 79 : 47, cy: 39, r: 8,
        fill: closed ? '#a8ff3f' : '#ffd35c', stroke: '#fff5c2', 'stroke-width': 1.5 }),
      el(documentObject, 'line', { x1: 78, y1: 29, x2: 78, y2: 49,
        stroke: '#5ce1e6', 'stroke-width': 3 }),
    );
    root.append(group);
  } else if (component.type === BALL_VIBRATION_SWITCH_TYPE) {
    root.append(
      el(documentObject, 'path', { d: 'M38 50 C43 22 49 58 54 30 C59 58 65 22 70 50 C75 22 81 58 86 30',
        fill: 'none', stroke: closed ? '#a8ff3f' : '#ffd35c', 'stroke-width': 4,
        'stroke-linecap': 'round' }),
      el(documentObject, 'circle', { cx: 88, cy: 30, r: 7,
        fill: closed ? '#a8ff3f' : '#8797a5', stroke: '#dbe8ed', 'stroke-width': 1.5 }),
      ...[-1, 1].map((direction) => el(documentObject, 'path', {
        d: direction < 0 ? 'M29 25 Q22 34 29 43' : 'M97 25 Q104 34 97 43',
        fill: 'none', stroke: '#ff8290', 'stroke-width': closed ? 3 : 1, opacity: closed ? 1 : 0.35,
      })),
    );
  }
  root.append(
    el(documentObject, 'circle', { cx: 9, cy: 74, r: 4, fill: '#07111b', stroke: '#a8ff3f',
      'stroke-width': 2, 'data-terminal-pin': 'A' }),
    el(documentObject, 'circle', { cx: 117, cy: 74, r: 4, fill: '#07111b', stroke: '#a8ff3f',
      'stroke-width': 2, 'data-terminal-pin': 'B' }),
    el(documentObject, 'line', { x1: 9, y1: 74, x2: 42, y2: 74, stroke: '#5ce1e6', 'stroke-width': 4 }),
    el(documentObject, 'line', { x1: 42, y1: 71, x2: 84, y2: closed ? 71 : 57,
      stroke: '#5ce1e6', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    el(documentObject, 'line', { x1: 84, y1: 74, x2: 117, y2: 74, stroke: '#5ce1e6', 'stroke-width': 4 }),
    el(documentObject, 'text', { x: 9, y: 88, 'text-anchor': 'middle', fill: '#dbe8ed',
      'font-size': 7, 'font-family': 'sans-serif' }, 'A'),
    el(documentObject, 'text', { x: 117, y: 88, 'text-anchor': 'middle', fill: '#dbe8ed',
      'font-size': 7, 'font-family': 'sans-serif' }, 'B'),
  );
  return root;
}
