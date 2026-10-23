// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

// Browser-safe projection of the checksum-pinned server image locks. A source
// test compares every value with the owning JSON lock so this module cannot
// silently drift or import Node-only artifact readers into the public bundle.
export const ESP32C3_EXECUTION_IDENTITIES = Object.freeze({
  compilerImageIdentity: 'sha256:5b2105f4689d21c797cc631421bccbe25b9095d4a6500657dca0ece5dfc801e3',
  compilerToolchainIdentity: 'sha256:2f281020849e32283c94ef27591ea04aa1e661b6f8bce9401fbb82fa418550b2',
  runtimeImageIdentity: 'sha256:b79eb6d9e3504b81e1c90648bf5f4f7b43588fc33ba0ee91d3dc6468c4f9df25',
  runtimeBinaryIdentity: 'sha256:834699a726720f5273b79bb1e8b3f735f6e0540f17fdf466dfd20055605f2b4d',
});
