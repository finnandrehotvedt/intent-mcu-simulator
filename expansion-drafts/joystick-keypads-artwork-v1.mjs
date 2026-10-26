// SPDX-License-Identifier: Apache-2.0
import { ANALOG_JOYSTICK_TYPE, KEYPAD_3X4_TYPE, KEYPAD_4X4_TYPE } from './joystick-keypads-v1.mjs';
const NS = 'http://www.w3.org/2000/svg';
const n = (documentObject, name, attrs = {}, text = null) => { const item = documentObject.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => item.setAttribute(key, String(value))); if (text !== null) item.textContent = text; return item; };
export function createJoystickKeypadArtwork(documentObject, definition, component = { label: definition.displayName }, { thumbnail = false } = {}) {
  if (!documentObject?.createElementNS) throw new TypeError('JOYSTICK_KEYPAD_ARTWORK');
  const svg = n(documentObject, 'svg', { viewBox: definition.artwork.viewBox.join(' '), role: 'img', 'aria-label': `${component.label}; ${definition.support.limitations[0]}`,
    'data-artwork-key': definition.artwork.renderer, class: thumbnail ? 'candidate-thumbnail' : 'candidate-artwork' });
  svg.append(n(documentObject, 'title', {}, component.label));
  if (definition.type === ANALOG_JOYSTICK_TYPE) {
    svg.append(n(documentObject, 'rect', { x: 12, y: 15, width: 126, height: 88, rx: 10, fill: '#176b78', stroke: '#78ddec', 'stroke-width': 2 }),
      n(documentObject, 'circle', { cx: 74, cy: 53, r: 31, fill: '#263841', stroke: '#a9bcc2', 'stroke-width': 3 }),
      n(documentObject, 'circle', { cx: 74, cy: 53, r: 18, fill: '#111a20', stroke: '#e5eef0', 'stroke-width': 2 }),
      n(documentObject, 'circle', { cx: 120, cy: 82, r: 9, fill: '#e7c14c', stroke: '#fff0a7' }));
    ['VCC', 'GND', 'VRX', 'VRY', 'SW'].forEach((pin, index) => svg.append(n(documentObject, 'circle', { cx: 14 + index * 30, cy: 118, r: 3, fill: '#172229', stroke: '#dce8e9', 'data-terminal-pin': pin })));
  } else {
    const columns = definition.type === KEYPAD_3X4_TYPE ? 3 : 4;
    const labels = columns === 3 ? ['1','2','3','4','5','6','7','8','9','*','0','#'] : ['1','2','3','A','4','5','6','B','7','8','9','C','*','0','#','D'];
    svg.append(n(documentObject, 'rect', { x: 8, y: 15, width: columns === 3 ? 116 : 138, height: 94, rx: 8, fill: '#18252c', stroke: '#6f8992', 'stroke-width': 2 }));
    labels.forEach((label, index) => { const row = Math.floor(index / columns); const column = index % columns;
      svg.append(n(documentObject, 'rect', { x: 15 + column * 31, y: 22 + row * 21, width: 25, height: 16, rx: 3, fill: '#324650', stroke: '#9bb0b6' }),
        n(documentObject, 'text', { x: 27.5 + column * 31, y: 34 + row * 21, 'text-anchor': 'middle', fill: '#f4f8f8', 'font-size': 9 }, label)); });
    for (let row = 1; row <= 4; row += 1) svg.append(n(documentObject, 'circle', { cx: row * 24, cy: 118, r: 3, fill: '#172229', stroke: '#dce8e9', 'data-terminal-pin': `R${row}` }));
    for (let column = 1; column <= columns; column += 1) svg.append(n(documentObject, 'circle', { cx: column * 28, cy: 8, r: 3, fill: '#172229', stroke: '#dce8e9', 'data-terminal-pin': `C${column}` }));
  }
  return svg;
}
