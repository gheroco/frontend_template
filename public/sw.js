const CACHE='fluent30-v1.0.1';
const SHELL=['./','./index.html','./styles.css','./details.css','./app.js','./store.js','./recorder.js','./course.json','./assets/favicon.svg','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('fluent30-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.endsWith('.pdf')||url.pathname.endsWith('.docx'))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(async()=>{const cached=await caches.match(event.request);if(cached)return cached;if(event.request.mode==='navigate')return caches.match('./index.html');return new Response('This resource is not available offline.',{status:503});}));
});
