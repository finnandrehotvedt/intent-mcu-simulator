import { parentPort, workerData } from 'node:worker_threads';

const flag = new Int32Array(workerData.abortBuffer); let checks = 0;
while (Atomics.load(flag, 0) === 0) checks += 1;
parentPort.postMessage({ schema: 'x37-producer-worker-result@1', status: 'failed',
  code: 'X37_COOPERATIVE_ABORT', evidence: { checks, lifecycleFinally: true } });
