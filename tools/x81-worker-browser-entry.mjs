// Private qualification entry; bundle with esbuild, never mount on the public page.
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { validateWorkerRuntimeIdentity } from '../src/runtime-identity.mjs';

export function qualificationContext() {
  return { circuit: structuredClone(DEFAULT_CIRCUIT), modelLibraryLock: structuredClone(CURRENT_MODEL_LIBRARY_LOCK) };
}

export async function runX81Worker({ hex, binding, workerUrl, endInstruction = 512 }) {
  if (endInstruction !== 512) throw Error('X81_FIXED_WINDOW_REQUIRED');
  const worker = new Worker(workerUrl, { type: 'module' });
  let pending = null, retired = false;
  const raw = [];
  const receive = (kind) => new Promise((resolve, reject) => {
    if (pending) throw Error('X81_WORKER_OVERLAP');
    const timer = setTimeout(() => { pending = null; reject(Error('X81_WORKER_ACK_TIMEOUT')); }, 5000);
    pending = { kind, resolve(value) { clearTimeout(timer); pending = null; resolve(value); },
      reject(error) { clearTimeout(timer); pending = null; reject(error); } };
  });
  worker.onmessage = ({ data }) => {
    raw.push(data);
    if (data.kind === 'error' || data.kind === 'stopped-error' || data.kind === 'stopped-unsupported') {
      pending?.reject(Error(data.message || data.kind)); return;
    }
    if (pending?.kind === data.kind) pending.resolve(data);
  };
  worker.onerror = (event) => pending?.reject(Error(event.message));
  const command = async (value, kind) => { const ack = receive(kind); worker.postMessage(value); return ack; };
  const check = (message, instruction, nonce = null) => {
    validateWorkerRuntimeIdentity(message.runtimeIdentity, binding, nonce);
    if (message.instructions !== instruction || message.paused !== true
        || Object.values(message.retentionDrops ?? {}).some((n) => n !== 0)
        || message.eventLog?.dropped !== 0 || message.eventLog?.pending?.length !== 0
        || message.instruments?.serial?.dropped !== 0 || message.instruments?.logic?.dropped !== 0) {
      throw Error('X81_INCOMPLETE_OBSERVATION');
    }
  };
  try {
    const ready = await command({ command: 'init', runtimeProfile: 'board.atmega328p-16mhz-v1',
      runtimeBinding: binding, hex, circuit: DEFAULT_CIRCUIT,
      modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
      modelImplementationSha256: binding.modelImplementationSha256,
      modelExecutionContextSha256: binding.modelExecutionContextSha256,
      instruments: { logicChannels: ['D13'], serialHistoryLimit: 512 } }, 'ready');
    check(ready, 0);
    if (ready.cycle !== 0 || ready.runtimeIdentity.workerInitialization !== 1) throw Error('X81_RESET_ORIGIN_INVALID');
    const nonce = ready.runtimeIdentity.workerInstanceNonce;
    const records = [];
    for (let instruction = 1; instruction <= endInstruction; instruction++) {
      const stepped = await command({ command: 'step' }, 'stepped');
      check(stepped, instruction, nonce);
      records.push({ instruction, channel: 'cpu-gpio-uart', value: JSON.stringify({ cycle: stepped.cycle,
        pc: stepped.pc, pins: stepped.pins, serial: stepped.instruments.serial.records }) });
    }
    const disposed = await command({ command: 'dispose', disposeToken: `x81-${binding.runtimeGeneration}` }, 'disposed');
    validateWorkerRuntimeIdentity(disposed.runtimeIdentity, binding, nonce);
    if (disposed.disposeToken !== `x81-${binding.runtimeGeneration}`) throw Error('X81_DISPOSE_JOIN_INVALID');
    retired = true;
    return { identity: ready.runtimeIdentity, binding, raw, disposed, observations: {
      window: { startInstruction: 1, endInstruction }, records, loss: { dropped: 0, truncated: false } } };
  } catch (error) {
    // Preserve partial private observations for the Node owner's failure checkpoint.
    error.x81Partial = raw; throw error;
  } finally {
    worker.terminate();
    // A missing dispose ACK is never converted into a successful proof.
    if (!retired) pending?.reject(Error('X81_WORKER_RETIRED_WITHOUT_ACK'));
  }
}

globalThis.__X81_PRIVATE_WORKER__ = { qualificationContext, runX81Worker };
