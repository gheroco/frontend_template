import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';

// All modules in a release share an identity. A changed dependency therefore
// changes the entry URL too, preventing mixed module graphs in browser/CDN caches.
export async function fingerprintRuntime(directory){
  const names=(await readdir(directory)).filter(name=>/\.(mjs|css|svg)$/.test(name));
  names.push('companion/companion.json');
  names.sort();
  const files=new Map(await Promise.all(names.map(async name=>[name,await readFile(resolve(directory,name),'utf8')])));
  const html=await readFile(resolve(directory,'index.html'),'utf8');
  const hash=createHash('sha256');
  hash.update(html);
  for(const [name,content] of files)hash.update(name+'\0'+content+'\0');
  const release=hash.digest('hex').slice(0,16);
  const renamed=new Map(names.map(name=>[name,name.slice(0,-extname(name).length)+'.'+release+extname(name)]));
  const rewrite=content=>{
    for(const [name,target] of renamed)content=content.replaceAll('./'+name,'./'+target);
    return content;
  };
  await Promise.all([...files].map(([name,content])=>writeFile(resolve(directory,renamed.get(name)),rewrite(content))));
  await writeFile(resolve(directory,'index.html'),rewrite(html));
  return release;
}
