// SPDX-License-Identifier: Apache-2.0
export const X81_REPORT_SCHEMA = 'intent-mcu-x81-source-evidence@1';
export const X81_RESULT_SCHEMA = 'intent-mcu-x81-reproducibility-status@1';
export const X81_EXPORT_SCHEMA = 'intent-mcu-x81-local-assessment-envelope@1';
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const PROFILES = new Set(['board.atmega328p-16mhz-v1','board.rp2040-pico-v1','board.esp32-c3-devmodule-v1','board.stm32f429zi-nucleo144-v1']);
const keys = (v, expected) => v && typeof v === 'object' && !Array.isArray(v)
  && JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...expected].sort());
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const trustedRegistries = new WeakSet();
export function stableX81(value) {
  if (Array.isArray(value)) return `[${value.map(stableX81).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableX81(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function x81Hash(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : stableX81(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function hashBytes(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map((x)=>x.toString(16).padStart(2,'0')).join('');}
const contextKeys = ['profile','sourceSha256','graphSha256','scheduleSha256','modelSha256','runtimeSha256','toolchainSha256'];
function context(v) { if (!keys(v, contextKeys) || !PROFILES.has(v.profile) || !contextKeys.slice(1).every((k) => HASH.test(v[k]))) fail('X81_CONTEXT_INVALID'); return structuredClone(v); }
function provenance(v, kind) { if (!keys(v,['ownerSchema','receiptSha256',`${kind}RequestSha256`]) || !ID.test(v.ownerSchema) || !HASH.test(v.receiptSha256) || !HASH.test(v[`${kind}RequestSha256`])) fail('X81_PROVENANCE_INVALID'); return v; }
function observations(v) { if (!keys(v,['window','records','loss']) || !keys(v.window,['startInstruction','endInstruction']) || !Number.isSafeInteger(v.window.startInstruction) || !Number.isSafeInteger(v.window.endInstruction) || v.window.endInstruction < v.window.startInstruction || !Array.isArray(v.records) || v.records.length < 1 || v.records.some((x)=>!keys(x,['instruction','channel','value']) || !Number.isSafeInteger(x.instruction) || x.instruction<v.window.startInstruction || x.instruction>v.window.endInstruction || !ID.test(x.channel) || !['boolean','number','string'].includes(typeof x.value)) || !keys(v.loss,['dropped','truncated']) || v.loss.dropped!==0 || v.loss.truncated!==false) fail('X81_OBSERVATIONS_INVALID'); return v; }
function run(v, expected) {
  if (!keys(v, ['runId','workerNonce','context','complete','observations','observationsSha256','provenance'])
      || !ID.test(v.runId) || !ID.test(v.workerNonce) || v.complete !== true || !HASH.test(v.observationsSha256)) fail('X81_RUN_INVALID');
  if (stableX81(context(v.context)) !== stableX81(expected)) fail('X81_RUN_CONTEXT_MISMATCH');
  observations(v.observations); provenance(v.provenance,'run');
  return v;
}
async function build(v, expected) {
  if (!keys(v, ['buildId','context','artifactSha256','artifactBase64','complete','provenance'])
      || !ID.test(v.buildId) || v.complete !== true || !HASH.test(v.artifactSha256)
      || typeof v.artifactBase64!=='string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(v.artifactBase64)
      || stableX81(context(v.context)) !== stableX81(expected)) fail('X81_BUILD_INVALID');
  provenance(v.provenance,'build'); const bytes=Uint8Array.from(atob(v.artifactBase64),(x)=>x.charCodeAt(0));
  if (!bytes.length || await hashBytes(bytes)!==v.artifactSha256) fail('X81_ARTIFACT_HASH_INVALID');
  return v;
}
const registryKeys=['schema','role','ownerSchema','receiptSha256','evidenceSchema','profile','contextSha256','requestSha256','operationId','workerNonce','artifactPayloadSha256','observationsSha256','observationWindowSha256'];
export function createTrustedX81OwnerRegistry(records) {
  if(!Array.isArray(records)) fail('X81_TRUST_REGISTRY_INVALID');
  const copy=records.map((v)=>{
    if(!keys(v,registryKeys)||v.schema!=='intent-mcu-x81-owner-binding@1'||!['run','build'].includes(v.role)
      ||!ID.test(v.ownerSchema)||!HASH.test(v.receiptSha256)||v.evidenceSchema!==X81_REPORT_SCHEMA
      ||!PROFILES.has(v.profile)||!HASH.test(v.contextSha256)||!HASH.test(v.requestSha256)||!ID.test(v.operationId)
      ||(v.role==='run'?(!ID.test(v.workerNonce)||v.artifactPayloadSha256!==null||!HASH.test(v.observationsSha256)||!HASH.test(v.observationWindowSha256))
        :(v.workerNonce!==null||!HASH.test(v.artifactPayloadSha256)||v.observationsSha256!==null||v.observationWindowSha256!==null))) fail('X81_TRUST_REGISTRY_INVALID');
    return Object.freeze(structuredClone(v));
  });
  if(new Set(copy.map((x)=>x.receiptSha256)).size!==copy.length) fail('X81_TRUST_REGISTRY_DUPLICATE');
  const registry=Object.freeze({lookup(receiptSha256){return copy.find((x)=>x.receiptSha256===receiptSha256)??null;}});
  trustedRegistries.add(registry); return registry;
}
async function ownerBinding(value, role, c, registry) {
  if(!trustedRegistries.has(registry)) return false;
  const p=value.provenance; const record=registry.lookup(p.receiptSha256); if(!record)return false;
  const expected={schema:'intent-mcu-x81-owner-binding@1',role,ownerSchema:p.ownerSchema,receiptSha256:p.receiptSha256,
    evidenceSchema:X81_REPORT_SCHEMA,profile:c.profile,contextSha256:await x81Hash(c),requestSha256:p[`${role}RequestSha256`],
    operationId:value[`${role}Id`],workerNonce:role==='run'?value.workerNonce:null,
    artifactPayloadSha256:role==='build'?value.artifactSha256:null,observationsSha256:role==='run'?value.observationsSha256:null,
    observationWindowSha256:role==='run'?await x81Hash(value.observations.window):null};
  return stableX81(record)===stableX81(expected);
}
export async function assessX81(input, trusted = null) {
  if (!keys(input, ['schema','evidenceId','context','runs','builds','historicalGaps','authority'])
      || input.schema !== X81_REPORT_SCHEMA || !ID.test(input.evidenceId)
      || !Array.isArray(input.runs) || !Array.isArray(input.builds)
      || !Array.isArray(input.historicalGaps) || input.historicalGaps.some((x) => typeof x !== 'string' || !x || x.length > 160)
      || stableX81(input.authority) !== stableX81({apply:false,build:false,run:false,verdict:false})) fail('X81_REPORT_INVALID');
  const c = context(input.context); const runs = input.runs.map((x) => run(x, c)); const builds = await Promise.all(input.builds.map((x) => build(x, c)));
  const runHashes=await Promise.all(runs.map((x)=>x81Hash(x.observations)));
  if(runs.some((x,i)=>x.observationsSha256!==runHashes[i])) fail('X81_OBSERVATION_HASH_INVALID');
  const observed = { status:'not-qualified', reason:'two-complete-distinct-runs-required' };
  if (input.historicalGaps.length) Object.assign(observed,{reason:'missing-provenance',gaps:[...input.historicalGaps]});
  else if (runs.length === 2) {
    if (runs[0].runId === runs[1].runId || runs[0].workerNonce === runs[1].workerNonce || runs[0].provenance.receiptSha256===runs[1].provenance.receiptSha256 || runs[0].provenance.runRequestSha256===runs[1].provenance.runRequestSha256) fail('X81_RUNS_NOT_INDEPENDENT');
    const trustedRuns=(await Promise.all(runs.map((x)=>ownerBinding(x,'run',c,trusted)))).every(Boolean);
    Object.assign(observed, !trustedRuns ? {status:'not-qualified',reason:'owner-provenance-untrusted'} : runHashes[0] === runHashes[1] ? {status:'verified',reason:'same-observed-behavior'} : {status:'different',reason:'observations-differ'});
  }
  const rebuild = { status:'not-checked', reason:'two-independent-builds-required' };
  if (builds.length === 2) {
    if (builds[0].buildId === builds[1].buildId || builds[0].provenance.receiptSha256===builds[1].provenance.receiptSha256 || builds[0].provenance.buildRequestSha256===builds[1].provenance.buildRequestSha256) fail('X81_BUILDS_NOT_INDEPENDENT');
    const trustedBuilds=(await Promise.all(builds.map((x)=>ownerBinding(x,'build',c,trusted)))).every(Boolean);
    Object.assign(rebuild, !trustedBuilds ? {status:'not-qualified',reason:'owner-provenance-untrusted'} : builds[0].artifactSha256 === builds[1].artifactSha256
      ? {status:'verified',reason:'byte-identical-independent-builds'} : {status:'different',reason:'artifact-bytes-differ'});
  } else if (builds.length > 2) fail('X81_BUILD_COUNT_INVALID');
  const result = {schema:X81_RESULT_SCHEMA,evidenceId:input.evidenceId,context:c,observedBehavior:observed,independentRebuildBytes:rebuild,
    historical:input.historicalGaps.length>0,authority:{apply:false,build:false,run:false,verdict:false}};
  return {...result,resultSha256:await x81Hash(result)};
}
export async function createX81Export(sourceEvidence, trusted) { const derivedResult=await assessX81(sourceEvidence,trusted); return {schema:X81_EXPORT_SCHEMA,sourceEvidence:structuredClone(sourceEvidence),derivedResult}; }
export async function reopenX81Export(value, trusted) { if(!keys(value,['schema','sourceEvidence','derivedResult'])||value.schema!==X81_EXPORT_SCHEMA) fail('X81_EXPORT_INVALID'); const recomputed=await assessX81(value.sourceEvidence,trusted); if(stableX81(recomputed)!==stableX81(value.derivedResult)) fail('X81_EXPORT_DERIVED_TAMPERED'); return {sourceEvidence:structuredClone(value.sourceEvidence),derivedResult:recomputed}; }
