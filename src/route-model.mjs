// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const ROUTE_SCHEMA = 'intent-mcu-route@1';
export const ROUTE_GRID = 0.01;
export const ROUTE_POINT_LIMIT = 32;

const EPSILON = 1e-7;
const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)
  && point.x >= -1 && point.x <= 2 && point.y >= -1 && point.y <= 2;
const samePoint = (left, right) => Math.abs(left.x - right.x) < EPSILON
  && Math.abs(left.y - right.y) < EPSILON;
const aligned = (left, right) => Math.abs(left.x - right.x) < EPSILON
  || Math.abs(left.y - right.y) < EPSILON;

function ownObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!ownObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function cleanNumber(value) {
  const rounded = Math.round(value * 100_000) / 100_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function cleanPoint(point) {
  return { x: cleanNumber(point.x), y: cleanNumber(point.y) };
}

export function snapRouteCoordinate(value, grid = ROUTE_GRID) {
  if (!Number.isFinite(value) || !Number.isFinite(grid) || grid <= 0) throw new TypeError('ROUTE_GRID');
  return cleanNumber(Math.round(value / grid) * grid);
}

export function routeSegmentOrientation(left, right) {
  if (Math.abs(left.y - right.y) < EPSILON && Math.abs(left.x - right.x) >= EPSILON) return 'horizontal';
  if (Math.abs(left.x - right.x) < EPSILON && Math.abs(left.y - right.y) >= EPSILON) return 'vertical';
  return null;
}

export function normalizeOrthogonalPath(points) {
  if (!Array.isArray(points) || points.some((point) => !finitePoint(point))) throw new TypeError('ROUTE_POINT');
  const compact = [];
  for (const value of points.map(cleanPoint)) {
    if (!compact.length || !samePoint(compact.at(-1), value)) compact.push(value);
  }
  let changed = true;
  while (changed && compact.length > 2) {
    changed = false;
    for (let index = 1; index < compact.length - 1; index += 1) {
      const before = compact[index - 1];
      const point = compact[index];
      const after = compact[index + 1];
      const collinear = (Math.abs(before.x - point.x) < EPSILON && Math.abs(point.x - after.x) < EPSILON)
        || (Math.abs(before.y - point.y) < EPSILON && Math.abs(point.y - after.y) < EPSILON);
      if (collinear) {
        compact.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  if (compact.some((point, index) => index && !aligned(compact[index - 1], point))) {
    throw new TypeError('ROUTE_NOT_ORTHOGONAL');
  }
  return compact;
}

function pointKey(point) {
  const clean = cleanPoint(point);
  return `${clean.x}:${clean.y}`;
}

function between(value, left, right) {
  return value >= Math.min(left, right) - EPSILON && value <= Math.max(left, right) + EPSILON;
}

function segmentIntersectionPoints(firstStart, firstEnd, secondStart, secondEnd) {
  const firstOrientation = routeSegmentOrientation(firstStart, firstEnd);
  const secondOrientation = routeSegmentOrientation(secondStart, secondEnd);
  if (!firstOrientation || !secondOrientation) return [];
  if (firstOrientation !== secondOrientation) {
    const horizontalStart = firstOrientation === 'horizontal' ? firstStart : secondStart;
    const horizontalEnd = firstOrientation === 'horizontal' ? firstEnd : secondEnd;
    const verticalStart = firstOrientation === 'vertical' ? firstStart : secondStart;
    const verticalEnd = firstOrientation === 'vertical' ? firstEnd : secondEnd;
    const intersection = cleanPoint({ x: verticalStart.x, y: horizontalStart.y });
    return between(intersection.x, horizontalStart.x, horizontalEnd.x)
      && between(intersection.y, verticalStart.y, verticalEnd.y) ? [intersection] : [];
  }
  const fixedAxis = firstOrientation === 'horizontal' ? 'y' : 'x';
  const movingAxis = firstOrientation === 'horizontal' ? 'x' : 'y';
  if (Math.abs(firstStart[fixedAxis] - secondStart[fixedAxis]) >= EPSILON) return [];
  const overlapStart = Math.max(
    Math.min(firstStart[movingAxis], firstEnd[movingAxis]),
    Math.min(secondStart[movingAxis], secondEnd[movingAxis]),
  );
  const overlapEnd = Math.min(
    Math.max(firstStart[movingAxis], firstEnd[movingAxis]),
    Math.max(secondStart[movingAxis], secondEnd[movingAxis]),
  );
  if (overlapStart > overlapEnd + EPSILON) return [];
  const point = (coordinate) => cleanPoint({
    x: firstOrientation === 'horizontal' ? coordinate : firstStart.x,
    y: firstOrientation === 'horizontal' ? firstStart.y : coordinate,
  });
  return Math.abs(overlapStart - overlapEnd) < EPSILON
    ? [point(overlapStart)] : [point(overlapStart), point(overlapEnd)];
}

function segmentProgress(start, end, point) {
  const axis = Math.abs(start.x - end.x) >= EPSILON ? 'x' : 'y';
  return (point[axis] - start[axis]) / (end[axis] - start[axis]);
}

function eraseClosedOrthogonalLoops(points) {
  const normalized = normalizeOrthogonalPath(points);
  const splits = normalized.slice(0, -1).map((point, index) => [point, normalized[index + 1]]);
  for (let first = 0; first < splits.length; first += 1) {
    for (let second = first + 2; second < splits.length; second += 1) {
      for (const intersection of segmentIntersectionPoints(
        normalized[first], normalized[first + 1], normalized[second], normalized[second + 1],
      )) {
        splits[first].push(intersection);
        splits[second].push(intersection);
      }
    }
  }
  const expanded = [];
  for (let index = 0; index < splits.length; index += 1) {
    const start = normalized[index]; const end = normalized[index + 1];
    const ordered = [...new Map(splits[index].map((point) => [pointKey(point), cleanPoint(point)])).values()]
      .sort((left, right) => segmentProgress(start, end, left) - segmentProgress(start, end, right));
    for (const point of ordered) if (!expanded.length || !samePoint(expanded.at(-1), point)) expanded.push(point);
  }
  const stack = [];
  const positions = new Map();
  for (const point of expanded) {
    const key = pointKey(point);
    if (positions.has(key)) {
      const keep = positions.get(key);
      for (let index = stack.length - 1; index > keep; index -= 1) positions.delete(pointKey(stack[index]));
      stack.length = keep + 1;
    } else {
      positions.set(key, stack.length);
      stack.push(point);
    }
  }
  return normalizeOrthogonalPath(stack);
}

function containsMovedSection(points, orientation, target, movedLeft, movedRight) {
  const movingAxis = orientation === 'horizontal' ? 'x' : 'y';
  const fixedAxis = orientation === 'horizontal' ? 'y' : 'x';
  const movedStart = Math.min(movedLeft[movingAxis], movedRight[movingAxis]);
  const movedEnd = Math.max(movedLeft[movingAxis], movedRight[movingAxis]);
  return points.slice(0, -1).some((point, index) => {
    const next = points[index + 1];
    if (routeSegmentOrientation(point, next) !== orientation
        || Math.abs(point[fixedAxis] - target) >= EPSILON) return false;
    const overlap = Math.min(movedEnd, Math.max(point[movingAxis], next[movingAxis]))
      - Math.max(movedStart, Math.min(point[movingAxis], next[movingAxis]));
    return overlap > EPSILON;
  });
}

function appendOrthogonal(points, target, preference = 'horizontal') {
  const from = points.at(-1);
  if (samePoint(from, target)) return;
  if (!aligned(from, target)) {
    points.push(preference === 'horizontal'
      ? cleanPoint({ x: target.x, y: from.y })
      : cleanPoint({ x: from.x, y: target.y }));
  }
  if (!samePoint(points.at(-1), target)) points.push(cleanPoint(target));
}

function appendAfterDerivedEscape(points, target, anchor) {
  const from = points.at(-1);
  if (samePoint(from, target)) return;
  const direction = anchorDirection(anchor);
  const alignedWithEscapeAxis = direction.x
    ? Math.abs(from.y - target.y) < EPSILON
    : Math.abs(from.x - target.x) < EPSILON;
  const along = direction.x
    ? (target.x - from.x) * direction.x
    : (target.y - from.y) * direction.y;
  if (alignedWithEscapeAxis && along < -EPSILON) {
    const axis = direction.x ? 'y' : 'x';
    const positive = from[axis] + ROUTE_GRID * 4 <= 2;
    points.push(cleanPoint({ ...from, [axis]: from[axis] + (positive ? ROUTE_GRID * 4 : -ROUTE_GRID * 4) }));
  }
  appendOrthogonal(points, target, direction.x ? 'vertical' : 'horizontal');
}

function anchorDirection(anchor) {
  return {
    x: Math.sign(cleanNumber(anchor.escape.x - anchor.pin.x)),
    y: Math.sign(cleanNumber(anchor.escape.y - anchor.pin.y)),
  };
}

function segmentHitsObstacle(start, end, obstacle) {
  const orientation = routeSegmentOrientation(start, end);
  if (orientation === 'horizontal') {
    if (start.y <= obstacle.top + EPSILON || start.y >= obstacle.bottom - EPSILON) return false;
    return Math.max(Math.min(start.x, end.x), obstacle.left) < Math.min(Math.max(start.x, end.x), obstacle.right) - EPSILON;
  }
  if (orientation === 'vertical') {
    if (start.x <= obstacle.left + EPSILON || start.x >= obstacle.right - EPSILON) return false;
    return Math.max(Math.min(start.y, end.y), obstacle.top) < Math.min(Math.max(start.y, end.y), obstacle.bottom) - EPSILON;
  }
  return false;
}

function routeHitsObstacle(points, obstacles) {
  return points.slice(0, -1).some((point, index) =>
    obstacles.some((obstacle) => segmentHitsObstacle(point, points[index + 1], obstacle)));
}

function routeLength(points) {
  return points.slice(0, -1).reduce((length, point, index) => {
    const next = points[index + 1];
    return length + Math.abs(next.x - point.x) + Math.abs(next.y - point.y);
  }, 0);
}

function safeBranchToHub(escape, hub, channel, obstacles, margin) {
  const detours = channel.axis === 'horizontal'
    ? [escape.x, ...obstacles.flatMap((item) => [item.left - margin, item.right + margin])]
    : [escape.y, ...obstacles.flatMap((item) => [item.top - margin, item.bottom + margin])];
  const candidates = [];
  for (const coordinate of [...new Set(detours.map(cleanNumber))].filter((value) => value >= -1 && value <= 2)) {
    const points = normalizeOrthogonalPath(channel.axis === 'horizontal'
      ? [escape, { x: coordinate, y: escape.y }, { x: coordinate, y: hub.y }, hub]
      : [escape, { x: escape.x, y: coordinate }, { x: hub.x, y: coordinate }, hub]);
    if (routeHitsObstacle(points, obstacles)) continue;
    candidates.push({
      points,
      score: routeLength(points) + Math.max(0, points.length - 2) * ROUTE_GRID,
      order: candidates.length,
    });
  }
  candidates.sort((left, right) => left.score - right.score || left.order - right.order);
  return candidates[0]?.points ?? null;
}

function obstacleSafeDefaultFamily(net, anchors, obstacles) {
  if (!Array.isArray(obstacles) || !obstacles.length) return null;
  const escapes = net.endpoints.map((endpoint) => anchors[endpointKey(endpoint)]?.escape);
  if (escapes.some((escape) => !finitePoint(escape))) return null;
  const margin = ROUTE_GRID * 3;
  const horizontalCoordinates = [...escapes.map((point) => point.y),
    ...obstacles.flatMap((item) => [item.top - margin, item.bottom + margin])];
  const verticalCoordinates = [...escapes.map((point) => point.x),
    ...obstacles.flatMap((item) => [item.left - margin, item.right + margin])];
  const channels = [
    ...horizontalCoordinates.map((coordinate) => ({ axis: 'horizontal', coordinate })),
    ...verticalCoordinates.map((coordinate) => ({ axis: 'vertical', coordinate })),
  ].filter((channel, index, all) => channel.coordinate >= -1 && channel.coordinate <= 2
    && all.findIndex((candidate) => candidate.axis === channel.axis
      && Math.abs(candidate.coordinate - channel.coordinate) < EPSILON) === index);
  const candidates = [];
  for (const channel of channels) {
    const hub = cleanPoint(channel.axis === 'horizontal'
      ? { x: escapes.reduce((sum, point) => sum + point.x, 0) / escapes.length, y: channel.coordinate }
      : { x: channel.coordinate, y: escapes.reduce((sum, point) => sum + point.y, 0) / escapes.length });
    const branches = net.endpoints.map((endpoint, index) => {
      const escape = cleanPoint(escapes[index]);
      const points = safeBranchToHub(escape, hub, channel, obstacles, margin);
      return points ? { endpoint: clone(endpoint), points } : null;
    });
    if (branches.some((branch) => !branch)) continue;
    const score = branches.reduce((total, branch) => total + routeLength(branch.points), 0);
    candidates.push({ score, family: { schema: ROUTE_SCHEMA, branches } });
  }
  candidates.sort((left, right) => left.score - right.score);
  return candidates[0]?.family ?? null;
}

function routeHub(net, storedRoute, anchors) {
  if (Array.isArray(storedRoute) && storedRoute.length) return cleanPoint(storedRoute.at(-1));
  if (storedRoute?.schema === ROUTE_SCHEMA) {
    const last = storedRoute.branches[0]?.points.at(-1);
    if (last) return cleanPoint(last);
  }
  const escapes = net.endpoints.map((endpoint) => anchors[endpointKey(endpoint)]?.escape).filter(Boolean);
  if (escapes.length !== net.endpoints.length) throw new TypeError('ROUTE_ANCHOR_MISSING');
  if (net.endpoints.length === 2) {
    const endpointAnchors = net.endpoints.map((endpoint) => anchors[endpointKey(endpoint)]);
    const directions = endpointAnchors.map(anchorDirection);
    const verticalIndex = directions.findIndex((direction) => direction.y !== 0 && direction.x === 0);
    const horizontalIndex = directions.findIndex((direction) => direction.x !== 0 && direction.y === 0);
    if (verticalIndex >= 0 && horizontalIndex >= 0) {
      return cleanPoint({
        x: escapes[horizontalIndex].x + directions[horizontalIndex].x * ROUTE_GRID * 4,
        y: escapes[verticalIndex].y + directions[verticalIndex].y * ROUTE_GRID * 4,
      });
    }
    if (directions.every((direction) => direction.y === 1 && direction.x === 0)) {
      return cleanPoint({
        x: (escapes[0].x + escapes[1].x) / 2,
        y: Math.max(escapes[0].y, escapes[1].y) + ROUTE_GRID * 4,
      });
    }
    if (directions.every((direction) => direction.y === -1 && direction.x === 0)) {
      return cleanPoint({
        x: (escapes[0].x + escapes[1].x) / 2,
        y: Math.min(escapes[0].y, escapes[1].y) - ROUTE_GRID * 4,
      });
    }
    if (directions.every((direction) => direction.x === 1 && direction.y === 0)) {
      return cleanPoint({
        x: Math.max(escapes[0].x, escapes[1].x) + ROUTE_GRID * 4,
        y: (escapes[0].y + escapes[1].y) / 2,
      });
    }
    if (directions.every((direction) => direction.x === -1 && direction.y === 0)) {
      return cleanPoint({
        x: Math.min(escapes[0].x, escapes[1].x) - ROUTE_GRID * 4,
        y: (escapes[0].y + escapes[1].y) / 2,
      });
    }
  }
  return cleanPoint({
    x: escapes.reduce((sum, point) => sum + point.x, 0) / escapes.length,
    y: escapes.reduce((sum, point) => sum + point.y, 0) / escapes.length,
  });
}

function branchTargets(endpoint, storedRoute, anchors, hub) {
  const key = endpointKey(endpoint);
  const anchor = anchors[key];
  if (!anchor || !finitePoint(anchor.pin) || !finitePoint(anchor.escape)) throw new TypeError('ROUTE_ANCHOR_MISSING');
  if (storedRoute?.schema === ROUTE_SCHEMA) {
    const branch = storedRoute.branches.find((item) => endpointKey(item.endpoint) === key);
    if (!branch) throw new TypeError('ROUTE_BRANCH_MISSING');
    // The accepted branch points are user-owned world geometry. The escape is
    // derived from the current transformed terminal, so prepend it without
    // rewriting the stored family when a part moves or rotates.
    return [anchor.escape, ...branch.points];
  }
  if (Array.isArray(storedRoute) && storedRoute.length) return [anchor.escape, ...storedRoute];
  const direction = anchorDirection(anchor);
  const outsideCorner = direction.y
    ? { x: anchor.escape.x, y: hub.y }
    : { x: hub.x, y: anchor.escape.y };
  return [anchor.escape, outsideCorner, hub];
}

export function isRouteFamily(value) {
  return value?.schema === ROUTE_SCHEMA && Array.isArray(value.branches);
}

export function normalizeStoredRoute(value, net) {
  if (Array.isArray(value)) {
    if (value.length > 8 || value.some((point) => !exactKeys(point, ['x', 'y'])
        || !Number.isFinite(point.x) || !Number.isFinite(point.y)
        || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null;
    return value.map(cleanPoint);
  }
  if (!exactKeys(value, ['schema', 'branches']) || value.schema !== ROUTE_SCHEMA
      || !Array.isArray(value.branches) || value.branches.length !== net.endpoints.length) return null;
  const expected = new Set(net.endpoints.map(endpointKey));
  const seen = new Set();
  const branches = [];
  let hub = null;
  for (const branch of value.branches) {
    if (!exactKeys(branch, ['endpoint', 'points']) || !exactKeys(branch.endpoint, ['component', 'pin'])
        || typeof branch.endpoint.component !== 'string' || typeof branch.endpoint.pin !== 'string'
        || !Array.isArray(branch.points) || branch.points.length < 1
        || branch.points.length > ROUTE_POINT_LIMIT || branch.points.some((point) => !exactKeys(point, ['x', 'y']) || !finitePoint(point))) return null;
    const key = endpointKey(branch.endpoint);
    if (!expected.has(key) || seen.has(key)) return null;
    let points;
    try { points = normalizeOrthogonalPath(branch.points); } catch { return null; }
    if (!points.length) return null;
    const branchHub = points.at(-1);
    if (hub && !samePoint(hub, branchHub)) return null;
    hub = branchHub;
    seen.add(key);
    branches.push({ endpoint: clone(branch.endpoint), points });
  }
  if (seen.size !== expected.size) return null;
  branches.sort((left, right) => endpointKey(left.endpoint).localeCompare(endpointKey(right.endpoint)));
  return { schema: ROUTE_SCHEMA, branches };
}

export function materializeRouteFamily(net, storedRoute, anchors, obstacles = []) {
  if (storedRoute === null || storedRoute === undefined) {
    const routed = obstacleSafeDefaultFamily(net, anchors, obstacles);
    if (routed) {
      const normalized = normalizeStoredRoute(routed, net);
      if (!normalized) throw new TypeError('ROUTE_FAMILY');
      return normalized;
    }
  }
  const hub = routeHub(net, storedRoute, anchors);
  const branches = net.endpoints.map((endpoint) => {
    const key = endpointKey(endpoint);
    const anchor = anchors[key];
    const full = [cleanPoint(anchor.pin)];
    const targets = branchTargets(endpoint, storedRoute, anchors, hub);
    targets.forEach((target, index) => {
      if (storedRoute?.schema === ROUTE_SCHEMA && index === 1) appendAfterDerivedEscape(full, target, anchor);
      else appendOrthogonal(full, target, index % 2 ? 'vertical' : 'horizontal');
    });
    appendOrthogonal(full, hub, 'horizontal');
    const normalized = normalizeOrthogonalPath(full);
    return { endpoint: clone(endpoint), points: normalized.slice(1) };
  });
  const family = normalizeStoredRoute({ schema: ROUTE_SCHEMA, branches }, net);
  if (!family) throw new TypeError('ROUTE_FAMILY');
  return family;
}

export function routeFamilyPaths(family, anchors) {
  return family.branches.map((branch) => {
    const key = endpointKey(branch.endpoint);
    const pin = anchors[key]?.pin;
    if (!pin) throw new TypeError('ROUTE_ANCHOR_MISSING');
    return { endpoint: clone(branch.endpoint), points: normalizeOrthogonalPath([pin, ...branch.points]) };
  });
}

export function moveRouteSegment(family, anchors, endpoint, segmentIndex, coordinate, net) {
  const key = typeof endpoint === 'string' ? endpoint : endpointKey(endpoint);
  const paths = routeFamilyPaths(family, anchors);
  const selected = paths.find((branch) => endpointKey(branch.endpoint) === key);
  if (!selected || !Number.isInteger(segmentIndex) || segmentIndex < 0
      || segmentIndex >= selected.points.length - 1) throw new TypeError('ROUTE_SEGMENT');
  const left = selected.points[segmentIndex];
  const right = selected.points[segmentIndex + 1];
  const originalPointCount = selected.points.length;
  const orientation = routeSegmentOrientation(left, right);
  if (!orientation) throw new TypeError('ROUTE_SEGMENT');
  const axis = orientation === 'horizontal' ? 'y' : 'x';
  const target = snapRouteCoordinate(coordinate);
  if (target < -1 || target > 2) throw new TypeError('ROUTE_POINT');
  if (Math.abs(target - left[axis]) < EPSILON) return clone(family);
  const movedLeft = { ...left, [axis]: target };
  const movedRight = { ...right, [axis]: target };
  const replacement = selected.points.slice(0, segmentIndex);
  if (segmentIndex === 0) replacement.push(left);
  replacement.push(movedLeft, movedRight);
  if (segmentIndex + 1 === selected.points.length - 1) replacement.push(right);
  replacement.push(...selected.points.slice(segmentIndex + 2));
  selected.points = eraseClosedOrthogonalLoops(replacement);
  if (!containsMovedSection(selected.points, orientation, target, movedLeft, movedRight)) {
    throw new TypeError('ROUTE_MOVE_LOOP');
  }
  if (selected.points.length > Math.max(originalPointCount, 8)) {
    throw new TypeError('ROUTE_MOVE_COMPLEXITY');
  }
  const branches = family.branches.map((branch) => {
    const path = paths.find((item) => endpointKey(item.endpoint) === endpointKey(branch.endpoint));
    return {
      endpoint: clone(branch.endpoint),
      points: (endpointKey(branch.endpoint) === key ? selected.points : path.points).slice(1),
    };
  });
  const normalized = normalizeStoredRoute({ schema: ROUTE_SCHEMA, branches }, net);
  if (!normalized) throw new TypeError('ROUTE_FAMILY');
  return normalized;
}

export function addRouteJog(family, anchors, endpoint, segmentIndex, net, direction = 1) {
  if (![1, -1].includes(direction)) throw new TypeError('ROUTE_JOG_DIRECTION');
  const key = typeof endpoint === 'string' ? endpoint : endpointKey(endpoint);
  const paths = routeFamilyPaths(family, anchors);
  const selected = paths.find((branch) => endpointKey(branch.endpoint) === key);
  if (!selected || !Number.isInteger(segmentIndex) || segmentIndex < 0
      || segmentIndex >= selected.points.length - 1) throw new TypeError('ROUTE_SEGMENT');
  const left = selected.points[segmentIndex];
  const right = selected.points[segmentIndex + 1];
  const orientation = routeSegmentOrientation(left, right);
  if (!orientation) throw new TypeError('ROUTE_SEGMENT');
  const axis = orientation === 'horizontal' ? 'y' : 'x';
  let offset = ROUTE_GRID * 4 * direction;
  if (Math.max(left[axis], right[axis]) + offset > 2 || Math.min(left[axis], right[axis]) + offset < -1) {
    offset *= -1;
  }
  const movedLeft = { ...left, [axis]: snapRouteCoordinate(left[axis] + offset) };
  const movedRight = { ...right, [axis]: snapRouteCoordinate(right[axis] + offset) };
  const replacement = [
    ...selected.points.slice(0, segmentIndex + 1),
    movedLeft,
    movedRight,
    ...selected.points.slice(segmentIndex + 1),
  ];
  selected.points = normalizeOrthogonalPath(replacement);
  const branches = family.branches.map((branch) => {
    const path = paths.find((item) => endpointKey(item.endpoint) === endpointKey(branch.endpoint));
    return {
      endpoint: clone(branch.endpoint),
      points: (endpointKey(branch.endpoint) === key ? selected.points : path.points).slice(1),
    };
  });
  const normalized = normalizeStoredRoute({ schema: ROUTE_SCHEMA, branches }, net);
  if (!normalized) throw new TypeError('ROUTE_FAMILY');
  return normalized;
}
