// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
function createRecorder(file) {
  const raw = []; const counts = { build: 0, run: 0, quiescence: 0 };
  const save = () => fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });
  return { raw, counts, save,
    attest(target, expected) {
      const ok = target.schema === 'intent-mcu-x92-stm32-private-target@1'
        && target.serviceSchema === 'intent-mcu-stm32-service-attestation@1'
        && target.gitCommit === expected.gitCommit && target.gitClean === true
        && target.distMainSha256 === expected.distMainSha256
        && target.modelIdentity === expected.modelIdentity
        && target.serviceSourceSha256 === expected.serviceSourceSha256
        && target.runnerSourceSha256 === expected.runnerSourceSha256
        && target.harnessSha256 === expected.harnessSha256
        && target.browserSha256 === expected.browserSha256
        && target.stm32Service === true && target.defaultProviders === true
        && target.imagesVerified === true && target.readiness === true
        && target.compilerImageIdentity === expected.compilerImageIdentity
        && target.compilerToolchainIdentity === expected.compilerToolchainIdentity
        && target.runtimeImageIdentity === expected.runtimeImageIdentity
        && target.runtimeBinaryIdentity === expected.runtimeBinaryIdentity;
      if (!ok) { raw.push({ kind: 'target-mismatch', target }); save(); }
      return ok;
    },
    admit(name) {
      if (!(name in counts) || ++counts[name] > 1) { raw.push({ kind: 'blocked-extra-producer', name }); save(); return false; }
      return true;
    },
    async checkpoint(entry, continuation) { raw.push(entry); save(); return continuation(); },
  };
}
module.exports = { createRecorder };
