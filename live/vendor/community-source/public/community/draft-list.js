import {t} from './i18n.js';
import {esc,dateText,confirmAction} from './ui.js';

function draftExcerpt(draft){
  const template=document.createElement('template');template.innerHTML=draft.html||'';
  for(const element of template.content.querySelectorAll('script,style,template'))element.remove();
  for(const element of template.content.querySelectorAll('p,div,br,li,h1,h2,h3,h4,h5,h6,blockquote,pre,tr,td,th'))element.after(document.createTextNode(' '));
  const text=Array.from(template.content.childNodes,node=>node.textContent||'').join('').replace(/\s+/g,' ').trim(),characters=Array.from(text);
  if(text)return characters.slice(0,120).join('')+(characters.length>120?'…':'');
  return template.content.querySelector('img')?t("이미지가 첨부된 초안"):t("아직 본문이 없습니다.");
}

export async function draftsPage(ctx){
  const drafts=await ctx.drafts.list(ctx.scope);if(!ctx.active())return;
  ctx.setPage(`<div class="breadcrumb"><a href="${esc(ctx.listHash)}">${t("목록으로")}</a></div><div class="page-heading"><div><h1>${t("임시저장한 글")}</h1><p>${t("현재 기기에 보관됩니다. 비밀번호는 저장하지 않습니다.")}</p></div>${!ctx.status.communityPaused&&ctx.status.rich.enabled?`<a class="button primary" href="#write">${t("새 글쓰기")}</a>`:''}</div>${drafts.length?drafts.map(draft=>{
    const title=draft.title||(draft.kind==='post'?/^[1-9]\d*$/.test(String(draft.threadId))?t("게시글 {id}의 댓글",{id:draft.threadId}):t("제목 없는 댓글"):t("제목 없는 글"));
    return `<div class="draft-row"><div><strong>${esc(title)}</strong><p class="draft-excerpt">${esc(draftExcerpt(draft))}</p><small>${esc(dateText(new Date(draft.savedAt).toISOString()))} · ${draft.targetId?t("수정 중"):t("작성 중")}</small></div><a class="button small" href="#write?draft=${encodeURIComponent(draft.id)}">${t("이어서 쓰기")}</a><button class="plain-button" data-discard="${esc(draft.id)}">${t("삭제")}</button></div>`;
  }).join(''):`<div class="empty">${t("보관된 초안이 없습니다.")}</div>`}`);
  for(const button of ctx.main.querySelectorAll('[data-discard]'))button.onclick=async()=>{
    const draft=drafts.find(d=>d.id===button.dataset.discard);if(!await confirmAction(t("이 기기에 보관한 초안을 삭제할까요?")))return;button.disabled=true;
    try{await ctx.drafts.remove(ctx.scope,draft.id,draft.revision);if(draft.serverId)await ctx.api('/api/community/drafts/'+draft.serverId,{method:'DELETE'}).catch(()=>{});await draftsPage(ctx);}
    catch(error){ctx.notify(error.message);button.disabled=false;}
  };
}
