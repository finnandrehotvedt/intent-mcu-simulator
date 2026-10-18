// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const HEADLESS_COMPILER_ORIGIN = 'https://lab.teachthecompany.com';
export const HEADLESS_COMPILER_POLL_LIMIT = 200;
const SHA256 = /^[a-f0-9]{64}$/u;

export function resolveHeadlessCompilerOrigin(environment = process.env) {
  const candidate = environment.INTENT_MCU_HEADLESS_TEST_ORIGIN;
  if (!candidate) return HEADLESS_COMPILER_ORIGIN;
  if (environment.NODE_ENV !== 'test') throw new Error('HEADLESS_COMPILER_ORIGIN_PINNED');
  const url = new URL(candidate);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('HEADLESS_COMPILER_TEST_ORIGIN_INVALID');
  }
  return url.origin;
}

const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, milliseconds);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer); reject(Object.assign(new Error('HEADLESS_CANCELLED'), { code: 'HEADLESS_CANCELLED' }));
  }, { once: true });
});

export async function compileHeadlessAvr(request, {
  fetchImpl = fetch, signal,
} = {}) {
  const origin = resolveHeadlessCompilerOrigin();
  if (signal?.aborted) throw Object.assign(new Error('HEADLESS_CANCELLED'), { code: 'HEADLESS_CANCELLED' });
  const submitted = await fetchImpl(`${origin}/api/build`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1', Origin: origin },
    body: JSON.stringify({
      schema: request.schema,
      board: request.board,
      files: request.files.map(({ name, content }) => ({ name, content })),
    }),
  });
  if (submitted.status !== 202) {
    const body = (await submitted.text()).slice(0, 512);
    throw Object.assign(new Error('HEADLESS_BUILD_SUBMISSION_FAILED'), {
      code: 'HEADLESS_BUILD_SUBMISSION_FAILED', status: submitted.status,
      details: [String(submitted.status), body],
    });
  }
  const claim = await submitted.json();
  if (typeof claim.jobId !== 'string' || typeof claim.capability !== 'string'
      || !SHA256.test(claim.inputIdentity)) {
    throw Object.assign(new Error('HEADLESS_BUILD_CLAIM_INVALID'), { code: 'HEADLESS_BUILD_CLAIM_INVALID' });
  }
  for (let attempt = 0; attempt < HEADLESS_COMPILER_POLL_LIMIT; attempt += 1) {
    if (signal?.aborted) throw Object.assign(new Error('HEADLESS_CANCELLED'), { code: 'HEADLESS_CANCELLED' });
    const response = await fetchImpl(`${origin}/api/build/${encodeURIComponent(claim.jobId)}`, {
      signal, headers: { Authorization: `Bearer ${claim.capability}`, Origin: origin },
    });
    if (response.status !== 200) {
      throw Object.assign(new Error('HEADLESS_BUILD_STATUS_FAILED'), {
        code: 'HEADLESS_BUILD_STATUS_FAILED', status: response.status,
      });
    }
    const status = await response.json();
    if (status.status === 'succeeded') {
      const result = status.result;
      if (!SHA256.test(result?.inputIdentity) || !SHA256.test(result?.artifactIdentity)
          || typeof result?.artifact?.hex !== 'string'
          || result.inputIdentity !== claim.inputIdentity) {
        throw Object.assign(new Error('HEADLESS_BUILD_RESULT_INVALID'), { code: 'HEADLESS_BUILD_RESULT_INVALID' });
      }
      return structuredClone(result);
    }
    if (['failed', 'cancelled', 'timeout'].includes(status.status)) {
      throw Object.assign(new Error(`HEADLESS_BUILD_${status.status.toUpperCase()}`), {
        code: `HEADLESS_BUILD_${status.status.toUpperCase()}`, compilerCode: status.error ?? status.result?.code ?? null,
      });
    }
    await wait(50, signal);
  }
  throw Object.assign(new Error('HEADLESS_BUILD_POLL_TIMEOUT'), { code: 'HEADLESS_BUILD_POLL_TIMEOUT' });
}
