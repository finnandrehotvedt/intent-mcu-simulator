// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  ROTARY_ENCODER_DEFINITION,
  ROTARY_ENCODER_RENDERER,
  validateRotaryEncoderComponent,
} from './rotary-encoder-quadrature-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
function svg(documentObject, name, attributes = {}) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

export function createRotaryEncoderArtwork(
  documentObject,
  definition = ROTARY_ENCODER_DEFINITION,
  component,
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition?.artwork?.renderer !== ROTARY_ENCODER_RENDERER
      || !validateRotaryEncoderComponent(component)) throw new TypeError('ROTARY_ENCODER_ARTWORK');
  const root = svg(documentObject, 'svg', {
    viewBox: definition.artwork.viewBox.join(' '), width: definition.artwork.cssWidth,
    height: definition.artwork.cssHeight, role: 'img',
    'aria-label': `${component.label}, ideal A B COM quadrature encoder, detent ${component.controls.detent}`,
    'data-renderer': ROTARY_ENCODER_RENDERER,
  });
  const body = svg(documentObject, 'rect', { x: 14, y: 10, width: 100, height: 82, rx: 12, fill: '#17334a', stroke: '#66dff2', 'stroke-width': 2 });
  const plate = svg(documentObject, 'circle', { cx: 64, cy: 46, r: 29, fill: '#223e53', stroke: '#8ca7b7', 'stroke-width': 3 });
  const knob = svg(documentObject, 'circle', { cx: 64, cy: 46, r: 21, fill: '#9bacb5', stroke: '#dbe8ed', 'stroke-width': 2 });
  const angle = (component.controls.detent % 24) * 15;
  const marker = svg(documentObject, 'line', { x1: 64, y1: 28, x2: 64, y2: 38, stroke: '#102131', 'stroke-width': 4, 'stroke-linecap': 'round', transform: `rotate(${angle} 64 46)`, 'data-encoder-marker': String(component.controls.detent) });
  const caption = svg(documentObject, 'text', { x: 64, y: 82, fill: '#cce7ef', 'font-size': 8, 'font-family': 'system-ui, sans-serif', 'font-weight': 700, 'text-anchor': 'middle' });
  caption.textContent = thumbnail ? 'A/B' : `CCW  ${component.controls.detent}  CW`;
  root.append(body, plate, knob, marker, caption);
  for (const [id, x] of [['A', 25.6], ['COM', 64], ['B', 102.4]]) {
    root.append(svg(documentObject, 'line', { x1: x, y1: 92, x2: x, y2: 101.2, stroke: id === 'COM' ? '#202a30' : '#d5b457', 'stroke-width': 4 }));
    const terminal = svg(documentObject, 'circle', { cx: x, cy: 101.2, r: 4.5, fill: id === 'COM' ? '#1e2b32' : '#d5b457', stroke: '#f2f5f7', 'stroke-width': 1, 'data-terminal-pin': id });
    const label = svg(documentObject, 'text', { x, y: 91, fill: '#ecf8fb', 'font-size': 7, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle' });
    label.textContent = id;
    root.append(label, terminal);
  }
  return root;
}
