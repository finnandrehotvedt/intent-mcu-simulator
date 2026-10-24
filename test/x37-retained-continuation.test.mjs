import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveX37MixedRetainedArtifacts, resolveX37ProducerArtifacts,
} from '../src/x37-producer-artifact-source.mjs';

test('retained producer mode cannot call the compiler path', async () => {
  let loads = 0;
  const value = await resolveX37ProducerArtifacts({ mode: 'retained',
    compile: () => { throw new Error('COMPILER_MUST_NOT_RUN'); },
    loadRetained: () => { loads += 1; return { avr: { id: 'avr' }, rp: { id: 'rp' } }; } });
  assert.equal(loads, 1); assert.equal(value.compileCalls, 0);
  assert.deepEqual(value.artifacts, { avr: { id: 'avr' }, rp: { id: 'rp' } });
});

test('mixed retained producer loads both exact participants and cannot call compiler', async () => {
  let compileCalls = 0;
  const value = await resolveX37MixedRetainedArtifacts({
    compile: () => { compileCalls += 1; throw new Error('compiler must remain unreachable'); },
    loadRetainedAvr: async () => ({ hexSha256: 'a'.repeat(64) }),
    loadRetainedRp: async () => ({ uf2: { sha256: 'b'.repeat(64) } }),
  });
  assert.equal(compileCalls, 0); assert.equal(value.compileCalls, 0);
  assert.equal(value.artifacts.avr.hexSha256, 'a'.repeat(64));
  assert.equal(value.artifacts.rp.uf2.sha256, 'b'.repeat(64));
});
