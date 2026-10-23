// Runs the actual browser adapter source with a fake Worker only. No AVR execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const binding = (n) => ({ schema: 'intent-mcu-runtime-binding@2', projectGeneration: 1,
  runtimeGeneration: n, artifactIdentity: 'a'.repeat(64),
  modelImplementationSha256: 'b'.repeat(64), modelExecutionContextSha256: 'c'.repeat(64) });
async function adapter(mode = 'ok') {
  const source = (await readFile(new URL('../tools/x81-worker-browser-entry.mjs', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const calls = [], instances = [];
  class FakeWorker {
    constructor(url, options) { this.number = instances.length + 1; instances.push(this); this.instructions = 0;
      assert.equal(url, '/simulator.worker.js'); assert.equal(options.type, 'module'); }
    postMessage(value) {
      calls.push({ worker: this.number, command: value.command });
      if (value.command === 'init') {
        this.identity = { ...value.runtimeBinding, schema: 'intent-mcu-worker-runtime-identity@2',
          workerInitialization: 2, workerInstanceNonce: String(this.number).repeat(32) };
        assert.equal(value.runtimeProfile, 'board.atmega328p-16mhz-v1');
        assert.equal(value.modelImplementationSha256, value.runtimeBinding.modelImplementationSha256);
        assert.equal(value.modelExecutionContextSha256, value.runtimeBinding.modelExecutionContextSha256);
      } else if (value.command === 'step') this.instructions++;
      else if (value.command !== 'dispose') throw Error('UNEXPECTED_COMMAND');
      const disposed = value.command === 'dispose';
      const message = { kind: disposed ? 'disposed' : value.command === 'init' ? 'ready' : 'stepped',
        runtimeIdentity: this.identity, instructions: this.instructions, cycle: this.instructions,
        paused: true, pc: this.instructions, pins: [{ pin: 'D13', mode: 'INPUT', level: false }],
        retentionDrops: { logic: 0, serial: 0, adc: 0, unsupported: 0 },
        eventLog: { dropped: 0, pending: [] },
        instruments: { serial: { dropped: 0, records: [] }, logic: { dropped: 0 } } };
      if (disposed) message.disposeToken = mode === 'wrong-dispose' ? 'wrong-token' : value.disposeToken;
      if (mode === 'wrong-origin' && value.command === 'init') message.cycle = 1;
      if (mode === 'wrong-step' && value.command === 'step') message.instructions++;
      if (mode === 'drops' && value.command === 'step') message.retentionDrops.logic = 1;
      if (mode === 'stale-identity' && value.command === 'step') message.runtimeIdentity = { ...this.identity, artifactIdentity: 'd'.repeat(64) };
      queueMicrotask(() => this.onmessage({ data: message }));
    }
    terminate() { this.terminated = true; }
  }
  function validateWorkerRuntimeIdentity(identity, expected, nonce) {
    for (const key of ['projectGeneration', 'runtimeGeneration', 'artifactIdentity', 'modelImplementationSha256', 'modelExecutionContextSha256']) {
      if (identity[key] !== expected[key]) throw Error('RUNTIME_WORKER_IDENTITY_STALE');
    }
    if (nonce !== null && nonce !== undefined && identity.workerInstanceNonce !== nonce) throw Error('RUNTIME_WORKER_IDENTITY_STALE');
  }
  const context = vm.createContext({ Worker: FakeWorker, structuredClone, setTimeout, clearTimeout,
    queueMicrotask, CURRENT_MODEL_LIBRARY_LOCK: { implementationSha256: 'b'.repeat(64) },
    DEFAULT_CIRCUIT: { schema: 'synthetic-circuit' }, validateWorkerRuntimeIdentity });
  vm.runInContext(source, context);
  return { api: context.__X81_PRIVATE_WORKER__, instances, calls };
}
test('actual adapter protocol accepts two fresh fake workers: ready2,512steps,dispose ACK,terminate', async () => {
  const { api, instances, calls } = await adapter();
  const results = [];
  for (let n = 1; n <= 2; n++) results.push(await api.runX81Worker({ hex: 'fake-no-execution',
    binding: binding(n), workerUrl: '/simulator.worker.js' }));
  assert.equal(instances.length, 2); assert.ok(instances.every((x) => x.terminated));
  assert.equal(calls.filter((x) => x.command === 'step').length, 1024);
  assert.equal(calls.filter((x) => x.command === 'dispose').length, 2);
  assert.equal(results[0].identity.workerInitialization, 2);
  assert.notEqual(results[0].identity.workerInstanceNonce, results[1].identity.workerInstanceNonce);
  assert.equal(results[0].observations.records.length, 512);
  assert.equal(JSON.stringify(results[0].observations), JSON.stringify(results[1].observations));
  assert.equal(results[0].raw.length, 514);
});
for (const [mode, expected] of [['wrong-origin', /RESET_ORIGIN/], ['wrong-step', /INCOMPLETE/],
  ['drops', /INCOMPLETE/], ['wrong-dispose', /DISPOSE_JOIN/], ['stale-identity', /IDENTITY_STALE/]]) {
  test(`actual adapter rejects ${mode}, retains partial raw and terminates fake worker`, async () => {
    const { api, instances } = await adapter(mode);
    await assert.rejects(api.runX81Worker({ hex: 'fake-no-execution', binding: binding(1),
      workerUrl: '/simulator.worker.js' }), (error) => expected.test(error.message) && error.x81Partial.length > 0);
    assert.equal(instances.length, 1); assert.equal(instances[0].terminated, true);
  });
}
