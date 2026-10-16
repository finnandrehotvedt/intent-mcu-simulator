// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { validateExecutableArtifactDescriptor } from './controller-executable-artifact-node-v1.mjs';
import {
  COMPILED_FIXTURE_REFERENCE_SCHEMA,
  validateCompiledFixtureReference,
} from './project-v3-contact-persistence.mjs';

const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const clone = (value) => structuredClone(value);

export function fixtureReferenceFromArtifactDescriptor(id, descriptor, sourceBytes) {
  if (typeof id !== 'string' || !ID.test(id)
      || !validateExecutableArtifactDescriptor(descriptor)
      || !Number.isInteger(sourceBytes) || sourceBytes <= 0) throw new Error('PROJECT_CONTACT_FIXTURE');
  const reference = {
    schema: COMPILED_FIXTURE_REFERENCE_SCHEMA,
    id,
    profile: descriptor.profile,
    toolchainImageId: descriptor.toolchainImageId,
    source: { sha256: descriptor.inputIdentitySha256, bytes: sourceBytes },
    executable: clone(descriptor.executable),
    debug: clone(descriptor.debug),
    artifactIdentitySha256: descriptor.artifactIdentitySha256,
  };
  if (!validateCompiledFixtureReference(reference, descriptor.profile)) throw new Error('PROJECT_CONTACT_FIXTURE');
  return reference;
}
