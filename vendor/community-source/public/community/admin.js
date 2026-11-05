import {t,numberText,categoryName} from './i18n.js';
import {esc,dateText,errorText,confirmAction} from './ui.js';
import {sizeText} from './images.js';
import {boardsPage} from './admin-boards.js';
import {trashPage} from './admin-trash.js';

const tabs=[['overview',t("운영 현황")],['content',t("게시글 관리")],['trash',t("휴지통")],['history',t("관리 이력")],['users',t("회원 관리")],['settings',t("목록 설정")],['boards',t("분류 설정")],['terms',t("이용 안내")]];
export async function adminPage(ctx,page,params){
  if(!ctx.active())return;
  const user=ctx.status.user;
  if(!user){location.hash='login?return='+encodeURIComponent(location.hash);return;}
  if(user.role!=='admin'){ctx.setPage(`<div class="empty"><h1>${t("관리자 권한이 필요합니다.")}</h1><a href="#list">${t("목록으로")}</a></div>`);return;}
  const owner=user.role==='admin';
  const shell=body=>ctx.setPage(`<section class="admin"><div class="breadcrumb"><a href="#list">${t("커뮤니티")}</a></div><h1>${user.can_mod?t("커뮤니티 관리"):t("내 휴지통")}</h1><nav class="admin-tabs" aria-label="${t("관리 메뉴")}">${tabs.map(([id,title])=>`<a href="#admin/${id}" ${page===id?'aria-current="page"':''}>${title}</a>`).join('')}</nav>${body}</section>`);
  const bind=(selector,run)=>{const form=ctx.main.querySelector(selector);form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await run(form);}catch(error){if(ctx.active())errorText(form,error);}finally{buttons.forEach(b=>b.disabled=false);}};};
  const alert='<p role="alert" tabindex="-1"></p>';
  if(page==='overview'){
    const data=await ctx.api('/api/community/admin/usage');if(!ctx.active())return;
    shell(`<h2>${t("운영 상태")}</h2><dl class="admin-stats"><div><dt>${t("글쓰기")}</dt><dd>${data.paused?t("일시 중단"):t("사용 가능")}</dd></div><div><dt>${t("첨부 저장소")}</dt><dd>${data.images?t("연결됨"):t("미연결")}</dd></div><div><dt>${t("첨부 보관 용량")}</dt><dd>${sizeText(data.storage.reserved)} / ${sizeText(data.storage.limit)}</dd></div><div><dt>${t("오늘 저장·삭제 시도")}</dt><dd>${numberText(data.writes.used)} / ${numberText(data.writes.limit)}</dd></div><div><dt>${t("작성 중인 서버 초안")}</dt><dd>${data.openDrafts}</dd></div></dl><p class="small-text muted">${t("첨부 용량에는 이미지와 일반 파일, 삭제 유예·업로드 확인 중인 파일도 포함됩니다. Cloudflare 계정 전체 사용량은 대시보드에서 확인하세요.")}</p><div class="admin-section"><h2>${t("첨부 보관")}</h2><p>${t("휴지통의 이미지와 파일은 영구 삭제 전까지 비공개로 보관합니다. 게시하지 않은 초안 첨부는 7일 뒤 정리 대상이 됩니다.")}</p>${owner?`<form>${alert}<button class="button" type="submit">${t("기한이 지난 첨부 정리")}</button><p class="small-text">${t("한 번에 최대 8개를 처리합니다. 휴지통에 보관 중인 첨부는 정리하지 않습니다.")}</p><p class="success-message" role="status"></p></form>`:''}</div>`);
    const readStat=document.createElement('div');readStat.innerHTML=`<dt>${t("오늘 첨부 조회 예약")}</dt><dd>${numberText(data.reads.reserved)} / ${numberText(data.reads.limit)}</dd>`;ctx.main.querySelector('.admin-stats').append(readStat);
    const readNote=document.createElement('p');readNote.className='small-text muted';readNote.textContent=`${t("조회 횟수는 최대 32회씩 미리 확보해 실제 조회보다 높게 표시될 수 있습니다. 한도에 도달하면 이미지 표시와 파일 다운로드를 멈추고 글·댓글은 유지합니다. 일일 한도 갱신:")} ${dateText(data.reads.resetsAt)}${t(". 다른 R2 사용량은 운영 한도에 따로 반영해야 합니다. 계정 전체 사용량을 자동으로 집계하거나 차단하지는 않습니다.")}`;ctx.main.querySelector('.admin-stats').after(readNote);
    if(owner)bind('form',async form=>{const result=await ctx.api('/api/community/admin/cleanup',{body:{}});form.querySelector('[role=status]').textContent=t("{deleted}개 정리 · {pending}개 정리 대기 · {failed}개 재시도 필요",{deleted:result.deleted,pending:result.pending,failed:result.failed});});return;
  }
  if(page==='content'){
    const id=Number(params.get('thread'));
    if(!Number.isSafeInteger(id)||id<1){shell(`<h2>${t("관리할 글 찾기")}</h2><p>${t("게시글의 ‘관리’ 버튼을 누르거나 글 번호를 입력하세요.")}</p><form class="admin-section"><label class="field">${t("글 번호")}<input name="id" type="number" min="1" step="1" required></label>${alert}<button class="button primary">${t("글 불러오기")}</button></form><a class="button" href="#write?notice=1">${t("새 공지 작성")}</a><p class="small-text">${t("공지 옵션이 선택된 작성 화면을 엽니다.")}</p>`);bind('form',form=>{location.hash='admin/content?thread='+form.elements.id.value;});return;}
    const {thread}=await ctx.api('/api/threads/'+id);if(!ctx.active())return;
    shell(`<h2>${esc(thread.title)}</h2><p><a class="button small" href="#post/${id}">${t("게시글 보기")}</a> <a class="button small" href="#write?kind=thread&target=${id}&thread=${id}">${t("본문 수정")}</a></p><form class="admin-section">${[['is_notice',t("공지사항으로 표시")],['pinned',t("목록 위에 고정")],['locked',t("글 잠금")]].map(([name,label])=>`<label class="check-field"><input name="${name}" type="checkbox" ${thread[name]?'checked':''}>${label}</label>`).join('')}<p class="small-text">${t("잠금 시 일반 이용자는 본문·댓글 수정과 새 댓글 작성을 할 수 없습니다. 관리 권한이 있으면 계속 관리할 수 있습니다.")}</p><label class="field" ${ctx.boards.length?'':'hidden'}>${t("분류")}<select name="board_id" ${ctx.boards.length?'required':''}><option value="" disabled ${ctx.boards.some(board=>board.id===thread.board_id)?'':'selected'}>${t("분류 선택")}</option>${ctx.boards.map(board=>`<option value="${board.id}" ${board.id===thread.board_id?'selected':''}>${esc(categoryName(board.name))}</option>`).join('')}</select></label>${alert}<button class="button primary">${t("설정 저장")}</button><p class="success-message" role="status"></p></form><div class="admin-section"><h2>${t("게시글 숨기기")}</h2><p>${t("게시글과 댓글을 휴지통으로 옮깁니다. 첨부 이미지도 방문자에게 보이지 않습니다.")}</p><button type="button" class="button danger" id="trash-thread">${t("휴지통으로 이동")}</button></div>`);
    const reason=document.createElement('label');reason.className='field';reason.innerHTML=`${t("관리 사유 (선택)")}<input name="reason" maxlength="300" placeholder="${t("변경 이유를 기록할 수 있습니다.")}">`;ctx.main.querySelector('form [role=alert]').before(reason);
    bindThreadSettings(ctx,thread,page,params);
    ctx.main.querySelector('#trash-thread').onclick=async event=>{const button=event.currentTarget;if(!await confirmAction(t("게시글과 댓글을 함께 휴지통으로 옮길까요?"),{accept:t("휴지통으로 이동"),danger:true})||!ctx.active())return;button.disabled=true;try{await ctx.api('/api/threads/'+id,{method:'DELETE'});ctx.notify(t("휴지통으로 옮겼습니다."));location.hash='admin/trash';}catch(error){ctx.notify(error.message);button.disabled=false;}};return;
  }
  if(page==='trash'){await trashPage(ctx,shell,params);return;}
  if(page==='history'){
    const data=await ctx.api('/api/community/admin/history?page='+(Number(params.get('page'))||1));if(!ctx.active())return;
    const actions={board_create:t("분류 생성"),board_delete:t("분류 삭제"),boards_update:t("분류 변경"),notice_create:t("공지 작성"),settings:t("게시글 설정"),ban:t("이용 정지"),unban:t("정지 해제"),trash:t("휴지통 이동"),restore:t("휴지통 복구"),role:t("회원 역할 변경"),list_settings:t("목록 설정"),purge:t("영구 삭제")},labels={is_notice:t("공지"),pinned:t("고정"),locked:t("글 잠금"),board_id:t("분류 번호"),banned:t("정지"),items:t("항목 수"),order:t("분류 표시 순서"),name:t("분류 이름"),moved:t("옮긴 글 수"),page_size:t("페이지당 일반 글 수"),before:t("이전 역할"),role:t("변경 역할"),ids:t("휴지통 기록 번호")};
    const targetLabels={thread:t("게시글"),post:t("댓글"),user:t("회원"),board:t("분류"),boards:t("분류"),settings:t("목록 설정"),trash:t("휴지통")};
    const roles={admin:t("운영자"),moderator:t("부관리자"),user:t("회원")};
    const describe=item=>{try{return Object.entries(JSON.parse(item.details)).map(([key,value])=>(labels[key]||key)+': '+(['role','before'].includes(key)?roles[value]||value:value??'—')).join(' · ');}catch{return '';}};
    shell(`<h2>${t("관리 이력")}</h2><p class="small-text">${t("공지·목록·분류 설정, 회원 정지·역할 변경, 휴지통 이동·복구·영구 삭제를 기록합니다.")}</p><div class="admin-rows">${data.items.map(item=>`<div class="admin-row"><div><strong>${esc(actions[item.action]||item.action)} · ${targetLabels[item.target_type]||t("회원")} ${['boards','settings','trash'].includes(item.target_type)?'':item.target_id}</strong><small>${esc(item.actor_name)} · ${esc(dateText(item.created_at))}</small><p class="small-text">${esc(describe(item))}${item.reason?`<br>${t("사유:")} `+esc(item.reason):''}</p></div></div>`).join('')||`<p class="empty">${t("아직 관리 이력이 없습니다.")}</p>`}</div><nav class="pagination" aria-label="${t("관리 이력 페이지")}">${data.page>1?`<a href="#admin/history?page=${data.page-1}">${t("이전")}</a>`:''}<span>${data.page} / ${data.pages}</span>${data.page<data.pages?`<a href="#admin/history?page=${data.page+1}">${t("다음")}</a>`:''}</nav>`);return;
  }
  if(!owner){shell(`<p>${t("이 설정은 운영자만 변경할 수 있습니다.")}</p>`);return;}
  if(page==='settings'){
    const data=await ctx.api('/api/community/admin/settings');if(!ctx.active())return;
    shell(`<h2>${t("목록 설정")}</h2><form class="admin-section"><label class="field">${t("페이지당 일반 글 수")}<input name="page_size" type="number" min="1" max="50" step="1" required value="${data.page_size}"></label><p class="small-text">${t("1~50개. 공지는 이 숫자에서 제외하고 각 페이지 위에 표시합니다.")}</p>${alert}<button class="button primary">${t("설정 저장")}</button><p role="status"></p></form>`);
    let saving=false;
    const form=ctx.main.querySelector('form');
    form.onsubmit=async event=>{
      event.preventDefault();if(saving||!form.reportValidity())return;saving=true;
      for(const input of form.querySelectorAll('input,button'))input.disabled=true;
      try{const saved=await ctx.api('/api/community/admin/settings',{method:'PATCH',body:{page_size:Number(form.elements.page_size.value),revision:data.revision}});data.revision=saved.revision;if(ctx.active())form.querySelector('[role=status]').textContent=t("저장했습니다.");}
      catch(error){if(ctx.active())errorText(form,error);}
      finally{saving=false;for(const input of form.querySelectorAll('input,button'))input.disabled=false;}
    };
    ctx.beforeLeave=async()=>!saving;return;
  }
  if(page==='users'){
    const query=new URLSearchParams({q:params.get('q')||'',page:params.get('page')||'1'}),data=await ctx.api('/api/community/admin/users?'+query),users=data.items;if(!ctx.active())return;
    const link=page=>'#admin/users?'+new URLSearchParams({q:query.get('q'),page});
    shell(`<h2>${t("회원 관리")}</h2><form class="search"><input type="search" name="q" aria-label="${t("회원 아이디 검색")}" maxlength="24" value="${esc(query.get('q'))}" placeholder="${t("전체 회원 아이디 검색")}"><button type="submit">${t("검색")}</button></form><p class="small-text muted">${t("{count}명 · 관리자는 이 화면에서 정지할 수 없습니다.",{count:numberText(data.total)})}</p><div class="admin-rows"></div><nav class="pagination" aria-label="${t("회원 페이지")}">${data.page>1?`<a href="${esc(link(data.page-1))}">${t("이전")}</a>`:''}<span>${data.page} / ${data.pages}</span>${data.page<data.pages?`<a href="${esc(link(data.page+1))}">${t("다음")}</a>`:''}</nav>`);
    const reason=document.createElement('label');reason.className='field';reason.innerHTML=`${t("관리 사유 (선택)")}<input maxlength="300" placeholder="${t("이용 정지·해제 이유를 기록할 수 있습니다.")}">`;ctx.main.querySelector('.admin-rows').before(reason);
    const draw=()=>{
      if(!ctx.active())return;
      ctx.main.querySelector('.admin-rows').innerHTML=users.map(user=>`<div class="admin-row"><div><strong>${esc(user.username)}</strong><small>${({admin:t("운영자"),moderator:t("부관리자"),user:t("회원")})[user.role]}${user.banned?t(" · 이용 정지"):''} · ${esc(dateText(user.created_at))}</small></div>${user.role!=='admin'&&(user.role==='moderator'||!user.banned)?`<button class="button small" data-role="${user.id}">${user.role==='moderator'?t("부관리자 해임"):t("부관리자 임명")}</button>`:''}${user.role==='user'?`<button class="button small ${user.banned?'':'danger'}" data-ban="${user.id}">${user.banned?t("정지 해제"):t("이용 정지")}</button>`:''}</div>`).join('')||`<p class="empty">${t("회원을 찾을 수 없습니다.")}</p>`;
      for(const button of ctx.main.querySelectorAll('[data-role]'))button.onclick=async()=>{
        const target=users.find(user=>user.id===Number(button.dataset.role)),next=target.role==='moderator'?'user':'moderator',expected=target.role;
        if(!await confirmAction(t(next==='moderator'?"{name} 회원을 부관리자로 임명할까요? 글·댓글 삭제 권한만 부여합니다.":"{name} 부관리자를 해임할까요?",{name:target.username}))||!ctx.active())return;
        button.disabled=true;
        try{await ctx.api('/api/community/admin/roles/'+target.id,{method:'PATCH',body:{role:next,expected}});target.role=next;draw();ctx.notify(t("역할을 변경했습니다. 해당 회원은 다시 로그인해야 합니다."));}
        catch(error){ctx.notify(error.message);button.disabled=false;}
      };
      for(const button of ctx.main.querySelectorAll('[data-ban]'))button.onclick=async()=>{
        const target=users.find(user=>user.id===Number(button.dataset.ban));
        if(!await confirmAction(t(target.banned?"{name} 회원의 정지를 해제할까요?":"{name} 회원의 이용을 정지할까요?",{name:target.username}))||!ctx.active())return;
        button.disabled=true;
        try{await ctx.api('/api/community/admin/member/'+target.id,{method:'PATCH',body:{banned:target.banned?0:1,reason:reason.querySelector('input').value}});target.banned=target.banned?0:1;draw();}
        catch(error){ctx.notify(error.message);button.disabled=false;}
      };
    };draw();
    ctx.main.querySelector('form').onsubmit=event=>{event.preventDefault();location.hash='admin/users?'+new URLSearchParams({q:new FormData(event.currentTarget).get('q').trim()});};return;
  }
  if(page==='boards'){boardsPage(ctx,shell);return;}
  if(page==='terms'){
    const data=await ctx.api('/api/admin/terms');if(!ctx.active())return;
    shell(`<h2>${t("이용 안내")}</h2><form class="admin-section"><label class="field">${t("본문")}<textarea name="text" rows="16" maxlength="${data.max_len}" required>${esc(data.text)}</textarea></label><label class="check-field"><input name="bump" type="checkbox" checked>${t("회원에게 수정한 안내에 다시 동의하도록 요청")}</label>${alert}<button class="button primary">${t("안내 저장")}</button><p class="success-message" role="status"></p></form>`);
    bind('form',async form=>{await ctx.api('/api/admin/terms',{body:{text:form.elements.text.value,bump:+form.elements.bump.checked}});form.querySelector('[role=status]').textContent=t("이용 안내를 저장했습니다.");});return;
  }
  shell(`<p>${t("관리 메뉴를 선택해 주세요.")}</p>`);
}

