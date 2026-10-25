// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalProjectEnvelope, prepareProjectEnvelope } from '../src/project-envelope.mjs';
import { validateBounded3v3AuthoringGraph } from '../src/bounded-3v3-authoring-contracts.mjs';
import { RP2040_PICO_BOARD_DEFINITION, RP2040_PICO_PROFILE, Rp2040PicoCircuitEditor,
  createRp2040PicoCircuitDraft } from '../src/rp2040-pico-circuit.mjs';
import { RP2040_PUBLIC_PROJECT_SCHEMA, RP2040_PUBLIC_SOURCE,
  normalizeRp2040PublicProject } from '../src/rp2040-public-workbench.mjs';
import { ESP32C3_BOARD_DEFINITION, Esp32C3CircuitEditor } from '../src/esp32c3-public-circuit.mjs';
import { C3_PUBLIC_PROJECT_SCHEMA, C3_PUBLIC_SOURCE,
  normalizeEsp32C3PublicProject } from '../src/esp32c3-public-workbench.mjs';
import { PROFILE as ESP32C3_PROFILE } from '../c3/protocol.mjs';
import { STM32_BOARD_DEFINITION, Stm32CircuitEditor } from '../src/stm32-public-circuit.mjs';
import { STM32_EDITABLE_PROJECT_SCHEMA, STM32_PUBLIC_SOURCE,
  normalizeStm32PublicProject } from '../src/stm32-public-workbench.mjs';
import { STM32_PROFILE } from '../stm32/protocol.mjs';

const profile = 'board.rp2040-pico-v1';
const project = { schema: 'authoring-envelope-fixture@1', profile,
  circuit: { components: [{ id: 'fixture-1', type: 'switch.toggle-3v3-v1' }], nets: [] } };
const adapter = (accepted) => ({
  [profile]: {
    schemas: ['authoring-envelope-fixture@1'],
    prepare: (value) => ({ project: structuredClone(value), preserved: ['circuit'] }),
    authoringAdmission: () => accepted
      ? ({ ok: true, code: 'AUTHORING_GRAPH_ACCEPTED_DATA_ONLY', executable: false })
      : ({ ok: false, code: 'AUTHORING_COMPONENT_UNSUPPORTED' }),
  },
});

