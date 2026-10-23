// SPDX-License-Identifier: Apache-2.0
import {assessX81,createTrustedX81OwnerRegistry,x81Hash,X81_REPORT_SCHEMA} from './x81-reproducibility-assessor.mjs';
export const X81_HARNESS_SCHEMA='intent-mcu-x81-qualified-harness@1';
export const X81_FIXED_AVR={schema:X81_HARNESS_SCHEMA,profile:'board.atmega328p-16mhz-v1',source:'int main(void){for(;;){}}',graph:{components:['avr'],nets:[]},schedule:{startInstruction:100,endInstruction:102},model:'avr8-fixed-v1',runtime:'isolated-worker-v1',compiler:'avr-gcc',toolchain:'avr-gcc-fixed-image-v1'};
export const X81_HARD_BUDGET=Object.freeze({builds:1,workerExecutions:2,scenarios:0,retries:0,images:0});
export async function runFakeX81QualificationHarness(fakeProducer){
  if(!fakeProducer||typeof fakeProducer.build!=='function'||typeof fakeProducer.run!=='function')throw new Error('X81_FAKE_PRODUCER_REQUIRED');
  const usage={builds:0,workerExecutions:0,scenarios:0,retries:0,images:0};
  const context={profile:X81_FIXED_AVR.profile,sourceSha256:await x81Hash(X81_FIXED_AVR.source),graphSha256:await x81Hash(X81_FIXED_AVR.graph),scheduleSha256:await x81Hash(X81_FIXED_AVR.schedule),modelSha256:await x81Hash(X81_FIXED_AVR.model),runtimeSha256:await x81Hash(X81_FIXED_AVR.runtime),toolchainSha256:await x81Hash({compiler:X81_FIXED_AVR.compiler,toolchain:X81_FIXED_AVR.toolchain})};
  const buildRequest={schema:'intent-mcu-x81-build-request@1',context}; usage.builds++; const built=await fakeProducer.build(buildRequest);
  const runs=[]; for(let n=1;n<=2;n++){const request={schema:'intent-mcu-x81-run-request@1',context,artifactSha256:built.artifactSha256,ordinal:n};usage.workerExecutions++;runs.push(await fakeProducer.run(request));}
  if(Object.keys(usage).some((k)=>usage[k]>X81_HARD_BUDGET[k]))throw new Error('X81_HARD_BUDGET_EXCEEDED');
  const evidence={schema:X81_REPORT_SCHEMA,evidenceId:'synthetic-qualified-harness',context,runs,builds:[built],historicalGaps:[],authority:{apply:false,build:false,run:false,verdict:false}};
  const records=[]; for(const value of runs)records.push({schema:'intent-mcu-x81-owner-binding@1',role:'run',ownerSchema:value.provenance.ownerSchema,receiptSha256:value.provenance.receiptSha256,evidenceSchema:X81_REPORT_SCHEMA,profile:context.profile,contextSha256:await x81Hash(context),requestSha256:value.provenance.runRequestSha256,operationId:value.runId,workerNonce:value.workerNonce,artifactPayloadSha256:null,observationsSha256:value.observationsSha256,observationWindowSha256:await x81Hash(value.observations.window)});
  records.push({schema:'intent-mcu-x81-owner-binding@1',role:'build',ownerSchema:built.provenance.ownerSchema,receiptSha256:built.provenance.receiptSha256,evidenceSchema:X81_REPORT_SCHEMA,profile:context.profile,contextSha256:await x81Hash(context),requestSha256:built.provenance.buildRequestSha256,operationId:built.buildId,workerNonce:null,artifactPayloadSha256:built.artifactSha256,observationsSha256:null,observationWindowSha256:null});
  const registry=createTrustedX81OwnerRegistry(records); return {evidence,registry,result:await assessX81(evidence,registry),usage,budget:X81_HARD_BUDGET};
}
