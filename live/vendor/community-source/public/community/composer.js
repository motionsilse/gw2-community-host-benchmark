import {contentHtml,restoreEditImages} from './content-render.js';
import {hasLostImageMarker} from '../../src/community-content.js';
import {t,formatLocale,categoryName} from './i18n.js';
import {esc,errorText,confirmAction} from './ui.js';
import {exportDraft} from './export.js';
import {htmlToDocument} from './content-document.js';
import {deriveProof} from '../guest-credential.js';
import {challenge} from './challenge.js';
import {ImagePipeline,sizeText} from './images.js';
import {contentWriteRestriction} from './content-permissions.js';
import {commentText,commentTextFromHtml,commentHtml,commentDocument} from './comment-text.js';
import {hasDraftContent} from './drafts.js';
import {attachmentPicker} from './file-attachments.js';
import {createEditor} from './editor.js';
const salt=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
const number=value=>/^[1-9]\d*$/.test(String(value||''))?Number(value):null;

export async function composePage(ctx,params){
  const writeUnavailable=ctx.status.communityPaused||!ctx.status.rich.enabled,termsNeeded=ctx.status.user&&!ctx.status.terms.agreed;
  if(writeUnavailable&&!params.has('draft')){ctx.setPage(`<div class="empty"><h1>${t("글쓰기를 잠시 쉬고 있습니다.")}</h1><p>${t("이전에 작성한 글은 임시저장 목록에서 확인할 수 있습니다.")}</p><a class="button" href="#drafts">${t("임시저장")}</a> <a class="button" href="#list">${t("목록으로")}</a></div>`);return;}
  if(termsNeeded&&!params.has('draft')){ctx.setPage(`<div class="empty"><h1>${t("이용 안내를 확인해 주세요.")}</h1><a class="button primary" href="#terms?return=${encodeURIComponent(location.hash)}">${t("이용 안내 보기")}</a></div>`);return;}
  const id=params.get('draft')||crypto.randomUUID();let saved=params.has('draft')?await ctx.drafts.get(ctx.scope,id):null;
  if(params.has('draft')&&!saved)throw Error(t("이 계정 또는 기기에서 보관한 초안을 찾을 수 없습니다."));
  let kind=saved?.kind||(params.get('kind')==='post'?'post':'thread'),targetId=saved?.targetId||number(params.get('target')),threadId=saved?.threadId||number(params.get('thread')),record=null,unavailable=null;
  try{
  if(writeUnavailable||termsNeeded)throw Error(writeUnavailable?t("글쓰기가 일시 중단되어 있습니다."):t("새 이용 안내에 동의한 뒤 게시할 수 있습니다."));
  if(targetId){
    const data=await ctx.api('/api/threads/'+(kind==='thread'?targetId:threadId)+(kind==='post'?'?after='+(targetId-1):''));
    record=kind==='thread'?data.thread:data.posts.find(post=>post.id===targetId);if(!record)throw Error(t("수정할 게시물을 찾을 수 없습니다."));threadId=kind==='thread'?record.id:record.thread_id;
    const user=ctx.status.user;let permissionError=null;
    if(!user&&!record.guest)permissionError=t("회원 글은 작성자 계정으로 로그인한 뒤 수정해 주세요.");
    else if(user&&user.role!=='admin'&&record.author_id!==user.id)permissionError=record.guest?t("비회원으로 작성된 글입니다. 로그아웃한 뒤 이 글의 수정 화면에서 글 비밀번호를 입력해 주세요."):t("이 글을 수정할 권한이 없습니다.");
    permissionError??=contentWriteRestriction(data.thread,user,record);
    if(permissionError){
      if(saved)throw Error(permissionError);
      ctx.setPage(`<div class="empty"><h1>${t("수정 권한을 확인해 주세요.")}</h1><p>${esc(permissionError)}</p><div class="actions"><a class="button" href="#post/${threadId}">${t("게시글로")}</a>${!user?`<a class="button primary" href="#login?return=${encodeURIComponent(location.hash)}">${t("로그인")}</a>`:''}</div></div>`);return;
    }
  }else if(kind==='post'){
    if(!threadId)throw Error(t("댓글을 작성할 게시글이 없습니다."));
    const parent=await ctx.api('/api/threads/'+threadId),restriction=contentWriteRestriction(parent.thread,ctx.status.user);
    if(restriction){
      if(saved)throw Error(restriction);
      ctx.setPage(`<div class="empty"><h1>${t("댓글을 작성할 수 없습니다.")}</h1><p>${esc(restriction)}</p><a class="button" href="#post/${threadId}">${t("게시글로")}</a></div>`);return;
    }
  }
  }catch(error){if(!saved)throw error;unavailable=error;}
  if(!ctx.active())return;
  const originalHtml=record?(kind==='post'?commentHtml(commentText(record)):contentHtml(record,{editable:true})):'';
  const data={kind,targetId,threadId,baseRevision:record?.content_revision,title:record?.title||'',html:originalHtml,nickname:record?.guest?record.username:'',boardId:record?.board_id??null,replyTo:number(params.get('replyTo')),returnHash:ctx.listHash,guestKey:record?.guest?.key||crypto.randomUUID(),guestSalt:record?.guest?.salt||salt(),submissionId:crypto.randomUUID(),...saved};
  const lostImages=kind==='thread'&&targetId&&saved&&hasLostImageMarker(saved.html||'');
  if(lostImages&&record&&record.content_revision===data.baseRevision)data.html=restoreEditImages(data.html,originalHtml);
  let commentEdited=false;
  const returnTo=threadId?'#post/'+threadId:data.returnHash||ctx.listHash,guest=!ctx.status.user,isThread=kind==='thread';
  data.attachments??=isThread?(record?.attachments||[]).map(file=>({...file,status:'done'})):[];
  if(guest){
    const publishedFiles=new Set((record?.attachments||[]).map(file=>file.id));
    data.attachments=data.attachments.map(file=>publishedFiles.has(file.id)?file:{...file,status:'error',error:t('일반 파일 첨부는 로그인한 회원만 이용할 수 있습니다.')});
  }
  const canSetNotice=isThread&&ctx.status.user?.role==='admin';
  const maxImages=ctx.status.rich.maxImages??20;
  if(isThread&&targetId&&typeof data.baseIsNotice!=='boolean'){
    // Older edit drafts stored isNotice=false without offering a notice control.
    data.baseIsNotice=!!record?.is_notice;data.isNotice=data.baseIsNotice;
  }
  if(canSetNotice&&!targetId&&!saved)data.isNotice=params.get('notice')==='1';
  if(isThread&&!canSetNotice&&(!targetId&&data.isNotice===true||targetId&&data.isNotice!==data.baseIsNotice))unavailable??=Error(t(targetId?"공지 설정을 변경하려면 관리자 권한이 필요합니다.":"공지 초안을 게시하려면 관리 권한이 필요합니다."));
  ctx.setPage(`<section class="compose${isThread?'':' comment-compose'}"><div class="breadcrumb"><a href="${esc(returnTo)}">${threadId?t("게시글로"):t("목록으로")}</a></div><div class="compose-top"><h1>${targetId?t(isThread?"수정하기":"댓글 수정"):isThread?t("글쓰기"):t("댓글 쓰기")}</h1><div class="actions"><span class="save-state" role="status">${saved?t("초안을 불러왔습니다."):t("이 기기에 자동 저장됩니다.")}</span><a class="plain-button" href="#drafts">${t("임시저장한 글")}</a><button class="plain-button" type="button" id="export-draft">${t("내려받기")}</button></div></div>
    <div class="draft-note" id="draft-note" ${saved?'':'hidden'}>${saved?t("이 기기에 보관한 내용을 불러왔습니다."):''}</div>
    <form id="compose-form"><div class="compose-sheet">${isThread?`<label class="sr-only" for="post-title">${t("제목")}</label><input class="title-input" id="post-title" name="title" placeholder="${t("제목을 입력하세요")}" value="${esc(data.title)}" maxlength="240" required>`:''}
    ${isThread&&ctx.boards.length?`<label class="compose-category">${t("분류")}<select name="boardId" required><option value="" disabled ${ctx.boards.some(board=>board.id===Number(data.boardId))?'':'selected'}>${t("분류 선택")}</option>${ctx.boards.map(board=>`<option value="${board.id}" ${board.id===Number(data.boardId)?'selected':''}>${esc(categoryName(board.name))}</option>`).join('')}</select></label>`:''}
    <div class="compose-identity">${guest?`<div class="identity"><label>${t("닉네임")}<input name="nickname" value="${esc(data.nickname)}" maxlength="20" required ${targetId?'readonly':''} autocomplete="nickname"></label><label>${t("글 비밀번호")}<input name="password" type="password" minlength="8" maxlength="128" required autocomplete="${targetId?'current-password':'new-password'}" aria-describedby="password-hint"></label><small id="password-hint">${t("8자 이상. 이 글을 수정·삭제할 때 사용하며 복구할 수 없습니다.")}</small></div><div class="challenge-host"></div>`:`<span class="small-text">${esc(t(targetId?"{name} 님으로 수정합니다.":"{name} 님으로 작성합니다.",{name:ctx.status.user.username}))}</span>`}</div>
    ${isThread?`<div class="editor-mount"><div class="editor-loading" role="status">${t("편집기를 불러오는 중입니다.")}</div><textarea id="rich-editor" aria-label="${t("글 본문")}" hidden></textarea></div><div class="image-jobs" aria-live="polite"></div><div class="editor-hint"><span>${t("이미지는")} <kbd>Ctrl</kbd>+<kbd>V</kbd> ${t("· 끌어놓기 · 이미지 버튼으로 첨부하세요.")}</span><span>${t("{count}장 · 최적화 후 장당 2MB",{count:maxImages})}</span></div>`:`<label class="sr-only" for="comment-text">${t("댓글 내용")}</label><textarea class="comment-input" id="comment-text" name="text" placeholder="${t("댓글을 입력하세요")}" maxlength="10000" required>${esc(commentTextFromHtml(data.html))}</textarea>`}</div>
    ${isThread?'<section class="file-attachments"></section>':''}<p role="alert" tabindex="-1"></p><div class="compose-bottom"><p>${t("작성 내용은 현재 기기에 보관됩니다.")}<br>${t("비밀번호는 임시저장하지 않습니다.")}</p><div class="actions"><a class="button" href="${esc(returnTo)}">${t("나가기")}</a><button class="button primary" type="submit">${targetId?t("수정 저장"):t("등록")}</button></div></div></form></section>`);
  const form=ctx.main.querySelector('form'),state=ctx.main.querySelector('.save-state'),note=ctx.main.querySelector('#draft-note');
  // Install the navigation guard before awaiting Turnstile, a saved session or
  // the editor. Native GET submission would otherwise put guest credentials
  // into the URL while the real publishing handler is still being prepared.
  form.onsubmit=event=>event.preventDefault();
  form.querySelector('button[type=submit]').disabled=true;
  if(canSetNotice){
    const settings=document.createElement('label');settings.className='compose-category notice-setting';
    settings.innerHTML=`<input type="checkbox" name="isNotice" ${data.isNotice===true?'checked':''}><span><strong>${t(targetId?"공지사항으로 표시":"공지로 등록")}</strong><small>${t(targetId?"수정 저장 시 공지 설정도 함께 적용됩니다.":"등록 즉시 게시판 목록 상단의 공지로 표시됩니다.")}</small></span>`;
    form.querySelector('.compose-identity').before(settings);
  }
  let editor=null,attachments=null,proof=null,verifier=null,pipeline,session=null,opening=null,revision=saved?.revision||0,timer,saveQueue=Promise.resolve(),closed=false,dirty=false,editVersion=0,saveFailed=false,submitting=false,published=false,remotePublished=null,composerReady=false,syncingImages=false;
  const submitButton=form.querySelector('button[type=submit]'),submitLabel=submitButton.textContent;
  const imageState=document.createElement('p');imageState.id='image-publish-state';imageState.className='draft-note';imageState.setAttribute('role','status');imageState.hidden=true;
  form.querySelector('.compose-bottom').before(imageState);submitButton.setAttribute('aria-describedby',imageState.id);
  let previousFiles=data.files||[];
  const inform=message=>{note.hidden=false;note.textContent=message;};
  const imageRecoveryMessage=t("이전 초안에서 복원할 이미지를 확인할 수 없습니다. 원본 게시글에서 이미지를 확인해 다시 넣고, 초안에 남은 이미지 안내 문구를 지워 주세요.");
  if(lostImages)inform(hasLostImageMarker(data.html)?imageRecoveryMessage:t("이전 초안에서 빠진 원본 이미지를 복원했습니다."));
  const showPublished=(result,message=t("이 초안은 이미 게시되었습니다. 현재 내용은 기기에 보관됩니다. 게시글에서 수정해 주세요."))=>{remotePublished=result;inform(message);form.querySelector('button[type=submit]').disabled=true;const link=document.createElement('a');link.className='button small';link.href='#post/'+result.threadId;link.textContent=t("게시글 보기");note.append(' ',link);};
  const lockIdentity=()=>{if(!guest)return;form.elements.nickname.readOnly=true;form.elements.password.value='';form.elements.password.required=false;form.elements.password.disabled=true;ctx.main.querySelector('#password-hint').textContent=t("이 기기에서 작성 정보가 확인되었습니다. 같은 글 비밀번호로 나중에 수정·삭제할 수 있습니다.");};
  const unlockIdentity=()=>{if(!guest)return;form.elements.password.disabled=false;form.elements.password.required=true;};
  if(unavailable){
    inform(t("등록·수정을 멈췄습니다. 초안은 계속 편집·저장·내려받을 수 있습니다. ")+unavailable.message);
    form.querySelector('button[type=submit]').disabled=true;
  }
  const snapshot=()=>{
    const values={...data,title:form.elements.title?.value||'',nickname:guest?form.elements.nickname.value:'',boardId:form.elements.boardId?number(form.elements.boardId.value):data.boardId,html:editor?.html()??data.html};
    values.isNotice=form.elements.isNotice?form.elements.isNotice.checked:data.isNotice===true;
    values.attachments=attachments?.snapshots()??data.attachments;
    const files=new Map([...previousFiles,...(pipeline?.snapshots()||[])].map(file=>[file.id,file]));
    values.files=[...files.values()].filter(file=>file.source&&values.html.includes(file.source)||file.url&&values.html.includes(file.url));
    for(const file of values.files)if(file.url&&file.source)values.html=values.html.split(file.source).join(file.url);
    return values;
  };
  function imageWorkPending(){
    if(pipeline?.pending||editor?.pending)return true;
    if(!isThread||!editor)return false;
    // TinyMCE starts automatic uploads asynchronously after inserting a local
    // image. Also cover that gap before the pipeline has registered its job.
    const template=document.createElement('template');template.innerHTML=snapshot().html;
    return [...template.content.querySelectorAll('img')].some(image=>/^(blob:|data:)/i.test(image.getAttribute('src')||''));
  }
  function refreshSubmission(){
    if(closed)return;
    // Removing a failed/in-flight image must not leave a disabled button with
    // no way forward. Cancellation notifies this function again synchronously.
    if(editor&&pipeline&&!syncingImages&&!submitting){syncingImages=true;try{pipeline.discardRemoved();}finally{syncingImages=false;}}
    const fileBusy=attachments?.pending,busy=imageWorkPending()||fileBusy,failed=pipeline?.jobs.some(job=>job.status==='error');
    submitButton.disabled=!composerReady||!!unavailable||submitting||published||!!remotePublished||busy;
    submitButton.textContent=fileBusy?t('첨부파일 확인 중…'):busy?t(failed?'이미지 확인 필요':'이미지 처리 중…'):submitLabel;
    const complete=pipeline?.jobs.some(job=>job.status==='done');
    imageState.hidden=!busy&&!complete;
    imageState.textContent=fileBusy?t('파일 첨부가 끝나면 등록할 수 있습니다. 실패한 파일은 재시도하거나 삭제해 주세요.'):busy?t(failed?'실패한 이미지를 재시도하거나 제거한 뒤 등록해 주세요.':'이미지 첨부가 끝나면 등록할 수 있습니다.'):complete?t('이미지 첨부가 완료되었습니다. 등록할 수 있습니다.'):'';
  }
  function save(){
    clearTimeout(timer);if(closed||published)return Promise.resolve(true);
    const value=snapshot(),version=editVersion;
    if(!revision&&!targetId&&!hasDraftContent(value)){dirty=false;return Promise.resolve(true);}
    saveQueue=saveQueue.then(async()=>{
      try{state.textContent=t("임시저장 중…");const result=await ctx.drafts.save(ctx.scope,id,value,revision);revision=result.revision;saveFailed=false;dirty=editVersion!==version;ctx.replaceHash('#write?draft='+encodeURIComponent(id));state.textContent=dirty?t("변경 내용 저장 대기 중…"):t("이 기기에 저장됨 · ")+new Intl.DateTimeFormat(formatLocale,{hour:'2-digit',minute:'2-digit'}).format(new Date());return true;}
      catch(error){saveFailed=true;state.textContent=t("임시저장 실패");errorText(form,error);return false;}
    });return saveQueue;
  }
  function schedule(){if(closed||published)return;refreshSubmission();editVersion++;dirty=true;clearTimeout(timer);timer=setTimeout(save,650);}
  ctx.save=save;ctx.unsafeToLeave=()=>!published&&(dirty||saveFailed||pipeline?.pending||editor?.pending||attachments?.pending||submitting);
  ctx.beforeLeave=async()=>{
    if(submitting){ctx.notify(t("등록 결과를 확인하고 있습니다. 잠시만 기다려 주세요."));return false;}
    if(editor?.pending){ctx.notify(t("이미지 파일을 읽는 중입니다. 잠시만 기다려 주세요."));return false;}
    if(published)return true;
    if(!composerReady&&!dirty&&!saveFailed)return true;
    if(await save())return true;
    return confirmAction(t("초안을 기기에 저장하지 못했습니다. 지금 나가면 현재 변경을 잃을 수 있습니다. 내려받지 않고 나갈까요?"));
  };
  ctx.dispose=()=>{closed=true;clearTimeout(timer);pipeline?.destroy();attachments?.destroy();editor?.destroy();verifier?.destroy();if(form.elements.password)form.elements.password.value='';proof=null;};
  form.addEventListener('input',schedule);
  const textExport=document.createElement('button');textExport.className='plain-button';textExport.type='button';textExport.textContent=t("본문만 내려받기");textExport.hidden=!unavailable;ctx.main.querySelector('#export-draft').after(textExport);
  textExport.onclick=async()=>{try{await exportDraft(snapshot(),{includeImages:false});ctx.notify(t("이미지를 제외한 본문 파일을 내려받았습니다."));}catch(error){errorText(form,error);}};
  ctx.main.querySelector('#export-draft').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await exportDraft(snapshot(),{includeImages:isThread});ctx.notify(t(isThread?"본문과 첨부파일을 담은 초안을 내려받았습니다.":"댓글 본문을 내려받았습니다."));}catch(error){errorText(form,error);textExport.hidden=false;}finally{button.disabled=false;}};
  const challengeReady=guest?challenge(ctx.main.querySelector('.challenge-host'),ctx.status.guest,{signal:ctx.controller?.signal}).then(widget=>{
    if(closed)widget.destroy();else verifier=widget;
  }).catch(error=>{if(!closed&&ctx.active())errorText(form,error);}):null;
  if(data.serverId&&!unavailable){
    try{
      session=await ctx.api('/api/community/drafts/'+data.serverId);
      if(closed)return;
      if(session.published)showPublished(session.published);
      else lockIdentity();
    }catch(error){
      if(closed)return;
      if([403,404,410].includes(error.status)){
        data.serverId=null;session=null;data.submissionId=crypto.randomUUID();
        previousFiles=previousFiles.map(file=>({...file,id:crypto.randomUUID(),source:file.url||file.source,url:undefined,status:'queued'}));
        data.attachments=data.attachments.map(file=>file.blob?{...file,id:crypto.randomUUID(),url:undefined,status:'queued'}:file);
        inform(t("작성 세션을 다시 시작합니다. 보관된 이미지는 작성 정보를 확인한 뒤 다시 업로드합니다."));
      }else if(error.status===401){unlockIdentity();inform(t("본문은 보관되어 있습니다. 작성 권한을 다시 확인해 주세요."));}
      else errorText(form,error);
    }
  }
  async function guestCredentials(){
    if(!guest)return {};
    if(!form.elements.nickname.reportValidity()||!form.elements.password.reportValidity())throw Error(t("닉네임과 8자 이상의 글 비밀번호를 먼저 입력해 주세요."));
    await challengeReady;
    if(!verifier)throw Error(t("자동 입력 방지 설정을 확인해 주세요."));
    proof=await deriveProof(form.elements.password.value,data.guestKey,data.guestSalt);
    return {proof,turnstileToken:verifier.token()};
  }
  async function ensureSession({check=false}={}){
    if(unavailable)throw Error(t("원래 게시글을 열 수 없습니다. 현재 초안을 내려받아 보관해 주세요."));
    if(published||remotePublished)throw Error(t("이미 게시된 초안입니다. 게시글을 열어 수정해 주세요."));
    if(session&&session.authorizedUntil>Date.now()&&!check)return session;
    if(opening)return opening;
    opening=(async()=>{
      if(data.serverId){
        try{session=await ctx.api('/api/community/drafts/'+data.serverId);
          if(session.published){showPublished(session.published);await save();throw Error(t("게시 완료를 확인했습니다. 위의 게시글 보기 버튼으로 열어 주세요."));}
          lockIdentity();return session;
        }catch(error){
          if(error.status!==401)throw error;unlockIdentity();
          session=await ctx.api('/api/community/drafts/'+data.serverId+'/authorize',{body:guest?await guestCredentials():{}});verifier?.reset();lockIdentity();return session;
        }
      }
      const body={kind,...(targetId?{targetId,revision:data.baseRevision}:{}),...(kind==='post'?{threadId}:{}),...(guest?await guestCredentials():{})};
      if(guest&&!targetId)Object.assign(body,{key:data.guestKey,salt:data.guestSalt,nickname:form.elements.nickname.value.trim()});
      session=await ctx.api('/api/community/drafts',{body});data.serverId=session.id;verifier?.reset();lockIdentity();await save();return session;
    })();
    try{return await opening;}finally{opening=null;}
  }
  function jobsChanged(jobs){
    if(closed)return;
    const visible=[...jobs.filter(job=>!['done','cancelled'].includes(job.status)),...jobs.filter(job=>job.status==='done').slice(-2)];
    const host=ctx.main.querySelector('.image-jobs');host.innerHTML=visible.map(job=>`<div class="image-job ${job.status}"><span class="job-name">${esc(job.name)}</span><span class="job-detail">${job.status==='done'?`${t("첨부됨 ·")} ${sizeText(job.result.originalSize)} → ${sizeText(job.size)}`:job.status==='error'?esc(job.error):({queued:t("처리 대기 중"),processing:t("이미지 최적화 중…"),saving:t("이미지 업로드 중…")}[job.status])}</span>${job.status==='error'?`<button type="button" class="button small" data-retry="${job.id}">${t("재시도")}</button><button type="button" class="plain-button" data-cancel="${job.id}">${t("제거")}</button>`:''}</div>`).join('');
    host.querySelectorAll('[data-retry]').forEach(button=>{button.onclick=()=>pipeline.retry(button.dataset.retry);});host.querySelectorAll('[data-cancel]').forEach(button=>{button.onclick=()=>pipeline.cancel(button.dataset.cancel);});schedule();
  }
  if(isThread){
  attachments=attachmentPicker(ctx.main.querySelector('.file-attachments'),{files:data.attachments,onChange:schedule,canUpload:!guest,enabled:ctx.status.rich.attachments!==false&&!unavailable,send:async(file,ids,signal)=>{
    const draft=await ensureSession();
    await ctx.api(`/api/community/drafts/${draft.id}/attachments/references`,{body:{ids},signal});
    return ctx.api(`/api/community/drafts/${draft.id}/attachments/${file.id}`,{method:'PUT',raw:file.blob,headers:{'content-type':'application/octet-stream','x-file-name':encodeURIComponent(file.name)},signal});
  }});attachments.start();
  pipeline=new ImagePipeline(jobsChanged,{maxImages,referenceCount:()=>editor?.imageCount()??null,isReferenced:job=>!editor||editor.html().includes(job.url||job.source),send:async(result,signal,imageId)=>{
    if(!ctx.status.rich.images)throw Error(t("이미지 첨부를 준비 중입니다. 본문과 이미지는 초안에 보관됩니다."));
    const draft=await ensureSession(),value=snapshot(),ids=new Set(value.files.map(file=>file.id));
    for(const match of value.html.matchAll(/\/media\/([0-9a-f-]{36})/g))ids.add(match[1]);
    await ctx.api(`/api/community/drafts/${draft.id}/media/references`,{body:{ids:[...ids]},signal});
    return ctx.api(`/api/community/drafts/${draft.id}/media/${imageId}`,{method:'PUT',raw:result.blob,headers:{'content-type':result.blob.type},signal});
  }});
  const loading=form.querySelector('.editor-loading');
  try{
    const element=form.querySelector('#rich-editor');
    // Each instance needs its own ID if another edit opens before TinyMCE settles.
    element.removeAttribute('id');
    editor=await createEditor(element,{html:data.html,files:previousFiles,maxImages,signal:ctx.controller?.signal,onChange:schedule,upload:(file,options)=>pipeline.upload(file,options)});
    if(closed){editor.destroy();return;}
    loading.remove();
  }catch(error){
    if(!closed){loading.remove();errorText(form,error);}
    return;
  }
  }else{
    const input=form.elements.text;
    input.addEventListener('input',()=>{commentEdited=true;});
    editor={html:()=>saved&&!commentEdited?data.html:commentHtml(input.value),setReadOnly:value=>{input.readOnly=value;},destroy(){}};
    if(/<(?:img|strong|b|em|i|s|a|table|h[1-6]|ul|ol|blockquote)\b/i.test(data.html))inform(t("댓글은 텍스트로 저장됩니다. 기존 이미지와 서식은 저장 시 제외됩니다."));
    if(!ctx.active()){ctx.dispose();return;}
  }
  schedule();
  const progress=document.createElement('p');progress.className='draft-note publish-state';progress.setAttribute('role','status');progress.hidden=true;form.before(progress);
  const setSubmitting=value=>{form.inert=value;form.setAttribute('aria-busy',String(value));editor.setReadOnly(value);progress.hidden=!value;progress.textContent=targetId?t("수정 내용을 저장 중입니다. 잠시만 기다려 주세요."):t("글을 등록 중입니다. 잠시만 기다려 주세요.");};
  const contentKey=value=>JSON.stringify([value.title,value.html,value.boardId??null,value.isNotice,value.attachments?.map(file=>[file.id,file.status])]);
  form.onsubmit=async event=>{
    event.preventDefault();if(unavailable||submitting||published||remotePublished||!form.reportValidity())return;
    refreshSubmission();
    if(attachments?.pending){errorText(form,Error(t('파일 첨부가 끝나면 등록할 수 있습니다. 실패한 파일은 재시도하거나 삭제해 주세요.')));return;}
    if(imageWorkPending()){errorText(form,Error(t("이미지 처리 중입니다. 실패한 이미지는 재시도하거나 제거해 주세요.")));return;}
    submitting=true;const submit=form.querySelector('button[type=submit]');submit.disabled=true;form.querySelector('[role=alert]').textContent='';setSubmitting(true);
    try{
      if(!isThread)commentEdited=true;
      const submitted=snapshot();
      if(isThread&&targetId&&hasLostImageMarker(submitted.html))throw Error(imageRecoveryMessage);
      const converted=isThread?htmlToDocument(submitted.html,{allowEmpty:submitted.attachments.length>0}):{document:commentDocument(form.elements.text.value),warnings:[]};
      if(converted.warnings.length){
        const message=converted.warnings.join('\n');inform(message);
        if(!await confirmAction(message+t("\n이 서식으로 등록할까요?")))return;
        if(contentKey(snapshot())!==contentKey(submitted))throw Error(t("확인 중 본문이 변경되었습니다. 현재 내용을 확인한 뒤 다시 등록해 주세요."));
      }
      const draft=await ensureSession({check:true}),body={submissionId:data.submissionId,document:converted.document,...(isThread?{title:submitted.title,boardId:submitted.boardId,attachmentIds:submitted.attachments.map(file=>file.id)}:{}),...(targetId?{revision:data.baseRevision}:{}),...(data.replyTo?{replyTo:data.replyTo}:{})};
      if(canSetNotice&&(!targetId||submitted.isNotice!==data.baseIsNotice)){
        body.isNotice=submitted.isNotice;if(targetId)body.expectedNotice=data.baseIsNotice;
      }
      await save();
      if(contentKey(snapshot())!==contentKey(submitted))throw Error(t("확인 중 본문이 변경되었습니다. 현재 내용을 확인한 뒤 다시 등록해 주세요."));
      const result=await ctx.api('/api/community/drafts/'+draft.id+'/publish',{body});
      // An earlier editor/file callback can still settle during the request.
      // Keep that newer draft; never treat it as part of the accepted payload.
      if(contentKey(snapshot())!==contentKey(submitted)){
        remotePublished=result;
        const stored=await save();
        showPublished(result,stored?t("게시가 완료되었습니다. 등록 중 변경된 내용은 초안으로 보관했습니다. 게시글을 열어 수정해 주세요."):t("게시가 완료되었지만 변경된 초안을 기기에 저장하지 못했습니다. 이 창에서 내용을 복사하거나 내려받아 주세요."));
        return;
      }
      published=true;clearTimeout(timer);await saveQueue;await ctx.drafts.remove(ctx.scope,id,revision).catch(()=>{});
      ctx.notify(targetId?t("수정한 내용을 저장했습니다."):t("글을 등록했습니다."));submitting=false;location.hash='post/'+result.threadId+(kind==='post'?'?reply='+result.id:'');
    }catch(error){
      setSubmitting(false);
      if(error.status===401){session=null;unlockIdentity();inform(ctx.status.user?t("로그인이 만료되었습니다. 초안을 저장한 뒤 다시 로그인해 주세요."):t("작성 권한을 다시 확인해 주세요."));}
      errorText(form,error);verifier?.reset();
    }finally{submitting=false;if(!published)setSubmitting(false);if(submit.isConnected)refreshSubmission();}
  };
  composerReady=true;refreshSubmission();
}
