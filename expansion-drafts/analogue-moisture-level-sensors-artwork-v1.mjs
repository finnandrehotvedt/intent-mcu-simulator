// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  ANALOGUE_WATER_LEVEL_TYPE,
  CAPACITIVE_SOIL_MOISTURE_TYPE,
  RESISTIVE_SOIL_MOISTURE_TYPE,
  analogueMoistureLevelRatio,
} from './analogue-moisture-level-sensors-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
const el = (documentObject, name, attributes = {}, text = null) => {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
};

export function createAnalogueMoistureLevelArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) {
    throw new TypeError('ANALOGUE_MOISTURE_LEVEL_ARTWORK');
  }
  const ratio = analogueMoistureLevelRatio(component);
  const percent = Math.round(ratio * 100);
  const root = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'data-artwork-key': definition.artwork.renderer,
    'aria-label': `${component.label}, ideal signal ${percent} percent` });
  root.append(
    el(documentObject, 'rect', { x: 10, y: 7, width: 100, height: 72, rx: 8,
      fill: '#173348', stroke: '#4fb8d6', 'stroke-width': 2 }),
    el(documentObject, 'rect', { x: 17, y: 14, width: 86, height: 55, rx: 5,
      fill: '#0d2231', stroke: '#2c7895', 'stroke-width': 1 }),
  );
  if (component.type === RESISTIVE_SOIL_MOISTURE_TYPE) {
    root.append(
      el(documentObject, 'rect', { x: 35, y: 20, width: 50, height: 16, rx: 3,
        fill: '#31536a', stroke: '#8ed7ea', 'stroke-width': 1.5 }),
      el(documentObject, 'path', { d: 'M43 36 V66 M54 36 V66 M66 36 V66 M77 36 V66',
        stroke: '#d6a84d', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      el(documentObject, 'path', { d: `M30 ${64 - ratio * 18} Q60 ${58 - ratio * 14} 90 ${64 - ratio * 18}`,
        fill: 'none', stroke: '#8b5e3c', 'stroke-width': 5 }),
      el(documentObject, 'text', { x: 60, y: 31, 'text-anchor': 'middle', fill: '#d8f5ff',
        'font-size': 8, 'font-family': 'sans-serif' }, `${percent}% SOIL`),
    );
  } else if (component.type === CAPACITIVE_SOIL_MOISTURE_TYPE) {
    root.append(
      el(documentObject, 'path', { d: 'M42 18 H78 V60 Q60 72 42 60 Z', fill: '#395d3b',
        stroke: '#97d89a', 'stroke-width': 2 }),
      el(documentObject, 'path', { d: 'M49 28 C68 28 68 36 51 36 C39 36 42 45 68 45 C82 45 79 54 51 55',
        fill: 'none', stroke: '#d6b45a', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
      el(documentObject, 'rect', { x: 42, y: 52, width: 36, height: 8 + ratio * 10,
        fill: '#397f9e', opacity: 0.7 }),
      el(documentObject, 'text', { x: 60, y: 25, 'text-anchor': 'middle', fill: '#e8ffe8',
        'font-size': 7, 'font-family': 'sans-serif' }, `${percent}% CAP`),
    );
  } else if (component.type === ANALOGUE_WATER_LEVEL_TYPE) {
    const height = 42 * ratio;
    root.append(
      el(documentObject, 'rect', { x: 39, y: 18, width: 42, height: 48, rx: 4,
        fill: '#273c48', stroke: '#8ed7ea', 'stroke-width': 2 }),
      el(documentObject, 'rect', { x: 42, y: 63 - height, width: 36, height,
        fill: '#32aee0', opacity: 0.8 }),
      ...Array.from({ length: 5 }, (_, index) => el(documentObject, 'line', {
        x1: 45, x2: 75, y1: 24 + index * 8, y2: 24 + index * 8,
        stroke: '#b7d8e7', 'stroke-width': 1,
      })),
      el(documentObject, 'text', { x: 60, y: 16, 'text-anchor': 'middle', fill: '#d8f5ff',
        'font-size': 7, 'font-family': 'sans-serif' }, `${percent}% LEVEL`),
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
