import {POST_IMAGE_LIMIT,ADMIN_POST_IMAGE_LIMIT} from './community-image-limits.js';
import {FONT_SIZES} from './community-font-sizes.js';
// The only rich-content persistence format. No editor HTML reaches storage.
export const CONTENT_LIMITS=Object.freeze({request:192*1024,document:128*1024,nodes:2000,depth:16,cells:400,images:20});
const encoder=new TextEncoder();
export class ContentError extends Error {
  constructor(message,status=400){super(message);this.name='ContentError';this.status=status;}
}
const ensure=(condition,message,status=400)=>{if(!condition)throw new ContentError(message,status);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>{
  ensure(plain(value),'문서 구조가 올바르지 않습니다.');
  ensure(Object.keys(value).every(key=>keys.includes(key)),'지원하지 않는 문서 속성입니다.');
};
export const escapeContent=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function safeContentLink(href){
  ensure(typeof href==='string'&&href.length>0&&href.length<=2048&&!/[\u0000-\u0020\u007f\\]/.test(href),'링크 주소를 확인해 주세요.');
  ensure(!href.startsWith('//'),'링크 주소를 확인해 주세요.');
  let url;try{url=new URL(href,'https://community.invalid');}catch{throw new ContentError('링크 주소를 확인해 주세요.');}
  ensure(['https:','http:','mailto:'].includes(url.protocol)&&!url.username&&!url.password,'허용하지 않는 링크입니다.');
  ensure(href.startsWith('/')||href.startsWith('#')||/^(https?:|mailto:)/i.test(href),'링크는 전체 주소를 입력해 주세요.');
  return href;
}
export const isMediaId=id=>typeof id==='string'&&(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)||/^legacy:[1-9]\d{0,14}$/.test(id));
export const LOST_IMAGE_MARKERS=Object.freeze(['[[보관되지 않은 이미지입니다. 다시 첨부해 주세요.]]','[[This image was not saved. Please attach it again.]]']);
export const hasLostImageMarker=value=>LOST_IMAGE_MARKERS.some(marker=>value.includes(marker));
export const LOST_IMAGE_EDIT_MESSAGE='이미지가 빠진 상태여서 수정 내용을 저장하지 않았습니다. 페이지를 새로고침한 뒤 임시저장한 글을 다시 열어 주세요.';
const inline=new Set(['text','strong','em','s','a','br','span']);
const blocks=new Set(['p','h2','h3','blockquote','ul','ol','table','image']);

