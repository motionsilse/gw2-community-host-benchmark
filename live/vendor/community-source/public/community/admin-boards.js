import {t,numberText,categoryName} from './i18n.js';
import {esc,errorText,confirmAction} from './ui.js';

export function boardsPage(ctx,shell){
  const initial=ctx.boards.map(({id,name,description,revision})=>({id,name,description,revision}));
  shell(`<h2>${t('분류 설정')}</h2><p>${t('이름·설명을 수정하거나 위아래 버튼으로 순서를 바꾼 뒤 저장하세요.')}</p>
    <form id="board-settings"><div class="board-editors">${ctx.boards.map(board=>`<article class="admin-row board-editor" data-board="${board.id}"><div class="board-editor-heading"><div><strong>${esc(categoryName(board.name))}</strong><small>${esc(board.description)} · ${t('글 {count}개',{count:numberText(board.threads)})}</small></div><div class="actions"><button class="button small" type="button" data-move="up" aria-label="${esc(t('{name} 분류 위로',{name:board.name}))}">↑</button><button class="button small" type="button" data-move="down" aria-label="${esc(t('{name} 분류 아래로',{name:board.name}))}">↓</button></div></div><div class="board-editor-fields"><label class="field">${t('분류 이름')}<input name="name" minlength="2" maxlength="24" value="${esc(board.name)}" required></label><label class="field">${t('설명')}<input name="description" maxlength="200" value="${esc(board.description)}"></label></div><button class="plain-button" type="button" data-delete-board="${board.id}">${t('분류 삭제')}</button></article>`).join('')||`<p class="empty">${t('아직 분류가 없습니다. 새 분류를 추가해 주세요.')}</p>`}</div>
    <p role="alert" tabindex="-1"></p><p class="small-text muted" role="status"></p><div class="actions"><button class="button primary" type="submit">${t('분류 변경 저장')}</button><button class="button" type="button" data-reload>${t('다시 불러오기')}</button></div></form>
    <form id="board-create" class="admin-section"><h2>${t('새 분류')}</h2><label class="field">${t('분류 이름')}<input name="name" minlength="2" maxlength="24" required></label><label class="field">${t('설명')}<input name="description" maxlength="200"></label><p role="alert" tabindex="-1"></p><button class="button primary">${t('분류 추가')}</button><p class="small-text">${t('분류를 삭제해도 게시글은 전체 목록에 유지됩니다.')}</p></form>`);
  const form=ctx.main.querySelector('#board-settings'),create=ctx.main.querySelector('#board-create'),list=form.querySelector('.board-editors');
  let busy=false;
  const rows=()=>[...list.querySelectorAll('[data-board]')];
  const read=()=>rows().map(row=>({...initial.find(item=>item.id===Number(row.dataset.board)),name:row.querySelector('[name=name]').value,description:row.querySelector('[name=description]').value}));
  const dirty=()=>JSON.stringify(read())!==JSON.stringify(initial);
  const creating=()=>create.querySelector('[name=name]').value!==''||create.querySelector('[name=description]').value!=='';
  ctx.unsafeToLeave=()=>dirty()||creating()||busy;
  ctx.beforeLeave=async()=>{
    if(busy){ctx.notify(t('설정을 저장하고 있습니다. 잠시만 기다려 주세요.'));return false;}
    return !dirty()&&!creating()||confirmAction(t('저장하지 않은 분류 변경이 있습니다. 변경을 버리고 나갈까요?'));
  };
  const update=()=>{
    const changed=dirty(),items=rows();
    for(const control of ctx.main.querySelectorAll('#board-settings input,#board-settings button,#board-create input,#board-create button'))control.disabled=busy;
    form.querySelector('[type=submit]').disabled=busy||!changed;
    create.querySelector('button').disabled=busy||changed;
    for(const [index,row] of items.entries()){
      row.querySelector('[data-move=up]').disabled=busy||index===0;
      row.querySelector('[data-move=down]').disabled=busy||index===items.length-1;
      row.querySelector('[data-delete-board]').disabled=busy||changed||creating();
    }
    form.querySelector('[role=status]').textContent=changed?t('저장하지 않은 변경이 있습니다. 분류 추가·삭제 전에 먼저 저장하세요.'):t('위에서 아래 순서로 목록과 글쓰기 메뉴에 표시됩니다.');
  };
  const refresh=async(keepCreate=true)=>{
    const pending={name:create.elements.name.value,description:create.elements.description.value};
    const data=await ctx.api('/api/boards');if(ctx.active()){
      ctx.boards=data.boards;boardsPage(ctx,shell);
      if(keepCreate){const next=ctx.main.querySelector('#board-create');next.elements.name.value=pending.name;next.elements.description.value=pending.description;next.dispatchEvent(new Event('input',{bubbles:true}));}
    }
  };
  const run=async(target,action)=>{
    busy=true;update();target.querySelector('[role=alert]').textContent='';
    try{await action();}catch(error){if(ctx.active())errorText(target,error);}
    finally{busy=false;if(form.isConnected)update();}
  };
  form.addEventListener('input',update);create.addEventListener('input',update);
  for(const button of form.querySelectorAll('[data-move]'))button.onclick=()=>{
    const row=button.closest('[data-board]'),items=rows(),index=items.indexOf(row);
    if(button.dataset.move==='up'&&index>0)list.insertBefore(row,items[index-1]);
    if(button.dataset.move==='down'&&index<items.length-1)list.insertBefore(items[index+1],row);
    update();button.focus();
  };
  form.onsubmit=event=>{event.preventDefault();if(busy||!dirty()||!form.reportValidity())return;run(form,async()=>{await ctx.api('/api/community/admin/boards',{method:'PATCH',body:{boards:read()}});await refresh();ctx.notify(t('분류 이름·설명·순서를 저장했습니다.'));});};
  form.querySelector('[data-reload]').onclick=async()=>{if(!await ctx.beforeLeave())return;await run(form,()=>refresh(false));};
  create.onsubmit=event=>{event.preventDefault();if(busy||dirty()||!create.reportValidity())return;run(create,async()=>{await ctx.api('/api/community/admin/boards',{body:{name:create.elements.name.value,description:create.elements.description.value}});await refresh(false);ctx.notify(t('분류를 추가했습니다.'));});};
  for(const button of form.querySelectorAll('[data-delete-board]'))button.onclick=async()=>{
    const board=initial.find(item=>item.id===Number(button.dataset.deleteBoard));
    if(busy||dirty()||creating()||!await confirmAction(t('‘{name}’ 분류를 삭제할까요? 게시글은 전체 목록에 남으며 본문·댓글·이미지는 유지됩니다. 삭제한 분류는 되돌릴 수 없습니다.',{name:board.name}),{accept:t('분류 삭제'),danger:true})||!ctx.active())return;
    await run(form,async()=>{const result=await ctx.api('/api/community/admin/boards/'+board.id,{method:'DELETE',body:{revision:board.revision}});await refresh();ctx.notify(t('분류를 삭제했습니다. 글 {count}개는 전체 목록에 유지됩니다.',{count:numberText(result.moved)}));});
  };
  update();
}
