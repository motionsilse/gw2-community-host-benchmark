import {listMarkup,listCategorySelect} from './list-markup.js';
import {t,numberText,categoryName} from './i18n.js';
import {esc,dateText} from './ui.js';
import {listRequest} from './read-request.js';

export async function listPage(ctx,params){
  if(params.get('board')==='none'){
    params=new URLSearchParams(params);params.delete('board');params.delete('page');
    ctx.replaceHash?.('#list'+(params.size?'?'+params:''));
  }
  const query=new URLSearchParams();for(const key of ['page','q','board'])if(params.get(key))query.set(key,params.get(key));
  const data=await ctx.api(listRequest(params));if(!ctx.active())return;
  const categorySelect=boards=>listCategorySelect(boards,params,{t,esc,categoryName});
  ctx.setPage(listMarkup(data,{params,boards:ctx.boards,status:ctx.status,t,esc,dateText,numberText,categoryName}));
  ctx.main.querySelector('.search').onsubmit=event=>{event.preventDefault();const next=new URLSearchParams(query);const term=new FormData(event.currentTarget).get('q').trim();if(term)next.set('q',term);else next.delete('q');next.delete('page');location.hash='list'+(next.size?'?'+next:'');};
  const root=ctx.main.querySelector('[data-list-root]'),errorHost=ctx.main.querySelector('[data-list-context-error]');
  const active=()=>ctx.active()&&root.isConnected;
  const failure=()=>{
    if(!active())return;
    errorHost.hidden=false;errorHost.innerHTML=`${t("일부 메뉴를 불러오지 못했습니다. 글은 계속 읽을 수 있습니다.")} <button type="button" class="plain-button">${t("다시 시도")}</button>`;
    errorHost.querySelector('button').onclick=()=>location.reload();
  };
  const bindFilter=()=>{
    const filter=ctx.main.querySelector('#board-filter');if(filter)filter.onchange=()=>{const next=new URLSearchParams(query);if(filter.value)next.set('board',filter.value);else next.delete('board');next.delete('page');location.hash='list'+(next.size?'?'+next:'');};
  };
  bindFilter();
  void (ctx.boardsReady||Promise.resolve({boards:ctx.boards||[]})).then(({boards})=>{
    if(!active())return;
    ctx.boards=boards;ctx.main.querySelector('[data-list-categories]').innerHTML=categorySelect(boards);bindFilter();
  }).catch(failure);
  void (ctx.statusReady||Promise.resolve(ctx.status)).then(status=>{
    if(!active())return;
    ctx.status=status;ctx.scope=status.user?'member:'+status.user.id:'guest';
    const allowed=!status.communityPaused&&status.rich.enabled;
    for(const host of ctx.main.querySelectorAll('[data-list-write]'))host.innerHTML=allowed?`<a class="button primary" href="#write">${t("＋ 글쓰기")}</a>`:'';
    // Guests must still be able to recover saved work during a posting pause.
    if(!allowed)ctx.main.querySelector('.board-bottom [data-list-write]').innerHTML=`<a class="plain-button" href="#drafts">${t("임시저장한 글")}</a>`;
    const hint=ctx.main.querySelector('[data-list-empty-hint]');if(hint&&!params.get('q'))hint.textContent=allowed?t("첫 이야기를 남겨 주세요."):t("새 글쓰기가 재개되면 이야기를 나눌 수 있습니다.");
  }).catch(failure);
}
