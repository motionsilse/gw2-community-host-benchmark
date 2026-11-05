export const ATTACHMENT_LIMIT=2;
export const ATTACHMENT_BYTES=3*1024*1024;
const executionExtensions=new Set([
  'exe','com','msi','msp','msix','msixbundle','appx','appxbundle','scr','pif','cpl','dll','sys','drv','ocx',
  'bat','cmd','ps1','psm1','vbs','vbe','js','jse','mjs','cjs','wsf','wsh','hta','sh','bash','zsh','py','pyw','pl','rb','php','asp','aspx','jsp',
  'lnk','url','scf','reg','jar','app','dmg','pkg','deb','rpm','apk'
]);
export const blockedAttachment=value=>typeof value==='string'&&value.includes('.')&&executionExtensions.has(value.normalize('NFC').trim().split('.').at(-1).toLowerCase());
export const ATTACHMENT_BLOCKED_MESSAGE='실행·설치 파일, 스크립트, 바로가기는 첨부할 수 없습니다.';
export function attachmentName(value){
  if(typeof value!=='string')return null;
  const name=value.normalize('NFC').trim();
  if(!name||new TextEncoder().encode(name).length>180||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069/\\]/.test(name)||name==='.'||name.endsWith('.')||blockedAttachment(name))return null;
  return name;
}
