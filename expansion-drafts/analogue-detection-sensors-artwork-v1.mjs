// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  FLAME_ANALOGUE_TYPE,
  RAIN_ANALOGUE_TYPE,
  SOUND_LEVEL_ANALOGUE_TYPE,
  analogueDetectionRatio,
} from './analogue-detection-sensors-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createAnalogueDetectionArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) {
    throw new TypeError('ANALOGUE_DETECTION_ARTWORK');
  }
  const ratio = analogueDetectionRatio(component);
  const percent = Math.round(ratio * 100);
  const root = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'data-artwork-key': definition.artwork.renderer,
    'aria-label': `${component.label}, ideal signal ${percent} percent` });
  root.append(
    el(documentObject, 'rect', { x: 10, y: 7, width: 100, height: 72, rx: 8,
      fill: '#172d3d', stroke: '#58bad6', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 17, y: 14, width: 86, height: 55, rx: 5,
      fill: '#0b1e2b', stroke: '#2d7188', 'stroke-width': 1 }),
  );
  if (component.type === RAIN_ANALOGUE_TYPE) {
    root.append(
      el(documentObject, 'rect', { x: 32, y: 22, width: 56, height: 38, rx: 3,
        fill: '#28546a', stroke: '#8ce2f2', 'stroke-width': 2 }),
      ...Array.from({ length: 5 }, (_, index) => el(documentObject, 'path', {
        d: `M${38 + index * 11} 28 V54`, stroke: index % 2 ? '#5ce1e6' : '#d5a84e',
        'stroke-width': 3, 'stroke-linecap': 'round',
      })),
      el(documentObject, 'path', { d: `M28 ${58 - ratio * 24} Q60 ${50 - ratio * 18} 92 ${58 - ratio * 24}`,
        fill: 'none', stroke: '#3abce8', 'stroke-width': 5, opacity: 0.85 }),
      el(documentObject, 'text', { x: 60, y: 20, 'text-anchor': 'middle', fill: '#d8f5ff',
        'font-size': 7, 'font-family': 'sans-serif' }, `${percent}% WET`),
    );
  } else if (component.type === SOUND_LEVEL_ANALOGUE_TYPE) {
    root.append(
      el(documentObject, 'circle', { cx: 48, cy: 42, r: 18, fill: '#303d47',
        stroke: '#c6d4dc', 'stroke-width': 2 }),
      el(documentObject, 'circle', { cx: 48, cy: 42, r: 9, fill: '#101820',
        stroke: '#7f919b', 'stroke-width': 1 }),
      ...Array.from({ length: 3 }, (_, index) => el(documentObject, 'path', {
        d: `M${67 + index * 7} ${34 - index * 3} Q${78 + index * 8} 42 ${67 + index * 7} ${50 + index * 3}`,
        fill: 'none', stroke: '#61dbf0', 'stroke-width': Math.max(1, ratio * 3),
      })),
      el(documentObject, 'text', { x: 60, y: 19, 'text-anchor': 'middle', fill: '#d8f5ff',
        'font-size': 7, 'font-family': 'sans-serif' }, `${percent}% LEVEL`),
    );
  } else if (component.type === FLAME_ANALOGUE_TYPE) {
    root.append(
      el(documentObject, 'path', { d: 'M60 17 C75 31 82 43 74 57 C69 66 52 68 44 57 C36 46 43 34 52 26 C54 36 61 38 64 45 C69 35 63 27 60 17 Z',
        fill: '#ff8c32', stroke: '#ffd15c', 'stroke-width': 2, opacity: 0.45 + ratio * 0.55 }),
      el(documentObject, 'path', { d: 'M59 37 C67 45 67 54 61 60 C54 59 50 54 52 49 C54 44 57 42 59 37 Z',
        fill: '#fff0a3', stroke: '#ffca55', 'stroke-width': 1 }),
      el(documentObject, 'text', { x: 60, y: 18, 'text-anchor': 'middle', fill: '#fff0d3',
        'font-size': 7, 'font-family': 'sans-serif' }, `${percent}% RESPONSE`),
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

