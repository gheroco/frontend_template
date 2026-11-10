import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fingerprintRuntime} from '../scripts/fingerprint.mjs';

async function fixture(dependency){
  const path=await mkdtemp(join(tmpdir(),'physics-release-'));
  await mkdir(join(path,'companion'));
  const files={
    'index.html':'<link href="./style.css"><script type="module" src="./app.mjs"></script>',
    'app.mjs':"import {x} from './reader.mjs'; export const model=()=>import('./model.mjs'); fetch('./companion/companion.json');",
    'reader.mjs':dependency,
    'model.mjs':'export const velocity=4;',
    'style.css':'body{color:ivory}',
    'companion/companion.json':'{"notes":[]}'
  };
  await Promise.all(Object.entries(files).map(([name,content])=>writeFile(join(path,name),content)));
  return path;
}

test('a dependency-only change invalidates the entry and its entire module graph',async()=>{
  const old=await fixture('export const x=1;'),next=await fixture('export const x=2;');
  try{
    const a=await fingerprintRuntime(old),b=await fingerprintRuntime(next);
    assert.notEqual(a,b);
    const html=await readFile(join(next,'index.html'),'utf8');
    assert.ok(html.includes(`app.${b}.mjs`)&&html.includes(`style.${b}.css`));
    const app=await readFile(join(next,`app.${b}.mjs`),'utf8');
    assert.ok(app.includes(`./reader.${b}.mjs`)&&app.includes(`./model.${b}.mjs`));
    assert.ok(app.includes(`./companion/companion.${b}.json`));
    assert.ok(!app.includes('./reader.mjs'));
  }finally{await Promise.all([rm(old,{recursive:true,force:true}),rm(next,{recursive:true,force:true})]);}
});

test('identical releases have deterministic asset URLs across build machines',async()=>{
  const a=await fixture('export const x=1;'),b=await fixture('export const x=1;');
  try{assert.equal(await fingerprintRuntime(a),await fingerprintRuntime(b));}
  finally{await Promise.all([rm(a,{recursive:true,force:true}),rm(b,{recursive:true,force:true})]);}
});