/** Metadata must already be authorized for this author and target by the caller. */
export function renderDocument(document,{media=new Map(),maxImages=POST_IMAGE_LIMIT,allowEmpty=false}={}){
  let serialized;try{serialized=JSON.stringify(document);}catch{throw new ContentError('문서 구조가 올바르지 않습니다.');}
  ensure(typeof serialized==='string'&&encoder.encode(serialized).byteLength<=CONTENT_LIMITS.document,'문서 용량은 128KB 이하여야 합니다.',413);
  exact(document,['version','blocks']);ensure(document.version===1,'지원하지 않는 문서 버전입니다.');
  let nodes=0,cells=0,images=0;const mediaIds=new Set();let hasText=false;
  const children=(items,allowed,depth,inLink=false)=>{
    ensure(Array.isArray(items),'문서 구조가 올바르지 않습니다.');
    const rendered=items.map(node=>visit(node,allowed,depth,inLink));
    return {html:rendered.map(r=>r.html).join(''),text:rendered.map(r=>r.text).join('')};
  };
  function visit(node,allowed,depth,inLink){
    ensure(depth<=CONTENT_LIMITS.depth,'문서의 중첩 깊이가 너무 큽니다.',413);
    ensure(++nodes<=CONTENT_LIMITS.nodes,'문서 노드가 너무 많습니다.',413);
    ensure(plain(node)&&typeof node.type==='string'&&allowed.has(node.type),'지원하지 않는 문서 서식이나 구조입니다.');
    const type=node.type;
    if(type==='text'){
      exact(node,['type','text']);ensure(typeof node.text==='string','문서 텍스트가 올바르지 않습니다.');
      ensure(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(node.text),'문서에 허용되지 않는 제어 문자가 있습니다.');
      hasText ||= !!node.text.trim();return {html:escapeContent(node.text),text:node.text};
    }
    if(type==='br'){exact(node,['type']);return {html:'<br>',text:'\n'};}
    if(type==='image'){
      exact(node,['type','id','alt','caption','width','align']);
      ensure(isMediaId(node.id),'이미지 식별자가 올바르지 않습니다.');
      ensure(++images<=Math.min(ADMIN_POST_IMAGE_LIMIT,maxImages),'이미지가 너무 많습니다.',413);
      ensure(typeof node.alt==='string'&&node.alt.length<=500&&['undefined','string'].includes(typeof node.caption)&&(node.caption?.length??0)<=1000,'이미지 설명을 확인해 주세요.');
      ensure([50,75,100].includes(node.width)&&['left','center','right'].includes(node.align),'이미지 배치를 확인해 주세요.');
      const metadata=media.get(node.id);
      const maxDimension=node.id.startsWith('legacy:')?65535:2560;
      ensure(metadata&&[metadata.width,metadata.height].every(n=>Number.isInteger(n)&&n>0&&n<=maxDimension),'사용할 수 없는 이미지입니다.',403);
      mediaIds.add(node.id);
      const src=node.id.startsWith('legacy:')?`/api/files/${node.id.slice(7)}`:`/media/${node.id}`;
      const caption=node.caption?`<figcaption>${escapeContent(node.caption)}</figcaption>`:'';
      return {html:`<figure data-media-id="${node.id}" data-width="${node.width}" data-align="${node.align}"><img src="${src}" alt="${escapeContent(node.alt)}" width="${metadata.width}" height="${metadata.height}" loading="lazy" decoding="async">${caption}</figure>`,text:`${node.alt}${node.caption?' '+node.caption:''}\n`};
    }
    const cell=type==='td'||type==='th';
    exact(node,type==='a'?['type','href','children']:type==='span'?['type','size','children']:cell?['type','children','colspan','rowspan']:['type','children']);
    if(type==='span')ensure(FONT_SIZES.includes(node.size),'지원하지 않는 글자 크기입니다.');
    if(type==='a')ensure(!inLink,'문서에 링크를 중첩할 수 없습니다.');
    if(cell){
      const spans=[node.colspan??1,node.rowspan??1];ensure(spans.every(n=>Number.isInteger(n)&&n>=1&&n<=20),'표의 합쳐진 셀 크기를 확인해 주세요.');
      cells+=spans[0]*spans[1];ensure(cells<=CONTENT_LIMITS.cells,'표는 400칸 이하여야 합니다.',413);
    }
    const allowedChildren=(type==='ul'||type==='ol')?new Set(['li']):type==='table'?new Set(['tr']):type==='tr'?new Set(['td','th']):['blockquote','li','td','th'].includes(type)?blocks:inline;
    const result=children(node.children,allowedChildren,depth+1,inLink||type==='a');
    if(['ul','ol','table','tr','li','td','th'].includes(type))ensure(node.children.length>0,'빈 표나 목록 구조는 저장할 수 없습니다.');
    const attrs=type==='a'?` href="${escapeContent(safeContentLink(node.href))}" rel="nofollow ugc noopener noreferrer"`:type==='span'?` data-font-size="${node.size}"`:cell?`${node.colspan?` colspan="${node.colspan}"`:''}${node.rowspan?` rowspan="${node.rowspan}"`:''}`:'';
    return {html:`<${type}${attrs}>${type==='table'?'<tbody>':''}${result.html}${type==='table'?'</tbody>':''}</${type}>`,text:result.text+(inline.has(type)?'':'\n')};
  }
  const result=children(document.blocks,blocks,1);
  ensure(hasText||images>0||allowEmpty,'글 내용을 입력해 주세요.');
  return {format:'rich-doc-v1',document:JSON.parse(serialized),json:serialized,html:result.html,text:result.text.trim(),mediaIds:[...mediaIds],imageCount:images};
}

// Collecting references still validates the entire document, before any DB query.
export function contentMediaIds(document,{maxImages=CONTENT_LIMITS.images,allowEmpty=false}={}){
  const placeholders={get:()=>({width:1,height:1})};
  return renderDocument(document,{media:placeholders,maxImages,allowEmpty}).mediaIds;
}

export function renderCommentDocument(document){
  ensure(plain(document)&&Array.isArray(document.blocks)&&document.blocks.every(block=>
    plain(block)&&block.type==='p'&&Array.isArray(block.children)&&block.children.every(node=>
      plain(node)&&(node.type==='text'||node.type==='br'))),
    '댓글에는 텍스트만 입력할 수 있습니다. 이미지와 서식은 사용할 수 없습니다.');
  const content=renderDocument(document,{maxImages:0});
  const text=document.blocks.map(block=>block.children.map(node=>node.type==='br'?'\n':node.text).join('')).join('\n');
  ensure(text.length<=10000,'댓글은 10,000자 이내로 입력해 주세요.',413);
  return content;
}

export async function readContentBody(request){
  const declared=request.headers.get('content-length');
  ensure(!declared||/^\d+$/.test(declared)&&Number(declared)<=CONTENT_LIMITS.request,'요청 용량이 너무 큽니다.',413);
  ensure(request.body,'요청 본문이 필요합니다.');
  const reader=request.body.getReader(),chunks=[];let length=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>CONTENT_LIMITS.request){await reader.cancel();throw new ContentError('요청 용량은 192KB 이하여야 합니다.',413);}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ContentError('요청 내용을 읽지 못했습니다.');}
  ensure(plain(value),'요청 형식이 올바르지 않습니다.');return value;
}
