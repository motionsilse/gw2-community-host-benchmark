import DOMPurify from 'dompurify';
import {t} from './i18n.js';
import {esc} from './ui.js';
import {legacyImages} from './legacy-content.js';
import {linkifyContent} from './content-links.js';
import {fontSizeFromCSS} from '../../src/community-font-sizes.js';
import {hasLostImageMarker,LOST_IMAGE_MARKERS} from '../../src/community-content.js';
import '../md.js';

export function cleanHtml(html,{editable=false}={}){
  const safe=DOMPurify.sanitize(html||'',{ALLOWED_TAGS:['p','br','strong','b','em','i','s','span','h2','h3','ul','ol','li','blockquote','a','figure','figcaption','img','table','thead','tbody','tr','th','td','pre','code','hr'],ALLOWED_ATTR:['href','src','alt','width','height','colspan','rowspan','data-media-id','data-width','data-align','data-font-size'],ALLOW_DATA_ATTR:false});
  const template=document.createElement('template');template.innerHTML=safe;
  for(const span of template.content.querySelectorAll('[data-font-size]')){
    if(span.tagName!=='SPAN'||fontSizeFromCSS(span.getAttribute('data-font-size')+'px')===null)span.removeAttribute('data-font-size');
  }
  readImages(template.content,{editable});
  linkifyContent(template.content);
  return template.innerHTML;
}

export function readImages(root,{editable=false}={}){
  let first=true;
  for(const image of root.querySelectorAll('img')){
    const raw=image.getAttribute('src')||'';let url;try{url=new URL(raw,location.origin);}catch{}
    if(url?.origin!==location.origin||!/^\/(media\/[0-9a-f-]{36}|api\/files\/[1-9]\d*)$/.test(url.pathname)){image.replaceWith(document.createTextNode(t("[이미지를 표시할 수 없습니다.]")));continue;}
    image.setAttribute('src',url.pathname);
    // The editor uses src as the persistent image reference.
    if(editable)continue;
    image.setAttribute('loading',first?'eager':'lazy');image.setAttribute('decoding','async');
    const width=Number(image.getAttribute('width')),height=Number(image.getAttribute('height'));
    if(url.pathname.startsWith('/media/')&&width>0&&height>0&&Math.max(width,height)>700){
      image.setAttribute('data-original-src',url.pathname);
      image.setAttribute('src',url.pathname+'?preview=640');
    }
    if(first)image.setAttribute('fetchpriority','high');first=false;
  }
}

export function contentHtml(row,options){
  if(row.body_format==='rich-doc-v1')return cleanHtml(row.body_html,options);
  const markdown=globalThis.MD.toHtml(esc(row.body||''));
  return cleanHtml(legacyImages(markdown),options);
}

export function restoreEditImages(html,originalHtml){
  if(!hasLostImageMarker(html)||!originalHtml)return html;
  const parse=value=>new DOMParser().parseFromString('<html><body>'+value+'</body></html>','text/html');
  const draft=parse(html),original=parse(originalHtml);
  const source=image=>(image.getAttribute('src')||'').split('?')[0];
  const originals=new Map([...original.body.querySelectorAll('img[src^="/media/"]')].map(image=>[source(image),image]));
  const present=new Set([...draft.body.querySelectorAll('img')].map(source));
  const markers=[],walker=draft.createTreeWalker(draft.body);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(node.nodeType===3&&LOST_IMAGE_MARKERS.includes(node.textContent.trim()))markers.push(node);
  }
  for(const node of markers){
    const figure=node.parentElement?.closest('figure[data-media-id]');
    if(!figure||figure.querySelector('img'))continue;
    const src='/media/'+figure.getAttribute('data-media-id');
    const image=originals.get(src);
    if(!image||present.has(src))continue;
    node.replaceWith(image.cloneNode(true));
    present.add(src);
  }
  return draft.body.innerHTML;
}
