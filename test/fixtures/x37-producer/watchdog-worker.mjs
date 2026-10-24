import { parentPort, workerData } from 'node:worker_threads';

if (workerData.mode === 'success') {
  parentPort.postMessage({ schema: 'x37-producer-worker-result@1', status: 'passed', evidence: [] });
} else if (workerData.mode === 'malformed') {
  parentPort.postMessage({ status: 'passed' });
} else if (workerData.mode === 'sync-loop') {
  for (;;) { /* killed by parent watchdog */ }
}
