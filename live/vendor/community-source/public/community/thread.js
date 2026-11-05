import {contentHtml,imageViewer} from './content-ui.js';
import {t,categoryName,numberText} from './i18n.js';
import {esc,dateText,errorText,confirmAction} from './ui.js';
import {deriveProof} from '../guest-credential.js';
import {challenge} from './challenge.js';
import {contentWriteRestriction} from './content-permissions.js';
import {commentText,commentTextFromHtml,commentHtml,commentDocument} from './comment-text.js';
import {threadRequest} from './read-request.js';
import {commentOrder} from './comment-order.js';
import {linkifyContent} from './content-links.js';
import {postAttachments} from './file-attachments.js';
import {loadEditor} from './editor-loader.js';

const editable=(row,user)=>!!row.guest&&!user||!!user&&(user.id===row.author_id||user.role==='admin');
const deletable=(row,user)=>editable(row,user)||!!user?.can_mod;
const editLink=(row,type,threadId)=>`#write?kind=${type}&target=${row.id}&thread=${threadId}`;
export async function threadPage(ctx,id,params){
  const focusReply=/^[1-9]\d*$/.test(params.get('reply')||'')?Number(params.get('reply')):null;
  let data=await ctx.api(threadRequest(id,params),{headers:{'x-community-view':'1'}});if(!ctx.active())return;
  // Resolve a late-page reply before replacing the existing view, preserving
  // every earlier comment and its parent context after a successful publish.
  while(focusReply&&!data.posts.some(post=>post.id===focusReply)&&data.nextPostCursor&&data.nextPostCursor<focusReply){
    const after=data.nextPostCursor,next=await ctx.api('/api/threads/'+id+'?after='+after+'&view=comments');if(!ctx.active())return;
    data={...data,posts:[...data.posts,...next.posts],nextPostCursor:next.nextPostCursor};
    if(data.nextPostCursor&&data.nextPostCursor<=after)break;
  }
  const row=data.thread;let ready=!!ctx.status,user=ctx.status?.user,restriction=ready?contentWriteRestriction(row,user):'',canWrite=ready&&!ctx.status.communityPaused&&ctx.status.rich.enabled&&!restriction,disposed=false;
  const threadActions=()=>ready?`${deletable(row,user)?`${canWrite&&editable(row,user)?`<a class="button small" href="${editLink(row,'thread',id)}">${t("수정")}</a>`:''}<button type="button" class="button small" data-delete="thread:${row.id}">${t("삭제")}</button>`:''}${user?.role==='admin'?`<a class="button small" href="#admin/content?thread=${id}">${t("관리")}</a>`:''}`:'';
  const commentActions=post=>ready?`${canWrite?`<button type="button" data-reply="${post.id}" aria-expanded="false" aria-controls="inline-reply" class="plain-button">${t("답글")}</button>`:''}${deletable(post,user)?`${canWrite&&editable(post,user)&&!contentWriteRestriction(row,user,post)?`<a class="plain-button" href="${editLink(post,'post',id)}">${t("수정")}</a>`:''}<button class="plain-button" data-delete="post:${post.id}" type="button">${t("삭제")}</button>`:''}`:'';
  const replyMarkup=()=>ready?`${canWrite?`<form class="reply-form"><h2>${t("댓글 남기기")}</h2>${user?`<p class="small-text">${esc(t("{name} 님으로 작성합니다.",{name:user.username}))}</p>`:`<div class="identity"><label>${t("닉네임")}<input name="nickname" maxlength="20" required autocomplete="nickname"></label><label>${t("글 비밀번호")}<input name="password" type="password" minlength="8" maxlength="128" required autocomplete="new-password"></label><small>${t("8자 이상. 댓글을 수정·삭제할 때 필요하며 복구할 수 없습니다.")}</small></div>`}<label class="sr-only" for="reply-text">${t("댓글 내용")}</label><textarea id="reply-text" name="text" placeholder="${t("댓글을 입력하세요")}" maxlength="10000" required></textarea>${!user?'<div class="challenge-host"></div>':''}<p role="alert" tabindex="-1"></p><div class="reply-actions"><button class="button primary" type="submit">${t("댓글 등록")}</button></div></form>`:`<p class="muted small-text">${ctx.status.communityPaused?t("글·댓글 작성이 일시 중단되어 있습니다."):!ctx.status.rich.enabled?t("글쓰기를 잠시 쉬고 있습니다."):restriction}</p>`}`:'';
  const writeLink=()=>ready?`${!ctx.status.communityPaused&&ctx.status.rich.enabled?`<a class="button primary" href="#write">${t("＋ 글쓰기")}</a>`:''}`:'';
  let closeImages=()=>{};
  ctx.dispose=()=>{disposed=true;closeImages();};
  ctx.setPage(`<article class="thread"><div class="breadcrumb"><a href="${esc(ctx.listHash)}">${t("목록으로")}</a>${row.board_name?`<span>›</span><span>${esc(categoryName(row.board_name))}</span>`:''}</div><header class="post-head">${row.is_notice?`<span class="notice-label">${t("공지사항")}</span>`:row.pinned?`<span class="notice-label">${t("고정된 글")}</span>`:''}<h1>${esc(row.title)}</h1><div class="post-meta"><strong>${esc(row.username)}</strong><time>${esc(dateText(row.created_at))}</time><span>${t("조회")} ${numberText(row.view_count||0)}</span>${row.edited_at?`<span>${t("수정됨")}</span>`:''}${row.locked?`<span>${t("글 잠김")}</span>`:''}</div></header>
    <div class="reading-surface"><div class="prose">${contentHtml(row)}</div>${postAttachments(row.attachments)}</div><div class="post-end"><button class="recommend" id="recommend" ${ready?'':'disabled'} aria-pressed="${!!row.liked}">${t("추천")} <b>${row.likes||0}</b></button><div class="actions">${threadActions()}</div></div><div class="delete-host"></div><p class="small-text" data-thread-context-error hidden></p>
    <section class="comments" id="comments"><h2 tabindex="-1">${t("댓글")} <span data-comment-total></span></h2><div id="comment-list"></div><button id="load-comments" type="button" class="button small" hidden>${t("다음 댓글 더 보기")}</button>
    <div data-reply-slot>${replyMarkup()}</div></section><div class="thread-nav"><a class="button" href="${esc(ctx.listHash)}">${t("목록으로")}</a><span data-thread-write>${writeLink()}</span></div></article>`);
  const allRows=new Map([[`thread:${row.id}`,row]]),list=ctx.main.querySelector('#comment-list'),more=ctx.main.querySelector('#load-comments');let cursor=data.nextPostCursor,bindReplies=()=>{},refreshDraftHints=()=>{},detachReply=()=>{};
  let totalComments=Number.isInteger(row.replies)?row.replies:null;
  function updateEmptyComments(){
    ctx.main.querySelector('[data-comment-total]').textContent=numberText(totalComments??allRows.size-1)+(totalComments===null&&cursor?'+':'');
    list.querySelector('[data-empty-comments]')?.remove();
    if(allRows.size===1&&!cursor){
      const empty=document.createElement('p');empty.className='muted small-text';empty.dataset.emptyComments='';empty.textContent=t("아직 댓글이 없습니다.");list.append(empty);
    }
  }
  const commentNodes=new Map();
  function arrangeComments(){
    const posts=[...allRows.entries()].filter(([key])=>key.startsWith('post:')).map(([,post])=>post);
    for(const {post,depth,parent} of commentOrder(posts)){
      const item=commentNodes.get(post.id);item.classList.toggle('comment-reply',depth>0);
      item.style.setProperty('--reply-depth',String(Math.min(depth,2)));
      item.querySelector('.reply-to')?.remove();
      if(parent){
        const link=document.createElement('a');link.className='reply-to';link.href=`#post/${id}?reply=${parent.id}`;
        link.textContent='↳ '+parent.username;link.setAttribute('aria-label',t("{name} 님에게 답글",{name:parent.username}));
        link.onclick=event=>{
          if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
          event.preventDefault();const target=commentNodes.get(parent.id);
          target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({block:'start'});
          ctx.replaceHash?.(`#post/${id}?reply=${parent.id}`);
        };
        item.querySelector('.post-meta .actions').before(link);
      }
      list.append(item);
    }
  }
  function append(posts){
    for(const post of posts){
      const key=`post:${post.id}`;if(allRows.has(key))continue;allRows.set(key,post);
      const item=document.createElement('article');item.className='comment';item.id='reply-'+post.id;
      const originalAuthor=!row.guest&&!post.guest&&!row.is_anon&&!post.is_anon&&row.author_id>0&&row.author_id===post.author_id;
      item.innerHTML=`<div class="post-meta"><strong>${esc(post.username)}</strong>${originalAuthor?`<span class="author-badge">${t("글쓴이")}</span>`:''}<time>${esc(dateText(post.created_at))}</time>${post.edited_at?`<span>${t("수정됨")}</span>`:''}<div class="actions">${commentActions(post)}</div></div><div class="prose comment-text">${esc(commentText(post))}</div>`;
      linkifyContent(item.querySelector('.comment-text'));
      commentNodes.set(post.id,item);
    }
    arrangeComments();
    updateEmptyComments();
    more.hidden=!cursor;bindDeletes();bindReplies();refreshDraftHints();
  }
  let activeDeletion=null,replyChallenge=null,replyBusy=false,replySubmitted=false;
  function bindDeletes(){
    for(const button of ctx.main.querySelectorAll('[data-delete]'))button.onclick=async()=>{
      const key=button.dataset.delete,target=allRows.get(key),type=key.split(':')[0],host=ctx.main.querySelector('.delete-host'),guestDelete=target.guest&&!user?.can_mod;activeDeletion?.destroy();
      host.innerHTML=`<form class="account-form" aria-labelledby="delete-content-title"><h2 id="delete-content-title">${type==='thread'?t("게시글 삭제"):t("댓글 삭제")}</h2><p class="small-text">${guestDelete?t("글 비밀번호를 확인한 뒤 삭제합니다. 비회원 삭제는 되돌릴 수 없습니다."):t("삭제한 글은 휴지통으로 이동합니다.")}${type==='thread'?t(" 게시글에 달린 댓글도 함께 삭제됩니다."):''}</p>${guestDelete?`<label class="field">${t("글 비밀번호")}<input name="password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required></label><div class="challenge-host"></div>`:''}<p role="alert" tabindex="-1"></p><div class="actions"><button class="button danger" type="submit">${t("삭제하기")}</button><button class="button" type="button" data-cancel>${t("취소")}</button></div></form>`;
      const form=host.querySelector('form'),challengeController=new AbortController();let verifier=null,busy=false;
      const deletion={destroy(){challengeController.abort();verifier?.destroy();verifier=null;}};
      activeDeletion=deletion;
      const ownsForm=()=>ctx.active()&&activeDeletion===deletion&&form.isConnected;
      const close=()=>{deletion.destroy();if(activeDeletion===deletion){activeDeletion=null;host.replaceChildren();}};
      form.querySelector('[data-cancel]').onclick=()=>{if(!ownsForm())return;close();if(button.isConnected)button.focus();};host.scrollIntoView({block:'center'});
      form.querySelector('input[name=password], [data-cancel]').focus({preventScroll:true});
      form.onsubmit=async event=>{
        event.preventDefault();if(busy||!ownsForm()||!form.reportValidity())return;busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;
        try{
          let body;if(guestDelete){if(!verifier)throw Error(t("자동 입력 방지 확인을 준비하지 못했습니다."));const proof=await deriveProof(form.elements.password.value,target.guest.key,target.guest.salt);if(!ownsForm())return;body={proof,revision:target.guest.revision,turnstileToken:verifier.token()};}
          await ctx.api(`/api/${guestDelete?'guest/':''}${type==='thread'?'threads':'posts'}/${target.id}`,{method:'DELETE',body});
          if(!ctx.active())return;
          const focused=ownsForm();close();ctx.notify(t("삭제했습니다."));
          if(type==='thread')location.hash=ctx.listHash;else{detachReply(target.id);allRows.delete(key);if(totalComments!==null)totalComments=Math.max(0,totalComments-1);commentNodes.get(target.id)?.remove();commentNodes.delete(target.id);arrangeComments();updateEmptyComments();refreshDraftHints();if(focused)ctx.main.querySelector('#comments h2').focus();}
        }catch(error){if(ownsForm()){errorText(form,error);verifier?.reset();}}
        finally{busy=false;if(ownsForm())submit.disabled=false;}
      };
      if(guestDelete){
        const submit=form.querySelector('[type=submit]');submit.disabled=true;
        try{const ready=await challenge(form.querySelector('.challenge-host'),ctx.status.guest,{signal:challengeController.signal});
          if(!ownsForm()){ready.destroy();return;}verifier=ready;submit.disabled=false;
        }catch(error){if(ownsForm()&&error.name!=='AbortError')errorText(form,error);}
      }
    };
  }
  append(data.posts);closeImages=imageViewer(ctx.main.querySelector('.reading-surface'));
  more.onclick=async()=>{more.disabled=true;try{data=await ctx.api('/api/threads/'+id+'?after='+cursor+'&view=comments');if(!ctx.active())return;cursor=data.nextPostCursor;append(data.posts);}catch(error){ctx.notify(error.message);}finally{more.disabled=false;}};
  function activate(status){
    if(disposed||!ctx.active()||!list.isConnected)return;
    const wasReady=ready;
    ctx.status=status;ctx.scope=status.user?'member:'+status.user.id:'guest';ready=true;user=status.user;
    restriction=contentWriteRestriction(row,user);canWrite=!status.communityPaused&&status.rich.enabled&&!restriction;
    if(!wasReady){
      ctx.main.querySelector('.post-end .actions').innerHTML=threadActions();
      for(const [key,post] of allRows)if(key.startsWith('post:'))list.querySelector('#reply-'+post.id+' .actions').innerHTML=commentActions(post);
      ctx.main.querySelector('[data-reply-slot]').innerHTML=replyMarkup();
      ctx.main.querySelector('[data-thread-write]').innerHTML=writeLink();
      bindDeletes();
    }
  const edit=ctx.main.querySelector('.post-end a[href^="#write?kind=thread"]');
  const warmEditor=()=>{loadEditor().catch(()=>{});};
  edit?.addEventListener('pointerenter',warmEditor,{once:true});
  edit?.addEventListener('focus',warmEditor,{once:true});
  const recommend=ctx.main.querySelector('#recommend');recommend.disabled=false;recommend.onclick=async()=>{
    if(!user){ctx.notify(t("추천하려면 로그인해 주세요."));location.hash='login?return='+encodeURIComponent('#post/'+id);return;}
    recommend.disabled=true;try{const result=await ctx.api('/api/like',{body:{target:'thread',id}});recommend.setAttribute('aria-pressed',String(!!result.liked));recommend.querySelector('b').textContent=result.count;}catch(error){ctx.notify(error.message);}finally{recommend.disabled=false;}
  };
  const reply=ctx.main.querySelector('.reply-form');let replyDraft=null,replyPayload=null,submittedText=null,remoteReply=null,replyKey=crypto.randomUUID(),replySalt=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const replyChallengeController=new AbortController();
  let localId=crypto.randomUUID(),localRevision=0,replyTimer,saveQueue=Promise.resolve(),closed=false,replyTo=null,switching=false,savedDrafts=[];
  const draftScope=ctx.scope,home=ctx.main.querySelector('[data-reply-slot]');
  const preview=document.createElement('p');preview.className='reply-preview';preview.hidden=true;reply?.querySelector('h2').after(preview);
  const cancel=document.createElement('button');cancel.type='button';cancel.className='button';cancel.textContent=t("취소");cancel.hidden=true;reply?.querySelector('.reply-actions').prepend(cancel);
  if(reply)reply.id='inline-reply';
  const replyState=document.createElement('p');replyState.className='small-text';replyState.setAttribute('role','status');replyState.hidden=true;reply?.querySelector('.reply-actions').before(replyState);
  const setReplyBusy=busy=>{
    reply.setAttribute('aria-busy',String(busy));
    for(const control of reply.querySelectorAll('input,textarea,button'))control.disabled=busy;
    reply.querySelector('[type=submit]').disabled=busy||!!remoteReply||!user&&!replyChallenge;
    if(!remoteReply){replyState.hidden=!busy;replyState.textContent=busy?t("댓글 등록 중…"):'';}
  };
  const saveReply=()=>{
    clearTimeout(replyTimer);if(closed||replySubmitted||!reply)return Promise.resolve(true);
    const text=reply.elements.text.value;
    const value={kind:'post',threadId:id,replyTo,title:'',html:text?commentHtml(text):'',nickname:reply.elements.nickname?.value||'',guestKey:replyKey,guestSalt:replySalt,serverId:replyDraft?.id,submissionId:replyPayload?.submissionId||crypto.randomUUID(),submittedText};
    saveQueue=saveQueue.then(async()=>{
      // Check after earlier saves settle: clearing a pending first save must
      // replace that saved text, while an untouched reply needs no draft.
      if(!localRevision&&!text.trim())return true;
      try{const saved=await ctx.drafts.save(draftScope,localId,value,localRevision);localRevision=saved.revision;savedDrafts=[saved,...savedDrafts.filter(draft=>draft.id!==saved.id)];if(!closed)refreshDraftHints();return true;}
      catch(error){if(!closed)errorText(reply,error);return false;}
    });return saveQueue;
  };
  const activeForm=()=>!closed&&ctx.active()&&reply?.isConnected;
  refreshDraftHints=()=>{
    if(!activeForm())return;
    for(const hint of ctx.main.querySelectorAll('[data-reply-draft]'))hint.remove();
    const targets=new Set();
    for(const draft of savedDrafts){
      const target=Number(draft.replyTo)||null;
      if(draft.id===localId||targets.has(target)||!commentTextFromHtml(draft.html).trim())continue;
      targets.add(target);
      const parent=target?commentNodes.get(target):null,host=parent||home;
      const hint=document.createElement('p');hint.className='reply-draft-hint';hint.dataset.replyDraft=draft.id;
      hint.append(t(target?"작성 중인 답글이 있습니다.":"작성 중인 댓글이 있습니다."),' ');
      const unavailable=target&&!parent&&!cursor;
      const resume=document.createElement(unavailable?'a':'button');resume.className='plain-button';resume.textContent=t("이어서 쓰기");
      if(unavailable)resume.href='#write?draft='+encodeURIComponent(draft.id);
      else{resume.type='button';resume.onclick=()=>openReply(target,draft.id);}
      hint.append(resume);if(parent)parent.querySelector('.comment-text').after(hint);else host.prepend(hint);
    }
  };
  function positionReply(target){
    replyTo=target;const parent=target?allRows.get('post:'+target):null;
    (parent?commentNodes.get(target):home).append(reply);
    reply.classList.toggle('inline-answer',!!parent);cancel.hidden=!parent;
    reply.querySelector('h2').textContent=parent?t("{name} 님에게 답글",{name:parent.username}):t("댓글 남기기");
    preview.hidden=!parent;preview.textContent=parent?commentText(parent).slice(0,180):'';
    reply.querySelector('[type=submit]').textContent=t(parent?"답글 등록":"댓글 등록");
    for(const button of list.querySelectorAll('[data-reply]'))button.setAttribute('aria-expanded',String(Number(button.dataset.reply)===target));
  }
  async function openReply(target,draftId){
    if(!activeForm()||replyBusy||switching)return;
    if(target===replyTo&&!draftId){reply.elements.text.focus();return;}
    switching=true;setReplyBusy(true);
    try{
      if(!await saveReply()||!activeForm())return;
      await recoveryReady;if(!activeForm())return;
      const candidate=draftId||savedDrafts.find(draft=>(Number(draft.replyTo)||null)===target&&commentTextFromHtml(draft.html).trim())?.id;
      const saved=candidate?await ctx.drafts.get(draftScope,candidate):null;
      await saveQueue;
      if(!activeForm())return;
      if(candidate&&!saved)throw Error(t("이 계정 또는 기기에서 보관한 초안을 찾을 수 없습니다."));
      while(target&&!commentNodes.has(target)&&cursor){
        const after=cursor,next=await ctx.api('/api/threads/'+id+'?after='+after+'&view=comments');if(!activeForm())return;
        cursor=next.nextPostCursor;append(next.posts);if(cursor&&cursor<=after)break;
      }
      if(target&&!commentNodes.has(target))throw Error(t("답글을 작성할 댓글을 찾을 수 없습니다."));
      clearTimeout(replyTimer);localId=saved?.id||crypto.randomUUID();localRevision=saved?.revision||0;
      replyKey=saved?.guestKey||crypto.randomUUID();replySalt=saved?.guestSalt||Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
      replyDraft=saved?.serverId?{id:saved.serverId}:null;remoteReply=null;replySubmitted=false;
      reply.elements.text.value=saved?commentTextFromHtml(saved.html):'';
      if(reply.elements.nickname){reply.elements.nickname.value=saved?.nickname||'';reply.elements.nickname.readOnly=!!replyDraft;reply.elements.password.value='';}
      submittedText=typeof saved?.submittedText==='string'?saved.submittedText:null;
      replyPayload=saved?{submissionId:saved.submissionId||crypto.randomUUID(),document:commentDocument(submittedText??reply.elements.text.value),...(target?{replyTo:target}:{})}:null;
      reply.querySelector('[role=alert]').textContent='';replyState.replaceChildren();replyState.hidden=true;
      positionReply(target);refreshDraftHints();reply.elements.text.focus();
      if(saved)ctx.notify(t("초안을 불러왔습니다."));
    }catch(error){if(activeForm())errorText(reply,error);}
    finally{switching=false;if(activeForm())setReplyBusy(false);}
  }
  bindReplies=()=>{for(const button of list.querySelectorAll('[data-reply]'))button.onclick=()=>openReply(Number(button.dataset.reply));};
  cancel.onclick=async()=>{const target=replyTo;await openReply(null);if(replyTo===null)list.querySelector(`[data-reply="${target}"]`)?.focus();};
  // Keep an in-progress form attached if its parent was removed in this view.
  // Its reply target stays intact so it can never silently become a root comment.
  detachReply=target=>{if(reply&&replyTo===target){home.append(reply);preview.textContent=t("답글을 작성할 댓글을 찾을 수 없습니다.");}};
  const recoveryReady=reply?(async()=>{
    try{
      const drafts=await ctx.drafts.list(draftScope);if(!activeForm())return;
      const known=new Set(savedDrafts.map(draft=>draft.id));
      savedDrafts.push(...drafts.filter(draft=>draft.kind==='post'&&!draft.targetId&&Number(draft.threadId)===id&&!known.has(draft.id)));
      refreshDraftHints();
    }catch{if(activeForm())ctx.notify(t("저장한 댓글을 불러오지 못했습니다. 임시저장한 글에서 다시 확인해 주세요."));}
  })():Promise.resolve();
  bindReplies();
  if(reply&&params.has('draft'))void recoveryReady.then(()=>{
    const draft=savedDrafts.find(item=>item.id===params.get('draft'));
    if(activeForm()&&draft)return openReply(Number(draft.replyTo)||null,draft.id);
  });
  const completeReply=async result=>{
    // A successful server response stays authoritative even if local cleanup
    // fails. Never let another click publish this comment a second time.
    remoteReply=result;clearTimeout(replyTimer);await saveQueue;
    if(submittedText===reply.elements.text.value){
      if(localRevision){
        try{await ctx.drafts.remove(draftScope,localId,localRevision);localId=crypto.randomUUID();localRevision=0;}
        catch{/* Another tab's draft is preserved by the revision check. */}
      }
      // An already queued input callback can settle during the cleanup.
      if(submittedText===reply.elements.text.value){
        replySubmitted=true;reply.reset();ctx.notify(t("댓글을 등록했습니다."));location.hash='post/'+id+'?reply='+result.id;return;
      }
    }
    const stored=await saveReply();
    replyState.hidden=false;replyState.textContent=stored?t("댓글이 등록되었습니다. 이후 변경한 내용은 이 창과 임시저장에 보관했습니다. 등록된 댓글에서 수정해 주세요."):t("이전 댓글은 등록되었지만 새로 입력한 내용은 기기에 저장하지 못했습니다. 현재 내용을 복사하거나 임시저장을 다시 시도해 주세요.");
    const link=document.createElement('a');link.className='button small';link.href='#post/'+id+'?reply='+result.id;link.textContent=t("게시글 보기");replyState.append(' ',link);
  };
  if(reply)reply.onsubmit=async event=>{
    event.preventDefault();if(replyBusy||switching||remoteReply||!reply.reportValidity())return;
    const inputText=reply.elements.text.value;replyBusy=true;reply.querySelector('[role=alert]').textContent='';setReplyBusy(true);
    try{
      if(!user&&!replyChallenge)throw Error(t("자동 입력 방지 확인을 준비하지 못했습니다."));
      if(replyDraft){
        let state;try{state=await ctx.api('/api/community/drafts/'+replyDraft.id);}catch(error){
          if([403,404,410].includes(error.status)){replyDraft=null;replyPayload=null;submittedText=null;if(!user)reply.elements.nickname.readOnly=false;}
          else if(error.status===401){state=await ctx.api('/api/community/drafts/'+replyDraft.id+'/authorize',{body:user?{}:{proof:await deriveProof(reply.elements.password.value,replyKey,replySalt),turnstileToken:replyChallenge?.token()}});replyChallenge?.reset();}
          else throw error;
        }
        if(state?.published){await completeReply(state.published);return;}
      }
      if(!replyDraft){
        const guest=user?{}:{key:replyKey,salt:replySalt,nickname:reply.elements.nickname.value,proof:await deriveProof(reply.elements.password.value,replyKey,replySalt),turnstileToken:replyChallenge?.token()};
        replyDraft=await ctx.api('/api/community/drafts',{body:{kind:'post',threadId:id,...guest}});replyChallenge?.reset();
        if(!user)reply.elements.nickname.readOnly=true;
      }
      // Resolve a lost response before changing its payload. An open draft can
      // take the user's new text; a published draft must never be posted twice.
      if(submittedText!==inputText){submittedText=inputText;replyPayload={submissionId:crypto.randomUUID(),document:commentDocument(submittedText),...(replyTo?{replyTo}:{})};}
      if(!await saveReply())throw Error(t("댓글 초안을 기기에 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 등록해 주세요."));
      if(inputText!==reply.elements.text.value)throw Error(t("확인 중 본문이 변경되었습니다. 현재 내용을 확인한 뒤 다시 등록해 주세요."));
      const result=await ctx.api('/api/community/drafts/'+replyDraft.id+'/publish',{body:replyPayload});await completeReply(result);
    }catch(error){errorText(reply,error);replyChallenge?.reset();}finally{replyBusy=false;setReplyBusy(false);}
  };
  ctx.unsafeToLeave=()=>replyBusy||switching||!!reply?.elements.text.value.trim();
  ctx.save=saveReply;
  ctx.localeHash=()=>localRevision?'#post/'+id+'?'+new URLSearchParams({draft:localId,...(replyTo?{reply:String(replyTo)}:{})}):location.hash;
  if(reply)reply.addEventListener('input',()=>{clearTimeout(replyTimer);replyTimer=setTimeout(saveReply,650);});
  ctx.beforeLeave=async()=>{
    if(replyBusy||switching){ctx.notify(t("댓글 등록 결과를 확인하고 있습니다."));return false;}
    if(replySubmitted||!reply)return true;
    return await saveReply()||confirmAction(t("댓글 초안을 저장하지 못했습니다. 지금 나가면 작성 중인 댓글을 잃습니다. 나갈까요?"));
  };
  ctx.dispose=()=>{disposed=true;closed=true;closeImages();replyChallengeController.abort();clearTimeout(replyTimer);replyChallenge?.destroy();activeDeletion?.destroy();activeDeletion=null;for(const input of ctx.main.querySelectorAll('input[type=password]'))input.value='';};
  if(reply&&!user){
    setReplyBusy(false);
    void challenge(reply.querySelector('.challenge-host'),ctx.status.guest,{signal:replyChallengeController.signal}).then(ready=>{
      if(closed||!ctx.active()){ready.destroy();return;}replyChallenge=ready;setReplyBusy(replyBusy||switching);
    }).catch(error=>{if(!closed&&ctx.active()&&error.name!=='AbortError')errorText(reply,error);});
  }
  }
  if(ready)activate(ctx.status);
  else void ctx.statusReady.then(activate).catch(()=>{
    if(disposed||!ctx.active()||!list.isConnected)return;
    const host=ctx.main.querySelector('[data-thread-context-error]');host.hidden=false;
    host.innerHTML=`${t("일부 메뉴를 불러오지 못했습니다. 글은 계속 읽을 수 있습니다.")} <button type="button" class="plain-button">${t("다시 시도")}</button>`;
    host.querySelector('button').onclick=()=>location.reload();
  });
  if(focusReply)requestAnimationFrame(()=>ctx.main.querySelector('#reply-'+focusReply)?.scrollIntoView({block:'start'}));
}
