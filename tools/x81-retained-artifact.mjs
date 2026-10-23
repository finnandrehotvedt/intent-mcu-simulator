#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import{readFile}from'node:fs/promises';import{fileURLToPath}from'node:url';import{digest,validateX81CompilerResult}from'./x81-native-contract.mjs';import{buildInputIdentity,normalizeBuildRequestValue}from'../compiler/build-protocol.mjs';
const H=/^[a-f0-9]{64}$/u;
export async function validateRetainedX81({requestPath,responsePath,requestFileSha256,responseFileSha256,compilerImageId,toolchainManifestSha256}){
  if(!H.test(requestFileSha256)||!H.test(responseFileSha256)||!/^sha256:[a-f0-9]{64}$/u.test(compilerImageId)||!H.test(toolchainManifestSha256))throw Error('X81_RETAINED_AUTHORITY_INVALID');
  const [requestBytes,responseBytes]=await Promise.all([readFile(requestPath),readFile(responsePath)]);
  if(digest(requestBytes)!==requestFileSha256||digest(responseBytes)!==responseFileSha256)throw Error('X81_RETAINED_FILE_HASH_INVALID');
  const request=JSON.parse(requestBytes),normalized=normalizeBuildRequestValue({schema:request.schema,board:request.board,files:request.files});
  if(JSON.stringify(request)!==JSON.stringify(normalized))throw Error('X81_RETAINED_REQUEST_INVALID');
  const response=JSON.parse(responseBytes),domains=validateX81CompilerResult(response);
  if(response.toolchainImageId!==compilerImageId||response.toolchainIdentitySha256!==toolchainManifestSha256)throw Error('X81_RETAINED_COMPILER_PIN_INVALID');
  const expected=buildInputIdentity(request,{imageId:compilerImageId,toolchainManifestSha256});
  if(response.inputIdentity!==expected)throw Error('X81_RETAINED_SOURCE_JOIN_INVALID');
  return Object.freeze({schema:'intent-mcu-x81-retained-artifact@1',requestFileSha256,responseFileSha256,inputIdentity:expected,...domains,compilerImageId,toolchainManifestSha256,provenance:'retained-failed-native-acceptance-001',budget:{builds:0,workerExecutions:2,scenarios:0,retries:0,images:0}});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error('usage: node tools/x81-retained-artifact.mjs AUTHORITY.json');const a=JSON.parse(await readFile(process.argv[2]));console.log(JSON.stringify(await validateRetainedX81(a),null,2));}
