// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

// Browser-safe projection of the checksum-pinned STM32 image locks and Renode
// binary asset. Source tests bind these values back to the owning server files.
export const STM32_EXECUTION_IDENTITIES = Object.freeze({
  compilerImageIdentity: 'sha256:a5ce68a44d599f77d67389db0c4eb3a3690af82ec71cd6a1f3edd5f92c1ec0ea',
  compilerToolchainIdentity: 'sha256:fc238ac8d13b82c6f2b247e3e5e1d846235205c341bb5c52aa5de1070ab8761e',
  runtimeImageIdentity: 'sha256:f52ebf0eac4ece7914de8bbde13233d263ec51a0395037e85ce83ccc7c103b18',
  runtimeBinaryIdentity: 'sha256:4ba7c68b59e2447f188ef4b4b112fcccd2802582c460beedceb63b84e5605a5f',
});
