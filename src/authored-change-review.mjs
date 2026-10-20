// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { COMPONENT_CATALOG } from './component-catalog.mjs';
import { RP2040_PICO_COMPONENT_CATALOG } from './rp2040-pico-circuit.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG } from './esp32c3-public-circuit.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG } from './stm32-public-circuit.mjs';

export const AUTHORED_CHANGE_REVIEW_SCHEMA = 'intent-mcu-authored-project-change-review@1';
export const AUTHORED_CHANGE_REVIEW_LIMITS = Object.freeze({
  semanticRows: 512,
  myersOperations: 200_000,
  avrDiffBytes: 640 * 1024,
  narrowDiffBytes: 24 * 1024,
});

const AVR_PROFILE = 'board.atmega328p-16mhz-v1';
const PROFILE_SOURCE = Object.freeze({
  [AVR_PROFILE]: Object.freeze({ files: 8, bytes: 128 * 1024, name: null }),
  'board.rp2040-pico-v1': Object.freeze({ files: 1, bytes: 4 * 1024, name: 'main.c' }),
  'board.esp32-c3-devmodule-v1': Object.freeze({ files: 1, bytes: 4 * 1024, name: 'sketch.ino' }),
  'board.stm32f429zi-nucleo144-v1': Object.freeze({ files: 1, bytes: 4 * 1024, name: 'main.c' }),
});
export const AUTHORED_CHANGE_REVIEW_PROFILES = Object.freeze(Object.keys(PROFILE_SOURCE));
const CATALOG = Object.freeze({
  ...COMPONENT_CATALOG,
  ...RP2040_PICO_COMPONENT_CATALOG,
  ...ESP32C3_PUBLIC_COMPONENT_CATALOG,
  ...STM32_PUBLIC_COMPONENT_CATALOG,
});
const HASH = /^[a-f0-9]{64}$/u;
const encoder = new TextEncoder();
const clone = (value) => structuredClone(value);
const reject = (code, details = []) => {
  throw Object.assign(new Error(code), { code, details });
};

function authoredProject(value) {
  return value?.project && typeof value.project === 'object' && !Array.isArray(value.project)
    ? value.project : value;
}

function circuitFor(value) {
  const authored = authoredProject(value);
  return authored?.circuit ?? { components: [], nets: [] };
}

function layoutFor(value) {
  const authored = authoredProject(value);
  return authored?.circuit?.layout ?? authored?.layout ?? {};
}

function sourceFiles(value, profile) {
  const authored = authoredProject(value);
  if (Array.isArray(authored?.source?.files)) {
    return authored.source.files.map((file) => ({ name: file.name, content: file.content }));
  }
  if (typeof authored?.source === 'string') {
    return [{ name: PROFILE_SOURCE[profile]?.name ?? 'main.ino', content: authored.source }];
  }
  reject('X64_SOURCE_SHAPE');
}

function validatedSources(value, profile) {
  const policy = PROFILE_SOURCE[profile];
  if (!policy) reject('X64_PROFILE_MISMATCH', [profile]);
  const files = sourceFiles(value, profile);
  const names = new Set();
  let bytes = 0;
  for (const [index, file] of files.entries()) {
    if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 80
        || typeof file.content !== 'string' || names.has(file.name)) {
      reject('X64_SOURCE_SHAPE', [index]);
    }
    names.add(file.name);
    bytes += encoder.encode(file.content).byteLength;
  }
  if (files.length < 1 || files.length > policy.files || bytes > policy.bytes
      || (policy.name && (files.length !== 1 || files[0].name !== policy.name))) {
    reject('X64_SOURCE_LIMIT', [profile, files.length, bytes]);
  }
  return new Map(files.map((file) => [file.name, file.content]));
}

function linesWithEndings(value) {
  if (!value) return [];
  return value.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
}

function frontierValue(frontier, key) {
  return frontier.has(key) ? frontier.get(key) : Number.NEGATIVE_INFINITY;
}

function backtrackMyers(trace, before, after, distance) {
  let x = before.length;
  let y = after.length;
  const reversed = [];
  for (let d = distance; d >= 0; d -= 1) {
    const frontier = trace[d];
    const diagonal = x - y;
    const previousDiagonal = diagonal === -d
      || (diagonal !== d
        && frontierValue(frontier, diagonal - 1) < frontierValue(frontier, diagonal + 1))
      ? diagonal + 1 : diagonal - 1;
    const previousX = frontierValue(frontier, previousDiagonal);
    const previousY = previousX - previousDiagonal;
    while (x > previousX && y > previousY) {
      reversed.push({ type: 'equal', text: before[x - 1] });
      x -= 1; y -= 1;
    }
    if (d === 0) break;
    if (x === previousX) {
      reversed.push({ type: 'added', text: after[y - 1] });
      y -= 1;
    } else {
      reversed.push({ type: 'removed', text: before[x - 1] });
      x -= 1;
    }
  }
  return reversed.reverse();
}

