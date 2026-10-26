// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { LED_BAR_GRAPH_TYPE, RGB_COMMON_ANODE_TYPE, ROTARY_SELECTOR_TYPE } from './rotary-selector-indicators-v1.mjs';
const NS = 'http://www.w3.org/2000/svg';
const node = (documentObject, name, attrs = {}, text = null) => { const item = documentObject.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => item.setAttribute(key, String(value))); if (text !== null) item.textContent = text; return item; };
const lead = (documentObject, x, y1, y2, pin) => [node(documentObject, 'line', { x1: x, y1, x2: x, y2, stroke: '#cbd6d8', 'stroke-width': 3 }),
  node(documentObject, 'circle', { cx: x, cy: y2, r: 3, fill: '#17232b', stroke: '#dce7e8', 'data-terminal-pin': pin })];

export function createRotarySelectorIndicatorArtwork(documentObject, definition, component = { label: definition.displayName }, { thumbnail = false } = {}) {
  if (!documentObject?.createElementNS) throw new TypeError('ROTARY_SELECTOR_INDICATOR_ARTWORK');
  const svg = node(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img',
    'aria-label': `${component.label}; ${definition.support.limitations[0]}`, 'data-artwork-key': definition.artwork.renderer,
    class: thumbnail ? 'candidate-thumbnail' : 'candidate-artwork' });
  svg.append(node(documentObject, 'title', {}, component.label));
  if (definition.type === ROTARY_SELECTOR_TYPE) {
    svg.append(node(documentObject, 'circle', { cx: 66, cy: 52, r: 31, fill: '#273640', stroke: '#8ca4ad', 'stroke-width': 3 }),
      node(documentObject, 'circle', { cx: 66, cy: 52, r: 16, fill: '#111b21', stroke: '#d9e6e8', 'stroke-width': 2 }),
      node(documentObject, 'line', { x1: 66, y1: 52, x2: 66, y2: 28, stroke: '#70e4ff', 'stroke-width': 5, 'stroke-linecap': 'round' }));
    [24, 52, 80, 108].forEach((x, index) => svg.append(...lead(documentObject, x, 12, 5, `P${index + 1}`)));
    svg.append(...lead(documentObject, 66, 84, 106, 'COM'));
  } else if (definition.type === RGB_COMMON_ANODE_TYPE) {
    svg.append(node(documentObject, 'path', { d: 'M27 58 V36 A33 33 0 0 1 93 36 V58 Z', fill: '#22323b', stroke: '#dce8e9', 'stroke-width': 2 }),
      node(documentObject, 'circle', { cx: 60, cy: 38, r: 19, fill: '#41304b', stroke: '#eef7f8' }),
      node(documentObject, 'text', { x: 60, y: 42, 'text-anchor': 'middle', fill: '#fff', 'font-size': 9 }, 'ACTIVE LOW'));
    [['R', 17], ['G', 45], ['B', 73], ['COM', 103]].forEach(([pin, x]) => svg.append(...lead(documentObject, x, 70, 94, pin)));
  } else if (definition.type === LED_BAR_GRAPH_TYPE) {
    svg.append(node(documentObject, 'rect', { x: 8, y: 21, width: 172, height: 70, rx: 8, fill: '#172229', stroke: '#879aa1', 'stroke-width': 2 }));
    for (let index = 0; index < 10; index += 1) {
      const x = 14 + index * 17;
      svg.append(node(documentObject, 'rect', { x, y: 29, width: 13, height: 54, rx: 3, fill: '#26744a', stroke: '#67e39a', 'data-segment': index + 1 }));
      svg.append(...lead(documentObject, x + 6.5, 21, 5, `A${index + 1}`), ...lead(documentObject, x + 6.5, 91, 107, `K${index + 1}`));
    }
  } else throw new TypeError('ROTARY_SELECTOR_INDICATOR_ARTWORK_TYPE');
  return svg;
}
