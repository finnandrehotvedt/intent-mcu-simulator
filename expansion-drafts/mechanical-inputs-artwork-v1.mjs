// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import { LIMIT_SWITCH_TYPE, NC_BUTTON_TYPE, SLIDE_SWITCH_TYPE, mechanicalRuntimeState } from './mechanical-inputs-v1.mjs';
const NS = 'http://www.w3.org/2000/svg';
const el = (d, n, a = {}, text = null) => { const x = d.createElementNS(NS, n); Object.entries(a).forEach(([k, v]) => x.setAttribute(k, String(v))); if (text !== null) x.textContent = text; return x; };
const line = (d, x1, y1, x2, y2, extra = {}) => el(d, 'line', { x1, y1, x2, y2, stroke: '#5ce1e6', 'stroke-width': 5, 'stroke-linecap': 'round', ...extra });
const terminal = (d, id, cx, cy) => el(d, 'circle', { cx, cy, r: 4, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': id });
export function createMechanicalInputArtwork(documentObject, definition, component, { thumbnail = false } = {}) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) throw new TypeError('MECHANICAL_INPUT_ARTWORK_CONTRACT');
  const state = mechanicalRuntimeState(component); const label = thumbnail ? definition.displayName : `${component.label}, ${state.kind === 'spst' ? (state.closed ? 'closed' : 'open') : state.selectedThrow}`;
  const svg = el(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': label, 'data-artwork-key': definition.artwork.renderer, 'data-contact-state': state.closed === undefined ? state.selectedThrow : (state.closed ? 'closed' : 'open') });
  svg.append(el(documentObject, 'title', {}, label), el(documentObject, 'rect', { x: 14, y: 10, width: definition.artwork.cssWidth - 28, height: definition.artwork.cssHeight - 20, rx: 10, fill: '#0b1c29', stroke: '#31526a', 'stroke-width': 2 }));
  if (component.type === NC_BUTTON_TYPE) {
    svg.append(terminal(documentObject, 'A', 8, 60), terminal(documentObject, 'B', 96, 60), line(documentObject, 8, 60, 34, 60), line(documentObject, 70, 60, 96, 60), line(documentObject, 34, 56, state.closed ? 70 : 64, state.closed ? 56 : 35), el(documentObject, 'rect', { x: 42, y: 17, width: 20, height: 17, rx: 5, fill: '#ffbf47' }));
  } else if (component.type === SLIDE_SWITCH_TYPE) {
    const y = state.selectedThrow === 'A' ? 31 : 65; svg.append(terminal(documentObject, 'COM', 10, 62), terminal(documentObject, 'A', 114, 31), terminal(documentObject, 'B', 114, 65), line(documentObject, 10, 62, 42, 62), line(documentObject, 42, 58, 102, y), el(documentObject, 'rect', { x: state.selectedThrow === 'A' ? 39 : 67, y: 18, width: 28, height: 20, rx: 4, fill: '#ffbf47' }));
  } else if (component.type === LIMIT_SWITCH_TYPE) {
    const y = state.selectedThrow === 'NC' ? 31 : 69; svg.append(terminal(documentObject, 'COM', 10, 66), terminal(documentObject, 'NC', 126, 31), terminal(documentObject, 'NO', 126, 69), line(documentObject, 10, 66, 43, 66), line(documentObject, 43, 62, 112, y), line(documentObject, 38, 20, component.controls.actuated ? 89 : 114, component.controls.actuated ? 28 : 12), el(documentObject, 'circle', { cx: component.controls.actuated ? 89 : 114, cy: component.controls.actuated ? 28 : 12, r: 7, fill: '#ffbf47' }));
  } else throw new TypeError('MECHANICAL_INPUT_TYPE');
  return svg;
}