function myersOperations(before, after, operationLimit) {
  const maximum = before.length + after.length;
  let frontier = new Map([[1, 0]]);
  const trace = [];
  let operations = 0;
  for (let distance = 0; distance <= maximum; distance += 1) {
    trace.push(new Map(frontier));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      operations += 1;
      if (operations > operationLimit) return null;
      let x = diagonal === -distance
        || (diagonal !== distance
          && frontierValue(frontier, diagonal - 1) < frontierValue(frontier, diagonal + 1))
        ? frontierValue(frontier, diagonal + 1)
        : frontierValue(frontier, diagonal - 1) + 1;
      if (!Number.isFinite(x)) x = 0;
      let y = x - diagonal;
      while (x < before.length && y < after.length && before[x] === after[y]) {
        operations += 1;
        if (operations > operationLimit) return null;
        x += 1; y += 1;
      }
      frontier.set(diagonal, x);
      if (x >= before.length && y >= after.length) {
        return backtrackMyers(trace, before, after, distance);
      }
    }
  }
  return [];
}

function literalOperations(beforeText, afterText) {
  const before = linesWithEndings(beforeText);
  const after = linesWithEndings(afterText);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix
      && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const middleBefore = before.slice(prefix, before.length - suffix);
  const middleAfter = after.slice(prefix, after.length - suffix);
  const compared = myersOperations(middleBefore, middleAfter, AUTHORED_CHANGE_REVIEW_LIMITS.myersOperations);
  const minimal = compared !== null;
  const middle = compared ?? [
    ...middleBefore.map((text) => ({ type: 'removed', text })),
    ...middleAfter.map((text) => ({ type: 'added', text })),
  ];
  return {
    operations: [
      ...before.slice(0, prefix).map((text) => ({ type: 'equal', text })),
      ...middle,
      ...before.slice(before.length - suffix).map((text) => ({ type: 'equal', text })),
    ],
    beforeLines: before.length,
    afterLines: after.length,
    minimal,
  };
}

function renderOperation(operation) {
  const prefix = operation.type === 'added' ? '+' : operation.type === 'removed' ? '-' : ' ';
  if (operation.text.endsWith('\n')) return `${prefix}${operation.text}`;
  return `${prefix}${operation.text}\n\\ No newline at end of file\n`;
}

function sourceDiff(name, beforeText, afterText, profile) {
  const state = beforeText === null ? 'added' : afterText === null ? 'removed' : 'changed';
  const before = beforeText ?? '';
  const after = afterText ?? '';
  const result = literalOperations(before, after);
  const body = result.operations.map(renderOperation).join('');
  const note = result.minimal ? '' : '# non-minimal complete replacement: edit budget reached\n';
  const text = `--- ${beforeText === null ? '/dev/null' : `a/${name}`}\n`
    + `+++ ${afterText === null ? '/dev/null' : `b/${name}`}\n`
    + `@@ -1,${result.beforeLines} +1,${result.afterLines} @@\n${note}${body}`;
  const limit = profile === AVR_PROFILE
    ? AUTHORED_CHANGE_REVIEW_LIMITS.avrDiffBytes : AUTHORED_CHANGE_REVIEW_LIMITS.narrowDiffBytes;
  if (encoder.encode(text).byteLength > limit) reject('X64_DIFF_LIMIT', [name, limit]);
  return {
    id: `source:${name}`,
    name,
    status: state,
    addedLines: result.operations.filter((item) => item.type === 'added').length,
    removedLines: result.operations.filter((item) => item.type === 'removed').length,
    minimal: result.minimal,
    algorithm: result.minimal ? 'bounded-myers-lines-v1' : 'complete-replacement-v1',
    text,
  };
}

function sourceReview(before, after, profile) {
  const beforeFiles = validatedSources(before, profile);
  const afterFiles = validatedSources(after, profile);
  const names = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])].sort((a, b) => a.localeCompare(b, 'en'));
  const diffs = names.flatMap((name) => {
    const left = beforeFiles.has(name) ? beforeFiles.get(name) : null;
    const right = afterFiles.has(name) ? afterFiles.get(name) : null;
    return left === right ? [] : [sourceDiff(name, left, right, profile)];
  });
  const limit = profile === AVR_PROFILE
    ? AUTHORED_CHANGE_REVIEW_LIMITS.avrDiffBytes : AUTHORED_CHANGE_REVIEW_LIMITS.narrowDiffBytes;
  const totalBytes = diffs.reduce((total, diff) => total + encoder.encode(diff.text).byteLength, 0);
  if (totalBytes > limit) reject('X64_DIFF_LIMIT', ['complete-source-set', limit, totalBytes]);
  return diffs;
}

