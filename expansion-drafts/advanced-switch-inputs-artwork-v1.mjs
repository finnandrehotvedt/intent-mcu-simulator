// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import { DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE, advancedSwitchRuntimeState } from './advanced-switch-inputs-v1.mjs';
const NS = 'http://www.w3.org/2000/svg';
const el = (d, n, a = {}, text = null) => { const x = d.createElementNS(NS, n); Object.entries(a).forEach(([k, v]) => x.setAttribute(k, String(v))); if (text !== null) x.textContent = text; return x; };
const terminal = (d, id, cx, cy) => el(d, 'circle', { cx, cy, r: 4, fill: '#07111b', stroke: '#a8ff3f', 'stroke-width': 2, 'data-terminal-pin': id });
export function createAdvancedSwitchInputArtwork(documentObject, definition, component, { thumbnail = false } = {}) {
  if (!documentObject?.createElementNS || definition?.type !== component?.type) throw new TypeError('ADVANCED_SWITCH_ARTWORK');
  const state = advancedSwitchRuntimeState(component); const root = el(documentObject, 'svg', {
    viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'data-artwork-key': definition.artwork.renderer,
    'aria-label': `${component.label}, ${component.type === DIP_SWITCH_4_TYPE ? state.contacts.map((item) => item.closed ? 'on' : 'off').join(', ') : `detent ${state.detent}, button ${state.buttonClosed ? 'pressed' : 'released'}`}`,
  });
  root.append(el(documentObject, 'rect', { x: 12, y: 8, width: definition.artwork.cssWidth - 24,
    height: definition.artwork.cssHeight - 20, rx: 10, fill: '#0b1c29', stroke: '#31526a', 'stroke-width': 2 }));
  if (component.type === DIP_SWITCH_4_TYPE) {
    state.contacts.forEach(({ channel, closed }, index) => { const y = 28 + index * 19;
      root.append(terminal(documentObject, `${channel}A`, 10, y), terminal(documentObject, `${channel}B`, 122, y),
        el(documentObject, 'rect', { x: 42, y: y - 7, width: 48, height: 14, rx: 4, fill: '#17334a' }),
        el(documentObject, 'rect', { x: closed ? 68 : 44, y: y - 5, width: 20, height: 10, rx: 3, fill: closed ? '#a8ff3f' : '#ffbf47', 'data-dip-channel': channel, 'data-closed': String(closed) }),
        el(documentObject, 'text', { x: 28, y: y + 3, fill: '#cce7ef', 'font-size': 8 }, String(channel)));
    });
  } else if (component.type === ROTARY_ENCODER_BUTTON_TYPE) {
    const angle = (state.detent % 24) * 15;
    root.append(el(documentObject, 'circle', { cx: 70, cy: 48, r: 31, fill: '#223e53', stroke: '#66dff2', 'stroke-width': 3 }),
      el(documentObject, 'circle', { cx: 70, cy: 48, r: 21, fill: state.buttonClosed ? '#a8ff3f' : '#9bacb5', stroke: '#dbe8ed', 'stroke-width': 2, 'data-button-pressed': String(state.buttonClosed) }),
      el(documentObject, 'line', { x1: 70, y1: 28, x2: 70, y2: 39, stroke: '#102131', 'stroke-width': 4, transform: `rotate(${angle} 70 48)`, 'data-encoder-marker': state.detent }));
    [['A', 17], ['COM', 43], ['B', 69], ['SW', 97], ['SWCOM', 125]].forEach(([id, x]) => root.append(terminal(documentObject, id, x, 106)));
  } else throw new TypeError('ADVANCED_SWITCH_INPUT_TYPE');
  if (!thumbnail) root.append(el(documentObject, 'title', {}, component.label));
  return root;
}
