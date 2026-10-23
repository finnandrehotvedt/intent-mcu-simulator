// SPDX-License-Identifier: Apache-2.0
import {x81Hash} from './x81-reproducibility-assessor.mjs';
const H=/^[a-f0-9]{64}$/u, IMG=/^sha256:[a-f0-9]{64}$/u;
export const X81_AVR_NATIVE_PINS=Object.freeze({schema:'intent-mcu-x81-avr-native-pins@1',profile:'board.atmega328p-16mhz-v1',toolchainManifestSha256:'098e57cc2da7f46f0abea657a33473ef7c2a3c2f556152640fb4862ad4de53d2',toolchainImageId:'sha256:f04aa7a8c37699d16a965fb374870ff147ca776ba6386f81e7700e350ed3d89f',modelImplementationSha256:'29bce4230c2de2e0eb2713e664fcda71fd8434d4c916591323cb3cfa30f4c3f4',workerImplementationSha256:'697d3822edb6c7b95e84ad56d1f7c45bc21e9a07f72c0f9e94b7ad79bc85b08e',runtimeImplementationSha256:'8ae935906e1981916b7bc1ab7c2243c6624404b232d1844e1d690c632172bc6e',buildProtocolSha256:'a434642391598b05c592e6df4f8eef792f235df5017156c03def65da9f12b4bb',buildWorkerSha256:'e80df7467c72ea691e0f6b21b800955dd12c41e069b24bee563f4b915cd6f8e0',avr8jsVersion:'0.21.1'});
export class X81NativeBudget {
  constructor(store,key='x81-native-budget'){this.store=store;this.key=key;}
  read(){return JSON.parse(this.store.getItem(this.key)||'{"build":0,"run":0,"terminal":false}');}
  reserve(kind){const v=this.read(),limit=kind==='build'?1:2;if(v.terminal||v[kind]>=limit)throw new Error('X81_NATIVE_BUDGET_EXHAUSTED');v[kind]++;this.store.setItem(this.key,JSON.stringify(v));return Object.freeze({...v});}
  terminal(){const v=this.read();v.terminal=true;this.store.setItem(this.key,JSON.stringify(v));}
}
export async function verifyX81NativeResult({submittedBuildRequest,rawBuildReceipt,submittedRunRequests,rawRunReceipts,pins=X81_AVR_NATIVE_PINS}){
  if(!IMG.test(pins.toolchainImageId)||Object.entries(pins).filter(([k])=>k.endsWith('Sha256')).some(([,v])=>!H.test(v)))throw new Error('X81_NATIVE_PINS_INVALID');
  if(await x81Hash(submittedBuildRequest)!==rawBuildReceipt.requestSha256||rawBuildReceipt.toolchainImageId!==pins.toolchainImageId||rawBuildReceipt.toolchainManifestSha256!==pins.toolchainManifestSha256)throw new Error('X81_NATIVE_BUILD_JOIN_INVALID');
  if(!H.test(rawBuildReceipt.artifactSha256)||submittedRunRequests.length!==2||rawRunReceipts.length!==2)throw new Error('X81_NATIVE_RESULT_INVALID');
  for(let i=0;i<2;i++){const q=submittedRunRequests[i],r=rawRunReceipts[i];if(await x81Hash(q)!==r.requestSha256||q.artifactSha256!==rawBuildReceipt.artifactSha256||r.artifactSha256!==rawBuildReceipt.artifactSha256||!H.test(r.observationsSha256)||await x81Hash(r.observations.window)!==r.observationWindowSha256)throw new Error('X81_NATIVE_RUN_JOIN_INVALID');}
  if(rawRunReceipts[0].workerId===rawRunReceipts[1].workerId||rawRunReceipts[0].workerEpoch===rawRunReceipts[1].workerEpoch)throw new Error('X81_NATIVE_WORKERS_NOT_FRESH');
  return Object.freeze({schema:'intent-mcu-x81-native-verified-raw@1',artifactSha256:rawBuildReceipt.artifactSha256,buildReceiptSha256:await x81Hash(rawBuildReceipt),runReceiptSha256:await Promise.all(rawRunReceipts.map(x81Hash)),pins});
}
