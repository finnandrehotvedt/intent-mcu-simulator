import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveX37ProducerArtifacts } from '../src/x37-producer-artifact-source.mjs';

test('retained producer mode cannot call the compiler path', async () => {
  let loads = 0;
  const value = await resolveX37ProducerArtifacts({ mode: 'retained',
    compile: () => { throw new Error('COMPILER_MUST_NOT_RUN'); },
    loadRetained: () => { loads += 1; return { avr: { id: 'avr' }, rp: { id: 'rp' } }; } });
  assert.equal(loads, 1); assert.equal(value.compileCalls, 0);
  assert.deepEqual(value.artifacts, { avr: { id: 'avr' }, rp: { id: 'rp' } });
});
