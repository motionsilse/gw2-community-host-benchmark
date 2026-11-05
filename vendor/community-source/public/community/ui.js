import {t,formatLocale} from './i18n.js';
export const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const dateText=(value,{dateOnly=false}={})=>{
  const date=new Date(String(value).includes('T')?value:String(value).replace(' ','T')+'Z');
  return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat(formatLocale,dateOnly?{year:'numeric',month:'2-digit',day:'2-digit'}:{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date);
};
export class ApiError extends Error{constructor(message,status,data){super(message);this.status=status;this.data=data;}}
export async function api(path,{body,raw,method=body||raw?'POST':'GET',signal,headers={},user,preload}={}){
  let options={method,headers:{...(raw?{}:{'content-type':'application/json'}),...headers},...(body?{body:JSON.stringify(body)}:raw?{body:raw}:{})};
  if(body){await import('../member-credential.js');options=await globalThis.MemberCredential.prepare(path.replace(/^\/api/,''),options,user);}
  const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);
  const cancel=()=>preload.controller.abort(requestSignal.reason);
  if(preload){if(requestSignal.aborted)cancel();else requestSignal.addEventListener('abort',cancel,{once:true});}
  try{
    requestSignal.throwIfAborted();
    const response=await (preload?preload.response:fetch(path,{...options,credentials:'same-origin',signal:requestSignal}));
    requestSignal.throwIfAborted();
    let data;try{data=await response.json();}catch(error){if(error.name==='AbortError')throw error;throw new ApiError(t("서버 응답을 읽지 못했습니다. 입력 내용은 그대로 두고 다시 시도해 주세요."),response.status,{});}
    requestSignal.throwIfAborted();
    if(!response.ok)throw new ApiError(t(data.error||"요청을 처리하지 못했습니다."),response.status,data);
    return data;
  }finally{if(preload)requestSignal.removeEventListener('abort',cancel);}
}
export function notify(message){
  const host=document.querySelector('#toast');host.textContent=message;host.hidden=false;
  clearTimeout(notify.timer);notify.timer=setTimeout(()=>{host.hidden=true;},5500);
}
export function errorText(form,error){const host=form.querySelector('[role="alert"]');if(host){host.textContent=t(error.message||String(error));host.focus({preventScroll:true});}}
export function confirmAction(message,{title=t("확인"),accept=t("계속"),danger=false}={}){
  return new Promise(resolve=>{
    const prior=document.activeElement,dialog=document.createElement('dialog');dialog.className='confirm-dialog';dialog.setAttribute('aria-labelledby','confirm-title');
    dialog.innerHTML=`<h2 id="confirm-title">${esc(title)}</h2><p>${esc(message)}</p><div class="actions"><button class="button" data-cancel>${t("취소")}</button><button class="button ${danger?'danger':'primary'}" data-accept>${esc(accept)}</button></div>`;
    let accepted=false;dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.querySelector('[data-accept]').onclick=()=>{accepted=true;dialog.close();};
    dialog.onclose=()=>{dialog.remove();if(prior?.isConnected)prior.focus({preventScroll:true});resolve(accepted);};document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-cancel]').focus();
  });
}
export function downloadText(filename,value,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([value],{type})),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
