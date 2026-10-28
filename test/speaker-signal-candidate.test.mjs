// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'; import test from 'node:test';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { AVR_SPEAKER_SIGNAL_PINS, SPEAKER_SIGNAL_DEFINITION, SPEAKER_SIGNAL_TYPE, createSpeakerSignalComponent, validateSpeakerSignalDefinition } from '../expansion-drafts/speaker-signal-v1.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_IMPLEMENTATION } from '../src/model-library-current-resolver.mjs';
const open=()=>{const d=createEditableContactDraft();return openPortableEditorSession(canonicalContactPersistenceDraftJson(d.project)).session;};
const apply=(s,c)=>{const r=s.apply({...c,revision:s.revision});assert.equal(r.ok,true,`${r.code}`);};
const add=(s)=>apply(s,{type:'component.add',component:createSpeakerSignalComponent('speaker-1'),position:{x:.75,y:.66}});
const ground=(s)=>apply(s,{type:'wire.branch',netId:'net-ground-branch',endpoint:{component:'speaker-1',pin:'GND'},junctionId:'speaker-ground'});
const signal=(s,pin='D9')=>apply(s,{type:'wire.create',net:{id:'speaker-signal',endpoints:[{component:'speaker-1',pin:'SIGNAL'},{component:'board-1',pin}]}});
test('CMP-065 owns a distinct original SIGNAL/GND visual-only contract',()=>{assert.equal(validateSpeakerSignalDefinition(),true);assert.equal(SPEAKER_SIGNAL_DEFINITION.type,SPEAKER_SIGNAL_TYPE);assert.deepEqual(SPEAKER_SIGNAL_DEFINITION.pins.map(p=>p.id),['SIGNAL','GND']);assert.deepEqual(AVR_SPEAKER_SIGNAL_PINS,['D3','D5','D6','D9','D10','D11']);assert.match(SPEAKER_SIGNAL_DEFINITION.support.limitations.join(' '),/No impedance/u);});
test('speaker signal persists, rejects non-PWM and supports exact Undo/Redo',()=>{const bad=open();add(bad);ground(bad);signal(bad,'D8');assert.equal(bad.runnable.code,'PROJECT_CONTACT_SPEAKER_SIGNAL_SIGNAL_REQUIRES_AVR_PWM_PIN');const s=open();add(s);signal(s);ground(s);assert.equal(s.runnable.ok,true);const saved=s.saveText();const reopened=openCandidateUiSession(saved);assert.equal(reopened.ok,true);apply(s,{type:'component.remove',componentId:'speaker-1'});apply(s,{type:'undo'});assert.equal(s.saveText(),saved);apply(s,{type:'redo'});assert.notEqual(s.saveText(),saved);});
test('speaker canonical API exposes no acoustic fields',()=>{assert.deepEqual(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.evaluateProduction(SPEAKER_SIGNAL_TYPE,{level:true,transitionCount:3}),{ok:true,code:'OK',result:{driven:true,transitionActive:true,transitionCount:3}});});
