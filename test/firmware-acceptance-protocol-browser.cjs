// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.FIRMWARE_ACCEPTANCE_URL || 'http://127.0.0.1:18999';
const cases = [
  { starter:'avr-dht11-temperature-humidity', component:'dht11-1', values:{temperatureC:31,humidityPercent:64},
    initial:/TEMP_C=25 HUMIDITY_RH=50 CHECKSUM=OK/u, updated:/TEMP_C=31 HUMIDITY_RH=64 CHECKSUM=OK/u, protocol:'DHT11 timed single-wire checksum' },
  { starter:'avr-dht22-temperature-humidity', component:'dht22-1', values:{temperatureC:-12.3,humidityPercent:64.7},
    initial:/TEMP_C=23\.5 HUMIDITY_RH=50\.0 CHECKSUM=OK/u, updated:/TEMP_C=-12\.3 HUMIDITY_RH=64\.7 CHECKSUM=OK/u, protocol:'DHT22 signed-decimal single-wire checksum' },
  { starter:'avr-ds18b20-temperature', component:'ds18b20-1', values:{temperatureC:-10.125},
    initial:/TEMP_C=23\.5000 CRC=OK/u, updated:/TEMP_C=-10\.1250 CRC=OK/u, protocol:'DS18B20 OneWire CRC' },
  { starter:'avr-bme280-environment', component:'bme280-1', values:{temperatureC:-12.3,humidityPercent:64.7,pressureHpa:987.6},
    initial:/TEMP_C=23\.5 HUMIDITY_RH=50\.0 PRESSURE_HPA=1013\.2 CHIP=0x60/u,
    updated:/TEMP_C=-12\.3 HUMIDITY_RH=64\.7 PRESSURE_HPA=987\.6 CHIP=0x60/u, protocol:'BME280 I2C register model/chip identity' },
];
async function discard(page) { if (await page.locator('#unsaved-change-dialog').evaluate((node)=>node.open)) await page.click('#unsaved-discard'); }
async function openInspector(page) { if (!(await page.locator('#toggle-inspector').isVisible())) await page.locator('#workbench-more > summary').click(); await page.click('#toggle-inspector'); }
async function closeInspector(page) { if (await page.locator('#workbench-inspector-dialog').evaluate((node)=>node.open)) await page.click('#workbench-inspector-dialog .workbench-popup-close'); }
(async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(90000);
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__M11_READY__===true);await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__M11_READY__===true);await page.click('#workbench-view-advanced');
  const results=[];
  for(const entry of cases){
    if(!(await page.locator('#quick-stop').isDisabled())) await page.click('#quick-stop');
    await page.evaluate((starter)=>document.querySelector(`.starter-card[data-example="${starter}"] .starter-action`).click(),entry.starter);await discard(page);
    await page.waitForFunction((id)=>{const value=window.__M6_PROJECT__();const circuit=value.circuit??value.candidateCircuit;return circuit?.components?.some((item)=>item.id===id);},entry.component);
    await page.locator(`[data-component-id="${entry.component}"]`).click({force:true});await openInspector(page);await closeInspector(page);
    await page.click('#quick-build');await page.waitForFunction(()=>window.__M6_STATE__.buildState==='succeeded');
    const identity=await page.evaluate(()=>{const project=window.__M6_PROJECT__().project;return {artifact:window.__M6_STATE__.artifactIdentity,input:window.__M6_STATE__.inputIdentity,source:project.source.files.map((file)=>file.content).join('\n')};});
    assert.match(identity.artifact,/^[a-f0-9]{64}$/u);await page.waitForFunction(()=>!document.querySelector('#quick-run').disabled);await page.click('#quick-run');
    await page.waitForFunction(()=>!document.querySelector('#speed').disabled);await page.evaluate(()=>{const speed=document.querySelector('#speed');speed.value='maximum';speed.dispatchEvent(new Event('change',{bubbles:true}));});await page.click('#serial-tab');
    await page.waitForFunction((source)=>new RegExp(source,'u').test(document.querySelector('#serial-output').textContent),entry.initial.source,{timeout:20000});
    const initial=(await page.textContent('#serial-output')).match(entry.initial)[0];if(await page.locator('#workbench-instruments-dialog').evaluate((node)=>node.open))await page.click('#workbench-instruments-dialog .workbench-popup-close');await page.locator(`[data-component-id="${entry.component}"]`).click({force:true});await openInspector(page);
    for(const [field,value] of Object.entries(entry.values)){const control=page.locator(`[data-control="${entry.component}.${field}"]`);await control.evaluate((node,next)=>{node.value=String(next);node.dispatchEvent(new Event('input',{bubbles:true}));},value);}
    await page.waitForFunction(({id,values})=>{const project=window.__M6_PROJECT__();const circuit=project.circuit??project.candidateCircuit;const controls=circuit.components.find((item)=>item.id===id)?.controls;return Object.entries(values).every(([key,value])=>controls?.[key]===value);},{id:entry.component,values:entry.values});
    await page.waitForFunction((source)=>new RegExp(source,'u').test(document.querySelector('#serial-output').textContent),entry.updated.source,{timeout:20000});
    const updated=(await page.textContent('#serial-output')).match(entry.updated)[0];assert.doesNotMatch(await page.textContent('#serial-output'),/READ ERROR|CHIP ERROR/u);await closeInspector(page);
    results.push({starter:entry.starter,component:entry.component,fields:Object.keys(entry.values),protocol:entry.protocol,artifactIdentity:identity.artifact,inputIdentity:identity.input,sourceSha256:crypto.createHash('sha256').update(identity.source).digest('hex'),initial,updated});
  }
  process.stdout.write(`${JSON.stringify({ok:true,models:4,fields:8,actualBuilds:4,results})}\n`);
}finally{await browser.close();}})().catch((error)=>{process.stderr.write(`${error.stack||error}\n`);process.exitCode=1;});
