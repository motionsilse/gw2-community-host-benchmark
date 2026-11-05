import {t} from './i18n.js';
import {ATTACHMENT_LIMIT,ATTACHMENT_BYTES} from '../../src/community-file-policy.js';
const fields=['title','html','nickname','guestKey','guestSalt','serverId','submissionId','submittedText','kind','targetId','threadId','baseRevision','boardId','replyTo','returnHash','isNotice','baseIsNotice'];
const fileFields=['id','source','url','name','status','error','originalSize','width','height','optimized'];
export function hasDraftContent(value){
  const html=value.html||'';
  return !!(value.title?.trim()||value.files?.length||value.attachments?.length||/<(?:img|table)\b/i.test(html)||html.replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160|#xa0);/gi,' ').trim());
}
function contents(value){
  const result={};for(const key of fields)if(Object.hasOwn(value,key))result[key]=value[key];
  result.files=(value.files||[]).map(file=>{
    const safe={};for(const key of fileFields)if(Object.hasOwn(file,key))safe[key]=file[key];
    if(file.blob instanceof Blob)safe.blob=file.blob;return safe;
  });
  result.attachments=(value.attachments||[]).map(file=>{
    const safe={};for(const key of ['id','name','url','size','status','error'])if(Object.hasOwn(file,key))safe[key]=file[key];
    if(file.blob instanceof Blob)safe.blob=file.blob;return safe;
  });
  if(result.attachments.length>ATTACHMENT_LIMIT||result.attachments.some(file=>(file.blob?.size||file.size||0)>ATTACHMENT_BYTES))throw Error(t('첨부파일은 글당 2개, 파일당 3MB까지 보관할 수 있습니다.'));
  if(result.files.reduce((sum,file)=>sum+(file.blob?.size||0),0)>80*1024*1024)throw Error(t("초안 이미지가 커서 기기에 저장하지 못했습니다. 업로드가 끝날 때까지 이 창을 유지해 주세요."));
  return result;
}
export function openDraftStore(name='gw2-community-drafts-v1'){
  let connection;
  const database=()=>connection??=(new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,1);
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore('drafts',{keyPath:'key'});store.createIndex('scope','scope');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  }));
  const keyOf=(scope,id)=>{
    if(!/^(guest|member:[1-9]\d*)$/.test(scope)||typeof id!=='string'||id.length>80||!id)throw Error(t("초안 식별자가 올바르지 않습니다."));
    return `${scope}:${id}`;
  };
  async function get(scope,id){
    const db=await database();return new Promise((resolve,reject)=>{
      const request=db.transaction('drafts').objectStore('drafts').get(keyOf(scope,id));
      request.onsuccess=()=>resolve(request.result&&!request.result.deleted?request.result:null);request.onerror=()=>reject(request.error);
    });
  }
  async function list(scope){
    keyOf(scope,'listing');const db=await database();return new Promise((resolve,reject)=>{
      const request=db.transaction('drafts').objectStore('drafts').index('scope').getAll(scope);
      request.onsuccess=()=>resolve(request.result.filter(r=>!r.deleted&&hasDraftContent(r)).sort((a,b)=>b.savedAt-a.savedAt));request.onerror=()=>reject(request.error);
    });
  }
  async function change(scope,id,expected,mutate){
    const db=await database(),key=keyOf(scope,id);return new Promise((resolve,reject)=>{
      const transaction=db.transaction('drafts','readwrite'),store=transaction.objectStore('drafts');let result,failure;
      const request=store.get(key);
      request.onsuccess=()=>{
        try{
          const current=request.result;
          if(current?.deleted)throw Error(t("이미 게시하거나 지워서 종료된 초안입니다. 현재 내용은 새 초안으로 보관해 주세요."));
          if((current?.revision||0)!==expected)throw Error(t("다른 창에서 이 초안이 변경되었습니다. 현재 내용을 내려받고 새로 열어 주세요."));
          result={...mutate(current),key,scope,id,revision:expected+1,savedAt:Date.now()};store.put(result);
        }catch(error){failure=error;transaction.abort();}
      };
      transaction.oncomplete=()=>resolve(result);
      transaction.onabort=transaction.onerror=()=>reject(failure||transaction.error||Error(t("초안을 저장하지 못했습니다. 기기 저장 공간을 확인해 주세요.")));
    });
  }
  return {get,list,save:(scope,id,value,expected)=>change(scope,id,expected,()=>contents(value)),remove:(scope,id,expected)=>change(scope,id,expected,()=>({deleted:true}))};
}
