import { parentPort } from 'node:worker_threads';
import { ensureX37WorkerEnvironment } from '../../../src/x37-worker-environment.mjs';

const evidence = await ensureX37WorkerEnvironment();
parentPort.postMessage({ schema: 'x37-producer-worker-result@1', status: 'passed', evidence });
