export async function fetchJSON(path,fetcher=fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetcher(path,{signal:controller.signal,cache:'no-cache'});if(!response.ok)throw new Error(`Cannot load ${path}`);return await response.json();}
 finally{clearTimeout(timer);}
}

/** Only the catalogue is required; supporting assets degrade independently. */
export async function loadCatalogueFiles(fetcher=fetch){
 const failures=[];
 const optional=async(path,fallback,valid)=>{try{const data=await fetchJSON(path,fetcher);if(!valid(data))throw Error('Invalid supporting data');return data;}catch{failures.push(path);return fallback;}};
 const [catalogue,presets,geometry]=await Promise.all([
  fetchJSON('/data/projects.json',fetcher),
  optional('/data/model-presets.json',[],Array.isArray),
  optional('/data/project-geometry.json',{records:{}},data=>data&&typeof data.records==='object'&&!Array.isArray(data.records))
 ]);
 if(!Array.isArray(catalogue?.projects)||!catalogue.projects.length||!catalogue.metadata)throw Error('Invalid catalogue');
 return {catalogue,presets,geometry,failures};
}
