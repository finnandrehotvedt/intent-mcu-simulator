// SPDX-License-Identifier: Apache-2.0
import { DC_MOTOR_ENCODER_DEFINITION, DC_MOTOR_ENCODER_RENDERER,
  validateDcMotorEncoderComponent } from './dc-motor-encoder-v1.mjs';
const NS = 'http://www.w3.org/2000/svg';
const add = (documentObject, parent, name, attributes = {}, text = '') => { const node = documentObject.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); node.textContent = text; parent.append(node); return node; };
export function createDcMotorEncoderArtwork(documentObject, definition = DC_MOTOR_ENCODER_DEFINITION, component) {
  if (!documentObject?.createElementNS || definition.artwork.renderer !== DC_MOTOR_ENCODER_RENDERER
      || !validateDcMotorEncoderComponent(component)) throw new TypeError('DC_MOTOR_ENCODER_ARTWORK');
  const svg = add(documentObject, { append() {} }, 'svg', { viewBox: '0 0 176 112', 'data-renderer': DC_MOTOR_ENCODER_RENDERER,
    role: 'img', 'aria-label': `${component.label}, independent motor command and encoder detent ${component.controls.detent}` });
  add(documentObject, svg, 'rect', { x: 38, y: 20, width: 100, height: 62, rx: 18, fill: '#dbeafe', stroke: '#1d4ed8' });
  add(documentObject, svg, 'circle', { cx: 88, cy: 51, r: 21, fill: '#fff', stroke: '#1d4ed8' });
  add(documentObject, svg, 'path', { d: 'M88 32 L96 49 L88 70 L80 49 Z', fill: '#60a5fa', 'data-encoder-marker': 'true' });
  add(documentObject, svg, 'text', { x: 88, y: 100, 'text-anchor': 'middle', 'font-size': 10 }, `encoder ${component.controls.detent}`);
  for (const item of definition.pins) add(documentObject, svg, 'circle', { cx: item.anchor.x * 176, cy: 101, r: 3,
    fill: '#111827', 'data-terminal-pin': item.id });
  return svg;
}
