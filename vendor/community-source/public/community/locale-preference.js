const preferenceKey='gw2community.locale';
const supported=value=>value==='ko'||value==='en';
export function resolveLocale({url,stored,language='ko'}){
  const explicit=url.searchParams.get('lang');
  if(supported(explicit))return explicit;
  if(/^\/en(?:\/|$)/.test(url.pathname))return 'en';
  if(supported(stored))return stored;
  return /^ko(?:-|$)/i.test(language)?'ko':'en';
}
export function readLocale({href,storage,language}){
  let stored;try{stored=storage?.getItem(preferenceKey);}catch{}
  const url=new URL(href),value=resolveLocale({url,stored,language});
  if(supported(url.searchParams.get('lang')))try{storage?.setItem(preferenceKey,value);}catch{}
  return value;
}
export function initialLocale(){
  if(typeof globalThis.location?.href!=='string')return 'ko';
  let storage;try{storage=globalThis.localStorage;}catch{}
  return readLocale({href:location.href,storage,language:globalThis.navigator?.languages?.[0]||globalThis.navigator?.language||'ko'});
}
export function localeUrl(href,value){
  if(!supported(value))throw new TypeError('Unsupported locale');
  const url=new URL(href);
  if(['/','/index.html','/en','/en/','/en/index.html','/community','/community/','/community.html','/en/community','/en/community/','/en/community.html'].includes(url.pathname))url.pathname=value==='en'?'/en/community':'/community';
  url.searchParams.set('lang',value);
  return url.pathname+url.search+url.hash;
}