function bindThreadSettings(ctx,thread,page,params){
  const form=ctx.main.querySelector('form'),submit=form.querySelector('button'),status=form.querySelector('[role=status]'),trash=ctx.main.querySelector('#trash-thread');
  const keys=['is_notice','pinned','locked','board_id'];
  let baseline=Object.fromEntries(keys.map(key=>[key,thread[key]??(key==='board_id'?null:0)])),busy=false;
  const read=()=>Object.fromEntries(keys.map(key=>[key,key==='board_id'?Number(form.elements[key].value)||null:+form.elements[key].checked]));
  const dirty=()=>{const values=read();return keys.some(key=>values[key]!==baseline[key]);};
  const pending=()=>dirty()||!!form.elements.reason.value.trim();
  const reload=document.createElement('button');reload.type='button';reload.className='button';reload.dataset.reloadSettings='';reload.textContent=t('다시 불러오기');submit.after(' ',reload);
  const update=()=>{
    for(const control of form.querySelectorAll('input,select,button'))control.disabled=busy;
    submit.disabled=busy||!dirty();trash.disabled=busy||pending();form.setAttribute('aria-busy',String(busy));
  };
  ctx.unsafeToLeave=()=>busy||pending();
  ctx.beforeLeave=async()=>{
    if(busy){ctx.notify(t('설정을 저장하고 있습니다. 잠시만 기다려 주세요.'));return false;}
    return !pending()||confirmAction(t('저장하지 않은 게시글 설정이 있습니다. 변경을 버리고 나갈까요?'));
  };
  form.addEventListener('input',()=>{status.textContent=pending()?t('저장하지 않은 설정이 있습니다. 저장하거나 다시 불러온 뒤 휴지통으로 이동할 수 있습니다.'):'';update();});
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!dirty()||!form.reportValidity())return;
    const values=read(),reason=form.elements.reason.value;busy=true;update();form.querySelector('[role=alert]').textContent='';status.textContent=t('설정을 저장하고 있습니다. 잠시만 기다려 주세요.');
    try{
      await ctx.api('/api/community/admin/thread/'+thread.id,{method:'PATCH',body:{...values,reason,expected:baseline}});
      baseline=values;form.elements.reason.value='';status.textContent=t('설정을 저장했습니다.');
    }catch(error){if(ctx.active()){status.textContent='';errorText(form,error);}}
    finally{busy=false;if(form.isConnected)update();}
  };
  reload.onclick=async()=>{
    if(!await ctx.beforeLeave()||!ctx.active())return;
    busy=true;update();
    try{await adminPage(ctx,page,params);}catch(error){if(ctx.active())errorText(form,error);}
    finally{busy=false;if(form.isConnected)update();}
  };
  update();
}
