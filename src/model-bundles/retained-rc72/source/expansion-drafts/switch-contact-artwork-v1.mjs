// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  SPDT_CONTACT_DEFINITION,
  SPDT_CONTACT_RENDERER,
  SPDT_TRANSITION_STATE,
} from './switch-contact-graph-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createSwitchContactArtwork(
  documentObject,
  definition = SPDT_CONTACT_DEFINITION,
  state = 'B',
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== SPDT_CONTACT_RENDERER
      || !['A', 'B', SPDT_TRANSITION_STATE].includes(state)) {
    throw new TypeError('SWITCH_CONTACT_ARTWORK_CONTRACT');
  }
  const stateLabel = state === SPDT_TRANSITION_STATE ? 'transition break' : `COM connected to ${state}`;
  const label = thumbnail ? definition.displayName : `${definition.displayName}, ${stateLabel}`;
  const leverY = state === 'A' ? 23 : state === 'B' ? 77 : 50;
  const svg = element(documentObject, 'svg', {
    class: `switch-contact-artwork state-${state.toLowerCase()}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': SPDT_CONTACT_RENDERER, 'data-switch-state': state,
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 18, y: 8, width: 114, height: 84, rx: 16, fill: '#0b1c29', stroke: '#31526a', 'stroke-width': 2 }),
    element(documentObject, 'line', { x1: 12, y1: 50, x2: 42, y2: 50, stroke: '#d9e7ee', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 108, y1: 23, x2: 138, y2: 23, stroke: '#d9e7ee', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'line', { x1: 108, y1: 77, x2: 138, y2: 77, stroke: '#d9e7ee', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    element(documentObject, 'circle', { cx: 42, cy: 50, r: 6, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 3 }),
    element(documentObject, 'circle', { cx: 108, cy: 23, r: 6, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 3 }),
    element(documentObject, 'circle', { cx: 108, cy: 77, r: 6, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 3 }),
    element(documentObject, 'line', { x1: 42, y1: 46, x2: state === SPDT_TRANSITION_STATE ? 82 : 105, y2: leverY, stroke: '#5ce1e6', 'stroke-width': 6, 'stroke-linecap': 'round', 'data-contact-lever': 'true' }),
    element(documentObject, 'circle', { cx: state === SPDT_TRANSITION_STATE ? 82 : 105, cy: leverY, r: 6, fill: '#5ce1e6' }),
    element(documentObject, 'text', { x: 28, y: 68, fill: '#a8ff3f', 'font-size': 8, 'font-family': 'system-ui, sans-serif', 'text-anchor': 'middle', 'font-weight': 800 }, 'COM'),
    element(documentObject, 'text', { x: 121, y: 18, fill: '#a8ff3f', 'font-size': 9, 'font-family': 'system-ui, sans-serif', 'font-weight': 800 }, 'A'),
    element(documentObject, 'text', { x: 121, y: 91, fill: '#a8ff3f', 'font-size': 9, 'font-family': 'system-ui, sans-serif', 'font-weight': 800 }, 'B'),
    element(documentObject, 'circle', { cx: 12, cy: 50, r: 3.2, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': 'COM' }),
    element(documentObject, 'circle', { cx: 138, cy: 23, r: 3.2, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': 'A' }),
    element(documentObject, 'circle', { cx: 138, cy: 77, r: 3.2, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': 'B' }),
  );
  return svg;
}
