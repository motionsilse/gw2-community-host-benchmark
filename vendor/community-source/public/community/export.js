import {t,locale} from './i18n.js';
import DOMPurify from 'dompurify';
import {esc,downloadText} from './ui.js';
import {FONT_SIZES,fontSizeFromCSS} from '../../src/community-font-sizes.js';
import {ATTACHMENT_LIMIT,ATTACHMENT_BYTES,attachmentName} from '../../src/community-file-policy.js';
const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error(t("이미지를 내려받을 파일에 담지 못했습니다.")));reader.readAsDataURL(blob);});

export async function exportDraft({title,html,files=[],attachments=[]},{includeImages=true}={}){
  const template=document.createElement('template');template.innerHTML=html;
  for(const node of template.content.querySelectorAll('*')){
    const size=node.tagName==='SPAN'?(fontSizeFromCSS(node.style.fontSize)??fontSizeFromCSS(node.getAttribute('data-font-size')+'px')):null;
    if(size!==null)node.setAttribute('data-font-size',String(size));else node.removeAttribute('data-font-size');
  }
  template.innerHTML=DOMPurify.sanitize(template.innerHTML,{ALLOWED_TAGS:['p','br','strong','b','em','i','s','span','h2','h3','ul','ol','li','blockquote','a','figure','figcaption','img','table','thead','tbody','tr','th','td','pre','code','hr'],ALLOWED_ATTR:['href','src','alt','colspan','rowspan','data-font-size'],ALLOW_DATA_ATTR:false});
  let bytes=0;
  for(const image of template.content.querySelectorAll('img')){
    if(!includeImages){image.replaceWith(document.createTextNode(t("[이미지 제외")+(image.alt?': '+image.alt:'')+']'));continue;}
    const source=image.getAttribute('src'),file=files.find(file=>file.source===source||file.url===source);let blob=file?.blob;
    if(!blob){
      const url=new URL(source,location.origin);
      if(url.origin!==location.origin||!/^\/(media\/[0-9a-f-]{36}|api\/files\/[1-9]\d*)$/.test(url.pathname))throw Error(t("보관되지 않은 이미지가 있습니다. 이미지를 다시 첨부한 뒤 내려받아 주세요."));
      const response=await fetch(url.pathname,{credentials:'same-origin',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error(t("이미지를 내려받지 못했습니다. 본문은 그대로 있습니다. 연결을 확인한 뒤 다시 시도해 주세요."));
      if(Number(response.headers.get('content-length'))>20*1024**2)throw Error(t("내려받을 이미지가 너무 큽니다."));
      blob=await response.blob();
    }
    bytes+=blob.size;if(bytes>80*1024**2||!['image/png','image/jpeg','image/webp'].includes(blob.type))throw Error(t("이미지 형식 또는 전체 용량을 확인해 주세요."));
    image.src=await dataURL(blob);
  }
  let attached='';
  if(includeImages&&attachments.length){
    if(attachments.length>ATTACHMENT_LIMIT)throw Error(t('첨부파일은 글당 2개까지 올릴 수 있습니다.'));
    const links=[];
    for(const file of attachments){
      if(!attachmentName(file.name))throw Error(t('파일을 다시 선택해 주세요.'));
      let blob=file.blob;
      if(!blob){
        if(!/^\/media\/[0-9a-f-]{36}$/.test(file.url||''))throw Error(t('파일을 다시 선택해 주세요.'));
        const response=await fetch(file.url,{credentials:'same-origin',signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw Error(t('첨부파일을 내려받지 못했습니다. 초안은 그대로 보관됩니다.'));
        if(Number(response.headers.get('content-length'))>ATTACHMENT_BYTES)throw Error(t('첨부파일은 개당 3MB 이하여야 합니다.'));
        blob=await response.blob();
      }
      if(!blob.size||blob.size>ATTACHMENT_BYTES)throw Error(t('첨부파일은 개당 3MB 이하여야 합니다.'));
      const href=await dataURL(new Blob([blob],{type:'application/octet-stream'}));
      links.push(`<li><a href="${href}" download="${esc(file.name)}">${esc(file.name)}</a></li>`);
    }
    attached=`<h2>${t('첨부파일')}</h2><ul>${links.join('')}</ul>`;
  }
  const fontStyles=FONT_SIZES.map(size=>`[data-font-size="${size}"]{font-size:${size}px}`).join('');
  const output=`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(title||t("커뮤니티 초안"))}</title><style>body{max-width:900px;margin:40px auto;padding:0 24px;font:16px/1.8 sans-serif;color:#24382c;overflow-wrap:anywhere}img,table{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px}blockquote{border-left:3px solid #70885b;padding-left:20px}pre{white-space:pre-wrap}${fontStyles}</style><h1>${esc(title||t("커뮤니티 초안"))}</h1>${template.innerHTML}${attached}</html>`;
  downloadText(includeImages?t("커뮤니티-초안.html"):t("커뮤니티-초안-본문.html"),output,'text/html;charset=utf-8');
}
