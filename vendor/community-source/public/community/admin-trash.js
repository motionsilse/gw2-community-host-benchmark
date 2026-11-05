import {contentHtml,imageViewer} from './content-ui.js';
import {t,numberText} from './i18n.js';
import {esc,dateText,errorText,confirmAction} from './ui.js';
import {commentText} from './comment-text.js';

const kindName=kind=>({thread:t('게시글'),post:t('댓글'),user:t('계정')})[kind]||kind;
const actor=item=>`${t('휴지통으로 옮긴 사람')}: ${esc(item.deleted_by_name||t('기록 없음'))}${item.deleted_by?` (#${item.deleted_by})`:''} · ${esc(({admin:t('운영자'),moderator:t('부관리자'),user:t('회원')})[item.deleted_by_role]||t('역할 기록 없음'))} · ${esc(dateText(item.deleted_at))}`;

export async function trashPage(ctx,shell,params){
  const id=Number(params.get('item'));
  if(Number.isSafeInteger(id)&&id>0){
    const data=await ctx.api('/api/community/admin/trash/'+id);if(!ctx.active())return;
    shell(`<h2>${esc(data.record.title||kindName(data.record.kind))}</h2><p class="small-text">${actor(data.record)}</p><p><a class="button" href="#admin/trash">${t('휴지통 목록으로')}</a></p><div data-trash-content></div><button class="button" type="button" data-more>${t('더 보기')}</button><p role="alert" tabindex="-1"></p>`);
    let next=data.next;
    const host=ctx.main.querySelector('[data-trash-content]'),more=ctx.main.querySelector('[data-more]');
    const append=items=>{
      for(const item of items){
        const section=document.createElement('section');section.className='admin-section';
        section.innerHTML=`<h3>${esc(item.title||kindName(item.kind))}</h3><p class="small-text">${esc(item.author_name)} · ${esc(dateText(item.created_at))}</p>${item.kind==='user'?`<p>${t('삭제된 계정 기록입니다. 비밀번호와 인증 정보는 표시하지 않습니다.')}</p>`:`<div class="prose ${item.kind==='post'?'comment-text':''}">${item.kind==='post'?esc(commentText(item)):contentHtml(item)}</div>`}`;
        for(const img of section.querySelectorAll('img')){
          const url=new URL(img.getAttribute('src'),location.origin);
          if(url.origin===location.origin&&/^\/media\/[0-9a-f-]+$/.test(url.pathname))img.setAttribute('src',url.pathname+'?trash='+id);
          else img.remove();
        }
        host.append(section);imageViewer(section);
      }
      more.hidden=!next;
    };
    append(data.items);
    more.onclick=async()=>{if(more.disabled)return;more.disabled=true;try{const result=await ctx.api('/api/community/admin/trash/'+id+'?after='+next);if(!ctx.active())return;next=result.next;append(result.items);}catch(error){if(ctx.active())errorText(ctx.main,error);}finally{more.disabled=false;}};
    return;
  }
  const data=await ctx.api('/api/trash?page='+(Number(params.get('page'))||1));if(!ctx.active())return;
  shell(`<h2>${t('휴지통')}</h2><p class="small-text">${t('삭제한 글과 이미지는 운영자가 영구 삭제할 때까지 보관됩니다.')}</p><form class="trash-form"><div class="actions trash-toolbar"><label class="check-field"><input type="checkbox" data-select-all>${t('이 페이지 전체 선택')}</label><button type="button" class="button danger" data-purge-selected disabled>${t('선택 영구 삭제')}</button><button type="button" class="button danger" data-purge-all ${data.total?'':'disabled'}>${t('휴지통 전체 비우기')}</button></div><p role="alert" tabindex="-1"></p><p role="status"></p><div class="admin-rows">${data.items.map(item=>`<div class="admin-row trash-row"><label class="check-field"><input type="checkbox" value="${item.id}" data-trash-choice aria-label="${esc(t('{name} 선택',{name:item.title||item.excerpt||kindName(item.kind)}))}"></label><div class="trash-description"><a href="#admin/trash?item=${item.id}"><strong>${esc(item.title||item.excerpt||t('내용 없는 기록'))}</strong></a><small>${kindName(item.kind)} · ${esc(item.author_name)} · ${t('{count}개 항목',{count:item.item_count})}</small><small>${actor(item)}</small></div><button type="button" class="button small" data-restore="${item.id}">${t('복구')}</button></div>`).join('')||`<p class="empty">${t('휴지통이 비어 있습니다.')}</p>`}</div></form><nav class="pagination" aria-label="${t('휴지통 페이지')}">${data.page>1?`<a href="#admin/trash?page=${data.page-1}">${t('이전')}</a>`:''}<span>${data.page} / ${data.pages}</span>${data.page<data.pages?`<a href="#admin/trash?page=${data.page+1}">${t('다음')}</a>`:''}</nav>`);
  const form=ctx.main.querySelector('.trash-form'),choices=[...form.querySelectorAll('[data-trash-choice]')],selectAll=form.querySelector('[data-select-all]'),selected=form.querySelector('[data-purge-selected]');
  let busy=false;
  const update=()=>{const count=choices.filter(input=>input.checked).length;selected.disabled=busy||!count;selectAll.checked=choices.length>0&&count===choices.length;selectAll.indeterminate=count>0&&count<choices.length;};
  selectAll.onchange=()=>{choices.forEach(input=>input.checked=selectAll.checked);update();};choices.forEach(input=>input.onchange=update);
  const lock=value=>{busy=value;for(const control of form.querySelectorAll('input,button'))control.disabled=value;form.setAttribute('aria-busy',String(value));if(!value)update();};
  ctx.beforeLeave=async()=>!busy;
  const reload=()=>trashPage(ctx,shell,params);
  for(const button of form.querySelectorAll('[data-restore]'))button.onclick=async()=>{
    if(busy)return;lock(true);
    try{await ctx.api('/api/trash/restore',{body:{id:Number(button.dataset.restore)}});ctx.notify(t('휴지통에서 복구했습니다.'));if(ctx.active())await reload();}
    catch(error){if(ctx.active())errorText(form,error);}finally{lock(false);}
  };
  const purge=async all=>{
    if(busy)return;
    const ids=choices.filter(input=>input.checked).map(input=>Number(input.value));if(!all&&!ids.length)return;
    busy=true;
    if(!await confirmAction(all?t('현재 휴지통의 모든 글과 댓글을 영구 삭제할까요? 복구할 수 없습니다.'):t('선택한 글과 함께 삭제된 댓글도 영구 삭제됩니다. 계속할까요? 복구할 수 없습니다.'),{accept:t('영구 삭제'),danger:true})||!ctx.active()){busy=false;return;}
    lock(true);let purged=0;
    try{
      let remaining;
      do{
        const result=await ctx.api('/api/community/admin/trash/purge',{body:all?{before:data.maxId}:{ids:ids.splice(0,20)}});
        purged+=result.purged;remaining=all?result.remaining:ids.length;
        if(ctx.active())form.querySelector('[role=status]').textContent=t('{count}개 기록을 영구 삭제했습니다.',{count:numberText(purged)});
      }while(remaining&&ctx.active());
      // R2 failures remain private and retryable. Do not report them as content
      // deletion failures (the DB transaction has already completed).
      let cleanupFailed=false;
      try{let result;do{result=await ctx.api('/api/community/admin/cleanup',{body:{}});cleanupFailed||=!!result.failed;}while(result.deleted===8&&!result.failed&&ctx.active());cleanupFailed||=result.pending>0;}catch{cleanupFailed=true;}
      ctx.notify(t('{count}개 기록을 영구 삭제했습니다.',{count:numberText(purged)})+(cleanupFailed?' '+t('남은 이미지 정리는 운영 현황에서 다시 실행해 주세요.'):''));
      if(ctx.active())await reload();
    }catch(error){if(ctx.active()){errorText(form,error);form.querySelector('[role=status]').textContent=t('{count}개 기록을 영구 삭제했습니다.',{count:numberText(purged)});}}
    finally{lock(false);}
  };
  selected.onclick=()=>purge(false);form.querySelector('[data-purge-all]').onclick=()=>purge(true);
}
