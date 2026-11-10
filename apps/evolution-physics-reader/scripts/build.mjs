import {cp,mkdir,rm,copyFile,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fingerprintRuntime} from './fingerprint.mjs';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist');
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
await cp(resolve(root,'src'),dist,{recursive:true});
await mkdir(resolve(dist,'fonts'),{recursive:true});
const manrope=resolve(root,'node_modules/@fontsource-variable/manrope');
for(const lang of ['latin','cyrillic'])await copyFile(resolve(manrope,`files/manrope-${lang}-wght-normal.woff2`),resolve(dist,'fonts',`manrope-${lang}.woff2`));
await copyFile(resolve(manrope,'LICENSE'),resolve(dist,'fonts/MANROPE-LICENSE.txt'));
const mono=resolve(root,'node_modules/@fontsource/ibm-plex-mono');
await copyFile(resolve(mono,'files/ibm-plex-mono-latin-400-normal.woff2'),resolve(dist,'fonts/mono.woff2'));
await copyFile(resolve(mono,'files/ibm-plex-mono-cyrillic-400-normal.woff2'),resolve(dist,'fonts/mono-cyrillic.woff2'));
await copyFile(resolve(mono,'LICENSE'),resolve(dist,'fonts/IBM-PLEX-LICENSE.txt'));
let book=null;try{book=JSON.parse(await readFile(resolve(root,'src/content/book.json'),'utf8'));}catch{}
const release=await fingerprintRuntime(dist);
await writeFile(resolve(dist,'version.json'),JSON.stringify({version:'3.0.0',release,experience:'observatory-2100',companionNotes:60,experiments:6,reader:'native-html',pages:book?.totalPages??null,sourceSha256:book?.source?.sha256??null}));
console.log(`Built native HTML reader in dist/ (${book?.totalPages??'content pending'} source pages)`);
