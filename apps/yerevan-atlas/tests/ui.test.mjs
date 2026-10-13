import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import * as model from '../src/model.js';
import * as icons from '../src/icons.js';
test('rendered UI searches, saves, compares, opens sources and persists notes',async()=>{
 const win=new Window({url:'https://atlas.test/'});
 try{
  win.document.write(readFileSync(new URL('../index.html',import.meta.url),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
  const data=JSON.parse(readFileSync(new URL('../public/data/projects.json',import.meta.url)));
  win.fetch=async()=>({ok:true,json:async()=>data});
  win.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  class MockMap{on(){}resize(){}flyTo(){}easeTo(){}setPadding(){}}
  Object.assign(win,model,icons,{e:model.escapeHTML,Map:MockMap,Popup:class{},workerUrl:'worker.js',setWorkerUrl(){},hydrateIcons:(root=win.document)=>icons.hydrateIcons(root)});
  const code=readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  win.eval(code);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  const doc=win.document,select=(s)=>doc.querySelector(s);
  assert.ok(select('#resultCount').textContent.includes('projects'));assert.ok(doc.querySelectorAll('[data-open]').length>=100);
  select('#searchInput').value='Defanse';select('#searchInput').dispatchEvent(new win.Event('input'));
  assert.ok(doc.querySelectorAll('[data-open]').length>=1);select('[data-open="karu-1"]').click();assert.ok(!select('#detailPanel').hidden);assert.ok(select('#detailPanel').textContent.includes('82.35'));
  select('#detailPanel [data-save]').click();assert.equal(select('#savedCount').textContent,'1');
  select('#projectNotes').value='Check afternoon light';select('#projectNotes').dispatchEvent(new win.Event('input'));assert.ok(win.localStorage.getItem('yerevan-atlas-v1').includes('Check afternoon light'));
  select('#detailPanel [data-compare]').click();assert.equal(select('#compareCount').textContent,'1');
  select('#searchInput').value='';select('#searchInput').dispatchEvent(new win.Event('input'));select('[data-open="karu-66"]').click();select('#detailPanel [data-compare]').click();select('#openCompare').click();assert.ok(select('#compareContent').textContent.includes('2028'));
  assert.ok(select('#detailPanel a[href*="bedeck.am"]'));assert.equal(select('#compareDialog').open,true);
 }finally{await win.happyDOM.close();}
});
