import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, validateX81CompilerResult, validateX81Pair } from '../tools/x81-native-contract.mjs';
test('compiler metadata identity is deliberately distinct from executable payload identity', () => {
  const result = { inputIdentity: 'a'.repeat(64), artifact: { hex: ':00000001FF\n', elfBase64: 'AQID' } };
  result.artifact.hexSha256 = digest(result.artifact.hex);
  result.artifact.elfSha256 = digest(Buffer.from([1, 2, 3]));
  result.artifactIdentity = digest(JSON.stringify({ inputIdentity: result.inputIdentity,
    hexSha256: result.artifact.hexSha256, elfSha256: result.artifact.elfSha256 }));
  assert.notEqual(result.artifactIdentity, result.artifact.hexSha256);
  assert.equal(validateX81CompilerResult(result).artifactIdentity, result.artifactIdentity);
  result.artifact.hex += 'x'; assert.throws(() => validateX81CompilerResult(result), /PAYLOAD/);
});
test('fresh worker initialization is one for each fresh worker, not different counters', () => {
  const observations = { records: Array.from({ length: 512 }, (_, i) => ({ instruction: i + 1 })) };
  const runs = [1, 2].map((n) => ({ identity: { workerInstanceNonce: String(n).repeat(32),
    workerInitialization: 1, runtimeGeneration: n }, observations }));
  assert.equal(validateX81Pair(runs), true);
  runs[1].identity.workerInstanceNonce = runs[0].identity.workerInstanceNonce;
  assert.throws(() => validateX81Pair(runs), /FRESH/);
});
