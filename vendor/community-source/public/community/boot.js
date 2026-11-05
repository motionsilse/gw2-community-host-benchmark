import {initialLocale} from './locale-preference.js';
import {startInitialRead,startInitialContext} from './read-request.js';

export function startCommunity(entries,language=initialLocale(),doc=document,posts={}){
  startInitialRead(doc);
  startInitialContext();
  const modules=entries[language];
  const showInitialList=()=>{
    const [route,query='']=new URL(globalThis.location?.href||'https://localhost/').hash.slice(1).split('?');
    doc.documentElement.dataset.communityInitialList=(!route||route==='list')&&!query?language:'';
  };
  showInitialList();globalThis.addEventListener?.('hashchange',showInitialList);
  // The tiny inline selector preloads the selected static graph immediately.
  // Start app code only after the document exists, like a static module tag.
  const route=new URL(globalThis.location?.href||'https://localhost/').hash.slice(1).split('?')[0];
  const hints=/^post\/[1-9]\d*$/.test(route)?[...modules,...(posts[language]||[])]:modules;
  for(const href of new Set(hints)){
    const link=doc.createElement('link');link.rel='modulepreload';link.href=href;doc.head.append(link);
  }
  const start=()=>{
    // The first list is already HTML. Let people type and submit while app
    // modules download; the app reads the latest hash when it takes over.
    const form=doc.querySelector('main .search');
    if(form&&doc.documentElement.dataset.communityInitialList===language){
      const input=form.querySelector('[name="q"]');
      for(const control of form.querySelectorAll('[disabled]'))control.removeAttribute('disabled');
      form.onsubmit=event=>{
        event.preventDefault();const query=new URLSearchParams(),term=input.value.trim();
        if(term)query.set('q',term);location.hash='list'+(query.size?'?'+query:'');
      };
    }
    const script=doc.createElement('script');script.type='module';script.src=modules[0];script.onload=()=>globalThis.removeEventListener?.('hashchange',showInitialList);doc.head.append(script);
  };
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
if(typeof __COMMUNITY_ENTRIES__!=='undefined')startCommunity(__COMMUNITY_ENTRIES__,initialLocale(),document,__COMMUNITY_POST_ENTRIES__);
