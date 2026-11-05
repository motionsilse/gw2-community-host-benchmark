export function listRequest(params){
  const query=new URLSearchParams({view:'list'});
  for(const key of ['page','q','board'])if(params.get(key))query.set(key,params.get(key));
  if(query.get('board')==='none'){query.delete('board');query.delete('page');}
  return '/api/threads'+(query.size?'?'+query:'');
}
export function threadRequest(id,params){
  // A reply link selects the scroll target, not the start of the conversation.
  return '/api/threads/'+id+'?view=read';
}
function initialReadRequest(route,params){
  const detail=/^post\/([1-9]\d*)$/.exec(route);
  if(detail)return {path:threadRequest(Number(detail[1]),params),headers:{'x-community-view':'1'}};
  if(!route||route==='list')return {path:listRequest(params)};
  if(route!=='write'||params.has('draft')||params.get('kind')==='post')return {};
  const target=params.get('target');
  if(!/^[1-9]\d*$/.test(target||'')||!Number.isSafeInteger(Number(target)))return {};
  return {path:'/api/threads/'+target};
}
// Private account data stays only in this document's pending response. It is
// never embedded in HTML, stored, or reused after navigation/session changes.
export function startInitialContext(){
  if(typeof globalThis.fetch!=='function'||!globalThis.location?.href)return;
  globalThis.__communityInitialContext?.cancel();
  const hash=new URL(location.href).hash||'#list',route=hash.slice(1).split('?')[0],records=new Map();
  const detach=()=>globalThis.removeEventListener?.('hashchange',cancel);
  const cancel=()=>{if(globalThis.__communityInitialContext===pending)delete globalThis.__communityInitialContext;detach();for(const record of records.values())record.controller.abort();};
  const pending={hash,records,detach,cancel};globalThis.__communityInitialContext=pending;
  for(const path of /^post\/[1-9]\d*$/.test(route)||route==='licenses'?['/api/status']:['/api/status','/api/boards']){
    const controller=new AbortController(),record={controller};records.set(path,record);
    try{record.response=fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});}
    catch(error){record.response=Promise.reject(error);}
    record.response.catch(()=>{});
  }
  globalThis.addEventListener?.('hashchange',cancel,{once:true});
}
// The inline boot and the app are separate bundles. Share only this document's
// one pending public response; never persist it or reuse it after navigation.
export function startInitialRead(doc=globalThis.document){
  if(typeof globalThis.fetch!=='function'||!globalThis.location?.href)return;
  const [route,query='']=new URL(location.href).hash.slice(1).split('?');
  const embedded=doc?.getElementById?.('community-initial-list');
  const embeddedText=embedded?.textContent;embedded?.remove();
  let initial;
  if(embeddedText&&(!route||route==='list')&&!query)try{
    const data=JSON.parse(embeddedText);
    if(data.page===1&&Array.isArray(data.items)&&data.items.length<=100&&data.items.every(row=>row&&Number.isSafeInteger(row.id)&&row.id>0&&typeof row.title==='string')&&Number.isSafeInteger(data.total)&&data.total>=0&&Number.isSafeInteger(data.pages)&&data.pages>0)initial=embeddedText;
  }catch{} // A missing/invalid snapshot uses the ordinary fresh request.
  const {path,headers}=initialReadRequest(route,new URLSearchParams(query));
  if(!path)return;
  globalThis.__communityInitialList?.cancel();
  const controller=new AbortController();
  const detach=()=>globalThis.removeEventListener?.('hashchange',cancel);
  const cancel=()=>{
    if(globalThis.__communityInitialList===pending)delete globalThis.__communityInitialList;
    detach();controller.abort();
  };
  const pending={path,controller,detach,cancel};
  try{pending.response=initial?Promise.resolve(new Response(initial,{headers:{'content-type':'application/json'}})):fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json',...headers},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});}
  catch(error){pending.response=Promise.reject(error);}
  pending.response.catch(()=>{});
  globalThis.__communityInitialList=pending;
  globalThis.addEventListener?.('hashchange',cancel,{once:true});
}
// Start public content alongside status/categories. Consume the initial read
// once, so a counted post read is never duplicated. No session data is cached.
export function prefetchReadPage(request,hash){
  const [path,query='']=hash.slice(1).split('?'),params=new URLSearchParams(query);
  const {path:initial,headers}=initialReadRequest(path,params);
  const early=globalThis.__communityInitialList;
  delete globalThis.__communityInitialList;
  early?.detach();
  const preload=early?.path===initial?early:null;
  if(early&&!preload)early.cancel();
  let pending=initial?request(initial,{headers,...(preload?{preload}:{})}):null;
  pending?.catch(()=>{}); // Status may fail or navigation abort before consumption.
  const context=globalThis.__communityInitialContext;delete globalThis.__communityInitialContext;
  context?.detach();if(context&&context.hash!==hash)context.cancel();
  return (url,options={})=>{
    if(context?.hash===hash&&context.records.has(url)&&!options.body&&!options.raw&&!options.headers&&(!options.method||options.method==='GET')){
      const preload=context.records.get(url);context.records.delete(url);return request(url,{...options,preload});
    }
    if(pending&&url===initial&&!options.body&&!options.raw&&(!options.method||options.method==='GET')&&
      (options.headers?.['x-community-view']||undefined)===(headers?.['x-community-view']||undefined)){
      const result=pending;pending=null;return result;
    }
    return request(url,options);
  };
}
