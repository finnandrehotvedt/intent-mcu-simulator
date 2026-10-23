// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
function createRecorder(file) {
  const raw = []; const counts = { build: 0, run: 0, quiescence: 0 };
  const save = () => fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });
  return { raw, counts, save,
    attest(target, expected) {
      const ok = target.gitCommit === expected.gitCommit && target.distMainSha256 === expected.distMainSha256
        && target.stm32Service === true && target.defaultProviders === true;
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
