// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const WIRE_LANE_REQUIREMENT = 'WIRE-LANE-01';
const EPSILON = 1e-6;
const clone = (value) => structuredClone(value);

function orientation(left, right) {
  if (Math.abs(left.y - right.y) <= EPSILON && Math.abs(left.x - right.x) > EPSILON) return 'horizontal';
  if (Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) > EPSILON) return 'vertical';
  return null;
}

function segments(route) {
  return route.points.slice(0, -1).map((left, index) => ({
    route, index, left, right: route.points[index + 1], orientation: orientation(left, route.points[index + 1]),
    terminalEscape: index === 0,
  })).filter((segment) => segment.orientation);
}

function conflict(left, right, clearance) {
  if (left.route.netId === right.route.netId || left.orientation !== right.orientation) return null;
  const fixed = left.orientation === 'horizontal' ? 'y' : 'x';
  const moving = left.orientation === 'horizontal' ? 'x' : 'y';
  const distance = Math.abs(left.left[fixed] - right.left[fixed]);
  const overlap = Math.min(Math.max(left.left[moving], left.right[moving]), Math.max(right.left[moving], right.right[moving]))
    - Math.max(Math.min(left.left[moving], left.right[moving]), Math.min(right.left[moving], right.right[moving]));
  if (overlap <= EPSILON) return null;
  if (distance <= EPSILON) return { kind: 'collinear-overlap', distance, overlap };
  if (distance < clearance - EPSILON && !(left.terminalEscape || right.terminalEscape)) {
    return { kind: 'lane-clearance', distance, overlap };
  }
  return null;
}

export function parallelWireConflicts(routes, { clearance = 0 } = {}) {
  const all = routes.flatMap(segments);
  const conflicts = [];
  for (let left = 0; left < all.length; left += 1) {
    for (let right = left + 1; right < all.length; right += 1) {
      const detail = conflict(all[left], all[right], clearance);
      if (detail) conflicts.push({
        requirement: WIRE_LANE_REQUIREMENT,
        leftNet: all[left].route.netId, rightNet: all[right].route.netId,
        leftSegment: all[left].index, rightSegment: all[right].index,
        ...detail,
      });
    }
  }
  return conflicts;
}

function segmentHitsObstacle(left, right, obstacle) {
  const axis = orientation(left, right);
  if (axis === 'horizontal') {
    return left.y > obstacle.top + EPSILON && left.y < obstacle.bottom - EPSILON
      && Math.max(Math.min(left.x, right.x), obstacle.left) < Math.min(Math.max(left.x, right.x), obstacle.right) - EPSILON;
  }
  if (axis === 'vertical') {
    return left.x > obstacle.left + EPSILON && left.x < obstacle.right - EPSILON
      && Math.max(Math.min(left.y, right.y), obstacle.top) < Math.min(Math.max(left.y, right.y), obstacle.bottom) - EPSILON;
  }
  return false;
}

function hitsObstacle(points, obstacles) {
  return points.slice(0, -1).some((point, index) => {
    // The first and last segments are the already accepted named-terminal
    // escapes. Testing them against the endpoint component body makes every
    // otherwise safe lane candidate fail. Lane separation changes only an
    // interior section and its adjacent doglegs, so retain the accepted
    // escapes and body-check the interior geometry it can actually alter.
    if (index === 0 || index === points.length - 2) return false;
    return obstacles.some((obstacle) => segmentHitsObstacle(point, points[index + 1], obstacle));
  });
}

export function separateParallelWireLanes(routes, { clearance, obstacles = [], bounds = null } = {}) {
  if (!Number.isFinite(clearance) || clearance <= 0) throw new TypeError('WIRE_LANE_CLEARANCE');
  const separated = clone(routes);
  let movedSegments = 0;
  for (let routeIndex = 0; routeIndex < separated.length; routeIndex += 1) {
    const route = separated[routeIndex];
    for (let segmentIndex = 1; segmentIndex < route.points.length - 2; segmentIndex += 1) {
      const baseline = separated.slice(0, routeIndex + 1);
      const relevant = parallelWireConflicts(baseline, { clearance })
        .filter((item) => item.rightNet === route.netId && item.rightSegment === segmentIndex);
      if (!relevant.length) continue;
      const left = route.points[segmentIndex];
      const right = route.points[segmentIndex + 1];
      const axis = orientation(left, right);
      const fixed = axis === 'horizontal' ? 'y' : 'x';
      let accepted = null;
      for (const multiplier of [1, -1, 2, -2, 3, -3, 4, -4]) {
        const candidate = clone(route.points);
        candidate[segmentIndex][fixed] += clearance * multiplier;
        candidate[segmentIndex + 1][fixed] += clearance * multiplier;
        if (bounds && candidate.some((point) => point.x < bounds.left || point.x > bounds.right
          || point.y < bounds.top || point.y > bounds.bottom)) continue;
        if (hitsObstacle(candidate, obstacles)) continue;
        const trial = [...separated.slice(0, routeIndex), { ...route, points: candidate }];
        if (!parallelWireConflicts(trial, { clearance }).some((item) => item.rightNet === route.netId)) {
          accepted = candidate; break;
        }
      }
      if (accepted) { route.points = accepted; movedSegments += 1; }
    }
  }
  return { routes: separated, movedSegments, conflicts: parallelWireConflicts(separated, { clearance }) };
}