function displayValue(value, unit = null) {
  const rendered = typeof value === 'string' ? value : JSON.stringify(value);
  return `${rendered}${unit ? ` ${unit}` : ''}`;
}

function componentLabel(component) {
  const owner = CATALOG[component?.type];
  return `${component?.label ?? owner?.displayName ?? component?.type ?? 'component'} (${component?.id ?? 'unknown'})`;
}

function propertyChanges(before, after) {
  const changes = [];
  for (const group of ['properties', 'controls']) {
    const left = before?.[group] ?? {};
    const right = after?.[group] ?? {};
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (JSON.stringify(left[key]) === JSON.stringify(right[key])) continue;
      const beforeUnit = group === 'properties' ? CATALOG[before?.type]?.propertySchema?.[key]?.unit ?? null : null;
      const afterUnit = group === 'properties' ? CATALOG[after?.type]?.propertySchema?.[key]?.unit ?? null : null;
      changes.push({ path: `${group}.${key}`, before: left[key] ?? null, after: right[key] ?? null,
        unit: beforeUnit === afterUnit ? beforeUnit : null, beforeUnit, afterUnit });
    }
  }
  return changes;
}

function positionFor(project, id) {
  return layoutFor(project)?.positions?.[id] ?? null;
}

function componentRows(before, after) {
  const left = new Map((circuitFor(before).components ?? []).map((item) => [item.id, item]));
  const right = new Map((circuitFor(after).components ?? []).map((item) => [item.id, item]));
  return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap((id) => {
    const previous = left.get(id); const next = right.get(id);
    if (!previous) return [{ id: `component:${id}`, kind: 'component', action: 'added', ownerId: id,
      path: `circuit.components.${id}`, before: null, after: clone(next), unit: null,
      summary: `Added ${componentLabel(next)}.` }];
    if (!next) return [{ id: `component:${id}`, kind: 'component', action: 'removed', ownerId: id,
      path: `circuit.components.${id}`, before: clone(previous), after: null, unit: null,
      summary: `Removed ${componentLabel(previous)}.` }];
    const fields = [];
    if (previous.type !== next.type) fields.push({ path: 'type', before: previous.type, after: next.type, unit: null });
    if (previous.label !== next.label) fields.push({ path: 'label', before: previous.label ?? null, after: next.label ?? null, unit: null });
    fields.push(...propertyChanges(previous, next));
    const previousPosition = positionFor(before, id); const nextPosition = positionFor(after, id);
    if (JSON.stringify(previousPosition) !== JSON.stringify(nextPosition)) {
      fields.push({ path: 'layout.position', before: previousPosition, after: nextPosition, unit: 'normalized-canvas' });
    }
    if (!fields.length && JSON.stringify(previous) === JSON.stringify(next)) return [];
    if (!fields.length) {
      return [{ id: `component:${id}`, kind: 'component', action: 'changed', ownerId: id,
        path: `circuit.components.${id}`, before: clone(previous), after: clone(next), unit: null,
        fields: [], summary: `Changed validated component data for ${componentLabel(next)}; no unsupported field meaning was inferred.` }];
    }
    const summaries = fields.map((field) => field.path === 'layout.position'
      ? `Moved ${componentLabel(next)} visually from ${displayValue(field.before)} to ${displayValue(field.after)}`
      : `Changed ${componentLabel(next)} ${field.path} from ${displayValue(field.before, field.beforeUnit ?? field.unit)} to ${displayValue(field.after, field.afterUnit ?? field.unit)}`);
    return [{ id: `component:${id}`, kind: 'component', action: 'changed', ownerId: id,
      path: `circuit.components.${id}`, before: clone(previous), after: clone(next), unit: null,
      fields: clone(fields), summary: `${summaries.join('; ')}.` }];
  });
}

function endpointKey(value) {
  if (typeof value === 'string') return value;
  return `${value?.component ?? 'unknown'}.${value?.pin ?? 'unknown'}`;
}

function netView(project, net) {
  const layout = layoutFor(project);
  return {
    ...clone(net),
    endpoints: (net.endpoints ?? []).map(endpointKey).sort(),
    route: clone(layout?.wireRoutes?.[net.id] ?? null),
    style: clone(layout?.wireStyles?.[net.id] ?? null),
  };
}

