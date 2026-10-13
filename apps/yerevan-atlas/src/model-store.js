let promise;
function database(){return promise||=(new Promise((resolve,reject)=>{const req=indexedDB.open('yerevan-atlas-models',1);req.onupgradeneeded=()=>req.result.createObjectStore('models',{keyPath:'projectId'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}));}
async function operation(mode,run){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('models',mode),req=run(tx.objectStore('models'));let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage aborted'));});}
export const saveModel=record=>operation('readwrite',s=>s.put(record));
export const removeModel=id=>operation('readwrite',s=>s.delete(id));
export const allModels=()=>operation('readonly',s=>s.getAll());
