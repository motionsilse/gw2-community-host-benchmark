import {t,locale} from './i18n.js';
import {esc,errorText,notify} from './ui.js';
import {contentHtml} from './content-ui.js';

const field=(name,label,{type='text',min,max=128,autocomplete='',hint='',required=true}={})=>`<label class="field">${label}<input name="${name}" type="${type}" ${required?'required':''} ${min?`minlength="${min}"`:''} maxlength="${max}" autocomplete="${autocomplete}" ${type==='email'?'inputmode="email"':''}>${hint?`<small>${hint}</small>`:''}</label>`;
const password=(name='password',label=t("비밀번호"),fresh=false)=>field(name,label,{type:'password',min:fresh?8:undefined,autocomplete:fresh?'new-password':'current-password',hint:fresh?t("8자 이상 입력해 주세요."):''});
const username=()=>field('username',t("아이디"),{min:3,max:24,autocomplete:'username'});
const email=()=>field('email',t("이메일"),{type:'email',max:254,autocomplete:'email'});
const alert='<p role="alert" tabindex="-1"></p>';
const returnHash=params=>/^#(?:list(?:\?|$)|post\/\d+(?:\?|$)|write(?:\?|$)|drafts$|trash(?:\?|$)|account$|admin(?:\/|$))/.test(params.get('return')||'')?params.get('return'):'#list';
function shell(title,description,body,links=''){
  return `<section class="account-page"><div class="breadcrumb"><a href="#list">${t("커뮤니티")}</a></div><h1>${title}</h1><p>${description}</p>${body}${links?`<nav class="account-links">${links}</nav>`:''}</section>`;
}
function bind(ctx,submit){
  const form=ctx.main.querySelector('form');
  form.onsubmit=async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>{button.disabled=true;});form.querySelector('[role=alert]').textContent='';
    try{await submit(Object.fromEntries(new FormData(form)),form);}catch(error){if(ctx.active())errorText(form,error);}
    finally{if(form.isConnected)buttons.forEach(button=>{button.disabled=false;});}
  };
  ctx.dispose=()=>{for(const input of form.querySelectorAll('input[type=password]'))input.value='';};
  return form;
}
export async function accountPage(ctx,page,params){
  const verificationRequired=ctx.status.emailVerificationRequired===true;
  if(page==='terms'){
    const terms=await ctx.api('/api/terms'+(locale==='en'?'?lang=en':''));if(!ctx.active())return;
    ctx.setPage(`<section class="information-page"><div class="breadcrumb"><a href="#list">${t("커뮤니티")}</a></div><h1>${t("이용 안내")}</h1><div class="prose guidelines-copy">${contentHtml({body:terms.text})}</div>${ctx.status.user&&!terms.agreed?`<form class="account-form">${alert}<button class="button primary" type="submit">${t("안내에 동의하고 계속")}</button></form>`:''}</section>`);
    if(ctx.main.querySelector('form'))bind(ctx,async()=>{await ctx.api('/api/terms/agree',{body:{version:terms.version}});notify(t("이용 안내에 동의했습니다."));location.hash=returnHash(params);});return;
  }
  if(page==='account'){
    if(!ctx.status.user){location.hash='login?return=%23account';return;}
    const user=ctx.status.user;
    ctx.setPage(shell(t("계정 설정"),esc(t("{name} 님의 계정입니다.",{name:user.username})),
      `<div class="account-links"><a href="#drafts">${t("내 임시저장")}</a>${user.role==='admin'?`<a href="#admin/trash">${t("휴지통")}</a>`:''}<a href="#terms">${t("이용 안내")}</a>${user.role==='admin'?`<a href="#admin">${t("관리자 화면")}</a>`:''}</div><h2 style="margin-top:30px">${t("비밀번호 변경")}</h2><form class="account-form">${password('password',t("현재 비밀번호"))}${password('newPassword',t("새 비밀번호"),true)}${user.totp_enabled?field('code',t("2단계 인증 코드"),{max:6,autocomplete:'one-time-code'}):''}${alert}<button class="button primary" type="submit">${t("비밀번호 변경")}</button></form>`));
    bind(ctx,async(body,form)=>{await ctx.api('/api/account/password',{body,user});form.reset();notify(t("비밀번호를 변경했습니다. 다른 기기는 다시 로그인해야 합니다."));});return;
  }
  if(page==='verify'){
    ctx.setPage(shell(t("이메일 인증"),t("버튼을 누르면 가입한 이메일 인증을 완료합니다."),`<form class="account-form">${alert}<button class="button primary" type="submit">${t("이메일 인증 완료하기")}</button></form>`,`<a href="#resend">${t("인증 메일 다시 받기")}</a>`));
    bind(ctx,async()=>{await ctx.api('/api/member/verify',{body:{token:params.get('token')}});history.replaceState(null,'',location.pathname+location.search+'#login');notify(t("이메일 인증이 완료되었습니다. 로그인해 주세요."));window.dispatchEvent(new HashChangeEvent('hashchange'));});return;
  }
  if(page==='reset'){
    ctx.setPage(shell(t("비밀번호 재설정"),t("새 비밀번호를 설정하면 모든 기기에서 다시 로그인해야 합니다."),`<form class="account-form">${password('newPassword',t("새 비밀번호"),true)}${alert}<button class="button primary" type="submit">${t("새 비밀번호 저장")}</button></form>`,`<a href="#forgot">${t("복구 메일 다시 받기")}</a>`));
    bind(ctx,async(body,form)=>{await ctx.api('/api/member/reset',{body:{token:params.get('token'),newPassword:body.newPassword}});form.reset();history.replaceState(null,'',location.pathname+location.search+'#login');notify(t("새 비밀번호를 저장했습니다. 로그인해 주세요."));window.dispatchEvent(new HashChangeEvent('hashchange'));});return;
  }
  if(page==='forgot'||page==='resend'){
    const resend=page==='resend';
    if(resend&&!verificationRequired){ctx.setPage(shell(t("이메일 인증"),t("이메일 인증 없이 로그인하여 이용할 수 있습니다."),`<a class="button primary" href="#login">${t("로그인으로")}</a>`));return;}
    ctx.setPage(shell(resend?t("인증 메일 다시 받기"):t("비밀번호 찾기"),t("가입할 때 입력한 아이디와 이메일을 적어 주세요."),`<form class="account-form">${username()}${email()}${alert}<p class="success-message" role="status"></p><button class="button primary" type="submit">${resend?t("인증 메일 받기"):t("복구 메일 받기")}</button></form>`,`<a href="#login">${t("로그인으로")}</a>`));
    bind(ctx,async(body,form)=>{const data=await ctx.api('/api/member/'+(resend?'resend':'forgot'),{body});form.querySelector('[role=status]').textContent=t("입력한 정보가 일치하면 메일을 보냈습니다. 받은편지함과 스팸함을 확인해 주세요.");});return;
  }
  if(page==='register'){
    if(ctx.status.communityPaused){ctx.setPage(shell(t("회원가입"),t("회원가입이 일시 중단되어 있습니다."),`<a class="button" href="#list">${t("커뮤니티로")}</a>`));return;}
    const terms=await ctx.api('/api/terms'+(locale==='en'?'?lang=en':''));if(!ctx.active())return;
    ctx.setPage(shell(t("회원가입"),verificationRequired?t("아이디·비밀번호·이메일로 가입합니다. 이메일 인증 후 이용할 수 있습니다."):t("아이디·비밀번호·이메일로 가입하면 바로 로그인할 수 있습니다. 이메일은 비밀번호 찾기에 사용합니다."),`<form class="account-form">${username()}${password('password',t("비밀번호"),true)}${email()}<details><summary class="small-text">${t("이용 안내 보기")}</summary><div class="terms-inline prose">${contentHtml({body:terms.text})}</div></details><label class="check-field"><input type="checkbox" name="agreed" required><span>${t("이용 안내를 확인하고 동의합니다.")}</span></label>${alert}<button class="button primary" type="submit">${verificationRequired?t("가입하고 인증 메일 받기"):t("회원가입")}</button></form>`,`<a href="#login">${t("이미 가입했다면 로그인")}</a>`));
    bind(ctx,async(body,form)=>{
      if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(body.username))throw Error(t("아이디는 한글·영문·숫자·밑줄·하이픈으로 3~24자 입력해 주세요."));
      const result=await ctx.api('/api/register',{body:{username:body.username,password:body.password,email:body.email,terms_version:terms.version}});form.reset();
      if(!ctx.active())return;
      if(!result.verificationRequired){
        ctx.setPage(shell(t("회원가입이 완료되었습니다"),t("가입한 아이디와 비밀번호로 바로 로그인해 주세요."),`<a class="button primary" href="#login">${t("로그인으로")}</a>`));
      }else if(result.mailSent===false){
        ctx.setPage(shell(t("회원가입이 완료되었습니다"),t("메일을 보내지 못했습니다. 잠시 후 인증 메일을 다시 요청해 주세요."),`<a class="button primary" href="#resend">${t("인증 메일 다시 받기")}</a>`,`<a href="#login">${t("로그인으로")}</a>`));
      }else ctx.setPage(shell(t("인증 메일을 확인해 주세요"),t("메일의 인증 링크를 연 다음 로그인하면 이용할 수 있습니다. 받은편지함과 스팸함을 확인해 주세요."),`<a class="button primary" href="#login">${t("로그인으로")}</a>`,`<a href="#resend">${t("인증 메일 다시 받기")}</a>`));
    });return;
  }
  if(page==='setup'){
    if(!ctx.status.setupNeeded){location.hash='login';return;}
    ctx.setPage(shell(t("관리자 최초 설정"),t("최초 관리자 계정을 한 번만 만듭니다."),`<form class="account-form">${field('setupToken',t("최초 설정 키"),{type:'password',autocomplete:'off'})}${username()}${password('password',t("관리자 비밀번호"),true)}${alert}<button class="button primary" type="submit">${t("관리자 만들기")}</button></form>`));
    bind(ctx,async(body,form)=>{await ctx.api('/api/setup',{body:{username:body.username,password:body.password},headers:{'x-setup-token':body.setupToken}});form.reset();notify(t("관리자 계정을 만들었습니다. 로그인해 주세요."));location.hash='login';});return;
  }
  const next=returnHash(params);
  ctx.setPage(shell(t("로그인"),t("가입한 아이디로 로그인하세요."),`<form class="account-form">${username()}${password()}<div class="two-factor" hidden>${field('code',t("2단계 인증 코드"),{max:6,autocomplete:'one-time-code',required:false})}</div>${alert}<button class="button primary" type="submit">${t("로그인")}</button></form>`,`<a href="#register">${t("회원가입")}</a><a href="#forgot">${t("비밀번호 찾기")}</a>${verificationRequired?`<a href="#resend">${t("이메일 인증")}</a>`:''}${ctx.status.setupNeeded?`<a href="#setup">${t("관리자 최초 설정")}</a>`:''}`));
  let pending=null;
  bind(ctx,async(body,form)=>{
    const data=await ctx.api(pending?'/api/2fa/verify':'/api/login',{body:pending?{pending,code:body.code}:{username:body.username,password:body.password}});
    if(data.need2fa){pending=data.pending;form.querySelector('.two-factor').hidden=false;form.elements.code.required=true;form.elements.code.focus();form.elements.password.value='';form.elements.password.required=false;return;}
    pending=null;form.reset();notify(t("로그인했습니다."));location.hash=next;
  });
}
