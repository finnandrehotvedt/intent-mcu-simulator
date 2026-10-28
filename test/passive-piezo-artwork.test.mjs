// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPassivePiezoArtwork } from '../expansion-drafts/passive-piezo-artwork-v1.mjs';

class Node {
  constructor(name) { this.name = name; this.attributes = {}; this.children = []; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...children) { this.children.push(...children); }
  queryAll(predicate, output = []) { if (predicate(this)) output.push(this); for (const child of this.children) child.queryAll?.(predicate, output); return output; }
}
const documentObject = { createElementNS(_ns, name) { return new Node(name); } };

test('original passive piezo SVG exposes exact SIGNAL/GND terminals and bounded states', () => {
  const svg = createPassivePiezoArtwork(documentObject);
  assert.equal(svg.attributes['data-artwork-key'], 'output-passive-piezo');
  assert.equal(svg.attributes['data-drive-state'], 'rest');
  assert.equal(svg.attributes['data-transition-active'], 'false');
  assert.deepEqual(svg.queryAll((node) => node.attributes['data-terminal-pin']).map((node) => node.attributes['data-terminal-pin']), ['SIGNAL', 'GND']);
  assert.match(svg.attributes['aria-label'], /no audio or calibrated frequency/u);
});
