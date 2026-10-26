// SPDX-License-Identifier: Apache-2.0
import { EMERGENCY_STOP_TYPE, FOOT_PEDAL_TYPE, REED_SWITCH_TYPE,
  safetyPedalRuntimeState } from './safety-pedal-inputs-v1.mjs';
const NS = 'http://www.w3.org/2000/svg';
const el = (d, n, a = {}, text = null) => { const x = d.createElementNS(NS, n); Object.entries(a).forEach(([k, v]) => x.setAttribute(k, String(v))); if (text !== null) x.textContent = text; return x; };
export function createSafetyPedalInputArtwork(documentObject, definition, component) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) throw new TypeError('SAFETY_PEDAL_ARTWORK');
  const { closed } = safetyPedalRuntimeState(component); const root = el(documentObject, 'svg', {
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'data-artwork-key': definition.artwork.renderer,
    'aria-label': `${component.label}, contact ${closed ? 'closed' : 'open'}` });
  root.append(el(documentObject, 'rect', { x: 12, y: 8, width: definition.artwork.cssWidth - 24, height: 68, rx: 11, fill: '#0b1c29', stroke: '#31526a', 'stroke-width': 2 }),
    el(documentObject, 'circle', { cx: 9, cy: 65, r: 4, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': 'A' }),
    el(documentObject, 'circle', { cx: definition.artwork.cssWidth - 9, cy: 65, r: 4, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': 'B' }),
    el(documentObject, 'line', { x1: 9, y1: 65, x2: 39, y2: 65, stroke: '#5ce1e6', 'stroke-width': 5 }),
    el(documentObject, 'line', { x1: 39, y1: 61, x2: definition.artwork.cssWidth - 39, y2: closed ? 61 : 42, stroke: '#5ce1e6', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    el(documentObject, 'line', { x1: definition.artwork.cssWidth - 39, y1: 65, x2: definition.artwork.cssWidth - 9, y2: 65, stroke: '#5ce1e6', 'stroke-width': 5 }));
  if (component.type === REED_SWITCH_TYPE) root.append(el(documentObject, 'rect', { x: 45, y: 18, width: 28, height: 10, rx: 3, fill: component.controls.magnetPresent ? '#a8ff3f' : '#8797a5' }));
  if (component.type === EMERGENCY_STOP_TYPE) root.append(el(documentObject, 'circle', { cx: definition.artwork.cssWidth / 2, cy: 26, r: 15, fill: component.controls.latched ? '#8b1725' : '#ef3340', stroke: '#ff9ba3', 'stroke-width': 2 }));
  if (component.type === FOOT_PEDAL_TYPE) root.append(el(documentObject, 'path', { d: 'M38 36 L92 26 L97 43 L42 52 Z', fill: component.controls.pressed ? '#a8ff3f' : '#8797a5', stroke: '#dbe8ed', 'stroke-width': 2 }));
  return root;
}
