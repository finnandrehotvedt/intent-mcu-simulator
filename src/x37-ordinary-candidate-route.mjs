// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const X37_REVIEWED_ROUTE = Object.freeze({
  schema: 'intent-mcu-x37-reviewed-route@1',
  imageId: 'sha256:a68a9e3616aa3f7b317525d0f7c0447c05717fac284e7b3d989a99329606f29b',
  toolchainManifestSha256: 'a4624137772c1d41442c32a7bf02bd3d59b219eaed0cd88bb9b3be3528445b47',
});
export const X37_PRIVATE_CANDIDATE_CAPABILITY = Object.freeze({ enabled: true,
  code: 'X37_PRIVATE_REVIEWED_ROUTE_READY', message: 'Private candidate · reviewed compiler route and two ordinary workers ready.' });
const X37_MODEL_IMPLEMENTATION_SHA256 = 'ecb28d0eca17452cb847a6c8d0b2d17ba3cd70477807f2800db61b34a9f0de9c';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const clone = (value) => structuredClone(value);
const sha = /^[0-9a-f]{64}$/u;
const base64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

function validateRoute(route) {
  if (JSON.stringify(route) !== JSON.stringify(X37_REVIEWED_ROUTE)) fail('X37_REVIEWED_ROUTE_IDENTITY_INVALID');
  return route;
}

async function responseJson(response) {
  let value; try { value = await response.json(); } catch { fail('X37_BUILD_RESPONSE_INVALID'); }
  if (!response.ok) fail(value?.code ?? 'X37_BUILD_FAILED');
  return value;
}

