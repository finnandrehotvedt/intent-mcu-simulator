// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { publicControllerView } from './public-controller-workbench-view.mjs';
import { evaluateProjectFeasibility } from './project-feasibility.mjs';
import { prepareProjectEnvelope } from './project-envelope.mjs';
import { describeProjectChanges, projectTextSha256 } from './project-patch.mjs';

export const DESIGN_COMPARISON_SCHEMA = 'intent-mcu-design-comparison@1';

const failure = (code, details = []) => ({ ok: false, code, details });
const clone = (value) => structuredClone(value);

function collection(project, key) {
  const value = project?.circuit?.[key] ?? project?.[key] ?? [];
  return Array.isArray(value) ? value : [];
}

function sourceCount(project) {
  if (typeof project?.source === 'string') return 1;
  return Array.isArray(project?.source?.files) ? project.source.files.length : 0;
}

function metrics(project) {
  return Object.freeze({
    sourceFiles: sourceCount(project),
    components: collection(project, 'components').length,
    wires: collection(project, 'nets').length,
  });
}

function sameRequirements(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function compareDesignAlternatives({
  currentProjectText,
  candidateProjectText,
  adapters,
  activeProfile,
  expectedBaseSha256 = null,
  expectedCandidateSha256 = null,
}) {
  try {
    const current = prepareProjectEnvelope(currentProjectText, adapters);
    const candidate = prepareProjectEnvelope(candidateProjectText, adapters);
    if (!current.ok) return failure('DESIGN_COMPARISON_CURRENT_INVALID', [current.code, ...(current.details ?? [])]);
    if (!candidate.ok) return failure('DESIGN_COMPARISON_CANDIDATE_INVALID', [candidate.code, ...(candidate.details ?? [])]);
    if (current.profile !== activeProfile || candidate.profile !== activeProfile) {
      return failure('DESIGN_COMPARISON_PROFILE_MISMATCH', [activeProfile, current.profile, candidate.profile]);
    }
    const baseProjectSha256 = await projectTextSha256(current.canonical);
    const candidateProjectSha256 = await projectTextSha256(candidate.canonical);
    if ((expectedBaseSha256 && expectedBaseSha256 !== baseProjectSha256)
        || (expectedCandidateSha256 && expectedCandidateSha256 !== candidateProjectSha256)) {
      return failure('DESIGN_COMPARISON_STALE', [expectedBaseSha256, baseProjectSha256,
        expectedCandidateSha256, candidateProjectSha256]);
    }
    if (!sameRequirements(current.brief, candidate.brief)) {
      return failure('DESIGN_COMPARISON_REQUIREMENTS_DIFFER');
    }
    const view = publicControllerView(activeProfile);
    if (!view) return failure('DESIGN_COMPARISON_MODEL_UNAVAILABLE', [activeProfile]);
    const requirementsSha256 = await projectTextSha256(`${JSON.stringify(current.brief)}\n`);
    const feasibility = evaluateProjectFeasibility(activeProfile, current.brief.requiredCapabilities);
    const requirementIds = current.brief.acceptanceCriteria.map((item) => item.id);
    const changes = describeProjectChanges(activeProfile, current.project, candidate.project);
    if (!changes.length) return failure('DESIGN_COMPARISON_NO_DIFFERENCE');
    const common = {
      requirementsSha256,
      requirementIds,
      requiredCapabilities: clone(feasibility.items),
      model: {
        schema: view.schema,
        profile: activeProfile,
        label: view.label,
        limitation: view.limitation,
      },
    };
    return {
      ok: true,
      code: 'DESIGN_COMPARISON_READY',
      schema: DESIGN_COMPARISON_SCHEMA,
      profile: activeProfile,
      requirements: {
        sha256: requirementsSha256,
        ids: [...requirementIds],
        requiredCapabilityIds: current.brief.requiredCapabilities.map((item) => item.id),
        sameForBoth: true,
      },
      alternatives: [
        { id: 'current', label: 'Current design', projectSha256: baseProjectSha256,
          metrics: metrics(current.project), ...clone(common) },
        { id: 'proposed', label: 'Proposed design', projectSha256: candidateProjectSha256,
          metrics: metrics(candidate.project), ...clone(common) },
      ],
      changes: clone(changes),
      evaluated: false,
      recommendation: null,
      buildAuthority: false,
    };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'DESIGN_COMPARISON_INVALID', error.details ?? []);
  }
}
