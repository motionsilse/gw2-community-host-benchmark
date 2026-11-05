import {t,locale} from './i18n.js';
let loading;
function loadScript(){
  if(globalThis.turnstile)return Promise.resolve();
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');let settled=false;
    const finish=error=>{
      if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;
      if(error){loading=null;script.remove();reject(error);}else resolve();
    };
    const failed=()=>finish(Error(t("자동 입력 방지 도구를 불러오지 못했습니다. 네트워크를 확인해 주세요.")));
    const timer=setTimeout(failed,15000);
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload=()=>globalThis.turnstile?finish():failed();script.onerror=failed;document.head.append(script);
  });
  return loading;
}
function waitForScript(signal){
  if(signal?.aborted)return Promise.reject(new DOMException(t("화면이 닫혔습니다."),'AbortError'));
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new DOMException(t("화면이 닫혔습니다."),'AbortError'));
    signal?.addEventListener('abort',abort,{once:true});
    loadScript().then(resolve,reject).finally(()=>signal?.removeEventListener('abort',abort));
  });
}
export async function challenge(host,settings,{signal}={}){
  if(settings.localTest)return {token:()=>undefined,reset:()=>{},destroy:()=>{}};
  if(!settings.turnstileSiteKey)throw Error(t("자동 입력 방지 설정을 준비 중입니다. 비회원 글쓰기를 잠시 이용할 수 없습니다."));
  await waitForScript(signal);if(signal?.aborted||!host.isConnected)throw new DOMException(t("화면이 닫혔습니다."),'AbortError');
  const widget=globalThis.turnstile.render(host,{sitekey:settings.turnstileSiteKey,action:'guest_write',language:locale,size:host.clientWidth<300?'compact':'normal'});
  return {token:()=>{const value=globalThis.turnstile.getResponse(widget);if(!value)throw Error(t("자동 입력 방지 확인을 완료해 주세요."));return value;},reset:()=>globalThis.turnstile.reset(widget),destroy:()=>globalThis.turnstile.remove(widget)};
}
