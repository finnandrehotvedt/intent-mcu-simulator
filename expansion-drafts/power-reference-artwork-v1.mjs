// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { POWER_REFERENCE_DEFINITION, POWER_REFERENCE_RENDERER } from './power-reference-integration-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';
function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createPowerReferenceArtwork(documentObject, definition = POWER_REFERENCE_DEFINITION,
  component = { id: 'power-reference-preview', label: definition.displayName }, { thumbnail = false } = {}) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== POWER_REFERENCE_RENDERER) {
    throw new TypeError('POWER_REFERENCE_ARTWORK_CONTRACT');
  }
  const label = thumbnail ? definition.displayName : `${component.label}, ${definition.displayName}`;
  const svg = element(documentObject, 'svg', {
    class: `power-reference-artwork${thumbnail ? ' power-reference-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': POWER_REFERENCE_RENDERER,
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'line', { x1: 36, y1: 66, x2: 36, y2: 30, stroke: '#5ce1e6', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'circle', { cx: 36, cy: 66, r: 4.4, fill: '#08121c', stroke: '#a8ff3f', 'stroke-width': 2.5, 'data-terminal-pin': 'OUT' }),
    element(documentObject, 'path', { d: 'M20 31 L36 12 L52 31 Z', fill: '#a8ff3f', stroke: '#d9e7ee', 'stroke-width': 2 }),
    element(documentObject, 'text', { x: 36, y: 46, fill: '#d9e7ee', 'font-size': 10, 'font-family': 'system-ui, sans-serif', 'text-anchor': 'middle', 'font-weight': 700 }, '5 V'),
  );
  return svg;
}
