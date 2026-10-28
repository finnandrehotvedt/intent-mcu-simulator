#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { L298N_DRIVER_TYPE, createDcMotorL298nComponent } from '../expansion-drafts/dc-motor-l298n-v1.mjs';
import { DC_MOTOR_ENCODER_MODEL_ENTRY, createDcMotorEncoderComponent,
  projectDcMotorEncoders } from '../expansion-drafts/dc-motor-encoder-v1.mjs';
const target = new URL('../examples/indicators-actuators/avr-dc-motor-encoder.intent-mcu.json', import.meta.url);
const graph = { components: [{ id: 'board', type: 'board.atmega328p-16mhz-v1' },
  createDcMotorEncoderComponent('dc-motor-encoder-1', 'DC motor with encoder', 0),
  createDcMotorL298nComponent(L298N_DRIVER_TYPE, 'l298n-1')],
  nets: [['in1','l298n-1','IN1','board','D7'],['in2','l298n-1','IN2','board','D8'],['ena','l298n-1','ENA','board','D9'],
    ['vcc','l298n-1','VCC','board','5V'],['gnd','l298n-1','GND','board','GND1'],
    ['out1','l298n-1','OUT1','dc-motor-encoder-1','M1'],['out2','l298n-1','OUT2','dc-motor-encoder-1','M2'],
    ['encoder-a','dc-motor-encoder-1','EA','board','D2'],['encoder-b','dc-motor-encoder-1','EB','board','D3'],
    ['encoder-common','dc-motor-encoder-1','ECOM','board','GND2']]
    .map(([id,a,ap,b,bp]) => ({ id, endpoints: [{ component:a,pin:ap },{ component:b,pin:bp }] })), junctions: [] };
const projection = projectDcMotorEncoders(graph); if (!projection.ok) throw new Error(projection.code);
const value = { schema: 'intent-mcu-dc-motor-encoder-example@1', requirementIds: ['CMP-069'],
  profile: 'board.atmega328p-16mhz-v1', title: 'DC motor command with independent encoder detents',
  graph, model: DC_MOTOR_ENCODER_MODEL_ENTRY,
  interaction: { control: 'detent', values: [-2, 0, 2], expectedCwSequence: ['11','01','00','10','11'],
    expectedCcwSequence: ['11','10','00','01','11'] },
  limitations: 'Encoder detents are explicit user-authored quadrature events and are never inferred from PWM, direction, artwork, elapsed time or claimed RPM.' };
const bytes = `${JSON.stringify(value, null, 2)}\n`;
if (process.argv.includes('--write')) { await mkdir(new URL('../examples/indicators-actuators/', import.meta.url), { recursive: true }); await writeFile(target, bytes); }
else if (await readFile(target, 'utf8') !== bytes) throw new Error('DC_MOTOR_ENCODER_ARTIFACT_STALE');
console.log(JSON.stringify({ ok: true, component: 'CMP-069', runtimeEncoders: projection.encoders.length }));
