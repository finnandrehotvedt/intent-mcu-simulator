// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  HALL_MAGNETIC_ANALOGUE_TYPE,
  WIND_DIRECTION_ANALOGUE_TYPE,
  analogueDirectionFieldValue,
} from './analogue-direction-field-sensors-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createAnalogueDirectionFieldArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) {
    throw new TypeError('ANALOGUE_DIRECTION_FIELD_ARTWORK');
  }
  const value = analogueDirectionFieldValue(component);
  const root = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'data-artwork-key': definition.artwork.renderer,
    'aria-label': component.type === WIND_DIRECTION_ANALOGUE_TYPE
      ? `${component.label}, ideal direction ${Math.round(value)} degrees`
      : `${component.label}, ideal signed field ratio ${value.toFixed(2)}` });
  root.append(
    el(documentObject, 'rect', { x: 10, y: 7, width: 100, height: 72, rx: 8,
      fill: '#172b3a', stroke: '#5bc1dc', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 17, y: 14, width: 86, height: 55, rx: 5,
      fill: '#0a1d29', stroke: '#2e748c', 'stroke-width': 1 }),
  );
  if (component.type === WIND_DIRECTION_ANALOGUE_TYPE) {
    const angle = (value - 90) * Math.PI / 180;
    const tipX = 60 + Math.cos(angle) * 23; const tipY = 42 + Math.sin(angle) * 23;
    root.append(
      el(documentObject, 'circle', { cx: 60, cy: 42, r: 25, fill: '#153646',
        stroke: '#9ce6f4', 'stroke-width': 2 }),
      ...['N', 'E', 'S', 'W'].map((label, index) => el(documentObject, 'text', {
        x: [60, 82, 60, 38][index], y: [23, 45, 65, 45][index], 'text-anchor': 'middle',
        fill: label === 'N' ? '#ff8290' : '#b6dce5', 'font-size': 7,
        'font-family': 'sans-serif', 'font-weight': 'bold',
      }, label)),
      el(documentObject, 'line', { x1: 60, y1: 42, x2: tipX, y2: tipY,
        stroke: '#ffd35c', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      el(documentObject, 'circle', { cx: 60, cy: 42, r: 4, fill: '#ffd35c' }),
      el(documentObject, 'text', { x: 60, y: 17, 'text-anchor': 'middle', fill: '#e8faff',
        'font-size': 7, 'font-family': 'sans-serif' }, `${Math.round(value)}° IDEAL`),
    );
  } else if (component.type === HALL_MAGNETIC_ANALOGUE_TYPE) {
    const magnitude = Math.abs(value); const polarity = value > 0 ? '+' : value < 0 ? '−' : '0';
    root.append(
      el(documentObject, 'path', { d: 'M42 25 V49 Q42 62 55 62 H65 Q78 62 78 49 V25 H67 V48 Q67 52 63 52 H57 Q53 52 53 48 V25 Z',
        fill: '#73838c', stroke: '#d9e5e9', 'stroke-width': 2 }),
      el(documentObject, 'rect', { x: 42, y: 25, width: 11, height: 14, fill: '#d84c5b' }),
      el(documentObject, 'rect', { x: 67, y: 25, width: 11, height: 14, fill: '#3f8ed0' }),
      el(documentObject, 'text', { x: 47.5, y: 35, 'text-anchor': 'middle', fill: '#fff',
        'font-size': 8, 'font-family': 'sans-serif', 'font-weight': 'bold' }, 'N'),
      el(documentObject, 'text', { x: 72.5, y: 35, 'text-anchor': 'middle', fill: '#fff',
        'font-size': 8, 'font-family': 'sans-serif', 'font-weight': 'bold' }, 'S'),
      ...Array.from({ length: 3 }, (_, index) => el(documentObject, 'path', {
        d: `M${51 + index * 4} 25 Q60 ${17 - index * 2} ${69 - index * 4} 25`, fill: 'none',
        stroke: value < 0 ? '#8fc9ff' : '#ff9eaa', 'stroke-width': 1 + magnitude * 2,
        opacity: 0.35 + magnitude * 0.65,
      })),
      el(documentObject, 'text', { x: 60, y: 18, 'text-anchor': 'middle', fill: '#e8faff',
        'font-size': 7, 'font-family': 'sans-serif' }, `${polarity}${Math.round(magnitude * 100)}% FIELD`),
    );
  }
  for (const [pin, x, color] of [
    ['VCC', 22, '#ef3340'], ['GND', 60, '#dbe8ed'], ['AOUT', 98, '#5ce1e6'],
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
