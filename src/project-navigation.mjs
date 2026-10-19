// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
export const PROJECT_NAVIGATION_SCHEMA = 'intent-mcu-project-navigation-view@1';
const KINDS = Object.freeze(['component', 'pin', 'net', 'file', 'source', 'test']);
const ORDER = new Map(KINDS.map((kind, index) => [kind, index]));
const valid = (value, maximum = 320) => typeof value === 'string' && value.length <= maximum && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const fold = (value) => value.normalize('NFKC').toLocaleLowerCase('en');
const SOURCE_POLICY = Object.freeze({
  'board.atmega328p-16mhz-v1': { files: 8, bytes: 131072, names: null },
  'board.rp2040-pico-v1': { files: 1, bytes: 4096, names: ['main.c'] },
  'board.esp32-c3-devmodule-v1': { files: 1, bytes: 4096, names: ['sketch.ino'] },
  'board.stm32f429zi-nucleo144-v1': { files: 1, bytes: 4096, names: ['main.c'] },
});

export function createProjectNavigationView(input) {
  const policy = input && SOURCE_POLICY[input.profile];
  if (!input || !policy || !Number.isSafeInteger(input.generation) || input.generation < 0
      || !Number.isSafeInteger(input.revision) || input.revision < 0 || !input.connections
      || input.connections.schema !== 'intent-mcu-accessible-connection-view@1'
      || input.connections.profile !== input.profile || typeof input.connections.validation?.ok !== 'boolean'
      || !valid(input.connections.validation?.code, 160) || !Array.isArray(input.connections.validation?.diagnostics)
      || !Array.isArray(input.connections.components) || !Array.isArray(input.connections.pins)
      || !Array.isArray(input.connections.nets) || !Array.isArray(input.sources)
      || input.sources.length < 1 || input.sources.length > 8 || !Array.isArray(input.criteria)
      || input.criteria.length > 24 || !Array.isArray(input.scenarios) || input.scenarios.length > 64) fail('PROJECT_NAVIGATION_INPUT_INVALID');
  const entries = [];
  const add = (kind, id, label, terms, target) => {
    if (!KINDS.includes(kind) || !valid(id, 160) || !valid(label) || terms.some((item) => !valid(item, 131072))) fail('PROJECT_NAVIGATION_ENTRY_INVALID');
    entries.push({ kind, id, label, terms: [...new Set([id, label, ...terms])], target: structuredClone(target) });
  };
  for (const item of input.connections.components) add('component', item.id, `${item.label} · ${item.typeLabel}`, [item.type], { componentId: item.id });
  for (const item of input.connections.pins) add('pin', item.key, item.accessibleLabel, [item.id, item.label, item.componentId, item.componentLabel], { pinKey: item.key, componentId: item.componentId });
  for (const item of input.connections.nets) add('net', item.id, item.accessibleLabel, item.endpoints.flatMap((endpoint) => [endpoint.key, endpoint.label]), { netId: item.id });
  let bytes = 0;
  for (const source of input.sources) {
    if (!source || !valid(source.name, 80) || typeof source.content !== 'string') fail('PROJECT_NAVIGATION_SOURCE_INVALID');
    bytes += new TextEncoder().encode(source.content).length;
    add('file', source.name, source.name, [], { file: source.name });
    source.content.split('\n').forEach((line, index) => { if (line.trim()) add('source', `${source.name}:${index + 1}`, `${source.name}:${index + 1} · ${line.trim().slice(0, 160)}`, [line], { file: source.name, line: index + 1 }); });
  }
  if (input.sources.length > policy.files || bytes > policy.bytes
      || (policy.names && input.sources.some((source, index) => source.name !== policy.names[index]))) fail('PROJECT_NAVIGATION_SOURCE_LIMIT');
  for (const criterion of input.criteria) {
    if (!criterion || !valid(criterion.id, 32) || !valid(criterion.text, 240) || !Array.isArray(criterion.testRefs) || criterion.testRefs.length > 8) fail('PROJECT_NAVIGATION_TEST_INVALID');
    add('test', `criterion:${criterion.id}`, `${criterion.id} · ${criterion.text}`, [criterion.id, criterion.text], { requirementId: criterion.id });
    for (const testId of criterion.testRefs) add('test', `${testId}@${criterion.id}`, `${testId} · ${criterion.id} · ${criterion.text}`, [testId, criterion.id, criterion.text], { requirementId: criterion.id, testId });
  }
  for (const scenario of input.scenarios) {
    if (!scenario || !valid(scenario.id, 96) || !valid(scenario.name, 240) || !Array.isArray(scenario.events)) fail('PROJECT_NAVIGATION_TEST_INVALID');
    add('test', `scenario:${scenario.id}`, `${scenario.id} · ${scenario.name}`, [scenario.id, scenario.name], { scenarioId: scenario.id });
    for (const event of scenario.events) {
      if (!event || !valid(event.id, 96)) fail('PROJECT_NAVIGATION_TEST_INVALID');
      add('test', `event:${scenario.id}:${event.id}`, `${event.id} · ${scenario.name}`, [event.id, scenario.id, scenario.name], { scenarioId: scenario.id, eventId: event.id });
    }
  }
  const seen = new Set();
  for (const entry of entries) { const key = `${entry.kind}\0${entry.id}`; if (seen.has(key)) fail('PROJECT_NAVIGATION_DUPLICATE'); seen.add(key); Object.freeze(entry.target); Object.freeze(entry.terms); Object.freeze(entry); }
  return Object.freeze({ schema: PROJECT_NAVIGATION_SCHEMA, profile: input.profile, generation: input.generation,
    revision: input.revision, graphIdentity: input.connections.semanticIdentity, entries: Object.freeze(entries) });
}

export function searchProjectNavigation(view, rawQuery, cap = 100) {
  if (view?.schema !== PROJECT_NAVIGATION_SCHEMA || !Number.isSafeInteger(cap) || cap < 1 || cap > 100) fail('PROJECT_NAVIGATION_VIEW_INVALID');
  const query = String(rawQuery ?? '').trim().normalize('NFKC');
  if (!query || [...query].length > 80) return { query, total: 0, truncated: false, results: [] };
  const needle = fold(query);
  const ranked = view.entries.flatMap((entry) => { const values = entry.terms.map(fold); if (!values.some((value) => value.includes(needle))) return []; return [{ entry, score: values.some((value) => value === needle) ? 0 : values.some((value) => value.startsWith(needle)) ? 1 : 2 }]; })
    .sort((a, b) => a.score - b.score || ORDER.get(a.entry.kind) - ORDER.get(b.entry.kind) || a.entry.id.localeCompare(b.entry.id, 'en'));
  return { query, total: ranked.length, truncated: ranked.length > cap, results: ranked.slice(0, cap).map(({ entry }) => entry) };
}
