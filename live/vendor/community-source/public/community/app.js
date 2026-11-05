import {t,locale,localeUrl} from './i18n.js';
import {api,esc,notify} from './ui.js';
import {lazyDraftStore} from './lazy-drafts.js';
import {listPage} from './list.js';
import {prefetchReadPage} from './read-request.js';
import {loadEditor} from './editor-loader.js';
import {initGuideShell,guideHref,loadCommunityFont} from './guide-shell.js';

const main=document.querySelector('main'),drafts=lazyDraftStore(),positions=new Map();
let current=null,generation=0,queue=Promise.resolve(),lastHash='',listHash='#list',logoutPending=null,deferredRoute=null;
document.documentElement.lang=locale;
document.title=t('커뮤니티 · 길드워 2 한국어 가이드');
// Explicit shell markers only: never translate post text, names or categories.
for(const node of document.querySelectorAll('[data-ui]'))node.textContent=t(node.dataset.ui);
for(const node of document.querySelectorAll('[data-ui-label]'))node.setAttribute('aria-label',t(node.dataset.uiLabel));
for(const link of document.querySelectorAll('[data-guide]'))link.href=guideHref();
Promise.resolve(initGuideShell()).catch(()=>{});
function localeLinks(){
  for(const link of document.querySelectorAll('[data-locale]')){
    link.href=localeUrl(location.href,link.dataset.locale);
    if(link.dataset.locale===locale)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
  }
}
localeLinks();
let changingLocale=false;
for(const link of document.querySelectorAll('[data-locale]'))link.onclick=async event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();if(changingLocale||link.dataset.locale===locale)return;
  changingLocale=true;
  try{
    await logoutPending;
    await queue;
    if(await current?.beforeLeave?.()===false)return;
    const destination=new URL(location.href);
    destination.hash=current?.localeHash?.()||location.hash;
    current?.controller.abort();await current?.dispose?.();current=null;
    location.assign(localeUrl(destination.href,link.dataset.locale));
  }catch(error){notify(error.message);}finally{changingLocale=false;}
};
function header(status){
  const nav=document.querySelector('#account-nav'),user=status.user;
  nav.innerHTML=user?`${user.role==='admin'?`<a href="#admin">${t("관리")}</a>`:''}<a href="#account">${esc(user.username)}</a><button type="button" data-logout>${t("로그아웃")}</button>`:`<a href="#login">${t("로그인")}</a><a class="join-link" href="#register">${t("가입")}</a>`;
  const logout=nav.querySelector('[data-logout]');if(logout){logout.disabled=!!logoutPending;logout.onclick=logOut;}
  const state=document.querySelector('#service-state');state.hidden=!status.communityPaused&&!status.guest.localTest;
  state.textContent=status.communityPaused?t("회원가입과 글·댓글 작성이 일시 중단되어 있습니다."):status.guest.localTest?t("로컬 테스트 · 이곳의 글과 계정은 운영 사이트에 반영되지 않습니다."):'';
}
function logOut(){
  if(logoutPending||changingLocale)return logoutPending;
  document.querySelector('[data-logout]').disabled=true;main.inert=true;
  let loggedOut=false;
  logoutPending=queue.catch(()=>{}).then(async()=>{
    // Let the current render finish installing its editor and draft hooks.
    // Navigation is deferred until the session change has a definite result.
    if(await current?.beforeLeave?.()===false)return;
    await api('/api/logout',{method:'POST'});loggedOut=true;
    const previous=current;current=null;
    previous?.controller.abort();await previous?.dispose?.();
    notify(t("로그아웃했습니다."));
  }).catch(error=>{notify(error.message);}).finally(()=>{
    logoutPending=null;main.inert=false;
    const button=document.querySelector('[data-logout]');if(button)button.disabled=false;
    const reroute=deferredRoute;deferredRoute=null;
    if(loggedOut){if(location.hash==='#list')route();else location.hash='list';}
    else if(reroute){history.replaceState(null,'',location.pathname+location.search+reroute);localeLinks();route();}
  });
  return logoutPending;
}
async function render(version){
  const hash=location.hash||'#list';
  if(lastHash)positions.set(lastHash,{scroll:scrollY,focus:document.activeElement?.dataset.postId});
  if(await current?.beforeLeave?.()===false){generation=current.version;history.replaceState(null,'',location.pathname+location.search+lastHash);main.removeAttribute('aria-busy');return;}
  current?.controller.abort();await current?.dispose?.();current=null;
  if(version!==generation)return;
  const controller=new AbortController();
  const ctx={main,drafts,controller,notify:message=>{if(current===ctx&&!controller.signal.aborted)notify(message);},listHash,version,active:()=>version===generation&&!controller.signal.aborted,
    api:(path,options={})=>api(path,{...options,signal:options.signal||controller.signal}),
    setPage:html=>{if(ctx.active())main.innerHTML=html;},replaceHash:hash=>{if(ctx.active()){lastHash=hash;history.replaceState(null,'',location.pathname+location.search+hash);localeLinks();}},dispose:null};
  current=ctx;lastHash=hash;
  main.setAttribute('aria-busy','true');
  ctx.api=prefetchReadPage(ctx.api,hash);
  const [path,query='']=hash.slice(1).split('?'),params=new URLSearchParams(query),readingThread=/^post\/[1-9]\d*$/.test(path),publicPage=readingThread||path==='licenses';
  document.title=path==='licenses'?t('오픈소스 고지')+' · '+t('커뮤니티'):t('커뮤니티 · 길드워 2 한국어 가이드');
  ctx.statusReady=ctx.api('/api/status').then(status=>{
    if(ctx.active()){ctx.status=status;ctx.scope=status.user?'member:'+status.user.id:'guest';header(status);}
    return status;
  });
  // A post response already carries its category label. Only list/forms need
  // the category inventory; avoid an unused round trip on every post visit.
  ctx.boardsReady=(publicPage?Promise.resolve({boards:[]}):ctx.api('/api/boards')).then(boards=>{if(ctx.active())ctx.boards=boards.boards;return boards;});
  // Public reading can render independently; all writing/account routes still
  // wait for fresh authorization and categories. Observe early rejections.
  ctx.statusReady.catch(()=>{});ctx.boardsReady.catch(()=>{});
  const composer=path==='write'?import('./composer.js'):null;
  composer?.catch(()=>{});
  if(composer&&!params.has('draft')&&params.get('kind')!=='post'){
    loadEditor().catch(()=>{});
  }
  if(path!=='list'&&path&&!publicPage){await Promise.all([ctx.statusReady,ctx.boardsReady]);if(!ctx.active())return;}
  if(path==='list'||!path){listHash=hash;ctx.listHash=listHash;await listPage(ctx,params);}
  else if(readingThread){const {threadPage}=await import('./thread.js');if(ctx.active())await threadPage(ctx,Number(path.split('/')[1]),params);}
  else if(path==='licenses'){const {licensesPage}=await import('./licenses.js');if(ctx.active())licensesPage(ctx,locale);}
  else if(path==='write'){
    const {composePage}=await composer;
    if(ctx.active()){
      // Let navigation run the draft guard even if editor resources are stalled.
      const leaving=new Promise(resolve=>{ctx.releaseRender=resolve;});
      try{await Promise.race([composePage(ctx,params),leaving]);}
      finally{ctx.releaseRender=null;}
    }
  }
  else if(path==='drafts'){const {draftsPage}=await import('./draft-list.js');if(ctx.active())await draftsPage(ctx);}
  else if(path==='trash'||path==='admin'||path.startsWith('admin/')){const {adminPage}=await import('./admin.js');if(ctx.active())await adminPage(ctx,path==='trash'?'trash':path.slice(6)||'overview',params);}
  else if(['login','register','forgot','resend','account','terms','verify','reset','setup'].includes(path)){const {accountPage}=await import('./account.js');if(ctx.active())await accountPage(ctx,path,params);}
  else{ctx.setPage(`<div class="empty"><h1>${t("페이지를 찾을 수 없습니다.")}</h1><a class="button" href="#list">${t("목록으로")}</a></div>`);}
  if(!ctx.active())return;
  main.removeAttribute('aria-busy');
  loadCommunityFont();
  const saved=positions.get(hash);let focusTarget=main;
  if(path==='list'&&saved){scrollTo(0,saved.scroll);if(saved.focus)focusTarget=main.querySelector(`[data-post-id="${saved.focus}"]`)||main;}
  else if(path.startsWith('post/')&&params.has('reply'))main.querySelector('#reply-'+Number(params.get('reply')))?.scrollIntoView({block:'start'});
  else scrollTo(0,0);
  if(!['write','login','register','forgot','reset'].includes(path))focusTarget.focus({preventScroll:true});
}
function route(){
  if(logoutPending){deferredRoute=location.hash||'#list';return;}
  const version=++generation;if(!current?.beforeLeave)current?.controller.abort();
  current?.releaseRender?.();
  queue=queue.catch(()=>{}).then(()=>render(version)).catch(error=>{
    if(version!==generation||error.name==='AbortError')return;
    main.removeAttribute('aria-busy');
    main.innerHTML=`<div class="empty"><h1>${t("화면을 불러오지 못했습니다.")}</h1><p>${esc(error.message)}</p><button class="button" id="retry-page">${t("다시 시도")}</button> <a class="button" href="#list">${t("목록으로")}</a></div>`;
    main.querySelector('#retry-page').onclick=route;
    loadCommunityFont();
  });
}
document.querySelector('.skip').onclick=event=>{event.preventDefault();main.focus();main.scrollIntoView();};
window.addEventListener('hashchange',()=>{localeLinks();route();});
window.addEventListener('beforeunload',event=>{if(current?.unsafeToLeave?.()){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)current?.save?.();});
// Email links from the existing sender use #verify=token / #reset=token.
const mail=/^#(verify|reset)=([a-f0-9]{64})$/.exec(location.hash);
if(mail)history.replaceState(null,'',location.pathname+location.search+`#${mail[1]}?token=${mail[2]}`);
route();
