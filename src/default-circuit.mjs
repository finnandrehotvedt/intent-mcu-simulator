// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CIRCUIT_SCHEMA, createComponent, validateCircuit } from './circuit-engine.mjs';

const candidate = {
  schema: CIRCUIT_SCHEMA,
  components: [
    createComponent('board-1', 'board.atmega328p-16mhz-v1', { label: 'ATmega328P board' }),
    createComponent('resistor-1', 'resistor.fixed-v1', { label: 'LED 1 resistor' }),
    createComponent('led-1', 'led.basic-v1', { label: 'Status LED 1', properties: { color: 'red' } }),
    createComponent('resistor-2', 'resistor.fixed-v1', { label: 'LED 2 resistor' }),
    createComponent('led-2', 'led.basic-v1', { label: 'Status LED 2', properties: { color: 'green' } }),
    createComponent('button-1', 'button.momentary-v1', { label: 'Input button' }),
    createComponent('pot-1', 'potentiometer.linear-v1', { label: 'Analogue control' }),
  ],
  nets: [
    { id: 'net-d13-branch', endpoints: [
      { component: 'board-1', pin: 'D13' },
      { component: 'resistor-1', pin: 'A' },
      { component: 'resistor-2', pin: 'A' },
    ] },
    { id: 'net-led-1-anode', endpoints: [
      { component: 'resistor-1', pin: 'B' },
      { component: 'led-1', pin: 'ANODE' },
    ] },
    { id: 'net-led-2-anode', endpoints: [
      { component: 'resistor-2', pin: 'B' },
      { component: 'led-2', pin: 'ANODE' },
    ] },
    { id: 'net-ground-branch', endpoints: [
      { component: 'board-1', pin: 'GND1' },
      { component: 'led-1', pin: 'CATHODE' },
      { component: 'led-2', pin: 'CATHODE' },
      { component: 'button-1', pin: 'B' },
      { component: 'pot-1', pin: 'LOW' },
    ] },
    { id: 'net-button-d2', endpoints: [
      { component: 'board-1', pin: 'D2' },
      { component: 'button-1', pin: 'A' },
    ] },
    { id: 'net-5v', endpoints: [
      { component: 'board-1', pin: '5V' },
      { component: 'pot-1', pin: 'HIGH' },
    ] },
    { id: 'net-pot-a0', endpoints: [
      { component: 'board-1', pin: 'A0' },
      { component: 'pot-1', pin: 'WIPER' },
    ] },
  ],
  junctions: [
    { id: 'junction-d13', net: 'net-d13-branch' },
    { id: 'junction-ground', net: 'net-ground-branch' },
  ],
};

const result = validateCircuit(candidate);
if (!result.ok) throw new Error(`Default circuit is invalid: ${result.code}`);

export const DEFAULT_CIRCUIT = Object.freeze(result.graph);