test('canonical envelope preserves structurally admitted authoring-only data without runtime authority', () => {
  const text = canonicalProjectEnvelope(profile, project, adapter(true));
  const opened = prepareProjectEnvelope(text, adapter(true));
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.equal(opened.report.modelLibrary.authoringOnly, true);
  assert.equal(opened.report.modelLibrary.executableAuthority, false);
  assert.equal(opened.report.modelLibrary.runtimeUnavailableCode, 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE');
  assert.equal(opened.canonical, text);
});

test('authoring admission cannot suppress an unknown or unsafe graph rejection', () => {
  assert.throws(() => canonicalProjectEnvelope(profile, project, adapter(false)),
    (error) => error.code === 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE');
});

test('real Pico common-envelope import rejects tampered locks and unsafe graphs without changing prior bytes', () => {
  const realAdapters = {
    [RP2040_PICO_PROFILE]: {
      schemas: [RP2040_PUBLIC_PROJECT_SCHEMA],
      prepare: (value) => ({ project: normalizeRp2040PublicProject(value), preserved: ['circuit'] }),
      authoringAdmission: ({ project: value }) => validateBounded3v3AuthoringGraph({
        board: RP2040_PICO_BOARD_DEFINITION,
        components: value.circuit.components,
        nets: value.circuit.nets,
      }),
    },
  };
  const acceptedProject = {
    schema: RP2040_PUBLIC_PROJECT_SCHEMA, name: 'Import safety fixture', profile: RP2040_PICO_PROFILE,
    source: RP2040_PUBLIC_SOURCE, circuit: createRp2040PicoCircuitDraft(),
  };
  const acceptedText = canonicalProjectEnvelope(RP2040_PICO_PROFILE, acceptedProject, realAdapters);
  const priorBytes = JSON.stringify(acceptedProject.circuit);
  const reject = (mutate, code) => {
    const envelope = JSON.parse(acceptedText); mutate(envelope);
    const result = prepareProjectEnvelope(JSON.stringify(envelope), realAdapters);
    assert.equal(result.ok, false); assert.match(result.code, code);
    assert.equal(JSON.stringify(acceptedProject.circuit), priorBytes);
  };
  reject((value) => { value.modelLibrary.manifestSha256 = '0'.repeat(64); }, /MODEL_LIBRARY_LOCK_UNTRUSTED/u);
  reject((value) => { value.project.circuit.components.push({ id: 'unknown-1', type: 'unknown.part-v1', properties: {} });
  }, /RP2040_CIRCUIT_COMPONENT_INVALID/u);
  reject((value) => { const editor = new Rp2040PicoCircuitEditor(); editor.newProject(); editor.addComponent('button.momentary-3v3-v1');
    value.project.circuit = editor.snapshot().draft;
    value.project.circuit.components.find(({ id }) => id === 'button-1').properties.defaultClosed = true;
  }, /CLOSED_CONTACT_UNSUPPORTED/u);
  reject((value) => { const editor = new Rp2040PicoCircuitEditor(); editor.newProject(); editor.addComponent('ground.reference-3v3-v1');
    value.project.circuit = editor.snapshot().draft;
    value.project.circuit.nets.push({ id: 'short-1', endpoints: [
      { component: 'pico-1', pin: 'GP0' }, { component: 'ground-1', pin: 'GND' },
    ] }); }, /DIRECT_SOURCE_GROUND_SHORT/u);
});

for (const target of [
  { label: 'C3', profile: ESP32C3_PROFILE, schema: C3_PUBLIC_PROJECT_SCHEMA, source: C3_PUBLIC_SOURCE,
    board: ESP32C3_BOARD_DEFINITION, Editor: Esp32C3CircuitEditor, normalize: normalizeEsp32C3PublicProject,
    boardId: 'c3-1', sourcePin: 'GPIO2' },
  { label: 'STM32', profile: STM32_PROFILE, schema: STM32_EDITABLE_PROJECT_SCHEMA, source: STM32_PUBLIC_SOURCE,
    board: STM32_BOARD_DEFINITION, Editor: Stm32CircuitEditor, normalize: normalizeStm32PublicProject,
    boardId: 'stm32-1', sourcePin: 'PB0' },
]) {
  test(`real ${target.label} common-envelope import rejects unsafe graphs atomically`, () => {
    const adapters = { [target.profile]: { schemas: [target.schema],
      prepare: (value) => ({ project: target.normalize(value), preserved: ['circuit'] }),
      authoringAdmission: ({ project: value }) => validateBounded3v3AuthoringGraph({
        board: target.board, components: value.circuit.components, nets: value.circuit.nets,
      }) } };
    const editor = new target.Editor(); editor.newProject();
    const project = { schema: target.schema, name: `${target.label} import safety`, profile: target.profile,
      source: target.source, circuit: editor.snapshot().draft };
    const accepted = canonicalProjectEnvelope(target.profile, project, adapters);
    const priorBytes = JSON.stringify(project.circuit);
    const tampered = JSON.parse(accepted); tampered.modelLibrary.manifestSha256 = '0'.repeat(64);
    assert.equal(prepareProjectEnvelope(JSON.stringify(tampered), adapters).code, 'MODEL_LIBRARY_LOCK_UNTRUSTED');
    assert.equal(JSON.stringify(project.circuit), priorBytes);
    const reject = (circuit, expected) => {
      const envelope = JSON.parse(accepted); envelope.project.circuit = circuit;
      const result = prepareProjectEnvelope(JSON.stringify(envelope), adapters);
      assert.equal(result.ok, false); assert.match(result.code, expected);
      assert.equal(JSON.stringify(project.circuit), priorBytes);
    };
    const unknown = structuredClone(project.circuit);
    unknown.components.push({ id: 'unknown-1', type: 'unknown.part-v1', properties: {} });
    reject(unknown, /CIRCUIT_COMPONENT_INVALID/u);
    const contactEditor = new target.Editor(); contactEditor.newProject();
    contactEditor.addComponent('button.momentary-3v3-v1');
    const closed = contactEditor.snapshot().draft;
    closed.components.find(({ id }) => id === 'button-1').properties.defaultClosed = true;
    reject(closed, /CLOSED_CONTACT_UNSUPPORTED/u);
    const shortEditor = new target.Editor(); shortEditor.newProject();
    shortEditor.addComponent('ground.reference-3v3-v1');
    const short = shortEditor.snapshot().draft;
    short.nets.push({ id: 'short-1', endpoints: [
      { component: target.boardId, pin: target.sourcePin }, { component: 'ground-1', pin: 'GND' },
    ] });
    reject(short, /DIRECT_SOURCE_GROUND_SHORT/u);
  });
}
