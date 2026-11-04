// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
test('CMP-068/CMP-075 canonical project reopens and Undo/Redo is exact',()=>{const built=createAvrReferenceStarter('avr-dc-motor-l298n');const opened=openCandidateUiSession(built.text);assert.equal(opened.ok,true,opened.code);const s=opened.session,saved=s.saveText(),revision=s.revision;let r=s.apply({type:'component.remove',componentId:'dc-motor-1',revision});assert.equal(r.ok,true,r.code);r=s.apply({type:'undo',revision:s.revision});assert.equal(r.ok,true,r.code);assert.equal(s.saveText(),saved);r=s.apply({type:'redo',revision:s.revision});assert.equal(r.ok,true,r.code);assert.notEqual(s.saveText(),saved);});
test('CMP-068/CMP-075 starter holds every compiled command for a visible worker window',()=>{const source=createAvrReferenceStarter('avr-dc-motor-l298n').project.project.source.files[0].content;assert.match(source,/delay\(2000\)/u);assert.doesNotMatch(source,/delay\(400\)/u);});
