
const API = "https://gw2-bbs-live-bench-20261105.foxsaint.workers.dev";
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!/^\/(api|media)\//.test(url.pathname))return;
  event.respondWith((async()=>{
    const method=event.request.method;
    const headers=new Headers(event.request.headers);
    headers.delete('origin');
    const response=await fetch(API+url.pathname+url.search,{
      method,headers,credentials:'include',cache:'no-store',
      ...(['GET','HEAD'].includes(method)?{}:{body:await event.request.arrayBuffer()})
    });
    return new Response(response.body,{status:response.status,headers:response.headers});
  })());
});