function netRows(before, after) {
  const left = new Map((circuitFor(before).nets ?? []).map((item) => [item.id, netView(before, item)]));
  const right = new Map((circuitFor(after).nets ?? []).map((item) => [item.id, netView(after, item)]));
  return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap((id) => {
    const previous = left.get(id); const next = right.get(id);
    if (!previous) return [{ id: `net:${id}`, kind: 'wire', action: 'added', ownerId: id,
      path: `circuit.nets.${id}`, before: null, after: clone(next), unit: null,
      summary: `Added net ${id} with ${next.endpoints.join(', ')}.` }];
    if (!next) return [{ id: `net:${id}`, kind: 'wire', action: 'removed', ownerId: id,
      path: `circuit.nets.${id}`, before: clone(previous), after: null, unit: null,
      summary: `Removed net ${id} with ${previous.endpoints.join(', ')}.` }];
    if (JSON.stringify(previous) === JSON.stringify(next)) return [];
    const removed = previous.endpoints.filter((item) => !next.endpoints.includes(item));
    const added = next.endpoints.filter((item) => !previous.endpoints.includes(item));
    const stable = previous.endpoints.filter((item) => next.endpoints.includes(item));
    let summary;
    if (removed.length === 1 && added.length === 1 && stable.length === 1) {
      summary = `Reconnected ${stable[0]} on net ${id} from ${removed[0]} to ${added[0]}.`;
    } else if (removed.length || added.length) {
      summary = `Changed net ${id}: removed ${removed.join(', ') || 'no endpoints'}; added ${added.join(', ') || 'no endpoints'}.`;
    } else if (JSON.stringify(previous.route) !== JSON.stringify(next.route)
        || JSON.stringify(previous.style) !== JSON.stringify(next.style)) {
      summary = `Changed visual route or style for net ${id}; electrical endpoints are unchanged.`;
    } else {
      summary = `Changed validated data for net ${id}; electrical endpoints are unchanged and no unsupported field meaning was inferred.`;
    }
    return [{ id: `net:${id}`, kind: 'wire', action: 'changed', ownerId: id,
      path: `circuit.nets.${id}`, before: clone(previous), after: clone(next), unit: null, summary }];
  });
}

function sourceRows(diffs) {
  return diffs.map((diff) => ({
    id: diff.id, kind: 'source', action: diff.status, ownerId: diff.name,
    path: `source.files.${diff.name}`, before: null, after: null, unit: 'lines',
    summary: `${diff.status === 'added' ? 'Added' : diff.status === 'removed' ? 'Removed' : 'Changed'} source file ${diff.name}: ${diff.addedLines} added line${diff.addedLines === 1 ? '' : 's'}, ${diff.removedLines} removed line${diff.removedLines === 1 ? '' : 's'}${diff.minimal ? '' : ' (complete non-minimal replacement)'}.`,
  }));
}

function expectationRows(changes) {
  return (changes ?? []).map((change, index) => ({
    id: `expectation:${change.kind}:${change.id}:${index}`,
    kind: change.kind,
    action: change.action,
    ownerId: change.id,
    path: `${change.kind}.${change.id}`,
    before: null,
    after: null,
    unit: null,
    summary: change.summary,
  }));
}

export function createAuthoredChangeReview({
  profile,
  baseProjectSha256,
  candidateProjectSha256,
  before,
  after,
  testExpectationChanges = [],
}) {
  if (!PROFILE_SOURCE[profile]) reject('X64_PROFILE_MISMATCH', [profile]);
  if (!HASH.test(baseProjectSha256 ?? '')) reject('X64_STALE_BASE');
  if (!HASH.test(candidateProjectSha256 ?? '')) reject('X64_STALE_CANDIDATE');
  if (baseProjectSha256 === candidateProjectSha256) reject('X64_NO_DIFFERENCE');
  const sourceDiffs = sourceReview(before, after, profile);
  const summaryRows = [
    ...sourceRows(sourceDiffs),
    ...componentRows(before, after),
    ...netRows(before, after),
    ...expectationRows(testExpectationChanges),
  ];
  if (!summaryRows.length) reject('X64_NO_DIFFERENCE');
  if (summaryRows.length > AUTHORED_CHANGE_REVIEW_LIMITS.semanticRows) {
    reject('X64_SUMMARY_LIMIT', [summaryRows.length]);
  }
  const ids = new Set();
  for (const row of summaryRows) {
    if (!row.id || ids.has(row.id) || typeof row.summary !== 'string' || !row.summary) {
      reject('X64_SUMMARY_INVALID', [row.id ?? null]);
    }
    ids.add(row.id);
  }
  return Object.freeze({
    schema: AUTHORED_CHANGE_REVIEW_SCHEMA,
    profile,
    baseProjectSha256,
    candidateProjectSha256,
    summaryRows: clone(summaryRows),
    sourceDiffs: clone(sourceDiffs),
    limits: clone(AUTHORED_CHANGE_REVIEW_LIMITS),
    authority: Object.freeze({ apply: false, build: false, run: false, verdict: false }),
  });
}
