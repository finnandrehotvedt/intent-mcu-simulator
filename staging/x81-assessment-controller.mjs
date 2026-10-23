// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import {
  assessX81, createX81Export, reopenX81Export, X81_EXPORT_SCHEMA,
} from '../src/x81-reproducibility-assessor.mjs';
import { parseStrictJson } from '../src/strict-json.mjs';

// trustedRegistry is a release-owned capability, never read from uploaded JSON.
// This controller deliberately has no project/build/runtime/worker dependencies.
export function installX81Assessment({ trustedRegistry = null, retainedEvidence = null,
  retainedLabel = 'Reviewed retained report', document: doc = document } = {}) {
  const q = (id) => doc.getElementById(id);
  const dialog = q('x81-assessment-dialog');
  if (!dialog || !q('x81-assessment-open')) return null;
  let epoch = 0; let acceptedSource = null; let acceptedResult = null;
  const status = (text) => { q('x81-assessment-status').textContent = text; };
  const render = (source, result) => {
    acceptedSource = structuredClone(source); acceptedResult = structuredClone(result);
    q('x81-observed-status').textContent = `${result.observedBehavior.status}: ${result.observedBehavior.reason}`;
    q('x81-rebuild-status').textContent = `${result.independentRebuildBytes.status}: ${result.independentRebuildBytes.reason}`;
    q('x81-assessment-context').textContent = JSON.stringify(result.context, null, 2);
    const windows = source.runs.map((run) => run.observations.window);
    q('x81-assessment-window').textContent = windows.length
      ? windows.map((value) => `${value.startInstruction}-${value.endInstruction}`).join('; ')
      : 'No complete observation window';
    q('x81-assessment-gaps').replaceChildren(...(result.observedBehavior.gaps ?? []).map((text) => {
      const item = doc.createElement('li'); item.textContent = text; return item;
    }));
    q('x81-assessment-save').disabled = false;
    status('Local assessment accepted. Assessment files grant no runtime authority.');
  };
  const clear = () => {
    epoch += 1; acceptedSource = null; acceptedResult = null;
    q('x81-assessment-file').value = '';
    q('x81-observed-status').textContent = 'Not assessed';
    q('x81-rebuild-status').textContent = 'Not assessed';
    q('x81-assessment-context').textContent = '';
    q('x81-assessment-window').textContent = 'No evidence loaded';
    q('x81-assessment-gaps').replaceChildren(); q('x81-assessment-save').disabled = true;
    status('No evidence loaded.');
  };
  async function accept(value, token) {
    const opened = value.schema === X81_EXPORT_SCHEMA
      ? await reopenX81Export(value, trustedRegistry)
      : { sourceEvidence: value, derivedResult: await assessX81(value, trustedRegistry) };
    if (token !== epoch) return;
    render(opened.sourceEvidence, opened.derivedResult);
  }
  q('x81-assessment-open').addEventListener('click', () => {
    if (!dialog.open) dialog.showModal(); q('x81-assessment-title').focus();
  });
  dialog.addEventListener('close', () => { epoch += 1; });
  q('x81-assessment-close').addEventListener('click', () => dialog.close());
  q('x81-assessment-clear').addEventListener('click', clear);
  q('x81-assessment-file').addEventListener('change', async (event) => {
    const token = ++epoch; const file = event.target.files?.[0];
    if (!file) return;
    try { await accept(parseStrictJson(await file.text(), 4 * 1024 * 1024), token); }
    catch {
      if (token === epoch) status('Rejected: invalid, incompatible or tampered assessment. Last accepted assessment preserved.');
    }
  });
  const retained = q('x81-assessment-retained');
  retained.disabled = retainedEvidence === null || trustedRegistry === null;
  retained.textContent = retained.disabled ? 'Reviewed retained report unavailable' : `Load ${retainedLabel}`;
  retained.addEventListener('click', async () => {
    if (retained.disabled) return;
    const token = ++epoch;
    try { await accept(structuredClone(retainedEvidence), token); }
    catch { if (token === epoch) status('Retained report rejected. Last accepted assessment preserved.'); }
  });
  q('x81-assessment-save').addEventListener('click', async () => {
    if (!acceptedSource) return;
    const token = epoch; const source = structuredClone(acceptedSource);
    try {
      const envelope = await createX81Export(source, trustedRegistry);
      if (token !== epoch) return;
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(envelope, null, 2)}\n`], { type: 'application/json' }));
      const link = doc.createElement('a'); link.href = url;
      link.download = 'x81-reproducibility-assessment.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch { if (token === epoch) status('Assessment could not be saved. Last accepted assessment preserved.'); }
  });
  clear();
  return Object.freeze({ clear, state: () => acceptedResult ? structuredClone(acceptedResult) : null });
}
