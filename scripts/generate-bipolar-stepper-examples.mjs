#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
const root=new URL('../examples/indicators-actuators/',import.meta.url),ids=['avr-bipolar-stepper-a4988','avr-bipolar-stepper-drv8825'];
for(const id of ids){const bytes=createAvrReferenceStarter(id).text,file=new URL(`${id}.intent-mcu.json`,root);if(process.argv.includes('--write')){await mkdir(root,{recursive:true});await writeFile(file,bytes);}else if(await readFile(file,'utf8')!==bytes)throw new Error(`BIPOLAR_STEPPER_ARTIFACT_STALE:${id}`);}
console.log(JSON.stringify({ok:true,requirements:['CMP-070','CMP-073','CMP-074'],examples:ids}));
