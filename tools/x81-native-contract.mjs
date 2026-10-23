import { createHash } from 'node:crypto';
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function validateX81CompilerResult(result) {
  const artifact = result?.artifact;
  if (!artifact || typeof artifact.hex !== 'string' || typeof artifact.elfBase64 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(result.inputIdentity ?? '')) throw Error('X81_BUILD_SHAPE_INVALID');
  const elf = Buffer.from(artifact.elfBase64, 'base64');
  if (elf.toString('base64') !== artifact.elfBase64 || !elf.length
      || digest(artifact.hex) !== artifact.hexSha256 || digest(elf) !== artifact.elfSha256) throw Error('X81_BUILD_PAYLOAD_INVALID');
  const identity = digest(JSON.stringify({ inputIdentity: result.inputIdentity,
    hexSha256: artifact.hexSha256, elfSha256: artifact.elfSha256 }));
  if (identity !== result.artifactIdentity) throw Error('X81_BUILD_IDENTITY_INVALID');
  return { hexSha256: artifact.hexSha256, elfSha256: artifact.elfSha256, artifactIdentity: identity };
}
export function validateX81Pair(runs) {
  if (runs.length !== 2 || runs.some((r) => r.observations.records.length !== 512
      || r.identity.workerInitialization !== 1 || !/^[a-f0-9]{32}$/u.test(r.identity.workerInstanceNonce))) throw Error('X81_PAIR_INVALID');
  if (runs[0].identity.workerInstanceNonce === runs[1].identity.workerInstanceNonce
      || runs[0].identity.runtimeGeneration === runs[1].identity.runtimeGeneration) throw Error('X81_PAIR_NOT_FRESH');
  if (JSON.stringify(runs[0].observations) !== JSON.stringify(runs[1].observations)) throw Error('X81_BEHAVIOR_DIFFERS');
  return true;
}
