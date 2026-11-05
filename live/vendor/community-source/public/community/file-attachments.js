import {t} from './i18n.js';
import {esc} from './ui.js';
import {ATTACHMENT_LIMIT,ATTACHMENT_BYTES,ATTACHMENT_BLOCKED_MESSAGE,attachmentName,blockedAttachment} from '../../src/community-file-policy.js';

const sizeText=bytes=>bytes>=1024*1024?`${(bytes/(1024*1024)).toFixed(1)} MB`:`${Math.max(1,Math.ceil(bytes/1024))} KB`;
export function postAttachments(files=[]){
  const valid=files.filter(file=>typeof file.id==='string'&&/^[0-9a-f-]{36}$/.test(file.id));
  if(!valid.length)return '';
  return `<section class="post-attachments" aria-label="${t('첨부파일')}"><h2>${t('첨부파일')}</h2><ul>${valid.map(file=>`<li><a href="/media/${file.id}" download><span>${esc(file.name)}</span><small>${sizeText(file.size)} · ${t('다운로드')}</small></a></li>`).join('')}</ul></section>`;
}

export function attachmentPicker(host,{files=[],send,onChange,enabled=true,canUpload=true}){
  let closed=false,queue=Promise.resolve();
  const items=files.map(file=>({...file,status:!canUpload&&file.status!=='done'?'error':file.url&&file.status!=='error'&&file.status!=='queued'?'done':file.blob?'queued':'error',error:file.error||t('파일을 다시 선택해 주세요.')}));
  host.innerHTML=`<div class="file-attachment-heading"><strong>${t('첨부파일')}</strong>${canUpload?`<button type="button" class="button small" data-add-attachment>${t('파일 선택')}</button><span data-attachment-count></span>`:''}</div>${canUpload?`<input id="attachment-input" type="file" multiple hidden><p class="small-text">${t('최대 2개 · 파일당 3MB · 이미지 첨부와 별도')}</p>`:`<p class="small-text">${t('일반 파일 첨부는 로그인한 회원만 이용할 수 있습니다.')}</p>`}<ul class="file-attachment-items"></ul><p class="file-attachment-error" role="status"></p>`;
  const input=host.querySelector('input'),button=host.querySelector('[data-add-attachment]'),error=host.querySelector('.file-attachment-error');
  const active=()=>items.filter(file=>file.status!=='removed');
  const snapshots=()=>active().map(({controller,...file})=>file);
  const changed=()=>{if(!closed){render();onChange();}};
  function render(){
    const values=active();if(button)button.disabled=!enabled||values.length>=ATTACHMENT_LIMIT;if(input)input.disabled=!enabled;
    const count=host.querySelector('[data-attachment-count]');if(count)count.textContent=`${values.length} / ${ATTACHMENT_LIMIT}`;
    host.querySelector('ul').innerHTML=values.map(file=>`<li><span class="file-attachment-name">${esc(file.name)}<small>${sizeText(file.size)} · ${esc(file.status==='done'?t('첨부됨'):file.status==='error'?file.error:file.status==='saving'?t('파일 업로드 중…'):t('처리 대기 중'))}</small></span><span class="actions">${canUpload&&enabled&&file.status==='error'&&file.blob?`<button class="button small" type="button" data-retry-attachment="${file.id}">${t('재시도')}</button>`:''}<button class="plain-button" type="button" data-remove-attachment="${file.id}" aria-label="${esc(t('{name} 삭제',{name:file.name}))}">${t('삭제')}</button></span></li>`).join('');
    host.querySelectorAll('[data-remove-attachment]').forEach(button=>{button.onclick=()=>{const file=items.find(file=>file.id===button.dataset.removeAttachment);file.status='removed';file.controller?.abort();file.blob=null;error.textContent='';changed();};});
    host.querySelectorAll('[data-retry-attachment]').forEach(button=>{button.onclick=()=>{schedule(items.find(file=>file.id===button.dataset.retryAttachment));};});
  }
  function schedule(file){
    if(!canUpload||!enabled)return queue;
    file.status='queued';changed();
    queue=queue.then(async()=>{
      if(closed||file.status==='removed')return;
      file.controller=new AbortController();file.status='saving';changed();
      try{
        const result=await send(file,snapshots().map(value=>value.id),file.controller.signal);
        if(closed||file.status==='removed')return;
        Object.assign(file,{url:result.url,name:result.name,size:result.size,status:'done',error:''});
      }catch(failure){if(closed||file.status==='removed')return;file.status='error';file.error=failure.message||t('파일을 첨부하지 못했습니다.');}
      changed();
    });return queue;
  }
  if(button)button.onclick=()=>input.click();
  if(input)input.onchange=()=>{
    const selected=[...input.files];input.value='';error.textContent='';if(closed||!enabled)return;
    try{
      if(active().length+selected.length>ATTACHMENT_LIMIT)throw Error(t('첨부파일은 글당 2개까지 올릴 수 있습니다.'));
      for(const file of selected){
        if(blockedAttachment(file.name))throw Error(t(ATTACHMENT_BLOCKED_MESSAGE));
        if(!attachmentName(file.name))throw Error(t('파일 이름을 확인해 주세요.'));
        if(file.size>ATTACHMENT_BYTES)throw Error(t('첨부파일은 개당 3MB 이하여야 합니다.'));
        if(!file.size)throw Error(t('비어 있는 파일은 첨부할 수 없습니다.'));
      }
      for(const blob of selected){const file={id:crypto.randomUUID(),name:attachmentName(blob.name),size:blob.size,blob,status:'queued'};items.push(file);schedule(file);}
      return queue;
    }catch(failure){error.textContent=failure.message;}
  };
  render();
  return {snapshots,start(){if(canUpload&&enabled)for(const file of items)if(file.status==='queued')schedule(file);},get pending(){return active().some(file=>file.status!=='done');},destroy(){closed=true;for(const file of items)file.controller?.abort();}};
}
