// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  ACTIVE_BUZZER_DEFINITION,
  ACTIVE_BUZZER_RENDERER,
} from './active-buzzer-module-v1.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(documentObject, name, attributes = {}, text = null) {
  const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

export function createActiveBuzzerArtwork(
  documentObject,
  definition = ACTIVE_BUZZER_DEFINITION,
  component = { id: 'active-buzzer-preview', label: definition.displayName },
  { thumbnail = false } = {},
) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== ACTIVE_BUZZER_RENDERER) {
    throw new TypeError('ACTIVE_BUZZER_ARTWORK_CONTRACT');
  }
  const label = thumbnail
    ? `${definition.displayName}, silent logical output indicator`
    : `${component.label}, disabled, silent logical active-buzzer indicator; no acoustic or current accuracy claimed`;
  const svg = element(documentObject, 'svg', {
    class: `active-buzzer-artwork${thumbnail ? ' active-buzzer-thumbnail' : ''}`,
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label,
    'data-artwork-key': ACTIVE_BUZZER_RENDERER,
    'data-enabled': 'false',
    'data-drive-state': 'idle',
  });
  svg.append(
    element(documentObject, 'title', {}, label),
    element(documentObject, 'rect', { x: 12, y: 8, width: 96, height: 65, rx: 9, fill: '#102d39', stroke: '#39d6e8', 'stroke-width': 2 }),
    element(documentObject, 'path', { d: 'M18 14 H102', stroke: '#74edf7', 'stroke-width': 1.4, opacity: 0.45 }),
    element(documentObject, 'circle', { cx: 60, cy: 39, r: 24, class: 'active-buzzer-disc', fill: '#17222a', stroke: '#8ba7b3', 'stroke-width': 2 }),
    element(documentObject, 'circle', { cx: 60, cy: 39, r: 8, fill: '#263b45', stroke: '#68808a', 'stroke-width': 1.5 }),
    element(documentObject, 'path', { d: 'M88 28 Q101 39 88 50', class: 'buzzer-wave buzzer-wave-near', fill: 'none', stroke: '#9cf545', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.18 }),
    element(documentObject, 'path', { d: 'M96 21 Q117 39 96 57', class: 'buzzer-wave buzzer-wave-far', fill: 'none', stroke: '#9cf545', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.12 }),
    element(documentObject, 'circle', { cx: 23, cy: 22, r: 3, class: 'buzzer-status', fill: '#53656d', stroke: '#91a7ae', 'stroke-width': 1 }),
    element(documentObject, 'text', { x: 23, y: 63, fill: '#7bdde8', 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, 'ACTIVE'),
    ...[
      ['VCC', 24, '#ffca59'], ['GND', 60, '#d9e4e5'], ['EN', 96, '#9cf545'],
    ].flatMap(([pin, x, color]) => [
      element(documentObject, 'text', { x, y: 81, fill: color, 'font-size': 6.5, 'font-family': 'ui-monospace, monospace', 'text-anchor': 'middle', 'font-weight': 800 }, pin),
      element(documentObject, 'line', { x1: x, y1: 83, x2: x, y2: 92, stroke: '#c9d2d4', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      element(documentObject, 'circle', { cx: x, cy: 92, r: 3.6, fill: '#23282d', stroke: '#d8e0df', 'stroke-width': 1.5, 'data-terminal-pin': pin }),
    ]),
  );
  return svg;
}
