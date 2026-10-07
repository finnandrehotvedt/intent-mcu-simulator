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

function routeHub(net, storedRoute, anchors) {
  if (Array.isArray(storedRoute) && storedRoute.length) return cleanPoint(storedRoute.at(-1));
  if (storedRoute?.schema === ROUTE_SCHEMA) {
    const last = storedRoute.branches[0]?.points.at(-1);
    if (last) return cleanPoint(last);
  }
  const escapes = net.endpoints.map((endpoint) => anchors[endpointKey(endpoint)]?.escape).filter(Boolean);
  if (escapes.length !== net.endpoints.length) throw new TypeError('ROUTE_ANCHOR_MISSING');
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
    return branch.points;
  }
  if (Array.isArray(storedRoute) && storedRoute.length) return [anchor.escape, ...storedRoute];
  return [anchor.escape, { x: hub.x, y: anchor.escape.y }, hub];
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

export function materializeRouteFamily(net, storedRoute, anchors) {
  const hub = routeHub(net, storedRoute, anchors);
  const branches = net.endpoints.map((endpoint) => {
    const key = endpointKey(endpoint);
    const anchor = anchors[key];
    const full = [cleanPoint(anchor.pin)];
    const targets = branchTargets(endpoint, storedRoute, anchors, hub);
    targets.forEach((target, index) => appendOrthogonal(full, target, index % 2 ? 'vertical' : 'horizontal'));
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
  const orientation = routeSegmentOrientation(left, right);
  if (!orientation) throw new TypeError('ROUTE_SEGMENT');
  const axis = orientation === 'horizontal' ? 'y' : 'x';
  const target = snapRouteCoordinate(coordinate);
  if (target < -1 || target > 2) throw new TypeError('ROUTE_POINT');
  const movedLeft = { ...left, [axis]: target };
  const movedRight = { ...right, [axis]: target };
  const replacement = selected.points.slice(0, segmentIndex);
  if (segmentIndex === 0) replacement.push(left);
  replacement.push(movedLeft, movedRight);
  if (segmentIndex + 1 === selected.points.length - 1) replacement.push(right);
  replacement.push(...selected.points.slice(segmentIndex + 2));
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
