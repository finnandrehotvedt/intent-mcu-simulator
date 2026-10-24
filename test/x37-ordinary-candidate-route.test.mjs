import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { X37_REVIEWED_ROUTE, createX37OrdinaryCandidateRoute } from '../src/x37-ordinary-candidate-route.mjs';
import { defaultX37WorkbenchProject } from '../src/x37-workbench-candidate.mjs';

const hash = (character) => character.repeat(64);

class WorkerDouble {
  constructor(url, options) { this.url = url; this.options = options; this.listeners = new Map(); this.terminated = false; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  postMessage(message) { queueMicrotask(() => {
    const value = message.command === 'advance' ? { complete: true, observations: [{ participantId: message.participantId,
      pin: message.participantId === 'avr' ? 'D13' : 'GPIO0', localCycle: 8, mappedTick: 1, mode: 'RELEASE' }] }
      : { accepted: true };
    this.listeners.get('message')?.({ data: { requestId: message.requestId, ok: true, value } });
  }); }
  terminate() { this.terminated = true; }
}

test('reviewed private route sends both edited sources through the ordinary build API and owns two workers', async () => {
  const requests = []; let job = 0; const results = new Map();
  const fetchImpl = async (url, options) => {
    requests.push({ url, options: structuredClone(options) });
    if (url === '/api/build') {
      const request = JSON.parse(options.body); const id = (++job).toString(16).padStart(24, '0');
      const isAvr = request.schema === 'teach-lab-build-request@1';
      results.set(id, { code: 'BUILD_OK', artifactIdentity: hash(isAvr ? 'a' : 'b'),
        toolchainIdentitySha256: hash('c'), artifact: isAvr
          ? { hex: ':00000001FF\n', hexSha256: hash('d') }
          : { schema: 'intent-mcu-rp2040-compile-artifact@1', uf2: { base64: 'AA==', sha256: hash('e') } } });
      return { ok: true, json: async () => ({ jobId: id, capability: 'q'.repeat(40) }) };
    }
    const id = url.split('/').at(-1); return { ok: true, json: async () => ({ status: 'succeeded', result: results.get(id) }) };
  };
  const workers = []; const route = createX37OrdinaryCandidateRoute({ routeIdentity: X37_REVIEWED_ROUTE, fetchImpl,
    privateRouteCapability: 'r'.repeat(40),
    workerFactory: (url, options) => { const worker = new WorkerDouble(url, options); workers.push(worker); return worker; } });
  const project = defaultX37WorkbenchProject(); project.participants[0].source += '// edited AVR\n';
  project.participants[1].source = project.participants[1].source.replace('X37 TURNAROUND', 'X37 ROUTE');
  const [avr, rp] = await Promise.all(project.participants.map((participant) => route.compileParticipant(participant, 4, 7)));
  assert.equal(requests.filter(({ url }) => url === '/api/build').length, 2);
  const posted = requests.filter(({ url }) => url === '/api/build').map(({ options }) => JSON.parse(options.body));
  assert.equal(posted[0].files[0].content.endsWith('// edited AVR\n'), true);
  assert.match(posted[1].files[0].content, /X37 ROUTE/u);
  assert(posted.every((request) => request.files.length === 1));
  const postOptions = requests.filter(({ url }) => url === '/api/build').map(({ options }) => options);
  assert.equal(postOptions[0].headers['X-X37-Compiler-Route'], undefined);
  assert.equal(postOptions[1].headers['X-X37-Compiler-Route'], 'r'.repeat(40));
  assert(requests.filter(({ url }) => url !== '/api/build').every(({ options }) => options.method === 'GET'
    && options.cache === 'no-store' && /^Bearer q{40}$/u.test(options.headers.Authorization)));
  const builds = { avr, rp }; const pair = await route.createRuntimePair(builds, { projectGeneration: 4, runtimeGeneration: 7 });
  assert.equal(workers.length, 2); assert(workers.every((worker) => worker.options.type === 'module'));
  const adapter = route.createProductAdapter({ builds, runtimePair: pair,
    lifecycleOwner: () => ({ projectGeneration: 4, runtimeGeneration: 7, builds }) });
  const run = await adapter.run(); assert.equal(run.trace.length, 2);
  adapter.pause(); adapter.dispose(); assert(workers.every((worker) => worker.terminated));
});

test('route identity is exact and public entry remains capability blocked', async () => {
  assert.throws(() => createX37OrdinaryCandidateRoute({ routeIdentity: { ...X37_REVIEWED_ROUTE, imageId: hash('0') },
    privateRouteCapability: 'r'.repeat(40) }),
    { code: 'X37_REVIEWED_ROUTE_IDENTITY_INVALID' });
  const [main, privateEntry, publicLock, reviewedLock] = await Promise.all([
    readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/x37-private-candidate-entry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../compiler/rp2040-image-lock.json', import.meta.url), 'utf8'),
    readFile(new URL('../compiler/x37-rp2040-reviewed-image-lock.json', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(main, /x37-private-candidate-entry/u);
  assert.match(privateEntry, /installReviewedX37PrivateCandidate/u);
  assert.equal(JSON.parse(publicLock).imageId, 'sha256:e2c3fd002439eddb24d50e05a47bfcb1d395a3183186b5bf001fd47523ac7bbe');
  assert.deepEqual({ imageId: JSON.parse(reviewedLock).imageId, toolchainManifestSha256: JSON.parse(reviewedLock).toolchainManifestSha256 },
    { imageId: X37_REVIEWED_ROUTE.imageId, toolchainManifestSha256: X37_REVIEWED_ROUTE.toolchainManifestSha256 });
});
