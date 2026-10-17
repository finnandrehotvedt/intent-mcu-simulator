// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { parallelWireConflicts, separateParallelWireLanes } from '../src/wire-lane-rules.mjs';

const route = (netId, points) => ({ netId, points });

test('WIRE-LANE-01 detects positive collinear overlap in either segment direction', () => {
  const conflicts = parallelWireConflicts([
    route('signal', [{ x: 0, y: 2 }, { x: 10, y: 2 }]),
    route('ground', [{ x: 8, y: 2 }, { x: 3, y: 2 }]),
  ], { clearance: 2 });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, 'collinear-overlap');
  assert.equal(conflicts[0].overlap, 5);
});

test('WIRE-LANE-01 detects partial full and reversed vertical overlaps including short escapes', () => {
  for (const [first, second, overlap] of [
    [[{ x: 2, y: 0 }, { x: 2, y: 10 }], [{ x: 2, y: 4 }, { x: 2, y: 12 }], 6],
    [[{ x: 4, y: 1 }, { x: 4, y: 8 }], [{ x: 4, y: 8 }, { x: 4, y: 1 }], 7],
    [[{ x: 6, y: 0 }, { x: 6, y: 0.4 }], [{ x: 6, y: 0.1 }, { x: 6, y: 0.3 }], 0.2],
  ]) {
    const conflicts = parallelWireConflicts([route('a', first), route('b', second)], { clearance: 1 });
    assert.equal(conflicts.length, 1);
    assert(Math.abs(conflicts[0].overlap - overlap) < 1e-9);
  }
});

test('WIRE-LANE-01 permits crossings, endpoint contact and deliberate same-net trunks', () => {
  assert.deepEqual(parallelWireConflicts([
    route('a', [{ x: 0, y: 2 }, { x: 5, y: 2 }]),
    route('b', [{ x: 5, y: 2 }, { x: 5, y: 5 }]),
    route('c', [{ x: 3, y: 0 }, { x: 3, y: 4 }]),
    route('a', [{ x: 2, y: 2 }, { x: 7, y: 2 }]),
  ], { clearance: 1 }), []);
});

test('WIRE-LANE-01 assigns an interior parallel segment to a clear visible lane', () => {
  const result = separateParallelWireLanes([
    route('a', [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 9, y: 1 }, { x: 10, y: 1 }]),
    route('b', [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 9, y: 2 }, { x: 10, y: 2 }]),
  ], { clearance: 2, bounds: { left: -10, right: 20, top: -10, bottom: 20 } });
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.movedSegments, 1);
  assert.deepEqual(result.routes[1].points[0], { x: 0, y: 2 });
  assert.deepEqual(result.routes[1].points.at(-1), { x: 10, y: 2 });
});

test('WIRE-LANE-01 preserves accepted terminal escapes while separating an interior lane around bodies', () => {
  const result = separateParallelWireLanes([
    route('signal', [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 9, y: 2 }, { x: 10, y: 2 }]),
    route('ground', [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 9, y: 2 }, { x: 10, y: 2 }]),
  ], {
    clearance: 1,
    obstacles: [
      { left: -0.5, right: 0.5, top: 1.5, bottom: 2.5 },
      { left: 9.5, right: 10.5, top: 1.5, bottom: 2.5 },
    ],
    bounds: { left: -1, right: 11, top: 0, bottom: 4 },
  });
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.movedSegments, 1);
  assert.deepEqual(result.routes[1].points[0], { x: 0, y: 2 });
  assert.deepEqual(result.routes[1].points.at(-1), { x: 10, y: 2 });
});
