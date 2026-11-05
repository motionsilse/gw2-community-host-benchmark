import {t} from './i18n.js';
import {CONTENT_LIMITS,ContentError,isMediaId,renderDocument,safeContentLink} from '../../src/community-content.js';
import {fontSizeFromCSS} from '../../src/community-font-sizes.js';

const blockTags=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','UL','OL','TABLE','FIGURE','PRE','HR']);
const dropped=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','TEXTAREA','BUTTON','NOSCRIPT','LINK','META']);
const text=value=>({type:'text',text:value});
const p=children=>({type:'p',children:children.length?children:[{type:'br'}]});

export function htmlToDocument(html,{origin=globalThis.location?.origin||'https://community.invalid',allowEmpty=false}={}){
  if(typeof html!=='string'||new TextEncoder().encode(html).length>768*1024)throw new ContentError(t("본문 용량이 너무 큽니다."),413);
  const parsed=new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`,'text/html');
  const warnings=new Set();let visited=0;
  const warn=()=>warnings.add(t("글자색·밑줄·문단 정렬 등 지원하지 않는 일부 서식은 기본 서식으로 저장됩니다."));
  function checkStyle(node){
    for(const property of Array.from(node.style||[])){
      const value=node.style.getPropertyValue(property).trim().toLowerCase();
      const supported=node.tagName==='SPAN'&&(
        property==='font-weight'&&/^(bold|[6-9]00)$/.test(value)||
        property==='font-style'&&value==='italic'||
        property==='text-decoration'&&value==='line-through'||
        property==='font-size'&&fontSizeFromCSS(value)!==null
      );
      if(!supported){warn();break;}
    }
    if(['align','valign','bgcolor','border','cellspacing','cellpadding'].some(name=>node.hasAttribute(name)))warn();
  }
  const count=()=>{if(++visited>CONTENT_LIMITS.nodes*3)throw new ContentError(t("본문 요소가 너무 많습니다."),413);};
  function image(node,figure){
    let url;try{url=new URL(node.getAttribute('src')||'',origin);}catch{}
    let id=null;
    if(url?.origin===origin&&!url.search&&!url.hash){
      if(url.pathname.startsWith('/media/'))id=url.pathname.slice(7);
      if(/^\/api\/files\/[1-9]\d*$/.test(url.pathname))id='legacy:'+url.pathname.split('/').at(-1);
    }
    if(!id||!isMediaId(id))throw new ContentError(t("이미지 업로드가 끝나지 않았거나 외부 이미지입니다. 첨부 상태를 확인해 주세요."));
    const rawWidth=Number(figure?.getAttribute('data-width')||100),rawAlign=figure?.getAttribute('data-align')||'center';
    const caption=figure?.querySelector('figcaption')?.textContent||'';
    return {type:'image',id,alt:node.getAttribute('alt')||'',...(caption?{caption}:{}),width:[50,75,100].includes(rawWidth)?rawWidth:100,align:['left','center','right'].includes(rawAlign)?rawAlign:'center'};
  }
  function wrap(items,type,extra={}){
    const result=[];let group=[];
    const flush=()=>{if(group.length){result.push({type,...extra,children:group});group=[];}};
    for(const item of items){if(item.type==='image'){flush();result.push(item);}else group.push(item);}flush();return result;
  }
  function inline(nodes,depth=0){
    if(depth>CONTENT_LIMITS.depth)throw new ContentError(t("본문의 중첩 깊이가 너무 큽니다."),413);
    const result=[];
    for(const node of nodes){
      count();if(node.nodeType===3){if(node.textContent)result.push(text(node.textContent));continue;}
      if(node.nodeType!==1)continue;
      const tag=node.tagName;
      checkStyle(node);
      if(dropped.has(tag)){warn();continue;}
      if(tag==='IMG'){result.push(image(node));continue;}
      if(tag==='BR'){result.push({type:'br'});continue;}
      const children=inline(node.childNodes,depth+1);
      const type={STRONG:'strong',B:'strong',EM:'em',I:'em',S:'s',STRIKE:'s',DEL:'s'}[tag];
      if(type)result.push(...wrap(children,type));
      else if(tag==='A'){
        let href;try{href=safeContentLink(node.getAttribute('href'));}catch{warn();}
        result.push(...(href?wrap(children,'a',{href}):children));
      }else if(tag==='SPAN'){
        let styled=children;
        if(/^(bold|[6-9]00)$/.test(node.style.fontWeight||''))styled=wrap(styled,'strong');
        if(node.style.fontStyle==='italic')styled=wrap(styled,'em');
        if((node.style.textDecoration||'').includes('line-through'))styled=wrap(styled,'s');
        const size=fontSizeFromCSS(node.style.fontSize)??fontSizeFromCSS(node.getAttribute('data-font-size')+'px');
        if(size!==null)styled=wrap(styled,'span',{size});
        result.push(...styled);
      }else{if(!['DIV','P'].includes(tag))warn();result.push(...children);}
    }
    return result;
  }
  function paragraphParts(items,type='p'){
    const parts=wrap(items,type);return parts.length?parts:[{type,children:[{type:'br'}]}];
  }
  function blocks(nodes,depth=0){
    if(depth>CONTENT_LIMITS.depth)throw new ContentError(t("본문의 중첩 깊이가 너무 큽니다."),413);
    const result=[];let loose=[];
    const flush=()=>{if(loose.some(n=>n.type!=='text'||n.text.trim()))result.push(...paragraphParts(loose));loose=[];};
    for(const node of nodes){
      if(node.nodeType!==1||!blockTags.has(node.tagName)){loose.push(...inline([node],depth));continue;}
      flush();count();const tag=node.tagName;checkStyle(node);
      if(tag==='FIGURE'&&node.querySelectorAll('img').length===1){
        const media=image(node.querySelector('img'),node),parts=blocks([...node.childNodes].filter(child=>child.tagName!=='FIGCAPTION'),depth+1);
        const layout=items=>items.map(item=>item.type==='image'?media:item.children?{...item,children:layout(item.children)}:item);
        result.push(...layout(parts));continue;
      }
      if(tag==='TABLE'){
        const rows=[...node.querySelectorAll('tr')].filter(row=>row.closest('table')===node).map(row=>{checkStyle(row);return {type:'tr',children:[...row.children].filter(cell=>['TD','TH'].includes(cell.tagName)).map(cell=>{
          checkStyle(cell);
          const children=blocks(cell.childNodes,depth+2),colspan=Number(cell.getAttribute('colspan')||1),rowspan=Number(cell.getAttribute('rowspan')||1);
          return {type:cell.tagName.toLowerCase(),children:children.length?children:[p([])],...(colspan!==1?{colspan}:{}),...(rowspan!==1?{rowspan}:{})};
        })};});
        result.push({type:'table',children:rows});continue;
      }
      if(tag==='UL'||tag==='OL'){
        result.push({type:tag.toLowerCase(),children:[...node.children].filter(n=>n.tagName==='LI').map(li=>{const children=blocks(li.childNodes,depth+2);return {type:'li',children:children.length?children:[p([])]};})});continue;
      }
      if(tag==='BLOCKQUOTE'){result.push({type:'blockquote',children:blocks(node.childNodes,depth+1)});continue;}
      if(tag==='PRE'){warn();const lines=node.textContent.split('\n'),children=[];lines.forEach((line,i)=>{if(i)children.push({type:'br'});children.push(text(line));});result.push(p(children));continue;}
      if(tag==='HR'){warn();result.push(p([text('―')]));continue;}
      if(tag==='DIV'||tag==='FIGURE'){result.push(...blocks(node.childNodes,depth+1));continue;}
      const type=tag==='P'?'p':['H1','H2'].includes(tag)?'h2':'h3';
      if(['H1','H4','H5','H6'].includes(tag))warn();
      result.push(...paragraphParts(inline(node.childNodes,depth+1),type));
    }
    flush();return result;
  }
  const document={version:1,blocks:blocks(parsed.body.childNodes)};
  // Match the server contract early; the server separately authorizes real media.
  renderDocument(document,{media:{get:()=>({width:1,height:1})},allowEmpty});
  return {document,warnings:[...warnings]};
}
