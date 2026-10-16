// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  GROUND_REFERENCE_DEFINITION,
  GROUND_REFERENCE_RENDERER,
} from './ground-reference-integration-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createGroundReferenceArtwork(
  documentObject,
  definition = GROUND_REFERENCE_DEFINITION,
  component = { id: 'ground-reference-preview', label: definition.displayName },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== GROUND_REFERENCE_RENDERER) {
    throw new TypeError('GROUND_REFERENCE_ARTWORK_CONTRACT');
  }
  const label = thumbnail ? definition.displayName : `${component.label}, ${definition.displayName}`;
  const svg = element(documentObject, 'svg', {
    class: `ground-reference-artwork${thumbnail ? ' ground-reference-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': GROUND_REFERENCE_RENDERER,
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'line', { x1: 36, y1: 6, x2: 36, y2: 32, stroke: '#5ce1e6', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'circle', { cx: 36, cy: 6, r: 4.4, fill: '#08121c', stroke: '#a8ff3f', 'stroke-width': 2.5, 'data-terminal-pin': 'REF' }),
    element(documentObject, 'line', { x1: 17, y1: 34, x2: 55, y2: 34, stroke: '#d9e7ee', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 23, y1: 43, x2: 49, y2: 43, stroke: '#d9e7ee', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 29, y1: 52, x2: 43, y2: 52, stroke: '#d9e7ee', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'text', { x: 36, y: 67, fill: '#a8ff3f', 'font-size': 10, 'font-family': 'system-ui, sans-serif', 'text-anchor': 'middle', 'font-weight': 700 }, '0 V'),
  );
  return svg;
}
