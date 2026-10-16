// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  TOGGLE_SWITCH_DEFINITION,
  TOGGLE_SWITCH_RENDERER,
} from './toggle-switch-integration-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createToggleSwitchArtwork(
  documentObject,
  definition = TOGGLE_SWITCH_DEFINITION,
  component = { id: 'toggle-switch-preview', label: definition.displayName, controls: { closed: false } },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== TOGGLE_SWITCH_RENDERER
      || typeof component?.controls?.closed !== 'boolean') throw new TypeError('TOGGLE_SWITCH_ARTWORK_CONTRACT');
  const closed = component.controls.closed;
  const label = thumbnail ? definition.displayName : `${component.label}, ${closed ? 'closed' : 'open'}`;
  const svg = element(documentObject, 'svg', {
    class: `toggle-switch-artwork${closed ? ' is-closed' : ' is-open'}${thumbnail ? ' toggle-switch-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': TOGGLE_SWITCH_RENDERER, 'data-switch-state': closed ? 'closed' : 'open',
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 18, y: 12, width: 76, height: 58, rx: 13, fill: '#0b1c29', stroke: '#31526a', 'stroke-width': 2 }),
    element(documentObject, 'line', { x1: 9, y1: 59, x2: 34, y2: 59, stroke: '#d9e7ee', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 78, y1: 59, x2: 103, y2: 59, stroke: '#d9e7ee', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'circle', { cx: 34, cy: 59, r: 6, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 3 }),
    element(documentObject, 'circle', { cx: 78, cy: 59, r: 6, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 3 }),
    element(documentObject, 'line', { x1: 34, y1: 54, x2: closed ? 78 : 71, y2: closed ? 54 : 27, stroke: '#5ce1e6', 'stroke-width': 6, 'stroke-linecap': 'round', 'data-toggle-lever': 'true' }),
    element(documentObject, 'circle', { cx: closed ? 78 : 71, cy: closed ? 54 : 27, r: 7, fill: '#5ce1e6' }),
    element(documentObject, 'text', { x: 56, y: 79, fill: '#a8ff3f', 'font-size': 9, 'font-family': 'system-ui, sans-serif', 'text-anchor': 'middle', 'font-weight': 800 }, closed ? 'CLOSED' : 'OPEN'),
    element(documentObject, 'circle', { cx: 8.96, cy: 59.04, r: 3.2, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': 'A' }),
    element(documentObject, 'circle', { cx: 103.04, cy: 59.04, r: 3.2, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': 'B' }),
  );
  return svg;
}