async function submitAndPoll(fetchImpl, request, signal, privateRouteCapability) {
  const headers = { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' };
  if (request.board === 'board.rp2040-pico-v1') headers['X-X37-Compiler-Route'] = privateRouteCapability;
  const job = await responseJson(await fetchImpl('/api/build', { method: 'POST', signal,
    headers, body: JSON.stringify(request) }));
  if (!/^[0-9a-f]{24}$/u.test(job?.jobId ?? '') || !/^[A-Za-z0-9_-]{40,80}$/u.test(job?.capability ?? '')) {
    fail('X37_BUILD_JOB_INVALID');
  }
  for (let poll = 0; poll < 200; poll += 1) {
    const value = await responseJson(await fetchImpl(`/api/build/${job.jobId}`, { method: 'GET', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${job.capability}` } }));
    if (value.status === 'building') { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
    if (value.status !== 'succeeded') fail(value.result?.code ?? value.error ?? 'X37_BUILD_FAILED');
    return value.result;
  }
  fail('X37_BUILD_POLL_LIMIT');
}

function validatedBuild(participant, result, projectGeneration, runtimeGeneration) {
  const artifact = result?.artifact;
  const identity = result?.artifactIdentity;
  if (!sha.test(identity ?? '')) fail('X37_BUILD_ARTIFACT_INVALID');
  if (participant.id === 'avr') {
    if (typeof artifact?.hex !== 'string' || !sha.test(artifact.hexSha256 ?? '')) fail('X37_AVR_ARTIFACT_INVALID');
  } else if (artifact?.schema !== 'intent-mcu-rp2040-compile-artifact@1'
      || typeof artifact?.uf2?.base64 !== 'string' || !sha.test(artifact?.uf2?.sha256 ?? '')) fail('X37_RP_ARTIFACT_INVALID');
  return Object.freeze({ participantId: participant.id, profile: participant.profile, projectGeneration, runtimeGeneration,
    artifactIdentity: identity,
    modelLibrarySha256: X37_MODEL_IMPLEMENTATION_SHA256,
    toolchainSha256: participant.id === 'rp' ? X37_REVIEWED_ROUTE.toolchainManifestSha256
      : result.toolchainIdentitySha256,
    artifact: clone(artifact) });
}

function requestFor(participant) {
  if (participant.id === 'avr' && participant.profile === 'avr') return { schema: 'teach-lab-build-request@1',
    board: 'board.atmega328p-16mhz-v1', files: [{ name: 'main.ino', content: participant.source }] };
  if (participant.id === 'rp' && participant.profile === 'rp2040') return { schema: 'intent-mcu-rp2040-source-build-request@1',
    board: 'board.rp2040-pico-v1', files: [{ name: 'main.c', content: participant.source }] };
  fail('X37_PARTICIPANT_ROUTE_INVALID');
}

function rpcWorker(worker, participantId) {
  let sequence = 0; let disposed = false; const pending = new Map();
  const rejectAll = (code) => { for (const { reject } of pending.values()) reject(Object.assign(new Error(code), { code })); pending.clear(); };
  worker.addEventListener('message', ({ data }) => { const owned = pending.get(data?.requestId); if (!owned) return;
    pending.delete(data.requestId); if (data.ok) owned.resolve(data.value); else owned.reject(Object.assign(new Error(data.code), { code: data.code })); });
  worker.addEventListener('error', () => rejectAll('X37_ORDINARY_WORKER_ERROR'));
  const call = (command, value = {}) => { if (disposed) return Promise.reject(Object.assign(new Error('X37_ORDINARY_WORKER_DISPOSED'), { code: 'X37_ORDINARY_WORKER_DISPOSED' }));
    const requestId = `${participantId}.${++sequence}`; return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject }); worker.postMessage({ schema: 'intent-mcu-x37-worker-rpc@1', requestId, participantId, command, value });
    }); };
  return Object.freeze({ participantId, call, terminate() { if (disposed) return; disposed = true; rejectAll('X37_ORDINARY_WORKER_DISPOSED'); worker.terminate(); } });
}

function asyncPairAdapter({ builds, runtimePair, lifecycleOwner }) {
  let disposed = false; let paused = false;
  const current = () => { const live = lifecycleOwner();
    if (disposed) fail('X37_PRODUCT_ADAPTER_DISPOSED');
    for (const id of ['avr', 'rp']) if (live.builds?.[id]?.artifactIdentity !== builds[id].artifactIdentity) {
      fail('X37_PRODUCT_ADAPTER_LIVE_BINDING_STALE');
    }
    return live;
  };
  const both = (command, value = {}) => Promise.all(['avr', 'rp'].map((id) => runtimePair[id].call(command, value)));
  return Object.freeze({
    async run() {
      current(); paused = false; const trace = []; let inputLevel = true;
      for (let turn = 0; turn < 32 && !paused; turn += 1) {
        const values = await both('advance', { inputLevel, turn, instructionLimit: 1_000_000 }); current();
        const observations = values.flatMap((value) => value.observations ?? []);
        const drives = observations.filter((item) => item.mode === 'DRIVE').map((item) => item.level);
        if (drives.includes(true) && drives.includes(false)) fail('X37_SHARED_NET_CONFLICT');
        inputLevel = drives.includes(false) ? false : true;
        trace.push(...observations.map((item) => ({ ...item, level: item.mode === 'RELEASE' ? 'HIGH_Z' : item.level ? 'HIGH' : 'LOW' })));
        if (values.every((value) => value.complete === true)) return { trace };
      }
      if (paused) return { trace, paused: true };
      fail('X37_EVENT_PUMP_LIMIT');
    },
    pause() { paused = true; void both('pause').catch(() => {}); },
    reset() { paused = true; return both('reset'); },
    dispose() { disposed = true; for (const id of ['avr', 'rp']) runtimePair[id].terminate(); return []; },
  });
}

export function createX37OrdinaryCandidateRoute({ routeIdentity, fetchImpl = fetch,
  workerFactory = (url, options) => new Worker(url, options), workerUrl = './x37-ordinary-participant.worker.js',
  productAdapterFactory = asyncPairAdapter, privateRouteCapability } = {}) {
  validateRoute(routeIdentity);
  if (!/^[A-Za-z0-9_-]{40,80}$/u.test(privateRouteCapability ?? '')) fail('X37_PRIVATE_ROUTE_CAPABILITY_INVALID');
  const artifacts = new Map();
  const compileParticipant = async (participant, projectGeneration, runtimeGeneration, { signal } = {}) => {
    const result = await submitAndPoll(fetchImpl, requestFor(participant), signal, privateRouteCapability);
    const build = validatedBuild(participant, result, projectGeneration, runtimeGeneration);
    artifacts.set(build.artifactIdentity, clone(build.artifact)); return build;
  };
  const createRuntimePair = async (builds, lifecycle) => {
    const pair = {}; try {
      for (const id of ['avr', 'rp']) {
        const build = builds[id]; const artifact = artifacts.get(build?.artifactIdentity); if (!artifact) fail('X37_RUNTIME_ARTIFACT_NOT_OWNED');
        pair[id] = rpcWorker(workerFactory(workerUrl, { type: 'module', name: `x37-${id}` }), id);
        await pair[id].call('init', { profile: build.profile, projectGeneration: lifecycle.projectGeneration,
          runtimeGeneration: lifecycle.runtimeGeneration, artifact: id === 'rp' ? { format: 'uf2', bytes: base64(artifact.uf2.base64),
            expectedSha256: artifact.uf2.sha256 } : { format: 'hex', hex: artifact.hex, expectedSha256: artifact.hexSha256 } });
      }
      return pair;
    } catch (error) { for (const value of Object.values(pair)) value.terminate(); throw Object.assign(error, { partialRuntimePair: pair }); }
  };
  const disposeRuntimePair = (pair) => { const errors = []; for (const id of ['avr', 'rp']) {
    try { pair?.[id]?.terminate(); } catch (error) { errors.push({ participantId: id, code: error.code ?? error.message }); }
  } return errors; };
  const createProductAdapterForPair = ({ builds, runtimePair, lifecycleOwner }) => productAdapterFactory({ builds, runtimePair, lifecycleOwner });
  return Object.freeze({ capability: X37_PRIVATE_CANDIDATE_CAPABILITY, compileParticipant,
    createRuntimePair, createProductAdapter: createProductAdapterForPair, disposeRuntimePair });
}
